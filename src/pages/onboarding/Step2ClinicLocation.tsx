import { navigateToAppPath } from "@/lib/appOrigin";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import { AnimatePresence, motion } from "framer-motion";
import {
  MapPin,
  Search,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Modes = { in_person: boolean; online: boolean };

const BR_UF = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const INPUT =
  "w-full px-5 py-4 rounded-2xl bg-[#F4FBF7] border border-[#025940]/[0.10] text-[#0B1F16] placeholder-[#7AA88D] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 transition-all font-['Space_Grotesk'] text-[15px]";

function isSchemaMissing(error: any) {
  const code = String(error?.code || "");
  return code === "42703" || code === "42P01" || code === "PGRST204";
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatCep(value: string) {
  const d = digitsOnly(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function step2DraftKey(clinicId: string) {
  return `cc_onboarding_step2_location_${clinicId}`;
}

function normalizeUf(value: string): (typeof BR_UF)[number] | "" {
  const v = (value || "").trim().toUpperCase();
  return (BR_UF as readonly string[]).includes(v) ? (v as (typeof BR_UF)[number]) : "";
}

function parseAddressText(address: string) {
  const lines = address
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let unitName = "";
  let line2 = "";
  let line3 = "";

  if (lines.length >= 3) {
    unitName = lines[0] || "";
    line2 = lines[1] || "";
    line3 = lines.slice(2).join(" ");
  } else if (lines.length === 2) {
    line2 = lines[0] || "";
    line3 = lines[1] || "";
  } else if (lines.length === 1) {
    line2 = lines[0] || "";
  }

  let street = "";
  let number = "";
  let complement = "";
  let neighborhood = "";

  if (line2) {
    const parts = line2
      .split(" - ")
      .map((p) => p.trim())
      .filter(Boolean);

    const first = parts[0] || "";
    if (first) {
      const idx = first.lastIndexOf(",");
      if (idx >= 0) {
        street = first.slice(0, idx).trim();
        number = first.slice(idx + 1).trim();
      } else {
        street = first.trim();
      }
    }

    const looksLikeComplement = (v: string) =>
      /(sala|apto|apart|apartamento|conj|conjunto|bloco|andar|casa|fundos|lote|cj)\b/i.test(v);

    if (parts.length >= 3) {
      complement = parts[1] || "";
      neighborhood = parts.slice(2).join(" - ");
    } else if (parts.length === 2) {
      const p = parts[1] || "";
      if (looksLikeComplement(p)) complement = p;
      else neighborhood = p;
    }
  }

  let cep = "";
  let city = "";
  let uf: (typeof BR_UF)[number] | "" = "";
  if (line3) {
    const parts = line3
      .split("•")
      .map((p) => p.trim())
      .filter(Boolean);

    const cepDigits = digitsOnly(parts[0] || "");
    if (cepDigits.length >= 8) cep = cepDigits.slice(0, 8);

    city = (parts[1] || "").trim();
    uf = normalizeUf(parts[2] || "");
  }

  return { unitName, street, number, complement, neighborhood, cep, city, uf };
}

export default function Step2ClinicLocation({
  clinicId,
  plan,
  clinicName,
  onBack,
  onDone,
  }: {
    clinicId: string;
    plan: "essencial" | "professional";
    clinicName?: string;
    onBack: () => void;
    onDone: () => void;
  }) {
    const { signOut: signOutSession } = useAuth();
    const readDraft = () => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(step2DraftKey(clinicId)) || "";
      return raw ? (JSON.parse(raw) as any) : null;
    } catch {
      return null;
    }
  };

  const draft = readDraft();
  const hasDraft = Boolean(draft);

  const [modes, setModes] = useState<Modes>(() => {
    const m = (draft as any)?.modes;
    if (m && typeof m === "object") {
      const in_person = Boolean((m as any)?.in_person);
      const online = Boolean((m as any)?.online);
      if (in_person || online) return { in_person, online };
    }
    const legacyMode = String((draft as any)?.mode || "").trim();
    if (legacyMode === "online") return { in_person: false, online: true };
    return { in_person: true, online: false };
  });
  const [unitName, setUnitName] = useState(() => String(draft?.unitName || ""));
  const [cep, setCep] = useState(() => String(draft?.cep || ""));
  const [city, setCity] = useState(() => String(draft?.city || ""));
  const [street, setStreet] = useState(() => String(draft?.street || ""));
  const [number, setNumber] = useState(() => String(draft?.number || ""));
  const [complement, setComplement] = useState(() => String(draft?.complement || ""));
  const [neighborhood, setNeighborhood] = useState(() => String(draft?.neighborhood || ""));
  const [uf, setUf] = useState<(typeof BR_UF)[number] | "">(() => normalizeUf(String(draft?.uf || "")));
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistedStep, setPersistedStep] = useState<number>(() => Number(draft?.persistedStep || 2));

  const step = 2;
  const progress = Math.min(100, Math.max(0, (step / 7) * 100));
  const planLabel = plan === "professional" ? "Profissional" : "Essencial";
  const hasInPerson = Boolean(modes.in_person);
  const hasOnline = Boolean(modes.online);
  const toggleMode = (key: keyof Modes) => {
    setModes((prev) => {
      const next = { ...prev, [key]: !prev[key] } as Modes;
      // Always keep at least one modality selected.
      if (!next.in_person && !next.online) return prev;
      return next;
    });
  };

  useEffect(() => {
    // Prefill the first unit name with the clinic name to reduce redundancy.
    // Don't override if the user already typed something.
    const name = (clinicName || "").trim();
    if (!name) return;
    setUnitName((prev) => (prev.trim() ? prev : name));
  }, [clinicName]);

  useEffect(() => {
    // Persist draft locally so accidental back/forward doesn't lose the form.
    try {
      window.localStorage.setItem(
        step2DraftKey(clinicId),
        JSON.stringify({
          modes,
          unitName,
          cep,
          city,
          street,
          number,
          complement,
          neighborhood,
          uf,
          persistedStep,
        })
      );
    } catch {
      // ignore
    }
  }, [clinicId, modes, unitName, cep, city, street, number, complement, neighborhood, uf, persistedStep]);

  useEffect(() => {
    // Hydrate from DB when re-entering step 2 (resume where you left off).
    // We only fill fields that are still empty to avoid overwriting user edits/drafts.
    let cancelled = false;
    async function hydrate() {
      try {
        const trySelect = async (withModes: boolean) => {
          const columns = withModes
            ? "address,city,state,onboarding_step,appointment_in_person_enabled,appointment_online_enabled"
            : "address,city,state,onboarding_step";
          return supabase.from("clinics").select(columns).eq("id", clinicId).limit(1).maybeSingle();
        };

        let res = await trySelect(true);
        if (res.error && isSchemaMissing(res.error)) {
          res = await trySelect(false);
        }

        const { data, error } = res;

        if (cancelled) return;
        if (error) {
          if (import.meta.env.DEV) console.warn("[Onboarding] step2 hydrate error:", error);
          return;
        }

        const onboardingStepDb = Number((data as any)?.onboarding_step || 0);
        if (Number.isFinite(onboardingStepDb) && onboardingStepDb > 0) {
          setPersistedStep((prev) => (prev > 0 ? Math.max(prev, onboardingStepDb) : onboardingStepDb));
        }

        const address = ((data as any)?.address as string | null | undefined) || "";
        const cityDb = ((data as any)?.city as string | null | undefined) || "";
        const ufDb = normalizeUf(String((data as any)?.state || ""));

        const hasAnyLocation = Boolean(address || cityDb || ufDb);

        // If the user doesn't have a local draft on this device, infer the mode from DB.
        // Online-only clinics keep address/city/state null.
        if (!hasDraft) {
          const inPersonDb =
            typeof (data as any)?.appointment_in_person_enabled === "boolean"
              ? Boolean((data as any)?.appointment_in_person_enabled)
              : hasAnyLocation;
          const onlineDb =
            typeof (data as any)?.appointment_online_enabled === "boolean"
              ? Boolean((data as any)?.appointment_online_enabled)
              : !hasAnyLocation;
          const next: Modes = inPersonDb || onlineDb ? { in_person: inPersonDb, online: onlineDb } : { in_person: true, online: false };
          setModes(next);
        }

        if (!hasAnyLocation) return;

        if (address) {
          const parsed = parseAddressText(address);
          if (parsed.unitName) setUnitName((prev) => (prev.trim() ? prev : parsed.unitName));
          if (parsed.cep) setCep((prev) => (digitsOnly(prev).length ? prev : formatCep(parsed.cep)));
          if (parsed.street) setStreet((prev) => (prev.trim() ? prev : parsed.street));
          if (parsed.number) setNumber((prev) => (prev.trim() ? prev : parsed.number));
          if (parsed.complement) setComplement((prev) => (prev.trim() ? prev : parsed.complement));
          if (parsed.neighborhood) setNeighborhood((prev) => (prev.trim() ? prev : parsed.neighborhood));
          if (parsed.city) setCity((prev) => (prev.trim() ? prev : parsed.city));
          if (parsed.uf) setUf((prev) => (prev ? prev : parsed.uf));
        }

        if (cityDb) setCity((prev) => (prev.trim() ? prev : cityDb));
        if (ufDb) setUf((prev) => (prev ? prev : ufDb));
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Onboarding] step2 hydrate unexpected error:", e);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const mapQuery = useMemo(() => {
    if (!hasInPerson) return "";
    const parts = [
      unitName.trim(),
      [street.trim(), number.trim()].filter(Boolean).join(", "),
      neighborhood.trim(),
      [city.trim(), uf].filter(Boolean).join(" - "),
      formatCep(cep),
      "Brasil",
    ].filter(Boolean);
    return parts.join(" ");
  }, [hasInPerson, unitName, street, number, neighborhood, city, uf, cep]);

  const [mapEmbedUrl, setMapEmbedUrl] = useState<string>("");
  useEffect(() => {
    if (!hasInPerson) {
      setMapEmbedUrl("");
      return;
    }

    const q = mapQuery.trim();
    if (q.length < 10) {
      setMapEmbedUrl("");
      return;
    }

    // Debounce to avoid reloading the iframe while the user is typing.
    const t = window.setTimeout(() => {
      setMapEmbedUrl(`https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`);
    }, 450);
    return () => window.clearTimeout(t);
  }, [hasInPerson, mapQuery]);

  const addressText = useMemo(() => {
    if (!hasInPerson) return null;
    const lines: string[] = [];
    if (unitName.trim()) lines.push(unitName.trim());
    const line1 = [street.trim(), number.trim()].filter(Boolean).join(", ");
    const extra = [complement.trim(), neighborhood.trim()]
      .filter(Boolean)
      .join(" - ");
    const line2 = [line1, extra].filter(Boolean).join(" - ");
    if (line2) lines.push(line2);
    // Keep CEP inside `address` for readability, but city/UF are already stored in their own DB columns.
    const line3 = [formatCep(cep)].filter(Boolean).join(" ");
    if (line3) lines.push(line3);
    return lines.length ? lines.join("\n") : null;
  }, [hasInPerson, unitName, street, number, complement, neighborhood, cep, city, uf]);

  const lookupCep = async () => {
    const d = digitsOnly(cep);
    if (d.length !== 8) {
      setError("Informe um CEP válido (8 dígitos).");
      return;
    }
    setError(null);
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("viacep_error");
      const data = await res.json();
      if (data?.erro) {
        setError("CEP não encontrado.");
        return;
      }
      setStreet(data?.logradouro || "");
      setNeighborhood(data?.bairro || "");
      setCity(data?.localidade || "");
      setUf((data?.uf as any) || "");
    } catch {
      setError("Não foi possível consultar o CEP. Preencha manualmente.");
    } finally {
      setCepLoading(false);
    }
  };

  const onSubmit = async () => {
    setError(null);
    if (!hasInPerson && !hasOnline) {
      setError("Selecione ao menos uma modalidade de atendimento.");
      return;
    }
    if (hasInPerson) {
      if (digitsOnly(cep).length !== 8) return setError("Informe um CEP válido.");
      if (!city.trim()) return setError("Informe a cidade.");
      if (!uf) return setError("Selecione o estado (UF).");
      if (!street.trim()) return setError("Informe a rua/logradouro.");
      if (!number.trim()) return setError("Informe o número.");
    }

    setLoading(true);

    // Never regress onboarding progress if the user revisits step 2 later.
    const nextStep = Math.max(persistedStep || 1, 3);
    const payloadBase = hasInPerson
      ? {
          address: addressText,
          city: city.trim(),
          state: uf || null,
          onboarding_step: nextStep,
        }
      : {
          address: null,
          city: null,
          state: null,
          onboarding_step: nextStep,
        };

    const payloadWithModes = {
      ...payloadBase,
      appointment_in_person_enabled: hasInPerson,
      appointment_online_enabled: hasOnline,
    };

    let { error } = await supabase.from("clinics").update(payloadWithModes).eq("id", clinicId);
    if (error && isSchemaMissing(error)) {
      // Backward-compatible: if the DB doesn't have these columns yet, save the base payload.
      const fallback = await supabase.from("clinics").update(payloadBase).eq("id", clinicId);
      error = fallback.error;
    }

    if (error) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step2 update error:", error);
      setError("Não foi possível salvar. Tente novamente.");
      setLoading(false);
      return;
    }

    setLoading(false);
    onDone();
  };

  const handleSignOut = async () => {
    await signOutSession();
    navigateToAppPath("/login");
  };

  return (
    <div className="min-h-[100dvh] bg-[#E9FDF4] text-[#002115] overflow-x-hidden">
      <OnboardingHeader
        step={step}
        totalSteps={7}
        progress={progress}
        planPill={`Plano ${planLabel}`}
        onExit={handleSignOut}
      />

      <main className="pt-16 md:pt-20 pb-28 min-h-screen">
        <div className="max-w-5xl mx-auto px-5 md:px-12 py-10 md:py-16">
          <section className="mb-10 md:mb-14">
            <h2 className="font-['Syne'] text-4xl md:text-5xl font-800 text-[#003F2D] tracking-tight mb-4">
              Onde você atende?
            </h2>
            <p className="text-[#3F4944] text-lg md:text-xl font-600 max-w-2xl leading-relaxed font-['Space_Grotesk'] opacity-80">
              Personalize seu ambiente de trabalho. Escolha se sua operação é baseada em unidades físicas ou focada em
              atendimento digital.
            </p>
            <p className="mt-3 text-[12px] md:text-[13px] text-[#7AA88D] font-['Space_Grotesk'] font-700">
              Você pode selecionar uma ou as duas modalidades.
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-10 md:mb-14">
            <button
              type="button"
              onClick={() => toggleMode("in_person")}
              className={`group relative flex flex-col p-8 md:p-10 rounded-[2.25rem] border-2 transition-all duration-300 text-left ${
                hasInPerson
                  ? "bg-white border-[#23D996] shadow-[0_32px_64px_-16px_rgba(2,89,64,0.12)]"
                  : "bg-white/70 border-transparent hover:border-[#025940]/15 hover:bg-white hover:shadow-xl"
              }`}
            >
              <div
                className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center mb-7 shadow-lg transition-colors ${
                  hasInPerson
                    ? "bg-[#062B1D] text-[#23D996] shadow-[#062B1D]/25"
                    : "bg-[#E8F5ED] text-[#062B1D]/70 shadow-[#062B1D]/10"
                }`}
              >
                <MapPin className="w-7 h-7" />
              </div>
              <h3 className="font-['Syne'] text-xl md:text-2xl font-800 text-[#003F2D] mb-2.5">
                Atendimento presencial
              </h3>
              <p className="text-[#3F4944] text-sm md:text-base leading-relaxed mb-8 font-['Space_Grotesk'] opacity-80">
                Ideal para clínicas físicas, consultórios próprios ou espaços compartilhados.
              </p>
              <div className="mt-auto flex items-center gap-2 text-[#118C5F] font-800 text-[11px] uppercase tracking-[0.15em] font-['Space_Grotesk']">
                {hasInPerson ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#23D996] animate-pulse" />
                    <span>Modalidade ativa</span>
                  </>
                ) : (
                  <span className="text-[#3F4944]/45">Selecionar</span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => toggleMode("online")}
              className={`group relative flex flex-col p-8 md:p-10 rounded-[2.25rem] border-2 transition-all duration-300 text-left ${
                hasOnline
                  ? "bg-white border-[#23D996] shadow-[0_32px_64px_-16px_rgba(2,89,64,0.12)]"
                  : "bg-white/70 border-transparent hover:border-[#025940]/15 hover:bg-white hover:shadow-xl"
              }`}
            >
              <div
                className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center mb-7 transition-all duration-300 group-hover:scale-[1.03] ${
                  hasOnline
                    ? "bg-[#062B1D] text-[#23D996] shadow-lg shadow-[#062B1D]/25"
                    : "bg-[#E8F5ED] text-[#062B1D]/70 shadow-lg shadow-[#062B1D]/10"
                }`}
              >
                <Video className="w-7 h-7" />
              </div>
              <h3 className="font-['Syne'] text-xl md:text-2xl font-800 text-[#003F2D] mb-2.5">
                Atendimento online
              </h3>
              <p className="text-[#3F4944] text-sm md:text-base leading-relaxed mb-8 font-['Space_Grotesk'] opacity-80">
                Consultas remotas via telemedicina integrada com segurança de dados de ponta.
              </p>
              <div className="mt-auto flex items-center gap-2 text-[#118C5F] font-800 text-[11px] uppercase tracking-[0.15em] font-['Space_Grotesk']">
                {hasOnline ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#23D996] animate-pulse" />
                    <span>Modalidade ativa</span>
                  </>
                ) : (
                  <span className="text-[#3F4944]/45">Selecionar</span>
                )}
              </div>
            </button>
          </div>

          <motion.div layout className="will-change-transform">
            <AnimatePresence mode="wait" initial={false}>
              {hasInPerson ? (
                <motion.div
                  key="in_person"
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-[0_40px_100px_-20px_rgba(0,33,21,0.08)] border border-[#025940]/10 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#E8F5ED] rounded-full -mr-32 -mt-32 opacity-70 pointer-events-none" />
                  <div className="flex items-center gap-5 mb-10 relative z-10">
                    <div className="w-1.5 h-10 bg-[#23D996] rounded-full" />
                    <h4 className="font-['Syne'] text-2xl md:text-3xl font-800 text-[#003F2D] tracking-tight">
                      Dados da Unidade
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 md:gap-x-8 gap-y-6 md:gap-y-10 relative z-10">
                    <div className="md:col-span-12">
                      <label className="block text-[11px] font-800 uppercase tracking-[0.2em] text-[#3F4944] mb-3 px-1 font-['Space_Grotesk'] opacity-70">
                        Nome da Unidade ou Local
                      </label>
                      <input
                        className={INPUT}
                        value={unitName}
                        onChange={(e) => setUnitName(e.target.value)}
                        placeholder="Ex: Matriz São Paulo ou Unidade Jardins"
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-800 uppercase tracking-[0.2em] text-[#3F4944] mb-3 px-1 font-['Space_Grotesk'] opacity-70">
                        CEP
                      </label>
                      <div className="relative">
                        <input
                          className={INPUT}
                          value={formatCep(cep)}
                          onChange={(e) => setCep(formatCep(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              lookupCep();
                            }
                          }}
                          placeholder="00000-000"
                        />
                        <button
                          type="button"
                          onClick={lookupCep}
                          disabled={cepLoading}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#23D996] hover:text-[#025940] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          aria-label="Buscar CEP"
                        >
                          <Search className={`w-5 h-5 ${cepLoading ? "animate-pulse" : ""}`} />
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-8">
                      <label className="block text-[11px] font-800 uppercase tracking-[0.2em] text-[#3F4944] mb-3 px-1 font-['Space_Grotesk'] opacity-70">
                        Cidade
                      </label>
                      <input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>

                    <div className="md:col-span-7">
                      <label className="block text-[11px] font-800 uppercase tracking-[0.2em] text-[#3F4944] mb-3 px-1 font-['Space_Grotesk'] opacity-70">
                        Rua / Logradouro
                      </label>
                      <input className={INPUT} value={street} onChange={(e) => setStreet(e.target.value)} />
                    </div>

                    <div className="md:col-span-5 grid grid-cols-2 gap-4 md:gap-6">
                      <div>
                        <label className="block text-[11px] font-800 uppercase tracking-[0.2em] text-[#3F4944] mb-3 px-1 font-['Space_Grotesk'] opacity-70">
                          Número
                        </label>
                        <input
                          className={INPUT}
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-800 uppercase tracking-[0.2em] text-[#3F4944] mb-3 px-1 font-['Space_Grotesk'] opacity-70">
                          Complemento
                        </label>
                        <input
                          className={INPUT}
                          value={complement}
                          onChange={(e) => setComplement(e.target.value)}
                          placeholder="Sala"
                        />
                      </div>
                    </div>

                    <div className="md:col-span-6">
                      <label className="block text-[11px] font-800 uppercase tracking-[0.2em] text-[#3F4944] mb-3 px-1 font-['Space_Grotesk'] opacity-70">
                        Bairro
                      </label>
                      <input
                        className={INPUT}
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-6">
                      <label className="block text-[11px] font-800 uppercase tracking-[0.2em] text-[#3F4944] mb-3 px-1 font-['Space_Grotesk'] opacity-70">
                        Estado / UF
                      </label>
                      <div className="relative">
                        <select
                          className={`${INPUT} appearance-none pr-12 cursor-pointer`}
                          value={uf}
                          onChange={(e) => setUf(e.target.value as any)}
                        >
                          <option value="" disabled>
                            Selecione o Estado
                          </option>
                          {BR_UF.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#23D996] pointer-events-none">
                          ▾
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 overflow-hidden rounded-[2rem] h-48 md:h-56 relative bg-[#E8F5ED] border border-[#025940]/10">
                    {mapEmbedUrl ? (
                      <iframe
                        title="Mapa da unidade"
                        src={mapEmbedUrl}
                        className="absolute inset-0 w-full h-full [filter:grayscale(0.25)_contrast(1.05)_saturate(0.9)]"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    ) : (
                      <div className="absolute inset-0">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(35,217,150,0.22),transparent_55%)]" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,43,29,0.35),transparent_55%)]" />
                        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                          <p className="text-[#062B1D]/70 font-['Space_Grotesk'] text-[13px] md:text-sm font-700">
                            Preencha o endereço para visualizar o mapa.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_top,rgba(6,43,29,0.22),transparent_55%)]" />
                    <div className="absolute bottom-5 left-5 md:bottom-6 md:left-8 flex items-center gap-2 text-white backdrop-blur-md bg-black/10 px-4 py-2 rounded-full border border-white/20">
                      <span className="text-[11px] font-800 uppercase tracking-[0.1em] font-['Space_Grotesk']">
                        Visualização da Unidade
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="online"
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-[0_40px_100px_-20px_rgba(0,33,21,0.08)] border border-[#025940]/10 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#E8F5ED] rounded-full -mr-32 -mt-32 opacity-70 pointer-events-none" />
                  <div className="flex items-center gap-5 mb-6 relative z-10">
                    <div className="w-1.5 h-10 bg-[#23D996] rounded-full" />
                    <h4 className="font-['Syne'] text-2xl md:text-3xl font-800 text-[#003F2D] tracking-tight">
                      Atendimento Online
                    </h4>
                  </div>
                  <p className="relative z-10 text-[#3F4944] text-[15px] md:text-base leading-relaxed font-['Space_Grotesk'] opacity-80 max-w-3xl">
                    Perfeito. Nesta etapa não precisamos de endereço físico. Vamos seguir e, mais adiante, você configura
                    telemedicina e integrações do seu jeito.
                  </p>
                </motion.div>
              )}
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
          disabled={loading}
          className="bg-white text-[#062B1D] h-14 md:h-16 px-8 md:px-12 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.32)] font-['Syne'] font-800 text-xs md:text-sm uppercase tracking-[0.2em] hover:bg-white/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] flex items-center gap-4"
        >
          <span>{loading ? "Salvando..." : "Continuar"}</span>
          <span className="text-[#23D996]" aria-hidden>
            →
          </span>
        </button>
      </footer>
    </div>
  );
}
