import { createClient } from "@supabase/supabase-js";
import { HttpError } from "../errors.js";
import type {
  AgentRunRow,
  ConnectionRow,
  ConversationJobRow,
  JsonValue,
  WebhookEventRow,
  WhatsAppMessageRow,
} from "../modules/whatsapp/shared.js";

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

export type WhatsAppConnectionRow = ConnectionRow & {
  provider: WhatsAppProvider;
  operational_status: OperationalStatus;
  onboarding_status: OnboardingStatus;
  verification_status: VerificationStatus;
  webhook_status: WebhookStatus;
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
  updated_at: string;
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

type MessageUpsertInput = {
  clinic_id: string;
  connection_id: string;
  provider: WhatsAppProvider;
  provider_message_id: string | null;
  contact_wa_id: string | null;
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
  created_at?: string;
  updated_at?: string;
  reply_to_message_id?: string | null;
  origin_job_id?: string | null;
  agent_run_id?: string | null;
  send_state?: string | null;
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

type ConversationHistoryEntry = {
  id: string;
  fromMe: boolean;
  text: string;
  occurredAt: string | null;
};

function compactObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export class WhatsAppRepository {
  private readonly admin;

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

  async getConnectionByWabaId(wabaId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .select("*")
      .eq("waba_id", wabaId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle<WhatsAppConnectionRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível localizar a conexão vinculada ao WABA.",
        error
      );
    }

    return data;
  }

  async getConnectionByBusinessAccountId(businessAccountId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .select("*")
      .eq("business_account_id", businessAccountId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle<WhatsAppConnectionRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível localizar a conexão vinculada ao business account.",
        error
      );
    }

    return data;
  }

  async findConnectionByMetaIdentifiers(input: {
    phoneNumberId?: string | null;
    wabaId?: string | null;
    businessAccountId?: string | null;
  }) {
    if (input.phoneNumberId) {
      const byPhone = await this.getConnectionByPhoneNumberId(input.phoneNumberId);
      if (byPhone) return byPhone;
    }

    if (input.wabaId) {
      const byWaba = await this.getConnectionByWabaId(input.wabaId);
      if (byWaba) return byWaba;
    }

    if (input.businessAccountId) {
      return this.getConnectionByBusinessAccountId(input.businessAccountId);
    }

    return null;
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

  async touchConnectionWebhook(connectionId: string, occurredAt: string) {
    const { error } = await this.admin
      .from("whatsapp_connections")
      .update({
        last_webhook_at: occurredAt,
        updated_at: occurredAt,
      })
      .eq("id", connectionId);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível atualizar o last_webhook_at da conexão.",
        error
      );
    }
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

  async upsertWebhookEvents(rows: Array<Record<string, JsonValue>>) {
    const { error } = await this.admin
      .from("whatsapp_webhook_events")
      .upsert(rows, {
        onConflict: "provider_event_hash",
        ignoreDuplicates: true,
      });

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível enfileirar o webhook oficial do WhatsApp no Supabase.",
        error
      );
    }
  }

  async claimWebhookEvents(batchSize: number, workerId: string) {
    const { data, error } = await this.admin.rpc("claim_whatsapp_webhook_events", {
      batch_size: batchSize,
      worker_id: workerId,
    });

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível reivindicar os webhooks pendentes do WhatsApp.",
        error
      );
    }

    return (Array.isArray(data) ? data : []) as WebhookEventRow[];
  }

  async markWebhookEventProcessed(eventId: string, occurredAt: string) {
    const { error } = await this.admin
      .from("whatsapp_webhook_events")
      .update({
        processing_status: "processed",
        processed_at: occurredAt,
        last_processing_error: null,
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
        last_processing_error: message,
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
    const occurredAt = input.updated_at || input.received_at;
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
      created_at: input.created_at ?? input.received_at,
      updated_at: occurredAt,
      reply_to_message_id: input.reply_to_message_id ?? null,
      origin_job_id: input.origin_job_id ?? null,
      agent_run_id: input.agent_run_id ?? null,
      send_state: input.send_state ?? null,
    });

    const { data, error } = await this.admin
      .from("whatsapp_messages")
      .upsert(payload, {
        onConflict: "connection_id,provider_message_id",
        ignoreDuplicates: false,
      })
      .select("*")
      .limit(1)
      .maybeSingle<WhatsAppMessageRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível registrar a mensagem do WhatsApp.",
        error
      );
    }

    return data;
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
        | "send_state"
      >
    >
  ) {
    const payload = compactObject({
      provider_message_status: input.provider_message_status ?? undefined,
      conversation_category: input.conversation_category ?? undefined,
      pricing_payload: input.pricing_payload ?? undefined,
      error_code: input.error_code ?? undefined,
      error_message: input.error_message ?? undefined,
      send_state: input.send_state ?? undefined,
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

  async enqueueConversationJob(input: {
    clinic_id: string;
    connection_id: string;
    source_message_id: string;
    contact_wa_id: string;
    occurredAt: string;
  }) {
    const { error } = await this.admin.from("whatsapp_conversation_jobs").upsert(
      {
        clinic_id: input.clinic_id,
        connection_id: input.connection_id,
        source_message_id: input.source_message_id,
        contact_wa_id: input.contact_wa_id,
        job_kind: "generate_reply",
        status: "pending",
        attempt_count: 0,
        locked_at: null,
        locked_by: null,
        last_error: null,
        created_at: input.occurredAt,
        updated_at: input.occurredAt,
        completed_at: null,
        cancelled_at: null,
      },
      {
        onConflict: "source_message_id,job_kind",
        ignoreDuplicates: true,
      }
    );

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível enfileirar o job conversacional do WhatsApp.",
        error
      );
    }
  }

  async getClinicAssistantPrompt(clinicId: string) {
    const { data, error } = await this.admin
      .from("clinics")
      .select("assistant_prompt")
      .eq("id", clinicId)
      .limit(1)
      .maybeSingle<{ assistant_prompt: string | null }>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível carregar o prompt operacional da clínica.",
        error
      );
    }

    return typeof data?.assistant_prompt === "string"
      ? data.assistant_prompt.trim()
      : null;
  }

  async getMessageById(messageId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_messages")
      .select("*")
      .eq("id", messageId)
      .limit(1)
      .maybeSingle<WhatsAppMessageRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível carregar a mensagem WhatsApp.",
        error
      );
    }

    return data;
  }

  async getMessageByProviderMessageId(
    connectionId: string,
    providerMessageId: string
  ) {
    const { data, error } = await this.admin
      .from("whatsapp_messages")
      .select("*")
      .eq("connection_id", connectionId)
      .eq("provider_message_id", providerMessageId)
      .limit(1)
      .maybeSingle<WhatsAppMessageRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível localizar a mensagem WhatsApp pela referência do provedor.",
        error
      );
    }

    return data;
  }

  async getOutboundByOriginJobId(originJobId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_messages")
      .select("*")
      .eq("origin_job_id", originJobId)
      .limit(1)
      .maybeSingle<WhatsAppMessageRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível carregar a outbound do job conversacional.",
        error
      );
    }

    return data;
  }

  async listConversationHistory(input: {
    clinicId: string;
    connectionId: string;
    contactWaId: string;
    limit: number;
  }): Promise<ConversationHistoryEntry[]> {
    const queryLimit = Math.max(input.limit * 3, input.limit);
    const { data, error } = await this.admin
      .from("whatsapp_messages")
      .select(
        "id,from_me,text_body,provider_timestamp,received_at,contact_wa_id,connection_id,clinic_id"
      )
      .eq("clinic_id", input.clinicId)
      .eq("connection_id", input.connectionId)
      .eq("contact_wa_id", input.contactWaId)
      .order("provider_timestamp", { ascending: false, nullsFirst: false })
      .order("received_at", { ascending: false })
      .limit(queryLimit);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível carregar o histórico recente da conversa no WhatsApp.",
        error
      );
    }

    return ((Array.isArray(data) ? data : []) as WhatsAppMessageRow[])
      .map(row => ({
        id: row.id,
        fromMe: Boolean(row.from_me),
        text:
          typeof row.text_body === "string"
            ? row.text_body.replace(/\s+/g, " ").trim()
            : "",
        occurredAt: row.provider_timestamp || row.received_at || null,
      }))
      .filter(row => Boolean(row.text))
      .slice(0, input.limit)
      .reverse();
  }

  async createAgentRun(payload: Record<string, unknown>) {
    const { data, error } = await this.admin
      .from("whatsapp_agent_runs")
      .insert(payload)
      .select("*")
      .limit(1)
      .maybeSingle<AgentRunRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível registrar a tentativa do agente do WhatsApp.",
        error
      );
    }

    if (!data) {
      throw new HttpError(
        500,
        "A auditoria do agente do WhatsApp não foi retornada após a criação."
      );
    }

    return data;
  }

  async updateAgentRun(agentRunId: string, payload: Record<string, unknown>) {
    const { data, error } = await this.admin
      .from("whatsapp_agent_runs")
      .update(payload)
      .eq("id", agentRunId)
      .select("*")
      .limit(1)
      .maybeSingle<AgentRunRow>();

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível atualizar a auditoria do agente do WhatsApp.",
        error
      );
    }

    if (!data) {
      throw new HttpError(
        500,
        "A auditoria do agente do WhatsApp não foi retornada após a atualização."
      );
    }

    return data;
  }

  async claimConversationJobs(batchSize: number, workerId: string) {
    const { data, error } = await this.admin.rpc(
      "claim_whatsapp_conversation_jobs",
      {
        batch_size: batchSize,
        worker_id: workerId,
      }
    );

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível reivindicar os jobs conversacionais pendentes do WhatsApp.",
        error
      );
    }

    return (Array.isArray(data) ? data : []) as ConversationJobRow[];
  }

  async markConversationJobCompleted(jobId: string, occurredAt: string) {
    const { error } = await this.admin
      .from("whatsapp_conversation_jobs")
      .update({
        status: "completed",
        locked_at: null,
        locked_by: null,
        last_error: null,
        completed_at: occurredAt,
        updated_at: occurredAt,
      })
      .eq("id", jobId);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível concluir o job conversacional do WhatsApp.",
        error
      );
    }
  }

  async markConversationJobFailed(
    jobId: string,
    occurredAt: string,
    errorMessage: string
  ) {
    const { error } = await this.admin
      .from("whatsapp_conversation_jobs")
      .update({
        status: "failed",
        locked_at: null,
        locked_by: null,
        last_error: errorMessage,
        updated_at: occurredAt,
      })
      .eq("id", jobId);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível marcar o job conversacional do WhatsApp como falho.",
        error
      );
    }
  }

  async markConversationJobCancelled(
    jobId: string,
    occurredAt: string,
    errorMessage: string
  ) {
    const { error } = await this.admin
      .from("whatsapp_conversation_jobs")
      .update({
        status: "cancelled",
        locked_at: null,
        locked_by: null,
        last_error: errorMessage,
        cancelled_at: occurredAt,
        updated_at: occurredAt,
      })
      .eq("id", jobId);

    if (error) {
      throw new HttpError(
        500,
        "Não foi possível cancelar o job conversacional do WhatsApp.",
        error
      );
    }
  }
}
