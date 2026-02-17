import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { type AreaId } from "@/lib/clinicAreas";
import { entryGateQueryOptions, type AppViewerIdentity } from "@/hooks/useAppEntryGate";
import {
  buildOperationHours,
  OPERATING_DAYS as DAYS,
  type DayId,
  type OperationHours,
} from "@/lib/operatingHours";
import { supabase } from "@/lib/supabase";
import {
  getClinicPlanOptions,
  getClinicTeamManagement,
  type TeamMember,
  type TeamPlanSummary,
} from "@/lib/teamApi";
import { useMemo } from "react";

export type PlanOption = {
  id: string;
  name: string;
  price_brl: number;
  max_doctors: number;
  max_secretaries: number;
  max_patients: number;
};

const DEFAULT_PLAN_OPTIONS: PlanOption[] = [
  {
    id: "essencial",
    name: "essencial",
    price_brl: 397,
    max_doctors: 1,
    max_secretaries: 0,
    max_patients: 500,
  },
  {
    id: "professional",
    name: "professional",
    price_brl: 697,
    max_doctors: 5,
    max_secretaries: 1,
    max_patients: -1,
  },
];

type ViewerMembershipSnapshot = {
  id: string | null;
  role: string;
  isAdmin: boolean;
  createdAt: string | null;
};

type ViewerIdentity = AppViewerIdentity;

type ClinicBaseData = {
  id: string;
  clinicName: string;
  desiredPlanName: string;
  desiredPlanKey: string;
  onboardingCompletedAt: string | null;
  clinicAreaId: AreaId | null;
  clinicAssistantSpecialties: string[];
  operationHours: OperationHours;
};

type SubscriptionRow = {
  status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  plan_id: string | null;
  created_at: string | null;
};

type TeamQueryData = {
  rows: TeamMember[];
  plan: TeamPlanSummary | null;
  canManage: boolean;
  notice: string | null;
  error: string | null;
};

type SettingsPageData = {
  clinicId: string;
  clinicName: string;
  clinicAreaId: AreaId | null;
  clinicAssistantSpecialties: string[];
  operationHours: OperationHours;
  desiredPlanKey: string;
  planOptions: PlanOption[];
  memberRole: string;
  memberIsAdmin: boolean;
  canManagePlan: boolean;
  managePlanHint: string;
  planBackedBySubscription: boolean;
  subscriptionPlanName: string;
  subscriptionStatus: string;
  subscriptionSummary: string;
  monthlyPatientsValue: string;
  monthlyPatientsMeta: string;
  monthlyPatientsProgress: number | null;
  monthlyPatientsUnlimited: boolean;
  teamRows: TeamMember[];
  teamPlan: TeamPlanSummary | null;
  teamCanManage: boolean;
  teamError: string | null;
  teamNotice: string | null;
};

function isSchemaMissingError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  if (code === "42703") return true;
  if (code === "42P01") return true;
  if (code === "PGRST204") return true;
  const msg = String(e?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

function safeNumber(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function addDays(value: string | null | undefined, amount: number) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + amount);
  return date.toISOString();
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isFutureDate(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= Date.now();
}

function normalizePlanKey(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "essential") return "essencial";
  return normalized;
}

function toPlanLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const plan = normalizePlanKey(raw);
  if (plan === "professional") return "Plano Professional";
  if (plan === "essencial" || plan === "essential") return "Plano Essencial";
  if (!raw) return "Plano não definido";
  if (/^plano\s+/i.test(raw)) return raw;
  return `Plano ${raw}`;
}

function resolveTrialEndsAt({
  trialEndsAt,
  onboardingCompletedAt,
}: {
  trialEndsAt?: string | null;
  onboardingCompletedAt?: string | null;
}) {
  if (formatShortDate(trialEndsAt)) return trialEndsAt || null;
  return addDays(onboardingCompletedAt, 14);
}

function isCancelledSubscriptionStatus(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "canceled" || normalized === "cancelled";
}

function isInactiveSubscriptionStatus(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();
  return [
    "canceled",
    "cancelled",
    "past_due",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ].includes(normalized);
}

function toSubscriptionStatusLabel({
  status,
  trialEndsAt,
  onboardingCompletedAt,
}: {
  status?: string | null;
  trialEndsAt?: string | null;
  onboardingCompletedAt?: string | null;
}) {
  const normalized = String(status || "").trim().toLowerCase();
  const effectiveTrialEndsAt = resolveTrialEndsAt({ trialEndsAt, onboardingCompletedAt });

  if (normalized === "active") return "Ativo";
  if (normalized === "trialing" && isFutureDate(effectiveTrialEndsAt)) return "Trial";
  if (isInactiveSubscriptionStatus(normalized)) return "Inativo";
  if (isFutureDate(effectiveTrialEndsAt)) return "Trial";
  return "Inativo";
}

function buildSubscriptionSummary({
  status,
  trialEndsAt,
  currentPeriodEnd,
  cancelledAt,
  onboardingCompletedAt,
}: {
  status?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  cancelledAt?: string | null;
  onboardingCompletedAt?: string | null;
}) {
  const effectiveTrialEndsAt = resolveTrialEndsAt({ trialEndsAt, onboardingCompletedAt });
  const trialDate = formatShortDate(effectiveTrialEndsAt);
  if (trialDate && isFutureDate(effectiveTrialEndsAt)) return `Seu trial expira em ${trialDate}.`;
  if (trialDate) return `Seu trial expirou em ${trialDate}.`;

  const billingDate = formatShortDate(currentPeriodEnd);
  if (billingDate) return `Seu ciclo atual vai até ${billingDate}.`;

  const cancelledDate = formatShortDate(cancelledAt);
  if (cancelledDate) return `Assinatura cancelada em ${cancelledDate}.`;

  if (isCancelledSubscriptionStatus(status)) return "Assinatura cancelada.";
  if (isInactiveSubscriptionStatus(status)) return "Assinatura inativa no momento.";

  return "";
}

function resolvePlanSeatLimits(planKey: string | null | undefined, plans: PlanOption[]) {
  const normalized = normalizePlanKey(planKey) || "professional";
  const row =
    plans.find((plan) => normalizePlanKey(plan.name) === normalized) ||
    plans.find((plan) => normalizePlanKey(plan.name) === "professional") ||
    null;

  return {
    name: String(row?.name || normalized),
    maxDoctors:
      typeof row?.max_doctors === "number"
        ? row.max_doctors
        : normalized === "essencial"
          ? 1
          : 5,
    maxSecretaries:
      typeof row?.max_secretaries === "number"
        ? row.max_secretaries
        : normalized === "essencial"
          ? 0
          : 1,
  };
}

function resolvePlanOption({
  planId,
  planKey,
  plans,
}: {
  planId?: string | null;
  planKey?: string | null;
  plans: PlanOption[];
}): PlanOption {
  const normalized = normalizePlanKey(planKey) || "professional";
  const normalizedPlanId = String(planId || "").trim();

  const row =
    (normalizedPlanId ? plans.find((plan) => String(plan.id || "").trim() === normalizedPlanId) : null) ||
    plans.find((plan) => normalizePlanKey(plan.name) === normalized) ||
    plans.find((plan) => normalizePlanKey(plan.name) === "professional") ||
    null;

  if (row) return row;

  return {
    id: normalizedPlanId || normalized,
    name: normalized,
    price_brl: normalized === "essencial" ? 397 : 697,
    max_doctors: normalized === "essencial" ? 1 : 5,
    max_secretaries: normalized === "essencial" ? 0 : 1,
    max_patients: normalized === "essencial" ? 500 : -1,
  };
}

async function countRows({
  table,
  clinicId,
  where,
}: {
  table: string;
  clinicId: string;
  where?: (query: any) => any;
}) {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("clinic_id", clinicId);
  if (where) query = where(query);
  const { count, error } = await query;
  if (error) throw error;
  return safeNumber(count);
}

function buildOperationHoursFromClinic(data: Record<string, any>) {
  const op = data?.operation_days as DayId[] | null | undefined;
  const validDays =
    Array.isArray(op) && op.length
      ? op.filter((d) => DAYS.some((x) => x.id === d))
      : (["mon", "tue", "wed", "thu", "fri"] as DayId[]);

  const startDb =
    typeof data?.shift_morning_start === "string" ? String(data.shift_morning_start).slice(0, 5) : "08:00";

  const endDb = (() => {
    const aEnabled = data?.shift_afternoon_enabled;
    const aEnd = data?.shift_afternoon_end;
    const mEnd = data?.shift_morning_end;
    if (aEnabled === true && typeof aEnd === "string") return String(aEnd).slice(0, 5);
    if (typeof mEnd === "string") return String(mEnd).slice(0, 5);
    return "18:00";
  })();

  const base = buildOperationHours({ enabledDays: validDays, start: startDb, end: endDb });

  const intervalEnabledDb = data?.shift_afternoon_enabled === true;
  if (intervalEnabledDb) {
    const breakStart =
      typeof data?.shift_morning_end === "string" ? String(data.shift_morning_end).slice(0, 5) : "12:00";
    const breakEnd =
      typeof data?.shift_afternoon_start === "string" ? String(data.shift_afternoon_start).slice(0, 5) : "13:30";

    for (const day of DAYS) {
      if (!base[day.id].enabled) continue;
      base[day.id] = {
        ...base[day.id],
        break_enabled: true,
        break_start: breakStart,
        break_end: breakEnd,
      };
    }
  }

  const rawHours = data?.operation_hours;
  if (rawHours && typeof rawHours === "object") {
    for (const day of DAYS) {
      const row = (rawHours as any)[day.id];
      if (!row || typeof row !== "object") continue;
      base[day.id] = {
        ...base[day.id],
        enabled: typeof row.enabled === "boolean" ? Boolean(row.enabled) : base[day.id].enabled,
        start: typeof row.start === "string" ? String(row.start).slice(0, 5) : base[day.id].start,
        end: typeof row.end === "string" ? String(row.end).slice(0, 5) : base[day.id].end,
        break_enabled:
          typeof row.break_enabled === "boolean" ? Boolean(row.break_enabled) : base[day.id].break_enabled,
        break_start:
          typeof row.break_start === "string" ? String(row.break_start).slice(0, 5) : base[day.id].break_start,
        break_end:
          typeof row.break_end === "string" ? String(row.break_end).slice(0, 5) : base[day.id].break_end,
      };
    }
  }

  return base;
}

function buildFallbackTeamState({
  desiredPlanKey,
  viewer,
  viewerMembership,
  availablePlans,
  fallbackAreaId,
  fallbackSpecialties,
}: {
  desiredPlanKey: string;
  viewer: ViewerIdentity;
  viewerMembership: ViewerMembershipSnapshot | null;
  availablePlans: PlanOption[];
  fallbackAreaId: AreaId | null;
  fallbackSpecialties: string[];
}): TeamQueryData | null {
  if (!viewerMembership) return null;

  const accessLevel =
    viewerMembership.role === "owner"
      ? "owner"
      : viewerMembership.role === "secretary"
        ? "secretary"
        : viewerMembership.isAdmin
          ? "doctor_admin"
          : "doctor";
  const memberKind = accessLevel === "secretary" ? "secretary" : "doctor";
  const limits = resolvePlanSeatLimits(desiredPlanKey, availablePlans);
  const displayName =
    String(viewer.fullName || "").trim() ||
    String(viewer.email || "").trim().split("@")[0] ||
    "Admin da clínica";

  const ownerRow: TeamMember = {
    id: viewerMembership.id || viewer.userId,
    userId: viewer.userId,
    fullName: displayName,
    email: String(viewer.email || "").trim().toLowerCase(),
    avatarUrl: null,
    accessLevel: accessLevel as TeamMember["accessLevel"],
    memberKind,
    areaId: fallbackAreaId,
    specialties: memberKind === "doctor" ? fallbackSpecialties : [],
    licenseCode: null,
    accountStatus: "active",
    createdAt: viewerMembership.createdAt || new Date().toISOString(),
    isAdmin: viewerMembership.isAdmin,
    isOwner: viewerMembership.role === "owner",
  };

  const usedDoctors = memberKind === "doctor" ? 1 : 0;
  const usedSecretaries = memberKind === "secretary" ? 1 : 0;

  return {
    rows: [ownerRow],
    plan: {
      name: limits.name,
      maxDoctors: limits.maxDoctors,
      maxSecretaries: limits.maxSecretaries,
      usedDoctors,
      usedSecretaries,
      remainingDoctors: limits.maxDoctors < 0 ? -1 : Math.max(0, limits.maxDoctors - usedDoctors),
      remainingSecretaries:
        limits.maxSecretaries < 0 ? -1 : Math.max(0, limits.maxSecretaries - usedSecretaries),
    } satisfies TeamPlanSummary,
    canManage: viewerMembership.role === "owner",
    notice: null,
    error: null,
  };
}

async function fetchClinicBase(clinicId: string): Promise<ClinicBaseData> {
  const selectBase =
    "id,name,desired_plan,onboarding_completed_at,assistant_area,assistant_specialties,operation_days,shift_morning_start,shift_morning_end,shift_afternoon_enabled,shift_afternoon_start,shift_afternoon_end";

  let res = await supabase
    .from("clinics")
    .select(`${selectBase},operation_hours`)
    .eq("id", clinicId)
    .limit(1)
    .maybeSingle();

  if (res.error && isSchemaMissingError(res.error)) {
    res = await supabase.from("clinics").select(selectBase).eq("id", clinicId).limit(1).maybeSingle();
  }

  if (res.error) throw res.error;

  const data = (res.data as any) || null;
  if (!data?.id) throw new Error("Clinic not found");

  return {
    id: String(data.id),
    clinicName: String(data.name || "").trim(),
    desiredPlanName: String(data.desired_plan || "").trim(),
    desiredPlanKey: normalizePlanKey(data.desired_plan),
    onboardingCompletedAt:
      typeof data.onboarding_completed_at === "string" ? String(data.onboarding_completed_at) : null,
    clinicAreaId: (String(data.assistant_area || "").trim() || null) as AreaId | null,
    clinicAssistantSpecialties: Array.isArray(data.assistant_specialties)
      ? (data.assistant_specialties as string[]).filter(Boolean)
      : [],
    operationHours: buildOperationHoursFromClinic(data),
  };
}

async function fetchMembership(clinicId: string, userId: string): Promise<ViewerMembershipSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from("clinic_members")
      .select("id,role,is_admin,created_at")
      .eq("clinic_id", clinicId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: String((data as any)?.id || "").trim() || null,
      role: String((data as any)?.role || "").trim().toLowerCase(),
      isAdmin: Boolean((data as any)?.is_admin),
      createdAt: String((data as any)?.created_at || "").trim() || null,
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[useSettingsPageData] membership load error:", error);
    }
    return null;
  }
}

async function fetchPlans(clinicId: string): Promise<PlanOption[]> {
  if (!clinicId) return DEFAULT_PLAN_OPTIONS;

  try {
    const payload = await getClinicPlanOptions(clinicId);
    const plans = ((payload.plans || []) as PlanOption[]).filter((plan) => String(plan.name || "").trim());
    return plans.length ? plans : DEFAULT_PLAN_OPTIONS;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[useSettingsPageData] plans load error:", error);
    }
    return DEFAULT_PLAN_OPTIONS;
  }
}

async function fetchSubscription(clinicId: string): Promise<SubscriptionRow | null> {
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("status,trial_ends_at,current_period_end,cancelled_at,plan_id,created_at")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return (data as SubscriptionRow | null) || null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[useSettingsPageData] subscription load error:", error);
    }
    return null;
  }
}

async function fetchPatientCount(clinicId: string): Promise<number | null> {
  try {
    return await countRows({
      table: "patients",
      clinicId,
      where: (query) => query.is("deleted_at", null),
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[useSettingsPageData] patient count load error:", error);
    }
    return null;
  }
}

async function fetchTeam({
  clinicId,
  viewer,
  viewerMembership,
  availablePlans,
  desiredPlanKey,
  fallbackAreaId,
  fallbackSpecialties,
}: {
  clinicId: string;
  viewer: ViewerIdentity;
  viewerMembership: ViewerMembershipSnapshot | null;
  availablePlans: PlanOption[];
  desiredPlanKey: string;
  fallbackAreaId: AreaId | null;
  fallbackSpecialties: string[];
}): Promise<TeamQueryData> {
  try {
    const payload = await getClinicTeamManagement(clinicId);
    return {
      rows: payload.members || [],
      plan: payload.plan || null,
      canManage: Boolean(payload.permissions?.canManage),
      notice: null,
      error: null,
    } satisfies TeamQueryData;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[useSettingsPageData] team load error:", error);
    }

    const fallback = buildFallbackTeamState({
      desiredPlanKey,
      viewer,
      viewerMembership,
      availablePlans,
      fallbackAreaId,
      fallbackSpecialties,
    });

    if (fallback) return fallback;

    return {
      rows: [],
      plan: null,
      canManage: false,
      notice: null,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a gestão de equipe agora. Verifique se o serviço interno está ativo.",
    };
  }
}

export const settingsQueryKeys = {
  clinicBase: (clinicId: string) => ["settings", "clinicBase", clinicId] as const,
  membership: (clinicId: string, userId: string) => ["settings", "membership", clinicId, userId] as const,
  plans: (clinicId: string) => ["settings", "plans", clinicId] as const,
  subscription: (clinicId: string) => ["settings", "subscription", clinicId] as const,
  patientCount: (clinicId: string) => ["settings", "patientCount", clinicId] as const,
  team: (clinicId: string) => ["settings", "team", clinicId] as const,
};

export function settingsClinicBaseQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: settingsQueryKeys.clinicBase(clinicId),
    queryFn: () => fetchClinicBase(clinicId),
    staleTime: 5 * 60 * 1000,
  });
}

export function settingsMembershipQueryOptions(clinicId: string, userId: string) {
  return queryOptions({
    queryKey: settingsQueryKeys.membership(clinicId, userId),
    queryFn: () => fetchMembership(clinicId, userId),
    staleTime: 5 * 60 * 1000,
  });
}

export function settingsPlansQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: settingsQueryKeys.plans(clinicId),
    queryFn: () => fetchPlans(clinicId),
    staleTime: 30 * 60 * 1000,
  });
}

export function settingsSubscriptionQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: settingsQueryKeys.subscription(clinicId),
    queryFn: () => fetchSubscription(clinicId),
    staleTime: 60 * 1000,
  });
}

export function settingsPatientCountQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: settingsQueryKeys.patientCount(clinicId),
    queryFn: () => fetchPatientCount(clinicId),
    staleTime: 60 * 1000,
  });
}

export function settingsTeamQueryOptions(args: {
  clinicId: string;
  viewer: ViewerIdentity;
  viewerMembership: ViewerMembershipSnapshot | null;
  availablePlans: PlanOption[];
  desiredPlanKey: string;
  fallbackAreaId: AreaId | null;
  fallbackSpecialties: string[];
}) {
  return queryOptions({
    queryKey: settingsQueryKeys.team(args.clinicId),
    queryFn: () => fetchTeam(args),
    staleTime: 60 * 1000,
  });
}

export async function prefetchSettingsPageData({
  queryClient,
  viewer,
}: {
  queryClient: QueryClient;
  viewer: ViewerIdentity | null;
}) {
  if (!viewer?.userId) return;

  const entry = await queryClient.ensureQueryData(entryGateQueryOptions(viewer.userId));
  const clinicId = String(entry?.clinicId || "").trim();
  if (!clinicId) return;

  const [clinicBase, plans, membership] = await Promise.all([
    queryClient.ensureQueryData(settingsClinicBaseQueryOptions(clinicId)),
    queryClient.ensureQueryData(settingsPlansQueryOptions(clinicId)),
    queryClient.ensureQueryData(settingsMembershipQueryOptions(clinicId, viewer.userId)),
    queryClient.ensureQueryData(settingsSubscriptionQueryOptions(clinicId)),
    queryClient.ensureQueryData(settingsPatientCountQueryOptions(clinicId)),
  ]);

  await queryClient.prefetchQuery(
    settingsTeamQueryOptions({
      clinicId,
      viewer,
      viewerMembership: membership,
      availablePlans: plans,
      desiredPlanKey: clinicBase.desiredPlanKey,
      fallbackAreaId: clinicBase.clinicAreaId,
      fallbackSpecialties: clinicBase.clinicAssistantSpecialties,
    })
  );
}

export function useSettingsPageData({
  userId,
  viewerEmail,
  viewerFullName,
}: {
  userId: string | null;
  viewerEmail: string;
  viewerFullName: string | null;
}) {
  const viewer = useMemo(
    () =>
      userId
        ? {
            userId,
            email: String(viewerEmail || "").trim(),
            fullName: viewerFullName,
          }
        : null,
    [userId, viewerEmail, viewerFullName]
  );

  const entryQuery = useQuery({
    ...entryGateQueryOptions(userId || ""),
    enabled: Boolean(userId),
  });

  const clinicId = String(entryQuery.data?.clinicId || "").trim() || null;

  const clinicBaseQuery = useQuery({
    ...settingsClinicBaseQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const plansQuery = useQuery({
    ...settingsPlansQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId && userId),
  });

  const membershipQuery = useQuery({
    ...settingsMembershipQueryOptions(clinicId || "", userId || ""),
    enabled: Boolean(clinicId && userId),
  });

  const subscriptionQuery = useQuery({
    ...settingsSubscriptionQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const patientCountQuery = useQuery({
    ...settingsPatientCountQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const teamQuery = useQuery({
    ...settingsTeamQueryOptions({
      clinicId: clinicId || "",
      viewer: viewer || { userId: "", email: "", fullName: null },
      viewerMembership: membershipQuery.data ?? null,
      availablePlans: plansQuery.data ?? [],
      desiredPlanKey: clinicBaseQuery.data?.desiredPlanKey || "",
      fallbackAreaId: clinicBaseQuery.data?.clinicAreaId ?? null,
      fallbackSpecialties: clinicBaseQuery.data?.clinicAssistantSpecialties ?? [],
    }),
    enabled:
      Boolean(clinicId && viewer) &&
      clinicBaseQuery.isSuccess &&
      plansQuery.isSuccess &&
      membershipQuery.fetchStatus !== "fetching",
  });

  const data = useMemo<SettingsPageData | null>(() => {
    if (!clinicId || !clinicBaseQuery.data) return null;

    const clinicBase = clinicBaseQuery.data;
    const planOptions = plansQuery.data ?? [];
    const membership = membershipQuery.data;
    const subscription = subscriptionQuery.data;
    const patientCount = patientCountQuery.data;
    const activePlan = resolvePlanOption({
      planId: subscription?.plan_id,
      planKey: clinicBase.desiredPlanName,
      plans: planOptions,
    });
    const desiredPlanKey = clinicBase.desiredPlanKey || normalizePlanKey(activePlan?.name);

    const subscriptionPlanName = activePlan?.name
      ? toPlanLabel(activePlan.name)
      : toPlanLabel(clinicBase.desiredPlanName);
    const subscriptionStatus = toSubscriptionStatusLabel({
      status: subscription?.status,
      trialEndsAt: subscription?.trial_ends_at,
      onboardingCompletedAt: clinicBase.onboardingCompletedAt,
    });
    const subscriptionSummary = buildSubscriptionSummary({
      status: subscription?.status,
      trialEndsAt: subscription?.trial_ends_at,
      currentPeriodEnd: subscription?.current_period_end,
      cancelledAt: subscription?.cancelled_at,
      onboardingCompletedAt: clinicBase.onboardingCompletedAt,
    });

    let monthlyPatientsValue = "";
    let monthlyPatientsMeta = "";
    let monthlyPatientsProgress: number | null = null;
    let monthlyPatientsUnlimited = false;

    if (patientCount != null) {
      const maxPatients = safeNumber(activePlan?.max_patients);
      const patientBaseLabel =
        patientCount === 1
          ? "1 paciente cadastrado na base atual."
          : `${patientCount} pacientes cadastrados na base atual.`;

      if (maxPatients > 0) {
        monthlyPatientsValue = `${patientCount}/${maxPatients}`;
        monthlyPatientsMeta = `${patientBaseLabel} Limite do plano: ${maxPatients} pacientes.`;
        monthlyPatientsProgress = patientCount > 0 ? (patientCount / maxPatients) * 100 : 0;
      } else if (maxPatients < 0) {
        monthlyPatientsValue = `${patientCount}/∞`;
        monthlyPatientsMeta = `${patientBaseLabel} Este plano permite pacientes ilimitados.`;
        monthlyPatientsUnlimited = true;
      } else {
        monthlyPatientsValue = String(patientCount);
        monthlyPatientsMeta = patientBaseLabel;
      }
    }

    const memberRole = String(membership?.role || "").trim().toLowerCase();
    const memberIsAdmin = Boolean(membership?.isAdmin);
    const canManagePlan = memberIsAdmin || memberRole === "owner";
    const managePlanHint = canManagePlan
      ? ""
      : "Somente o administrador da clínica pode alterar o plano. Fale com o responsável da conta.";
    const team = teamQuery.data || {
      rows: [],
      plan: null,
      canManage: false,
      error: null,
      notice: null,
    };

    return {
      clinicId,
      clinicName: clinicBase.clinicName,
      clinicAreaId: clinicBase.clinicAreaId,
      clinicAssistantSpecialties: clinicBase.clinicAssistantSpecialties,
      operationHours: clinicBase.operationHours,
      desiredPlanKey,
      planOptions,
      memberRole,
      memberIsAdmin,
      canManagePlan,
      managePlanHint,
      planBackedBySubscription: Boolean(subscription),
      subscriptionPlanName,
      subscriptionStatus,
      subscriptionSummary,
      monthlyPatientsValue,
      monthlyPatientsMeta,
      monthlyPatientsProgress,
      monthlyPatientsUnlimited,
      teamRows: team.rows,
      teamPlan: team.plan,
      teamCanManage: team.canManage,
      teamError: team.error,
      teamNotice: team.notice,
    };
  }, [
    clinicId,
    clinicBaseQuery.data,
    membershipQuery.data,
    patientCountQuery.data,
    plansQuery.data,
    subscriptionQuery.data,
    teamQuery.data,
  ]);

  const loadError = useMemo(() => {
    if (entryQuery.error) return "Não foi possível carregar sua conta. Tente novamente.";
    if (entryQuery.isSuccess && !clinicId) return "Nenhuma clínica vinculada à sua conta.";
    if (clinicBaseQuery.error) return "Não foi possível carregar suas configurações agora. Tente novamente.";
    return null;
  }, [clinicBaseQuery.error, clinicId, entryQuery.error, entryQuery.isSuccess]);

  const isInitialLoading =
    Boolean(userId) &&
    (entryQuery.isLoading || (Boolean(clinicId) && clinicBaseQuery.isLoading && !clinicBaseQuery.data));

  const isRefreshing =
    entryQuery.isFetching ||
    clinicBaseQuery.isFetching ||
    plansQuery.isFetching ||
    membershipQuery.isFetching ||
    subscriptionQuery.isFetching ||
    patientCountQuery.isFetching ||
    teamQuery.isFetching;

  const hasPlansLoaded = Array.isArray(plansQuery.data) && plansQuery.data.length > 0;
  const hasTeamLoaded = Boolean(teamQuery.data);

  return {
    clinicId,
    data,
    loadError,
    isInitialLoading,
    isRefreshing,
    plansLoading: plansQuery.isLoading && !hasPlansLoaded,
    teamLoading: teamQuery.isLoading && !hasTeamLoaded,
    plansRefetch: plansQuery.refetch,
  };
}
