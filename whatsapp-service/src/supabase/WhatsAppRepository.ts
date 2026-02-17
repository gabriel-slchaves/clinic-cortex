import { createClient } from "@supabase/supabase-js";
import { HttpError } from "../errors.js";

export type ConnectionStatus = "idle" | "creating" | "qr_pending" | "connected" | "error";
export type SchemaCapabilities = {
  advancedConnectionMetadata: boolean;
  clinicNotifications: boolean;
};

export type WhatsAppConnectionRow = {
  id: string;
  clinic_id: string;
  status: ConnectionStatus;
  session_path: string;
  qr_code: string | null;
  qr_generated_at: string | null;
  phone_jid: string | null;
  phone_number: string | null;
  connected_at: string | null;
  last_error: string | null;
  last_seen_at: string | null;
  manual_action_required: boolean;
  is_recovering: boolean;
  recovery_attempt_count: number;
  next_retry_at: string | null;
  last_event_code: string | null;
  last_event_message: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ClinicNotificationSeverity = "info" | "warning" | "critical";

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

type WhatsAppMessageInsert = {
  clinic_id: string;
  connection_id: string;
  wa_message_id: string;
  remote_jid: string;
  from_me: boolean;
  message_type: string | null;
  text_body: string | null;
  raw_json: unknown;
  received_at: string;
};

type ConnectionInsert = {
  id: string;
  clinic_id: string;
  session_path: string;
};

type ConnectionUpdate = Partial<{
  status: ConnectionStatus;
  qr_code: string | null;
  qr_generated_at: string | null;
  phone_jid: string | null;
  phone_number: string | null;
  connected_at: string | null;
  last_error: string | null;
  last_seen_at: string | null;
  manual_action_required: boolean;
  is_recovering: boolean;
  recovery_attempt_count: number;
  next_retry_at: string | null;
  last_event_code: string | null;
  last_event_message: string | null;
  deleted_at: string | null;
}>;

const BASE_CONNECTION_COLUMNS = new Set<keyof ConnectionUpdate>([
  "status",
  "qr_code",
  "qr_generated_at",
  "phone_jid",
  "phone_number",
  "connected_at",
  "last_error",
  "last_seen_at",
  "deleted_at",
]);

function isSchemaMismatchError(error: unknown) {
  const e = error as { code?: string; message?: string; details?: string };
  const code = String(e?.code || "");
  const message = `${String(e?.message || "")} ${String(e?.details || "")}`.toLowerCase();
  if (code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205") return true;
  if (message.includes("column") && message.includes("does not exist")) return true;
  if (message.includes("relation") && message.includes("does not exist")) return true;
  return false;
}

function filterBaseConnectionUpdate(input: ConnectionUpdate): ConnectionUpdate {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => BASE_CONNECTION_COLUMNS.has(key as keyof ConnectionUpdate))
  ) as ConnectionUpdate;
}

function compactObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export class WhatsAppRepository {
  private readonly admin;
  private capabilities: SchemaCapabilities = {
    advancedConnectionMetadata: true,
    clinicNotifications: true,
  };
  private warnedCapabilities = new Set<keyof SchemaCapabilities>();

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

  async initializeSchemaCapabilities() {
    const [advancedConnectionMetadata, clinicNotifications] = await Promise.all([
      this.detectAdvancedConnectionMetadata(),
      this.detectClinicNotifications(),
    ]);

    this.capabilities = {
      advancedConnectionMetadata,
      clinicNotifications,
    };

    return { ...this.capabilities };
  }

  getSchemaCapabilities() {
    return { ...this.capabilities };
  }

  private async detectAdvancedConnectionMetadata() {
    const { error } = await this.admin
      .from("whatsapp_connections")
      .select(
        "id,manual_action_required,is_recovering,recovery_attempt_count,next_retry_at,last_event_code,last_event_message"
      )
      .limit(1);

    return !error || !isSchemaMismatchError(error);
  }

  private async detectClinicNotifications() {
    const { error } = await this.admin.from("clinic_notifications").insert({
      clinic_id: "00000000-0000-0000-0000-000000000000",
      kind: "schema_probe",
      severity: "info",
      title: "schema probe",
      message: "schema probe",
      dedupe_key: `schema-probe-${Date.now()}`,
      active: true,
      metadata: { probe: true },
    });

    if (!error) return true;
    if (isSchemaMismatchError(error)) return false;
    return true;
  }

  private disableCapability(capability: keyof SchemaCapabilities) {
    this.capabilities[capability] = false;
  }

  private shouldWarnCapability(capability: keyof SchemaCapabilities) {
    if (this.warnedCapabilities.has(capability)) return false;
    this.warnedCapabilities.add(capability);
    return true;
  }

  async authenticateAccessToken(accessToken: string) {
    const { data, error } = await this.admin.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new HttpError(401, "Sessão do Supabase inválida.");
    }

    return data.user;
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
      throw new HttpError(500, "Não foi possível validar o acesso à clínica.", error);
    }

    if (!data?.clinic_id) {
      throw new HttpError(403, "Você não tem acesso a esta clínica.");
    }

    return {
      clinicId: data.clinic_id as string,
      role: String((data as any)?.role || "").trim().toLowerCase(),
      isAdmin: Boolean((data as any)?.is_admin),
    };
  }

  async ensureConnectionAccess(userId: string, connectionId: string) {
    const connection = await this.getConnectionById(connectionId);

    if (!connection) {
      throw new HttpError(404, "Conexão WhatsApp não encontrada.");
    }

    await this.ensureClinicAccess(userId, connection.clinic_id);
    return connection;
  }

  async ensureClinicManageAccess(userId: string, clinicId: string) {
    const membership = await this.ensureClinicAccess(userId, clinicId);
    if (membership.role !== "owner" && !membership.isAdmin) {
      throw new HttpError(403, "Somente o administrador da clínica pode reconectar o WhatsApp.");
    }
    return membership;
  }

  async ensureConnectionManageAccess(userId: string, connectionId: string) {
    const connection = await this.getConnectionById(connectionId);
    if (!connection) {
      throw new HttpError(404, "Conexão WhatsApp não encontrada.");
    }

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
      throw new HttpError(500, "Não foi possível carregar a conexão WhatsApp.", error);
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
      throw new HttpError(500, "Não foi possível carregar a conexão da clínica.", error);
    }

    return data;
  }

  async messageExists(connectionId: string, waMessageId: string) {
    const { data, error } = await this.admin
      .from("whatsapp_messages")
      .select("id")
      .eq("connection_id", connectionId)
      .eq("wa_message_id", waMessageId)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw new HttpError(500, "Não foi possível verificar a mensagem do WhatsApp.", error);
    }

    return Boolean(data?.id);
  }

  async listConnectionsForBootstrap() {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .select("*")
      .is("deleted_at", null)
      .returns<WhatsAppConnectionRow[]>();

    if (error) {
      throw new HttpError(500, "Não foi possível listar conexões WhatsApp.", error);
    }

    return data || [];
  }

  async createConnection(input: ConnectionInsert) {
    const { data, error } = await this.admin
      .from("whatsapp_connections")
      .insert({
        id: input.id,
        clinic_id: input.clinic_id,
        session_path: input.session_path,
      })
      .select("*")
      .limit(1)
      .maybeSingle<WhatsAppConnectionRow>();

    if (!error) return data;

    if ((error as { code?: string }).code === "23505") {
      return this.getConnectionByClinicId(input.clinic_id);
    }

    throw new HttpError(500, "Não foi possível criar a conexão WhatsApp.", error);
  }

  async updateConnection(connectionId: string, input: ConnectionUpdate) {
    const payload = compactObject(
      this.capabilities.advancedConnectionMetadata ? input : filterBaseConnectionUpdate(input)
    );

    const runUpdate = async (updatePayload: ConnectionUpdate) =>
      this.admin
        .from("whatsapp_connections")
        .update(updatePayload)
        .eq("id", connectionId)
        .is("deleted_at", null)
        .select("*")
        .limit(1)
        .maybeSingle<WhatsAppConnectionRow>();

    let { data, error } = await runUpdate(payload);

    if (error && isSchemaMismatchError(error) && this.capabilities.advancedConnectionMetadata) {
      this.disableCapability("advancedConnectionMetadata");
      const fallbackPayload = compactObject(filterBaseConnectionUpdate(payload));
      if (!Object.keys(fallbackPayload).length) {
        return this.getConnectionById(connectionId);
      }
      ({ data, error } = await runUpdate(fallbackPayload));
    }

    if (error) {
      throw new HttpError(500, "Não foi possível atualizar a conexão WhatsApp.", error);
    }

    return data;
  }

  async upsertIncomingMessage(input: WhatsAppMessageInsert) {
    const { error } = await this.admin
      .from("whatsapp_messages")
      .upsert(input, {
        onConflict: "connection_id,wa_message_id",
        ignoreDuplicates: false,
      });

    if (error) {
      throw new HttpError(500, "Não foi possível registrar a mensagem recebida.", error);
    }
  }

  async upsertClinicNotification(input: ClinicNotificationUpsert) {
    if (!this.capabilities.clinicNotifications) return;

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

    const { error } = await this.admin.from("clinic_notifications").upsert(payload, {
      onConflict: "dedupe_key",
      ignoreDuplicates: false,
    });

    if (error && isSchemaMismatchError(error)) {
      this.disableCapability("clinicNotifications");
      return;
    }

    if (error) {
      throw new HttpError(500, "Não foi possível registrar a notificação da clínica.", error);
    }
  }

  async resolveClinicNotification(
    dedupeKey: string,
    input?: Partial<Pick<ClinicNotificationUpsert, "title" | "message" | "metadata" | "severity">>
  ) {
    if (!this.capabilities.clinicNotifications) return;

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
      this.disableCapability("clinicNotifications");
      return;
    }

    if (error) {
      throw new HttpError(500, "Não foi possível atualizar a notificação da clínica.", error);
    }
  }

  consumeCapabilityWarnings() {
    const warnings: Array<{ capability: keyof SchemaCapabilities; reason: string }> = [];

    if (!this.capabilities.advancedConnectionMetadata && this.shouldWarnCapability("advancedConnectionMetadata")) {
      warnings.push({
        capability: "advancedConnectionMetadata",
        reason:
          "whatsapp_connections ainda não possui as colunas da migration 20260404_170000_whatsapp_resilience_notifications.sql.",
      });
    }

    if (!this.capabilities.clinicNotifications && this.shouldWarnCapability("clinicNotifications")) {
      warnings.push({
        capability: "clinicNotifications",
        reason:
          "clinic_notifications ainda não existe no banco atual; notificações internas do WhatsApp ficam desativadas.",
      });
    }

    return warnings;
  }
}
