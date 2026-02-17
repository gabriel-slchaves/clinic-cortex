import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ensureClinicIdForViewer } from "@/hooks/useAppEntryGate";
import { supabase } from "@/lib/supabase";

export type CortexAIClinicRow = {
  id: string;
  name: string;
  assistant_area: string | null;
  assistant_specialties: string[] | null;
  assistant_personality?: string | null;
  assistant_prompt?: string | null;
  onboarding_step?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  operation_days?: string[] | null;
  operation_hours?: unknown | null;
  shift_morning_enabled?: boolean | null;
  shift_morning_start?: string | null;
  shift_morning_end?: string | null;
  shift_afternoon_enabled?: boolean | null;
  shift_afternoon_start?: string | null;
  shift_afternoon_end?: string | null;
};

export type CortexAIServiceLite = {
  name: string;
  mode: string;
  duration_minutes: number;
  price_brl: number | null;
};

type CortexAIConfigPayload = {
  clinic: CortexAIClinicRow | null;
  services: CortexAIServiceLite[];
};

function isSchemaMissingError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  if (code === "42703" || code === "42P01" || code === "PGRST204") return true;
  const message = String(e?.message || "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}

async function fetchCortexAIConfig(clinicId: string): Promise<CortexAIConfigPayload> {
  const clinicSelectBase =
    "id,name,assistant_area,assistant_specialties,assistant_personality,assistant_prompt,onboarding_step,address,city,state,operation_days,shift_morning_enabled,shift_morning_start,shift_morning_end,shift_afternoon_enabled,shift_afternoon_start,shift_afternoon_end";

  const clinicPromise = (async () => {
    let response = await supabase.from("clinics").select(`${clinicSelectBase},operation_hours`).eq("id", clinicId).limit(1).maybeSingle();
    if (response.error && isSchemaMissingError(response.error)) {
      response = await supabase.from("clinics").select(clinicSelectBase).eq("id", clinicId).limit(1).maybeSingle();
    }
    return response;
  })();

  const servicesPromise = supabase
    .from("services")
    .select("name,mode,duration_minutes,price_brl")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const [clinicResponse, servicesResponse] = await Promise.all([clinicPromise, servicesPromise]);
  if (clinicResponse.error) throw clinicResponse.error;
  if (servicesResponse.error) throw servicesResponse.error;

  return {
    clinic: ((clinicResponse.data as any) || null) as CortexAIClinicRow | null,
    services: (((servicesResponse.data as any) || []) as CortexAIServiceLite[]).filter(Boolean),
  };
}

export const cortexAIQueryKeys = {
  config: (clinicId: string) => ["cortexai", "config", clinicId] as const,
};

export function cortexAIConfigQueryOptions(clinicId: string) {
  return queryOptions({
    queryKey: cortexAIQueryKeys.config(clinicId),
    queryFn: () => fetchCortexAIConfig(clinicId),
    staleTime: 5 * 60 * 1000,
  });
}

export async function prefetchCortexAIPageData({ queryClient, userId }: { queryClient: QueryClient; userId: string }) {
  const clinicId = await ensureClinicIdForViewer(queryClient, userId);
  if (!clinicId) return;
  await queryClient.ensureQueryData(cortexAIConfigQueryOptions(clinicId));
}

export function useCortexAIConfig(clinicId: string | null) {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    ...cortexAIConfigQueryOptions(clinicId || ""),
    enabled: Boolean(clinicId),
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      personality,
      prompt,
      nextStep,
    }: {
      personality: string;
      prompt: string;
      nextStep?: number;
    }) => {
      if (!clinicId) throw new Error("Não foi possível identificar sua clínica.");

      const payload: Record<string, any> = {
        assistant_personality: personality,
        assistant_prompt: prompt,
      };
      if (typeof nextStep === "number") payload.onboarding_step = nextStep;

      const { error } = await supabase.from("clinics").update(payload).eq("id", clinicId);
      if (error) throw error;
      return payload;
    },
    onSuccess: (payload) => {
      if (!clinicId) return;
      queryClient.setQueryData<CortexAIConfigPayload | undefined>(cortexAIQueryKeys.config(clinicId), (current) =>
        current?.clinic
          ? {
              ...current,
              clinic: {
                ...current.clinic,
                assistant_personality: payload.assistant_personality,
                assistant_prompt: payload.assistant_prompt,
                onboarding_step:
                  typeof payload.onboarding_step === "number"
                    ? payload.onboarding_step
                    : current.clinic.onboarding_step ?? null,
              },
            }
          : current
      );
    },
  });

  return {
    clinic: configQuery.data?.clinic ?? null,
    services: configQuery.data?.services ?? [],
    loadError: configQuery.error instanceof Error ? "Não foi possível carregar suas configurações. Tente novamente." : null,
    isInitialLoading: Boolean(clinicId) && configQuery.isLoading && !configQuery.data,
    saveConfig: saveMutation.mutateAsync,
    saving: saveMutation.isPending,
  };
}
