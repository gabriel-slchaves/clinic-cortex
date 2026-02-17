import {
  keepPreviousData,
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ensureClinicIdForViewer, entryGateQueryOptions } from "@/hooks/useAppEntryGate";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";

export type PatientStatus = "ativo" | "inativo" | "novo";
export type PatientsFilter = "all" | "active" | "new";

type ClinicRow = {
  id: string;
  name: string | null;
};

type PatientRow = {
  id: string;
  full_name: string | null;
  phone?: string | null;
  created_at?: string | null;
  status?: string | null;
  is_active?: boolean | null;
};

type AppointmentRow = {
  patient_id: string | null;
  starts_at: string;
};

type PatientsDirectoryQueryData = {
  rows: PatientsDirectoryItem[];
  total: number;
  supportsStatus: boolean;
};

export type PatientsDirectoryItem = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string | null;
  status: PatientStatus;
  lastConsultationAt: string | null;
};

export type PatientsKpis = {
  totalPatients: number;
  newPatients30d: number;
  growthPct30d: number | null;
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIso(date: Date) {
  return date.toISOString();
}

function safeNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingSchemaError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  if (code === "PGRST205") return true;
  if (code === "42P01") return true;
  if (code === "42703") return true;
  if (code === "PGRST204") return true;
  return false;
}

function isMissingColumnError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  return code === "42703" || code === "PGRST204";
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

async function countRows({
  table,
  clinicId,
  where,
}: {
  table: string;
  clinicId: string;
  where?: (q: any) => any;
}): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("clinic_id", clinicId);
  if (where) q = where(q);
  const { error, count } = await q;
  if (error) throw error;
  return safeNumber(count);
}

async function loadLastConsultations({
  clinicId,
  patientIds,
}: {
  clinicId: string;
  patientIds: string[];
}) {
  if (patientIds.length === 0) return new Map<string, string>();

  const { data, error } = await supabase
    .from("appointments")
    .select("patient_id,starts_at")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .in("patient_id", patientIds)
    .order("starts_at", { ascending: false })
    .limit(Math.max(50, patientIds.length * 40));

  if (error) {
    if (isMissingSchemaError(error)) return new Map<string, string>();
    throw error;
  }

  const rows = (data as any as AppointmentRow[]) || [];
  const map = new Map<string, string>();
  for (const row of rows) {
    const pid = String(row.patient_id || "").trim();
    if (!pid || map.has(pid) || !row.starts_at) continue;
    map.set(pid, String(row.starts_at));
    if (map.size >= patientIds.length) break;
  }
  return map;
}

function normalizeStatus(raw: unknown): PatientStatus | null {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (value === "inactive" || value === "inativo" || value === "disabled") return "inativo";
  if (value === "new" || value === "novo") return "novo";
  if (value === "active" || value === "ativo") return "ativo";
  if (value.includes("inativ")) return "inativo";
  if (value.includes("nov")) return "novo";
  if (value.includes("ativ")) return "ativo";
  return null;
}

function deriveStatus(row: PatientRow, newCutoffIso: string): PatientStatus {
  const statusFromDb = normalizeStatus(row.status);
  if (statusFromDb) return statusFromDb;
  if (typeof row.is_active === "boolean") return row.is_active ? "ativo" : "inativo";
  const createdAt = row.created_at == null ? "" : String(row.created_at).trim();
  if (createdAt && createdAt >= newCutoffIso) return "novo";
  return "ativo";
}

function buildSearchOr(term: string) {
  const cleaned = term.replace(/[(),]/g, " ").trim();
  if (!cleaned) return "";
  const normalizedTerm = cleaned.replace(/\s+/g, " ");
  return `full_name.ilike.%${normalizedTerm}%,phone.ilike.%${normalizedTerm}%`;
}

function friendlyPatientsKpiError(error: unknown) {
  if (isMissingSchemaError(error)) {
    return "Seu banco ainda não está pronto para pacientes. Finalize as migrations e tente novamente.";
  }
  return "Não foi possível carregar os indicadores agora. Tente novamente.";
}

function friendlyPatientsListError(error: unknown) {
  if (isMissingSchemaError(error)) {
    return "Seu banco ainda não está pronto para pacientes. Finalize as migrations e tente novamente.";
  }
  return "Não foi possível carregar seus pacientes agora. Tente novamente.";
}

async function fetchPatientsClinic(clinicId: string): Promise<ClinicRow | null> {
  try {
    const { data, error } = await supabase.from("clinics").select("id,name").eq("id", clinicId).limit(1).maybeSingle();
    if (error) {
      if (import.meta.env.DEV) console.warn("[usePatientsDirectory] clinic load error:", error);
      return null;
    }
    return (data as any as ClinicRow | null) || null;
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[usePatientsDirectory] clinic load unexpected:", error);
    return null;
  }
}

async function fetchPatientsKpis(clinicId: string): Promise<PatientsKpis> {
  try {
    const today = startOfDay(new Date());
    const start30 = addDays(today, -30);
    const start60 = addDays(today, -60);

    const [totalPatients, newPatients30d, prevPatients30d] = await Promise.all([
      countRows({
        table: "patients",
        clinicId,
        where: (q) => q.is("deleted_at", null),
      }),
      countRows({
        table: "patients",
        clinicId,
        where: (q) => q.is("deleted_at", null).gte("created_at", toIso(start30)),
      }),
      countRows({
        table: "patients",
        clinicId,
        where: (q) =>
          q.is("deleted_at", null).gte("created_at", toIso(start60)).lt("created_at", toIso(start30)),
      }),
    ]);

    return {
      totalPatients,
      newPatients30d,
      growthPct30d: prevPatients30d > 0 ? (newPatients30d - prevPatients30d) / prevPatients30d : null,
    };
  } catch (error) {
    throw new Error(friendlyPatientsKpiError(error));
  }
}

async function fetchPatientsDirectory({
  clinicId,
  search,
  filter,
  page,
  pageSize,
}: {
  clinicId: string;
  search: string;
  filter: PatientsFilter;
  page: number;
  pageSize: number;
}): Promise<PatientsDirectoryQueryData> {
  const newCutoffIso = toIso(addDays(startOfDay(new Date()), -30));

  async function fetchPage(includeStatus: boolean) {
    const columns = includeStatus
      ? "id,full_name,phone,created_at,status,is_active"
      : "id,full_name,phone,created_at";

    const from = Math.max(0, (page - 1) * pageSize);
    const to = Math.max(from, from + pageSize - 1);
    const term = String(search || "").trim();

    let query = supabase
      .from("patients")
      .select(columns, { count: "exact" })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null);

    if (term) {
      const or = buildSearchOr(term);
      if (or) query = query.or(or);
    }

    if (filter !== "all") {
      if (includeStatus) {
        if (filter === "active") query = query.in("status", ["active", "ativo", "ATIVO"]);
        if (filter === "new") query = query.in("status", ["new", "novo", "NOVO"]);
      } else {
        if (filter === "new") query = query.gte("created_at", newCutoffIso);
        if (filter === "active") query = query.lt("created_at", newCutoffIso);
      }
    }

    return query.order("full_name", { ascending: true }).range(from, to);
  }

  try {
    let includeStatus = true;
    let response = await fetchPage(true);

    if (response.error && isMissingColumnError(response.error)) {
      includeStatus = false;
      response = await fetchPage(false);
    }

    if (response.error) throw response.error;

    const rawRows = (response.data as any as PatientRow[]) || [];
    const ids = rawRows.map((row) => String(row.id)).filter(Boolean);
    let lastMap = new Map<string, string>();

    try {
      lastMap = await loadLastConsultations({ clinicId, patientIds: ids });
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[usePatientsDirectory] loadLastConsultations error:", error);
    }

    return {
      total: safeNumber(response.count),
      supportsStatus: includeStatus,
      rows: rawRows.map((row) => {
        const id = String(row.id);
        const name = String(row.full_name || "Paciente").trim() || "Paciente";
        const phone = row.phone == null ? null : String(row.phone).trim() || null;
        const createdAt = row.created_at == null ? null : String(row.created_at);
        return {
          id,
          name,
          phone,
          createdAt,
          lastConsultationAt: lastMap.get(id) || null,
          status: deriveStatus(row, newCutoffIso),
        } satisfies PatientsDirectoryItem;
      }),
    };
  } catch (error) {
    throw new Error(friendlyPatientsListError(error));
  }
}

export const patientsQueryKeys = {
  clinic: (clinicId: string) => ["patients", "clinic", clinicId] as const,
  kpis: (clinicId: string) => ["patients", "kpis", clinicId] as const,
  directoryRoot: (clinicId: string) => ["patients", "directory", clinicId] as const,
  directory: (clinicId: string, args: { search: string; filter: PatientsFilter; page: number; pageSize: number }) =>
    ["patients", "directory", clinicId, args.search, args.filter, args.page, args.pageSize] as const,
};

export function patientsClinicQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: patientsQueryKeys.clinic(clinicId),
    queryFn: () => fetchPatientsClinic(clinicId),
    staleTime: 5 * 60 * 1000,
  });
}

export function patientsKpisQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: patientsQueryKeys.kpis(clinicId),
    queryFn: () => fetchPatientsKpis(clinicId),
    staleTime: 60 * 1000,
  });
}

export function patientsDirectoryQueryOptions(
  clinicId: string,
  args: { search: string; filter: PatientsFilter; page: number; pageSize: number }
) {
  return queryOptions({
    queryKey: patientsQueryKeys.directory(clinicId, args),
    queryFn: () => fetchPatientsDirectory({ clinicId, ...args }),
    staleTime: 60 * 1000,
  });
}

export async function prefetchPatientsPageData({
  queryClient,
  userId,
  pageSize = 10,
}: {
  queryClient: QueryClient;
  userId: string;
  pageSize?: number;
}) {
  const clinicId = await ensureClinicIdForViewer(queryClient, userId);
  if (!clinicId) return;

  await Promise.all([
    queryClient.ensureQueryData(patientsClinicQueryOptions(clinicId)),
    queryClient.ensureQueryData(patientsKpisQueryOptions(clinicId)),
    queryClient.prefetchQuery(
      patientsDirectoryQueryOptions(clinicId, {
        search: "",
        filter: "all",
        page: 1,
        pageSize,
      })
    ),
  ]);
}

export function usePatientsDirectory({
  userId,
  search,
  filter,
  page,
  pageSize,
}: {
  userId: string | null;
  search: string;
  filter: PatientsFilter;
  page: number;
  pageSize: number;
}) {
  const queryClient = useQueryClient();
  const debouncedSearch = useDebouncedValue(search, 250);

  const entryQuery = useQuery({
    ...entryGateQueryOptions(userId || ""),
    enabled: Boolean(userId),
  });

  const clinicId = String(entryQuery.data?.clinicId || "").trim() || null;

  const clinicQuery = useQuery({
    ...patientsClinicQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const kpisQuery = useQuery({
    ...patientsKpisQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const directoryQuery = useQuery({
    ...patientsDirectoryQueryOptions(clinicId || "", {
      search: debouncedSearch,
      filter,
      page,
      pageSize,
    }),
    enabled: Boolean(clinicId),
    placeholderData: keepPreviousData,
  });

  const loadError = useMemo(() => {
    if (entryQuery.error) return "Não foi possível identificar sua clínica. Faça login novamente.";
    if (entryQuery.isSuccess && !clinicId) return "Não foi possível identificar sua clínica. Faça login novamente.";
    if (directoryQuery.error instanceof Error) return directoryQuery.error.message;
    return null;
  }, [clinicId, directoryQuery.error, entryQuery.error, entryQuery.isSuccess]);

  const isInitialLoading =
    Boolean(userId) &&
    (entryQuery.isLoading || (Boolean(clinicId) && directoryQuery.isLoading && !directoryQuery.data));

  const loadingKpis = Boolean(clinicId) && kpisQuery.isLoading && !kpisQuery.data;

  const refetch = async () => {
    if (!clinicId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: patientsQueryKeys.kpis(clinicId) }),
      queryClient.invalidateQueries({ queryKey: patientsQueryKeys.directoryRoot(clinicId) }),
      queryClient.invalidateQueries({ queryKey: patientsQueryKeys.clinic(clinicId) }),
    ]);
  };

  return {
    clinicId,
    clinicName: clinicQuery.data?.name ? String(clinicQuery.data.name).trim() || null : null,
    supportsStatus: directoryQuery.data?.supportsStatus ?? true,
    loading: isInitialLoading,
    isInitialLoading,
    error: loadError,
    rows: directoryQuery.data?.rows ?? [],
    total: directoryQuery.data?.total ?? 0,
    loadingKpis,
    kpiError: kpisQuery.error instanceof Error ? kpisQuery.error.message : null,
    kpis: kpisQuery.data ?? null,
    refetch,
  };
}
