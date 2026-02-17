import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { type PatientStatus, type PatientsDirectoryItem, type PatientsFilter, usePatientsDirectory } from "@/hooks/usePatientsDirectory";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function initialsFromName(name: string) {
  return String(name || "CC")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function digitsOnly(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhoneBr(phone: string | null) {
  const raw = String(phone || "").trim();
  if (!raw) return "Não informado";
  const digits = digitsOnly(raw);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

function formatDateBr(iso: string | null) {
  const raw = String(iso || "").trim();
  if (!raw) return "Sem consulta";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "Sem consulta";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  } catch {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
}

function formatDeltaPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 100)}%`;
}

function toDbStatus(status: PatientStatus) {
  if (status === "ativo") return "active";
  if (status === "inativo") return "inactive";
  return "new";
}

function isMissingColumnError(err: unknown) {
  const e = err as any;
  const code = String(e?.code || "");
  return code === "42703" || code === "PGRST204";
}

function statusBadge(status: PatientStatus) {
  if (status === "ativo") {
    return {
      label: "Ativo",
      className: "bg-[var(--cc-bg-subtle)] text-[var(--cc-primary)] border border-[var(--cc-border-accent)]",
    };
  }
  if (status === "inativo") {
    return {
      label: "Inativo",
      className: "bg-[#FFF1F2] text-[#BE123C] border border-[#FCA5A5]/60",
    };
  }
  return {
    label: "Novo",
    className: "bg-[#FFFBEB] text-[#B45309] border border-[#FCD34D]/60",
  };
}

function paginationItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, idx) => idx + 1);

  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push("ellipsis");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("ellipsis");
  items.push(total);

  return items;
}

export default function Patients() {
  const { user } = useAuth();
  const pageSize = 10;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PatientsFilter>("all");
  const [page, setPage] = useState(1);

  const directory = usePatientsDirectory({ userId: user?.id || null, search, filter, page, pageSize });
  const totalPages = Math.max(1, Math.ceil(directory.total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const showing = useMemo(() => {
    if (directory.total === 0) return { from: 0, to: 0 };
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(directory.total, page * pageSize);
    return { from, to };
  }, [directory.total, page, pageSize]);

  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [patientModalMode, setPatientModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<PatientStatus>("novo");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<PatientsDirectoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const savePatientMutation = useMutation({
    mutationFn: async () => {
      if (!directory.clinicId) {
        throw new Error("Não foi possível identificar sua clínica. Faça login novamente.");
      }
      if (!fullName.trim()) {
        throw new Error("Informe o nome do paciente.");
      }

      const basePayload: any = {
        full_name: fullName.trim(),
        phone: phone.trim() ? phone.trim() : null,
      };

      const shouldSendStatus = directory.supportsStatus;
      if (shouldSendStatus) basePayload.status = toDbStatus(status);

      const runWrite = async (payload: any) => {
        if (patientModalMode === "create") {
          return supabase.from("patients").insert({ ...payload, clinic_id: directory.clinicId });
        }
        if (!editingId) {
          return { error: { message: "missing_editing_id" } } as any;
        }
        return supabase.from("patients").update(payload).eq("id", editingId).eq("clinic_id", directory.clinicId);
      };

      let result = await runWrite(basePayload);
      if (result.error && shouldSendStatus && isMissingColumnError(result.error)) {
        const fallbackPayload = { ...basePayload };
        delete (fallbackPayload as any).status;
        result = await runWrite(fallbackPayload);
      }

      if (result.error) {
        if (import.meta.env.DEV) console.warn("[Patients] submit patient error:", result.error);
        throw new Error("Não foi possível salvar o paciente. Tente novamente.");
      }

      await directory.refetch();
    },
    onMutate: () => {
      setFormError(null);
      setSaving(true);
    },
    onSuccess: () => {
      setPatientModalOpen(false);
    },
    onError: (error) => {
      if (import.meta.env.DEV) console.warn("[Patients] submit patient unexpected error:", error);
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o paciente. Tente novamente.");
    },
    onSettled: () => {
      setSaving(false);
    },
  });

  const deletePatientMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) {
        throw new Error("Selecione um paciente para excluir.");
      }
      if (!directory.clinicId) {
        throw new Error("Não foi possível identificar sua clínica. Faça login novamente.");
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user) {
        if (import.meta.env.DEV) console.warn("[Patients] getSession before delete:", sessionError);
        throw new Error("Sua sessão expirou. Faça login novamente e tente de novo.");
      }

      const { data: visibleRow, error: visibleError } = await supabase
        .from("patients")
        .select("id")
        .eq("id", deleteTarget.id)
        .eq("clinic_id", directory.clinicId)
        .is("deleted_at", null)
        .maybeSingle();

      if (visibleError) {
        if (import.meta.env.DEV) console.warn("[Patients] pre-delete select error:", visibleError);
        throw new Error("Não foi possível validar sua permissão. Tente novamente.");
      }

      if (!visibleRow?.id) {
        throw new Error("Você não tem acesso a este paciente (ou ele já foi excluído).");
      }

      const { error } = await supabase
        .from("patients")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deleteTarget.id)
        .eq("clinic_id", directory.clinicId);

      if (error) {
        if (import.meta.env.DEV) console.warn("[Patients] delete patient error:", error);
        const code = String((error as any)?.code || "");
        const message = String((error as any)?.message || "");

        if (code === "42501") {
          throw new Error("Você não tem permissão para excluir este paciente. Verifique suas permissões de acesso e tente de novo.");
        }
        if (isMissingColumnError(error)) {
          throw new Error("Seu banco ainda não está pronto para excluir pacientes. Finalize as migrations e tente novamente.");
        }
        if (message.toLowerCase().includes("jwt expired")) {
          throw new Error("Sua sessão expirou. Faça login novamente e tente de novo.");
        }
        throw new Error("Não foi possível excluir o paciente. Verifique sua conexão e tente novamente.");
      }

      await directory.refetch();
    },
    onMutate: () => {
      setDeleteError(null);
      setDeleting(true);
    },
    onSuccess: () => {
      setDeleteTarget(null);
    },
    onError: (error) => {
      if (import.meta.env.DEV) console.warn("[Patients] delete patient unexpected error:", error);
      setDeleteError(error instanceof Error ? error.message : "Não foi possível excluir o paciente. Tente novamente.");
    },
    onSettled: () => {
      setDeleting(false);
    },
  });

  const openCreatePatient = () => {
    setFormError(null);
    setPatientModalMode("create");
    setEditingId(null);
    setFullName("");
    setPhone("");
    setStatus("novo");
    setPatientModalOpen(true);
  };

  const openEditPatient = (row: PatientsDirectoryItem) => {
    setFormError(null);
    setPatientModalMode("edit");
    setEditingId(row.id);
    setFullName(row.name);
    setPhone(row.phone || "");
    setStatus(row.status);
    setPatientModalOpen(true);
  };

  const closePatientModal = () => {
    if (saving) return;
    setPatientModalOpen(false);
  };

  const submitPatient = async () => {
    await savePatientMutation.mutateAsync().catch(() => undefined);
  };

  const requestDelete = (row: PatientsDirectoryItem) => {
    setDeleteError(null);
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deletePatientMutation.mutateAsync().catch(() => undefined);
  };

  const controlsDisabled = directory.loading || saving || deleting;

  const filters: Array<{ id: PatientsFilter; label: string }> = [
    { id: "all", label: "Todos" },
    { id: "active", label: "Ativos" },
    { id: "new", label: "Novos" },
  ];

  const pager = useMemo(() => paginationItems(page, totalPages), [page, totalPages]);
  const kpiDelta = formatDeltaPct(directory.kpis?.growthPct30d ?? null);

  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] relative overflow-hidden">
      <div className="absolute top-0 -left-16 w-96 h-96 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -right-20 w-[560px] h-[560px] bg-[#025940]/5 rounded-full blur-3xl" />

      <main className="relative z-10 max-w-7xl mx-auto px-5 md:px-12 py-7 md:py-10 space-y-6 md:space-y-8">
        <div className="flex flex-col gap-3">
          {directory.clinicName ? (
            <div className="text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] truncate">
              {directory.clinicName}
            </div>
          ) : directory.isInitialLoading ? (
            <Skeleton className="h-3.5 w-32 rounded-full" />
          ) : null}
          <div>
            <h1 className="text-[34px] md:text-5xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne'] leading-[1.05]">
              Pacientes
            </h1>
            <p className="mt-3 text-[14px] md:text-[16px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600 max-w-2xl leading-relaxed">
              Cadastre e acompanhe seus pacientes, contatos e últimas consultas.
            </p>
          </div>
        </div>

        {directory.error ? (
          <div className="cc-card rounded-3xl p-5 border-[#BE123C]/15 bg-[#FFF1F2]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#BE123C] mt-0.5" />
              <div className="min-w-0">
                <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                  Não foi possível carregar a lista de pacientes
                </div>
                <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] font-600">
                  {directory.error}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="cc-card rounded-3xl p-6 md:p-7 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-28 -left-28 w-80 h-80 bg-[#025940]/5 rounded-full blur-3xl" />

            <div className="relative z-10">
              <div className="flex items-start justify-between gap-4">
                <div className="w-11 h-11 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] shadow-sm flex items-center justify-center">
                  <Users className="w-5 h-5 text-[var(--cc-primary)]" strokeWidth={2.2} aria-hidden />
                </div>
                {directory.loadingKpis ? (
                  <Skeleton className="h-7 w-16 rounded-full" />
                ) : kpiDelta ? (
                  <span className="text-[11px] font-900 uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border border-[var(--cc-border-accent)] text-[var(--cc-primary)] bg-[var(--cc-bg-subtle)]">
                    {kpiDelta}
                  </span>
                ) : null}
              </div>

              <div className="mt-5">
                {directory.loadingKpis ? (
                  <Skeleton className="h-10 w-36 rounded-2xl" />
                ) : (
                  <div className="text-3xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne']">
                    {(directory.kpis?.totalPatients ?? 0).toLocaleString("pt-BR")}
                  </div>
                )}
                <div className="mt-1 text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                  Total de pacientes
                </div>
                {directory.loadingKpis ? (
                  <Skeleton className="mt-3 h-4 w-56 rounded-lg" />
                ) : directory.kpis ? (
                  <div className="mt-3 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                    {kpiDelta ? "Variação de novos pacientes vs. 30 dias anteriores." : "Sem histórico suficiente para comparar."}
                  </div>
                ) : (
                  <div className="mt-3 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                    {directory.kpiError ? directory.kpiError : "Não disponível no momento."}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="cc-card rounded-3xl p-6 md:p-7 relative overflow-hidden">
            <div className="absolute -top-24 -left-24 w-72 h-72 bg-[#025940]/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-28 -right-28 w-80 h-80 bg-[#23D996]/10 rounded-full blur-3xl" />

            <div className="relative z-10">
              <div className="flex items-start justify-between gap-4">
                <div className="w-11 h-11 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] shadow-sm flex items-center justify-center">
                  <Plus className="w-5 h-5 text-[var(--cc-primary)]" strokeWidth={2.2} aria-hidden />
                </div>
                <span className="text-[11px] font-900 uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border border-[var(--cc-border)] text-[var(--cc-text-muted)] opacity-70 bg-[var(--cc-bg-white)]">
                  30 dias
                </span>
              </div>

              <div className="mt-5">
                {directory.loadingKpis ? (
                  <Skeleton className="h-10 w-28 rounded-2xl" />
                ) : (
                  <div className="text-3xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne']">
                    {(directory.kpis?.newPatients30d ?? 0).toLocaleString("pt-BR")}
                  </div>
                )}
                <div className="mt-1 text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                  Novos nos últimos 30 dias
                </div>
                {directory.loadingKpis ? (
                  <Skeleton className="mt-3 h-4 w-52 rounded-lg" />
                ) : directory.kpis ? (
                  <div className="mt-3 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                    Pacientes cadastrados recentemente.
                  </div>
                ) : (
                  <div className="mt-3 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                    {directory.kpiError ? directory.kpiError : "Não disponível no momento."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="cc-card rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--cc-border)] bg-[var(--cc-bg-white)]">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cc-primary)] opacity-45" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome ou telefone…"
                    className={cn(
                      "h-11 w-full rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] pl-10 pr-4 text-[13px] text-[var(--cc-text-body)] shadow-sm",
                      "placeholder:text-[var(--cc-text-muted)] placeholder:opacity-50 font-['Space_Grotesk']",
                      "focus:outline-none focus:ring-2 focus:ring-[#23D996]/35 focus:border-[#23D996]/60",
                      controlsDisabled && "opacity-70"
                    )}
                    disabled={controlsDisabled}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 justify-between md:justify-end">
                <div className="inline-flex p-1 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] shadow-sm">
                  {filters.map((item) => {
                    const active = filter === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setFilter(item.id)}
                        disabled={controlsDisabled}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[13px] font-['Space_Grotesk'] font-800 transition-colors",
                          active
                            ? "bg-[var(--cc-primary)] text-[var(--cc-text-on-primary)] shadow-sm"
                            : "text-[var(--cc-primary)] opacity-60 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)]",
                          controlsDisabled && "opacity-70 hover:bg-transparent hover:opacity-60"
                        )}
                        aria-pressed={active}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={openCreatePatient}
                  className={cn(
                    "cc-btn-primary inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-[13px] md:text-sm",
                    "active:scale-[0.98] transition-transform",
                    controlsDisabled && "opacity-70"
                  )}
                  disabled={controlsDisabled}
                >
                  <Plus className="w-4 h-4" />
                  Adicionar paciente
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[920px]">
            <TableHeader className="bg-[var(--cc-bg-subtle)] [&_tr]:border-b-[var(--cc-border)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-auto px-6 py-4 text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                  Paciente
                </TableHead>
                <TableHead className="h-auto px-6 py-4 text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                  Telefone
                </TableHead>
                <TableHead className="h-auto px-6 py-4 text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                  Última consulta
                </TableHead>
                <TableHead className="h-auto px-6 py-4 text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                  Status
                </TableHead>
                <TableHead className="h-auto px-6 py-4 text-right text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className="[&_tr:last-child]:border-b-0">
              {directory.loading ? (
                Array.from({ length: pageSize }).map((_, idx) => (
                  <TableRow key={idx} className="border-b border-[var(--cc-border)] hover:bg-[var(--cc-bg-subtle)]">
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="min-w-0">
                          <Skeleton className="h-4 w-44 rounded-lg" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Skeleton className="h-4 w-32 rounded-lg" />
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Skeleton className="h-4 w-28 rounded-lg" />
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Skeleton className="h-7 w-20 rounded-full" />
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="inline-flex gap-2 justify-end">
                        <Skeleton className="h-9 w-9 rounded-2xl" />
                        <Skeleton className="h-9 w-9 rounded-2xl" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : directory.rows.length === 0 ? (
                <TableRow className="border-b border-[var(--cc-border)] hover:bg-[var(--cc-bg-subtle)]">
                  <TableCell colSpan={5} className="px-6 py-12">
                    <div className="text-center">
                      <div className="text-[15px] font-900 text-[var(--cc-text-primary)] font-['Syne']">
                        Nenhum paciente encontrado
                      </div>
                      <div className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                        {search.trim() || filter !== "all"
                          ? "Tente ajustar a busca ou os filtros."
                          : "Comece adicionando seu primeiro paciente."}
                      </div>
                      <div className="mt-6 flex items-center justify-center gap-3">
                        {search.trim() || filter !== "all" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSearch("");
                              setFilter("all");
                            }}
                            className="h-11 px-5 rounded-2xl border border-[var(--cc-border-mid)] bg-[var(--cc-bg-white)] text-[var(--cc-primary)] font-['Space_Grotesk'] font-800 hover:bg-[var(--cc-bg-subtle)] transition-colors"
                          >
                            Limpar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={openCreatePatient}
                          className="cc-btn-primary h-11 px-5 rounded-2xl font-['Syne'] font-800 text-sm inline-flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          Adicionar paciente
                        </button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                directory.rows.map((row) => {
                  const badge = statusBadge(row.status);
                  return (
                    <TableRow key={row.id} className="border-b border-[var(--cc-border)] hover:bg-[var(--cc-bg-subtle)] group">
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="size-10 border border-[var(--cc-border-mid)] bg-[var(--cc-bg-white)]">
                            <AvatarFallback className="bg-[var(--cc-bg-subtle)] text-[var(--cc-primary)] font-['Syne'] font-900 text-xs">
                              {initialsFromName(row.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk'] truncate">
                              {row.name}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-4">
                        <div className="text-[13px] text-[var(--cc-text-body)] font-['Space_Grotesk'] font-700">
                          {formatPhoneBr(row.phone)}
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-4">
                        <div className="text-[13px] text-[var(--cc-text-body)] font-['Space_Grotesk'] font-700">
                          {formatDateBr(row.lastConsultationAt)}
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center px-3 py-1 rounded-full text-[11px] font-900 uppercase tracking-[0.18em] font-['Space_Grotesk']",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </TableCell>

                      <TableCell className="px-6 py-4 text-right">
                        <div className="inline-flex gap-2 justify-end md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => openEditPatient(row)}
                            className="w-9 h-9 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] transition-colors inline-flex items-center justify-center"
                            aria-label="Editar paciente"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(row)}
                            className="w-9 h-9 rounded-2xl bg-[var(--cc-bg-white)] border border-[#BE123C]/20 text-[#BE123C]/80 hover:text-[#BE123C] hover:bg-[#FFF1F2] transition-colors inline-flex items-center justify-center"
                            aria-label="Excluir paciente"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            </Table>
          </div>

          <div className="px-6 py-4 border-t border-[var(--cc-border)] bg-[var(--cc-bg-white)] flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700">
              Mostrando {showing.from} a {showing.to} de {directory.total.toLocaleString("pt-BR")} paciente(s)
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || controlsDisabled}
                className="w-9 h-9 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] disabled:opacity-40 disabled:hover:bg-[var(--cc-bg-white)] transition-colors inline-flex items-center justify-center"
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {pager.map((item, idx) =>
                item === "ellipsis" ? (
                  <span key={`e-${idx}`} className="px-2 text-[var(--cc-text-muted)] opacity-40 font-['Space_Grotesk'] font-800">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    disabled={controlsDisabled}
                    className={cn(
                      "w-9 h-9 rounded-2xl border text-[12px] font-900 font-['Space_Grotesk'] transition-colors",
                      item === page
                        ? "bg-[var(--cc-primary)] border-[var(--cc-primary)] text-[var(--cc-text-on-primary)]"
                        : "bg-[var(--cc-bg-white)] border-[var(--cc-border)] text-[var(--cc-primary)] opacity-75 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)]"
                    )}
                    aria-label={`Página ${item}`}
                    aria-current={item === page ? "page" : undefined}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || controlsDisabled}
                className="w-9 h-9 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] disabled:opacity-40 disabled:hover:bg-[var(--cc-bg-white)] transition-colors inline-flex items-center justify-center"
                aria-label="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {patientModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-5"
          role="dialog"
          aria-modal="true"
          aria-label={patientModalMode === "create" ? "Adicionar paciente" : "Editar paciente"}
          onClick={closePatientModal}
        >
          <div className="absolute inset-0 bg-[#062B1D]/55 backdrop-blur-[6px]" />
          <div
            className="relative w-full max-w-lg bg-[var(--cc-bg-white)] rounded-[2rem] border border-[var(--cc-border)] shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-7 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-['Syne'] font-800 text-xl text-[var(--cc-text-primary)]">
                    {patientModalMode === "create" ? "Adicionar paciente" : "Editar paciente"}
                  </h3>
                  <p className="mt-1 text-[13px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600 opacity-80">
                    {patientModalMode === "create"
                      ? "Cadastre um novo paciente para começar a registrar consultas e contatos."
                      : "Atualize os dados do paciente."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closePatientModal}
                  className="w-10 h-10 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] transition-colors inline-flex items-center justify-center"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Nome completo
                  </label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border-mid)] px-4 text-[14px] text-[var(--cc-text-body)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#23D996]/35 focus:border-[#23D996]/60 font-['Space_Grotesk']"
                    placeholder="Ex.: Ana Beatriz Silva"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Telefone
                  </label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border-mid)] px-4 text-[14px] text-[var(--cc-text-body)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#23D996]/35 focus:border-[#23D996]/60 font-['Space_Grotesk']"
                    placeholder="Ex.: (11) 99999-9999"
                    disabled={saving}
                    inputMode="tel"
                  />
                </div>

                {directory.supportsStatus ? (
                  <div>
                    <label className="block text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as PatientStatus)}
                      className="mt-2 h-11 w-full rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border-mid)] px-4 text-[14px] text-[var(--cc-text-body)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#23D996]/35 focus:border-[#23D996]/60 font-['Space_Grotesk']"
                      disabled={saving}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                      <option value="novo">Novo</option>
                    </select>
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                    Status calculado automaticamente (Ativo/Novo).
                  </div>
                )}

                {formError ? (
                  <div className="bg-[#FFF1F2] border border-[#FCA5A5]/50 rounded-2xl px-4 py-3 text-[#BE123C] text-[13px] font-['Space_Grotesk'] font-700">
                    {formError}
                  </div>
                ) : null}

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={closePatientModal}
                    disabled={saving}
                    className="flex-1 h-12 rounded-2xl border border-[var(--cc-border-mid)] bg-[var(--cc-bg-white)] text-[var(--cc-primary)] font-['Space_Grotesk'] font-800 hover:bg-[var(--cc-bg-subtle)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={submitPatient}
                    disabled={saving}
                    className="flex-1 h-12 rounded-2xl cc-btn-primary font-['Syne'] font-800 shadow-[0_10px_22px_rgba(2,89,64,0.22)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-5"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar exclusão de paciente"
          onClick={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <div className="absolute inset-0 bg-[#062B1D]/55 backdrop-blur-[6px]" />
          <div
            className="relative w-full max-w-md bg-[var(--cc-bg-white)] rounded-[2rem] border border-[var(--cc-border)] shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-7 md:p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2] text-[#BE123C] flex items-center justify-center border border-[#FCA5A5]/50">
                  <AlertTriangle className="w-6 h-6" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-['Syne'] font-800 text-xl text-[var(--cc-text-primary)]">Excluir paciente?</h3>
                  <p className="mt-1 text-[13px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600 opacity-80">
                    Você está prestes a excluir{" "}
                    <span className="font-800 text-[var(--cc-text-primary)]">“{deleteTarget.name}”</span>. Essa ação remove o paciente
                    da sua lista. Nada é apagado do histórico.
                  </p>
                </div>
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
                  {deleting ? "Excluindo..." : "Excluir"}
                </button>
              </div>

              {deleteError ? (
                <div className="mt-4 bg-[#FFF1F2] border border-[#FCA5A5]/50 rounded-2xl px-4 py-3 text-[#BE123C] text-[13px] font-['Space_Grotesk'] font-700">
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
