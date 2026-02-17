import { navigateToAppPath } from "@/lib/appOrigin";
import OperatingHoursEditor from "@/components/clinic/OperatingHoursEditor";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import {
  buildOperationHours,
  intervalFitsWithinDay,
  isStartBeforeEnd,
  OPERATING_DAYS as DAYS,
  type DayId,
  type OperationHours,
} from "@/lib/operatingHours";
import { motion } from "framer-motion";
import { Bot, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function step4DraftKey(clinicId: string) {
  return `cc_onboarding_step4_schedule_${clinicId}`;
}

function isSchemaMissingError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  if (code === "42703" /* undefined_column */) return true;
  if (code === "42P01" /* undefined_table */) return true;
  if (code === "PGRST204" /* columns not found (PostgREST) */) return true;
  const msg = String(e?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

export default function Step4Schedule({
  clinicId,
  persistedStep,
  onBack,
  onDone,
}: {
  clinicId: string;
  persistedStep?: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const { signOut: signOutSession } = useAuth();
  const readDraft = () => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(step4DraftKey(clinicId)) || "";
      return raw ? (JSON.parse(raw) as any) : null;
    } catch {
      return null;
    }
  };

  const draft = readDraft();
  const hasDraft = Boolean(draft);

  const [operationHours, setOperationHours] = useState<OperationHours>(() => {
    const fromDraft = (draft as any)?.operationHours;
    if (fromDraft && typeof fromDraft === "object") {
      const base = buildOperationHours({
        enabledDays: ["mon", "tue", "wed", "thu", "fri"],
        start: "08:00",
        end: "18:00",
      });
      for (const d of DAYS) {
        const row = (fromDraft as any)[d.id];
        if (!row || typeof row !== "object") continue;
        base[d.id] = {
          ...base[d.id],
          enabled: typeof row.enabled === "boolean" ? Boolean(row.enabled) : base[d.id].enabled,
          start: typeof row.start === "string" ? String(row.start).slice(0, 5) : base[d.id].start,
          end: typeof row.end === "string" ? String(row.end).slice(0, 5) : base[d.id].end,
          break_enabled:
            typeof (row as any).break_enabled === "boolean"
              ? Boolean((row as any).break_enabled)
              : base[d.id].break_enabled,
          break_start:
            typeof (row as any).break_start === "string" ? String((row as any).break_start).slice(0, 5) : base[d.id].break_start,
          break_end:
            typeof (row as any).break_end === "string" ? String((row as any).break_end).slice(0, 5) : base[d.id].break_end,
        };
      }
      return base;
    }

    // Legacy draft support (days + morning/afternoon).
    const legacyDaysRaw = Array.isArray((draft as any)?.days) ? ((draft as any).days as DayId[]) : null;
    const legacyDays = (legacyDaysRaw || []).filter((d) => DAYS.some((x) => x.id === d));
    const fallbackDays = legacyDays.length ? legacyDays : (["mon", "tue", "wed", "thu", "fri"] as DayId[]);

    const legacyStart =
      typeof (draft as any)?.morning?.start === "string" ? String((draft as any).morning.start).slice(0, 5) : "08:00";
    const legacyEnd = (() => {
      const aEnabled = (draft as any)?.afternoon?.enabled;
      const aEnd = (draft as any)?.afternoon?.end;
      const mEnd = (draft as any)?.morning?.end;
      if (aEnabled !== false && typeof aEnd === "string") return String(aEnd).slice(0, 5);
      if (typeof mEnd === "string") return String(mEnd).slice(0, 5);
      return "18:00";
    })();

    const legacyBase = buildOperationHours({ enabledDays: fallbackDays, start: legacyStart, end: legacyEnd });
    const legacyBreakEnabled = (draft as any)?.afternoon?.enabled === true;
    if (legacyBreakEnabled) {
      const bStart =
        typeof (draft as any)?.morning?.end === "string" ? String((draft as any).morning.end).slice(0, 5) : "12:00";
      const bEnd =
        typeof (draft as any)?.afternoon?.start === "string"
          ? String((draft as any).afternoon.start).slice(0, 5)
          : "13:30";
      for (const d of DAYS) {
        if (!legacyBase[d.id].enabled) continue;
        legacyBase[d.id] = {
          ...legacyBase[d.id],
          break_enabled: true,
          break_start: bStart,
          break_end: bEnd,
        };
      }
    }

    return legacyBase;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistedStepState, setPersistedStepState] = useState<number>(() => {
    const fromLocal = Number(draft?.persistedStep || 0);
    const fromProp = Number(persistedStep || 0);
    return Math.max(fromLocal || 0, fromProp || 0, 4);
  });

  const step = 4;
  const progress = Math.min(100, Math.max(0, (step / 7) * 100));

  const enabledDays = useMemo(
    () => DAYS.filter((d) => Boolean(operationHours[d.id]?.enabled)).map((d) => d.id) as DayId[],
    [operationHours]
  );

  useEffect(() => {
    // Persist draft locally on every change.
    try {
      window.localStorage.setItem(
        step4DraftKey(clinicId),
        JSON.stringify({ operationHours, persistedStep: persistedStepState })
      );
    } catch {
      // ignore
    }
  }, [clinicId, operationHours, persistedStepState]);

  useEffect(() => {
    // Hydrate persisted step from DB always (prevents progress regression),
    // and hydrate schedule only when there is no local draft (resume across devices/sessions).
    let cancelled = false;
    async function hydrate() {
      const selectBase =
        "onboarding_step,operation_days,shift_morning_enabled,shift_morning_start,shift_morning_end,shift_afternoon_enabled,shift_afternoon_start,shift_afternoon_end";

      let res = await supabase
        .from("clinics")
        .select(`${selectBase},operation_hours`)
        .eq("id", clinicId)
        .limit(1)
        .maybeSingle();

      if (res.error && isSchemaMissingError(res.error)) {
        res = await supabase.from("clinics").select(selectBase).eq("id", clinicId).limit(1).maybeSingle();
      }

      const { data, error } = res;

      if (cancelled) return;
      if (error) {
        if (import.meta.env.DEV) console.warn("[Onboarding] step4 hydrate error:", error);
        return;
      }

      const onboardingStepDb = Number((data as any)?.onboarding_step || 0);
      if (Number.isFinite(onboardingStepDb) && onboardingStepDb > 0) {
        setPersistedStepState((prev) => (prev > 0 ? Math.max(prev, onboardingStepDb) : onboardingStepDb));
      }

      if (hasDraft) return;

      const op = (data as any)?.operation_days as DayId[] | null | undefined;
      const validDays =
        Array.isArray(op) && op.length
          ? op.filter((d) => DAYS.some((x) => x.id === d))
          : (["mon", "tue", "wed", "thu", "fri"] as DayId[]);

      const startDb = typeof (data as any)?.shift_morning_start === "string" ? (data as any).shift_morning_start.slice(0, 5) : "08:00";
      const endDb = (() => {
        const aEnabled = (data as any)?.shift_afternoon_enabled;
        const aEnd = (data as any)?.shift_afternoon_end;
        const mEnd = (data as any)?.shift_morning_end;
        if (aEnabled === true && typeof aEnd === "string") return String(aEnd).slice(0, 5);
        if (typeof mEnd === "string") return String(mEnd).slice(0, 5);
        return "18:00";
      })();

      const base = buildOperationHours({ enabledDays: validDays, start: startDb, end: endDb });

      const intervalEnabledDb = (data as any)?.shift_afternoon_enabled === true;
      if (intervalEnabledDb) {
        const bStartDb = typeof (data as any)?.shift_morning_end === "string" ? String((data as any).shift_morning_end).slice(0, 5) : "12:00";
        const bEndDb = typeof (data as any)?.shift_afternoon_start === "string" ? String((data as any).shift_afternoon_start).slice(0, 5) : "13:30";
        for (const d of DAYS) {
          if (!base[d.id].enabled) continue;
          base[d.id] = { ...base[d.id], break_enabled: true, break_start: bStartDb, break_end: bEndDb };
        }
      }

      const rawHours = (data as any)?.operation_hours;
      if (rawHours && typeof rawHours === "object") {
        for (const d of DAYS) {
          const row = (rawHours as any)[d.id];
          if (!row || typeof row !== "object") continue;
          base[d.id] = {
            ...base[d.id],
            enabled: typeof row.enabled === "boolean" ? Boolean(row.enabled) : base[d.id].enabled,
            start: typeof row.start === "string" ? String(row.start).slice(0, 5) : base[d.id].start,
            end: typeof row.end === "string" ? String(row.end).slice(0, 5) : base[d.id].end,
            break_enabled:
              typeof (row as any).break_enabled === "boolean"
                ? Boolean((row as any).break_enabled)
                : base[d.id].break_enabled,
            break_start:
              typeof (row as any).break_start === "string"
                ? String((row as any).break_start).slice(0, 5)
                : base[d.id].break_start,
            break_end:
              typeof (row as any).break_end === "string"
                ? String((row as any).break_end).slice(0, 5)
                : base[d.id].break_end,
          };
        }
      }

      setOperationHours(base);
    }
    hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const validate = () => {
    if (!enabledDays.length) return "Selecione pelo menos um dia de operação.";
    for (const d of enabledDays) {
      const row = operationHours[d];
      if (!row) continue;
      if (!isStartBeforeEnd(row.start, row.end)) return "Revise o horário de atendimento.";
      if (row.break_enabled) {
        if (!isStartBeforeEnd(row.break_start, row.break_end)) return "Revise o intervalo de almoço.";
        if (!intervalFitsWithinDay(row.start, row.end, row.break_start, row.break_end)) {
          return "O intervalo de almoço precisa estar dentro do horário de atendimento.";
        }
      }
    }
    return null;
  };

  const onSubmit = async () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    try {
      const nextStep = Math.max(persistedStepState || 1, 5);

      const operationDaysPayload = enabledDays;
      const operationHoursPayload = operationHours;

      const minStart = operationDaysPayload.reduce((min, d) => {
        const s = operationHoursPayload[d]?.start || min;
        return s < min ? s : min;
      }, operationHoursPayload[operationDaysPayload[0]]?.start || "08:00");

      const maxEnd = operationDaysPayload.reduce((max, d) => {
        const e = operationHoursPayload[d]?.end || max;
        return e > max ? e : max;
      }, operationHoursPayload[operationDaysPayload[0]]?.end || "18:00");

      const breakDays = operationDaysPayload.filter((d) => Boolean(operationHoursPayload[d]?.break_enabled));
      const hasAnyBreak = breakDays.length > 0;
      const defaultBreakStart = "12:00";
      const defaultBreakEnd = "13:30";
      const breakStartGlobal = hasAnyBreak
        ? breakDays.reduce((min, d) => {
            const v = String(operationHoursPayload[d]?.break_start || defaultBreakStart).slice(0, 5);
            return v < min ? v : min;
          }, String(operationHoursPayload[breakDays[0]]?.break_start || defaultBreakStart).slice(0, 5))
        : defaultBreakStart;

      const breakEndGlobal = hasAnyBreak
        ? breakDays.reduce((max, d) => {
            const v = String(operationHoursPayload[d]?.break_end || defaultBreakEnd).slice(0, 5);
            return v > max ? v : max;
          }, String(operationHoursPayload[breakDays[0]]?.break_end || defaultBreakEnd).slice(0, 5))
        : defaultBreakEnd;

      const payloadFull: Record<string, any> = {
        onboarding_step: nextStep,
        operation_days: operationDaysPayload,
        operation_hours: operationHoursPayload,
        // Back-compat: keep a global window + optional interval.
        shift_morning_enabled: true,
        shift_morning_start: minStart,
        shift_morning_end: hasAnyBreak ? breakStartGlobal : maxEnd,
        shift_afternoon_enabled: hasAnyBreak,
        shift_afternoon_start: hasAnyBreak ? breakEndGlobal : null,
        shift_afternoon_end: hasAnyBreak ? maxEnd : null,
      };

      const { error: fullErr } = await supabase.from("clinics").update(payloadFull).eq("id", clinicId);
      if (fullErr) {
        if (import.meta.env.DEV) console.warn("[Onboarding] step4 update error:", fullErr);

        if (!isSchemaMissingError(fullErr)) {
          setError("Não foi possível salvar seus horários. Tente novamente.");
          setSaving(false);
          return;
        }

        const payloadFallback: Record<string, any> = {
          onboarding_step: nextStep,
          operation_days: operationDaysPayload,
          shift_morning_enabled: true,
          shift_morning_start: minStart,
          shift_morning_end: hasAnyBreak ? breakStartGlobal : maxEnd,
          shift_afternoon_enabled: hasAnyBreak,
          shift_afternoon_start: hasAnyBreak ? breakEndGlobal : null,
          shift_afternoon_end: hasAnyBreak ? maxEnd : null,
        };

        const { error: fbErr } = await supabase.from("clinics").update(payloadFallback).eq("id", clinicId);
        if (fbErr) {
          if (import.meta.env.DEV) console.warn("[Onboarding] step4 fallback update error:", fbErr);
          setError("Não foi possível salvar seus horários. Tente novamente.");
          setSaving(false);
          return;
        }
      }

      setPersistedStepState(nextStep);
      setSaving(false);
      onDone();
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step4 unexpected error:", e);
      setError("Não foi possível salvar seus horários. Tente novamente.");
      setSaving(false);
    }
  };

  const bannerText = useMemo(() => {
    const dayCount = enabledDays.length;
    const daysLabel = dayCount === 1 ? "1 dia" : `${dayCount} dias`;
    return { daysLabel, shifts: "os horários definidos" };
  }, [enabledDays.length]);

  const handleSignOut = async () => {
    await signOutSession();
    navigateToAppPath("/login");
  };

  return (
    <div className="min-h-[100dvh] bg-[#E9FDF4] text-[#002115] overflow-x-hidden">
      <OnboardingHeader step={step} totalSteps={7} progress={progress} onExit={handleSignOut} />

      <main className="pt-16 md:pt-20 pb-28 min-h-screen">
        <div className="max-w-5xl mx-auto px-5 md:px-12 py-10 md:py-14">
          <section className="mb-10 md:mb-12">
            <h2 className="font-['Syne'] text-4xl md:text-5xl font-800 text-[#003F2D] tracking-tight mb-4 leading-tight">
              Horários de atendimento
            </h2>
            <p className="text-[#3F4944] text-lg md:text-xl font-600 max-w-2xl font-['Space_Grotesk'] opacity-80">
              Configure os dias e horários em que a IA pode sugerir agendamentos.
            </p>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            <div className="lg:col-span-12">
              <OperatingHoursEditor
                value={operationHours}
                onChange={setOperationHours}
                className="md:space-y-8"
              />
            </div>

            <div className="lg:col-span-12">
              <div className="bg-[#062B1D] text-white p-7 md:p-8 rounded-[2.25rem] flex items-start gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-72 h-72 bg-[#23D996]/10 rounded-full -mr-24 -mt-24 blur-3xl" />
                <div className="w-16 h-16 rounded-2xl bg-[#23D996]/15 flex items-center justify-center text-[#23D996] shrink-0 border border-[#23D996]/20 backdrop-blur-sm">
                  <Bot className="w-8 h-8" strokeWidth={2.2} />
                </div>
                <div className="relative z-10">
                  <h4 className="text-[#23D996] font-800 uppercase tracking-widest text-xs mb-2 font-['Space_Grotesk']">
                    CortexAI
                  </h4>
                  <p className="text-[15px] md:text-lg font-600 leading-relaxed font-['Space_Grotesk'] text-white/90">
                    <span className="text-[#23D996] font-800">CortexAI</span> respeitará {bannerText.daysLabel} e{" "}
                    {bannerText.shifts} ao sugerir agendamentos, garantindo eficiência máxima sem conflitos de agenda.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-12">
              <div className="relative rounded-[2rem] overflow-hidden h-48 md:h-56 border border-[#025940]/[0.08] shadow-[0_30px_70px_-40px_rgba(2,89,64,0.55)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(35,217,150,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(2,89,64,0.14),transparent_55%)]" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#062B1D] via-[#062B1D]/90 to-transparent" />
                <div className="absolute inset-0 flex items-center px-7 md:px-16">
                  <div className="max-w-md">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-[#23D996] animate-pulse" />
                      <span className="text-[#23D996] text-xs font-800 uppercase tracking-widest font-['Space_Grotesk']">
                        Real-time update
                      </span>
                    </div>
                    <h4 className="text-white text-3xl md:text-4xl font-800 font-['Syne'] mb-3">Sincronização ativa</h4>
                    <p className="text-white/60 text-sm md:text-base leading-relaxed font-['Space_Grotesk']">
                      Alterações no cronograma são propagadas para os pontos de contato da sua clínica, evitando furos e
                      conflitos.
                    </p>
                    <div className="mt-5 flex items-center gap-3 text-white/55 text-sm font-['Space_Grotesk'] font-600">
                      <Info className="w-4 h-4" />
                      <span>Você pode ajustar isso a qualquer momento no painel.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-700 text-sm font-['Space_Grotesk'] font-600"
            >
              {error}
            </motion.div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 h-24 md:h-28 bg-[#062B1D]/95 backdrop-blur-xl border-t border-white/10 flex justify-between items-center px-5 md:px-12 z-40">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-3 text-white/70 font-800 text-[11px] md:text-xs uppercase tracking-[0.2em] hover:text-white transition-all font-['Space_Grotesk']"
        >
          <span aria-hidden>←</span>
          <span>Voltar</span>
        </button>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-800 text-white/40 uppercase tracking-[0.2em] font-['Space_Grotesk']">
            <span className="w-1.5 h-1.5 rounded-full bg-[#23D996] animate-pulse" />
            Salvamento automático
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="bg-white text-[#062B1D] h-14 md:h-16 px-8 md:px-12 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.32)] font-['Syne'] font-800 text-xs md:text-sm uppercase tracking-[0.2em] hover:bg-white/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] flex items-center gap-4"
          >
            <span>{saving ? "Salvando..." : "Continuar"}</span>
            <span className="text-[#23D996]" aria-hidden>
              →
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}
