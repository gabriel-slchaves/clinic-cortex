import { randomUUID } from "node:crypto";
import type pino from "pino";
import { config } from "../../config.js";
import { HttpError } from "../../errors.js";
import {
  type VerificationStatus,
  MetaGraphClient,
} from "../../integrations/meta/MetaGraphClient.js";
import { MetaWebhookVerifier } from "../../integrations/meta/MetaWebhookVerifier.js";
import { MetaCrypto } from "../../integrations/meta/MetaCrypto.js";
import { resolveClinicAccess } from "../auth/clinicAccess.js";
import { sendOfficialWhatsAppMessage, processQueuedConversationJobs } from "./agent.js";
import {
  asJsonObject,
  cleanString,
  ensureString,
  extractTextBody,
  hashJson,
  isPlainObject,
  mergeConnectionMetadata,
  normalizeTextContent,
  normalizeTimestamp,
  serializeConnection,
  type ConnectionRow,
  type JsonValue,
  type WebhookEventRow,
  type WhatsAppMessageRow,
} from "./shared.js";
import { WhatsAppRepository } from "../../repositories/supabase/WhatsAppRepository.js";
import { TeamRepository } from "../../repositories/supabase/TeamRepository.js";

type TeamServiceLogger = pino.Logger;

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: Record<string, unknown>;
    }>;
  }>;
};

function normalizeGraphVersion(value: string | undefined) {
  return cleanString(value) || "v23.0";
}

function buildMetaLaunchUrl(args: {
  appId: string;
  configId: string;
  redirectUri: string;
  state: string;
  graphVersion: string;
  scopeText: string;
  extras: Record<string, unknown>;
}) {
  const launchParams = [
    ["client_id", args.appId],
    ["redirect_uri", args.redirectUri],
    ["state", args.state],
    ["config_id", args.configId],
    ["response_type", "code"],
    ["override_default_response_type", "true"],
    ["scope", args.scopeText],
    ["extras", JSON.stringify(args.extras)],
  ];

  return `https://www.facebook.com/${args.graphVersion}/dialog/oauth?${launchParams
    .map(
      ([key, value]) =>
        `${encodeURIComponent(String(key))}=${encodeURIComponent(String(value))}`
    )
    .join("&")}`;
}

function extractSignatureHeader(headers: Record<string, string | string[] | undefined>) {
  const primary = headers["x-hub-signature-256"];
  const fallback = headers["x-hub-signature"];
  const value = Array.isArray(primary) ? primary[0] : primary || (Array.isArray(fallback) ? fallback[0] : fallback);
  return cleanString(value);
}

function normalizeWebhookMetadata(value: unknown) {
  const metadata = isPlainObject(value) ? value : {};
  return {
    phone_number_id: cleanString(metadata.phone_number_id) || null,
    display_phone_number: cleanString(metadata.display_phone_number) || null,
  };
}

function normalizeConversationCategory(value: unknown) {
  const category = String(value || "")
    .trim()
    .toLowerCase();
  if (
    category === "marketing" ||
    category === "utility" ||
    category === "authentication" ||
    category === "service"
  ) {
    return category;
  }
  return null;
}

function mapMessageStatus(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "accepted" ||
    normalized === "sent" ||
    normalized === "delivered" ||
    normalized === "read" ||
    normalized === "failed"
  ) {
    return normalized;
  }
  return null;
}

function isAutomationEligibleMessage(message: Record<string, unknown>) {
  const type = cleanString(message.type).toLowerCase();
  return type === "text" || type === "button" || type === "interactive";
}

export class WhatsAppService {
  private readonly graphClient: MetaGraphClient;
  private readonly webhookVerifier: MetaWebhookVerifier;
  private readonly crypto: MetaCrypto | null;

  constructor(
    private readonly repository: WhatsAppRepository,
    private readonly teamRepository: TeamRepository,
    private readonly logger: TeamServiceLogger
  ) {
    this.graphClient = new MetaGraphClient(
      config.metaGraphVersion,
      config.metaAppId,
      config.metaAppSecret
    );
    this.webhookVerifier = new MetaWebhookVerifier(config.metaWebhookAppSecret);
    this.crypto = config.whatsappTokenEncryptionKey
      ? new MetaCrypto(config.whatsappTokenEncryptionKey)
      : null;
  }

  private queueBackgroundTask(promise: Promise<unknown>) {
    void promise.catch(error => {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "WhatsApp background task failed"
      );
    });
  }

  private ensureMetaOnboardingConfigured() {
    if (
      !config.metaAppId ||
      !config.metaEmbeddedSignupConfigId ||
      !config.metaEmbeddedSignupRedirectUri
    ) {
      throw new HttpError(
        503,
        "A ClinicCortex ainda não recebeu a configuração da Meta necessária para iniciar o onboarding oficial."
      );
    }
  }

  private ensureCrypto() {
    if (!this.crypto) {
      throw new HttpError(
        503,
        "A chave de criptografia das credenciais oficiais do WhatsApp não está configurada."
      );
    }

    return this.crypto;
  }

  private ensureDrainToken(authorizationHeader?: string | null) {
    const authorization = cleanString(authorizationHeader);
    const drainSecret = cleanString(config.whatsappDrainToken);
    if (!drainSecret || authorization !== `Bearer ${drainSecret}`) {
      throw new HttpError(401, "Drain do WhatsApp não autorizado.");
    }
  }

  private async buildWebhookEventRows(payload: Record<string, unknown>) {
    const objectName = cleanString(payload.object) || "whatsapp_business_account";
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const rows: Array<Record<string, JsonValue>> = [];

    if (!entries.length) {
      rows.push({
        connection_id: null,
        clinic_id: null,
        provider: "meta_cloud_api",
        provider_object: objectName,
        provider_event_hash: hashJson(payload),
        event_kind: "payload",
        payload: payload as JsonValue,
      });
      return rows;
    }

    for (const entry of entries) {
      const entryData = isPlainObject(entry) ? entry : {};
      const entryId = cleanString(entryData.id) || null;
      const changes = Array.isArray(entryData.changes) ? entryData.changes : [];

      for (const change of changes) {
        const changeData = isPlainObject(change) ? change : {};
        const changeField = cleanString(changeData.field) || "unknown";
        const value = isPlainObject(changeData.value) ? changeData.value : {};
        const metadata = normalizeWebhookMetadata(value.metadata);
        const contacts = Array.isArray(value.contacts)
          ? value.contacts.filter(item => isPlainObject(item))
          : [];
        const messages = Array.isArray(value.messages)
          ? value.messages.filter(item => isPlainObject(item))
          : [];
        const statuses = Array.isArray(value.statuses)
          ? value.statuses.filter(item => isPlainObject(item))
          : [];

        const appendRow = async (
          eventKind: string,
          item: Record<string, unknown> | null
        ) => {
          const connection = await this.repository.findConnectionByMetaIdentifiers({
            phoneNumberId: metadata.phone_number_id,
            wabaId: entryId,
          });
          const normalizedPayload = {
            object: objectName,
            entryId,
            changeField,
            metadata,
            contacts,
            item,
            value,
          };

          rows.push({
            connection_id: connection?.id || null,
            clinic_id: connection?.clinic_id || null,
            provider: "meta_cloud_api",
            provider_object: objectName,
            provider_event_hash: hashJson({
              eventKind,
              normalizedPayload,
            }),
            event_kind: eventKind,
            payload: normalizedPayload as JsonValue,
          });
        };

        for (const message of messages) {
          await appendRow("message_received", message);
        }

        for (const status of statuses) {
          await appendRow("message_status", status);
        }

        if (!messages.length && !statuses.length) {
          await appendRow(`change:${changeField}`, null);
        }
      }
    }

    return rows;
  }

  private async enqueueConversationJobIfEligible(
    connection: ConnectionRow,
    message: WhatsAppMessageRow,
    occurredAt: string
  ) {
    if (message.from_me) return;
    if (!message.contact_wa_id) return;
    if (!isAutomationEligibleMessage({ type: message.message_type || "" })) return;
    if (!normalizeTextContent(message.text_body)) return;
    if (connection.operational_status !== "active") return;
    if (!config.whatsappEnableAgent) return;

    const assistantPrompt = await this.repository.getClinicAssistantPrompt(
      message.clinic_id
    );
    if (!assistantPrompt) return;

    await this.repository.enqueueConversationJob({
      clinic_id: message.clinic_id,
      connection_id: message.connection_id,
      source_message_id: message.id,
      contact_wa_id: message.contact_wa_id,
      occurredAt,
    });
  }

  private async processMessageEvent(event: WebhookEventRow, occurredAt: string) {
    if (!event.connection_id || !event.clinic_id) {
      throw new HttpError(
        409,
        "Evento de mensagem recebido antes da conexão estar associada ao phone_number_id."
      );
    }

    const payload = asJsonObject(event.payload);
    const item = asJsonObject(payload.item);
    const metadata = asJsonObject(payload.metadata);
    const providerMessageId = cleanString(item.id) || null;
    const from = cleanString(item.from) || null;
    const messageType = cleanString(item.type) || null;
    const normalizedTextBody = normalizeTextContent(extractTextBody(item));

    if (!providerMessageId || !from) {
      return;
    }

    const message = await this.repository.upsertMessage({
      clinic_id: event.clinic_id,
      connection_id: event.connection_id,
      provider: "meta_cloud_api",
      provider_message_id: providerMessageId,
      contact_wa_id: from,
      from_me: false,
      message_type: messageType,
      text_body: normalizedTextBody,
      provider_message_status: null,
      provider_timestamp: normalizeTimestamp(item.timestamp),
      conversation_category: null,
      pricing_payload: null,
      error_code: null,
      error_message: null,
      raw_json: {
        item,
        metadata,
      } as JsonValue,
      received_at: occurredAt,
      created_at: occurredAt,
      updated_at: occurredAt,
      reply_to_message_id: null,
      origin_job_id: null,
      agent_run_id: null,
      send_state: null,
    });

    await this.repository.touchConnectionWebhook(event.connection_id, occurredAt);

    const connection = await this.repository.getConnectionById(event.connection_id);
    if (message && connection) {
      await this.enqueueConversationJobIfEligible(connection, message, occurredAt);
    }
  }

  private async processStatusEvent(event: WebhookEventRow, occurredAt: string) {
    if (!event.connection_id || !event.clinic_id) {
      throw new HttpError(
        409,
        "Evento de status recebido antes da conexão estar associada ao phone_number_id."
      );
    }

    const payload = asJsonObject(event.payload);
    const item = asJsonObject(payload.item);
    const statusErrors = Array.isArray(item.errors)
      ? item.errors.filter(entry => isPlainObject(entry))
      : [];
    const firstError = statusErrors[0] || {};
    const pricing = isPlainObject(item.pricing) ? item.pricing : null;
    const conversation = isPlainObject(item.conversation)
      ? item.conversation
      : null;
    const providerMessageId = ensureString(item.id, "provider_message_id do status", 409);
    const status = ensureString(item.status, "status", 409);
    const normalizedStatus = mapMessageStatus(status);
    if (!normalizedStatus) {
      return;
    }

    const conversationCategory =
      normalizeConversationCategory(pricing?.category) ||
      normalizeConversationCategory(asJsonObject(conversation?.origin).type);
    const errorCode = cleanString(firstError.code) || null;
    const errorMessage =
      cleanString(firstError.title) || cleanString(firstError.message) || null;
    const existingMessage = await this.repository.getMessageByProviderMessageId(
      event.connection_id,
      providerMessageId
    );
    const nextSendState =
      normalizedStatus === "failed"
        ? existingMessage?.send_state || "sent"
        : existingMessage?.send_state === "provider_ack_unknown" ||
            existingMessage?.send_state === "dispatching"
          ? "sent"
          : existingMessage?.send_state || "sent";

    await this.repository.insertMessageStatusEvent({
      clinic_id: event.clinic_id,
      connection_id: event.connection_id,
      provider: "meta_cloud_api",
      provider_message_id: providerMessageId,
      status: normalizedStatus,
      conversation_category: conversationCategory,
      pricing_payload: pricing as JsonValue | null,
      error_code: errorCode,
      error_message: errorMessage,
      raw_json: payload as JsonValue,
      occurred_at: normalizeTimestamp(item.timestamp) || occurredAt,
    });

    await this.repository.upsertMessage({
      clinic_id: event.clinic_id,
      connection_id: event.connection_id,
      provider: "meta_cloud_api",
      provider_message_id: providerMessageId,
      contact_wa_id: cleanString(item.recipient_id) || null,
      from_me: true,
      message_type: existingMessage?.message_type || null,
      text_body: existingMessage?.text_body || null,
      provider_message_status: normalizedStatus,
      provider_timestamp: normalizeTimestamp(item.timestamp),
      conversation_category: conversationCategory,
      pricing_payload: pricing as JsonValue | null,
      error_code: errorCode,
      error_message: errorMessage,
      raw_json: {
        ...(asJsonObject(existingMessage?.raw_json || null) as Record<string, JsonValue>),
        last_status_event: payload as JsonValue,
      },
      received_at: existingMessage?.received_at || occurredAt,
      created_at: existingMessage?.created_at || occurredAt,
      updated_at: occurredAt,
      reply_to_message_id: existingMessage?.reply_to_message_id || null,
      origin_job_id: existingMessage?.origin_job_id || null,
      agent_run_id: existingMessage?.agent_run_id || null,
      send_state: nextSendState,
    });

    await this.repository.touchConnectionWebhook(event.connection_id, occurredAt);
  }

  private async processClaimedWebhookEvent(
    event: WebhookEventRow,
    occurredAt: string
  ) {
    if (event.event_kind === "message_received") {
      await this.processMessageEvent(event, occurredAt);
      return;
    }

    if (event.event_kind === "message_status") {
      await this.processStatusEvent(event, occurredAt);
      return;
    }

    if (event.connection_id) {
      await this.repository.touchConnectionWebhook(event.connection_id, occurredAt);
    }
  }

  async processQueuedWebhookEvents(batchSize = config.whatsappDrainBatchSize) {
    const workerId = `node-whatsapp-${randomUUID()}`;
    const rows = await this.repository.claimWebhookEvents(batchSize, workerId);

    for (const row of rows) {
      const occurredAt = new Date().toISOString();
      try {
        await this.processClaimedWebhookEvent(row, occurredAt);
        await this.repository.markWebhookEventProcessed(row.id, occurredAt);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error || "unknown");
        this.logger.warn(
          { eventId: row.id, eventKind: row.event_kind, message },
          "WhatsApp webhook processing failed"
        );
        await this.repository.markWebhookEventFailed(row.id, message);
      }
    }

    return rows.length;
  }

  async processQueuedConversationJobs(batchSize = config.whatsappDrainBatchSize) {
    if (!config.whatsappEnableAgent) {
      return 0;
    }

    if (!this.crypto) {
      throw new HttpError(
        503,
        "A chave de criptografia do WhatsApp é obrigatória para processar jobs conversacionais."
      );
    }

    if (!config.geminiApiKey || !config.whatsappAgentModel) {
      throw new HttpError(
        503,
        "GEMINI_API_KEY e WHATSAPP_AGENT_MODEL são obrigatórios para o agent processor do WhatsApp."
      );
    }

    return processQueuedConversationJobs(
      {
        repository: this.repository,
        graphClient: this.graphClient,
        crypto: this.crypto,
        graphVersion: config.metaGraphVersion,
        geminiApiKey: config.geminiApiKey,
        agentModel: config.whatsappAgentModel,
        historyLimit: config.whatsappAgentHistoryLimit,
        fetchFn: fetch,
        now: () => new Date(),
        randomUUID,
        log: this.logger,
      },
      batchSize
    );
  }

  async startOnboardingSession(input: {
    authorizationHeader?: string | null;
    clinicId?: string | null;
    clinicName?: string | null;
  }) {
    const clinicId = ensureString(input.clinicId, "clinicId");
    const clinicName = cleanString(input.clinicName) || null;

    await resolveClinicAccess(this.teamRepository, {
      authorizationHeader: input.authorizationHeader,
      clinicId,
      requireManage: true,
    });

    this.ensureMetaOnboardingConfigured();
    const state = randomUUID();
    const now = new Date().toISOString();
    const graphVersion = normalizeGraphVersion(config.metaGraphVersion);
    const extras = {
      feature: "whatsapp_embedded_signup",
      sessionInfoVersion: "3",
      setup: clinicName ? { business: { name: clinicName } } : {},
    };
    const launchUrl = buildMetaLaunchUrl({
      appId: config.metaAppId!,
      configId: config.metaEmbeddedSignupConfigId!,
      redirectUri: config.metaEmbeddedSignupRedirectUri!,
      state,
      graphVersion,
      scopeText: config.metaEmbeddedSignupScopes.join(","),
      extras,
    });

    const existingConnection = await this.repository.getConnectionByClinicId(clinicId);
    const connectionPayload = {
      provider: "meta_cloud_api" as const,
      operational_status: "onboarding" as const,
      onboarding_status: "embedded_signup_started" as const,
      verification_status:
        existingConnection?.verification_status || ("unknown" as VerificationStatus),
      webhook_status: config.metaWebhookVerifyToken
        ? ("verify_pending" as const)
        : ("not_configured" as const),
      onboarding_state: state,
      onboarding_started_at: now,
      last_error: null,
      last_event_code: "meta_embedded_signup_started",
      last_event_message:
        "Aguardando autorização oficial da Meta para conectar o WhatsApp.",
      last_event_at: now,
      updated_at: now,
      connection_metadata: mergeConnectionMetadata(
        existingConnection?.connection_metadata || null,
        {
          onboarding_source: "meta_embedded_signup",
          graph_version: graphVersion,
          launch_scopes: config.metaEmbeddedSignupScopes as unknown as JsonValue,
          last_embedded_signup_started_at: now,
          clinic_name: clinicName,
        }
      ),
    };

    const persistedConnection = existingConnection
      ? await this.repository.updateConnection(existingConnection.id, connectionPayload)
      : await this.repository.createConnection({
          id: randomUUID(),
          clinic_id: clinicId,
        }).then(connection => {
          if (!connection) {
            throw new HttpError(
              500,
              "Não foi possível inicializar a conexão oficial do WhatsApp."
            );
          }
          return this.repository.updateConnection(connection.id, connectionPayload);
        });

    if (!persistedConnection) {
      throw new HttpError(
        500,
        "Não foi possível persistir o onboarding oficial do WhatsApp."
      );
    }

    return {
      ok: true as const,
      connection: serializeConnection(persistedConnection),
      state,
      redirectUri: config.metaEmbeddedSignupRedirectUri!,
      launchUrl,
      appId: config.metaAppId!,
      configId: config.metaEmbeddedSignupConfigId!,
      graphVersion,
      scopes: config.metaEmbeddedSignupScopes,
      extras,
    };
  }

  async getConnectionStatus(input: {
    authorizationHeader?: string | null;
    clinicId?: string | null;
  }) {
    const clinicId = ensureString(input.clinicId, "clinicId");

    await resolveClinicAccess(this.teamRepository, {
      authorizationHeader: input.authorizationHeader,
      clinicId,
      requireManage: false,
    });

    const connection = await this.repository.getConnectionByClinicId(clinicId);
    if (!connection) {
      throw new HttpError(
        404,
        "Nenhuma conexão WhatsApp encontrada para esta clínica."
      );
    }

    return serializeConnection(connection);
  }

  async completeOnboarding(input: {
    authorizationHeader?: string | null;
    connectionId?: string | null;
    state?: string | null;
    authorizationCode?: string | null;
    accessToken?: string | null;
    businessAccountId?: string | null;
    wabaId?: string | null;
    phoneNumberId?: string | null;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
    grantedScopes?: string[] | null;
    metadata?: Record<string, unknown> | null;
    tokenExpiresAt?: string | null;
    tokenExpiresInSeconds?: number | null;
  }) {
    const connectionId = ensureString(input.connectionId, "connectionId");
    const state = ensureString(
      input.state,
      "state é obrigatório para concluir o onboarding oficial."
    );
    const connection = await this.repository.getConnectionById(connectionId);
    if (!connection) {
      throw new HttpError(404, "Conexão WhatsApp não encontrada.");
    }

    if (state !== cleanString(connection.onboarding_state)) {
      throw new HttpError(
        400,
        "O retorno do Embedded Signup não corresponde ao onboarding iniciado."
      );
    }

    await resolveClinicAccess(this.teamRepository, {
      authorizationHeader: input.authorizationHeader,
      clinicId: connection.clinic_id,
      requireManage: true,
    });

    let accessToken = cleanString(input.accessToken);
    if (!accessToken) {
      const authorizationCode = ensureString(
        input.authorizationCode,
        "A Meta não retornou um authorization code ou access token válido."
      );
      this.ensureMetaOnboardingConfigured();
      accessToken = (
        await this.graphClient.exchangeCodeForAccessToken(
          authorizationCode,
          config.metaEmbeddedSignupRedirectUri || ""
        )
      ).accessToken;
    }

    const crypto = this.ensureCrypto();
    const grantedScopes =
      Array.isArray(input.grantedScopes) && input.grantedScopes.length
        ? input.grantedScopes.map(scope => cleanString(scope)).filter(Boolean)
        : config.metaEmbeddedSignupScopes;
    const tokenExpiresAt =
      cleanString(input.tokenExpiresAt) ||
      (typeof input.tokenExpiresInSeconds === "number" &&
      Number.isFinite(input.tokenExpiresInSeconds) &&
      input.tokenExpiresInSeconds > 0
        ? new Date(
            Date.now() + input.tokenExpiresInSeconds * 1000
          ).toISOString()
        : null);
    const discovered = await this.graphClient.discoverAssets(accessToken, {
      businessAccountId: input.businessAccountId,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber,
      verifiedName: input.verifiedName,
    });

    if (!discovered.wabaId) {
      throw new HttpError(
        502,
        "A Meta não retornou o WABA necessário para ativar o webhook oficial."
      );
    }

    const now = new Date().toISOString();
    await this.repository.upsertConnectionCredentials({
      connection_id: connection.id,
      encrypted_access_token: crypto.encrypt(accessToken),
      granted_scopes: grantedScopes,
      token_obtained_at: now,
      token_expires_at: tokenExpiresAt,
      metadata:
        input.metadata && typeof input.metadata === "object"
          ? { ...input.metadata, source: "meta_embedded_signup" }
          : { source: "meta_embedded_signup" },
    });

    await this.graphClient.subscribeAppToWaba(discovered.wabaId, accessToken);

    const persistedConnection = await this.repository.updateConnection(
      connection.id,
      {
        provider: "meta_cloud_api",
        operational_status: "active",
        onboarding_status: "completed",
        verification_status: discovered.verificationStatus,
        webhook_status: config.metaWebhookVerifyToken
          ? "subscribed"
          : "not_configured",
        business_account_id: discovered.businessAccountId,
        waba_id: discovered.wabaId,
        phone_number_id: discovered.phoneNumberId,
        display_phone_number: discovered.displayPhoneNumber,
        verified_name: discovered.verifiedName,
        onboarding_state: null,
        last_error: null,
        last_event_code: "meta_whatsapp_connected",
        last_event_message: "WhatsApp conectado com sucesso via Meta Cloud API.",
        last_event_at: now,
        updated_at: now,
        connection_metadata: mergeConnectionMetadata(
          connection.connection_metadata,
          {
            onboarding_source: "meta_embedded_signup",
            graph_version: config.metaGraphVersion,
            granted_scopes: grantedScopes as unknown as JsonValue,
            token_expires_at: tokenExpiresAt,
            completed_at: now,
            callback_metadata:
              input.metadata && typeof input.metadata === "object"
                ? (input.metadata as JsonValue)
                : null,
          }
        ),
      }
    );

    if (!persistedConnection) {
      throw new HttpError(
        500,
        "Não foi possível concluir a conexão oficial do WhatsApp."
      );
    }

    return serializeConnection(persistedConnection);
  }

  verifyWebhookHandshake(query: URLSearchParams) {
    const mode = cleanString(query.get("hub.mode"));
    const token = cleanString(query.get("hub.verify_token"));
    const challenge = cleanString(query.get("hub.challenge"));

    if (mode !== "subscribe" || !challenge) {
      throw new HttpError(400, "Parâmetros de verificação inválidos.");
    }

    if (!config.metaWebhookVerifyToken || token !== config.metaWebhookVerifyToken) {
      throw new HttpError(403, "Webhook da Meta não autorizado.");
    }

    return challenge;
  }

  async ingestWebhook(rawBody: string, signatureHeader: string | undefined) {
    if (!this.webhookVerifier.hasSecret()) {
      throw new HttpError(
        503,
        "O segredo do webhook da Meta não está configurado para receber eventos do WhatsApp."
      );
    }

    if (!this.webhookVerifier.verify(rawBody, signatureHeader)) {
      throw new HttpError(401, "Assinatura do webhook da Meta inválida.");
    }

    let payload: Record<string, unknown>;
    try {
      payload = rawBody.trim()
        ? (JSON.parse(rawBody) as Record<string, unknown>)
        : {};
    } catch (error) {
      throw new HttpError(400, "Payload JSON inválido recebido da Meta.", error);
    }

    const rows = await this.buildWebhookEventRows(payload);
    await this.repository.upsertWebhookEvents(rows);

    if (config.whatsappEnableWorkers) {
      this.queueBackgroundTask(
        (async () => {
          await this.processQueuedWebhookEvents(config.whatsappDrainBatchSize);
          if (config.whatsappEnableAgent) {
            await this.processQueuedConversationJobs(config.whatsappDrainBatchSize);
          }
        })()
      );
    }

    return {
      received: true,
      queued: rows.length,
    };
  }

  async drainWebhookQueue(input: {
    authorizationHeader?: string | null;
    batchSize?: number | null;
  }) {
    this.ensureDrainToken(input.authorizationHeader);
    const processed = await this.processQueuedWebhookEvents(
      Math.max(Number(input.batchSize || config.whatsappDrainBatchSize), 1)
    );

    if (config.whatsappEnableAgent) {
      this.queueBackgroundTask(
        this.processQueuedConversationJobs(
          Math.max(Number(input.batchSize || config.whatsappDrainBatchSize), 1)
        )
      );
    }

    return {
      ok: true,
      processed,
    };
  }

  async drainConversationQueue(input: {
    authorizationHeader?: string | null;
    batchSize?: number | null;
  }) {
    this.ensureDrainToken(input.authorizationHeader);
    const processed = await this.processQueuedConversationJobs(
      Math.max(Number(input.batchSize || config.whatsappDrainBatchSize), 1)
    );
    return {
      ok: true,
      processed,
    };
  }

  async sendMessage(input: {
    authorizationHeader?: string | null;
    sourceMessageId?: string | null;
    originJobId?: string | null;
    agentRunId?: string | null;
    text?: string | null;
  }) {
    this.ensureDrainToken(input.authorizationHeader);
    const crypto = this.ensureCrypto();

    if (!config.geminiApiKey && !config.whatsappEnableAgent) {
      this.logger.warn(
        { sourceMessageId: input.sourceMessageId || null },
        "Sending official WhatsApp message without agent runtime enabled"
      );
    }

    return sendOfficialWhatsAppMessage(
      {
        repository: this.repository,
        graphClient: this.graphClient,
        crypto,
        graphVersion: config.metaGraphVersion,
        geminiApiKey: config.geminiApiKey || "",
        agentModel: config.whatsappAgentModel || "",
        historyLimit: config.whatsappAgentHistoryLimit,
        fetchFn: fetch,
        now: () => new Date(),
        randomUUID,
        log: this.logger,
      },
      {
        sourceMessageId: ensureString(input.sourceMessageId, "sourceMessageId"),
        originJobId: ensureString(input.originJobId, "originJobId"),
        agentRunId: ensureString(input.agentRunId, "agentRunId"),
        text: ensureString(input.text, "text"),
      }
    );
  }
}

export function createWhatsAppService(args: {
  repository: WhatsAppRepository;
  teamRepository: TeamRepository;
  logger: TeamServiceLogger;
}) {
  return new WhatsAppService(args.repository, args.teamRepository, args.logger);
}

export { extractSignatureHeader };
