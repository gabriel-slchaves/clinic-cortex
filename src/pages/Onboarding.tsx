/**
 * Onboarding do tenant (clínica).
 * O tenant do SaaS é sempre a clínica (mesmo no plano individual).
 *
 * Requer uma função RPC no Supabase:
 * `public.create_clinic_draft(p_clinic_name, p_phone_e164, p_plan_name)` (ver SQL na conversa).
 *
 * O trial (14 dias) deve ser iniciado depois, quando o onboarding estiver concluído e a clínica realmente puder usar o sistema.
 */
import { useAuth } from "@/contexts/AuthContext";
import cliniccortexLogo from "@/assets/logo.png";
import { navigateToAppPath } from "@/lib/appOrigin";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { User, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import Step2ClinicLocation from "@/pages/onboarding/Step2ClinicLocation";
import Step3AiAssistant from "@/pages/onboarding/Step3AiAssistant";
import Step4Schedule from "@/pages/onboarding/Step4Schedule";
import Step5Services from "@/pages/onboarding/Step5Services";
import Step6AiConfig from "@/pages/onboarding/Step6AiConfig";
import Step7Launch from "@/pages/onboarding/Step7Launch";

type Plan = "essencial" | "professional";

function CenteredStatusCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] flex items-center justify-center px-4 relative overflow-hidden text-center">
      <div className="absolute top-0 -left-10 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-10 w-96 h-96 bg-[#025940]/5 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-[var(--cc-bg-white)] border border-[var(--cc-border)] rounded-3xl p-8 shadow-[0_10px_40px_rgba(2,89,64,0.05)]"
        >
          <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-[var(--cc-tertiary)] border-t-transparent animate-spin" />
          <p className="font-['Syne'] font-800 text-[var(--cc-primary)] text-lg">
            {title}
          </p>
          <p className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
            {subtitle}
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [match, params] = useRoute("/onboarding/:step");
  const stepFromUrl = match ? Number(params?.step || 1) : 1;
  const currentStep =
    Number.isFinite(stepFromUrl) && stepFromUrl > 0 ? stepFromUrl : 1;
  const hasEditedPlanRef = useRef(false);
  const hasBootstrappedRef = useRef(false);

  const [clinicId, setClinicId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("cc_clinic_id") || "";
      const v = raw.trim();
      return v ? v : null;
    } catch {
      return null;
    }
  });
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [clinicName, setClinicName] = useState("");
  // Plano desejado (sem iniciar trial aqui). Podemos mudar no fim do onboarding.
  const [plan, setPlan] = useState<Plan>("essencial");
  const [whatsappDigits, setWhatsappDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  const formatBrPhone = (digits: string) => {
    const d = digitsOnly(digits).slice(0, 11);
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    if (!ddd) return "";
    if (!rest) return `(${ddd})`;
    const isMobile = rest.length > 8;
    const headLen = isMobile ? 5 : 4;
    const head = rest.slice(0, headLen);
    const tail = rest.slice(headLen);
    if (!tail) return `(${ddd}) ${head}`;
    return `(${ddd}) ${head}-${tail}`;
  };

  const whatsappE164 = useMemo(() => {
    const d = digitsOnly(whatsappDigits);
    return d ? `+55${d}` : "";
  }, [whatsappDigits]);

  useEffect(() => {
    // Prefill from auth metadata or local pending value.
    try {
      const pending =
        window.localStorage.getItem("cc_pending_whatsapp_e164") || "";
      const meta = (user as any)?.user_metadata?.whatsapp_e164 as
        | string
        | undefined;
      const e164 = (meta || pending || "").trim();
      if (e164.startsWith("+55")) {
        const next = digitsOnly(e164).slice(2, 13);
        setWhatsappDigits(prev => (digitsOnly(prev).length ? prev : next));
      }
    } catch {
      // ignore
    }
    try {
      const fullName = (user as any)?.user_metadata?.full_name as
        | string
        | undefined;
      const n = String(fullName || "").trim();
      if (n && !clinicName.trim()) {
        // Prefill as "Clínica <nome>" (but avoid double prefix).
        const lowered = n.toLowerCase();
        const alreadyClinic =
          lowered.startsWith("clínica ") ||
          lowered.startsWith("clínica-") ||
          lowered.startsWith("clinica ") ||
          lowered.startsWith("clinica-") ||
          lowered === "clínica" ||
          lowered === "clinica";
        setClinicName(alreadyClinic ? n : `Clínica ${n}`);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    // Load clinic + onboarding progress. This enables "resume where you left off".
    let cancelled = false;
    async function checkExisting() {
      if (!userId) return;
      const showBlockingLoader = !hasBootstrappedRef.current;
      if (showBlockingLoader) setBootstrapping(true);
      try {
        // Prefer the clinic id already stored on the client (resume stability),
        // otherwise fall back to the user's active membership.
        // If there is more than one clinic, prefer the owner clinic.
        let preferredCid = "";
        try {
          preferredCid = (
            window.localStorage.getItem("cc_clinic_id") || ""
          ).trim();
        } catch {
          preferredCid = "";
        }

        const loadClinic = async (cid: string) => {
          const { data: clinic, error } = await supabase
            .from("clinics")
            .select(
              "id,onboarding_step,onboarding_completed_at,name,phone,desired_plan"
            )
            .eq("id", cid)
            .limit(1)
            .maybeSingle();
          return { clinic, error };
        };

        let cid = preferredCid;
        let clinic: any = null;
        if (cid) {
          const res = await loadClinic(cid);
          if (!res.error && res.clinic?.id) {
            clinic = res.clinic;
          } else {
            cid = "";
          }
        }

        if (!cid) {
          const { data: memberships, error } = await supabase
            .from("clinic_members")
            .select("clinic_id,role,created_at")
            .eq("user_id", userId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(20);
          if (cancelled) return;
          if (error) return;
          const preferredMembership =
            ((memberships as any[]) || []).find(
              row =>
                String(row?.role || "")
                  .trim()
                  .toLowerCase() === "owner"
            ) ||
            ((memberships as any[]) || [])[0] ||
            null;
          cid = (preferredMembership?.clinic_id as string | undefined) || "";
          if (!cid) {
            try {
              window.localStorage.removeItem("cc_clinic_id");
            } catch {}
            setClinicId(null);
            return;
          }
          const res = await loadClinic(cid);
          if (cancelled) return;
          if (res.error) return;
          clinic = res.clinic;
        }

        if (cancelled) return;

        setClinicId(cid);
        try {
          window.localStorage.setItem("cc_clinic_id", cid);
        } catch {
          // ignore
        }

        if (cancelled) return;

        const existingName =
          ((clinic as any)?.name as string | null | undefined) || "";
        if (existingName) {
          setClinicName(prev => (prev?.trim() ? prev : existingName));
        }
        const existingPhone =
          ((clinic as any)?.phone as string | null | undefined) || "";
        if (existingPhone) {
          let d = digitsOnly(existingPhone);
          if (d.startsWith("55") && d.length > 11) d = d.slice(2);
          setWhatsappDigits(prev =>
            digitsOnly(prev).length ? prev : d.slice(0, 11)
          );
        }
        const existingPlan =
          ((clinic as any)?.desired_plan as Plan | null | undefined) || null;
        if (
          !hasEditedPlanRef.current &&
          (existingPlan === "essencial" || existingPlan === "professional")
        ) {
          setPlan(existingPlan);
        }

        const step = Number((clinic as any)?.onboarding_step || 1);
        const done = Boolean((clinic as any)?.onboarding_completed_at);
        setOnboardingStep(step > 0 ? step : 1);
        setOnboardingDone(done);

        // Mark as bootstrapped once we have clinic + progress in memory.
        // This prevents flashing a blocking loader on subsequent re-renders
        // (e.g. token refresh / route changes).
        hasBootstrappedRef.current = true;

        if (done) {
          navigateToAppPath("/dashboard");
          return;
        }
        const persisted = step > 0 ? step : 1;
        if (!match) {
          navigateToAppPath(`/onboarding/${persisted}`);
          return;
        }
      } finally {
        if (!cancelled && showBlockingLoader) setBootstrapping(false);
      }
    }
    checkExisting();
    return () => {
      cancelled = true;
    };
  }, [userId, match]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clinicName.trim()) {
      setError("Informe o nome da clínica.");
      return;
    }
    if (digitsOnly(whatsappDigits).length < 10) {
      setError("Informe um WhatsApp válido (com DDD).");
      return;
    }

    setLoading(true);
    try {
      const persistedNextStep = Math.max(onboardingStep, 2);

      // If a clinic already exists for this user, update it instead of creating a new one.
      if (clinicId) {
        const { error: updateError } = await supabase
          .from("clinics")
          .update({
            name: clinicName.trim(),
            phone: whatsappE164,
            desired_plan: plan,
            onboarding_step: persistedNextStep,
          })
          .eq("id", clinicId);

        if (updateError) {
          if (import.meta.env.DEV)
            console.warn("[Onboarding] update clinic error:", updateError);
          setError("Não foi possível atualizar sua clínica. Tente novamente.");
          setLoading(false);
          return;
        }

        setOnboardingStep(persistedNextStep);
        setLoading(false);
        // Even if the user already reached later steps, the UX should remain sequential
        // when navigating back to step 1.
        navigateToAppPath("/onboarding/2");
        return;
      }

      const { data, error } = await supabase.rpc("create_clinic_draft", {
        p_clinic_name: clinicName.trim(),
        p_phone_e164: whatsappE164,
        p_plan_name: plan,
      });

      if (error) {
        if (import.meta.env.DEV)
          console.warn("[Onboarding] create_clinic error:", error);
        setError(
          "Não foi possível criar sua clínica. Tente novamente em instantes."
        );
        setLoading(false);
        return;
      }

      const newId = String(data || "").trim();
      if (!newId) {
        setError("Não foi possível criar sua clínica. Tente novamente.");
        setLoading(false);
        return;
      }

      try {
        window.localStorage.setItem("cc_clinic_id", newId);
        window.localStorage.removeItem("cc_pending_whatsapp_e164");
      } catch {
        // ignore
      }

      // SQL sets onboarding_step=2, so we continue there.
      setClinicId(newId);
      setOnboardingStep(2);
      setLoading(false);
      navigateToAppPath("/onboarding/2");
    } catch (err) {
      if (import.meta.env.DEV) console.error("[Onboarding] error:", err);
      setError(
        "Não foi possível concluir o onboarding. Tente novamente em instantes."
      );
      setLoading(false);
    }
  };

  if (clinicId && onboardingDone) return null;

  // Wait for progress lookup before rendering any step.
  // This prevents "step skipping" by typing a higher step number in the URL.
  if (bootstrapping) {
    return (
      <CenteredStatusCard
        title="Retomando seu onboarding…"
        subtitle="Estamos buscando a etapa onde você parou."
      />
    );
  }

  // Block skipping forward beyond persisted progress.
  if (match && currentStep > onboardingStep) {
    navigateToAppPath(`/onboarding/${onboardingStep}`);
    return null;
  }

  // Etapa 2 é uma tela full-page (layout Stitch). Não deve ficar dentro do card central.
  if (currentStep === 2 && clinicId) {
    return (
      <Step2ClinicLocation
        clinicId={clinicId}
        plan={plan}
        clinicName={clinicName}
        onBack={() => navigateToAppPath("/onboarding/1")}
        onDone={() => {
          setOnboardingStep(prev => Math.max(prev, 3));
          navigateToAppPath("/onboarding/3");
        }}
      />
    );
  }
  if (currentStep === 2 && !clinicId) {
    // Avoid showing the generic placeholder screen before we load clinicId.
    // If bootstrapping finishes with no clinic, force the user back to step 1.
    if (!bootstrapping) {
      navigateToAppPath("/onboarding/1");
      return null;
    }
    return (
      <CenteredStatusCard
        title="Carregando sua clínica…"
        subtitle="Só um instante para abrir a etapa 2."
      />
    );
  }

  // Etapa 3 é uma tela full-page (layout Stitch). Não deve ficar dentro do card central.
  if (currentStep === 3 && clinicId) {
    return (
      <Step3AiAssistant
        clinicId={clinicId}
        persistedStep={onboardingStep}
        onBack={() => navigateToAppPath("/onboarding/2")}
        onDone={() => {
          setOnboardingStep(prev => Math.max(prev, 4));
          navigateToAppPath("/onboarding/4");
        }}
      />
    );
  }
  if (currentStep === 3 && !clinicId) {
    // Avoid showing the generic placeholder screen before we load clinicId.
    // If bootstrapping finishes with no clinic, force the user back to step 1.
    if (!bootstrapping) {
      navigateToAppPath("/onboarding/1");
      return null;
    }
    return (
      <CenteredStatusCard
        title="Carregando sua clínica…"
        subtitle="Só um instante para abrir a etapa 3."
      />
    );
  }

  // Etapa 4 é uma tela full-page (layout Stitch). Não deve ficar dentro do card central.
  if (currentStep === 4 && clinicId) {
    return (
      <Step4Schedule
        clinicId={clinicId}
        persistedStep={onboardingStep}
        onBack={() => navigateToAppPath("/onboarding/3")}
        onDone={() => {
          setOnboardingStep(prev => Math.max(prev, 5));
          navigateToAppPath("/onboarding/5");
        }}
      />
    );
  }
  if (currentStep === 4 && !clinicId) {
    if (!bootstrapping) {
      navigateToAppPath("/onboarding/1");
      return null;
    }
    return (
      <CenteredStatusCard
        title="Carregando sua clínica…"
        subtitle="Só um instante para abrir a etapa 4."
      />
    );
  }

  // Etapa 5 é uma tela full-page (layout premium). Não deve ficar dentro do card central.
  if (currentStep === 5 && clinicId) {
    return (
      <Step5Services
        clinicId={clinicId}
        persistedStep={onboardingStep}
        onBack={() => navigateToAppPath("/onboarding/4")}
        onDone={() => {
          setOnboardingStep(prev => Math.max(prev, 6));
          navigateToAppPath("/onboarding/6");
        }}
      />
    );
  }
  if (currentStep === 5 && !clinicId) {
    // Avoid showing the generic placeholder screen before we load clinicId.
    // If bootstrapping finishes with no clinic, force the user back to step 1.
    if (!bootstrapping) {
      navigateToAppPath("/onboarding/1");
      return null;
    }
    return (
      <CenteredStatusCard
        title="Carregando sua clínica…"
        subtitle="Só um instante para abrir a etapa 5."
      />
    );
  }

  // Etapa 6 é uma tela full-page (configuração do prompt da IA).
  if (currentStep === 6 && clinicId) {
    return (
      <Step6AiConfig
        clinicId={clinicId}
        persistedStep={onboardingStep}
        onBack={() => navigateToAppPath("/onboarding/5")}
        onDone={() => {
          setOnboardingStep(prev => Math.max(prev, 7));
          navigateToAppPath("/onboarding/7");
        }}
      />
    );
  }
  if (currentStep === 6 && !clinicId) {
    if (!bootstrapping) {
      navigateToAppPath("/onboarding/1");
      return null;
    }
    return (
      <CenteredStatusCard
        title="Carregando sua clínica…"
        subtitle="Só um instante para abrir a etapa 6."
      />
    );
  }

  // Etapa 7 é uma tela full-page (Launch / conexão WhatsApp).
  if (currentStep === 7 && clinicId) {
    return (
      <Step7Launch
        clinicId={clinicId}
        persistedStep={onboardingStep}
        onBack={() => navigateToAppPath("/onboarding/6")}
        onDone={() => {
          setOnboardingStep(prev => Math.max(prev, 7));
          navigateToAppPath("/dashboard");
        }}
      />
    );
  }
  if (currentStep === 7 && !clinicId) {
    if (!bootstrapping) {
      navigateToAppPath("/onboarding/1");
      return null;
    }
    return (
      <CenteredStatusCard
        title="Carregando sua clínica…"
        subtitle="Só um instante para abrir a etapa 7."
      />
    );
  }

  if (currentStep !== 1) {
    // Safety net: never render the old "Onboarding (x/7)" placeholder card.
    const safe = clinicId ? Math.max(1, onboardingStep || 1) : 1;
    navigateToAppPath(`/onboarding/${safe}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-[#E9FDF4] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-0 -left-10 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-10 w-96 h-96 bg-[#025940]/5 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="bg-white border border-[#025940]/[0.08] rounded-3xl p-7 sm:p-8 shadow-[0_10px_40px_rgba(2,89,64,0.05)] relative overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-[#025940]" />

          <Link
            to="/"
            className="flex flex-col items-center cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <img
              src={cliniccortexLogo}
              alt="ClinicCortex Logo"
              className="h-32 w-auto object-contain filter drop-shadow-sm"
              loading="eager"
            />
          </Link>

          <h2 className="text-2xl font-['Syne'] font-800 text-[#025940] mb-2 text-center tracking-tight mt-4">
            Comece sem pagar nada
          </h2>
          <p className="text-center text-[13px] text-[#005C41] font-['Space_Grotesk'] opacity-70 mb-6">
            Crie sua conta e junte-se a centenas de clínicas que utilizam a
            precisão clínica para escalar operações.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="clinic-name"
                className="block text-[13px] font-['Space_Grotesk'] font-700 text-[#005C41] opacity-70 mb-2 uppercase tracking-wider"
              >
                Nome da clínica
              </label>
              <input
                id="clinic-name"
                type="text"
                required
                value={clinicName}
                onChange={e => setClinicName(e.target.value)}
                className="w-full px-5 py-4 rounded-xl bg-[#F4FBF7] border border-[#025940]/[0.08] text-[#0B1F16] placeholder-[#7AA88D] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 transition-all font-['Space_Grotesk'] text-[15px]"
                placeholder="Ex.: Clínica Silva"
              />
            </div>

            <div>
              <label
                htmlFor="clinic-whatsapp"
                className="block text-[13px] font-['Space_Grotesk'] font-700 text-[#005C41] opacity-70 mb-2 uppercase tracking-wider"
              >
                WhatsApp da clínica
              </label>
              <div className="w-full flex items-stretch rounded-xl bg-[#F4FBF7] border border-[#025940]/[0.08] overflow-hidden focus-within:ring-2 focus-within:ring-[#23D996]/30 transition-all">
                <div className="flex items-center px-4 text-[#025940] opacity-70 font-['Space_Grotesk'] text-[15px] border-r border-[#025940]/10 bg-[#F4FBF7]">
                  +55
                </div>
                <input
                  id="clinic-whatsapp"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  required
                  value={formatBrPhone(whatsappDigits)}
                  onChange={e => {
                    let d = digitsOnly(e.target.value);
                    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
                    setWhatsappDigits(d.slice(0, 11));
                  }}
                  className="flex-1 min-w-0 px-5 py-4 bg-transparent text-[#0B1F16] placeholder-[#7AA88D] focus:outline-none font-['Space_Grotesk'] text-[15px]"
                  placeholder="(11) 91234-5678"
                />
              </div>
              <p className="mt-2 text-[12px] text-[#7AA88D] font-['Space_Grotesk']">
                Esse será o número que a clínica vai vincular pelo onboarding
                oficial da Meta.
              </p>
            </div>

            <div>
              <p className="block text-[13px] font-['Space_Grotesk'] font-700 text-[#005C41] opacity-70 mb-2 uppercase tracking-wider">
                Essa conta é para:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    hasEditedPlanRef.current = true;
                    setPlan("essencial");
                  }}
                  className={`group relative overflow-hidden rounded-2xl px-5 py-4 border text-left transition-[transform,box-shadow,background-color,border-color] duration-300 active:translate-y-[1px] ${
                    plan === "essencial"
                      ? "border-[#23D996] bg-white shadow-[0_20px_60px_-35px_rgba(2,89,64,0.55)]"
                      : "border-[#025940]/[0.08] bg-white hover:bg-[#F4FBF7] hover:shadow-[0_18px_50px_-38px_rgba(2,89,64,0.35)]"
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ${
                      plan === "essencial"
                        ? "opacity-100"
                        : "group-hover:opacity-60"
                    }`}
                    style={{
                      background:
                        "radial-gradient(600px 180px at 20% 10%, rgba(35,217,150,0.16), transparent 60%), radial-gradient(420px 160px at 90% 90%, rgba(2,89,64,0.10), transparent 55%)",
                    }}
                  />
                  <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
                    <div
                      className={`flex-none flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-inset transition-colors sm:mx-auto ${
                        plan === "essencial"
                          ? "bg-[#062B1D] text-[#23D996] ring-white/10 shadow-[0_14px_30px_-22px_rgba(6,43,29,0.9)]"
                          : "bg-white text-[#062B1D]/70 ring-[#025940]/10"
                      }`}
                    >
                      <User className="h-5 w-5 shrink-0" strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0 flex-1 sm:flex-none sm:w-full">
                      <div className="font-['Syne'] font-800 text-[#025940] leading-tight tracking-tight">
                        Somente eu
                      </div>
                      <div className="mt-1 text-[12.5px] text-[#005C41] opacity-75 font-['Space_Grotesk'] leading-snug">
                        Ideal para uso individual.
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 sm:hidden">
                    <div className="h-px w-full bg-[#025940]/[0.06]" />
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] font-800 uppercase tracking-[0.18em] text-[#7AA88D] font-['Space_Grotesk']">
                        Individual
                      </span>
                      <span
                        className={`text-[11px] font-800 uppercase tracking-[0.18em] font-['Space_Grotesk'] ${
                          plan === "essencial"
                            ? "text-[#118C5F]"
                            : "text-[#7AA88D]"
                        }`}
                      >
                        {plan === "essencial" ? "Selecionado" : "Selecionar"}
                      </span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hasEditedPlanRef.current = true;
                    setPlan("professional");
                  }}
                  className={`group relative overflow-hidden rounded-2xl px-5 py-4 border text-left transition-[transform,box-shadow,background-color,border-color] duration-300 active:translate-y-[1px] ${
                    plan === "professional"
                      ? "border-[#23D996] bg-white shadow-[0_20px_60px_-35px_rgba(2,89,64,0.55)]"
                      : "border-[#025940]/[0.08] bg-white hover:bg-[#F4FBF7] hover:shadow-[0_18px_50px_-38px_rgba(2,89,64,0.35)]"
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ${
                      plan === "professional"
                        ? "opacity-100"
                        : "group-hover:opacity-60"
                    }`}
                    style={{
                      background:
                        "radial-gradient(600px 180px at 20% 10%, rgba(35,217,150,0.16), transparent 60%), radial-gradient(420px 160px at 90% 90%, rgba(2,89,64,0.10), transparent 55%)",
                    }}
                  />
                  <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
                    <div
                      className={`relative flex-none flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-inset transition-colors sm:mx-auto ${
                        plan === "professional"
                          ? "bg-[#062B1D] text-[#23D996] ring-white/10 shadow-[0_14px_30px_-22px_rgba(6,43,29,0.9)]"
                          : "bg-white text-[#062B1D]/70 ring-[#025940]/10"
                      }`}
                    >
                      <Users className="h-5 w-5 shrink-0" strokeWidth={2.2} />
                      <span
                        className={`absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-800 font-['Space_Grotesk'] border shadow-sm ${
                          plan === "professional"
                            ? "bg-[#23D996] text-[#062B1D] border-[#23D996]"
                            : "bg-white text-[#062B1D]/70 border-[#025940]/10"
                        }`}
                        aria-label="Até 5 integrantes"
                        title="Até 5 integrantes"
                      >
                        5
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 sm:flex-none sm:w-full">
                      <div className="font-['Syne'] font-800 text-[#025940] leading-tight tracking-tight">
                        Para a minha equipe
                      </div>
                      <div className="mt-1 text-[12.5px] text-[#005C41] opacity-75 font-['Space_Grotesk'] leading-snug">
                        Ideal para clínicas de até 5 integrantes
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 sm:hidden">
                    <div className="h-px w-full bg-[#025940]/[0.06]" />
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] font-800 uppercase tracking-[0.18em] text-[#7AA88D] font-['Space_Grotesk']">
                        Equipe
                      </span>
                      <span
                        className={`text-[11px] font-800 uppercase tracking-[0.18em] font-['Space_Grotesk'] ${
                          plan === "professional"
                            ? "text-[#118C5F]"
                            : "text-[#7AA88D]"
                        }`}
                      >
                        {plan === "professional" ? "Selecionado" : "Selecionar"}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
              <p className="mt-2 text-[12px] text-[#7AA88D] font-['Space_Grotesk']">
                Não se preocupe, os primeiros 14 dias serão por nossa conta.
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm font-['Space_Grotesk'] font-500"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4.5 rounded-xl bg-[#025940] text-white font-['Syne'] font-700 text-[15px] hover:bg-[#118C5F] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_8px_20px_rgba(2,89,64,0.15)] active:scale-[0.98]"
            >
              {loading ? "Criando..." : "Continuar"}
            </button>
          </form>
        </motion.div>

        <p className="text-center mt-4 text-[11px] text-[#7AA88D] font-['Space_Grotesk'] uppercase tracking-[0.2em] opacity-40">
          Powered by Sinapse Company
        </p>
      </div>
    </div>
  );
}
