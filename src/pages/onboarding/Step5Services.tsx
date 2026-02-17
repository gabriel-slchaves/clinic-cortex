import { navigateToAppPath } from "@/lib/appOrigin";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Building2,
  FilePlus2,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  Video,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ServiceMode = "in_person" | "online";
type ClinicModes = { in_person: boolean; online: boolean };
type ServiceRow = {
  id: string;
  clinic_id: string;
  name: string;
  mode: string;
  duration_minutes: number;
  price_brl: number | null;
  deleted_at: string | null;
  created_at: string;
};

function normalizeServiceMode(value: unknown): ServiceMode {
  return value === "online" ? "online" : "in_person";
}

function isSchemaMissing(error: any) {
  const code = String(error?.code || "");
  return code === "42703" || code === "42P01" || code === "PGRST204";
}

const INPUT =
  "w-full bg-[#F4FBF7] border-2 border-transparent rounded-2xl px-5 py-4 focus:ring-0 focus:bg-white focus:border-[#23D996]/40 transition-all placeholder:text-black/30 font-['Space_Grotesk'] font-600 text-[15px] text-[#062B1D]";

function step5DraftKey(clinicId: string) {
  return `cc_onboarding_step5_services_${clinicId}`;
}

function step2DraftKey(clinicId: string) {
  return `cc_onboarding_step2_location_${clinicId}`;
}

function readStep2Modes(clinicId: string): ClinicModes | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(step2DraftKey(clinicId)) || "";
    if (!raw) return null;
    const data = JSON.parse(raw) as any;
    const m = data?.modes;
    if (m && typeof m === "object") {
      const in_person = Boolean(m?.in_person);
      const online = Boolean(m?.online);
      if (in_person || online) return { in_person, online };
    }
    if (data?.mode === "online") return { in_person: false, online: true };
    if (data?.mode === "in_person") return { in_person: true, online: false };
    return null;
  } catch {
    return null;
  }
}

function normalizePriceInput(value: string) {
  // Keep only digits and a single comma for cents.
  let v = value.replace(/[^\d,]/g, "");
  const parts = v.split(",");
  const int = parts[0] || "";
  const dec = (parts[1] || "").slice(0, 2);
  v = dec ? `${int},${dec}` : int;
  return v;
}

function parsePriceBRL(value: string) {
  const v = normalizePriceInput(value);
  if (!v) return null;
  const [i, d = ""] = v.split(",");
  const int = Number(i || "0");
  const dec = Number((d || "").padEnd(2, "0"));
  if (!Number.isFinite(int) || !Number.isFinite(dec)) return null;
  return int + dec / 100;
}

function formatPriceBRL(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "";
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  }
}

export default function Step5Services({
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
      const raw = window.localStorage.getItem(step5DraftKey(clinicId)) || "";
      return raw ? (JSON.parse(raw) as any) : null;
    } catch {
      return null;
    }
  };

  const draft = readDraft();
  const step2Modes = readStep2Modes(clinicId);
  const inferredFromDraft = (() => {
    const m = (draft as any)?.clinicModes;
    if (m && typeof m === "object") {
      const in_person = Boolean((m as any)?.in_person);
      const online = Boolean((m as any)?.online);
      if (in_person || online) return { in_person, online } as ClinicModes;
    }
    const legacyOnlineOnly = (draft as any)?.clinicOnlineOnly;
    if (typeof legacyOnlineOnly === "boolean") {
      return legacyOnlineOnly ? ({ in_person: false, online: true } as ClinicModes) : ({ in_person: true, online: false } as ClinicModes);
    }
    return { in_person: true, online: false } as ClinicModes;
  })();
  const initialClinicModes = step2Modes || inferredFromDraft;
  const initialModeLocked =
    (initialClinicModes.in_person && !initialClinicModes.online) || (!initialClinicModes.in_person && initialClinicModes.online);
  const initialLockedMode: ServiceMode =
    initialClinicModes.online && !initialClinicModes.in_person ? "online" : "in_person";

  const [name, setName] = useState(() => String(draft?.name || ""));
  const [clinicModes, setClinicModes] = useState<ClinicModes>(() => initialClinicModes);
  const [mode, setMode] = useState<ServiceMode>(() =>
    initialModeLocked ? initialLockedMode : normalizeServiceMode(draft?.mode)
  );
  const [duration, setDuration] = useState<number>(() => {
    const n = Number(draft?.duration || 30);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 30;
  });
  const [priceText, setPriceText] = useState(() => String(draft?.priceText || ""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistedStepState, setPersistedStepState] = useState<number>(() => {
    const fromLocal = Number(draft?.persistedStep || 0);
    const fromProp = Number(persistedStep || 0);
    return Math.max(fromLocal || 0, fromProp || 0, 5);
  });

  const step = 5;
  const progress = Math.min(100, Math.max(0, (step / 7) * 100));
  const modeLocked =
    (clinicModes.in_person && !clinicModes.online) || (!clinicModes.in_person && clinicModes.online);
  const lockedMode: ServiceMode =
    clinicModes.online && !clinicModes.in_person ? "online" : "in_person";

  useEffect(() => {
    // Persist the draft so the user doesn't lose the form if they refresh/back.
    try {
      window.localStorage.setItem(
        step5DraftKey(clinicId),
        JSON.stringify({ name, mode, duration, priceText, persistedStep: persistedStepState, clinicModes })
      );
    } catch {
      // ignore
    }
  }, [clinicId, name, mode, duration, priceText, persistedStepState, clinicModes]);

  useEffect(() => {
    // Keep form mode consistent with what the clinic allows.
    if (modeLocked) {
      setMode(lockedMode);
      return;
    }
    if (mode === "online" && !clinicModes.online) setMode("in_person");
    if (mode === "in_person" && !clinicModes.in_person) setMode("online");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicModes.in_person, clinicModes.online]);

  const loadServices = async () => {
    setLoadingList(true);
    setError(null);
    const { data, error } = await supabase
      .from("services")
      .select("id,clinic_id,name,mode,duration_minutes,price_brl,deleted_at,created_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step5 load services error:", error);
      setError("Não foi possível carregar seus serviços. Tente novamente.");
      setServices([]);
      setLoadingList(false);
      return null;
    }

    const rows = (data as any as ServiceRow[]) || [];
    setServices(rows);
    setLoadingList(false);
    return rows;
  };

  useEffect(() => {
    // Hydrate onboarding_step progress and list of services.
    let cancelled = false;
    async function hydrate() {
      const trySelect = async (withModes: boolean) => {
        const columns = withModes
          ? "onboarding_step,address,city,state,appointment_in_person_enabled,appointment_online_enabled"
          : "onboarding_step,address,city,state";
        return supabase.from("clinics").select(columns).eq("id", clinicId).limit(1).maybeSingle();
      };

      let didFallback = false;
      let res = await trySelect(true);
      if (res.error && isSchemaMissing(res.error)) {
        didFallback = true;
        res = await trySelect(false);
      }

      const { data, error } = res;

      if (cancelled) return;
      if (!error) {
        const onboardingStepDb = Number((data as any)?.onboarding_step || 0);
        if (Number.isFinite(onboardingStepDb) && onboardingStepDb > 0) {
          setPersistedStepState((prev) => (prev > 0 ? Math.max(prev, onboardingStepDb) : onboardingStepDb));
        }

        const address = String((data as any)?.address || "").trim();
        const city = String((data as any)?.city || "").trim();
        const state = String((data as any)?.state || "").trim();
        const hasAnyLocation = Boolean(address || city || state);

        const hasInPersonCol = typeof (data as any)?.appointment_in_person_enabled === "boolean";
        const hasOnlineCol = typeof (data as any)?.appointment_online_enabled === "boolean";
        const canUseDbModes = !didFallback && (hasInPersonCol || hasOnlineCol);

        if (canUseDbModes) {
          const inPersonEnabled = hasInPersonCol ? Boolean((data as any)?.appointment_in_person_enabled) : hasAnyLocation;
          const onlineEnabled = hasOnlineCol ? Boolean((data as any)?.appointment_online_enabled) : false;
          const next: ClinicModes =
            inPersonEnabled || onlineEnabled ? { in_person: inPersonEnabled, online: onlineEnabled } : { in_person: true, online: false };
          setClinicModes(next);
        } else if (!step2Modes) {
          // Without explicit mode columns, preserve the step2 draft when available (supports hybrid in-session).
          const next: ClinicModes = hasAnyLocation ? { in_person: true, online: false } : { in_person: false, online: true };
          setClinicModes(next);
        }
      }

      await loadServices();
    }
    hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const servicesCountLabel = useMemo(() => {
    const n = services.length;
    if (loadingList) return "…";
    return String(n).padStart(2, "0");
  }, [services.length, loadingList]);

  const submitService = async () => {
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do serviço.");
      return;
    }
    const dur = Number(duration);
    if (!Number.isFinite(dur) || dur < 5) {
      setError("Informe uma duração válida (mínimo 5 minutos).");
      return;
    }
    const price = parsePriceBRL(priceText);
    if (priceText.trim() && price == null) {
      setError("Informe um valor válido.");
      return;
    }

    const effectiveMode: ServiceMode = modeLocked ? lockedMode : mode;

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("services")
          .update({
            name: name.trim(),
            mode: effectiveMode,
            duration_minutes: Math.round(dur),
            price_brl: price,
          })
          .eq("id", editingId)
          .eq("clinic_id", clinicId);

        if (error) {
          if (import.meta.env.DEV) console.warn("[Onboarding] step5 update service error:", error);
          setError("Não foi possível atualizar o serviço. Tente novamente.");
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase.from("services").insert({
          clinic_id: clinicId,
          name: name.trim(),
          mode: effectiveMode,
          duration_minutes: Math.round(dur),
          price_brl: price,
        });

        if (error) {
          if (import.meta.env.DEV) console.warn("[Onboarding] step5 insert service error:", error);
          setError("Não foi possível salvar o serviço. Tente novamente.");
          setSaving(false);
          return;
        }
      }

      setName("");
      setMode(modeLocked ? lockedMode : "in_person");
      setDuration(30);
      setPriceText("");
      setEditingId(null);
      await loadServices();
      setSaving(false);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step5 submit unexpected error:", e);
      setError("Não foi possível salvar o serviço. Tente novamente.");
      setSaving(false);
    }
  };

  const editService = (row: ServiceRow) => {
    setEditingId(row.id);
    setName(row.name || "");
    setMode(modeLocked ? lockedMode : normalizeServiceMode(row.mode));
    setDuration(Number(row.duration_minutes || 30));
    setPriceText(row.price_brl == null ? "" : String(row.price_brl.toFixed(2)).replace(".", ","));
  };

  const deleteService = (row: ServiceRow) => {
    setDeleteError(null);
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.user) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step5 getSession before delete:", sessionError);
      setDeleteError("Sua sessão expirou. Faça login novamente e tente de novo.");
      setDeleting(false);
      return;
    }

    // Sanity check: if the row isn't visible to the current user anymore (RLS), don't attempt the update.
    const { data: visibleRow, error: visibleError } = await supabase
      .from("services")
      .select("id")
      .eq("id", deleteTarget.id)
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .maybeSingle();

    if (visibleError) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step5 pre-delete select error:", visibleError);
      setDeleteError("Não foi possível validar sua permissão. Tente novamente.");
      setDeleting(false);
      return;
    }

    if (!visibleRow?.id) {
      setDeleteError("Você não tem acesso a este serviço (ou ele já foi removido).");
      setDeleting(false);
      return;
    }

    const { error } = await supabase
      .from("services")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", deleteTarget.id)
      .eq("clinic_id", clinicId);

    if (error) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step5 delete service error:", error);
      const code = String((error as any)?.code || "");
      if (code === "42501") {
        // Try to provide an actionable hint without leaking internal details.
        try {
          const member = await supabase
            .from("clinic_members")
            .select("role,is_admin,deleted_at")
            .eq("clinic_id", clinicId)
            .eq("user_id", sessionData.session.user.id)
            .limit(1)
            .maybeSingle();

          if (import.meta.env.DEV) {
            console.warn("[Onboarding] step5 delete RLS diag member:", member);
          }

          if (!member.data) {
            setDeleteError("Seu usuário não está vinculado a esta clínica. Verifique o clinic_members e tente novamente.");
          } else {
            setDeleteError("Você não tem permissão para remover este serviço. Verifique suas permissões e tente de novo.");
          }
        } catch {
          setDeleteError("Você não tem permissão para remover este serviço. Verifique suas permissões e tente de novo.");
        }
      } else {
        setDeleteError("Não foi possível remover o serviço. Tente novamente.");
      }
      setDeleting(false);
      return;
    }

    setDeleting(false);
    const refreshed = await loadServices();
    if (refreshed && refreshed.some((s) => s.id === deleteTarget.id)) {
      // In some RLS scenarios PostgREST returns success but affects 0 rows.
      setDeleteError("Não foi possível remover o serviço. Verifique suas permissões e tente novamente.");
      return;
    }
    setDeleteTarget(null);
  };

  useEffect(() => {
    if (!deleteTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteTarget(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget]);

  const onContinue = async () => {
    setError(null);
    if (!services.length) {
      setError("Cadastre pelo menos um serviço para continuar.");
      return;
    }

    setSaving(true);
    try {
      const nextStep = Math.max(persistedStepState || 1, 6);
      const { error } = await supabase.from("clinics").update({ onboarding_step: nextStep }).eq("id", clinicId);
      if (error) {
        if (import.meta.env.DEV) console.warn("[Onboarding] step5 update step error:", error);
        setError("Não foi possível salvar. Tente novamente.");
        setSaving(false);
        return;
      }

      setPersistedStepState(nextStep);
      setSaving(false);
      onDone();
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step5 continue unexpected error:", e);
      setError("Não foi possível salvar. Tente novamente.");
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOutSession();
    navigateToAppPath("/login");
  };

  return (
    <div className="min-h-[100dvh] bg-[#E9FDF4] text-[#002115] overflow-x-hidden">
      <OnboardingHeader step={step} totalSteps={7} progress={progress} onExit={handleSignOut} />

      <main className="pt-16 md:pt-20 pb-28 min-h-screen">
        <div className="max-w-6xl mx-auto px-5 md:px-12 py-10 md:py-14">
          <section className="mb-10 md:mb-12">
            <h2 className="font-['Syne'] text-4xl md:text-5xl font-800 text-[#003F2D] tracking-tight mb-4 leading-tight">
              Consultas e procedimentos
            </h2>
            <p className="text-[#3F4944] text-lg md:text-xl font-600 max-w-2xl font-['Space_Grotesk'] opacity-80">
              Cadastre os serviços que sua clínica oferece.
            </p>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
            <div className="lg:col-span-5 bg-white p-7 md:p-8 rounded-[2rem] shadow-[0_24px_48px_rgba(2,89,64,0.06)] border border-[#025940]/[0.10]">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 rounded-xl bg-[#025940]/10 flex items-center justify-center">
                  <FilePlus2 className="w-5 h-5 text-[#025940]" strokeWidth={2.2} />
                </div>
                <h3 className="font-['Syne'] text-xl font-800 text-[#025940]">Novo serviço</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-800 text-[#025940]/70 uppercase tracking-[0.22em] mb-2 px-1 font-['Space_Grotesk']">
                    Nome do serviço
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Consulta dermatológica"
                    className={INPUT}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-800 text-[#025940]/70 uppercase tracking-[0.22em] mb-2 px-1 font-['Space_Grotesk']">
                      Modo
                    </label>
                    <div className="relative">
                      <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value === "online" ? "online" : "in_person")}
                        disabled={modeLocked}
                        className={`${INPUT} appearance-none pr-12 ${modeLocked ? "opacity-80 cursor-not-allowed" : ""}`}
                      >
                        {clinicModes.in_person ? <option value="in_person">Presencial</option> : null}
                        {clinicModes.online ? <option value="online">Online</option> : null}
                      </select>
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#025940]/40 pointer-events-none">
                        ▾
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-800 text-[#025940]/70 uppercase tracking-[0.22em] mb-2 px-1 font-['Space_Grotesk']">
                      Duração
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={duration}
                        onChange={(e) => setDuration(Math.max(5, Number(e.target.value || 0)))}
                        className={`${INPUT} pr-16 [appearance:textfield]`}
                      />
                      <span className="absolute right-12 top-1/2 -translate-y-1/2 text-[#025940]/35 text-sm font-700 pointer-events-none font-['Space_Grotesk']">
                        min
                      </span>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col">
                        <button
                          type="button"
                          onClick={() => setDuration((p) => Math.min(600, Math.max(5, p + 5)))}
                          className="text-[#025940]/40 hover:text-[#025940] transition-colors leading-none p-0.5"
                          aria-label="Aumentar duração"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDuration((p) => Math.min(600, Math.max(5, p - 5)))}
                          className="text-[#025940]/40 hover:text-[#025940] transition-colors leading-none p-0.5"
                          aria-label="Diminuir duração"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {modeLocked ? (
                    <div className="sm:col-span-2">
                      <p className="mt-1 text-[12px] text-[#7AA88D] font-['Space_Grotesk'] font-700">
                        {lockedMode === "online"
                          ? "Sua clínica está configurada como atendimento online. Para liberar o atendimento presencial, ative “Atendimento presencial” na etapa 2."
                          : "Sua clínica está configurada como atendimento presencial. Para liberar o atendimento online, ative “Atendimento online” na etapa 2."}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="block text-[11px] font-800 text-[#025940]/70 uppercase tracking-[0.22em] mb-2 px-1 font-['Space_Grotesk']">
                    Valor do serviço
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-800 text-[#025940]/40 font-['Space_Grotesk']">
                      R$
                    </span>
                    <input
                      value={priceText}
                      onChange={(e) => setPriceText(normalizePriceInput(e.target.value))}
                      inputMode="decimal"
                      placeholder="0,00"
                      className={`${INPUT} pl-12`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#025940]/20 pointer-events-none">
                      <Sparkles className="w-5 h-5" />
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={submitService}
                    disabled={saving}
                    className="w-full bg-[#062B1D] text-white py-4 rounded-2xl font-['Syne'] font-800 shadow-[0_10px_22px_rgba(2,89,64,0.22)] hover:shadow-[0_14px_28px_rgba(2,89,64,0.30)] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Save className="w-5 h-5 text-[#23D996]" strokeWidth={2.2} />
                    {editingId ? "Atualizar serviço" : "Salvar serviço"}
                  </button>

                  {editingId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setName("");
                        setMode(modeLocked ? lockedMode : "in_person");
                        setDuration(30);
                        setPriceText("");
                      }}
                      className="shrink-0 px-5 py-4 rounded-2xl border border-[#025940]/[0.12] bg-white text-[#025940] font-['Space_Grotesk'] font-800 hover:bg-[#F4FBF7] transition-colors"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center gap-4 mb-2 px-1">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-800 text-[#118C5F] uppercase tracking-[0.22em] font-['Space_Grotesk']">
                    Serviços ativos
                  </span>
                  <span className="bg-[#118C5F]/10 text-[#118C5F] text-[10px] font-900 px-2 py-0.5 rounded-full font-['Space_Grotesk']">
                    {servicesCountLabel}
                  </span>
                </div>
                <div className="h-px flex-1 bg-[#025940]/[0.10]" />
              </div>

              {loadingList ? (
                <div className="rounded-[2rem] border border-[#025940]/[0.10] bg-white p-7 text-[#025940]/60 font-['Space_Grotesk'] font-600">
                  Carregando serviços…
                </div>
              ) : services.length ? (
                <div className="space-y-4">
                  {services.map((s) => {
                    const normalizedMode = normalizeServiceMode(s.mode);
                    const isOnline = normalizedMode === "online";
                    const Icon = isOnline ? Video : Building2;
                    const accent = isOnline ? "bg-[#23D996]" : "bg-[#118C5F]";
                    const badge = isOnline
                      ? "text-[#003F2D] bg-[#23D996]/20"
                      : "text-[#118C5F] bg-[#118C5F]/10";
                    const priceLabel = s.price_brl == null ? "Sob consulta" : formatPriceBRL(s.price_brl);
                    return (
                      <div
                        key={s.id}
                        className="group relative bg-white hover:bg-[#E8F5ED]/35 p-5 rounded-[2rem] transition-all duration-500 border border-[#025940]/[0.12] hover:border-[#23D996]/25 hover:shadow-[0_20px_40px_rgba(2,89,64,0.06)] flex items-center gap-6 overflow-hidden"
                      >
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent} opacity-0 group-hover:opacity-100 transition-opacity`} />
                        <div className="w-16 h-16 rounded-2xl bg-[#025940]/5 flex items-center justify-center text-[#025940] shrink-0 group-hover:bg-[#025940]/10 transition-colors">
                          <Icon className="w-8 h-8" strokeWidth={2.2} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <h4 className="font-800 text-xl text-[#062B1D] truncate font-['Syne']">{s.name}</h4>
                            <span
                              className={`flex items-center gap-1 text-[10px] font-900 px-2 py-0.5 rounded-full uppercase tracking-tight font-['Space_Grotesk'] ${badge}`}
                            >
                              {isOnline ? "Online" : "Presencial"}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-[#3F4944]/70 font-600 font-['Space_Grotesk']">
                            <span className="flex items-center gap-1.5">
                              <span className="text-[#23D996]" aria-hidden>
                                ⏱
                              </span>
                              {s.duration_minutes} minutos
                            </span>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end shrink-0 gap-2">
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-900 text-[#025940]/40 uppercase tracking-[0.22em] leading-none mb-1 font-['Space_Grotesk']">
                              Valor
                            </span>
                            <span className="text-2xl font-900 text-[#062B1D] font-['Syne']">{priceLabel}</span>
                          </div>
                          <div className="flex gap-1 opacity-100 translate-x-0 md:opacity-0 md:translate-x-4 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-all duration-300">
                            <button
                              type="button"
                              onClick={() => editService(s)}
                              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#E8F5ED] hover:bg-[#025940] hover:text-white text-[#025940] transition-all shadow-sm"
                              aria-label="Editar"
                            >
                              <Pencil className="w-4.5 h-4.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteService(s)}
                              className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-500 hover:text-white text-red-500 transition-all shadow-sm"
                              aria-label="Remover"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[2rem] border border-[#025940]/[0.10] bg-white p-7 text-[#025940]/60 font-['Space_Grotesk'] font-600">
                  Nenhum serviço cadastrado ainda. Use o formulário ao lado para criar o primeiro.
                </div>
              )}

              <div className="p-7 md:p-8 bg-[#025940]/5 rounded-[2rem] border border-[#025940]/[0.10] flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-[#025940] shadow-sm shrink-0 border border-[#025940]/[0.10]">
                  <Sparkles className="w-6 h-6" strokeWidth={2.2} />
                </div>
                <div>
                  <h5 className="font-800 text-[#025940] mb-1 font-['Syne']">Dica de crescimento</h5>
                  <p className="text-sm text-[#3F4944]/80 leading-relaxed font-['Space_Grotesk'] font-600">
                    Clínicas de alto desempenho cadastram pacotes de sessões. Isso aumenta o faturamento médio e melhora a
                    fidelização.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mt-8 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-700 text-sm font-['Space_Grotesk'] font-600"
              >
                {error}
              </motion.div>
            ) : null}
          </AnimatePresence>
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
            onClick={onContinue}
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

      <AnimatePresence>
        {deleteTarget ? (
          <motion.div
            key="delete-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-5"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar remoção de serviço"
            onClick={() => {
              if (!deleting) setDeleteTarget(null);
            }}
          >
            <div className="absolute inset-0 bg-[#062B1D]/55 backdrop-blur-[6px]" />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] border border-[#025940]/[0.12] shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-7 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100">
                    <AlertTriangle className="w-6 h-6" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-['Syne'] font-800 text-xl text-[#062B1D]">Remover serviço?</h3>
                    <p className="mt-1 text-[13px] text-[#3F4944] font-['Space_Grotesk'] font-600 opacity-80">
                      Você está prestes a remover{" "}
                      <span className="font-800 text-[#062B1D]">“{deleteTarget.name}”</span>. Isso apenas desativa o
                      serviço. Nada é apagado do histórico.
                    </p>
                  </div>
                </div>

                <div className="mt-7 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    disabled={deleting}
                    className="flex-1 h-12 rounded-2xl border border-[#025940]/[0.14] bg-white text-[#025940] font-['Space_Grotesk'] font-800 hover:bg-[#F4FBF7] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={deleting}
                    className="flex-1 h-12 rounded-2xl bg-red-600 text-white font-['Syne'] font-800 shadow-[0_10px_22px_rgba(220,38,38,0.25)] hover:bg-red-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deleting ? "Removendo..." : "Remover"}
                  </button>
                </div>

                {deleteError ? (
                  <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-700 text-sm font-['Space_Grotesk'] font-600">
                    {deleteError}
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
