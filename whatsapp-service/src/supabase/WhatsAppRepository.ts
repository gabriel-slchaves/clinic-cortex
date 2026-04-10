import { createClient } from "@supabase/supabase-js";
import { HttpError } from "../errors.js";

export type WhatsAppProvider = "meta_cloud_api";
export type OperationalStatus =
  | "not_connected"
  | "onboarding"
  | "active"
  | "action_required"
  | "disconnected";
export type OnboardingStatus =
  | "not_started"
  | "embedded_signup_started"
  | "authorization_granted"
  | "credentials_received"
  | "completed"
  | "failed";
export type VerificationStatus =
  | "unknown"
  | "pending"
  | "verified"
  | "restricted"
  | "failed";
export type WebhookStatus =
  | "not_configured"
  | "verify_pending"
  | "verified"
  | "subscribed"
  | "failed";
export type MessageDeliveryStatus =
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | null;
export type ClinicNotificationSeverity = "info" | "warning" | "critical";

export type WhatsAppConnectionRow = {
  id: string;
  clinic_id: string;
  provider: WhatsAppProvider;
  operational_status: OperationalStatus;
  onboarding_status: OnboardingStatus;
  verification_status: VerificationStatus;
  webhook_status: WebhookStatus;
  business_account_id: string | null;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  onboarding_state: string | null;
  onboarding_started_at: string | null;
  last_error: string | null;
  last_event_code: string | null;
  last_event_message: string | null;
  last_event_at: string | null;
  last_webhook_at: string | null;
  connection_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WhatsAppConnectionCredentialRow = {
  id: string;
  connection_id: string;
  encrypted_access_token: string;
  granted_scopes: string[] | null;
  token_obtained_at: string | null;
  token_expires_at: string | null;
  revoked_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppWebhookEventRow = {
  id: string;
  connection_id: string | null;
  clinic_id: string | null;
  provider: WhatsAppProvider;
  provider_object: string | null;
  provider_event_hash: string;
  event_kind: string;
  payload: Record<string, unknown>;
  received_at: string;
  processing_status: "pending" | "processed" | "failed";
  processing_attempts: number;
  last_processing_error: string | null;
  processed_at: string | null;
};

type ClinicNotificationUpsert = {
  clinic_id: string;
  kind: string;
  severity: ClinicNotificationSeverity;
  title: string;
  message: string;
  dedupe_key: string;
  active?: boolean;
  metadata?: unknown;
  resolved_at?: string | null;
};

type ConnectionInsert = {
  id: string;
  clinic_id: string;
};

type ConnectionUpdate = Partial<{
  provider: WhatsAppProvider;
  operational_status: OperationalStatus;
  onboarding_status: OnboardingStatus;
  verification_status: VerificationStatus;
  webhook_status: WebhookStatus;
  business_account_id: string | null;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  onboarding_state: string | null;
  onboarding_started_at: string | null;
  last_error: string | null;
  last_event_code: string | null;
  last_event_message: string | null;
  last_event_at: string | null;
  last_webhook_at: string | null;
  connection_metadata: unknown;
  deleted_at: string | null;
}>;

type CredentialsUpsert = {
  connection_id: string;
  encrypted_access_token: string;
  granted_scopes?: string[] | null;
  token_obtained_at?: string | null;
  token_expires_at?: string | null;
  revoked_at?: string | null;
  metadata?: unknown;
};

type WebhookEventInsert = {
  connection_id: string | null;
  clinic_id: string | null;
  provider: WhatsAppProvider;
  provider_object: string | null;
  provider_event_hash: string;
  event_kind: string;
  payload: unknown;
};

type MessageUpsertInput = {
  clinic_id: string;
  connection_id: string;
  provider: WhatsAppProvider;
  provider_message_id: string;
  contact_wa_id: string;
  from_me: boolean;
  message_type: string | null;
  text_body: string | null;
  provider_message_status?: MessageDeliveryStatus;
  provider_timestamp?: string | null;
  conversation_category?: string | null;
  pricing_payload?: unknown;
  error_code?: string | null;
  error_message?: string | null;
  raw_json: unknown;
  received_at: string;
};

type MessageStatusEventInsert = {
  clinic_id: string;
  connection_id: string;
  provider: WhatsAppProvider;
  provider_message_id: string;
  status: NonNullable<MessageDeliveryStatus>;
  conversation_category?: string | null;
  pricing_payload?: unknown;
  error_code?: string | null;
  error_message?: string | null;
  raw_json: unknown;
  occurred_at: string;
};

function isSchemaMismatchError(error: unknown) {
  const e = error as { code?: string; message?: string; details?: string };
  const code = String(e?.code || "");
  const message =
    `${String(e?.message || "")} ${String(e?.details || "")}`.toLowerCase();
  if (
    code === "42703" ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205"
  )
    return true;
  if (message.includes("column") && message.includes("does not exist"))
    return true;
  if (message.includes("relation") && message.includes("does not exist"))
    return true;
  return false;
}

function compactObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export class WhatsAppRepository {
  private readonly admin;
  private clinicNotificationsEnabled = true;

  constructor({
    supabaseUrl,
    supabaseServiceRoleKey,
  }: {
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
  }) {
    this.admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async authenticateAccessToken(accessToken: string) {
    try {
      const { data, error } = await this.admin.auth.getUser(accessToken);
      if (error) {
        const status = Number((error as { status?: number })?.status || 0);
        const message = String(
          (error as { message?: string })?.message || ""
        ).toLowerCase();
        const invalidSession =
          status === 401 ||
          status === 403 ||
          message.includes("session") ||
          message.includes("token") ||
          message.includes("jwt");

        if (invalidSession) {
          throw new HttpError(401, "Sessão do Supabase inválida.", {
            category: "auth_session",
          });
        }

        throw new HttpError(
          503,
          "Serviço interno de autenticação indisponível.",
          {
            category: "service_unavailable",
            source: "supabase_auth",
            reason: String(
              (error as { message?: string })?.message || "unknown"
            ),
          }
        );
      }

      if (!data.user) {
        throw new HttpError(
          503,
          "Serviço interno de autenticação indisponível.",
          {
            category: "service_unavailable",
            source: "supabase_auth",
            reason: "missing_user_without_error",
          }
        );
      }

      return data.user;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(
        503,
        "Serviço interno de autenticação indisponível.",
        {
          category: "service_unavailable",
          source: "supabase_auth",
          reason: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async ensureClinicAccess(userId: string, clinicId: string) {
    const { data, error } = await this.admin
      .from("clinic_members")
      .select("clinic_id,role,is_admin")
      .eq("user_id", userId)
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível validar o acesso à clínica.",
        error
      );
    }

    if (!data?.clinic_id) {
      throw new HttpError(403, "Você não tem acesso a esta clínica.");
    }

    return {
      clinicId: data.clinic_id as string,
      role: String((data as { role?: string })?.role || "")
        .trim()
        .toLowerCase(),
      isAdmin: Boolean((data as { is_admin?: boolean })?.is_admin),
    };
  }

  async ensureClinicManageAccess(userId: string, clinicId: string) {
    const membership = await this.ensureClinicAccess(userId, clinicId);
    if (membership.role !== "owner" && !membership.isAdmin) {
      throw new HttpError(
        403,
        "Somente o administrador da clínica pode conectar o WhatsApp."
      );
    }
    return membership;
  }

  async ensureConnectionAccess(userId: string, connectionId: string) {
    const connection = await this.getConnectionById(connectionId);
    if (!connection) {
      throw new HttpError(404, "Conexão WhatsApp não encontrada.");
    }

    await this.ensureClinicAccess(userId, connection.clinic_id);
    return connection;
  }

  async ensureConnectionManageAccess(userId: string, connectionId: string) {
    const connection = await this.ensureConnectionAccess(userId, connectionId);
    await this.ensureClinicManageAccess(userId, connection.clinic_id);
    return connection;
  }

  async getConnectionById(connectionId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .select("*")
      .eq("id", connectionId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle<WhatsAppConnectionRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível carregar a conexão WhatsApp.",
        error
      );
    }

    return data;
  }

  async getConnectionByClinicId(clinicId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .select("*")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle<WhatsAppConnectionRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível carregar a conexão da clínica.",
        error
      );
    }

    return data;
  }

  async getConnectionByPhoneNumberId(phoneNumberId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .select("*")
      .eq("phone_number_id", phoneNumberId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle<WhatsAppConnectionRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível localizar a conexão vinculada ao número oficial.",
        error
      );
    }

    return data;
  }

  async listActiveConnections() {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .select("*")
      .eq("provider", "meta_cloud_api")
      .eq("operational_status", "active")
      .is("deleted_at", null)
      .returns<WhatsAppConnectionRow[]>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível listar as conexões oficiais do WhatsApp.",
        error
      );
    }

    return data || [];
  }

  async createConnection(input: ConnectionInsert) {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .insert({
        id: input.id,
        clinic_id: input.clinic_id,
        provider: "meta_cloud_api",
        operational_status: "not_connected",
        onboarding_status: "not_started",
        verification_status: "unknown",
        webhook_status: "not_configured",
      })
      .select("*")
      .limit(1)
      .maybeSingle<WhatsAppConnectionRow>();

    if (!error) return data;

    if ((error as { code?: string }).code === "23505") {
      return this.getConnectionByClinicId(input.clinic_id);
    }

    throw new HttpError(
      500,
      "Não foi possível criar a conexão WhatsApp.",
      error
    );
  }

  async updateConnection(connectionId: string, input: ConnectionUpdate) {
    const payload = compactObject(input);
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .update(payload)
      .eq("id", connectionId)
      .is("deleted_at", null)
      .select("*")
      .limit(1)
      .maybeSingle<WhatsAppConnectionRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível atualizar a conexão WhatsApp.",
        error
      );
    }

    return data;
  }

  async getConnectionCredentials(connectionId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_connection_credentials")
      .select("*")
      .eq("connection_id", connectionId)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<WhatsAppConnectionCredentialRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível carregar as credenciais oficiais do WhatsApp.",
        error
      );
    }

    return data;
  }

  async upsertConnectionCredentials(input: CredentialsUpsert) {
    const payload = compactObject({
      connection_id: input.connection_id,
      encrypted_access_token: input.encrypted_access_token,
      granted_scopes: input.granted_scopes ?? null,
      token_obtained_at: input.token_obtained_at ?? null,
      token_expires_at: input.token_expires_at ?? null,
      revoked_at: input.revoked_at ?? null,
      metadata: input.metadata ?? null,
    });

    const { data, error } = await this.admin
      .from("whatsapp_connection_credentials")
      .upsert(payload, {
        onConflict: "connection_id",
        ignoreDuplicates: false,
      })
      .select("*")
      .limit(1)
      .maybeSingle<WhatsAppConnectionCredentialRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível salvar as credenciais do WhatsApp oficial.",
        error
      );
    }

    return data;
  }

  async insertWebhookEvent(input: WebhookEventInsert) {
    const now = new Date().toISOString();
    const { data, error } = await this.admin
      .from("whatsapp_webhook_events")
      .insert({
        connection_id: input.connection_id,
        clinic_id: input.clinic_id,
        provider: input.provider,
        provider_object: input.provider_object,
        provider_event_hash: input.provider_event_hash,
        event_kind: input.event_kind,
        payload: input.payload,
        received_at: now,
        processing_status: "pending",
        processing_attempts: 0,
      })
      .select("*")
      .limit(1)
      .maybeSingle<WhatsAppWebhookEventRow>();

    if (!error) {
      return { event: data, duplicate: false as const };
    }

    if ((error as { code?: string }).code === "23505") {
      return { event: null, duplicate: true as const };
    }

    throw new HttpError(
      500,
      "Não foi possível registrar o webhook oficial do WhatsApp.",
      error
    );
  }

  async markWebhookEventProcessed(eventId: string) {
    const { error } = await this.admin
      .from("whatsapp_webhook_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível concluir o processamento do webhook.",
        error
      );
    }
  }

  async markWebhookEventFailed(eventId: string, message: string) {
    const { error } = await this.admin
      .from("whatsapp_webhook_events")
      .update({
        processing_status: "failed",
        processed_at: new Date().toISOString(),
        last_processing_error: message,
        processing_attempts: 1,
      })
      .eq("id", eventId);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível marcar o webhook como falho.",
        error
      );
    }
  }

  async messageExists(connectionId: string, providerMessageId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_messages")
      .select("id")
      .eq("connection_id", connectionId)
      .eq("provider_message_id", providerMessageId)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível verificar a mensagem do WhatsApp.",
        error
      );
    }

    return Boolean(data?.id);
  }

  async upsertMessage(input: MessageUpsertInput) {
    const payload = compactObject({
      clinic_id: input.clinic_id,
      connection_id: input.connection_id,
      provider: input.provider,
      provider_message_id: input.provider_message_id,
      contact_wa_id: input.contact_wa_id,
      from_me: input.from_me,
      message_type: input.message_type,
      text_body: input.text_body,
      provider_message_status: input.provider_message_status ?? null,
      provider_timestamp: input.provider_timestamp ?? null,
      conversation_category: input.conversation_category ?? null,
      pricing_payload: input.pricing_payload ?? null,
      error_code: input.error_code ?? null,
      error_message: input.error_message ?? null,
      raw_json: input.raw_json,
      received_at: input.received_at,
    });

    const { error } = await this.admin
      .from("whatsapp_messages")
      .upsert(payload, {
        onConflict: "connection_id,provider_message_id",
        ignoreDuplicates: false,
      });

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível registrar a mensagem do WhatsApp.",
        error
      );
    }
  }

  async updateMessageStatus(
    connectionId: string,
    providerMessageId: string,
    input: Partial<
      Pick<
        MessageUpsertInput,
        | "provider_message_status"
        | "conversation_category"
        | "pricing_payload"
        | "error_code"
        | "error_message"
      >
    >
  ) {
    const payload = compactObject({
      provider_message_status: input.provider_message_status ?? undefined,
      conversation_category: input.conversation_category ?? undefined,
      pricing_payload: input.pricing_payload ?? undefined,
      error_code: input.error_code ?? undefined,
      error_message: input.error_message ?? undefined,
    });

    if (!Object.keys(payload).length) return;

    const { error } = await this.admin
      .from("whatsapp_messages")
      .update(payload)
      .eq("connection_id", connectionId)
      .eq("provider_message_id", providerMessageId);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível atualizar o status da mensagem do WhatsApp.",
        error
      );
    }
  }

  async insertMessageStatusEvent(input: MessageStatusEventInsert) {
    const payload = compactObject({
      clinic_id: input.clinic_id,
      connection_id: input.connection_id,
      provider: input.provider,
      provider_message_id: input.provider_message_id,
      status: input.status,
      conversation_category: input.conversation_category ?? null,
      pricing_payload: input.pricing_payload ?? null,
      error_code: input.error_code ?? null,
      error_message: input.error_message ?? null,
      raw_json: input.raw_json,
      occurred_at: input.occurred_at,
    });

    const { error } = await this.admin
      .from("whatsapp_message_status_events")
      .insert(payload);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível registrar o histórico de status da mensagem.",
        error
      );
    }
  }

  async upsertClinicNotification(input: ClinicNotificationUpsert) {
    if (!this.clinicNotificationsEnabled) return;

    const payload = {
      clinic_id: input.clinic_id,
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      message: input.message,
      dedupe_key: input.dedupe_key,
      active: input.active ?? true,
      metadata: input.metadata ?? null,
      resolved_at: input.resolved_at ?? null,
    };

    const { error } = await this.admin
      .from("clinic_notifications")
      .upsert(payload, {
        onConflict: "dedupe_key",
        ignoreDuplicates: false,
      });

    if (error && isSchemaMismatchError(error)) {
      this.clinicNotificationsEnabled = false;
      return;
    }

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível registrar a notificação da clínica.",
        error
      );
    }
  }

  async resolveClinicNotification(
    dedupeKey: string,
    input?: Partial<
      Pick<
        ClinicNotificationUpsert,
        "title" | "message" | "metadata" | "severity"
      >
    >
  ) {
    if (!this.clinicNotificationsEnabled) return;

    const payload = compactObject({
      active: false,
      resolved_at: new Date().toISOString(),
      title: input?.title,
      message: input?.message,
      metadata: input?.metadata,
      severity: input?.severity,
    });

    const { error } = await this.admin
      .from("clinic_notifications")
      .update(payload)
      .eq("dedupe_key", dedupeKey)
      .eq("active", true);

    if (error && isSchemaMismatchError(error)) {
      this.clinicNotificationsEnabled = false;
      return;
    }

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível atualizar a notificação da clínica.",
        error
      );
    }
  }
}
