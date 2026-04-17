import { supabase } from "@/lib/supabase";
import { getInternalServiceUrl } from "@/lib/internalServiceOrigin";

const WHATSAPP_START_PUBLIC_ERROR =
  "Não foi possível iniciar a conexão oficial do WhatsApp agora. Tente novamente ou acione o suporte.";

export type WhatsAppOperationalStatus =
  | "not_connected"
  | "onboarding"
  | "active"
  | "action_required"
  | "disconnected";
export type WhatsAppOnboardingStatus =
  | "not_started"
  | "embedded_signup_started"
  | "authorization_granted"
  | "credentials_received"
  | "completed"
  | "failed";
export type WhatsAppVerificationStatus =
  | "unknown"
  | "pending"
  | "verified"
  | "restricted"
  | "failed";
export type WhatsAppWebhookStatus =
  | "not_configured"
  | "verify_pending"
  | "verified"
  | "subscribed"
  | "failed";

export type WhatsAppConnectionResponse = {
  connectionId: string;
  clinicId: string;
  provider: "meta_cloud_api";
  operationalStatus: WhatsAppOperationalStatus;
  onboardingStatus: WhatsAppOnboardingStatus;
  verificationStatus: WhatsAppVerificationStatus;
  webhookStatus: WhatsAppWebhookStatus;
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

export type WhatsAppOnboardingSessionResponse = {
  ok?: true;
  connection: WhatsAppConnectionResponse;
  state: string;
  redirectUri: string;
  launchUrl: string;
  appId: string;
  configId: string;
  graphVersion?: string;
  scopes?: string[];
  extras?: Record<string, unknown>;
};

export type CompleteEmbeddedSignupInput = {
  state: string;
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

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly diagnostic?: unknown
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

function getPayloadShape(value: unknown) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function getPayloadKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new WhatsAppApiError("Sessão expirada. Faça login novamente.", 401);
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function request<T>(path: string, init?: RequestInit) {
  const authHeaders = await getAuthHeaders();
  let response: Response;

  try {
    response = await fetch(getInternalServiceUrl("whatsapp", path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new WhatsAppApiError(
      WHATSAPP_START_PUBLIC_ERROR,
      503
    );
  }

  const raw = await response.text();
  let payload: Record<string, unknown> = {};

  try {
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new WhatsAppApiError(
      WHATSAPP_START_PUBLIC_ERROR,
      502,
      {
        errorCode: "whatsapp_backend_invalid_json",
        rawPayloadType: typeof raw,
        rawPayloadPreview: raw.slice(0, 400),
      }
    );
  }

  if (!response.ok || payload.ok === false) {
    if (response.status === 404) {
      throw new WhatsAppApiError(
        WHATSAPP_START_PUBLIC_ERROR,
        404,
        payload
      );
    }

    throw new WhatsAppApiError(
      String(payload.publicMessage || payload.error || WHATSAPP_START_PUBLIC_ERROR),
      Number(payload.statusCode || response.status || 500),
      payload
    );
  }

  return payload as T;
}

function cleanRequiredString(
  payload: Record<string, unknown>,
  key: string,
  missingFields: string[]
) {
  const value = payload[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  missingFields.push(key);
  return "";
}

function assertWhatsAppOnboardingSessionResponse(
  payload: WhatsAppOnboardingSessionResponse
) {
  const raw = payload as unknown as Record<string, unknown>;
  const missingFields: string[] = [];
  const payloadKeys = getPayloadKeys(raw);

  const backendMessage = [
    raw.publicMessage,
    raw.error,
    raw.message,
  ].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );

  if (backendMessage) {
    throw new WhatsAppApiError(
      backendMessage,
      Number(
        typeof raw.statusCode === "number" ? raw.statusCode : 502
      ),
      {
        ...raw,
        payloadKeys,
        rawPayloadType: getPayloadShape(payload),
      }
    );
  }

  cleanRequiredString(raw, "appId", missingFields);
  cleanRequiredString(raw, "configId", missingFields);
  cleanRequiredString(raw, "state", missingFields);
  cleanRequiredString(raw, "redirectUri", missingFields);
  cleanRequiredString(raw, "launchUrl", missingFields);

  if (!payload.connection?.connectionId) {
    missingFields.push("connection.connectionId");
  }

  if (missingFields.length) {
    throw new WhatsAppApiError(WHATSAPP_START_PUBLIC_ERROR, 502, {
      errorCode: "meta_embedded_signup_session_invalid",
      missingFields,
      payloadKeys,
      rawPayloadType: getPayloadShape(payload),
    });
  }

  return payload;
}

export function getWhatsAppConnectionStatusByClinic(clinicId: string) {
  return request<WhatsAppConnectionResponse>(
    `/connections/status?clinicId=${encodeURIComponent(clinicId)}`
  );
}

export async function createWhatsAppEmbeddedSignupSessionByClinic(
  clinicId: string,
  clinicName?: string | null
) {
  const payload = await request<WhatsAppOnboardingSessionResponse>(
    `/connections/onboarding/session`,
    {
      method: "POST",
      body: JSON.stringify({ clinicId, clinicName: clinicName ?? null }),
    }
  );

  return assertWhatsAppOnboardingSessionResponse(payload);
}

export function completeWhatsAppEmbeddedSignup(
  connectionId: string,
  payload: CompleteEmbeddedSignupInput
) {
  return request<WhatsAppConnectionResponse>(
    `/connections/onboarding/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        connectionId,
        ...payload,
      }),
    }
  );
}
