import { createHash, randomUUID } from "node:crypto";
import pino from "pino";
import { config } from "../config.js";
import { HttpError } from "../errors.js";
import { MetaCrypto } from "../meta/MetaCrypto.js";
import { MetaGraphClient } from "../meta/MetaGraphClient.js";
import { MetaWebhookVerifier } from "../meta/MetaWebhookVerifier.js";
import { N8nWebhookClient, N8nWebhookError } from "../n8n/N8nWebhookClient.js";
import {
  type MessageDeliveryStatus,
  type OperationalStatus,
  type VerificationStatus,
  type WebhookStatus,
  type WhatsAppConnectionRow,
  type WhatsAppProvider,
  WhatsAppRepository,
} from "../supabase/WhatsAppRepository.js";

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: Record<string, any>;
    }>;
  }>;
};

type EmbeddedSignupCompletionInput = {
  state?: string;
  authorizationCode?: string;
  accessToken?: string;
  businessAccountId?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  grantedScopes?: string[] | null;
  metadata?: Record<string, unknown> | null;
  tokenExpiresAt?: string | null;
  tokenExpiresInSeconds?: number | null;
};

export type ConnectionSnapshot = {
  connectionId: string;
  clinicId: string;
  provider: WhatsAppProvider;
  operationalStatus: OperationalStatus;
  onboardingStatus: WhatsAppConnectionRow["onboarding_status"];
  verificationStatus: VerificationStatus;
  webhookStatus: WebhookStatus;
  businessAccountId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  lastError: string | null;
  actionRequiredReason: string | null;
  lastEvent: {
    code: string;
    message: string;
    severity: "info" | "warning" | "critical";
    occurredAt: string | null;
  } | null;
};

const N8N_RETRY_DELAYS_MS = [0, 1000, 3000];

function toIso(value: unknown) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric * 1000).toISOString();
  }
  return new Date().toISOString();
}

function normalizeMessageType(input: Record<string, any>) {
  return (
    String(input.type || "")
      .trim()
      .toLowerCase() || null
  );
}

function normalizeTextBody(input: Record<string, any>) {
  const type = normalizeMessageType(input);
  if (type === "text") return String(input.text?.body || "").trim() || null;
  if (type === "button") return String(input.button?.text || "").trim() || null;
  if (type === "interactive") {
    const reply =
      input.interactive?.button_reply || input.interactive?.list_reply;
    return String(reply?.title || reply?.id || "").trim() || null;
  }
  if (type === "image" || type === "video")
    return String(input[type]?.caption || "").trim() || null;
  return null;
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

function mapMessageStatus(value: unknown): MessageDeliveryStatus {
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

function isAutomationEligibleMessage(message: Record<string, any>) {
  const type = normalizeMessageType(message);
  return type === "text" || type === "button" || type === "interactive";
}

function buildSeverity(
  operationalStatus: OperationalStatus,
  verificationStatus: VerificationStatus,
  lastError: string | null
): "info" | "warning" | "critical" {
  if (
    operationalStatus === "action_required" ||
    verificationStatus === "failed"
  )
    return "critical";
  if (
    operationalStatus === "onboarding" ||
    verificationStatus === "pending" ||
    lastError
  )
    return "warning";
  return "info";
}

function messageRiskNotificationKey(connectionId: string) {
  return `whatsapp:${connectionId}:message-risk`;
}

function manualActionNotificationKey(connectionId: string) {
  return `whatsapp:${connectionId}:action-required`;
}

export class WhatsAppCloudService {
  constructor(
    private readonly repository: WhatsAppRepository,
    private readonly graphClient: MetaGraphClient,
    private readonly webhookVerifier: MetaWebhookVerifier,
    private readonly logger: pino.Logger,
    private readonly n8nWebhookClient: N8nWebhookClient | null,
    private readonly crypto: MetaCrypto | null
  ) {}

  async bootstrap() {
    await this.auditActiveConnections();
  }

  serializeConnection(connection: WhatsAppConnectionRow): ConnectionSnapshot {
    return {
      connectionId: connection.id,
      clinicId: connection.clinic_id,
      provider: connection.provider,
      operationalStatus: connection.operational_status,
      onboardingStatus: connection.onboarding_status,
      verificationStatus: connection.verification_status,
      webhookStatus: connection.webhook_status,
      businessAccountId: connection.business_account_id,
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
      displayPhoneNumber: connection.display_phone_number,
      verifiedName: connection.verified_name,
      lastError: connection.last_error,
      actionRequiredReason:
        connection.operational_status === "action_required"
          ? connection.last_event_code
          : null,
      lastEvent:
        connection.last_event_code || connection.last_event_message
          ? {
              code: connection.last_event_code || "whatsapp_unknown",
              message:
                connection.last_event_message ||
                connection.last_error ||
                "Evento operacional do WhatsApp.",
              severity: buildSeverity(
                connection.operational_status,
                connection.verification_status,
                connection.last_error
              ),
              occurredAt: connection.last_event_at,
            }
          : null,
    };
  }

  async createConnection(clinicId: string) {
    const existing = await this.repository.getConnectionByClinicId(clinicId);
    if (existing) return existing;

    const created = await this.repository.createConnection({
      id: randomUUID(),
      clinic_id: clinicId,
    });

    if (!created) {
      throw new HttpError(
        500,
        "Não foi possível inicializar a conexão oficial do WhatsApp."
      );
    }

    return created;
  }

  async getConnectionStatusSnapshot(connectionId: string) {
    return this.repository.getConnectionById(connectionId);
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

  private buildEmbeddedSignupUrl(state: string, clinicName: string | null) {
    this.ensureMetaOnboardingConfigured();

    const url = new URL(
      `https://www.facebook.com/${config.metaGraphVersion}/dialog/oauth`
    );
    url.searchParams.set("client_id", config.metaAppId!);
    url.searchParams.set("redirect_uri", config.metaEmbeddedSignupRedirectUri!);
    url.searchParams.set("state", state);
    url.searchParams.set("config_id", config.metaEmbeddedSignupConfigId!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("override_default_response_type", "true");
    url.searchParams.set("scope", config.metaEmbeddedSignupScopes.join(","));
    url.searchParams.set(
      "extras",
      JSON.stringify({
        feature: "whatsapp_embedded_signup",
        sessionInfoVersion: "3",
        setup: clinicName
          ? {
              business: {
                name: clinicName,
              },
            }
          : {},
      })
    );
    return url.toString();
  }

  async createEmbeddedSignupSession(
    connection: WhatsAppConnectionRow,
    clinicName?: string | null
  ) {
    const state = randomUUID();
    const updated =
      (await this.repository.updateConnection(connection.id, {
        operational_status: "onboarding",
        onboarding_status: "embedded_signup_started",
        webhook_status: config.metaWebhookVerifyToken
          ? "verify_pending"
          : "not_configured",
        onboarding_state: state,
        onboarding_started_at: new Date().toISOString(),
        last_error: null,
        last_event_code: "meta_embedded_signup_started",
        last_event_message:
          "Aguardando autorização oficial da Meta para conectar o WhatsApp.",
        last_event_at: new Date().toISOString(),
      })) || connection;

    await this.repository.resolveClinicNotification(
      manualActionNotificationKey(connection.id),
      {
        title: "Ação retomada",
        message: "O onboarding oficial do WhatsApp foi retomado.",
        severity: "info",
      }
    );

    return {
      connection: this.serializeConnection(updated),
      state,
      redirectUri: config.metaEmbeddedSignupRedirectUri!,
      launchUrl: this.buildEmbeddedSignupUrl(state, clinicName || null),
      appId: config.metaAppId!,
      configId: config.metaEmbeddedSignupConfigId!,
    };
  }

  async completeEmbeddedSignup(
    connection: WhatsAppConnectionRow,
    input: EmbeddedSignupCompletionInput
  ) {
    const state = String(input.state || "").trim();
    if (
      !state ||
      !connection.onboarding_state ||
      state !== connection.onboarding_state
    ) {
      throw new HttpError(
        400,
        "O retorno do Embedded Signup não corresponde ao onboarding iniciado."
      );
    }

    await this.repository.updateConnection(connection.id, {
      onboarding_status: "authorization_granted",
      last_event_code: "meta_embedded_signup_authorized",
      last_event_message:
        "Autorização oficial da Meta recebida. Finalizando a conexão do número.",
      last_event_at: new Date().toISOString(),
    });

    const accessToken =
      String(input.accessToken || "").trim() ||
      (String(input.authorizationCode || "").trim()
        ? (
            await this.graphClient.exchangeCodeForAccessToken(
              String(input.authorizationCode || "").trim(),
              config.metaEmbeddedSignupRedirectUri || ""
            )
          ).accessToken
        : "");

    if (!accessToken) {
      throw new HttpError(
        400,
        "A Meta não retornou um authorization code ou access token válido."
      );
    }

    const crypto = this.ensureCrypto();
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

    await this.repository.upsertConnectionCredentials({
      connection_id: connection.id,
      encrypted_access_token: crypto.encrypt(accessToken),
      granted_scopes: input.grantedScopes ?? config.metaEmbeddedSignupScopes,
      token_obtained_at: new Date().toISOString(),
      token_expires_at:
        input.tokenExpiresAt ||
        (typeof input.tokenExpiresInSeconds === "number" &&
        Number.isFinite(input.tokenExpiresInSeconds)
          ? new Date(
              Date.now() + input.tokenExpiresInSeconds * 1000
            ).toISOString()
          : null),
      metadata: input.metadata ?? null,
    });

    await this.repository.updateConnection(connection.id, {
      onboarding_status: "credentials_received",
      last_event_code: "meta_embedded_signup_credentials_received",
      last_event_message:
        "Credenciais oficiais recebidas. Assinando os webhooks da Meta.",
      last_event_at: new Date().toISOString(),
    });

    await this.graphClient.subscribeAppToWaba(discovered.wabaId, accessToken);

    const updated = await this.repository.updateConnection(connection.id, {
      provider: "meta_cloud_api",
      operational_status: "active",
      onboarding_status: "completed",
      verification_status: discovered.verificationStatus,
      webhook_status: "subscribed",
      business_account_id: discovered.businessAccountId,
      waba_id: discovered.wabaId,
      phone_number_id: discovered.phoneNumberId,
      display_phone_number: discovered.displayPhoneNumber,
      verified_name: discovered.verifiedName,
      onboarding_state: null,
      last_error: null,
      last_event_code: "meta_whatsapp_connected",
      last_event_message: "WhatsApp conectado com sucesso via Meta Cloud API.",
      last_event_at: new Date().toISOString(),
      connection_metadata: input.metadata ?? null,
    });

    await this.repository.resolveClinicNotification(
      manualActionNotificationKey(connection.id),
      {
        title: "WhatsApp conectado",
        message: "A conexão oficial do WhatsApp voltou a operar normalmente.",
        severity: "info",
      }
    );

    return updated!;
  }

  verifyWebhookHandshake(query: URLSearchParams) {
    const mode = query.get("hub.mode");
    const token = query.get("hub.verify_token");
    const challenge = query.get("hub.challenge");

    if (mode !== "subscribe" || !challenge) {
      throw new HttpError(
        400,
        "Parâmetros de verificação do webhook inválidos."
      );
    }

    if (
      !config.metaWebhookVerifyToken ||
      token !== config.metaWebhookVerifyToken
    ) {
      throw new HttpError(403, "Webhook da Meta não autorizado.");
    }

    return challenge;
  }

  async acceptWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
    payload: MetaWebhookPayload
  ) {
    if (!this.webhookVerifier.hasSecret()) {
      throw new HttpError(
        503,
        "O segredo do webhook da Meta não está configurado."
      );
    }

    if (!this.webhookVerifier.verify(rawBody, signatureHeader)) {
      throw new HttpError(403, "Assinatura do webhook da Meta inválida.");
    }

    const eventHash = createHash("sha256")
      .update(rawBody, "utf8")
      .digest("hex");
    const phoneNumberId =
      payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ||
      null;
    const connection = phoneNumberId
      ? await this.repository.getConnectionByPhoneNumberId(
          String(phoneNumberId)
        )
      : null;

    const inserted = await this.repository.insertWebhookEvent({
      connection_id: connection?.id || null,
      clinic_id: connection?.clinic_id || null,
      provider: "meta_cloud_api",
      provider_object: payload.object || null,
      event_kind: "meta_webhook",
      provider_event_hash: eventHash,
      payload,
    });

    if (inserted.duplicate || !inserted.event?.id) {
      return;
    }

    void this.processWebhookEvent(inserted.event.id, payload).catch(
      async error => {
        this.logger.error(
          {
            eventId: inserted.event?.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to process Meta webhook event"
        );

        try {
          await this.repository.markWebhookEventFailed(
            inserted.event!.id,
            error instanceof Error ? error.message : String(error)
          );
        } catch {
          // best-effort only
        }
      }
    );
  }

  private async processWebhookEvent(
    eventId: string,
    payload: MetaWebhookPayload
  ) {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value || {};
        const phoneNumberId = String(
          value.metadata?.phone_number_id || ""
        ).trim();
        if (!phoneNumberId) continue;

        const connection =
          await this.repository.getConnectionByPhoneNumberId(phoneNumberId);
        if (!connection) continue;

        await this.repository.updateConnection(connection.id, {
          last_webhook_at: new Date().toISOString(),
          webhook_status: "subscribed",
          last_event_code: "meta_webhook_received",
          last_event_message:
            "Evento oficial do WhatsApp recebido pela Meta Cloud API.",
          last_event_at: new Date().toISOString(),
        });

        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const contactsByWaId = new Map<string, string | null>();
        for (const contact of contacts) {
          const waId = String(
            (contact as Record<string, any>).wa_id || ""
          ).trim();
          if (!waId) continue;
          const profileName =
            String(
              (contact as Record<string, any>).profile?.name || ""
            ).trim() || null;
          contactsByWaId.set(waId, profileName);
        }

        for (const message of Array.isArray(value.messages)
          ? value.messages
          : []) {
          await this.processInboundMessage(connection, message, contactsByWaId);
        }

        for (const status of Array.isArray(value.statuses)
          ? value.statuses
          : []) {
          await this.processStatusUpdate(connection, status);
        }
      }
    }

    await this.repository.markWebhookEventProcessed(eventId);
  }

  private async processInboundMessage(
    connection: WhatsAppConnectionRow,
    message: Record<string, any>,
    contactsByWaId: Map<string, string | null>
  ) {
    const providerMessageId = String(message.id || "").trim();
    const contactWaId = String(message.from || "").trim();
    if (!providerMessageId || !contactWaId) return;

    const alreadyStored = await this.repository.messageExists(
      connection.id,
      providerMessageId
    );
    if (alreadyStored) return;

    const messageType = normalizeMessageType(message);
    const textBody = normalizeTextBody(message);
    const receivedAt = toIso(message.timestamp);

    await this.repository.upsertMessage({
      clinic_id: connection.clinic_id,
      connection_id: connection.id,
      provider: "meta_cloud_api",
      provider_message_id: providerMessageId,
      contact_wa_id: contactWaId,
      from_me: false,
      message_type: messageType,
      text_body: textBody,
      provider_timestamp: receivedAt,
      raw_json: message,
      received_at: receivedAt,
    });

    if (
      !isAutomationEligibleMessage(message) ||
      !textBody ||
      !this.n8nWebhookClient
    ) {
      return;
    }

    await this.maybeRespondToIncomingMessage({
      connection,
      contactWaId,
      providerMessageId,
      messageType,
      messageText: textBody,
      profileName: contactsByWaId.get(contactWaId) ?? null,
      receivedAt,
    });
  }

  private async requestAutomationReply(input: {
    clinicId: string;
    connectionId: string;
    contactWaId: string;
    providerMessageId: string;
    messageText: string;
    messageType: string | null;
    profileName: string | null;
    receivedAt: string;
  }) {
    let lastError: unknown = null;

    for (let index = 0; index < N8N_RETRY_DELAYS_MS.length; index += 1) {
      const delayMs = N8N_RETRY_DELAYS_MS[index];
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      try {
        return await this.n8nWebhookClient!.requestReply({
          clinicId: input.clinicId,
          connectionId: input.connectionId,
          contactWaId: input.contactWaId,
          providerMessageId: input.providerMessageId,
          messageText: input.messageText,
          messageType: input.messageType,
          profileName: input.profileName,
          receivedAt: input.receivedAt,
        });
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof N8nWebhookError ? error.retryable : false;
        if (!retryable || index === N8N_RETRY_DELAYS_MS.length - 1) break;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Falha ao obter resposta automática.");
  }

  private async maybeRespondToIncomingMessage(input: {
    connection: WhatsAppConnectionRow;
    contactWaId: string;
    providerMessageId: string;
    messageType: string | null;
    messageText: string;
    profileName: string | null;
    receivedAt: string;
  }) {
    const credentials = await this.repository.getConnectionCredentials(
      input.connection.id
    );
    if (!credentials?.encrypted_access_token) {
      await this.notifyActionRequired(
        input.connection,
        "Credenciais oficiais ausentes",
        "A conexão oficial do WhatsApp perdeu as credenciais necessárias para responder mensagens."
      );
      return;
    }

    const crypto = this.ensureCrypto();
    const accessToken = crypto.decrypt(credentials.encrypted_access_token);

    let webhookResponse: Awaited<ReturnType<N8nWebhookClient["requestReply"]>>;

    try {
      webhookResponse = await this.requestAutomationReply({
        clinicId: input.connection.clinic_id,
        connectionId: input.connection.id,
        contactWaId: input.contactWaId,
        providerMessageId: input.providerMessageId,
        messageText: input.messageText,
        messageType: input.messageType,
        profileName: input.profileName,
        receivedAt: input.receivedAt,
      });
    } catch (error) {
      await this.notifyMessageAutomationRisk(
        input.connection,
        input.providerMessageId,
        error instanceof Error ? error.message : String(error)
      );
      return;
    }

    const replyText =
      typeof webhookResponse?.replyText === "string"
        ? webhookResponse.replyText.trim()
        : "";

    if (!replyText) {
      await this.notifyMessageAutomationRisk(
        input.connection,
        input.providerMessageId,
        "Webhook n8n respondeu sem replyText."
      );
      return;
    }

    if (!input.connection.phone_number_id) {
      await this.notifyActionRequired(
        input.connection,
        "Número oficial não vinculado",
        "A conexão oficial não possui phone_number_id para enviar a resposta automática."
      );
      return;
    }

    try {
      const sent = await this.graphClient.sendTextMessage({
        accessToken,
        phoneNumberId: input.connection.phone_number_id,
        toWaId: input.contactWaId,
        textBody: replyText,
        replyToProviderMessageId: input.providerMessageId,
      });

      await this.repository.upsertMessage({
        clinic_id: input.connection.clinic_id,
        connection_id: input.connection.id,
        provider: "meta_cloud_api",
        provider_message_id: sent.providerMessageId,
        contact_wa_id: input.contactWaId,
        from_me: true,
        message_type: "text",
        text_body: replyText,
        provider_message_status: "accepted",
        provider_timestamp: new Date().toISOString(),
        raw_json: sent.raw,
        received_at: new Date().toISOString(),
      });

      await this.repository.resolveClinicNotification(
        messageRiskNotificationKey(input.connection.id),
        {
          title: "Mensagens respondendo normalmente",
          message:
            "A automação oficial do WhatsApp voltou a responder mensagens.",
          severity: "info",
        }
      );
    } catch (error) {
      await this.notifyMessageAutomationRisk(
        input.connection,
        input.providerMessageId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async processStatusUpdate(
    connection: WhatsAppConnectionRow,
    status: Record<string, any>
  ) {
    const providerMessageId = String(status.id || "").trim();
    const normalizedStatus = mapMessageStatus(status.status);
    if (!providerMessageId || !normalizedStatus) return;

    const error = Array.isArray(status.errors) ? status.errors[0] : null;
    const conversationCategory = normalizeConversationCategory(
      status.conversation?.category
    );

    await this.repository.insertMessageStatusEvent({
      clinic_id: connection.clinic_id,
      connection_id: connection.id,
      provider: "meta_cloud_api",
      provider_message_id: providerMessageId,
      status: normalizedStatus,
      conversation_category: conversationCategory,
      pricing_payload: status.pricing || null,
      error_code: error ? String(error.code || "") || null : null,
      error_message: error
        ? String(error.title || error.message || "") || null
        : null,
      raw_json: status,
      occurred_at: toIso(status.timestamp),
    });

    await this.repository.updateMessageStatus(
      connection.id,
      providerMessageId,
      {
        provider_message_status: normalizedStatus,
        conversation_category: conversationCategory,
        pricing_payload: status.pricing || null,
        error_code: error ? String(error.code || "") || null : null,
        error_message: error
          ? String(error.title || error.message || "") || null
          : null,
      }
    );
  }

  async auditActiveConnections() {
    const connections = await this.repository
      .listActiveConnections()
      .catch(() => []);

    for (const connection of connections) {
      try {
        const credentials = await this.repository.getConnectionCredentials(
          connection.id
        );
        if (
          !credentials?.encrypted_access_token ||
          !connection.phone_number_id
        ) {
          await this.notifyActionRequired(
            connection,
            "Conexão oficial incompleta",
            "A conexão oficial do WhatsApp não possui credenciais ou número oficial vinculados."
          );
          continue;
        }

        const accessToken = this.ensureCrypto().decrypt(
          credentials.encrypted_access_token
        );
        const phone = await this.graphClient.inspectPhoneNumber(
          connection.phone_number_id,
          accessToken
        );
        await this.repository.updateConnection(connection.id, {
          operational_status: "active",
          verification_status: String(
            phone.code_verification_status || phone.status || ""
          )
            .trim()
            .toLowerCase()
            .includes("verified")
            ? "verified"
            : connection.verification_status,
          display_phone_number:
            phone.display_phone_number || connection.display_phone_number,
          verified_name: phone.verified_name || connection.verified_name,
          last_error: null,
          last_event_code: "meta_connection_health_ok",
          last_event_message: "Conexão oficial validada com sucesso.",
          last_event_at: new Date().toISOString(),
        });
      } catch (error) {
        await this.notifyActionRequired(
          connection,
          "A conexão oficial do WhatsApp precisa de atenção",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  private async notifyActionRequired(
    connection: WhatsAppConnectionRow,
    title: string,
    message: string
  ) {
    await this.repository.updateConnection(connection.id, {
      operational_status: "action_required",
      onboarding_status:
        connection.onboarding_status === "completed" ? "completed" : "failed",
      last_error: message,
      last_event_code: "meta_action_required",
      last_event_message: message,
      last_event_at: new Date().toISOString(),
    });

    await this.repository.upsertClinicNotification({
      clinic_id: connection.clinic_id,
      kind: "whatsapp_manual_action_required",
      severity: "critical",
      title,
      message,
      dedupe_key: manualActionNotificationKey(connection.id),
      metadata: {
        connectionId: connection.id,
        provider: "meta_cloud_api",
      },
    });
  }

  private async notifyMessageAutomationRisk(
    connection: WhatsAppConnectionRow,
    providerMessageId: string,
    reason: string
  ) {
    await this.repository.upsertClinicNotification({
      clinic_id: connection.clinic_id,
      kind: "whatsapp_message_risk",
      severity: "warning",
      title: "Risco de mensagem sem resposta",
      message: `A mensagem ${providerMessageId} não pôde ser respondida automaticamente: ${reason}`,
      dedupe_key: messageRiskNotificationKey(connection.id),
      metadata: {
        connectionId: connection.id,
        providerMessageId,
        provider: "meta_cloud_api",
      },
    });
  }
}
