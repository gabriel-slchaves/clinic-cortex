import { resolveUserEntry } from "@/lib/entryGate";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

export type ClinicNotification = {
  id: string;
  clinicId: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  active: boolean;
  metadata: Record<string, unknown> | null;
  resolvedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

function isSchemaMissingError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  if (code === "42703" || code === "42P01" || code === "PGRST204") return true;
  return false;
}

async function fetchClinicNotifications(userId: string) {
  const entry = await resolveUserEntry(userId);
  const clinicId = String(entry?.clinicId || "").trim();
  if (!clinicId) return [] as ClinicNotification[];

  const { data, error } = await supabase
    .from("clinic_notifications")
    .select("id,clinic_id,kind,severity,title,message,active,metadata,resolved_at,updated_at,created_at")
    .eq("clinic_id", clinicId)
    .order("active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(12);

  if (error) {
    if (isSchemaMissingError(error)) return [] as ClinicNotification[];
    throw error;
  }

  return ((data as any[]) || []).map((row) => ({
    id: String(row.id),
    clinicId: String(row.clinic_id),
    kind: String(row.kind || ""),
    severity: (String(row.severity || "info") as ClinicNotification["severity"]) || "info",
    title: String(row.title || ""),
    message: String(row.message || ""),
    active: Boolean(row.active),
    metadata:
      row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    updatedAt: String(row.updated_at || row.created_at || ""),
    createdAt: String(row.created_at || ""),
  }));
}

export function useClinicNotifications(userId: string | null) {
  return useQuery({
    queryKey: ["clinicNotifications", userId],
    queryFn: () => fetchClinicNotifications(userId || ""),
    enabled: Boolean(userId),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
