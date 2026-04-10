import OperatingHoursEditor from "@/components/clinic/OperatingHoursEditor";
import {
  GoogleCalendarIcon,
  PaletteIcon,
  PlugIcon,
  WhatsAppIcon,
} from "@/components/settings/BrandIcons";
import IntegrationCard from "@/components/settings/IntegrationCard";
import SubscriptionBento from "@/components/settings/SubscriptionBento";
import TeamManagementCard, {
  type TeamManagementRow,
} from "@/components/settings/TeamManagementCard";
import WhatsAppIntegrationModal from "@/components/settings/WhatsAppIntegrationModal";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { useClinicWhatsAppConnection } from "@/hooks/useClinicWhatsAppConnection";
import {
  settingsQueryKeys,
  useSettingsPageData,
  type PlanOption,
} from "@/hooks/useSettingsPageData";
import {
  buildOperationHours,
  intervalFitsWithinDay,
  isStartBeforeEnd,
  OPERATING_DAYS as DAYS,
  type DayId,
  type OperationHours,
} from "@/lib/operatingHours";
import { supabase } from "@/lib/supabase";
import {
  createClinicTeamMember,
  updateClinicPlan,
  updateClinicTeamMember,
  type TeamMember,
  type TeamMemberInput,
  type TeamMemberUpdateInput,
  type TeamPlanSummary,
} from "@/lib/teamApi";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Save, Shield, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function isSchemaMissingError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  if (code === "42703") return true;
  if (code === "42P01") return true;
  if (code === "PGRST204") return true;
  const msg = String(e?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

function cloneOperationHours(value: OperationHours): OperationHours {
  return JSON.parse(JSON.stringify(value)) as OperationHours;
}

function safeNumber(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizePlanKey(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
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

function formatPlanPrice(value: number | null | undefined) {
  const amount = safeNumber(value);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPlanLimit(
  value: number | null | undefined,
  singular: string,
  plural: string
) {
  const amount = safeNumber(value);
  if (amount < 0) return "Ilimitado";
  if (amount === 1) return `1 ${singular}`;
  return `${amount} ${plural}`;
}

function sortTeamRows(rows: TeamManagementRow[]) {
  return [...rows].sort((left, right) =>
    left.fullName.localeCompare(right.fullName, "pt-BR")
  );
}

function recomputeTeamPlan(
  plan: TeamPlanSummary | null,
  rows: TeamManagementRow[]
) {
  if (!plan) return null;

  const usedDoctors = rows.filter(
    member => member.memberKind === "doctor"
  ).length;
  const usedSecretaries = rows.filter(
    member => member.memberKind === "secretary"
  ).length;

  return {
    ...plan,
    usedDoctors,
    usedSecretaries,
    remainingDoctors:
      plan.maxDoctors < 0 ? -1 : Math.max(0, plan.maxDoctors - usedDoctors),
    remainingSecretaries:
      plan.maxSecretaries < 0
        ? -1
        : Math.max(0, plan.maxSecretaries - usedSecretaries),
  } satisfies TeamPlanSummary;
}

function mergeMemberIntoRows(rows: TeamManagementRow[], member: TeamMember) {
  const hasExisting = rows.some(row => row.id === member.id);
  const nextRows = hasExisting
    ? rows.map(row => (row.id === member.id ? member : row))
    : [...rows, member];

  return sortTeamRows(nextRows);
}

const THEME_OPTIONS: Array<{
  id: Theme;
  name: string;
  color: string;
  description: string;
}> = [
  {
    id: "light",
    name: "Claro",
    color: "#E9FDF4",
    description: "Leve e clean.",
  },
  {
    id: "dark",
    name: "Escuro",
    color: "#131318",
    description: "Neutro e discreto.",
  },
  {
    id: "forest",
    name: "Verde floresta",
    color: "#062B1D",
    description: "Profundo e clínico.",
  },
  {
    id: "emerald",
    name: "Verde esmeralda",
    color: "#23D996",
    description: "Energia máxima (exemplo).",
  },
];

type SettingsTeamCache = {
  rows: TeamManagementRow[];
  plan: TeamPlanSummary | null;
  canManage: boolean;
  notice: string | null;
  error: string | null;
};

export default function Settings() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const { theme, setTheme, switchable } = useTheme();
  const queryClient = useQueryClient();
  const [location] = useLocation();

  const viewerEmail = String(user?.email || "").trim();
  const viewerFullName =
    String((user as any)?.user_metadata?.full_name || "").trim() || null;

  const settingsPage = useSettingsPageData({
    userId,
    viewerEmail,
    viewerFullName,
  });

  const settingsData = settingsPage.data;
  const clinicId = settingsPage.clinicId;
  const loading = settingsPage.isInitialLoading;
  const loadError = settingsPage.loadError;
  const planOptionsLoading = settingsPage.plansLoading;
  const teamLoading = settingsPage.teamLoading;
  const plansRefetch = settingsPage.plansRefetch;

  const [clinicName, setClinicName] = useState("");
  const [initialClinicName, setInitialClinicName] = useState("");
  const [operationHours, setOperationHours] = useState<OperationHours>(() =>
    buildOperationHours({
      enabledDays: ["mon", "tue", "wed", "thu", "fri"],
      start: "08:00",
      end: "18:00",
    })
  );
  const [initialOperationHours, setInitialOperationHours] =
    useState<OperationHours | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selectedPlanKey, setSelectedPlanKey] = useState("");
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const hydratedClinicIdRef = useRef<string | null>(null);

  const subscriptionPlanName = settingsData?.subscriptionPlanName || "";
  const subscriptionStatus = settingsData?.subscriptionStatus || "";
  const subscriptionSummary = settingsData?.subscriptionSummary || "";
  const monthlyPatientsValue = settingsData?.monthlyPatientsValue || "";
  const monthlyPatientsMeta = settingsData?.monthlyPatientsMeta || "";
  const monthlyPatientsProgress = settingsData?.monthlyPatientsProgress ?? null;
  const monthlyPatientsUnlimited =
    settingsData?.monthlyPatientsUnlimited ?? false;
  const clinicAreaId = settingsData?.clinicAreaId ?? null;
  const clinicAssistantSpecialties =
    settingsData?.clinicAssistantSpecialties ?? [];
  const teamRows = settingsData?.teamRows ?? [];
  const teamPlan = settingsData?.teamPlan ?? null;
  const teamCanManage = settingsData?.teamCanManage ?? false;
  const teamError = settingsData?.teamError ?? null;
  const planOptions = settingsData?.planOptions ?? [];
  const desiredPlanKey = settingsData?.desiredPlanKey ?? "";
  const canManagePlan = settingsData?.canManagePlan ?? false;
  const managePlanHint = settingsData?.managePlanHint ?? "";
  const canManageWhatsApp = Boolean(
    settingsData?.memberIsAdmin || settingsData?.memberRole === "owner"
  );
  const whatsAppConnection = useClinicWhatsAppConnection(clinicId);

  useEffect(() => {
    if (!settingsData || !clinicId) return;
    if (hydratedClinicIdRef.current === clinicId) return;

    hydratedClinicIdRef.current = clinicId;
    setClinicName(settingsData.clinicName);
    setInitialClinicName(settingsData.clinicName);
    setOperationHours(cloneOperationHours(settingsData.operationHours));
    setInitialOperationHours(cloneOperationHours(settingsData.operationHours));
    setSelectedPlanKey(settingsData.desiredPlanKey);
    setSaveError(null);
    setPlanError(null);
    setSaved(false);
  }, [clinicId, settingsData]);

  const enabledDays = useMemo(
    () =>
      DAYS.filter(day => Boolean(operationHours[day.id]?.enabled)).map(
        day => day.id
      ) as DayId[],
    [operationHours]
  );

  const syncSelectedPlanKey = (
    plans: PlanOption[],
    preferredPlanKey?: string
  ) => {
    const availableKeys = plans
      .map(plan => normalizePlanKey(plan.name))
      .filter(Boolean);
    const candidate =
      [normalizePlanKey(preferredPlanKey), desiredPlanKey, selectedPlanKey]
        .filter(Boolean)
        .find(
          value =>
            availableKeys.length === 0 || availableKeys.includes(String(value))
        ) || "";

    setSelectedPlanKey(candidate || availableKeys[0] || "");
  };

  const dirty = useMemo(() => {
    if (!initialOperationHours) return false;
    if (clinicName !== initialClinicName) return true;
    try {
      return (
        JSON.stringify(operationHours) !== JSON.stringify(initialOperationHours)
      );
    } catch {
      return true;
    }
  }, [clinicName, initialClinicName, initialOperationHours, operationHours]);

  useEffect(() => {
    if (!saved) return;
    const timeoutId = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [saved]);

  useEffect(() => {
    if (selectedPlanKey || !planOptions.length) return;
    const fallback = normalizePlanKey(planOptions[0]?.name);
    if (!fallback) return;
    setSelectedPlanKey(fallback);
  }, [planOptions, selectedPlanKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setWhatsAppModalOpen(params.get("integration") === "whatsapp");
  }, [location]);

  useEffect(() => {
    if (!whatsAppModalOpen || !clinicId) return;
    void whatsAppConnection.refreshConnection().catch(() => undefined);
  }, [clinicId, whatsAppConnection.refreshConnection, whatsAppModalOpen]);

  const handleWhatsAppModalChange = (open: boolean) => {
    setWhatsAppModalOpen(open);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (open) {
      url.searchParams.set("integration", "whatsapp");
    } else {
      url.searchParams.delete("integration");
    }
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  };

  const validate = () => {
    if (!enabledDays.length) return "Selecione pelo menos um dia de operação.";
    for (const dayId of enabledDays) {
      const row = operationHours[dayId];
      if (!row) continue;
      if (!isStartBeforeEnd(row.start, row.end))
        return "Revise o horário de atendimento.";
      if (row.break_enabled) {
        if (!isStartBeforeEnd(row.break_start, row.break_end))
          return "Revise o intervalo de almoço.";
        if (
          !intervalFitsWithinDay(
            row.start,
            row.end,
            row.break_start,
            row.break_end
          )
        ) {
          return "O intervalo de almoço precisa estar dentro do horário de atendimento.";
        }
      }
    }
    return null;
  };

  const saveClinicSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error("Não foi possível identificar a clínica.");

      const nextOperationHours = cloneOperationHours(operationHours);
      const activeDays = DAYS.filter(day =>
        Boolean(nextOperationHours[day.id]?.enabled)
      ).map(day => day.id) as DayId[];

      if (!activeDays.length) {
        throw new Error("Selecione pelo menos um dia de operação.");
      }

      const minStart = activeDays.reduce((min, dayId) => {
        const value = nextOperationHours[dayId]?.start || min;
        return value < min ? value : min;
      }, nextOperationHours[activeDays[0]]?.start || "08:00");

      const maxEnd = activeDays.reduce((max, dayId) => {
        const value = nextOperationHours[dayId]?.end || max;
        return value > max ? value : max;
      }, nextOperationHours[activeDays[0]]?.end || "18:00");

      const breakDays = activeDays.filter(dayId =>
        Boolean(nextOperationHours[dayId]?.break_enabled)
      );
      const hasAnyBreak = breakDays.length > 0;
      const defaultBreakStart = "12:00";
      const defaultBreakEnd = "13:30";

      const breakStartGlobal = hasAnyBreak
        ? breakDays.reduce(
            (min, dayId) => {
              const value = String(
                nextOperationHours[dayId]?.break_start || defaultBreakStart
              ).slice(0, 5);
              return value < min ? value : min;
            },
            String(
              nextOperationHours[breakDays[0]]?.break_start || defaultBreakStart
            ).slice(0, 5)
          )
        : defaultBreakStart;

      const breakEndGlobal = hasAnyBreak
        ? breakDays.reduce(
            (max, dayId) => {
              const value = String(
                nextOperationHours[dayId]?.break_end || defaultBreakEnd
              ).slice(0, 5);
              return value > max ? value : max;
            },
            String(
              nextOperationHours[breakDays[0]]?.break_end || defaultBreakEnd
            ).slice(0, 5)
          )
        : defaultBreakEnd;

      const trimmedName = clinicName.trim();

      const payloadFull: Record<string, any> = {
        name: trimmedName || null,
        operation_days: activeDays,
        operation_hours: nextOperationHours,
        shift_morning_enabled: true,
        shift_morning_start: minStart,
        shift_morning_end: hasAnyBreak ? breakStartGlobal : maxEnd,
        shift_afternoon_enabled: hasAnyBreak,
        shift_afternoon_start: hasAnyBreak ? breakEndGlobal : null,
        shift_afternoon_end: hasAnyBreak ? maxEnd : null,
      };

      const { error: fullError } = await supabase
        .from("clinics")
        .update(payloadFull)
        .eq("id", clinicId);
      if (fullError) {
        if (import.meta.env.DEV) {
          console.warn("[Settings] update error:", fullError);
        }

        if (!isSchemaMissingError(fullError)) {
          throw new Error(
            "Não foi possível salvar suas configurações. Tente novamente."
          );
        }

        const payloadFallback: Record<string, any> = {
          name: trimmedName || null,
          operation_days: activeDays,
          shift_morning_enabled: true,
          shift_morning_start: minStart,
          shift_morning_end: hasAnyBreak ? breakStartGlobal : maxEnd,
          shift_afternoon_enabled: hasAnyBreak,
          shift_afternoon_start: hasAnyBreak ? breakEndGlobal : null,
          shift_afternoon_end: hasAnyBreak ? maxEnd : null,
        };

        const { error: fallbackError } = await supabase
          .from("clinics")
          .update(payloadFallback)
          .eq("id", clinicId);
        if (fallbackError) {
          if (import.meta.env.DEV) {
            console.warn("[Settings] fallback update error:", fallbackError);
          }
          throw new Error(
            "Não foi possível salvar suas configurações. Tente novamente."
          );
        }
      }

      return {
        trimmedName,
        nextOperationHours,
      };
    },
    onSuccess: async ({ trimmedName, nextOperationHours }) => {
      if (!clinicId) return;

      setClinicName(trimmedName);
      setInitialClinicName(trimmedName);
      setInitialOperationHours(cloneOperationHours(nextOperationHours));
      setSaved(true);

      queryClient.setQueryData(
        settingsQueryKeys.clinicBase(clinicId),
        (current: any) =>
          current
            ? {
                ...current,
                clinicName: trimmedName,
                operationHours: cloneOperationHours(nextOperationHours),
              }
            : current
      );

      await queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.clinicBase(clinicId),
      });
    },
    onError: error => {
      if (import.meta.env.DEV) {
        console.warn("[Settings] unexpected save error:", error);
      }
      setSaveError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar suas configurações. Tente novamente."
      );
    },
  });

  const saveDesiredPlanMutation = useMutation({
    mutationFn: async (nextSelectedPlan: PlanOption) => {
      if (!clinicId) throw new Error("Não foi possível identificar a clínica.");

      const nextDesiredPlanName = String(
        nextSelectedPlan.name || selectedPlanKey
      ).trim();
      let effectivePlanName = nextDesiredPlanName;

      try {
        const payload = await updateClinicPlan(clinicId, nextSelectedPlan.id);
        effectivePlanName =
          String(payload.currentPlanName || nextDesiredPlanName).trim() ||
          nextDesiredPlanName;
      } catch (serviceError) {
        if (import.meta.env.DEV) {
          console.warn("[Settings] internal plan update error:", serviceError);
        }

        const { error } = await supabase
          .from("clinics")
          .update({ desired_plan: nextDesiredPlanName })
          .eq("id", clinicId);

        if (error) {
          throw serviceError instanceof Error ? serviceError : error;
        }
      }

      return {
        nextSelectedPlan,
        effectivePlanName,
        effectivePlanKey: normalizePlanKey(effectivePlanName),
      };
    },
    onSuccess: async ({
      nextSelectedPlan,
      effectivePlanName,
      effectivePlanKey,
    }) => {
      if (!clinicId) return;

      setSelectedPlanKey(effectivePlanKey);
      setPlanError(null);
      setPlanModalOpen(false);

      queryClient.setQueryData(
        settingsQueryKeys.clinicBase(clinicId),
        (current: any) =>
          current
            ? {
                ...current,
                desiredPlanName: effectivePlanName,
                desiredPlanKey: effectivePlanKey,
              }
            : current
      );

      queryClient.setQueryData(
        settingsQueryKeys.subscription(clinicId),
        (current: any) =>
          current
            ? {
                ...current,
                plan_id: nextSelectedPlan.id,
              }
            : current
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: settingsQueryKeys.clinicBase(clinicId),
        }),
        queryClient.invalidateQueries({
          queryKey: settingsQueryKeys.subscription(clinicId),
        }),
        queryClient.invalidateQueries({
          queryKey: settingsQueryKeys.team(clinicId),
        }),
      ]);
    },
    onError: error => {
      if (import.meta.env.DEV) {
        console.warn("[Settings] desired_plan unexpected error:", error);
      }
      setPlanError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o plano agora. Tente novamente."
      );
    },
  });

  const createTeamMemberMutation = useMutation({
    mutationFn: async (input: TeamMemberInput) => {
      if (!clinicId)
        throw new Error(
          "Não foi possível identificar a clínica para criar o usuário."
        );
      return createClinicTeamMember(clinicId, input);
    },
    onSuccess: createdMember => {
      if (!clinicId) return;

      queryClient.setQueryData<SettingsTeamCache | undefined>(
        settingsQueryKeys.team(clinicId),
        current => {
          if (!current) return current;

          const rows = mergeMemberIntoRows(current.rows, createdMember);
          return {
            ...current,
            rows,
            plan: recomputeTeamPlan(current.plan, rows),
          };
        }
      );

      toast.success("Usuário criado com sucesso", {
        description: `${createdMember.fullName} já aparece na equipe como convidado pendente.`,
      });

      void queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.team(clinicId),
      });
    },
  });

  const updateTeamMemberMutation = useMutation({
    mutationFn: async ({
      memberId,
      input,
    }: {
      memberId: string;
      input: TeamMemberUpdateInput;
    }) => {
      if (!clinicId)
        throw new Error(
          "Não foi possível identificar a clínica para editar o usuário."
        );
      return updateClinicTeamMember(clinicId, memberId, input);
    },
    onSuccess: updatedMember => {
      if (!clinicId) return;

      queryClient.setQueryData<SettingsTeamCache | undefined>(
        settingsQueryKeys.team(clinicId),
        current => {
          if (!current) return current;

          const rows = mergeMemberIntoRows(current.rows, updatedMember);
          return {
            ...current,
            rows,
            plan: recomputeTeamPlan(current.plan, rows),
          };
        }
      );

      toast.success("Usuário atualizado com sucesso", {
        description: `${updatedMember.fullName} agora está sincronizado com a equipe da clínica.`,
      });

      void queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.team(clinicId),
      });
    },
  });

  const saving = saveClinicSettingsMutation.isPending;
  const savingPlan = saveDesiredPlanMutation.isPending;
  const selectedPlan =
    planOptions.find(plan => normalizePlanKey(plan.name) === selectedPlanKey) ||
    null;
  const teamCardLoading =
    teamLoading ||
    createTeamMemberMutation.isPending ||
    updateTeamMemberMutation.isPending;

  const onSave = async () => {
    setSaveError(null);
    setSaved(false);

    const validationError = validate();
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    if (!clinicId) {
      setSaveError("Não foi possível identificar a clínica.");
      return;
    }

    try {
      await saveClinicSettingsMutation.mutateAsync();
    } catch {
      // handled by mutation callbacks
    }
  };

  const openPlanModal = async (preferredPlanKey?: string) => {
    setPlanError(null);
    setPlanModalOpen(true);
    syncSelectedPlanKey(planOptions, preferredPlanKey);

    if (!clinicId) {
      setPlanError(
        "Não foi possível identificar a clínica para carregar os planos."
      );
      return;
    }

    const latestPlans = await plansRefetch();
    const latestPlanRows = latestPlans.data ?? planOptions;
    if (latestPlanRows.length) {
      syncSelectedPlanKey(latestPlanRows, preferredPlanKey);
      return;
    }

    syncSelectedPlanKey(planOptions, preferredPlanKey);
  };

  const closePlanModal = () => {
    if (savingPlan) return;
    setPlanError(null);
    setPlanModalOpen(false);
  };

  const savePlanSelection = async () => {
    if (!clinicId) {
      setPlanError("Não foi possível identificar a clínica.");
      return;
    }
    if (!canManagePlan) {
      setPlanError(managePlanHint);
      return;
    }
    if (!selectedPlanKey) {
      setPlanError("Escolha um plano para continuar.");
      return;
    }
    if (!selectedPlan) {
      setPlanError("Não há um plano válido selecionado no momento.");
      return;
    }

    setPlanError(null);

    try {
      await saveDesiredPlanMutation.mutateAsync(selectedPlan);
    } catch {
      // handled by mutation callbacks
    }
  };

  const handleCreateTeamMember = async (input: TeamMemberInput) => {
    await createTeamMemberMutation.mutateAsync(input);
  };

  const handleUpdateTeamMember = async (
    memberId: string,
    input: TeamMemberUpdateInput
  ) => {
    await updateTeamMemberMutation.mutateAsync({ memberId, input });
  };

  return (
    <div className="min-h-screen bg-[var(--cc-theme-bg)] text-[var(--cc-theme-fg)] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-20 -left-24 w-[520px] h-[520px] rounded-full bg-[var(--cc-theme-accent-soft)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-28 w-[640px] h-[640px] rounded-full bg-[var(--cc-theme-accent-soft)] blur-3xl" />

      <main className="max-w-7xl mx-auto px-5 md:px-12 py-10 md:py-12 space-y-12">
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-900 uppercase tracking-[0.32em] font-['Space_Grotesk'] text-[var(--cc-theme-muted)]">
              Configurações
            </p>
            <h1 className="mt-2 text-4xl md:text-5xl font-900 font-['Syne'] tracking-tight">
              Configurações do sistema
            </h1>
            <p className="mt-3 text-[14px] md:text-[15px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600 max-w-2xl">
              Tela de exemplo — consistência visual, responsividade e reuso do
              editor de horários do onboarding.
            </p>
          </div>

          {saved || dirty ? (
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 rounded-full border text-[11px] font-900 uppercase tracking-[0.18em] font-['Space_Grotesk']",
                  saved
                    ? "bg-[var(--cc-theme-accent-soft)] text-[var(--cc-theme-accent)] border-[color:var(--cc-theme-accent)]"
                    : "bg-[var(--cc-theme-card)] text-[var(--cc-theme-fg)] border-[color:var(--cc-theme-card-border)]"
                )}
              >
                <span className="w-2 h-2 rounded-full bg-[var(--cc-theme-accent)]" />
                <span>{saved ? "Salvo" : "Pendentes"}</span>
              </div>
            </div>
          ) : null}
        </section>

        {loadError ? (
          <div className="cc-glass-card rounded-3xl p-6 border border-red-500/20 bg-red-500/10">
            <p className="text-red-100 font-['Syne'] font-800 text-lg">
              Não foi possível abrir as configurações
            </p>
            <p className="mt-2 text-sm text-red-100/80 font-['Space_Grotesk'] font-600">
              {loadError}
            </p>
          </div>
        ) : null}

        {saveError ? (
          <div className="cc-glass-card rounded-3xl p-6 border border-red-500/20 bg-red-500/10">
            <p className="text-red-100 font-['Space_Grotesk'] font-700">
              {saveError}
            </p>
          </div>
        ) : null}

        <SubscriptionBento
          clinicName={clinicName}
          onClinicNameChange={setClinicName}
          loading={loading}
          saving={saving}
          planName={subscriptionPlanName}
          subscriptionStatus={subscriptionStatus}
          subscriptionSummary={subscriptionSummary}
          monthlyPatientsValue={monthlyPatientsValue}
          monthlyPatientsMeta={monthlyPatientsMeta}
          monthlyPatientsProgress={monthlyPatientsProgress}
          monthlyPatientsUnlimited={monthlyPatientsUnlimited}
          storageValue="Indisponível"
          storageMeta="A telemetria de armazenamento ainda não foi implementada no sistema."
          onManagePlan={openPlanModal}
          canManagePlan={canManagePlan}
          managePlanHint={managePlanHint}
        />

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="size-11 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)]">
              <PaletteIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-2xl font-900 font-['Syne'] tracking-tight">
                Temas
              </h2>
              <p className="mt-1 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                Clique para alternar entre Claro, Escuro, Verde floresta e Verde
                esmeralda.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {THEME_OPTIONS.map(option => {
              const selected = theme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTheme?.(option.id)}
                  disabled={!switchable || !setTheme}
                  className={cn(
                    "cc-glass-card rounded-3xl p-5 text-left transition-all hover:-translate-y-0.5 active:translate-y-0",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    selected && "ring-2 ring-[color:var(--cc-theme-accent)]"
                  )}
                  aria-pressed={selected}
                >
                  <div className="flex items-start justify-between gap-4 text-[var(--cc-theme-fg)]">
                    <div>
                      <p className="text-[14px] font-900 font-['Syne']">
                        {option.name}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                        {option.description}
                      </p>
                    </div>
                    {selected ? (
                      <span className="size-8 rounded-full bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-accent)] flex items-center justify-center text-[var(--cc-theme-accent)]">
                        <CheckCircle2 className="size-4" strokeWidth={2.4} />
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="mt-5 h-12 rounded-2xl border border-[color:var(--cc-theme-card-border)]"
                    style={{ backgroundColor: option.color }}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="size-11 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)]">
              <PlugIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-2xl font-900 font-['Syne'] tracking-tight">
                Integrações
              </h2>
              <p className="mt-1 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                Integrações ativas para comunicação e agenda.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IntegrationCard
              title="WhatsApp Business"
              description="Conexão oficial via Meta Cloud API, onboarding self-serve e webhook assinado."
              status={whatsAppConnection.statusMeta.label}
              icon={<WhatsAppIcon className="size-8" />}
              cta={canManageWhatsApp ? "Configurar" : "Ver status"}
              onClick={() => handleWhatsAppModalChange(true)}
              disabled={!clinicId}
              statusTone={whatsAppConnection.statusMeta.tone}
              footer={
                <div className="rounded-2xl border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] px-4 py-3">
                  <p className="text-[11px] font-900 uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk']">
                    Estado operacional
                  </p>
                  <p className="mt-2 text-[13px] font-800 text-[var(--cc-theme-fg)] font-['Syne']">
                    {whatsAppConnection.connection?.lastEvent?.message ||
                      (whatsAppConnection.connection?.operationalStatus ===
                      "onboarding"
                        ? "Onboarding oficial em andamento."
                        : whatsAppConnection.connection?.operationalStatus ===
                            "action_required"
                          ? "A Meta sinalizou ação necessária para essa clínica."
                          : "Nenhum evento crítico recente.")}
                  </p>
                </div>
              }
            />
            <IntegrationCard
              title="Google Calendar"
              description="Sincronização bidirecional para agenda dos profissionais."
              status="Sincronizado"
              icon={<GoogleCalendarIcon className="size-8" />}
            />
          </div>
        </section>

        {teamError ? (
          <div className="cc-glass-card rounded-3xl p-5 border border-red-500/20 bg-red-500/10">
            <p className="text-red-100 font-['Syne'] font-800 text-base">
              Gestão de equipe indisponível
            </p>
            <p className="mt-2 text-sm text-red-100/80 font-['Space_Grotesk'] font-600">
              {teamError}
            </p>
          </div>
        ) : null}

        <TeamManagementCard
          rows={teamRows}
          plan={teamPlan}
          clinicAreaId={clinicAreaId}
          clinicSpecialties={clinicAssistantSpecialties}
          canManage={teamCanManage}
          loading={teamCardLoading}
          onCreate={handleCreateTeamMember}
          onUpdate={handleUpdateTeamMember}
          onManagePlan={openPlanModal}
        />

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="size-11 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)]">
              <CalendarDays className="size-5" strokeWidth={2.4} />
            </span>
            <div>
              <h2 className="text-2xl font-900 font-['Syne'] tracking-tight">
                Horários
              </h2>
              <p className="mt-1 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                Reaproveitando o mesmo editor do onboarding (inputs + ícones).
              </p>
            </div>
          </div>

          <OperatingHoursEditor
            value={operationHours}
            onChange={setOperationHours}
            className="md:space-y-8"
            showTimezoneNote
            timezoneNote="Todos os horários estão em UTC-3 (São Paulo)."
            disabled={loading || saving}
          />
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="size-11 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)]">
              <Shield className="size-5" strokeWidth={2.4} />
            </span>
            <div>
              <h2 className="text-2xl font-900 font-['Syne'] tracking-tight">
                Segurança
              </h2>
              <p className="mt-1 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                Cards de exemplo (2FA, sessões, LGPD).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="cc-glass-card rounded-3xl p-6 text-[var(--cc-theme-fg)] flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <Shield
                  className="size-5 text-[var(--cc-theme-accent)]"
                  strokeWidth={2.4}
                />
                <div>
                  <p className="text-[14px] font-900 font-['Syne']">
                    Autenticação em 2 fatores (2FA)
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                    Obrigatório para admins (exemplo).
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-accent)] text-[var(--cc-theme-accent)] text-[11px] font-900 uppercase tracking-[0.14em] font-['Space_Grotesk']">
                Ativo
              </span>
            </div>

            <div className="cc-glass-card rounded-3xl p-6 text-[var(--cc-theme-fg)] flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <Shield
                  className="size-5 text-[var(--cc-theme-accent)]"
                  strokeWidth={2.4}
                />
                <div>
                  <p className="text-[14px] font-900 font-['Syne']">
                    Gestão de sessão
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                    Logout automático após 30 min (exemplo).
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-[var(--cc-theme-card)] border border-[color:var(--cc-theme-card-border)] text-[var(--cc-theme-muted)] text-[11px] font-900 uppercase tracking-[0.14em] font-['Space_Grotesk']">
                Ajustar
              </span>
            </div>
          </div>
        </section>

        <section className="cc-glass-card rounded-3xl p-6 md:p-7 text-[var(--cc-theme-fg)] flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <p className="text-[11px] font-900 uppercase tracking-[0.28em] text-[var(--cc-theme-muted)] font-['Space_Grotesk']">
              Salvar alterações
            </p>
            <p className="mt-2 text-[14px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
              {dirty
                ? "Existem mudanças pendentes (clínica/horários)."
                : "Nenhuma mudança pendente agora."}
            </p>
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={loading || saving || !dirty}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 font-['Syne'] font-900 text-[12px] uppercase tracking-[0.22em] transition-all",
              "bg-[var(--cc-theme-action-bg)] text-[var(--cc-theme-action-fg)] hover:brightness-110 active:scale-[0.99]",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Save className="size-4" strokeWidth={2.6} />
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </section>
      </main>

      {planModalOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center px-5"
          role="dialog"
          aria-modal="true"
          aria-label="Gerenciar plano"
          onClick={closePlanModal}
        >
          <div className="absolute inset-0 bg-[#062B1D]/55 backdrop-blur-[6px]" />
          <div
            className="relative w-full max-w-4xl cc-glass-card rounded-[2rem] border border-[color:var(--cc-theme-card-border)] shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden"
            onClick={event => event.stopPropagation()}
          >
            <div className="p-7 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-['Syne'] font-800 text-2xl text-[var(--cc-theme-fg)]">
                    Gerenciar plano
                  </h3>
                  <p className="mt-2 text-[14px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600 max-w-2xl">
                    Escolha o plano desejado para a clínica. O upgrade está
                    liberado agora e libera os novos limites imediatamente; a
                    cobrança via Stripe entra depois.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closePlanModal}
                  className="w-10 h-10 rounded-2xl bg-[var(--cc-theme-card)] border border-[color:var(--cc-theme-card-border)] text-[var(--cc-theme-fg)] hover:bg-[var(--cc-theme-accent-soft)] transition-colors inline-flex items-center justify-center"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!canManagePlan ? (
                <div className="mt-6 rounded-3xl border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] px-5 py-4">
                  <p className="text-[14px] text-[var(--cc-theme-fg)] font-['Syne'] font-800">
                    Alteração restrita
                  </p>
                  <p className="mt-2 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                    {managePlanHint}
                  </p>
                </div>
              ) : null}

              <div className="mt-7">
                {planOptionsLoading ? (
                  <div className="rounded-3xl border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] px-5 py-10 text-center">
                    <p className="text-[15px] font-900 font-['Syne'] text-[var(--cc-theme-fg)]">
                      Carregando planos disponíveis…
                    </p>
                    <p className="mt-2 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                      Estamos buscando as opções disponíveis para a sua clínica.
                    </p>
                  </div>
                ) : planOptions.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {planOptions.map(plan => {
                      const planKey = normalizePlanKey(plan.name);
                      const selected = selectedPlanKey === planKey;
                      const isCurrentDesired = desiredPlanKey === planKey;

                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => {
                            if (!canManagePlan) return;
                            setSelectedPlanKey(planKey);
                          }}
                          disabled={!canManagePlan}
                          className={cn(
                            "text-left rounded-3xl p-6 border transition-all",
                            "bg-[var(--cc-theme-card)]",
                            canManagePlan && "hover:-translate-y-0.5",
                            selected
                              ? "border-[color:var(--cc-theme-accent)] shadow-[0_18px_50px_rgba(35,217,150,0.18)]"
                              : "border-[color:var(--cc-theme-card-border)]",
                            !canManagePlan && "opacity-95 cursor-default"
                          )}
                          aria-pressed={selected}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[20px] font-900 font-['Syne'] text-[var(--cc-theme-fg)]">
                                {toPlanLabel(plan.name)}
                              </p>
                              <p className="mt-2 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                                {formatPlanPrice(plan.price_brl)} / mês
                              </p>
                            </div>

                            {selected ? (
                              <span className="px-3 py-1 rounded-full bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-accent)] text-[var(--cc-theme-accent)] text-[11px] font-900 uppercase tracking-[0.14em] font-['Space_Grotesk']">
                                Selecionado
                              </span>
                            ) : isCurrentDesired ? (
                              <span className="px-3 py-1 rounded-full bg-[var(--cc-theme-card-solid)] border border-[color:var(--cc-theme-card-border)] text-[var(--cc-theme-muted)] text-[11px] font-900 uppercase tracking-[0.14em] font-['Space_Grotesk']">
                                Atual
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-6 grid grid-cols-3 gap-3">
                            <div className="rounded-2xl bg-[var(--cc-theme-card-solid)] border border-[color:var(--cc-theme-card-border)] p-3">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-700">
                                Médicos
                              </p>
                              <p className="mt-2 text-[14px] font-900 font-['Syne'] text-[var(--cc-theme-fg)]">
                                {formatPlanLimit(
                                  plan.max_doctors,
                                  "médico",
                                  "médicos"
                                )}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-[var(--cc-theme-card-solid)] border border-[color:var(--cc-theme-card-border)] p-3">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-700">
                                Secretárias
                              </p>
                              <p className="mt-2 text-[14px] font-900 font-['Syne'] text-[var(--cc-theme-fg)]">
                                {formatPlanLimit(
                                  plan.max_secretaries,
                                  "vaga",
                                  "vagas"
                                )}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-[var(--cc-theme-card-solid)] border border-[color:var(--cc-theme-card-border)] p-3">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-700">
                                Pacientes
                              </p>
                              <p className="mt-2 text-[14px] font-900 font-['Syne'] text-[var(--cc-theme-fg)]">
                                {formatPlanLimit(
                                  plan.max_patients,
                                  "paciente",
                                  "pacientes"
                                )}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] px-5 py-10 text-center">
                    <p className="text-[15px] font-900 font-['Syne'] text-[var(--cc-theme-fg)]">
                      Nenhum plano disponível
                    </p>
                    <p className="mt-2 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                      Não conseguimos listar planos agora. Tente novamente em
                      instantes.
                    </p>
                  </div>
                )}
              </div>

              {planError ? (
                <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-red-100 text-[13px] font-['Space_Grotesk'] font-700">
                  {planError}
                </div>
              ) : null}

              <div className="mt-7 flex flex-col-reverse sm:flex-row gap-3 justify-end">
                <button
                  type="button"
                  onClick={closePlanModal}
                  disabled={savingPlan}
                  className="h-12 px-5 rounded-2xl border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] text-[var(--cc-theme-fg)] font-['Space_Grotesk'] font-800 hover:bg-[var(--cc-theme-accent-soft)] transition-colors disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={savePlanSelection}
                  disabled={
                    savingPlan ||
                    planOptionsLoading ||
                    !canManagePlan ||
                    !selectedPlan ||
                    !selectedPlanKey ||
                    selectedPlanKey === desiredPlanKey
                  }
                  className="h-12 px-5 rounded-2xl bg-[var(--cc-theme-action-bg)] text-[var(--cc-theme-action-fg)] font-['Syne'] font-800 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingPlan ? "Salvando plano..." : "Salvar plano"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <WhatsAppIntegrationModal
        open={whatsAppModalOpen}
        onOpenChange={handleWhatsAppModalChange}
        clinicName={clinicName || settingsData?.clinicName || "Clínica"}
        canManage={canManageWhatsApp}
        connection={whatsAppConnection.connection}
        loading={whatsAppConnection.loading}
        isStarting={whatsAppConnection.isStarting}
        pollingActive={whatsAppConnection.pollingActive}
        error={whatsAppConnection.error}
        onRefresh={whatsAppConnection.refreshConnection}
        onStartConnection={whatsAppConnection.startConnection}
      />
    </div>
  );
}
