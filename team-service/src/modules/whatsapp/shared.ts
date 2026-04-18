import { createHash } from "node:crypto";
import { HttpError } from "../../errors.js";

export const WHATSAPP_PUBLIC_ERROR =
  "Não foi possível iniciar a conexão oficial do WhatsApp agora. Tente novamente ou acione o suporte.";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ConnectionRow = {
  id: string;
  clinic_id: string;
  provider: string | null;
  operational_status: string;
  onboarding_status: string;
  verification_status: string;
  webhook_status: string;
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
  connection_metadata: JsonValue | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WebhookEventRow = {
  id: string;
  connection_id: string | null;
  clinic_id: string | null;
  provider: string;
  provider_object: string | null;
  provider_event_hash: string;
  event_kind: string;
  payload: JsonValue;
  processing_status: string;
  processing_attempts: number;
  last_processing_error: string | null;
  received_at: string;
  processed_at: string | null;
};

export type WhatsAppMessageRow = {
  id: string;
  clinic_id: string;
  connection_id: string;
  provider: string;
  provider_message_id: string | null;
  contact_wa_id: string | null;
  from_me: boolean;
  message_type: string | null;
  text_body: string | null;
  provider_message_status: string | null;
  provider_timestamp: string | null;
  conversation_category: string | null;
  pricing_payload: JsonValue | null;
  error_code: string | null;
  error_message: string | null;
  raw_json: JsonValue | null;
  received_at: string;
  created_at: string;
  updated_at: string;
  reply_to_message_id: string | null;
  origin_job_id: string | null;
  agent_run_id: string | null;
  send_state: string | null;
};

export type ConversationJobRow = {
  id: string;
  clinic_id: string;
  connection_id: string;
  source_message_id: string;
  contact_wa_id: string;
  job_kind: string;
  status: string;
  attempt_count: number;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

export type AgentRunRow = {
  id: string;
  job_id: string;
  attempt_number: number;
  clinic_id: string;
  connection_id: string;
  source_message_id: string;
  contact_wa_id: string;
  decision: string;
  model_provider: string | null;
  model_name: string | null;
  prompt_snapshot: string | null;
  history_snapshot: JsonValue | null;
  request_payload: JsonValue | null;
  response_payload: JsonValue | null;
  reply_text: string | null;
  handoff_reason: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export function cleanString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function ensureString(value: unknown, field: string, statusCode = 400) {
  const normalized = cleanString(value);
  if (!normalized) {
    throw new HttpError(statusCode, `${field} é obrigatório.`);
  }
  return normalized;
}

export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asJsonObject(value: unknown): Record<string, JsonValue> {
  if (!isPlainObject(value)) return {};
  return value as Record<string, JsonValue>;
}

export function mergeConnectionMetadata(
  existing: JsonValue | null,
  patch: Record<string, JsonValue>
) {
  return {
    ...asJsonObject(existing),
    ...patch,
  } as JsonValue;
}

function buildSeverity(
  operationalStatus: string,
  verificationStatus: string,
  lastError: string | null
) {
  if (
    operationalStatus === "action_required" ||
    verificationStatus === "failed"
  ) {
    return "critical";
  }

  if (
    operationalStatus === "onboarding" ||
    verificationStatus === "pending" ||
    lastError
  ) {
    return "warning";
  }

  return "info";
}

export function serializeConnection(connection: ConnectionRow) {
  return {
    connectionId: connection.id,
    clinicId: connection.clinic_id,
    provider: (connection.provider || "meta_cloud_api") as "meta_cloud_api",
    operationalStatus: connection.operational_status as
      | "not_connected"
      | "onboarding"
      | "active"
      | "action_required"
      | "disconnected",
    onboardingStatus: connection.onboarding_status as
      | "not_started"
      | "embedded_signup_started"
      | "authorization_granted"
      | "credentials_received"
      | "completed"
      | "failed",
    verificationStatus: connection.verification_status as
      | "unknown"
      | "pending"
      | "verified"
      | "restricted"
      | "failed",
    webhookStatus: connection.webhook_status as
      | "not_configured"
      | "verify_pending"
      | "verified"
      | "subscribed"
      | "failed",
    businessAccountId: connection.business_account_id,
    wabaId: connection.waba_id,
    phoneNumberId: connection.phone_number_id,
    displayPhoneNumber: connection.display_phone_number,
    verifiedName: connection.verified_name,
    lastError: connection.last_error,
    actionRequiredReason:
      connection.operational_status === "action_required"
        ? connection.last_event_code || null
        : null,
    lastEvent:
      connection.last_event_code ||
      connection.last_event_message ||
      connection.last_error
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

export function normalizeTimestamp(value: unknown) {
  const normalized = cleanString(value);
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric * 1000).toISOString();
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function extractTextBody(message: Record<string, unknown>) {
  const textValue = isPlainObject(message.text) ? message.text : null;
  if (
    textValue &&
    typeof textValue.body === "string" &&
    textValue.body.trim()
  ) {
    return textValue.body.trim();
  }

  const buttonValue = isPlainObject(message.button) ? message.button : null;
  if (
    buttonValue &&
    typeof buttonValue.text === "string" &&
    buttonValue.text.trim()
  ) {
    return buttonValue.text.trim();
  }

  const interactive = isPlainObject(message.interactive)
    ? message.interactive
    : null;
  const buttonReply = interactive && isPlainObject(interactive.button_reply)
    ? interactive.button_reply
    : null;
  const listReply = interactive && isPlainObject(interactive.list_reply)
    ? interactive.list_reply
    : null;
  const interactiveText =
    cleanString(buttonReply?.title) ||
    cleanString(buttonReply?.id) ||
    cleanString(listReply?.title) ||
    cleanString(listReply?.id);
  if (interactiveText) return interactiveText;

  return null;
}

export function normalizeTextContent(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

export function hashJson(value: unknown) {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}
