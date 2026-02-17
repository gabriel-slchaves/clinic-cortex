import { supabase } from "@/lib/supabase";

type ClinicProgressRow = {
  id: string;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
};

function readLocalClinicId() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem("cc_clinic_id") || "").trim();
  } catch {
    return "";
  }
}

function writeLocalClinicId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("cc_clinic_id", id);
  } catch {
    // ignore
  }
}

export type EntryDecision = {
  clinicId: string | null;
  onboardingDone: boolean;
  onboardingStep: number;
  target: string;
};

export async function resolveUserEntry(userId: string): Promise<EntryDecision> {
  const loadClinic = async (cid: string) => {
    const { data, error } = await supabase
      .from("clinics")
      .select("id,onboarding_step,onboarding_completed_at")
      .eq("id", cid)
      .limit(1)
      .maybeSingle();
    return { clinic: (data as any as ClinicProgressRow | null) || null, error };
  };

  // Prefer a stable clinic id (resume + less queries), fallback to the user's active membership.
  // If the user belongs to multiple clinics, prefer the owner membership; otherwise use the newest one.
  let clinicId = readLocalClinicId();
  let clinic: ClinicProgressRow | null = null;

  if (clinicId) {
    const res = await loadClinic(clinicId);
    if (!res.error && res.clinic?.id) {
      clinic = res.clinic;
    } else {
      clinicId = "";
    }
  }

  if (!clinicId) {
    const { data: memberships, error: memberErr } = await supabase
      .from("clinic_members")
      .select("clinic_id,role,created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (memberErr) throw memberErr;

    const preferredMembership =
      ((memberships as any[]) || []).find((row) => String(row?.role || "").trim().toLowerCase() === "owner") ||
      ((memberships as any[]) || [])[0] ||
      null;

    clinicId = String((preferredMembership as any)?.clinic_id || "").trim();
    if (!clinicId) {
      return {
        clinicId: null,
        onboardingDone: false,
        onboardingStep: 1,
        target: "/onboarding/1",
      };
    }

    const res = await loadClinic(clinicId);
    if (res.error) throw res.error;
    clinic = res.clinic;
  }

  if (!clinic?.id) {
    return {
      clinicId: null,
      onboardingDone: false,
      onboardingStep: 1,
      target: "/onboarding/1",
    };
  }

  writeLocalClinicId(clinic.id);

  const done = Boolean(clinic.onboarding_completed_at);
  if (done) {
    return {
      clinicId: clinic.id,
      onboardingDone: true,
      onboardingStep: 7,
      target: "/dashboard",
    };
  }

  const stepRaw = Number(clinic.onboarding_step || 1);
  const step = Number.isFinite(stepRaw) && stepRaw > 0 ? Math.min(7, stepRaw) : 1;

  return {
    clinicId: clinic.id,
    onboardingDone: false,
    onboardingStep: step,
    target: `/onboarding/${step}`,
  };
}
