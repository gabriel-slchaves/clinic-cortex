import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { resolveUserEntry } from "@/lib/entryGate";

export type AppViewerIdentity = {
  userId: string;
  email: string;
  fullName: string | null;
};

export type AppEntryGateData = {
  clinicId: string | null;
  onboardingDone: boolean;
  onboardingStep: number;
  target: string;
};

async function fetchEntryGate(userId: string): Promise<AppEntryGateData> {
  const decision = await resolveUserEntry(userId);
  return {
    clinicId: decision.clinicId || null,
    onboardingDone: decision.onboardingDone,
    onboardingStep: decision.onboardingStep,
    target: decision.target,
  };
}

export const appEntryGateQueryKeys = {
  entryGate: (userId: string) => ["entryGate", userId] as const,
};

export function entryGateQueryOptions(userId: string) {
  return queryOptions({
    queryKey: appEntryGateQueryKeys.entryGate(userId),
    queryFn: () => fetchEntryGate(userId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAppEntryGate(userId: string | null) {
  return useQuery({
    ...entryGateQueryOptions(userId || ""),
    enabled: Boolean(userId),
  });
}

export async function ensureClinicIdForViewer(queryClient: QueryClient, userId: string) {
  const entry = await queryClient.ensureQueryData(entryGateQueryOptions(userId));
  return String(entry?.clinicId || "").trim() || null;
}
