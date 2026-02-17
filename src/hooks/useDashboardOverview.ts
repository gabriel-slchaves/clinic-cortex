import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { ensureClinicIdForViewer, entryGateQueryOptions } from "@/hooks/useAppEntryGate";
import { supabase } from "@/lib/supabase";
import { useMemo } from "react";

type DayId = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type OperationHours = {
  enabled?: boolean | null;
  start?: string | null;
  end?: string | null;
  break_enabled?: boolean | null;
  break_start?: string | null;
  break_end?: string | null;
};

type ClinicRow = {
  id: string;
  name: string | null;
  slug: string | null;
  operation_days: DayId[] | null;
  operation_hours: Record<DayId, OperationHours> | null;
  shift_morning_start: string | null;
  shift_morning_end: string | null;
  shift_afternoon_enabled: boolean | null;
  shift_afternoon_start: string | null;
  shift_afternoon_end: string | null;
};

type ServiceRow = {
  id: string;
  mode: string;
  duration_minutes: number;
  price_brl: number | null;
};

type TeamRow = {
  id: string;
  role: string;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

type PatientBirthdayRow = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
};

type AppointmentRow = {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string | null;
};

type CancellationEventRow = AppointmentRow & {
  status_changed_at?: string | null;
  updated_at?: string | null;
};

type DashboardMetricsData = {
  totalPatients: number;
  patientsWithPhone: number;
  newPatients30d: number;
  prevPatients30d: number;
  evolution: { month: string; patients: number }[];
};

export type DashboardScheduleBlock = {
  start: string;
  end: string;
  kind: "atendimento" | "intervalo";
  label: string;
};

export type DashboardBirthday = {
  id: string;
  name: string;
  birthDate: string;
  nextBirthday: string;
  daysUntil: number;
};

export type DashboardAppointment = {
  id: string;
  patientId: string | null;
  patientName: string | null;
  startsAt: string;
  endsAt: string | null;
  status: string | null;
};

export type DashboardNoReturnPatient = {
  id: string;
  name: string;
  lastVisitAt: string;
  daysSince: number;
};

export type DashboardOperations = {
  slotMinutes: number;
  today: { total: number; booked: number; free: number };
  week: { total: number; booked: number; free: number };
  weekdays: Array<{ dayId: DayId; label: string; date: string; total: number; booked: number; free: number }>;
};

export type DashboardOverviewData = {
  clinic: Pick<ClinicRow, "id" | "name" | "slug"> | null;
  scheduleToday: { dayId: DayId; blocks: DashboardScheduleBlock[] } | null;
  operations: DashboardOperations;
  appointmentsToday: DashboardAppointment[];
  activityToday: DashboardAppointment[];
  cancellationsLost7d: DashboardAppointment[];
  pendingConfirmationsTomorrow: DashboardAppointment[];
  birthdaysWeek: DashboardBirthday[];
  noReturn30d: DashboardNoReturnPatient[];
  kpis: {
    totalPatients: number;
    patientsWithPhone: number;
    totalServices: number;
    servicesInPerson: number;
    servicesOnline: number;
    servicesWithoutPrice: number;
    avgServicePriceBrl: number | null;
    avgServiceDurationMinutes: number | null;
    teamMembers: number;
    owners: number;
    newPatients30d: number;
    newPatientsGrowthPct30d: number | null;
  };
  patientEvolution: { month: string; patients: number }[];
  team: { id: string; name: string; avatarUrl: string | null; role: string; createdAt: string }[];
};

function capitalizeShortMonth(label: string) {
  const cleaned = String(label || "").trim().replace(/\.$/, "");
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}

function toDayId(date: Date): DayId {
  const map: DayId[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[date.getDay()] || "mon";
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(date: Date, months: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function startOfWeekMonday(date: Date) {
  const value = startOfDay(date);
  const diff = value.getDay() === 0 ? -6 : 1 - value.getDay();
  value.setDate(value.getDate() + diff);
  return value;
}

function isMissingSchemaError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  return code === "PGRST205" || code === "42P01" || code === "42703" || code === "PGRST204";
}

function toIso(date: Date) {
  return date.toISOString();
}

function safeNumber(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function timeToMinutes(value: string) {
  if (!isTime(value)) return null;
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return Math.min(23, Math.max(0, hours)) * 60 + Math.min(59, Math.max(0, minutes));
}

function slotsFromBlocks(blocks: DashboardScheduleBlock[], slotMinutes: number) {
  const slot = Math.max(10, Math.round(slotMinutes));
  let total = 0;
  for (const block of blocks) {
    if (block.kind !== "atendimento") continue;
    const start = timeToMinutes(block.start);
    const end = timeToMinutes(block.end);
    if (start == null || end == null || end <= start) continue;
    total += Math.floor((end - start) / slot);
  }
  return total;
}

function normalizeServiceMode(value: unknown): "in_person" | "online" | "other" {
  const raw = String(value || "");
  if (raw === "online") return "online";
  if (raw === "in_person") return "in_person";
  return "other";
}

function buildScheduleBlocks(hours: OperationHours | null | undefined): DashboardScheduleBlock[] {
  if (hours?.enabled === false) return [];
  const start = String(hours?.start || "").slice(0, 5);
  const end = String(hours?.end || "").slice(0, 5);
  if (!start || !end) return [];

  const breakEnabled = Boolean(hours?.break_enabled);
  const breakStart = String(hours?.break_start || "").slice(0, 5);
  const breakEnd = String(hours?.break_end || "").slice(0, 5);

  if (!breakEnabled || !breakStart || !breakEnd) {
    return [{ start, end, kind: "atendimento", label: "Atendimento" }];
  }

  const blocks: DashboardScheduleBlock[] = [];
  if (start < breakStart) blocks.push({ start, end: breakStart, kind: "atendimento", label: "Atendimento" });
  if (breakStart < breakEnd) blocks.push({ start: breakStart, end: breakEnd, kind: "intervalo", label: "Intervalo" });
  if (breakEnd < end) blocks.push({ start: breakEnd, end, kind: "atendimento", label: "Atendimento" });
  return blocks.length ? blocks : [{ start, end, kind: "atendimento", label: "Atendimento" }];
}

function buildLegacyScheduleBlocks(clinic: ClinicRow | null): DashboardScheduleBlock[] {
  const start = String(clinic?.shift_morning_start || "").slice(0, 5);
  const end = String(clinic?.shift_morning_end || "").slice(0, 5);
  if (!start || !end) return [];

  const blocks: DashboardScheduleBlock[] = [{ start, end, kind: "atendimento", label: "Atendimento" }];
  if (clinic?.shift_afternoon_enabled) {
    const afternoonStart = String(clinic?.shift_afternoon_start || "").slice(0, 5);
    const afternoonEnd = String(clinic?.shift_afternoon_end || "").slice(0, 5);
    if (afternoonStart && afternoonEnd) {
      if (end < afternoonStart) {
        blocks.push({ start: end, end: afternoonStart, kind: "intervalo", label: "Intervalo" });
      }
      blocks.push({ start: afternoonStart, end: afternoonEnd, kind: "atendimento", label: "Atendimento" });
    }
  }
  return blocks;
}

async function countRows({
  table,
  clinicId,
  where,
}: {
  table: string;
  clinicId: string;
  where?: (q: any) => any;
}) {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("clinic_id", clinicId);
  if (where) query = where(query);
  const { count, error } = await query;
  if (error) throw error;
  return safeNumber(count);
}

async function loadBirthdayRows(clinicId: string) {
  const { data, error } = await supabase
    .from("patients")
    .select("id,full_name,birth_date")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .not("birth_date", "is", null)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingSchemaError(error)) return [] as PatientBirthdayRow[];
    throw error;
  }
  return (data as any as PatientBirthdayRow[]) || [];
}

async function loadAppointmentsRange({
  clinicId,
  start,
  end,
  order,
  limit,
}: {
  clinicId: string;
  start: string;
  end: string;
  order: "asc" | "desc";
  limit: number;
}) {
  const { data, error } = await supabase
    .from("appointments")
    .select("id,patient_id,patient_name,starts_at,ends_at,status")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .gte("starts_at", start)
    .lt("starts_at", end)
    .order("starts_at", { ascending: order === "asc" })
    .limit(limit);

  if (error) {
    if (isMissingSchemaError(error)) return [] as AppointmentRow[];
    throw error;
  }
  return (data as any as AppointmentRow[]) || [];
}

function normalizeAppointmentStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isCancelledStatus(status: string) {
  return status === "cancelled" || status === "canceled";
}

function isDoneStatus(status: string) {
  return status === "done" || status === "completed";
}

function isNoShowStatus(status: string) {
  return status === "no_show" || status === "missed";
}

function isConfirmedStatus(status: string) {
  return status === "confirmed";
}

async function loadRecentCancellations({
  clinicId,
  sinceIso,
}: {
  clinicId: string;
  sinceIso: string;
}) {
  const selectBase = "id,patient_id,patient_name,starts_at,ends_at,status";
  const statuses = ["cancelled", "canceled"];

  const run = async (timeColumn: "status_changed_at" | "updated_at" | "starts_at") => {
    const select = timeColumn === "starts_at" ? selectBase : `${selectBase},${timeColumn}`;
    const response = await supabase
      .from("appointments")
      .select(select)
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .in("status", statuses)
      .gte(timeColumn, sinceIso)
      .order(timeColumn, { ascending: false })
      .limit(200);
    return { data: (response.data as any as CancellationEventRow[]) || [], error: response.error };
  };

  let response = await run("status_changed_at");
  if (response.error && isMissingSchemaError(response.error)) response = await run("updated_at");
  if (response.error && isMissingSchemaError(response.error)) response = await run("starts_at");
  if (response.error) {
    if (isMissingSchemaError(response.error)) return [] as CancellationEventRow[];
    throw response.error;
  }
  return response.data;
}

async function loadFutureAppointmentsForPatients({
  clinicId,
  patientIds,
  startIso,
  endIso,
}: {
  clinicId: string;
  patientIds: string[];
  startIso: string;
  endIso: string;
}) {
  if (!patientIds.length) return [] as Array<{ patient_id: string | null; starts_at: string; status: string | null }>;

  const { data, error } = await supabase
    .from("appointments")
    .select("patient_id,starts_at,status")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .in("patient_id", patientIds)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .order("starts_at", { ascending: true })
    .limit(2000);

  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }
  return (data as any as Array<{ patient_id: string | null; starts_at: string; status: string | null }>) || [];
}

function friendlyDashboardError(error: unknown) {
  if (isMissingSchemaError(error)) {
    return "Seu banco ainda não está pronto para o dashboard. Finalize as migrations e tente novamente.";
  }
  return "Não foi possível carregar seus dados agora. Tente novamente.";
}

function buildDashboardWindow(now: Date) {
  const today = startOfDay(now);
  const weekStart = startOfWeekMonday(today);
  const weekEnd = addDays(weekStart, 7);
  const tomorrow = addDays(today, 1);
  return {
    now,
    today,
    dayId: toDayId(today),
    weekStart,
    weekEnd,
    weekStartIso: toIso(weekStart),
    weekEndIso: toIso(weekEnd),
    todayIso: toIso(today),
    nowIso: toIso(now),
    tomorrowStartIso: toIso(tomorrow),
    tomorrowEndIso: toIso(addDays(today, 2)),
    futureEndIso: toIso(addDays(today, 180)),
    cancelSinceIso: toIso(addDays(today, -7)),
    pastStartIso: toIso(addDays(today, -365)),
  };
}

async function fetchDashboardClinic(clinicId: string) {
  try {
    const { data, error } = await supabase
      .from("clinics")
      .select(
        "id,name,slug,operation_days,operation_hours,shift_morning_start,shift_morning_end,shift_afternoon_enabled,shift_afternoon_start,shift_afternoon_end"
      )
      .eq("id", clinicId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!(data as any)?.id) throw new Error("clinic_not_found");
    return (data as any as ClinicRow | null) || null;
  } catch (error) {
    throw new Error(friendlyDashboardError(error));
  }
}

async function fetchDashboardServices(clinicId: string) {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("id,mode,duration_minutes,price_brl")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as any as ServiceRow[]) || [];
  } catch (error) {
    throw new Error(friendlyDashboardError(error));
  }
}

async function fetchDashboardTeam(clinicId: string) {
  try {
    const { data, error } = await supabase
      .from("clinic_members")
      .select("id,role,created_at,profiles(full_name,avatar_url)")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as any as TeamRow[]) || [];
  } catch (error) {
    throw new Error(friendlyDashboardError(error));
  }
}

async function fetchDashboardMetrics(clinicId: string, now: Date): Promise<DashboardMetricsData> {
  try {
    const today = startOfDay(now);
    const start30 = addDays(today, -30);
    const start60 = addDays(today, -60);
    const evolutionStarts = Array.from({ length: 6 }, (_, index) => {
      const start = monthStart(addMonths(today, index - 5));
      return { start, end: monthStart(addMonths(start, 1)) };
    });

    const [totalPatients, patientsWithPhone, newPatients30d, prevPatients30d, ...evolutionCounts] = await Promise.all([
      countRows({ table: "patients", clinicId, where: (query) => query.is("deleted_at", null) }),
      countRows({
        table: "patients",
        clinicId,
        where: (query) => query.is("deleted_at", null).not("phone", "is", null).neq("phone", ""),
      }),
      countRows({
        table: "patients",
        clinicId,
        where: (query) => query.is("deleted_at", null).gte("created_at", toIso(start30)),
      }),
      countRows({
        table: "patients",
        clinicId,
        where: (query) => query.is("deleted_at", null).gte("created_at", toIso(start60)).lt("created_at", toIso(start30)),
      }),
      ...evolutionStarts.map(({ start, end }) =>
        countRows({
          table: "patients",
          clinicId,
          where: (query) => query.is("deleted_at", null).gte("created_at", toIso(start)).lt("created_at", toIso(end)),
        })
      ),
    ]);

    return {
      totalPatients,
      patientsWithPhone,
      newPatients30d,
      prevPatients30d,
      evolution: evolutionStarts.map(({ start }, index) => ({
        month: capitalizeShortMonth(new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(start)),
        patients: safeNumber(evolutionCounts[index]),
      })),
    };
  } catch (error) {
    throw new Error(friendlyDashboardError(error));
  }
}

async function fetchDashboardCancellationsLost(clinicId: string, now: Date) {
  try {
    const window = buildDashboardWindow(now);
    const cancellationRows = await loadRecentCancellations({ clinicId, sinceIso: window.cancelSinceIso });
    const byKey = new Map<string, { row: CancellationEventRow; eventAt: string }>();

    for (const row of cancellationRows) {
      const patientId = String(row.patient_id || "").trim();
      const patientName = String(row.patient_name || "").trim();
      const key = patientId ? `id:${patientId}` : patientName ? `name:${patientName.toLowerCase()}` : "";
      if (!key || byKey.has(key)) continue;
      byKey.set(key, { row, eventAt: String(row.status_changed_at || row.updated_at || row.starts_at || "") });
    }

    const patientIds = Array.from(byKey.keys())
      .filter((key) => key.startsWith("id:"))
      .map((key) => key.slice(3))
      .filter(Boolean);

    const futureRows = await loadFutureAppointmentsForPatients({
      clinicId,
      patientIds,
      startIso: window.nowIso,
      endIso: window.futureEndIso,
    });

    const rescheduled = new Set<string>();
    for (const row of futureRows) {
      const patientId = String(row.patient_id || "").trim();
      if (!patientId) continue;
      if (isCancelledStatus(normalizeAppointmentStatus(row.status || ""))) continue;
      rescheduled.add(patientId);
    }

    return Array.from(byKey.values())
      .filter(({ row }) => {
        const patientId = String(row.patient_id || "").trim();
        return !patientId || !rescheduled.has(patientId);
      })
      .sort((a, b) => b.eventAt.localeCompare(a.eventAt))
      .slice(0, 5)
      .map(({ row }) => ({
        id: String(row.id),
        patientId: row.patient_id ? String(row.patient_id) : null,
        patientName: row.patient_name ? String(row.patient_name) : null,
        startsAt: String(row.starts_at),
        endsAt: row.ends_at ? String(row.ends_at) : null,
        status: row.status ? String(row.status) : null,
      })) satisfies DashboardAppointment[];
  } catch (error) {
    throw new Error(friendlyDashboardError(error));
  }
}

export const dashboardQueryKeys = {
  clinic: (clinicId: string) => ["dashboard", "clinic", clinicId] as const,
  services: (clinicId: string) => ["dashboard", "services", clinicId] as const,
  team: (clinicId: string) => ["dashboard", "team", clinicId] as const,
  birthdays: (clinicId: string) => ["dashboard", "birthdays", clinicId] as const,
  appointmentsWeek: (clinicId: string, weekStartIso: string) => ["dashboard", "appointmentsWeek", clinicId, weekStartIso] as const,
  appointmentsPast: (clinicId: string, todayIso: string) => ["dashboard", "appointmentsPast", clinicId, todayIso] as const,
  appointmentsTomorrow: (clinicId: string, tomorrowStartIso: string) =>
    ["dashboard", "appointmentsTomorrow", clinicId, tomorrowStartIso] as const,
  metrics: (clinicId: string, monthAnchorIso: string) => ["dashboard", "metrics", clinicId, monthAnchorIso] as const,
  cancellationsLost: (clinicId: string, todayIso: string) => ["dashboard", "cancellationsLost", clinicId, todayIso] as const,
};

export function dashboardClinicQueryOptions(clinicId: string) {
  return queryOptions({ queryKey: dashboardQueryKeys.clinic(clinicId), queryFn: () => fetchDashboardClinic(clinicId), staleTime: 5 * 60 * 1000 });
}

export function dashboardServicesQueryOptions(clinicId: string) {
  return queryOptions({ queryKey: dashboardQueryKeys.services(clinicId), queryFn: () => fetchDashboardServices(clinicId), staleTime: 5 * 60 * 1000 });
}

export function dashboardTeamQueryOptions(clinicId: string) {
  return queryOptions({ queryKey: dashboardQueryKeys.team(clinicId), queryFn: () => fetchDashboardTeam(clinicId), staleTime: 60 * 1000 });
}

export function dashboardBirthdaysQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: dashboardQueryKeys.birthdays(clinicId),
    queryFn: async () => {
      try {
        return await loadBirthdayRows(clinicId);
      } catch (error) {
        throw new Error(friendlyDashboardError(error));
      }
    },
    staleTime: 60 * 1000,
  });
}

export function dashboardAppointmentsWeekQueryOptions(clinicId: string, now: Date) {
  const window = buildDashboardWindow(now);
  return queryOptions({
    queryKey: dashboardQueryKeys.appointmentsWeek(clinicId, window.weekStartIso),
    queryFn: async () => {
      try {
        return await loadAppointmentsRange({ clinicId, start: window.weekStartIso, end: window.weekEndIso, order: "asc", limit: 2000 });
      } catch (error) {
        throw new Error(friendlyDashboardError(error));
      }
    },
    staleTime: 60 * 1000,
  });
}

export function dashboardAppointmentsPastQueryOptions(clinicId: string, now: Date) {
  const window = buildDashboardWindow(now);
  return queryOptions({
    queryKey: dashboardQueryKeys.appointmentsPast(clinicId, window.todayIso),
    queryFn: async () => {
      try {
        return await loadAppointmentsRange({ clinicId, start: window.pastStartIso, end: window.nowIso, order: "desc", limit: 5000 });
      } catch (error) {
        throw new Error(friendlyDashboardError(error));
      }
    },
    staleTime: 60 * 1000,
  });
}

export function dashboardAppointmentsTomorrowQueryOptions(clinicId: string, now: Date) {
  const window = buildDashboardWindow(now);
  return queryOptions({
    queryKey: dashboardQueryKeys.appointmentsTomorrow(clinicId, window.tomorrowStartIso),
    queryFn: async () => {
      try {
        return await loadAppointmentsRange({ clinicId, start: window.tomorrowStartIso, end: window.tomorrowEndIso, order: "asc", limit: 2000 });
      } catch (error) {
        throw new Error(friendlyDashboardError(error));
      }
    },
    staleTime: 60 * 1000,
  });
}

export function dashboardMetricsQueryOptions(clinicId: string, now: Date) {
  return queryOptions({
    queryKey: dashboardQueryKeys.metrics(clinicId, toIso(monthStart(now))),
    queryFn: () => fetchDashboardMetrics(clinicId, now),
    staleTime: 60 * 1000,
  });
}

export function dashboardCancellationsLostQueryOptions(clinicId: string, now: Date) {
  const window = buildDashboardWindow(now);
  return queryOptions({
    queryKey: dashboardQueryKeys.cancellationsLost(clinicId, window.todayIso),
    queryFn: () => fetchDashboardCancellationsLost(clinicId, now),
    staleTime: 60 * 1000,
  });
}

export async function prefetchDashboardPageData({ queryClient, userId }: { queryClient: QueryClient; userId: string }) {
  const clinicId = await ensureClinicIdForViewer(queryClient, userId);
  if (!clinicId) return;
  const now = new Date();
  await Promise.all([
    queryClient.ensureQueryData(dashboardClinicQueryOptions(clinicId)),
    queryClient.ensureQueryData(dashboardServicesQueryOptions(clinicId)),
    queryClient.ensureQueryData(dashboardTeamQueryOptions(clinicId)),
    queryClient.ensureQueryData(dashboardBirthdaysQueryOptions(clinicId)),
    queryClient.ensureQueryData(dashboardAppointmentsWeekQueryOptions(clinicId, now)),
    queryClient.ensureQueryData(dashboardAppointmentsPastQueryOptions(clinicId, now)),
    queryClient.ensureQueryData(dashboardAppointmentsTomorrowQueryOptions(clinicId, now)),
    queryClient.ensureQueryData(dashboardMetricsQueryOptions(clinicId, now)),
    queryClient.ensureQueryData(dashboardCancellationsLostQueryOptions(clinicId, now)),
  ]);
}

export function useDashboardOverview(userId: string | null) {
  const now = useMemo(() => new Date(), []);
  const entryQuery = useQuery({ ...entryGateQueryOptions(userId || ""), enabled: Boolean(userId) });
  const clinicId = String(entryQuery.data?.clinicId || "").trim() || null;

  const clinicQuery = useQuery({ ...dashboardClinicQueryOptions(clinicId || ""), enabled: Boolean(clinicId) });
  const servicesQuery = useQuery({ ...dashboardServicesQueryOptions(clinicId || ""), enabled: Boolean(clinicId) });
  const teamQuery = useQuery({ ...dashboardTeamQueryOptions(clinicId || ""), enabled: Boolean(clinicId) });
  const birthdaysQuery = useQuery({ ...dashboardBirthdaysQueryOptions(clinicId || ""), enabled: Boolean(clinicId) });
  const appointmentsWeekQuery = useQuery({ ...dashboardAppointmentsWeekQueryOptions(clinicId || "", now), enabled: Boolean(clinicId) });
  const appointmentsPastQuery = useQuery({ ...dashboardAppointmentsPastQueryOptions(clinicId || "", now), enabled: Boolean(clinicId) });
  const appointmentsTomorrowQuery = useQuery({ ...dashboardAppointmentsTomorrowQueryOptions(clinicId || "", now), enabled: Boolean(clinicId) });
  const metricsQuery = useQuery({ ...dashboardMetricsQueryOptions(clinicId || "", now), enabled: Boolean(clinicId) });
  const cancellationsLostQuery = useQuery({ ...dashboardCancellationsLostQueryOptions(clinicId || "", now), enabled: Boolean(clinicId) });

  const data = useMemo<DashboardOverviewData | null>(() => {
    const clinic = clinicQuery.data;
    const services = servicesQuery.data;
    const teamRows = teamQuery.data;
    const birthdayRows = birthdaysQuery.data;
    const weekAppointments = appointmentsWeekQuery.data;
    const pastAppointments = appointmentsPastQuery.data;
    const tomorrowAppointments = appointmentsTomorrowQuery.data;
    const metrics = metricsQuery.data;
    const cancellationsLost7d = cancellationsLostQuery.data;

    if (!clinic || !services || !teamRows || !birthdayRows || !weekAppointments || !pastAppointments || !tomorrowAppointments || !metrics || !cancellationsLost7d) {
      return null;
    }

    const window = buildDashboardWindow(now);
    const servicesInPerson = services.filter((service) => normalizeServiceMode(service.mode) === "in_person").length;
    const servicesOnline = services.filter((service) => normalizeServiceMode(service.mode) === "online").length;
    const servicesWithoutPrice = services.filter((service) => service.price_brl == null).length;
    const prices = services.map((service) => service.price_brl).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avgServicePriceBrl = prices.length ? prices.reduce((acc, value) => acc + value, 0) / prices.length : null;
    const durations = services.map((service) => safeNumber(service.duration_minutes)).filter((value) => value > 0);
    const avgServiceDurationMinutes = durations.length ? durations.reduce((acc, value) => acc + value, 0) / durations.length : null;
    const owners = teamRows.filter((member) => String(member.role || "") === "owner").length;

    const scheduleToday = (() => {
      const operationHours = clinic.operation_hours || null;
      const day = operationHours ? (operationHours[window.dayId] as OperationHours | undefined) : undefined;
      const blocks = buildScheduleBlocks(day);
      return operationHours ? { dayId: window.dayId, blocks } : { dayId: window.dayId, blocks: buildLegacyScheduleBlocks(clinic) };
    })();

    const slotMinutes = Math.max(15, Math.min(90, Math.round(avgServiceDurationMinutes || 30)));
    const ymdLocal = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dayBlocksForDate = (date: Date) => {
      const dayId = toDayId(date);
      if (clinic.operation_hours) {
        const day = clinic.operation_hours[dayId] as OperationHours | undefined;
        const blocks = buildScheduleBlocks(day);
        return blocks.length ? blocks : [];
      }
      if (clinic.operation_days && !clinic.operation_days.includes(dayId)) return [];
      return buildLegacyScheduleBlocks(clinic);
    };

    const bookedWeekByDate = new Map<string, number>();
    for (const appointment of weekAppointments) {
      const key = ymdLocal(new Date(appointment.starts_at));
      bookedWeekByDate.set(key, (bookedWeekByDate.get(key) || 0) + 1);
    }

    let totalSlotsWeekRemaining = 0;
    let bookedWeekRemaining = 0;
    for (let cursor = new Date(window.today); cursor < window.weekEnd; cursor = addDays(cursor, 1)) {
      totalSlotsWeekRemaining += slotsFromBlocks(dayBlocksForDate(cursor), slotMinutes);
      bookedWeekRemaining += bookedWeekByDate.get(ymdLocal(cursor)) || 0;
    }

    const weekdays = [
      { offset: 0, label: "SEG" },
      { offset: 1, label: "TER" },
      { offset: 2, label: "QUA" },
      { offset: 3, label: "QUI" },
      { offset: 4, label: "SEX" },
    ].map(({ offset, label }) => {
      const date = addDays(window.weekStart, offset);
      const total = slotsFromBlocks(dayBlocksForDate(date), slotMinutes);
      const booked = bookedWeekByDate.get(ymdLocal(date)) || 0;
      return { dayId: toDayId(date), label, date: ymdLocal(date), total, booked, free: Math.max(0, total - booked) };
    });

    const appointmentsToday = weekAppointments
      .filter((appointment) => ymdLocal(new Date(appointment.starts_at)) === ymdLocal(window.today))
      .map((appointment) => ({
        id: String(appointment.id),
        patientId: appointment.patient_id ? String(appointment.patient_id) : null,
        patientName: appointment.patient_name ? String(appointment.patient_name) : null,
        startsAt: String(appointment.starts_at),
        endsAt: appointment.ends_at ? String(appointment.ends_at) : null,
        status: appointment.status ? String(appointment.status) : null,
      }));

    const activityToday = appointmentsToday
      .filter((appointment) => {
        const status = normalizeAppointmentStatus(appointment.status || "scheduled");
        return isDoneStatus(status) || isNoShowStatus(status) || isCancelledStatus(status);
      })
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .slice(0, 5);

    const pendingConfirmationsTomorrow = tomorrowAppointments
      .map((appointment) => ({
        id: String(appointment.id),
        patientId: appointment.patient_id ? String(appointment.patient_id) : null,
        patientName: appointment.patient_name ? String(appointment.patient_name) : null,
        startsAt: String(appointment.starts_at),
        endsAt: appointment.ends_at ? String(appointment.ends_at) : null,
        status: appointment.status ? String(appointment.status) : null,
      }))
      .filter((appointment) => {
        const status = normalizeAppointmentStatus(appointment.status || "scheduled");
        return !isCancelledStatus(status) && !isDoneStatus(status) && !isNoShowStatus(status) && !isConfirmedStatus(status);
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 5);

    const msDay = 1000 * 60 * 60 * 24;
    const birthdaysWeek: DashboardBirthday[] = birthdayRows
      .map((row) => {
        if (!row.birth_date) return null;
        const birthDate = new Date(row.birth_date);
        if (!Number.isFinite(birthDate.getTime())) return null;
        const next = new Date(window.today.getFullYear(), birthDate.getMonth(), birthDate.getDate(), 0, 0, 0, 0);
        const nextBirthday = next < window.today ? new Date(window.today.getFullYear() + 1, birthDate.getMonth(), birthDate.getDate(), 0, 0, 0, 0) : next;
        const daysUntil = Math.round((nextBirthday.getTime() - window.today.getTime()) / msDay);
        return {
          id: String(row.id),
          name: String(row.full_name || "Paciente").trim() || "Paciente",
          birthDate: String(row.birth_date),
          nextBirthday: toIso(nextBirthday),
          daysUntil,
        } satisfies DashboardBirthday;
      })
      .filter((row): row is DashboardBirthday => Boolean(row && row.daysUntil >= 0 && row.daysUntil < 7))
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 6);

    const lastVisitByPatient = new Map<string, { name: string; last: string }>();
    for (const appointment of pastAppointments) {
      const patientId = String(appointment.patient_id || "").trim();
      if (!patientId || lastVisitByPatient.has(patientId)) continue;
      lastVisitByPatient.set(patientId, {
        name: String(appointment.patient_name || "Paciente").trim() || "Paciente",
        last: String(appointment.starts_at),
      });
    }

    const noReturn30d: DashboardNoReturnPatient[] = Array.from(lastVisitByPatient.entries())
      .map(([id, info]) => {
        const lastDate = startOfDay(new Date(info.last));
        return { id, name: info.name, lastVisitAt: info.last, daysSince: Math.floor((window.today.getTime() - lastDate.getTime()) / msDay) };
      })
      .filter((row) => row.daysSince >= 30 && row.lastVisitAt < window.todayIso)
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 6);

    return {
      clinic: clinic ? { id: clinic.id, name: clinic.name, slug: clinic.slug } : null,
      scheduleToday,
      operations: {
        slotMinutes,
        today: {
          total: slotsFromBlocks(dayBlocksForDate(window.today), slotMinutes),
          booked: bookedWeekByDate.get(ymdLocal(window.today)) || 0,
          free: Math.max(0, slotsFromBlocks(dayBlocksForDate(window.today), slotMinutes) - (bookedWeekByDate.get(ymdLocal(window.today)) || 0)),
        },
        week: { total: totalSlotsWeekRemaining, booked: bookedWeekRemaining, free: Math.max(0, totalSlotsWeekRemaining - bookedWeekRemaining) },
        weekdays,
      },
      appointmentsToday,
      activityToday,
      cancellationsLost7d,
      pendingConfirmationsTomorrow,
      birthdaysWeek,
      noReturn30d,
      kpis: {
        totalPatients: metrics.totalPatients,
        patientsWithPhone: metrics.patientsWithPhone,
        totalServices: services.length,
        servicesInPerson,
        servicesOnline,
        servicesWithoutPrice,
        avgServicePriceBrl,
        avgServiceDurationMinutes: avgServiceDurationMinutes,
        teamMembers: teamRows.length,
        owners,
        newPatients30d: metrics.newPatients30d,
        newPatientsGrowthPct30d: metrics.prevPatients30d > 0 ? (metrics.newPatients30d - metrics.prevPatients30d) / metrics.prevPatients30d : null,
      },
      patientEvolution: metrics.evolution,
      team: teamRows.map((member) => ({
        id: String(member.id),
        name: String(member?.profiles?.full_name || "").trim() || "Sem nome",
        avatarUrl: member?.profiles?.avatar_url || null,
        role: String(member.role || ""),
        createdAt: String(member.created_at || ""),
      })),
    };
  }, [appointmentsPastQuery.data, appointmentsTomorrowQuery.data, appointmentsWeekQuery.data, birthdaysQuery.data, cancellationsLostQuery.data, clinicQuery.data, metricsQuery.data, now, servicesQuery.data, teamQuery.data]);

  const error = useMemo(() => {
    if (entryQuery.error) return "Não foi possível carregar seus dados agora. Tente novamente.";
    if (entryQuery.isSuccess && !clinicId) return "Não foi possível identificar sua clínica. Faça login novamente.";
    const firstError = [clinicQuery.error, servicesQuery.error, teamQuery.error, birthdaysQuery.error, appointmentsWeekQuery.error, appointmentsPastQuery.error, appointmentsTomorrowQuery.error, metricsQuery.error, cancellationsLostQuery.error].find(Boolean);
    return firstError instanceof Error ? firstError.message : null;
  }, [appointmentsPastQuery.error, appointmentsTomorrowQuery.error, appointmentsWeekQuery.error, birthdaysQuery.error, cancellationsLostQuery.error, clinicId, clinicQuery.error, entryQuery.error, entryQuery.isSuccess, metricsQuery.error, servicesQuery.error, teamQuery.error]);

  const loading = Boolean(userId) && (entryQuery.isLoading || (Boolean(clinicId) && !data && (clinicQuery.isLoading || servicesQuery.isLoading || teamQuery.isLoading || birthdaysQuery.isLoading || appointmentsWeekQuery.isLoading || appointmentsPastQuery.isLoading || appointmentsTomorrowQuery.isLoading || metricsQuery.isLoading || cancellationsLostQuery.isLoading)));

  const derived = useMemo(() => {
    if (!data) return null;
    const totalPatients = data.kpis.totalPatients;
    return {
      contactPct: totalPatients > 0 ? data.kpis.patientsWithPhone / totalPatients : 0,
      patientsWithoutPhone: Math.max(0, totalPatients - data.kpis.patientsWithPhone),
      servicesWithPrice: Math.max(0, data.kpis.totalServices - data.kpis.servicesWithoutPrice),
      servicesWithPricePct: data.kpis.totalServices > 0 ? (data.kpis.totalServices - data.kpis.servicesWithoutPrice) / data.kpis.totalServices : 0,
    };
  }, [data]);

  return { clinicId, loading, error, data, derived };
}
