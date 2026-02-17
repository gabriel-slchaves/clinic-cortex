import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ensureClinicIdForViewer, entryGateQueryOptions } from "@/hooks/useAppEntryGate";
import { buildOperationHours, type DayId, type OperationHours } from "@/lib/operatingHours";
import { supabase } from "@/lib/supabase";
import { useCallback, useMemo } from "react";

type AppointmentRow = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  patient_name: string | null;
  service_name?: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string | null;
  notes?: string | null;
};

type ClinicScheduleRow = {
  operation_hours?: Partial<Record<DayId, Partial<OperationHours[DayId]>>> | null;
  operation_days?: DayId[] | null;
  shift_morning_start?: string | null;
  shift_morning_end?: string | null;
  shift_afternoon_enabled?: boolean | null;
  shift_afternoon_start?: string | null;
  shift_afternoon_end?: string | null;
};

export type Appointment = {
  id: string;
  clinicId: string;
  patientId: string | null;
  patientName: string | null;
  serviceName: string | null;
  startsAt: string;
  endsAt: string | null;
  status: string | null;
  notes: string | null;
};

export type AgendaPatientOption = { id: string; name: string };
export type AgendaServiceOption = { id: string; name: string; durationMinutes: number | null };

function isMissingSchemaError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  return code === "PGRST205" || code === "42P01" || code === "42703" || code === "PGRST204";
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    patientId: row.patient_id ? String(row.patient_id) : null,
    patientName: row.patient_name ? String(row.patient_name) : null,
    serviceName: row.service_name ? String(row.service_name) : null,
    startsAt: String(row.starts_at),
    endsAt: row.ends_at ? String(row.ends_at) : null,
    status: row.status ? String(row.status) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

function friendlySupabaseError(err: unknown, fallback: string) {
  const e = err as any;
  const message = String(e?.message || "").trim();
  return message || fallback;
}

function safeTime(value: unknown, fallback: string) {
  const raw = String(value || "").slice(0, 5);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

function buildClinicOperationHours(row: ClinicScheduleRow | null | undefined): OperationHours {
  const base = buildOperationHours({ enabledDays: ["mon", "tue", "wed", "thu", "fri"], start: "08:00", end: "18:00" });
  if (!row) return base;

  if (row.operation_hours && typeof row.operation_hours === "object") {
    for (const dayId of Object.keys(base) as DayId[]) {
      const incoming = row.operation_hours[dayId];
      if (!incoming || typeof incoming !== "object") continue;
      base[dayId] = {
        ...base[dayId],
        enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : base[dayId].enabled,
        start: safeTime(incoming.start, base[dayId].start),
        end: safeTime(incoming.end, base[dayId].end),
        break_enabled: typeof incoming.break_enabled === "boolean" ? incoming.break_enabled : base[dayId].break_enabled,
        break_start: safeTime(incoming.break_start, base[dayId].break_start),
        break_end: safeTime(incoming.break_end, base[dayId].break_end),
      };
    }
    return base;
  }

  const enabledDays =
    Array.isArray(row.operation_days) && row.operation_days.length
      ? row.operation_days.filter((dayId): dayId is DayId => dayId in base)
      : (["mon", "tue", "wed", "thu", "fri"] as DayId[]);
  const morningStart = safeTime(row.shift_morning_start, "08:00");
  const maxEnd = row.shift_afternoon_enabled ? safeTime(row.shift_afternoon_end, "18:00") : safeTime(row.shift_morning_end, "18:00");
  const fallback = buildOperationHours({ enabledDays, start: morningStart, end: maxEnd });

  if (row.shift_afternoon_enabled) {
    const breakStart = safeTime(row.shift_morning_end, "12:00");
    const breakEnd = safeTime(row.shift_afternoon_start, "13:30");
    for (const dayId of enabledDays) {
      fallback[dayId] = { ...fallback[dayId], break_enabled: true, break_start: breakStart, break_end: breakEnd };
    }
  }

  return fallback;
}

function appointmentInRange(startsAt: string, startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return false;
  return startsAt >= startIso && startsAt < endIso;
}

function sortAppointments(items: Appointment[]) {
  return [...items].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

async function fetchAgendaClinic(clinicId: string) {
  const { data, error } = await supabase.from("clinics").select("id,name").eq("id", clinicId).limit(1).maybeSingle();
  if (error) throw new Error(friendlySupabaseError(error, "Não foi possível carregar a agenda."));
  return { id: String((data as any)?.id || clinicId), name: String((data as any)?.name || "").trim() || null };
}

async function fetchAgendaAppointments(clinicId: string, startIso: string, endIso: string) {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .order("starts_at", { ascending: true })
      .limit(4000);

    if (error) {
      if (isMissingSchemaError(error)) return [] as Appointment[];
      throw error;
    }

    return ((data as any as AppointmentRow[]) || []).map(toAppointment);
  } catch (error) {
    throw new Error(friendlySupabaseError(error, "Não foi possível carregar a agenda."));
  }
}

async function fetchAgendaSchedule(clinicId: string) {
  const baseSelect = "operation_days,shift_morning_start,shift_morning_end,shift_afternoon_enabled,shift_afternoon_start,shift_afternoon_end";
  try {
    let response = await supabase.from("clinics").select(`${baseSelect},operation_hours`).eq("id", clinicId).limit(1).maybeSingle();
    if (response.error && isMissingSchemaError(response.error)) {
      response = await supabase.from("clinics").select(baseSelect).eq("id", clinicId).limit(1).maybeSingle();
    }
    if (response.error) throw response.error;
    return buildClinicOperationHours((response.data as ClinicScheduleRow | null) || null);
  } catch (error) {
    throw new Error(friendlySupabaseError(error, "Não foi possível carregar o horário de funcionamento."));
  }
}

async function fetchAgendaPatients(clinicId: string) {
  try {
    const { data, error } = await supabase
      .from("patients")
      .select("id,full_name")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("full_name", { ascending: true })
      .limit(2000);
    if (error) {
      if (isMissingSchemaError(error)) return [] as AgendaPatientOption[];
      throw error;
    }
    return (((data as any) || []) as Array<{ id: string; full_name: string | null }>)
      .map((row) => ({ id: String(row.id), name: String(row.full_name || "").trim() }))
      .filter((row) => row.id && row.name);
  } catch (error) {
    throw new Error(friendlySupabaseError(error, "Não foi possível carregar pacientes e serviços."));
  }
}

async function fetchAgendaServices(clinicId: string) {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("id,name,duration_minutes")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      if (isMissingSchemaError(error)) return [] as AgendaServiceOption[];
      throw error;
    }
    return (((data as any) || []) as Array<{ id: string; name: string | null; duration_minutes: number | null }>)
      .map((row) => ({ id: String(row.id), name: String(row.name || "").trim(), durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes) }))
      .filter((row) => row.id && row.name);
  } catch (error) {
    throw new Error(friendlySupabaseError(error, "Não foi possível carregar pacientes e serviços."));
  }
}

function defaultAgendaRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export const agendaQueryKeys = {
  clinic: (clinicId: string) => ["agenda", "clinic", clinicId] as const,
  appointmentsRoot: (clinicId: string) => ["agenda", "appointments", clinicId] as const,
  appointments: (clinicId: string, startIso: string, endIso: string) => ["agenda", "appointments", clinicId, startIso, endIso] as const,
  schedule: (clinicId: string) => ["agenda", "schedule", clinicId] as const,
  patients: (clinicId: string) => ["agenda", "patients", clinicId] as const,
  services: (clinicId: string) => ["agenda", "services", clinicId] as const,
};

export function agendaClinicQueryOptions(clinicId: string) {
  return queryOptions({ queryKey: agendaQueryKeys.clinic(clinicId), queryFn: () => fetchAgendaClinic(clinicId), staleTime: 5 * 60 * 1000 });
}

export function agendaAppointmentsQueryOptions(clinicId: string, startIso: string, endIso: string) {
  return queryOptions({ queryKey: agendaQueryKeys.appointments(clinicId, startIso, endIso), queryFn: () => fetchAgendaAppointments(clinicId, startIso, endIso), staleTime: 60 * 1000 });
}

export function agendaScheduleQueryOptions(clinicId: string) {
  return queryOptions({ queryKey: agendaQueryKeys.schedule(clinicId), queryFn: () => fetchAgendaSchedule(clinicId), staleTime: 5 * 60 * 1000 });
}

export function agendaPatientsQueryOptions(clinicId: string) {
  return queryOptions({ queryKey: agendaQueryKeys.patients(clinicId), queryFn: () => fetchAgendaPatients(clinicId), staleTime: 60 * 1000 });
}

export function agendaServicesQueryOptions(clinicId: string) {
  return queryOptions({ queryKey: agendaQueryKeys.services(clinicId), queryFn: () => fetchAgendaServices(clinicId), staleTime: 60 * 1000 });
}

export async function prefetchAgendaPageData({ queryClient, userId }: { queryClient: QueryClient; userId: string }) {
  const clinicId = await ensureClinicIdForViewer(queryClient, userId);
  if (!clinicId) return;
  const { startIso, endIso } = defaultAgendaRange();
  await Promise.all([
    queryClient.ensureQueryData(agendaClinicQueryOptions(clinicId)),
    queryClient.ensureQueryData(agendaScheduleQueryOptions(clinicId)),
    queryClient.ensureQueryData(agendaPatientsQueryOptions(clinicId)),
    queryClient.ensureQueryData(agendaServicesQueryOptions(clinicId)),
    queryClient.prefetchQuery(agendaAppointmentsQueryOptions(clinicId, startIso, endIso)),
  ]);
}

export function useAgendaResources(clinicId: string | null) {
  const scheduleQuery = useQuery({ ...agendaScheduleQueryOptions(clinicId || ""), enabled: Boolean(clinicId) });
  const patientsQuery = useQuery({ ...agendaPatientsQueryOptions(clinicId || ""), enabled: Boolean(clinicId) });
  const servicesQuery = useQuery({ ...agendaServicesQueryOptions(clinicId || ""), enabled: Boolean(clinicId) });

  return {
    operationHours: scheduleQuery.data ?? buildOperationHours({ enabledDays: ["mon", "tue", "wed", "thu", "fri"], start: "08:00", end: "18:00" }),
    scheduleError: scheduleQuery.error instanceof Error ? scheduleQuery.error.message : null,
    scheduleLoading: Boolean(clinicId) && scheduleQuery.isLoading && !scheduleQuery.data,
    patientOptions: patientsQuery.data ?? [],
    serviceOptions: servicesQuery.data ?? [],
    lookupsError:
      patientsQuery.error instanceof Error
        ? patientsQuery.error.message
        : servicesQuery.error instanceof Error
          ? servicesQuery.error.message
          : null,
    lookupsLoading:
      Boolean(clinicId) &&
      ((patientsQuery.isLoading && !patientsQuery.data) || (servicesQuery.isLoading && !servicesQuery.data)),
  };
}

export function useAppointments({
  userId,
  startIso,
  endIso,
}: {
  userId: string | null;
  startIso: string | null;
  endIso: string | null;
}) {
  const queryClient = useQueryClient();
  const entryQuery = useQuery({ ...entryGateQueryOptions(userId || ""), enabled: Boolean(userId) });
  const clinicId = String(entryQuery.data?.clinicId || "").trim() || null;

  const clinicQuery = useQuery({ ...agendaClinicQueryOptions(clinicId || ""), enabled: Boolean(clinicId) });
  const appointmentsQuery = useQuery({
    ...agendaAppointmentsQueryOptions(clinicId || "", startIso || "", endIso || ""),
    enabled: Boolean(clinicId && startIso && endIso),
    placeholderData: keepPreviousData,
  });

  const patchCurrentRange = useCallback(
    (updater: (current: Appointment[]) => Appointment[]) => {
      if (!clinicId || !startIso || !endIso) return;
      queryClient.setQueryData<Appointment[]>(agendaQueryKeys.appointments(clinicId, startIso, endIso), (current) => updater(current || []));
    },
    [clinicId, endIso, queryClient, startIso]
  );

  const createMutation = useMutation({
    mutationFn: async (input: {
      patientId?: string | null;
      patientName?: string | null;
      serviceName?: string | null;
      startsAt: string;
      endsAt: string | null;
      status?: string | null;
      notes?: string | null;
    }) => {
      if (!clinicId) throw new Error("Não foi possível identificar sua clínica.");
      const basePayload: Record<string, unknown> = {
        clinic_id: clinicId,
        patient_id: input.patientId ?? null,
        patient_name: input.patientName ?? null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: input.status ?? "scheduled",
        updated_at: new Date().toISOString(),
      };
      const detailedPayload = { ...basePayload, service_name: input.serviceName ?? null, notes: input.notes ?? null };
      let response = await supabase.from("appointments").insert(detailedPayload).select("*").maybeSingle();
      if (response.error && isMissingSchemaError(response.error)) {
        response = await supabase.from("appointments").insert(basePayload).select("*").maybeSingle();
      }
      if (response.error || !(response.data as any)?.id) {
        throw new Error(friendlySupabaseError(response.error, "Não foi possível salvar a consulta."));
      }
      return toAppointment(response.data as any as AppointmentRow);
    },
    onSuccess: (created) => {
      if (appointmentInRange(created.startsAt, startIso, endIso)) {
        patchCurrentRange((current) => sortAppointments([...current, created]));
      }
      if (clinicId) void queryClient.invalidateQueries({ queryKey: agendaQueryKeys.appointmentsRoot(clinicId) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{ patientId: string | null; patientName: string | null; serviceName: string | null; startsAt: string; endsAt: string | null; status: string | null; notes: string | null }>;
    }) => {
      if (!clinicId) throw new Error("Não foi possível identificar sua clínica.");
      const basePayload: Record<string, unknown> = {
        ...(patch.patientId !== undefined ? { patient_id: patch.patientId } : {}),
        ...(patch.patientName !== undefined ? { patient_name: patch.patientName } : {}),
        ...(patch.startsAt !== undefined ? { starts_at: patch.startsAt } : {}),
        ...(patch.endsAt !== undefined ? { ends_at: patch.endsAt } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updated_at: new Date().toISOString(),
      };
      const detailedPayload = { ...basePayload, ...(patch.serviceName !== undefined ? { service_name: patch.serviceName } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}) };
      let response = await supabase.from("appointments").update(detailedPayload).eq("clinic_id", clinicId).eq("id", id).select("*").maybeSingle();
      if (response.error && isMissingSchemaError(response.error)) {
        response = await supabase.from("appointments").update(basePayload).eq("clinic_id", clinicId).eq("id", id).select("*").maybeSingle();
      }
      if (response.error || !(response.data as any)?.id) {
        throw new Error(friendlySupabaseError(response.error, "Não foi possível atualizar a consulta."));
      }
      return toAppointment(response.data as any as AppointmentRow);
    },
    onSuccess: (updated, variables) => {
      patchCurrentRange((current) => {
        const filtered = current.filter((item) => item.id !== variables.id);
        return appointmentInRange(updated.startsAt, startIso, endIso) ? sortAppointments([...filtered, updated]) : filtered;
      });
      if (clinicId) void queryClient.invalidateQueries({ queryKey: agendaQueryKeys.appointmentsRoot(clinicId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!clinicId) throw new Error("Não foi possível identificar sua clínica.");
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("appointments").update({ deleted_at: nowIso, updated_at: nowIso }).eq("clinic_id", clinicId).eq("id", id);
      if (error) throw new Error(friendlySupabaseError(error, "Não foi possível excluir a consulta."));
      return id;
    },
    onSuccess: (deletedId) => {
      patchCurrentRange((current) => current.filter((item) => item.id !== deletedId));
      if (clinicId) void queryClient.invalidateQueries({ queryKey: agendaQueryKeys.appointmentsRoot(clinicId) });
    },
  });

  const refetch = useCallback(async () => {
    if (!clinicId || !startIso || !endIso) return;
    await queryClient.invalidateQueries({ queryKey: agendaQueryKeys.appointments(clinicId, startIso, endIso) });
  }, [clinicId, endIso, queryClient, startIso]);

  return useMemo(
    () => ({
      clinicId,
      clinicName: clinicQuery.data?.name ?? null,
      loading: Boolean(userId) && (entryQuery.isLoading || (Boolean(clinicId && startIso && endIso) && appointmentsQuery.isLoading && !appointmentsQuery.data)),
      saving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
      error:
        entryQuery.error instanceof Error
          ? "Não foi possível carregar a agenda."
          : appointmentsQuery.error instanceof Error
            ? appointmentsQuery.error.message
            : null,
      items: appointmentsQuery.data ?? [],
      refetch,
      createAppointment: async (input: Parameters<typeof createMutation.mutateAsync>[0]) => {
        try {
          const data = await createMutation.mutateAsync(input);
          return { data, error: null as string | null };
        } catch (error) {
          return { data: null, error: error instanceof Error ? error.message : "Não foi possível salvar a consulta." };
        }
      },
      updateAppointment: async (id: string, patch: Parameters<typeof updateMutation.mutateAsync>[0]["patch"]) => {
        try {
          const data = await updateMutation.mutateAsync({ id, patch });
          return { data, error: null as string | null };
        } catch (error) {
          return { data: null, error: error instanceof Error ? error.message : "Não foi possível atualizar a consulta." };
        }
      },
      deleteAppointment: async (id: string) => {
        try {
          await deleteMutation.mutateAsync(id);
          return { error: null as string | null };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Não foi possível excluir a consulta." };
        }
      },
    }),
    [appointmentsQuery.data, appointmentsQuery.error, appointmentsQuery.isLoading, clinicId, clinicQuery.data?.name, createMutation, deleteMutation, entryQuery.error, entryQuery.isLoading, refetch, startIso, endIso, updateMutation, userId]
  );
}
