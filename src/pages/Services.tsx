import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  type ServiceMode,
  type ServicesPageItem,
  useServicesPageData,
} from "@/hooks/useServicesPageData";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FilePlus2,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const INPUT =
  "w-full bg-[var(--cc-bg-subtle)] border-2 border-transparent rounded-2xl px-5 py-4 focus:ring-0 focus:bg-[var(--cc-bg-white)] focus:border-[#23D996]/40 transition-all placeholder:text-[var(--cc-text-muted)] placeholder:opacity-50 font-['Space_Grotesk'] font-600 text-[15px] text-[var(--cc-text-body)]";

function normalizeServiceMode(value: unknown): ServiceMode {
  return value === "online" ? "online" : "in_person";
}

function isMissingSchemaError(error: unknown) {
  const e = error as any;
  const code = String(e?.code || "");
  return code === "PGRST205" || code === "42P01" || code === "42703" || code === "PGRST204";
}

function normalizePriceInput(value: string) {
  let next = value.replace(/[^\d,]/g, "");
  const parts = next.split(",");
  const integer = parts[0] || "";
  const decimal = (parts[1] || "").slice(0, 2);
  next = decimal ? `${integer},${decimal}` : integer;
  return next;
}

function parsePriceBRL(value: string) {
  const normalized = normalizePriceInput(value);
  if (!normalized) return null;

  const [integer, decimal = ""] = normalized.split(",");
  const intValue = Number(integer || "0");
  const decimalValue = Number((decimal || "").padEnd(2, "0"));

  if (!Number.isFinite(intValue) || !Number.isFinite(decimalValue)) return null;
  return intValue + decimalValue / 100;
}

function formatPriceBRL(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Sob consulta";

  try {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } catch {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  }
}

function formatAveragePrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Sob consulta";
  return formatPriceBRL(value);
}

function averageDurationLabel(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Sem média";
  return `${Math.round(value)} min`;
}

export default function Services() {
  const { user } = useAuth();
  const servicesData = useServicesPageData(user?.id || null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<ServiceMode>("in_person");
  const [duration, setDuration] = useState(30);
  const [priceText, setPriceText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServicesPageItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const clinicModes = servicesData.clinicModes;
  const modeLocked =
    (clinicModes.in_person && !clinicModes.online) || (!clinicModes.in_person && clinicModes.online);
  const lockedMode: ServiceMode =
    clinicModes.online && !clinicModes.in_person ? "online" : "in_person";

  useEffect(() => {
    if (modeLocked) {
      setMode(lockedMode);
      return;
    }

    if (mode === "online" && !clinicModes.online) setMode("in_person");
    if (mode === "in_person" && !clinicModes.in_person) setMode("online");
  }, [clinicModes.in_person, clinicModes.online, lockedMode, mode, modeLocked]);

  useEffect(() => {
    if (!deleteTarget) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeleteTarget(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setMode(modeLocked ? lockedMode : clinicModes.in_person ? "in_person" : "online");
    setDuration(30);
    setPriceText("");
    setFormError(null);
  };

  const saveServiceMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      mode: ServiceMode;
      durationMinutes: number;
      priceBrl: number | null;
      editingId: string | null;
    }) => {
      if (!servicesData.clinicId) {
        throw new Error("Não foi possível identificar sua clínica. Faça login novamente.");
      }

      if (payload.editingId) {
        const { error } = await supabase
          .from("services")
          .update({
            name: payload.name,
            mode: payload.mode,
            duration_minutes: payload.durationMinutes,
            price_brl: payload.priceBrl,
          })
          .eq("clinic_id", servicesData.clinicId)
          .eq("id", payload.editingId);

        if (error) {
          if (isMissingSchemaError(error)) {
            throw new Error("Seu banco ainda não está pronto para serviços. Finalize as migrations e tente novamente.");
          }
          throw new Error("Não foi possível atualizar o serviço. Tente novamente.");
        }

        return;
      }

      const { error } = await supabase.from("services").insert({
        clinic_id: servicesData.clinicId,
        name: payload.name,
        mode: payload.mode,
        duration_minutes: payload.durationMinutes,
        price_brl: payload.priceBrl,
      });

      if (error) {
        if (isMissingSchemaError(error)) {
          throw new Error("Seu banco ainda não está pronto para serviços. Finalize as migrations e tente novamente.");
        }
        throw new Error("Não foi possível salvar o serviço. Tente novamente.");
      }
    },
    onMutate: () => {
      setFormError(null);
    },
    onSuccess: async () => {
      resetForm();
      await servicesData.refetch();
    },
    onError: (error) => {
      if (import.meta.env.DEV) console.warn("[Services] save service error:", error);
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o serviço. Tente novamente.");
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (row: ServicesPageItem) => {
      if (!servicesData.clinicId) {
        throw new Error("Não foi possível identificar sua clínica. Faça login novamente.");
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user) {
        throw new Error("Sua sessão expirou. Faça login novamente e tente de novo.");
      }

      const { data: visibleRow, error: visibleError } = await supabase
        .from("services")
        .select("id")
        .eq("id", row.id)
        .eq("clinic_id", servicesData.clinicId)
        .is("deleted_at", null)
        .maybeSingle();

      if (visibleError) {
        throw new Error("Não foi possível validar sua permissão. Tente novamente.");
      }

      if (!visibleRow?.id) {
        throw new Error("Você não tem acesso a este serviço (ou ele já foi removido).");
      }

      const { error } = await supabase
        .from("services")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("clinic_id", servicesData.clinicId);

      if (error) {
        if (isMissingSchemaError(error)) {
          throw new Error("Seu banco ainda não está pronto para serviços. Finalize as migrations e tente novamente.");
        }

        const code = String((error as any)?.code || "");
        if (code === "42501") {
          throw new Error("Você não tem permissão para remover este serviço. Verifique suas permissões e tente de novo.");
        }

        throw new Error("Não foi possível remover o serviço. Tente novamente.");
      }
    },
    onMutate: () => {
      setDeleteError(null);
    },
    onSuccess: async (_, row) => {
      if (editingId === row.id) resetForm();
      setDeleteTarget(null);
      await servicesData.refetch();
    },
    onError: (error) => {
      if (import.meta.env.DEV) console.warn("[Services] delete service error:", error);
      setDeleteError(error instanceof Error ? error.message : "Não foi possível remover o serviço. Tente novamente.");
    },
  });

  const submitService = async () => {
    setFormError(null);

    if (!name.trim()) {
      setFormError("Informe o nome do serviço.");
      return;
    }

    const durationValue = Number(duration);
    if (!Number.isFinite(durationValue) || durationValue < 5) {
      setFormError("Informe uma duração válida (mínimo 5 minutos).");
      return;
    }

    const price = parsePriceBRL(priceText);
    if (priceText.trim() && price == null) {
      setFormError("Informe um valor válido.");
      return;
    }

    const effectiveMode = modeLocked ? lockedMode : mode;

    await saveServiceMutation
      .mutateAsync({
        name: name.trim(),
        mode: effectiveMode,
        durationMinutes: Math.round(durationValue),
        priceBrl: price,
        editingId,
      })
      .catch(() => undefined);
  };

  const openCreateService = () => {
    resetForm();
    nameInputRef.current?.focus();
  };

  const openEditService = (row: ServicesPageItem) => {
    setEditingId(row.id);
    setName(row.name);
    setMode(modeLocked ? lockedMode : normalizeServiceMode(row.mode));
    setDuration(Math.max(5, Number(row.durationMinutes || 30)));
    setPriceText(row.priceBrl == null ? "" : String(row.priceBrl.toFixed(2)).replace(".", ","));
    setFormError(null);
    nameInputRef.current?.focus();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteServiceMutation.mutateAsync(deleteTarget).catch(() => undefined);
  };

  const servicesCountLabel = useMemo(
    () => String(servicesData.total).padStart(2, "0"),
    [servicesData.total]
  );

  const deleting = deleteServiceMutation.isPending;
  const controlsDisabled = saveServiceMutation.isPending || deleting || !servicesData.clinicId;

  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] relative overflow-hidden">
      <div className="absolute top-0 -left-16 w-96 h-96 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -right-20 w-[560px] h-[560px] bg-[#025940]/5 rounded-full blur-3xl" />

      <main className="relative z-10 max-w-7xl mx-auto px-5 md:px-12 py-7 md:py-10 space-y-6 md:space-y-8">
        <div className="flex flex-col gap-3">
          {servicesData.clinicName ? (
            <div className="text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] truncate">
              {servicesData.clinicName}
            </div>
          ) : servicesData.isInitialLoading ? (
            <Skeleton className="h-3.5 w-40 rounded-full" />
          ) : null}

          <div>
            <h1 className="text-[34px] md:text-5xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne'] leading-[1.05]">
              Serviços
            </h1>
            <p className="mt-3 text-[14px] md:text-[16px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600 max-w-3xl leading-relaxed">
              Cadastre, ajuste e organize seus serviços com a mesma fluidez do restante do app.
            </p>
          </div>
        </div>

        {servicesData.error ? (
          <div className="cc-card rounded-3xl p-5 border-[#BE123C]/15 bg-[#FFF1F2]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#BE123C] mt-0.5" />
              <div className="min-w-0">
                <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                  Não foi possível carregar a página de serviços
                </div>
                <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] font-600">
                  {servicesData.error}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {servicesData.loadingKpis && !servicesData.kpis
            ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="cc-card rounded-3xl p-6">
                  <Skeleton className="h-10 w-10 rounded-2xl" />
                  <Skeleton className="mt-5 h-9 w-28 rounded-2xl" />
                  <Skeleton className="mt-2 h-4 w-40 rounded-lg" />
                  <Skeleton className="mt-4 h-4 w-32 rounded-lg" />
                </div>
              ))
            : [
                {
                  label: "Serviços ativos",
                  value: (servicesData.kpis?.totalServices ?? 0).toLocaleString("pt-BR"),
                  helper: `${servicesData.kpis?.servicesInPerson ?? 0} presenciais • ${servicesData.kpis?.servicesOnline ?? 0} online`,
                  icon: FilePlus2,
                },
                {
                  label: "Ticket médio",
                  value: formatAveragePrice(servicesData.kpis?.avgServicePriceBrl ?? null),
                  helper:
                    servicesData.kpis?.servicesWithoutPrice
                      ? `${servicesData.kpis.servicesWithoutPrice.toLocaleString("pt-BR")} sem preço definido`
                      : "Todos os serviços com preço definido",
                  icon: Sparkles,
                },
                {
                  label: "Duração média",
                  value: averageDurationLabel(servicesData.kpis?.avgServiceDurationMinutes ?? null),
                  helper: "Baseada nos serviços ativos cadastrados",
                  icon: Clock3,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="cc-card rounded-3xl p-6 relative overflow-hidden">
                    <div className="absolute -top-24 -right-24 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
                    <div className="relative z-10">
                      <div className="w-11 h-11 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] shadow-sm flex items-center justify-center">
                        <Icon className="w-5 h-5 text-[var(--cc-primary)]" strokeWidth={2.2} />
                      </div>
                      <div className="mt-5">
                        <div className="text-3xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne']">
                          {item.value}
                        </div>
                        <div className="mt-1 text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                          {item.label}
                        </div>
                        <div className="mt-3 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                          {item.helper}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
          <div className="lg:col-span-5 cc-card rounded-[2rem] p-7 md:p-8 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#23D996]/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 rounded-xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] flex items-center justify-center">
                  <FilePlus2 className="w-5 h-5 text-[var(--cc-primary)]" strokeWidth={2.2} />
                </div>
                <div>
                  <h2 className="font-['Syne'] text-xl font-800 text-[var(--cc-text-primary)]">
                    {editingId ? "Editar serviço" : "Novo serviço"}
                  </h2>
                  <p className="mt-1 text-[12px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600">
                    Visual e usabilidade inspirados no onboarding, com estado nativo do app.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Nome do serviço
                  </label>
                  <input
                    ref={nameInputRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ex.: Consulta dermatológica"
                    className={cn(INPUT, "mt-2 h-14")}
                    disabled={controlsDisabled}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                      Modalidade
                    </label>
                    <div className="relative mt-2">
                      <select
                        value={mode}
                        onChange={(event) => setMode(event.target.value === "online" ? "online" : "in_person")}
                        disabled={controlsDisabled || modeLocked}
                        className={cn(INPUT, "appearance-none pr-12", modeLocked && "opacity-80 cursor-not-allowed")}
                      >
                        {clinicModes.in_person ? <option value="in_person">Presencial</option> : null}
                        {clinicModes.online ? <option value="online">Online</option> : null}
                      </select>
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--cc-text-muted)] opacity-50 pointer-events-none">
                        <ChevronDown className="w-4 h-4" />
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                      Duração
                    </label>
                    <div className="relative mt-2">
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={duration}
                        onChange={(event) => setDuration(Math.max(5, Number(event.target.value || 0)))}
                        className={cn(INPUT, "pr-16")}
                        disabled={controlsDisabled}
                      />
                      <span className="absolute right-12 top-1/2 -translate-y-1/2 text-[var(--cc-text-muted)] opacity-55 text-sm font-700 pointer-events-none font-['Space_Grotesk']">
                        min
                      </span>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col">
                        <button
                          type="button"
                          onClick={() => setDuration((current) => Math.min(600, Math.max(5, current + 5)))}
                          className="text-[var(--cc-text-muted)] opacity-60 hover:opacity-100 transition-colors leading-none p-0.5"
                          aria-label="Aumentar duração"
                          disabled={controlsDisabled}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDuration((current) => Math.min(600, Math.max(5, current - 5)))}
                          className="text-[var(--cc-text-muted)] opacity-60 hover:opacity-100 transition-colors leading-none p-0.5"
                          aria-label="Diminuir duração"
                          disabled={controlsDisabled}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {modeLocked ? (
                  <div className="rounded-2xl border border-[var(--cc-border)] bg-[var(--cc-bg-subtle)] px-4 py-3">
                    <p className="text-[12px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-700">
                      {lockedMode === "online"
                        ? "Sua clínica está configurada apenas para atendimento online."
                        : "Sua clínica está configurada apenas para atendimento presencial."}
                    </p>
                  </div>
                ) : null}

                <div>
                  <label className="block text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Valor do serviço
                  </label>
                  <div className="relative mt-2">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-800 text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                      R$
                    </span>
                    <input
                      value={priceText}
                      onChange={(event) => setPriceText(normalizePriceInput(event.target.value))}
                      inputMode="decimal"
                      placeholder="0,00"
                      className={cn(INPUT, "pl-12")}
                      disabled={controlsDisabled}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--cc-text-muted)] opacity-30 pointer-events-none">
                      <Sparkles className="w-5 h-5" />
                    </span>
                  </div>
                </div>

                {formError ? (
                  <div className="rounded-2xl border border-[#FCA5A5]/50 bg-[#FFF1F2] px-4 py-3 text-[#BE123C] text-[13px] font-['Space_Grotesk'] font-700">
                    {formError}
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={submitService}
                    disabled={controlsDisabled}
                    className="cc-btn-primary w-full py-4 rounded-2xl font-['Syne'] font-800 shadow-[0_10px_22px_rgba(2,89,64,0.22)] hover:shadow-[0_14px_28px_rgba(2,89,64,0.30)] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Save className="w-5 h-5 text-[#23D996]" strokeWidth={2.2} />
                    {saveServiceMutation.isPending
                      ? "Salvando..."
                      : editingId
                        ? "Atualizar serviço"
                        : "Salvar serviço"}
                  </button>

                  {editingId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={saveServiceMutation.isPending}
                      className="shrink-0 px-5 py-4 rounded-2xl border border-[var(--cc-border-mid)] bg-[var(--cc-bg-white)] text-[var(--cc-primary)] font-['Space_Grotesk'] font-800 hover:bg-[var(--cc-bg-subtle)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-4 px-1">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-800 text-[#118C5F] uppercase tracking-[0.22em] font-['Space_Grotesk']">
                  Serviços ativos
                </span>
                <span className="bg-[#118C5F]/10 text-[#118C5F] text-[10px] font-900 px-2 py-0.5 rounded-full font-['Space_Grotesk']">
                  {servicesCountLabel}
                </span>
              </div>
              <div className="h-px flex-1 bg-[var(--cc-border)]" />
            </div>

            {servicesData.loading && !servicesData.rows.length ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="cc-card rounded-[2rem] p-5 md:p-6">
                    <div className="flex items-center gap-5">
                      <Skeleton className="w-16 h-16 rounded-2xl shrink-0" />
                      <div className="flex-1 space-y-3">
                        <Skeleton className="h-6 w-48 rounded-xl" />
                        <Skeleton className="h-4 w-32 rounded-lg" />
                      </div>
                      <div className="space-y-3 shrink-0">
                        <Skeleton className="h-7 w-24 rounded-xl" />
                        <div className="flex justify-end gap-2">
                          <Skeleton className="h-9 w-9 rounded-xl" />
                          <Skeleton className="h-9 w-9 rounded-xl" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : servicesData.rows.length ? (
              <div className="space-y-4">
                {servicesData.rows.map((service) => {
                  const isOnline = service.mode === "online";
                  const Icon = isOnline ? Video : Building2;
                  const badgeClass = isOnline
                    ? "text-[#003F2D] bg-[#23D996]/20"
                    : "text-[#118C5F] bg-[#118C5F]/10";
                  const accentClass = isOnline ? "bg-[#23D996]" : "bg-[#118C5F]";

                  return (
                    <div
                      key={service.id}
                      className="group relative cc-card rounded-[2rem] p-5 md:p-6 transition-all duration-300 overflow-hidden"
                    >
                      <div
                        className={cn(
                          "absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity",
                          accentClass
                        )}
                      />

                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] flex items-center justify-center text-[var(--cc-primary)] shrink-0">
                          <Icon className="w-8 h-8" strokeWidth={2.2} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <h3 className="font-800 text-xl text-[var(--cc-text-primary)] truncate font-['Syne']">
                              {service.name}
                            </h3>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[10px] font-900 px-2 py-0.5 rounded-full uppercase tracking-tight font-['Space_Grotesk']",
                                badgeClass
                              )}
                            >
                              {isOnline ? "Online" : "Presencial"}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-700">
                            <span className="flex items-center gap-1.5">
                              <span className="text-[#23D996]" aria-hidden="true">
                                ⏱
                              </span>
                              {service.durationMinutes} minutos
                            </span>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end gap-2 shrink-0">
                          <div>
                            <span className="text-[10px] font-900 text-[var(--cc-text-muted)] opacity-55 uppercase tracking-[0.22em] leading-none mb-1 font-['Space_Grotesk'] block">
                              Valor
                            </span>
                            <span className="text-2xl font-900 text-[var(--cc-text-primary)] font-['Syne']">
                              {formatPriceBRL(service.priceBrl)}
                            </span>
                          </div>

                          <div className="flex gap-1 opacity-100 translate-x-0 md:opacity-0 md:translate-x-4 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-all duration-300">
                            <button
                              type="button"
                              onClick={() => openEditService(service)}
                              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--cc-bg-subtle)] hover:bg-[var(--cc-primary)] hover:text-white text-[var(--cc-primary)] transition-all shadow-sm"
                              aria-label="Editar serviço"
                            >
                              <Pencil className="w-4.5 h-4.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(service);
                              }}
                              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#FFF1F2] hover:bg-[#BE123C] hover:text-white text-[#BE123C] transition-all shadow-sm"
                              aria-label="Remover serviço"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="cc-card rounded-[2rem] p-7 md:p-10 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] flex items-center justify-center text-[var(--cc-primary)]">
                  <FilePlus2 className="w-7 h-7" strokeWidth={2.2} />
                </div>
                <h3 className="mt-5 text-2xl font-900 text-[var(--cc-text-primary)] font-['Syne']">
                  Nenhum serviço cadastrado ainda
                </h3>
                <p className="mt-3 text-[14px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] font-600 max-w-xl mx-auto leading-relaxed">
                  Use o formulário ao lado para cadastrar o primeiro serviço e começar a estruturar sua operação.
                </p>
                <button
                  type="button"
                  onClick={openCreateService}
                  className="mt-6 cc-btn-primary px-5 py-3 rounded-2xl text-[13px] inline-flex items-center gap-2"
                >
                  <FilePlus2 className="w-4 h-4" />
                  Cadastrar primeiro serviço
                </button>
              </div>
            )}

            <div className="cc-card rounded-[2rem] p-7 md:p-8 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              <div className="w-14 h-14 rounded-full bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] flex items-center justify-center text-[var(--cc-primary)] shrink-0">
                <Sparkles className="w-6 h-6" strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-800 text-[var(--cc-text-primary)] mb-1 font-['Syne']">
                  Dica de crescimento
                </h4>
                <p className="text-sm text-[var(--cc-text-muted)] leading-relaxed font-['Space_Grotesk'] font-600">
                  Clínicas de alto desempenho mantêm serviços, durações e preços atualizados para acelerar agenda,
                  confirmação e análise operacional.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-5"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar remoção de serviço"
          onClick={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <div className="absolute inset-0 bg-[#062B1D]/55 backdrop-blur-[6px]" />
          <div
            className="relative w-full max-w-md bg-[var(--cc-bg-white)] rounded-[2rem] border border-[var(--cc-border)] shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-7 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2] text-[#BE123C] flex items-center justify-center border border-[#FCA5A5]/50 shrink-0">
                    <AlertTriangle className="w-6 h-6" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-['Syne'] font-800 text-xl text-[var(--cc-text-primary)]">
                      Remover serviço?
                    </h3>
                    <p className="mt-1 text-[13px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600 opacity-80">
                      Você está prestes a remover{" "}
                      <span className="font-800 text-[var(--cc-text-primary)]">“{deleteTarget.name}”</span>. Isso apenas
                      desativa o serviço. Nada é apagado do histórico.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="w-10 h-10 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] transition-colors inline-flex items-center justify-center"
                  aria-label="Fechar"
                  disabled={deleting}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-7 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-2xl border border-[var(--cc-border-mid)] bg-[var(--cc-bg-white)] text-[var(--cc-primary)] font-['Space_Grotesk'] font-800 hover:bg-[var(--cc-bg-subtle)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-2xl bg-[#BE123C] text-white font-['Syne'] font-800 shadow-[0_10px_22px_rgba(190,18,60,0.25)] hover:bg-[#E11D48] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {deleting ? "Removendo..." : "Remover"}
                </button>
              </div>

              {deleteError ? (
                <div className="mt-4 rounded-2xl border border-[#FCA5A5]/50 bg-[#FFF1F2] px-4 py-3 text-[#BE123C] text-[13px] font-['Space_Grotesk'] font-700">
                  {deleteError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
