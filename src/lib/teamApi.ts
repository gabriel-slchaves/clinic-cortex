import { type AreaId } from "@/lib/clinicAreas";
import { getInternalServiceUrl } from "@/lib/internalServiceOrigin";
import { supabase } from "@/lib/supabase";

export type TeamAccessLevel = "owner" | "doctor_admin" | "doctor" | "secretary";
export type TeamMemberKind = "doctor" | "secretary";
export type TeamAccountStatus = "active" | "pending";

export type TeamMember = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  accessLevel: TeamAccessLevel;
  memberKind: TeamMemberKind;
  areaId: AreaId | null;
  specialties: string[];
  licenseCode: string | null;
  accountStatus: TeamAccountStatus;
  createdAt: string;
  isAdmin: boolean;
  isOwner: boolean;
};

export type TeamPlanSummary = {
  name: string;
  maxDoctors: number;
  maxSecretaries: number;
  usedDoctors: number;
  usedSecretaries: number;
  remainingDoctors: number;
  remainingSecretaries: number;
};

export type TeamManagementPayload = {
  permissions: {
    isOwner: boolean;
    canManage: boolean;
  };
  plan: TeamPlanSummary;
  members: TeamMember[];
};

export type TeamPlanOption = {
  id: string;
  name: string;
  price_brl: number;
  max_doctors: number;
  max_secretaries: number;
  max_patients: number;
};

export type TeamPlanOptionsPayload = {
  currentPlanName: string | null;
  plans: TeamPlanOption[];
};

export type TeamMemberInput = {
  fullName: string;
  email: string;
  accessLevel: Exclude<TeamAccessLevel, "owner">;
  areaId: AreaId | null;
  specialties: string[];
  licenseCode: string | null;
};

export type TeamMemberUpdateInput = {
  fullName: string;
  accessLevel?: TeamAccessLevel;
  areaId: AreaId | null;
  specialties: string[];
  licenseCode: string | null;
};

export class TeamApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "TeamApiError";
  }
}

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new TeamApiError("Sua sessão expirou. Faça login novamente.", 401);
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function request<T>(path: string, init?: RequestInit) {
  const authHeaders = await getAuthHeaders();
  let response: Response;

  try {
    response = await fetch(getInternalServiceUrl("team", path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new TeamApiError(
      "Serviço de gestão de equipe indisponível. Verifique se o conector interno está ativo.",
      503
    );
  }

  const raw = await response.text();
  let payload: Record<string, unknown> = {};

  if (raw) {
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new TeamApiError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const message = String(payload.error || "Falha ao comunicar com o serviço de equipe.");
    if (message === "Sessão inválida." || message === "Sessão do Supabase inválida.") {
      throw new TeamApiError("Sua sessão expirou. Faça login novamente.", 401);
    }

    throw new TeamApiError(
      message,
      response.status
    );
  }

  return payload as T;
}

export function getClinicTeamManagement(clinicId: string) {
  return request<TeamManagementPayload>(`/clinics/${encodeURIComponent(clinicId)}/members`);
}

export async function createClinicTeamMember(clinicId: string, input: TeamMemberInput) {
  const payload = await request<{ member: TeamMember }>(`/clinics/${encodeURIComponent(clinicId)}/members`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload.member;
}

export async function updateClinicTeamMember(
  clinicId: string,
  memberId: string,
  input: TeamMemberUpdateInput
) {
  const payload = await request<{ member: TeamMember }>(
    `/clinics/${encodeURIComponent(clinicId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    }
  );

  return payload.member;
}

export function getClinicPlanOptions(clinicId: string) {
  return request<TeamPlanOptionsPayload>(`/clinics/${encodeURIComponent(clinicId)}/plans`);
}

export async function updateClinicPlan(clinicId: string, planId: string) {
  const payload = await request<{ currentPlanName: string; plan: TeamPlanOption }>(
    `/clinics/${encodeURIComponent(clinicId)}/plan`,
    {
      method: "PATCH",
      body: JSON.stringify({ planId }),
    }
  );

  return payload;
}
