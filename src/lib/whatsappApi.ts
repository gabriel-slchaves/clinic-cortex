import { supabase } from "@/lib/supabase";

export type WhatsAppConnectionStatus =
  | "idle"
  | "creating"
  | "qr_pending"
  | "connected"
  | "error";

export type WhatsAppConnectionResponse = {
  connectionId: string;
  clinicId: string;
  status: WhatsAppConnectionStatus;
  connectedAt: string | null;
  lastError: string | null;
  phoneNumber?: string | null;
  lastSeenAt?: string | null;
  manualActionRequired?: boolean;
  isRecovering?: boolean;
  recoveryAttemptCount?: number;
  nextRetryAt?: string | null;
  lastEventCode?: string | null;
  lastEventMessage?: string | null;
  cooldownUntil?: string | null;
  pairingBlocked?: boolean;
  reconnectMode?: "connected" | "recover" | "pairing_qr" | "cooldown" | "manual_action";
  manualActionRequiredReason?: string | null;
};

export type WhatsAppQrResponse = WhatsAppConnectionResponse & {
  qrCode: string | null;
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
    response = await fetch(`/api/whatsapp${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new WhatsAppApiError(
      "Serviço de conexão WhatsApp indisponível. Verifique se o conector interno está ativo e configurado corretamente.",
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

export function startWhatsAppConnection(connectionId: string) {
  return request<WhatsAppConnectionResponse>(`/connections/${encodeURIComponent(connectionId)}/start`, {
    method: "POST",
  });
}

export function getWhatsAppConnectionQr(connectionId: string) {
  return request<WhatsAppQrResponse>(`/connections/${encodeURIComponent(connectionId)}/qr`);
}

export function getWhatsAppConnectionStatus(connectionId: string) {
  return request<WhatsAppConnectionResponse>(
    `/connections/${encodeURIComponent(connectionId)}/status`
  );
}

export function getWhatsAppConnectionByClinic(clinicId: string) {
  return request<WhatsAppConnectionResponse>(
    `/connections/by-clinic/${encodeURIComponent(clinicId)}`
  );
}

export function getWhatsAppConnectionQrByClinic(clinicId: string) {
  return request<WhatsAppQrResponse>(`/connections/by-clinic/${encodeURIComponent(clinicId)}/qr`);
}

export function getWhatsAppConnectionStatusByClinic(clinicId: string) {
  return request<WhatsAppConnectionResponse>(
    `/connections/by-clinic/${encodeURIComponent(clinicId)}/status`
  );
}

export function startWhatsAppConnectionByClinic(clinicId: string) {
  return request<WhatsAppConnectionResponse>(
    `/connections/by-clinic/${encodeURIComponent(clinicId)}/start`,
    {
      method: "POST",
    }
  );
}
