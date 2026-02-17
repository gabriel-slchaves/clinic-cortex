import { randomUUID } from "node:crypto";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  getContentType,
  type ConnectionState,
  type WAMessage,
  type WASocket,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import { HttpError } from "../errors.js";
import { N8nWebhookClient, N8nWebhookError } from "../n8n/N8nWebhookClient.js";
import { FileSystemSessionStore } from "../session/FileSystemSessionStore.js";
import {
  type WhatsAppConnectionRow,
  WhatsAppRepository,
} from "../supabase/WhatsAppRepository.js";

type RuntimeState = {
  socket?: WASocket;
  startingPromise?: Promise<void>;
  reconnectTimer?: NodeJS.Timeout;
  pairingBlockedUntil?: string | null;
  allowPairing?: boolean;
  startMode?: "manual" | "bootstrap" | "status_probe";
  version: number;
};

type StartConnectionOptions = {
  allowPairing: boolean;
  mode: "manual" | "bootstrap" | "status_probe";
};

const RECOVERY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000, 120_000, 300_000];
const MAX_RECOVERY_ATTEMPTS = RECOVERY_DELAYS_MS.length;
const N8N_RETRY_DELAYS_MS = [0, 1_000, 3_000];
const PAIRING_COOLDOWN_MS = 60 * 60 * 1_000;
const PAIRING_BLOCK_STATUS_CODES = new Set([405, 428]);
const MANUAL_ACTION_TERMINAL_CODES = new Set([
  "whatsapp_pairing_blocked",
  "whatsapp_pairing_cooldown_active",
  "whatsapp_logged_out",
  "whatsapp_session_missing",
  "whatsapp_recovery_exhausted",
  "whatsapp_recovery_requires_manual_pairing",
]);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Erro inesperado ao conectar o WhatsApp.";
}

function getDisconnectStatusCode(error: unknown) {
  return (error as Boom | undefined)?.output?.statusCode;
}

function extractPhoneNumber(jid: string | null | undefined) {
  if (!jid) return null;
  const withoutDevice = jid.split(":")[0] || "";
  const phoneNumber = withoutDevice.split("@")[0] || "";
  return phoneNumber || null;
}

function timestampToIso(value: unknown) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric * 1000).toISOString();
  }
  return new Date().toISOString();
}

function extractTextBody(message: WAMessage["message"]) {
  if (!message) return null;
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.buttonsResponseMessage?.selectedDisplayText) {
    return message.buttonsResponseMessage.selectedDisplayText;
  }
  if (message.listResponseMessage?.title) return message.listResponseMessage.title;
  if (message.templateButtonReplyMessage?.selectedDisplayText) {
    return message.templateButtonReplyMessage.selectedDisplayText;
  }
  return null;
}

function isAutomationEligibleJid(remoteJid: string) {
  return !remoteJid.endsWith("@g.us") && !remoteJid.endsWith("@broadcast");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRecoveryDelayMs(attempt: number) {
  return RECOVERY_DELAYS_MS[Math.min(Math.max(attempt, 1) - 1, RECOVERY_DELAYS_MS.length - 1)];
}

function toRetryTimestamp(delayMs: number) {
  return new Date(Date.now() + delayMs).toISOString();
}

function isFutureIso(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function formatCooldownLabel(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function recoveryNotificationKey(connectionId: string) {
  return `whatsapp:${connectionId}:recovery`;
}

function manualNotificationKey(connectionId: string) {
  return `whatsapp:${connectionId}:manual-action`;
}

function messageRiskNotificationKey(connectionId: string) {
  return `whatsapp:${connectionId}:message-risk`;
}

function cloneConnectionRow(
  connection: WhatsAppConnectionRow,
  overrides: Partial<WhatsAppConnectionRow>
) {
  return {
    ...connection,
    ...overrides,
  };
}

function isTerminalManualActionCode(value: string | null | undefined) {
  return MANUAL_ACTION_TERMINAL_CODES.has(String(value || ""));
}

function isFatalSessionCipherError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("unsupported state or unable to authenticate data") ||
    message.includes("unable to authenticate data") ||
    message.includes("unsupported state") ||
    message.includes("bad decrypt")
  );
}

export class WhatsAppConnectionManager {
  private readonly runtimes = new Map<string, RuntimeState>();
  private readonly baileysLogger = pino({ level: "silent" });
  private versionPromise?: Promise<[number, number, number]>;

  constructor(
    private readonly repository: WhatsAppRepository,
    private readonly sessionStore: FileSystemSessionStore,
    private readonly logger: pino.Logger,
    private readonly n8nWebhookClient: N8nWebhookClient | null = null
  ) {}

  async bootstrap() {
    await this.sessionStore.ensureRoot();
    const connections = await this.repository.listConnectionsForBootstrap();

    for (const connection of connections) {
      const hasSession = await this.sessionStore.sessionExists(connection.id);
      const shouldRecover = this.shouldAttemptBackgroundRecovery(connection, hasSession);
      if (!hasSession && connection.status !== "qr_pending") continue;
      if (!shouldRecover && connection.status !== "qr_pending") continue;
      if (!hasSession && isFutureIso(connection.next_retry_at)) continue;

      const options: StartConnectionOptions =
        shouldRecover && hasSession
          ? { allowPairing: false, mode: "bootstrap" }
          : { allowPairing: true, mode: "bootstrap" };

      void this.startConnectionInBackground(connection.id, options).catch((error) => {
        this.logger.error(
          {
            connectionId: connection.id,
            clinicId: connection.clinic_id,
            mode: options.mode,
            allowPairing: options.allowPairing,
            error: getErrorMessage(error),
          },
          "Failed to bootstrap WhatsApp connection"
        );
      });
    }
  }

  async createConnection(clinicId: string) {
    const existing = await this.repository.getConnectionByClinicId(clinicId);
    if (existing) return existing;

    const id = randomUUID();
    const sessionPath = this.sessionStore.getSessionPath(id);
    const created = await this.repository.createConnection({
      id,
      clinic_id: clinicId,
      session_path: sessionPath,
    });

    if (!created) {
      throw new HttpError(500, "Não foi possível inicializar a conexão WhatsApp.");
    }

    return created;
  }

  async startConnection(connectionId: string) {
    return this.startConnectionInternal(connectionId, {
      allowPairing: true,
      mode: "manual",
    });
  }

  async handleFatalProcessError(error: unknown) {
    if (!isFatalSessionCipherError(error)) {
      return false;
    }

    const candidates = [...this.runtimes.entries()]
      .filter(([, runtime]) => Boolean(runtime.socket || runtime.startingPromise))
      .sort((left, right) => {
        const leftScore = left[1].startMode === "manual" ? 1 : 0;
        const rightScore = right[1].startMode === "manual" ? 1 : 0;
        return rightScore - leftScore;
      });

    if (!candidates.length) {
      return false;
    }

    for (const [connectionId] of candidates) {
      await this.recoverFromFatalSessionError(connectionId, error);
    }

    return true;
  }

  async getConnectionStatusSnapshot(connectionId: string) {
    const connection = await this.repository.getConnectionById(connectionId);
    if (!connection) {
      return null;
    }

    const runtime = this.getRuntime(connectionId);
    if (runtime.startingPromise) {
      return this.buildRecoveringSnapshot(connection, {
        recoveryAttemptCount: Math.max(1, connection.recovery_attempt_count || 0),
        eventCode: "whatsapp_status_sync_in_progress",
        eventMessage: "Sincronizando o estado vivo da sessão do WhatsApp.",
      });
    }

    if (runtime.socket?.user?.id) {
      const connectedSnapshot = this.buildConnectedSnapshot(connection, runtime.socket);
      if (
        connection.status !== "connected" ||
        connection.phone_jid !== connectedSnapshot.phone_jid ||
        connection.phone_number !== connectedSnapshot.phone_number
      ) {
        this.logger.info(
          {
            connectionId,
            clinicId: connection.clinic_id,
            persistedStatus: connection.status,
          },
          "Reconciled WhatsApp connection status from runtime socket"
        );

        return (
          (await this.safeUpdateConnection(
            connectionId,
            {
              status: "connected",
              connected_at: connectedSnapshot.connected_at,
              last_seen_at: connectedSnapshot.last_seen_at,
              phone_jid: connectedSnapshot.phone_jid,
              phone_number: connectedSnapshot.phone_number,
              last_error: null,
              manual_action_required: false,
              is_recovering: false,
              recovery_attempt_count: 0,
              next_retry_at: null,
              last_event_code: "whatsapp_connected",
              last_event_message: "WhatsApp conectado com sucesso.",
            },
            { clinicId: connection.clinic_id, scope: "getConnectionStatusSnapshot.runtimeConnected" }
          )) || connectedSnapshot
        );
      }

      return connectedSnapshot;
    }

    const hasSession = await this.sessionStore.sessionExists(connectionId);
    if (this.shouldAttemptBackgroundRecovery(connection, hasSession)) {
      this.logger.info(
        {
          connectionId,
          clinicId: connection.clinic_id,
          persistedStatus: connection.status,
          lastEventCode: connection.last_event_code,
        },
        "Detected persisted stale WhatsApp status; starting safe background recovery"
      );

      void this.startConnectionInBackground(connectionId, {
        allowPairing: false,
        mode: "status_probe",
      }).catch((error) => {
        this.logger.error(
          {
            connectionId,
            clinicId: connection.clinic_id,
            mode: "status_probe",
            error: getErrorMessage(error),
          },
          "Failed to start safe background recovery from status probe"
        );
      });

      return this.buildRecoveringSnapshot(connection, {
        recoveryAttemptCount: Math.max(1, connection.recovery_attempt_count || 0),
        eventCode: "whatsapp_status_sync_started",
        eventMessage: "Verificando a sessão salva do WhatsApp em segundo plano.",
      });
    }

    return connection;
  }

  private getRuntime(connectionId: string) {
    const existing = this.runtimes.get(connectionId);
    if (existing) return existing;

    const runtime: RuntimeState = { version: 0 };
    this.runtimes.set(connectionId, runtime);
    return runtime;
  }

  private async recoverFromFatalSessionError(connectionId: string, error: unknown) {
    const runtime = this.getRuntime(connectionId);
    const startMode = runtime.startMode || "bootstrap";
    const connection = await this.repository.getConnectionById(connectionId);

    runtime.version += 1;
    this.stopReconnectTimer(connectionId);

    const socket = runtime.socket;
    runtime.socket = undefined;
    runtime.startingPromise = undefined;
    runtime.allowPairing = undefined;
    runtime.startMode = undefined;

    try {
      socket?.end(new Error("Fatal WhatsApp session crypto error detected."));
    } catch {
      // best-effort teardown only
    }

    if (!connection) {
      this.logger.error(
        { connectionId, mode: startMode, error: getErrorMessage(error) },
        "Recovered from fatal WhatsApp session error without persisted connection row"
      );
      return;
    }

    this.logger.error(
      {
        connectionId,
        clinicId: connection.clinic_id,
        mode: startMode,
        error: getErrorMessage(error),
      },
      "Recovered from fatal WhatsApp session crypto error"
    );

    if (startMode === "manual") {
      await this.sessionStore.clearSession(connectionId);
      await this.safeUpdateConnection(
        connectionId,
        {
          status: "idle",
          qr_code: null,
          qr_generated_at: null,
          connected_at: null,
          manual_action_required: false,
          is_recovering: false,
          recovery_attempt_count: 0,
          next_retry_at: null,
          last_error: null,
          last_event_code: "whatsapp_invalid_session_reset",
          last_event_message: "A sessão anterior foi invalidada. Gerando um novo QR Code.",
        },
        { clinicId: connection.clinic_id, scope: "recoverFromFatalSessionError.manual" }
      );

      void this.startConnectionInBackground(connectionId, {
        allowPairing: true,
        mode: "manual",
      }).catch((restartError) => {
        this.logger.error(
          {
            connectionId,
            clinicId: connection.clinic_id,
            mode: "manual",
            error: getErrorMessage(restartError),
          },
          "Failed to restart WhatsApp pairing after invalid session reset"
        );
      });
      return;
    }

    await this.moveToManualIntervention(
      connection,
      "A sessão salva do WhatsApp falhou na autenticação. Gere um novo QR Code para reconectar.",
      "whatsapp_session_invalid",
      "A sessão salva do WhatsApp ficou inválida e não pôde ser retomada automaticamente."
    );
  }

  private async startConnectionInternal(connectionId: string, options: StartConnectionOptions) {
    const connection = await this.repository.getConnectionById(connectionId);
    if (!connection) {
      throw new HttpError(404, "Conexão WhatsApp não encontrada.");
    }

    const runtime = this.getRuntime(connectionId);
    let hasSession = await this.sessionStore.sessionExists(connectionId);
    const cooldownUntil = this.getPairingCooldownUntil(connection, runtime);

    if (!hasSession && cooldownUntil) {
      const blockedMessage = `O WhatsApp bloqueou temporariamente novas conexões. Tente novamente após ${formatCooldownLabel(cooldownUntil)}.`;
      const blocked = await this.safeUpdateConnection(
        connectionId,
        {
          status: "error",
          qr_code: null,
          qr_generated_at: null,
          connected_at: null,
          manual_action_required: true,
          is_recovering: false,
          next_retry_at: cooldownUntil,
          last_error: blockedMessage,
          last_event_code: "whatsapp_pairing_cooldown_active",
          last_event_message: blockedMessage,
        },
        { clinicId: connection.clinic_id, scope: "startConnection.cooldown", mode: options.mode }
      );
      return blocked || connection;
    }

    if (
      options.mode === "manual" &&
      hasSession &&
      connection.manual_action_required &&
      !isFutureIso(connection.next_retry_at)
    ) {
      this.logger.warn(
        {
          connectionId,
          clinicId: connection.clinic_id,
          lastEventCode: connection.last_event_code,
        },
        "Clearing stale WhatsApp session before manual QR generation"
      );
      await this.sessionStore.clearSession(connectionId);
      hasSession = false;
    }

    if (runtime.socket?.user?.id) {
      const connectedSnapshot = this.buildConnectedSnapshot(connection, runtime.socket);
      return (
        (await this.safeUpdateConnection(
          connectionId,
          {
            status: "connected",
            connected_at: connectedSnapshot.connected_at,
            last_seen_at: connectedSnapshot.last_seen_at,
            phone_jid: connectedSnapshot.phone_jid,
            phone_number: connectedSnapshot.phone_number,
            last_error: null,
            manual_action_required: false,
            is_recovering: false,
            recovery_attempt_count: 0,
            next_retry_at: null,
            last_event_code: "whatsapp_connected",
            last_event_message: "WhatsApp conectado com sucesso.",
          },
          { clinicId: connection.clinic_id, scope: "startConnection.runtimeConnected", mode: options.mode }
        )) || connectedSnapshot
      );
    }

    if (runtime.startingPromise) {
      await runtime.startingPromise;
      return (await this.repository.getConnectionById(connectionId)) || connection;
    }

    if (
      runtime.socket &&
      (connection.status === "creating" ||
        connection.status === "qr_pending" ||
        connection.status === "connected")
    ) {
      return connection;
    }

    runtime.startingPromise = this.initializeSocket(connection, runtime, options).finally(() => {
      const current = this.runtimes.get(connectionId);
      if (current) current.startingPromise = undefined;
    });

    await runtime.startingPromise;
    return (await this.repository.getConnectionById(connectionId)) || connection;
  }

  private startConnectionInBackground(connectionId: string, options: StartConnectionOptions) {
    return this.startConnectionInternal(connectionId, options);
  }

  private stopReconnectTimer(connectionId: string) {
    const runtime = this.getRuntime(connectionId);
    if (!runtime.reconnectTimer) return;

    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = undefined;
  }

  private getPairingCooldownUntil(connection: WhatsAppConnectionRow, runtime?: RuntimeState) {
    const runtimeCooldown = runtime?.pairingBlockedUntil || null;
    if (isFutureIso(runtimeCooldown)) return runtimeCooldown;
    if (isFutureIso(connection.next_retry_at)) {
      const eventCode = String(connection.last_event_code || "");
      if (eventCode.startsWith("whatsapp_pairing_")) {
        return connection.next_retry_at;
      }
    }
    return null;
  }

  private shouldAttemptBackgroundRecovery(connection: WhatsAppConnectionRow, hasSession: boolean) {
    if (!hasSession) return false;
    if (connection.status === "qr_pending") return false;
    if (isFutureIso(connection.next_retry_at) && String(connection.last_event_code || "").startsWith("whatsapp_pairing_")) {
      return false;
    }
    if (connection.manual_action_required && isTerminalManualActionCode(connection.last_event_code)) {
      return false;
    }
    return true;
  }

  private buildRecoveringSnapshot(
    connection: WhatsAppConnectionRow,
    input?: {
      recoveryAttemptCount?: number;
      eventCode?: string;
      eventMessage?: string;
    }
  ) {
    return cloneConnectionRow(connection, {
      status: "creating",
      qr_code: null,
      qr_generated_at: null,
      is_recovering: true,
      manual_action_required: false,
      recovery_attempt_count: input?.recoveryAttemptCount ?? Math.max(1, connection.recovery_attempt_count || 0),
      next_retry_at: connection.next_retry_at || null,
      last_event_code: input?.eventCode || connection.last_event_code || "whatsapp_recovery_attempt_started",
      last_event_message:
        input?.eventMessage || connection.last_event_message || "Tentando recuperar a sessão salva do WhatsApp.",
    });
  }

  private buildConnectedSnapshot(connection: WhatsAppConnectionRow, socket: WASocket) {
    return cloneConnectionRow(connection, {
      status: "connected",
      qr_code: null,
      qr_generated_at: null,
      connected_at: connection.connected_at || new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      phone_jid: socket.user?.id || connection.phone_jid,
      phone_number: extractPhoneNumber(socket.user?.id) || connection.phone_number,
      last_error: null,
      manual_action_required: false,
      is_recovering: false,
      recovery_attempt_count: 0,
      next_retry_at: null,
      last_event_code: "whatsapp_connected",
      last_event_message: "WhatsApp conectado com sucesso.",
    });
  }

  private async safeUpdateConnection(
    connectionId: string,
    input: Parameters<WhatsAppRepository["updateConnection"]>[1],
    context: Record<string, unknown>
  ) {
    try {
      return await this.repository.updateConnection(connectionId, input);
    } catch (error) {
      this.logger.error(
        { ...context, connectionId, error: getErrorMessage(error) },
        "Failed to persist WhatsApp connection state"
      );
      return null;
    }
  }

  private async safeUpsertIncomingMessage(
    input: Parameters<WhatsAppRepository["upsertIncomingMessage"]>[0],
    context: Record<string, unknown>
  ) {
    try {
      await this.repository.upsertIncomingMessage(input);
      return true;
    } catch (error) {
      this.logger.error(
        {
          ...context,
          connectionId: input.connection_id,
          clinicId: input.clinic_id,
          waMessageId: input.wa_message_id,
          remoteJid: input.remote_jid,
          error: getErrorMessage(error),
        },
        "Failed to persist WhatsApp message"
      );
      return false;
    }
  }

  private async safeUpsertNotification(
    input: Parameters<WhatsAppRepository["upsertClinicNotification"]>[0],
    context: Record<string, unknown>
  ) {
    try {
      await this.repository.upsertClinicNotification(input);
    } catch (error) {
      this.logger.error(
        {
          ...context,
          clinicId: input.clinic_id,
          kind: input.kind,
          dedupeKey: input.dedupe_key,
          error: getErrorMessage(error),
        },
        "Failed to persist clinic notification"
      );
    }
  }

  private async safeResolveNotification(
    dedupeKey: string,
    input: Parameters<WhatsAppRepository["resolveClinicNotification"]>[1],
    context: Record<string, unknown>
  ) {
    try {
      await this.repository.resolveClinicNotification(dedupeKey, input);
    } catch (error) {
      this.logger.error(
        { ...context, dedupeKey, error: getErrorMessage(error) },
        "Failed to resolve clinic notification"
      );
    }
  }

  private async notifyRecoveryStarted(connection: WhatsAppConnectionRow, attempt: number, nextRetryAt: string) {
    await this.safeUpsertNotification(
      {
        clinic_id: connection.clinic_id,
        kind: "whatsapp_recovery",
        severity: "warning",
        dedupe_key: recoveryNotificationKey(connection.id),
        title: "WhatsApp reconectando automaticamente",
        message:
          attempt === 1
            ? "O sistema detectou uma queda e iniciou a recuperação automática da sessão do WhatsApp."
            : `A recuperação automática do WhatsApp continua em andamento (tentativa ${attempt} de ${MAX_RECOVERY_ATTEMPTS}).`,
        metadata: { connectionId: connection.id, attempt, nextRetryAt },
      },
      { scope: "notifyRecoveryStarted", connectionId: connection.id }
    );
  }

  private async resolveRecoveryNotification(connection: WhatsAppConnectionRow, title: string, message: string) {
    await this.safeResolveNotification(
      recoveryNotificationKey(connection.id),
      {
        severity: "info",
        title,
        message,
        metadata: { connectionId: connection.id, resolvedAt: new Date().toISOString() },
      },
      { scope: "resolveRecoveryNotification", connectionId: connection.id, clinicId: connection.clinic_id }
    );
  }

  private async notifyManualActionRequired(
    connection: WhatsAppConnectionRow,
    title: string,
    message: string,
    reason: string
  ) {
    await this.safeUpsertNotification(
      {
        clinic_id: connection.clinic_id,
        kind: "whatsapp_manual_action_required",
        severity: "critical",
        dedupe_key: manualNotificationKey(connection.id),
        title,
        message,
        metadata: { connectionId: connection.id, reason },
      },
      { scope: "notifyManualActionRequired", connectionId: connection.id }
    );
  }

  private async resolveManualActionNotification(connection: WhatsAppConnectionRow, title: string, message: string) {
    await this.safeResolveNotification(
      manualNotificationKey(connection.id),
      {
        severity: "info",
        title,
        message,
        metadata: { connectionId: connection.id, resolvedAt: new Date().toISOString() },
      },
      { scope: "resolveManualActionNotification", connectionId: connection.id, clinicId: connection.clinic_id }
    );
  }

  private async notifyMessageAutomationRisk(connection: WhatsAppConnectionRow, messageId: string, detail: string) {
    await this.safeUpsertNotification(
      {
        clinic_id: connection.clinic_id,
        kind: "whatsapp_message_risk",
        severity: "warning",
        dedupe_key: messageRiskNotificationKey(connection.id),
        title: "WhatsApp pode não estar respondendo",
        message:
          "Uma mensagem recente pode ter ficado sem resposta automática. Verifique a integração do WhatsApp em Configurações > Integrações.",
        metadata: { connectionId: connection.id, waMessageId: messageId, detail },
      },
      { scope: "notifyMessageAutomationRisk", connectionId: connection.id }
    );
  }

  private async resolveMessageAutomationRisk(connection: WhatsAppConnectionRow) {
    await this.safeResolveNotification(
      messageRiskNotificationKey(connection.id),
      {
        severity: "info",
        title: "WhatsApp voltou a responder automaticamente",
        message: "A última instabilidade conhecida do atendimento automático foi normalizada.",
        metadata: { connectionId: connection.id, resolvedAt: new Date().toISOString() },
      },
      { scope: "resolveMessageAutomationRisk", connectionId: connection.id, clinicId: connection.clinic_id }
    );
  }

  private scheduleReconnect(connection: WhatsAppConnectionRow, attempt: number) {
    const runtime = this.getRuntime(connection.id);
    this.stopReconnectTimer(connection.id);

    runtime.reconnectTimer = setTimeout(() => {
      runtime.reconnectTimer = undefined;

      void this.startConnection(connection.id).catch(async (error) => {
        this.logger.error(
          { connectionId: connection.id, error: getErrorMessage(error), attempt },
          "Failed to reconnect WhatsApp session"
        );
        await this.handleReconnectFailure(connection.id, error, attempt);
      });
    }, getRecoveryDelayMs(attempt));
  }

  private async handleReconnectFailure(connectionId: string, error: unknown, previousAttempt: number) {
    const connection = await this.repository.getConnectionById(connectionId);
    if (!connection) return;

    const hasSession = await this.sessionStore.sessionExists(connectionId);
    const nextAttempt = Math.max(connection.recovery_attempt_count || previousAttempt, previousAttempt) + 1;

    if (!hasSession || nextAttempt > MAX_RECOVERY_ATTEMPTS) {
      await this.moveToManualIntervention(
        connection,
        !hasSession
          ? "A sessão local do WhatsApp não está mais disponível. Gere um novo QR Code para reconectar."
          : "A conexão automática foi tentada várias vezes sem sucesso. Gere um novo QR Code para restabelecer o WhatsApp.",
        !hasSession ? "whatsapp_session_missing" : "whatsapp_recovery_exhausted",
        !hasSession ? "Sessão ausente para recuperação automática." : "Recuperação automática esgotada."
      );
      return;
    }

    const nextRetryAt = toRetryTimestamp(getRecoveryDelayMs(nextAttempt));
    const updated = await this.safeUpdateConnection(
      connection.id,
      {
        status: "creating",
        is_recovering: true,
        manual_action_required: false,
        recovery_attempt_count: nextAttempt,
        next_retry_at: nextRetryAt,
        last_error: getErrorMessage(error),
        last_event_code: "whatsapp_recovery_retry_scheduled",
        last_event_message: `Nova tentativa automática agendada (${nextAttempt}/${MAX_RECOVERY_ATTEMPTS}).`,
      },
      { clinicId: connection.clinic_id, scope: "handleReconnectFailure" }
    );

    const latestConnection = updated || connection;
    await this.notifyRecoveryStarted(latestConnection, nextAttempt, nextRetryAt);
    this.scheduleReconnect(latestConnection, nextAttempt);
  }

  private async moveToPairingCooldown(
    connection: WhatsAppConnectionRow,
    lastError: string,
    eventCode: string,
    eventMessage: string,
    cooldownUntil: string
  ) {
    this.stopReconnectTimer(connection.id);
    const runtime = this.getRuntime(connection.id);
    runtime.pairingBlockedUntil = cooldownUntil;
    runtime.allowPairing = undefined;
    runtime.startMode = undefined;

    await this.sessionStore.clearSession(connection.id);
    await this.safeUpdateConnection(
      connection.id,
      {
        status: "error",
        qr_code: null,
        qr_generated_at: null,
        connected_at: null,
        is_recovering: false,
        manual_action_required: true,
        recovery_attempt_count: 0,
        next_retry_at: cooldownUntil,
        last_error: lastError,
        last_seen_at: new Date().toISOString(),
        last_event_code: eventCode,
        last_event_message: eventMessage,
      },
      { clinicId: connection.clinic_id, scope: "moveToPairingCooldown" }
    );

    await this.resolveRecoveryNotification(
      connection,
      "Pareamento em pausa",
      "O sistema interrompeu novas tentativas de pareamento para evitar bloqueios adicionais no WhatsApp."
    );
    await this.notifyManualActionRequired(
      connection,
      "WhatsApp em cooldown temporário",
      "O WhatsApp bloqueou temporariamente novas conexões. Aguarde o período informado antes de gerar um novo QR Code.",
      eventCode
    );
  }

  private async moveToManualIntervention(
    connection: WhatsAppConnectionRow,
    lastError: string,
    eventCode: string,
    eventMessage: string,
    options?: { clearSession?: boolean }
  ) {
    this.stopReconnectTimer(connection.id);
    const runtime = this.getRuntime(connection.id);
    runtime.pairingBlockedUntil = null;
    runtime.allowPairing = undefined;
    runtime.startMode = undefined;
    if (options?.clearSession ?? true) {
      await this.sessionStore.clearSession(connection.id);
    }
    await this.safeUpdateConnection(
      connection.id,
      {
        status: "idle",
        qr_code: null,
        qr_generated_at: null,
        connected_at: null,
        is_recovering: false,
        manual_action_required: true,
        recovery_attempt_count: 0,
        next_retry_at: null,
        last_error: lastError,
        last_seen_at: new Date().toISOString(),
        last_event_code: eventCode,
        last_event_message: eventMessage,
      },
      { clinicId: connection.clinic_id, scope: "moveToManualIntervention" }
    );

    await this.resolveRecoveryNotification(
      connection,
      "Recuperação automática interrompida",
      "O sistema não conseguiu recuperar a sessão do WhatsApp sozinho."
    );
    await this.notifyManualActionRequired(
      connection,
      "WhatsApp da clínica exige nova conexão",
      "A reconexão automática não foi concluída. Um administrador deve abrir Configurações > Integrações e gerar um novo QR Code.",
      eventCode
    );
  }

  private async getSocketVersion() {
    if (!this.versionPromise) {
      this.versionPromise = fetchLatestWaWebVersion().then((result) => {
        if (!result.isLatest && result.error) {
          this.logger.warn(
            { error: getErrorMessage(result.error) },
            "Falling back to bundled Baileys version"
          );
        }

        return result.version as [number, number, number];
      });
    }

    return this.versionPromise;
  }

  private async initializeSocket(
    connection: WhatsAppConnectionRow,
    runtime: RuntimeState,
    options: StartConnectionOptions
  ) {
    const connectionId = connection.id;
    const clinicId = connection.clinic_id;
    const automaticRecoveryAttempt =
      (!options.allowPairing ||
        (!connection.manual_action_required &&
          (connection.status === "error" || connection.is_recovering || connection.recovery_attempt_count > 0)))
        ? Math.max(1, connection.recovery_attempt_count || 1)
        : 0;

    runtime.version += 1;
    const runtimeVersion = runtime.version;
    runtime.pairingBlockedUntil = this.getPairingCooldownUntil(connection, runtime);
    runtime.allowPairing = options.allowPairing;
    runtime.startMode = options.mode;

    this.stopReconnectTimer(connectionId);

    await this.sessionStore.ensureRoot();
    const sessionPath = await this.sessionStore.ensureSessionPath(connectionId);

    const updated = await this.safeUpdateConnection(
      connectionId,
      {
        status: "creating",
        qr_code: null,
        qr_generated_at: null,
        last_error: null,
        is_recovering: automaticRecoveryAttempt > 0,
        manual_action_required: options.allowPairing ? connection.manual_action_required : false,
        recovery_attempt_count: automaticRecoveryAttempt,
        next_retry_at: null,
        last_event_code:
          automaticRecoveryAttempt > 0
            ? options.mode === "status_probe"
              ? "whatsapp_status_recovery_attempt_started"
              : "whatsapp_recovery_attempt_started"
            : "whatsapp_connection_starting",
        last_event_message:
          automaticRecoveryAttempt > 0
            ? options.mode === "status_probe"
              ? "Verificando a sessão salva do WhatsApp em segundo plano."
              : `Iniciando tentativa automática ${automaticRecoveryAttempt} de recuperação da sessão.`
            : "Iniciando conexão do WhatsApp.",
      },
      { clinicId, scope: "initializeSocket", mode: options.mode, allowPairing: options.allowPairing }
    );

    if (automaticRecoveryAttempt > 0) {
      await this.notifyRecoveryStarted(updated || connection, automaticRecoveryAttempt, new Date().toISOString());
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const version = await this.getSocketVersion();
    const socket = makeWASocket({
      auth: state,
      browser: Browsers.macOS("Chrome"),
      version,
      printQRInTerminal: false,
      logger: this.baileysLogger,
    });

    runtime.socket = socket;

    const isCurrentRuntime = () => {
      const current = this.runtimes.get(connectionId);
      return current?.version === runtimeVersion;
    };

    socket.ev.on("creds.update", () => {
      if (!isCurrentRuntime()) return;
      void saveCreds();
    });

    socket.ev.on("connection.update", (update) => {
      void this.handleConnectionUpdate({
        clinicId,
        connectionId,
        socket,
        update,
        isCurrentRuntime,
        initialConnection: updated || connection,
      }).catch((error) => {
        this.logger.error(
          { clinicId, connectionId, error: getErrorMessage(error) },
          "Unhandled error while processing WhatsApp connection update"
        );
      });
    });

    socket.ev.on("messages.upsert", ({ messages }) => {
      void this.handleMessages({
        clinicId,
        connectionId,
        socket,
        messages,
        isCurrentRuntime,
      }).catch((error) => {
        this.logger.error(
          { clinicId, connectionId, error: getErrorMessage(error) },
          "Unhandled error while processing incoming WhatsApp messages"
        );
      });
    });
  }

  private async handleConnectionUpdate({
    clinicId,
    connectionId,
    socket,
    update,
    isCurrentRuntime,
    initialConnection,
  }: {
    clinicId: string;
    connectionId: string;
    socket: WASocket;
    update: Partial<ConnectionState>;
    isCurrentRuntime: () => boolean;
    initialConnection: WhatsAppConnectionRow;
  }) {
    if (!isCurrentRuntime()) return;

    const runtime = this.getRuntime(connectionId);

    if (update.connection === "connecting") {
      await this.safeUpdateConnection(
        connectionId,
        {
          status: "creating",
          last_error: null,
          last_event_code: initialConnection.is_recovering
            ? "whatsapp_recovery_connecting"
            : "whatsapp_connection_connecting",
          last_event_message: initialConnection.is_recovering
            ? "Tentando recuperar a sessão do WhatsApp."
            : "Conectando o WhatsApp.",
        },
        { clinicId, scope: "handleConnectionUpdate.connecting" }
      );
    }

    if (update.qr) {
      if (runtime.allowPairing === false) {
        this.logger.warn(
          {
            clinicId,
            connectionId,
            mode: runtime.startMode || "status_probe",
          },
          "Safe background recovery discovered that the WhatsApp session now requires manual pairing"
        );

        runtime.version += 1;
        runtime.socket = undefined;
        runtime.allowPairing = undefined;
        runtime.startMode = undefined;
        socket.end(new Error("Background recovery stopped because manual QR pairing is now required."));
        await this.moveToManualIntervention(
          initialConnection,
          "A sessão salva do WhatsApp não pôde ser retomada automaticamente. Um administrador precisa gerar um novo QR Code.",
          "whatsapp_recovery_requires_manual_pairing",
          "A sessão salva exige um novo pareamento manual para voltar a funcionar.",
          { clearSession: false }
        );
        return;
      }

      runtime.pairingBlockedUntil = null;
      const qrCode = await QRCode.toDataURL(update.qr, {
        margin: 1,
        width: 320,
      });

      await this.safeUpdateConnection(
        connectionId,
        {
          status: "qr_pending",
          qr_code: qrCode,
          qr_generated_at: new Date().toISOString(),
          connected_at: null,
          last_error: null,
          manual_action_required: false,
          is_recovering: false,
          recovery_attempt_count: 0,
          next_retry_at: null,
          last_event_code: "whatsapp_qr_ready",
          last_event_message: "QR Code disponível para leitura no WhatsApp da clínica.",
        },
        { clinicId, scope: "handleConnectionUpdate.qr" }
      );
    }

    if (update.connection === "open") {
      runtime.pairingBlockedUntil = null;
      runtime.allowPairing = undefined;
      runtime.startMode = undefined;
      this.stopReconnectTimer(connectionId);
      const opened = await this.safeUpdateConnection(
        connectionId,
        {
          status: "connected",
          qr_code: null,
          qr_generated_at: null,
          connected_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          phone_jid: socket.user?.id || null,
          phone_number: extractPhoneNumber(socket.user?.id),
          last_error: null,
          manual_action_required: false,
          is_recovering: false,
          recovery_attempt_count: 0,
          next_retry_at: null,
          last_event_code: "whatsapp_connected",
          last_event_message: "WhatsApp conectado com sucesso.",
        },
        { clinicId, scope: "handleConnectionUpdate.open" }
      );

      const latestConnection = opened || initialConnection;
      await this.resolveRecoveryNotification(
        latestConnection,
        "WhatsApp recuperado automaticamente",
        "A sessão do WhatsApp voltou a funcionar normalmente."
      );
      await this.resolveManualActionNotification(
        latestConnection,
        "WhatsApp reconectado",
        "A integração do WhatsApp voltou a operar normalmente."
      );
      return;
    }

    if (update.connection !== "close") return;

    runtime.socket = undefined;
    runtime.allowPairing = undefined;
    runtime.startMode = undefined;

    const statusCode = getDisconnectStatusCode(update.lastDisconnect?.error);
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    const connectionFailure = PAIRING_BLOCK_STATUS_CODES.has(Number(statusCode));

    if (loggedOut) {
      await this.moveToManualIntervention(
        initialConnection,
        "Sessão encerrada no WhatsApp. Gere um novo QR Code para reconectar.",
        "whatsapp_logged_out",
        "A sessão do WhatsApp foi encerrada e exige novo QR Code."
      );
      return;
    }

    if (connectionFailure) {
      this.logger.error(
        {
          clinicId,
          connectionId,
          statusCode,
          error: getErrorMessage(update.lastDisconnect?.error),
          data: (update.lastDisconnect?.error as Boom | undefined)?.data,
        },
        "WhatsApp rejected the QR connection before it could be established"
      );

      const cooldownUntil = toRetryTimestamp(PAIRING_COOLDOWN_MS);
      await this.moveToPairingCooldown(
        initialConnection,
        `WhatsApp bloqueou temporariamente novos dispositivos. Aguarde até ${formatCooldownLabel(cooldownUntil)} para tentar novamente.`,
        "whatsapp_pairing_blocked",
        `O WhatsApp recusou novas conexões. Novo pareamento bloqueado até ${formatCooldownLabel(cooldownUntil)}.`,
        cooldownUntil
      );
      return;
    }

    const latestConnection = (await this.repository.getConnectionById(connectionId)) || initialConnection;
    const hasSession = await this.sessionStore.sessionExists(connectionId);
    const nextAttempt = (latestConnection.recovery_attempt_count || 0) + 1;

    if (!hasSession || nextAttempt > MAX_RECOVERY_ATTEMPTS) {
      await this.moveToManualIntervention(
        latestConnection,
        !hasSession
          ? "A sessão local do WhatsApp não está mais disponível. Gere um novo QR Code para reconectar."
          : "A conexão automática foi tentada várias vezes sem sucesso. Gere um novo QR Code para restabelecer o WhatsApp.",
        !hasSession ? "whatsapp_session_missing" : "whatsapp_recovery_exhausted",
        !hasSession ? "Sessão ausente para recuperação automática." : "Recuperação automática esgotada."
      );
      return;
    }

    const nextRetryAt = toRetryTimestamp(getRecoveryDelayMs(nextAttempt));
    const updated = await this.safeUpdateConnection(
      connectionId,
      {
        status: "creating",
        connected_at: null,
        last_error: getErrorMessage(update.lastDisconnect?.error),
        last_seen_at: new Date().toISOString(),
        is_recovering: true,
        manual_action_required: false,
        recovery_attempt_count: nextAttempt,
        next_retry_at: nextRetryAt,
        last_event_code: "whatsapp_recovery_retry_scheduled",
        last_event_message: `Reconexão automática agendada (${nextAttempt}/${MAX_RECOVERY_ATTEMPTS}).`,
      },
      { clinicId, scope: "handleConnectionUpdate.close" }
    );

    const connectionForRetry = updated || latestConnection;
    this.logger.warn(
      { clinicId, connectionId, statusCode, attempt: nextAttempt, nextRetryAt },
      "WhatsApp socket closed, scheduling reconnect"
    );
    await this.notifyRecoveryStarted(connectionForRetry, nextAttempt, nextRetryAt);
    this.scheduleReconnect(connectionForRetry, nextAttempt);
  }

  private async handleMessages({
    clinicId,
    connectionId,
    socket,
    messages,
    isCurrentRuntime,
  }: {
    clinicId: string;
    connectionId: string;
    socket: WASocket;
    messages: WAMessage[];
    isCurrentRuntime: () => boolean;
  }) {
    if (!isCurrentRuntime()) return;

    for (const message of messages) {
      if (!isCurrentRuntime()) return;

      const remoteJid = message.key.remoteJid || "";
      const messageId = message.key.id || "";

      if (!remoteJid || !messageId || remoteJid === "status@broadcast") {
        continue;
      }

      const alreadyStored = await this.repository.messageExists(connectionId, messageId);
      if (alreadyStored) {
        continue;
      }

      const messageType = getContentType(message.message ?? undefined) || null;
      const textBody = extractTextBody(message.message);
      const fromMe = Boolean(message.key.fromMe);
      const receivedAt = timestampToIso(message.messageTimestamp);

      await this.safeUpsertIncomingMessage(
        {
          clinic_id: clinicId,
          connection_id: connectionId,
          wa_message_id: messageId,
          remote_jid: remoteJid,
          from_me: fromMe,
          message_type: messageType,
          text_body: textBody,
          raw_json: message,
          received_at: receivedAt,
        },
        { scope: "handleMessages.incoming" }
      );

      if (!fromMe) {
        await this.maybeRespondToIncomingMessage({
          clinicId,
          connectionId,
          socket,
          remoteJid,
          messageId,
          messageType,
          textBody,
          pushName: message.pushName || null,
          receivedAt,
        });
      }
    }

    await this.safeUpdateConnection(
      connectionId,
      {
        last_seen_at: new Date().toISOString(),
      },
      { clinicId, scope: "handleMessages.lastSeen" }
    );
  }

  private async requestAutomationReply(args: {
    clinicId: string;
    connectionId: string;
    remoteJid: string;
    messageId: string;
    messageText: string;
    messageType: string | null;
    pushName: string | null;
    receivedAt: string;
  }) {
    let lastError: unknown = null;

    for (let index = 0; index < N8N_RETRY_DELAYS_MS.length; index += 1) {
      const delayMs = N8N_RETRY_DELAYS_MS[index];
      if (delayMs > 0) {
        await wait(delayMs);
      }

      try {
        return await this.n8nWebhookClient!.requestReply({
          clinicId: args.clinicId,
          connectionId: args.connectionId,
          remoteJid: args.remoteJid,
          waMessageId: args.messageId,
          messageText: args.messageText,
          messageType: args.messageType,
          pushName: args.pushName,
          receivedAt: args.receivedAt,
        });
      } catch (error) {
        lastError = error;
        const retryable = error instanceof N8nWebhookError ? error.retryable : false;
        const isLastAttempt = index === N8N_RETRY_DELAYS_MS.length - 1;
        if (!retryable || isLastAttempt) break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Falha ao obter resposta automática.");
  }

  private async maybeRespondToIncomingMessage({
    clinicId,
    connectionId,
    socket,
    remoteJid,
    messageId,
    messageType,
    textBody,
    pushName,
    receivedAt,
  }: {
    clinicId: string;
    connectionId: string;
    socket: WASocket;
    remoteJid: string;
    messageId: string;
    messageType: string | null;
    textBody: string | null;
    pushName: string | null;
    receivedAt: string;
  }) {
    const messageText = textBody?.trim();
    if (!messageText || !this.n8nWebhookClient || !isAutomationEligibleJid(remoteJid)) {
      return;
    }

    const connection = await this.repository.getConnectionById(connectionId);
    if (!connection) return;

    let webhookResponse: Awaited<ReturnType<N8nWebhookClient["requestReply"]>>;

    try {
      webhookResponse = await this.requestAutomationReply({
        clinicId,
        connectionId,
        remoteJid,
        messageId,
        messageText,
        messageType,
        pushName,
        receivedAt,
      });
    } catch (error) {
      this.logger.error(
        {
          clinicId,
          connectionId,
          remoteJid,
          messageId,
          error: getErrorMessage(error),
        },
        "Failed to invoke n8n webhook for incoming WhatsApp message"
      );
      await this.notifyMessageAutomationRisk(connection, messageId, getErrorMessage(error));
      return;
    }

    const replyText =
      typeof webhookResponse?.replyText === "string" ? webhookResponse.replyText.trim() : "";

    if (!replyText) {
      await this.notifyMessageAutomationRisk(connection, messageId, "Webhook n8n respondeu sem replyText.");
      return;
    }

    try {
      const sentMessage = await socket.sendMessage(remoteJid, { text: replyText });
      if (!sentMessage) {
        throw new Error("Baileys não retornou metadados da mensagem enviada.");
      }

      const sentMessageId = sentMessage.key.id || `out-${messageId}`;

      await this.safeUpsertIncomingMessage(
        {
          clinic_id: clinicId,
          connection_id: connectionId,
          wa_message_id: sentMessageId,
          remote_jid: sentMessage.key.remoteJid || remoteJid,
          from_me: true,
          message_type: getContentType(sentMessage.message ?? undefined) || "conversation",
          text_body: replyText,
          raw_json: sentMessage,
          received_at: timestampToIso(sentMessage.messageTimestamp),
        },
        { scope: "maybeRespondToIncomingMessage.outgoing" }
      );

      await this.resolveMessageAutomationRisk(connection);
    } catch (error) {
      this.logger.error(
        {
          clinicId,
          connectionId,
          remoteJid,
          messageId,
          error: getErrorMessage(error),
        },
        "Failed to send automated WhatsApp reply"
      );
      await this.notifyMessageAutomationRisk(connection, messageId, getErrorMessage(error));
    }
  }
}
