import { navigateToAppPath } from "@/lib/appOrigin";
import { CLINIC_AREAS, type AreaId } from "@/lib/clinicAreas";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import { AnimatePresence, motion } from "framer-motion";
import { X, CheckCircle2, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function storageKey(clinicId: string) {
  return `cc_onboarding_step3_ai_${clinicId}`;
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

export default function Step3AiAssistant({
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
  const readLocal = () => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey(clinicId)) || "";
      return raw
        ? (JSON.parse(raw) as { areaId?: AreaId; specialties?: string[]; persistedStep?: number })
        : null;
    } catch {
      return null;
    }
  };

  const draft = readLocal();
  const hasDraft = Boolean(draft);

  const [areaId, setAreaId] = useState<AreaId>(() => {
    const v = draft?.areaId;
    return v && CLINIC_AREAS.some((a) => a.id === v) ? v : "nutricao";
  });
  const [selected, setSelected] = useState<string[]>(() => {
    return Array.isArray(draft?.specialties) ? draft!.specialties!.filter(Boolean) : [];
  });
  const [persistedStepState, setPersistedStepState] = useState<number>(() => {
    const fromLocal = Number(draft?.persistedStep || 0);
    const fromProp = Number(persistedStep || 0);
    return Math.max(fromLocal || 0, fromProp || 0, 3);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = 3;
  const progress = Math.min(100, Math.max(0, (step / 7) * 100));

  const area = useMemo(() => CLINIC_AREAS.find((a) => a.id === areaId) || CLINIC_AREAS[0], [areaId]);

  useEffect(() => {
    // Persist draft on every change so tab reloads/back don't wipe selections.
    try {
      window.localStorage.setItem(
        storageKey(clinicId),
        JSON.stringify({ areaId, specialties: selected, persistedStep: persistedStepState })
      );
    } catch {
      // ignore
    }
  }, [clinicId, areaId, selected, persistedStepState]);

  useEffect(() => {
    // Hydrate progress from DB always, and hydrate selections only when there's no local draft.
    let cancelled = false;
    async function hydrate() {
      const { data, error } = await supabase
        .from("clinics")
        .select("onboarding_step,assistant_area,assistant_specialties")
        .eq("id", clinicId)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        if (import.meta.env.DEV) console.warn("[Onboarding] step3 hydrate error:", error);
        return;
      }

      const onboardingStepDb = Number((data as any)?.onboarding_step || 0);
      if (Number.isFinite(onboardingStepDb) && onboardingStepDb > 0) {
        setPersistedStepState((prev) => (prev > 0 ? Math.max(prev, onboardingStepDb) : onboardingStepDb));
      }

      if (hasDraft) return;

      const areaDb = (data as any)?.assistant_area as AreaId | null | undefined;
      if (areaDb && CLINIC_AREAS.some((a) => a.id === areaDb)) setAreaId(areaDb);

      const specs = (data as any)?.assistant_specialties as string[] | null | undefined;
      if (Array.isArray(specs)) setSelected(specs.filter(Boolean));
    }
    hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const toggleSpecialty = (name: string) => {
    setSelected((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  };

  const handleSignOut = async () => {
    await signOutSession();
    navigateToAppPath("/login");
  };

  const onSubmit = async () => {
    setError(null);
    if (!areaId) {
      setError("Selecione uma área de atendimento.");
      return;
    }

    setSaving(true);
    try {
      // Try to persist on the clinic row if the columns exist.
      // If not, we still advance onboarding by updating onboarding_step.
      const nextStep = Math.max(persistedStepState || 1, 4);
      const payloadFull: Record<string, any> = {
        onboarding_step: nextStep,
        assistant_area: areaId,
        assistant_specialties: selected,
      };

      const { error: fullErr } = await supabase.from("clinics").update(payloadFull).eq("id", clinicId);
      if (fullErr) {
        if (import.meta.env.DEV) console.warn("[Onboarding] step3 update error:", fullErr);

        if (!isSchemaMissingError(fullErr)) {
          setError("Não foi possível salvar. Tente novamente.");
          setSaving(false);
          return;
        }

        const { error: stepErr } = await supabase.from("clinics").update({ onboarding_step: nextStep }).eq("id", clinicId);
        if (stepErr) {
          if (import.meta.env.DEV) console.warn("[Onboarding] step3 fallback update error:", stepErr);
          setError("Não foi possível salvar. Tente novamente.");
          setSaving(false);
          return;
        }
      }

      setPersistedStepState(nextStep);
      setSaving(false);
      onDone();
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step3 unexpected error:", e);
      setError("Não foi possível salvar. Tente novamente.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#E9FDF4] text-[#002115] overflow-x-hidden">
      <OnboardingHeader step={step} totalSteps={7} progress={progress} onExit={handleSignOut} />

      <main className="pt-16 md:pt-20 pb-28 min-h-screen">
        <div className="max-w-6xl mx-auto px-5 md:px-12 py-10 md:py-14">
          <section className="mb-10 md:mb-14">
            <h2 className="font-['Syne'] text-4xl md:text-5xl font-800 text-[#003F2D] tracking-tight mb-4">
              Personalize sua Secretária de IA
            </h2>
            <p className="text-[#3F4944] text-lg md:text-xl font-600 max-w-3xl leading-relaxed font-['Space_Grotesk'] opacity-80">
              Escolha a área e o perfil de atendimento da sua clínica para ajustarmos o tom e o vocabulário técnico da
              sua inteligência.
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 mb-10 md:mb-14">
              {CLINIC_AREAS.map((a) => {
              const active = a.id === areaId;
              const Icon = a.Icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAreaId(a.id);
                    setSelected([]); // specialties depend on area
                  }}
                  className={`group relative text-left rounded-3xl p-7 md:p-8 border transition-all duration-300 ${active
                    ? "bg-[#003F2D] border-[#23D996]/60 ring-2 ring-[#23D996]/60 shadow-[0_20px_50px_-18px_rgba(0,63,45,0.45)]"
                    : "bg-white border-[#025940]/[0.08] hover:border-[#23D996]/30 hover:shadow-xl"
                    }`}
                >
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-colors ${active ? "bg-[#23D996] text-[#003F2D]" : "bg-[#E8F5ED] text-[#118C5F] group-hover:bg-[#DFF3E8]"
                      }`}
                  >
                    <Icon className="w-7 h-7" strokeWidth={2.2} />
                  </div>
                  <h3 className={`font-['Syne'] text-2xl font-800 mb-2.5 ${active ? "text-white" : "text-[#003F2D]"}`}>
                    {a.title}
                  </h3>
                  <p
                    className={`text-sm leading-relaxed font-['Space_Grotesk'] ${active ? "text-[rgba(255,255,255,0.72)]" : "text-[#3F4944] opacity-75"
                      }`}
                  >
                    {a.description}
                  </p>

                  <AnimatePresence>
                    {active && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        className="absolute top-5 right-5 text-[#23D996]"
                      >
                        <CheckCircle2 className="w-8 h-8" strokeWidth={2.3} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>

          <motion.div layout className="will-change-transform">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={area.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="bg-[#062B1D]/[0.04] rounded-[2.5rem] p-7 md:p-12 border border-[#025940]/[0.08]"
              >
                <div className="flex items-center justify-between gap-6 mb-8 md:mb-10">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#118C5F] flex items-center justify-center text-white shadow-[0_10px_24px_-16px_rgba(2,89,64,0.7)]">
                      <area.Icon className="w-5 h-5" strokeWidth={2.3} />
                    </div>
                    <div>
                      <h4 className="font-['Syne'] text-lg md:text-xl font-800 text-[#003F2D]">
                        Especialidades em {area.title}
                      </h4>
                      <p className="text-[10px] md:text-xs font-800 text-[#3F4944]/60 uppercase tracking-[0.3em] font-['Space_Grotesk'] mt-1">
                        Selecione uma ou mais
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {area.specialties.map((s) => {
                    const on = selected.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSpecialty(s)}
                        className={`rounded-full px-6 md:px-8 py-3.5 md:py-4 text-sm transition-all active:translate-y-[1px] font-['Space_Grotesk'] ${on
                          ? "bg-[#062B1D] text-white font-800 shadow-[0_16px_30px_-18px_rgba(6,43,29,0.85)]"
                          : "bg-white text-[#003F2D] border border-[#025940]/10 font-700 hover:bg-[#F0FAF5] hover:border-[#23D996]/25"
                          }`}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          {s}
                          {on && <X className="w-4 h-4 opacity-80" strokeWidth={2.4} />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 flex items-center gap-3 text-[#3F4944]/55 text-sm font-['Space_Grotesk'] font-600">
                  <Info className="w-4 h-4" />
                  <span>As especialidades selecionadas influenciam o vocabulário técnico da IA.</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>

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
      </footer>
    </div>
  );
}
