import { supabase } from "@/lib/supabase";
import { getInternalServiceUrl } from "@/lib/internalServiceOrigin";

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
  connection: WhatsAppConnectionResponse;
  state: string;
  redirectUri: string;
  launchUrl: string;
  appId: string;
  configId: string;
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
    public readonly status: number
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
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
      "Serviço oficial de conexão WhatsApp indisponível. Verifique se o conector interno está ativo e configurado corretamente.",
      503
    );
  }

  const raw = await response.text();
  const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new WhatsAppApiError(
      String(payload.error || "Falha ao comunicar com o serviço WhatsApp."),
      response.status
    );
  }

  return payload as T;
}

export function createWhatsAppConnection(clinicId: string) {
  return request<WhatsAppConnectionResponse>("/connections", {
    method: "POST",
    body: JSON.stringify({ clinicId }),
  });
}

export function getWhatsAppConnectionByClinic(clinicId: string) {
  return request<WhatsAppConnectionResponse>(
    `/connections/by-clinic/${encodeURIComponent(clinicId)}`
  );
}

export function getWhatsAppConnectionStatusByClinic(clinicId: string) {
  return request<WhatsAppConnectionResponse>(
    `/connections/by-clinic/${encodeURIComponent(clinicId)}/status`
  );
}

export function createWhatsAppEmbeddedSignupSessionByClinic(
  clinicId: string,
  clinicName?: string | null
) {
  return request<WhatsAppOnboardingSessionResponse>(
    `/connections/by-clinic/${encodeURIComponent(clinicId)}/onboarding/session`,
    {
      method: "POST",
      body: JSON.stringify({ clinicName: clinicName ?? null }),
    }
  );
}

export function completeWhatsAppEmbeddedSignup(
  connectionId: string,
  payload: CompleteEmbeddedSignupInput
) {
  return request<WhatsAppConnectionResponse>(
    `/connections/${encodeURIComponent(connectionId)}/onboarding/complete`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}
