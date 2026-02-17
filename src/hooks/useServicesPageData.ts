import {
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ensureClinicIdForViewer, entryGateQueryOptions } from "@/hooks/useAppEntryGate";
import { supabase } from "@/lib/supabase";
import { useMemo } from "react";

export type ServiceMode = "in_person" | "online";

export type ClinicServiceModes = {
  in_person: boolean;
  online: boolean;
};

type ClinicRow = {
  id: string;
  name: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  appointment_in_person_enabled?: boolean | null;
  appointment_online_enabled?: boolean | null;
};

type ServiceRow = {
  id: string;
  clinic_id: string;
  name: string | null;
  mode: string | null;
  duration_minutes: number | null;
  price_brl: number | null;
  deleted_at: string | null;
  created_at: string | null;
};

export type ServicesPageItem = {
  id: string;
  clinicId: string;
  name: string;
  mode: ServiceMode;
  durationMinutes: number;
  priceBrl: number | null;
  deletedAt: string | null;
  createdAt: string | null;
};

type ServicesListQueryData = {
  rows: ServicesPageItem[];
  total: number;
};

export type ServicesPageKpis = {
  totalServices: number;
  servicesInPerson: number;
  servicesOnline: number;
  servicesWithoutPrice: number;
  avgServicePriceBrl: number | null;
  avgServiceDurationMinutes: number | null;
};

type ServicesClinicQueryData = {
  clinic: ClinicRow | null;
  clinicModes: ClinicServiceModes;
};

const DEFAULT_CLINIC_MODES: ClinicServiceModes = {
  in_person: true,
  online: false,
};

function safeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeServiceMode(value: unknown): ServiceMode {
  return value === "online" ? "online" : "in_person";
}

function isMissingSchemaError(error: unknown) {
  const e = error as any;
  const code = String(e?.code || "");
  return code === "PGRST205" || code === "42P01" || code === "42703" || code === "PGRST204";
}

function deriveClinicModes(clinic: ClinicRow | null, usedLegacyFallback: boolean): ClinicServiceModes {
  if (!clinic) return DEFAULT_CLINIC_MODES;

  const address = String(clinic.address || "").trim();
  const city = String(clinic.city || "").trim();
  const state = String(clinic.state || "").trim();
  const hasAnyLocation = Boolean(address || city || state);

  const hasInPersonColumn = typeof clinic.appointment_in_person_enabled === "boolean";
  const hasOnlineColumn = typeof clinic.appointment_online_enabled === "boolean";

  if (!usedLegacyFallback && (hasInPersonColumn || hasOnlineColumn)) {
    const inPersonEnabled = hasInPersonColumn ? Boolean(clinic.appointment_in_person_enabled) : hasAnyLocation;
    const onlineEnabled = hasOnlineColumn ? Boolean(clinic.appointment_online_enabled) : false;

    if (inPersonEnabled || onlineEnabled) {
      return {
        in_person: inPersonEnabled,
        online: onlineEnabled,
      };
    }
  }

  return hasAnyLocation ? { in_person: true, online: false } : { in_person: false, online: true };
}

function toServicesPageItem(row: ServiceRow): ServicesPageItem {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    name: String(row.name || "Serviço").trim() || "Serviço",
    mode: normalizeServiceMode(row.mode),
    durationMinutes: Math.max(5, safeNumber(row.duration_minutes) || 30),
    priceBrl: row.price_brl == null ? null : Number(row.price_brl),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

function friendlyServicesError(error: unknown, fallback: string) {
  if (isMissingSchemaError(error)) {
    return "Seu banco ainda não está pronto para serviços. Finalize as migrations e tente novamente.";
  }
  return fallback;
}

async function fetchServicesClinic(clinicId: string): Promise<ServicesClinicQueryData> {
  try {
    let usedLegacyFallback = false;
    let response = await supabase
      .from("clinics")
      .select("id,name,address,city,state,appointment_in_person_enabled,appointment_online_enabled")
      .eq("id", clinicId)
      .limit(1)
      .maybeSingle();

    if (response.error && isMissingSchemaError(response.error)) {
      usedLegacyFallback = true;
      response = await supabase
        .from("clinics")
        .select("id,name,address,city,state")
        .eq("id", clinicId)
        .limit(1)
        .maybeSingle();
    }

    if (response.error) throw response.error;

    const clinic = ((response.data as any) || null) as ClinicRow | null;

    return {
      clinic,
      clinicModes: deriveClinicModes(clinic, usedLegacyFallback),
    };
  } catch (error) {
    throw new Error(friendlyServicesError(error, "Não foi possível carregar os dados da sua clínica agora. Tente novamente."));
  }
}

async function fetchServicesList(clinicId: string): Promise<ServicesListQueryData> {
  try {
    const { data, error, count } = await supabase
      .from("services")
      .select("id,clinic_id,name,mode,duration_minutes,price_brl,deleted_at,created_at", { count: "exact" })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (((data as any) || []) as ServiceRow[]).map(toServicesPageItem);
    return {
      rows,
      total: safeNumber(count ?? rows.length),
    };
  } catch (error) {
    throw new Error(friendlyServicesError(error, "Não foi possível carregar seus serviços agora. Tente novamente."));
  }
}

async function fetchServicesKpis(clinicId: string): Promise<ServicesPageKpis> {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("mode,duration_minutes,price_brl")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null);

    if (error) throw error;

    const rows = (((data as any) || []) as Array<{
      mode: string | null;
      duration_minutes: number | null;
      price_brl: number | null;
    }>);

    const servicesInPerson = rows.filter((row) => normalizeServiceMode(row.mode) === "in_person").length;
    const servicesOnline = rows.filter((row) => normalizeServiceMode(row.mode) === "online").length;
    const servicesWithoutPrice = rows.filter((row) => row.price_brl == null).length;
    const priceValues = rows
      .map((row) => row.price_brl)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const durationValues = rows
      .map((row) => safeNumber(row.duration_minutes))
      .filter((value) => value > 0);

    return {
      totalServices: rows.length,
      servicesInPerson,
      servicesOnline,
      servicesWithoutPrice,
      avgServicePriceBrl: priceValues.length
        ? priceValues.reduce((sum, value) => sum + value, 0) / priceValues.length
        : null,
      avgServiceDurationMinutes: durationValues.length
        ? durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length
        : null,
    };
  } catch (error) {
    throw new Error(friendlyServicesError(error, "Não foi possível carregar os indicadores dos serviços agora. Tente novamente."));
  }
}

export const servicesPageQueryKeys = {
  clinic: (clinicId: string) => ["services-page", "clinic", clinicId] as const,
  list: (clinicId: string) => ["services-page", "list", clinicId] as const,
  kpis: (clinicId: string) => ["services-page", "kpis", clinicId] as const,
};

export function servicesClinicQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: servicesPageQueryKeys.clinic(clinicId),
    queryFn: () => fetchServicesClinic(clinicId),
    staleTime: 5 * 60 * 1000,
  });
}

export function servicesListQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: servicesPageQueryKeys.list(clinicId),
    queryFn: () => fetchServicesList(clinicId),
    staleTime: 60 * 1000,
  });
}

export function servicesKpisQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: servicesPageQueryKeys.kpis(clinicId),
    queryFn: () => fetchServicesKpis(clinicId),
    staleTime: 60 * 1000,
  });
}

export async function prefetchServicesPageData({
  queryClient,
  userId,
}: {
  queryClient: QueryClient;
  userId: string;
}) {
  const clinicId = await ensureClinicIdForViewer(queryClient, userId);
  if (!clinicId) return;

  await Promise.all([
    queryClient.ensureQueryData(servicesClinicQueryOptions(clinicId)),
    queryClient.ensureQueryData(servicesKpisQueryOptions(clinicId)),
    queryClient.ensureQueryData(servicesListQueryOptions(clinicId)),
  ]);
}

export function useServicesPageData(userId: string | null) {
  const queryClient = useQueryClient();

  const entryQuery = useQuery({
    ...entryGateQueryOptions(userId || ""),
    enabled: Boolean(userId),
  });

  const clinicId = String(entryQuery.data?.clinicId || "").trim() || null;

  const clinicQuery = useQuery({
    ...servicesClinicQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const listQuery = useQuery({
    ...servicesListQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const kpisQuery = useQuery({
    ...servicesKpisQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const loadError = useMemo(() => {
    if (entryQuery.error) return "Não foi possível identificar sua clínica. Faça login novamente.";
    if (entryQuery.isSuccess && !clinicId) return "Não foi possível identificar sua clínica. Faça login novamente.";

    const firstError = [clinicQuery.error, listQuery.error, kpisQuery.error].find(Boolean);
    return firstError instanceof Error ? firstError.message : null;
  }, [clinicId, clinicQuery.error, entryQuery.error, entryQuery.isSuccess, kpisQuery.error, listQuery.error]);

  const isInitialLoading =
    Boolean(userId) &&
    (entryQuery.isLoading ||
      (Boolean(clinicId) &&
        ((clinicQuery.isLoading && !clinicQuery.data) || (listQuery.isLoading && !listQuery.data))));

  const loadingKpis = Boolean(clinicId) && kpisQuery.isLoading && !kpisQuery.data;

  const refetch = async () => {
    if (!clinicId) return;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: servicesPageQueryKeys.clinic(clinicId) }),
      queryClient.invalidateQueries({ queryKey: servicesPageQueryKeys.list(clinicId) }),
      queryClient.invalidateQueries({ queryKey: servicesPageQueryKeys.kpis(clinicId) }),
    ]);
  };

  return {
    clinicId,
    clinicName: clinicQuery.data?.clinic?.name ? String(clinicQuery.data.clinic.name).trim() || null : null,
    clinicModes: clinicQuery.data?.clinicModes ?? DEFAULT_CLINIC_MODES,
    loading: isInitialLoading,
    isInitialLoading,
    loadingKpis,
    error: loadError,
    rows: listQuery.data?.rows ?? [],
    total: listQuery.data?.total ?? 0,
    kpis: kpisQuery.data ?? null,
    refetch,
  };
}
