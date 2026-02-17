import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CLINIC_AREAS, getClinicAreaById, getClinicSpecialtiesByArea, type AreaId } from "@/lib/clinicAreas";
import { type TeamAccessLevel, type TeamMember, type TeamMemberInput, type TeamMemberUpdateInput, type TeamPlanSummary } from "@/lib/teamApi";
import { cn } from "@/lib/utils";
import { ArrowRight, BadgePlus, BriefcaseMedical, Lock, PenSquare, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type TeamManagementRow = TeamMember;

type TeamMemberDraft = {
  fullName: string;
  email: string;
  accessLevel: Exclude<TeamAccessLevel, "owner">;
  areaId: AreaId | "";
  specialties: string[];
  licenseCode: string;
};

const ACCESS_OPTIONS: Array<{
  value: Exclude<TeamAccessLevel, "owner">;
  label: string;
  description: string;
  kind: "doctor" | "secretary";
}> = [
  { value: "doctor", label: "Profissional", description: "Atendimento clínico com acesso operacional padrão.", kind: "doctor" },
  { value: "doctor_admin", label: "Admin clínico", description: "Profissional com permissões ampliadas na operação.", kind: "doctor" },
  { value: "secretary", label: "Secretária", description: "Acesso administrativo para agenda e suporte à clínica.", kind: "secretary" },
];

function initials(text: string) {
  const value = String(text || "CC").trim();
  if (!value) return "CC";
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

function accessLabel(value: TeamAccessLevel) {
  if (value === "owner") return "Admin";
  if (value === "doctor_admin") return "Admin clínico";
  if (value === "secretary") return "Secretária";
  return "Profissional";
}

function accountStatusLabel(status: TeamMember["accountStatus"]) {
  return status === "active" ? "Conta ativa" : "Convidado pendente";
}

function planLabel(name: string | null | undefined) {
  const raw = String(name || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "essencial" || normalized === "essential") return "Plano Essencial";
  if (normalized === "professional") return "Plano Professional";
  if (!raw) return "Plano";
  if (/^plano\s+/i.test(raw)) return raw;
  return `Plano ${raw}`;
}

function seatAvailability(value: number) {
  return value < 0 ? "Ilimitado" : String(value);
}

function areaTitle(areaId: AreaId | null | "") {
  return getClinicAreaById(areaId || null)?.title || "Área não definida";
}

function resolveLicenseLabel(areaId: AreaId | null | "") {
  if (areaId === "medicina") return "CRM";
  if (areaId === "psicologia") return "CRP";
  if (areaId === "nutricao") return "CRN";
  if (areaId === "odontologia") return "CRO";
  if (areaId === "fisioterapia") return "CREFITO";
  return "Registro profissional";
}

function normalizeDraftSpecialties(next: string[], options: string[]) {
  return next.filter((item) => options.includes(item));
}

function resolveAreaSpecialtyOptions(
  areaId: AreaId | "",
  clinicAreaId: AreaId | null,
  clinicSpecialties: string[]
) {
  if (!areaId) return [];

  const defaultOptions = getClinicSpecialtiesByArea(areaId);
  const clinicOptions = areaId === clinicAreaId ? clinicSpecialties : [];

  return Array.from(new Set([...defaultOptions, ...clinicOptions])).filter(Boolean);
}

function buildCreateDraft(defaultAreaId: AreaId | null) {
  return {
    fullName: "",
    email: "",
    accessLevel: "doctor" as const,
    areaId: defaultAreaId || "medicina",
    specialties: [],
    licenseCode: "",
  } satisfies TeamMemberDraft;
}

function buildEditDraft(row: TeamMember) {
  return {
    fullName: row.fullName,
    email: row.email,
    accessLevel: row.accessLevel === "owner" ? "doctor" : row.accessLevel,
    areaId: row.areaId || "",
    specialties: [...row.specialties],
    licenseCode: row.licenseCode || "",
  } satisfies TeamMemberDraft;
}

export default function TeamManagementCard({
  rows,
  plan,
  clinicAreaId,
  clinicSpecialties,
  canManage,
  loading = false,
  onCreate,
  onUpdate,
  onManagePlan,
  className,
}: {
  rows: TeamManagementRow[];
  plan: TeamPlanSummary | null;
  clinicAreaId: AreaId | null;
  clinicSpecialties: string[];
  canManage: boolean;
  loading?: boolean;
  onCreate: (input: TeamMemberInput) => Promise<void>;
  onUpdate: (memberId: string, input: TeamMemberUpdateInput) => Promise<void>;
  onManagePlan: (preferredPlanKey?: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TeamManagementRow | null>(null);
  const [draft, setDraft] = useState<TeamMemberDraft>(() => buildCreateDraft(clinicAreaId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const doctorAvailable = useMemo(() => {
    if (!plan) return true;
    const base = plan.remainingDoctors;
    if (base < 0) return true;
    return editingRow?.memberKind === "doctor" ? base + 1 > 0 : base > 0;
  }, [editingRow, plan]);

  const secretaryAvailable = useMemo(() => {
    if (!plan) return true;
    const base = plan.remainingSecretaries;
    if (base < 0) return true;
    return editingRow?.memberKind === "secretary" ? base + 1 > 0 : base > 0;
  }, [editingRow, plan]);

  const permissionBlockedReason = useMemo(() => {
    if (!canManage) return "Somente o admin da clínica pode criar ou editar usuários.";
    return null;
  }, [canManage]);

  const planLimitReason = useMemo(() => {
    if (!plan) return null;
    const hasDoctorSeats = plan.remainingDoctors < 0 || plan.remainingDoctors > 0;
    const hasSecretarySeats = plan.remainingSecretaries < 0 || plan.remainingSecretaries > 0;
    if (hasDoctorSeats || hasSecretarySeats) return null;
    return String(plan.name || "").trim().toLowerCase() === "essencial"
      ? "O Plano Essencial já usa o único login admin disponível da clínica."
      : "Seu plano atingiu o limite atual de acessos da equipe.";
  }, [plan]);

  const createBlockedReason = permissionBlockedReason || planLimitReason;
  const canOpenUpgradeFlow = Boolean(!permissionBlockedReason && planLimitReason);
  const upgradeTargetPlanKey = useMemo(() => {
    const currentPlan = String(plan?.name || "").trim().toLowerCase();
    if (currentPlan === "essencial") return "professional";
    return currentPlan || "professional";
  }, [plan?.name]);

  const availableSpecialties = useMemo(() => {
    return Array.from(
      new Set([
        ...resolveAreaSpecialtyOptions(draft.areaId, clinicAreaId, clinicSpecialties),
        ...draft.specialties,
      ])
    ).filter(Boolean);
  }, [clinicAreaId, clinicSpecialties, draft.areaId, draft.specialties]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const openCreate = () => {
    if (permissionBlockedReason || loading) return;
    if (planLimitReason) {
      setUpgradeDialogOpen(true);
      return;
    }
    setEditingRow(null);
    setDraft(buildCreateDraft(clinicAreaId));
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: TeamManagementRow) => {
    if (!canManage) return;
    setEditingRow(row);
    setDraft(buildEditDraft(row));
    setError(null);
    setOpen(true);
  };

  const resetMemberDialog = () => {
    setEditingRow(null);
    setDraft(buildCreateDraft(clinicAreaId));
    setError(null);
    setSubmitting(false);
  };

  const closeMemberDialog = () => {
    if (submitting) return;
    setOpen(false);
    setError(null);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      closeMemberDialog();
      return;
    }

    setOpen(true);
  };

  useEffect(() => {
    if (open) return;

    const timeoutId = window.setTimeout(() => {
      resetMemberDialog();
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [clinicAreaId, open]);

  const handleAreaChange = (value: AreaId | "") => {
    const options = resolveAreaSpecialtyOptions(value, clinicAreaId, clinicSpecialties);

    setDraft((current) => ({
      ...current,
      areaId: value,
      specialties: normalizeDraftSpecialties(current.specialties, options),
    }));
  };

  const toggleSpecialty = (specialty: string) => {
    setDraft((current) => ({
      ...current,
      specialties: current.specialties.includes(specialty)
        ? current.specialties.filter((item) => item !== specialty)
        : [...current.specialties, specialty],
    }));
  };

  const onSubmit = async () => {
    setError(null);

    if (!draft.fullName.trim()) {
      setError("Informe o nome completo do membro.");
      return;
    }

    if (!editingRow && !draft.email.trim()) {
      setError("Informe o e-mail que será usado para criar o acesso.");
      return;
    }

    const option = ACCESS_OPTIONS.find((item) => item.value === draft.accessLevel) || ACCESS_OPTIONS[0];
    if (option.kind === "doctor" && !doctorAvailable) {
      setError("O limite de profissionais deste plano já foi atingido.");
      return;
    }
    if (option.kind === "secretary" && !secretaryAvailable) {
      setError("O limite de secretárias deste plano já foi atingido.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingRow) {
        await onUpdate(editingRow.id, {
          fullName: draft.fullName.trim(),
          accessLevel: editingRow.isOwner ? "owner" : draft.accessLevel,
          areaId: draft.areaId || null,
          specialties: draft.specialties,
          licenseCode: draft.licenseCode.trim() || null,
        });
      } else {
        await onCreate({
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          accessLevel: draft.accessLevel,
          areaId: draft.areaId || null,
          specialties: draft.specialties,
          licenseCode: draft.licenseCode.trim() || null,
        });
      }

      setOpen(false);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar o membro da clínica.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={cn("space-y-6", className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <span className="size-11 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)]">
            <Users className="size-5" strokeWidth={2.4} />
          </span>
          <div>
            <h2 className="text-2xl font-900 font-['Syne'] tracking-tight">Gestão de equipe</h2>
            <p className="mt-1 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
              Admins podem criar e editar acessos respeitando os limites do plano da clínica.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          {plan ? (
            <>
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] text-[11px] font-900 uppercase tracking-[0.18em] font-['Space_Grotesk'] text-[var(--cc-theme-muted)]">
                <BriefcaseMedical className="size-3.5 text-[var(--cc-theme-accent)]" strokeWidth={2.4} />
                {planLabel(plan.name)}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] text-[11px] font-900 uppercase tracking-[0.16em] font-['Space_Grotesk'] text-[var(--cc-theme-muted)]">
                Profissionais {plan.usedDoctors}/{seatAvailability(plan.maxDoctors)}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] text-[11px] font-900 uppercase tracking-[0.16em] font-['Space_Grotesk'] text-[var(--cc-theme-muted)]">
                Secretárias {plan.usedSecretaries}/{seatAvailability(plan.maxSecretaries)}
              </span>
            </>
          ) : null}

          <button
            type="button"
            onClick={openCreate}
            disabled={Boolean(permissionBlockedReason) || loading}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 font-['Syne'] font-900 text-[12px] uppercase tracking-[0.18em] transition-all",
              "bg-[var(--cc-theme-action-bg)] text-[var(--cc-theme-action-fg)] shadow-[0_20px_40px_rgba(0,0,0,0.25)] hover:brightness-110 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            aria-label="Adicionar membro"
            title={permissionBlockedReason || (canOpenUpgradeFlow ? "Entender como liberar novos acessos" : "Adicionar membro")}
          >
            <BadgePlus className="size-4" strokeWidth={2.6} />
            Novo usuário
          </button>
        </div>
      </div>

      {createBlockedReason ? (
        <div className="cc-glass-card rounded-3xl p-4 md:p-5 border border-[color:var(--cc-theme-card-border)] text-[var(--cc-theme-fg)] flex items-start gap-3">
          <span className="mt-0.5 size-9 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)] shrink-0">
            <Lock className="size-4" strokeWidth={2.4} />
          </span>
          <div>
            <p className="text-[13px] font-900 font-['Syne']">Acesso bloqueado para novos usuários</p>
            <p className="mt-1 text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">{createBlockedReason}</p>
            {canOpenUpgradeFlow ? (
              <button
                type="button"
                onClick={() => setUpgradeDialogOpen(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-2 bg-[var(--cc-theme-action-bg)] text-[var(--cc-theme-action-fg)] font-['Syne'] font-800 text-[11px] uppercase tracking-[0.16em] hover:brightness-110 transition-all"
              >
                Fazer upgrade
                <ArrowRight className="size-3.5" strokeWidth={2.6} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="cc-glass-card rounded-3xl overflow-hidden text-[var(--cc-theme-fg)]">
        {loading ? (
          <div className="px-6 py-10 text-center text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-700">
            Carregando equipe da clínica...
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left border-collapse">
              <thead>
                <tr className="bg-[var(--cc-theme-accent-soft)] text-[var(--cc-theme-accent)] text-[11px] uppercase tracking-[0.22em] font-900 font-['Space_Grotesk']">
                  <th className="px-6 py-4">Membro</th>
                  <th className="px-6 py-4">Área / especialidades</th>
                  <th className="px-6 py-4">Acesso</th>
                  <th className="px-6 py-4">Status da conta</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--cc-theme-card-border)]">
                {rows.map((member) => (
                  <tr key={member.id} className="hover:bg-[var(--cc-theme-accent-soft)] transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-11 border border-[color:var(--cc-theme-card-border)]">
                          {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={member.fullName} /> : null}
                          <AvatarFallback className="bg-[var(--cc-theme-accent-soft)] text-[var(--cc-theme-fg)] font-['Syne'] font-900">
                            {initials(member.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-900 text-[14px] font-['Syne'] truncate">{member.fullName}</p>
                            {member.isOwner ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-accent)] text-[10px] font-900 uppercase tracking-[0.14em] text-[var(--cc-theme-accent)] font-['Space_Grotesk']">
                                <ShieldCheck className="size-3" strokeWidth={2.4} />
                                Admin
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600 truncate">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-[13px] text-[var(--cc-theme-fg)] opacity-85 font-['Space_Grotesk'] font-700">{areaTitle(member.areaId)}</p>
                      {member.specialties.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {member.specialties.map((specialty) => (
                            <span
                              key={`${member.id}-${specialty}`}
                              className="inline-flex items-center rounded-full border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card-solid)] px-2.5 py-1 text-[10px] font-['Space_Grotesk'] font-800 text-[var(--cc-theme-muted)]"
                            >
                              {specialty}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600 leading-relaxed">
                          Sem especialidades definidas.
                        </p>
                      )}
                      {member.licenseCode ? (
                        <p className="mt-1 text-[11px] text-[var(--cc-theme-accent)] opacity-80 font-['Space_Grotesk'] font-700">
                          {resolveLicenseLabel(member.areaId)}: {member.licenseCode}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-900 uppercase tracking-[0.14em] font-['Space_Grotesk'] border",
                          member.accessLevel === "owner" || member.accessLevel === "doctor_admin"
                            ? "bg-[var(--cc-theme-accent-soft)] text-[var(--cc-theme-accent)] border-[color:var(--cc-theme-accent)]"
                            : "bg-[var(--cc-theme-card-solid)] text-[var(--cc-theme-muted)] border-[color:var(--cc-theme-card-border)]"
                        )}
                      >
                        {member.accessLevel === "secretary" ? <UserCog className="size-3.5" strokeWidth={2.4} /> : <BriefcaseMedical className="size-3.5" strokeWidth={2.4} />}
                        {accessLabel(member.accessLevel)}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-900 uppercase tracking-[0.14em] font-['Space_Grotesk'] border",
                          member.accountStatus === "active"
                            ? "bg-emerald-500/12 text-emerald-300 border-emerald-400/30"
                            : "bg-amber-500/12 text-amber-200 border-amber-300/30"
                        )}
                      >
                        <span className={cn("size-2 rounded-full", member.accountStatus === "active" ? "bg-emerald-300" : "bg-amber-200")} />
                        {accountStatusLabel(member.accountStatus)}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(member)}
                        disabled={!canManage}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl cc-glass-solid hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[12px] font-['Space_Grotesk'] font-900"
                      >
                        <PenSquare className="size-4 text-[var(--cc-theme-accent)]" strokeWidth={2.4} />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto size-14 rounded-3xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)]">
              <UserPlus className="size-6" strokeWidth={2.4} />
            </div>
            <p className="mt-4 text-[16px] font-900 font-['Syne']">Nenhum usuário adicional cadastrado</p>
            <p className="mt-2 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
              Crie o próximo acesso da clínica a partir do botão acima.
            </p>
          </div>
        )}

        <div className="px-6 py-5 border-t border-[color:var(--cc-theme-card-border)] flex justify-center">
          <button
            type="button"
            onClick={openCreate}
            disabled={Boolean(permissionBlockedReason) || loading}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl cc-glass-solid text-[var(--cc-theme-fg)] hover:brightness-110 transition-all font-['Space_Grotesk'] font-900 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Users className="size-4 text-[var(--cc-theme-accent)]" strokeWidth={2.4} />
            Criar novo usuário
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          overlayClassName="bg-[#062B1D]/55 backdrop-blur-[6px]"
          className="max-w-[min(1120px,calc(100%-1.5rem))] sm:max-w-[1120px] border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card-solid)]/95 backdrop-blur-2xl text-[var(--cc-theme-fg)] rounded-[2rem] p-0 overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.35)]"
        >
          <div className="p-6 md:p-7 border-b border-[color:var(--cc-theme-card-border)] bg-[linear-gradient(180deg,rgba(35,217,150,0.08),rgba(35,217,150,0.02))]">
            <DialogHeader className="text-left">
              <DialogTitle className="text-2xl font-['Syne'] font-900 tracking-tight text-[var(--cc-theme-fg)]">
                {editingRow ? "Editar membro da clínica" : "Criar novo usuário"}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                Admins controlam os acessos; os limites seguem automaticamente o plano ativo da clínica.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 md:p-7 space-y-5 max-h-[78vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-800 uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk']">
                  Nome completo
                </label>
                <Input
                  aria-label="Nome completo"
                  value={draft.fullName}
                  onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
                  className="h-12 rounded-2xl border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] text-[15px] font-['Space_Grotesk'] font-600 text-[var(--cc-theme-fg)]"
                  placeholder="Nome completo"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-800 uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk']">
                  E-mail do acesso
                </label>
                <Input
                  aria-label="E-mail do acesso"
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                  disabled={Boolean(editingRow)}
                  className="h-12 rounded-2xl border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] text-[15px] font-['Space_Grotesk'] font-600 text-[var(--cc-theme-fg)] disabled:opacity-70"
                  placeholder="E-mail do acesso"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-800 uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk']">
                  Nível de acesso
                </label>
                <select
                  aria-label="Nível de acesso"
                  value={editingRow?.isOwner ? "owner" : draft.accessLevel}
                  onChange={(event) => setDraft((current) => ({ ...current, accessLevel: event.target.value as Exclude<TeamAccessLevel, "owner"> }))}
                  disabled={Boolean(editingRow?.isOwner)}
                  className="w-full h-12 rounded-2xl border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] px-4 text-[15px] font-['Space_Grotesk'] font-600 text-[var(--cc-theme-fg)] outline-none focus:ring-2 focus:ring-[color:var(--cc-theme-accent)] disabled:opacity-70"
                >
                  {editingRow?.isOwner ? <option value="owner">Admin</option> : null}
                  {ACCESS_OPTIONS.map((option) => {
                    const optionDisabled = option.kind === "doctor" ? !doctorAvailable : !secretaryAvailable;
                    const keepCurrent = editingRow && editingRow.memberKind === option.kind;
                    return <option key={option.value} value={option.value} disabled={optionDisabled && !keepCurrent}>{option.label}</option>;
                  })}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-800 uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk']">
                  Área de atuação
                </label>
                <select
                  aria-label="Área de atuação"
                  value={draft.areaId}
                  onChange={(event) => handleAreaChange((event.target.value as AreaId) || "")}
                  className="w-full h-12 rounded-2xl border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] px-4 text-[15px] font-['Space_Grotesk'] font-600 text-[var(--cc-theme-fg)] outline-none focus:ring-2 focus:ring-[color:var(--cc-theme-accent)]"
                >
                  {CLINIC_AREAS.map((area) => <option key={area.id} value={area.id}>{area.title}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.35fr,0.65fr] gap-4 items-start">
              <div className="space-y-3">
                <label className="block text-[11px] font-800 uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk']">
                  Especialidades
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableSpecialties.length ? availableSpecialties.map((specialty) => {
                    const checked = draft.specialties.includes(specialty);
                    return (
                      <label key={specialty} className={cn("flex items-center gap-3 rounded-2xl border px-3 py-3 cursor-pointer transition-colors", checked ? "border-[color:var(--cc-theme-accent)] bg-[var(--cc-theme-accent-soft)]" : "border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] hover:bg-[var(--cc-theme-accent-soft)]") }>
                        <Checkbox checked={checked} onCheckedChange={() => toggleSpecialty(specialty)} className="border-[var(--cc-theme-card-border)] data-[state=checked]:bg-[var(--cc-theme-accent)] data-[state=checked]:border-[var(--cc-theme-accent)] data-[state=checked]:text-[var(--cc-theme-action-fg)]" />
                        <span className="text-[13px] font-['Space_Grotesk'] font-600 text-[var(--cc-theme-fg)]">{specialty}</span>
                      </label>
                    );
                  }) : (
                    <div className="sm:col-span-2 rounded-2xl border border-dashed border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] px-4 py-5 text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                      Selecione primeiro uma área para liberar as especialidades.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-800 uppercase tracking-[0.18em] text-[var(--cc-theme-muted)] font-['Space_Grotesk']">
                  {resolveLicenseLabel(draft.areaId)}
                </label>
                <Input
                  aria-label={resolveLicenseLabel(draft.areaId)}
                  value={draft.licenseCode}
                  onChange={(event) => setDraft((current) => ({ ...current, licenseCode: event.target.value }))}
                  className="h-12 rounded-2xl border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] text-[15px] font-['Space_Grotesk'] font-600 text-[var(--cc-theme-fg)]"
                  placeholder={`${resolveLicenseLabel(draft.areaId)} / Registro`}
                />
              </div>
            </div>

            {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] font-['Space_Grotesk'] font-700 text-red-100">{error}</div> : null}
          </div>

          <div className="px-6 md:px-7 py-5 border-t border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)]">
            <DialogFooter className="gap-3 sm:justify-between sm:flex-row">
              <button type="button" onClick={closeMemberDialog} className="w-full sm:w-auto inline-flex items-center justify-center rounded-2xl px-5 py-3 font-['Space_Grotesk'] font-900 text-[12px] uppercase tracking-[0.16em] border border-[color:var(--cc-theme-card-border)] text-[var(--cc-theme-muted)] hover:text-[var(--cc-theme-fg)] transition-colors">Cancelar</button>
              <button type="button" onClick={onSubmit} disabled={submitting} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 font-['Syne'] font-900 text-[12px] uppercase tracking-[0.16em] bg-[var(--cc-theme-action-bg)] text-[var(--cc-theme-action-fg)] hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                <UserPlus className="size-4" strokeWidth={2.4} />
                {submitting ? "Salvando..." : editingRow ? "Editar usuário" : "Criar usuário"}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent
          overlayClassName="bg-[#062B1D]/55 backdrop-blur-[6px]"
          className="max-w-xl border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card-solid)]/95 backdrop-blur-2xl text-[var(--cc-theme-fg)] rounded-[2rem] p-0 overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.35)]"
        >
          <div className="p-6 md:p-7 border-b border-[color:var(--cc-theme-card-border)] bg-[linear-gradient(180deg,rgba(35,217,150,0.08),rgba(35,217,150,0.02))]">
            <DialogHeader className="text-left">
              <DialogTitle className="text-2xl font-['Syne'] font-900 tracking-tight text-[var(--cc-theme-fg)]">
                Upgrade necessário para novos acessos
              </DialogTitle>
              <DialogDescription className="text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                {planLimitReason || "Seu plano atual precisa de upgrade para liberar mais usuários."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 md:p-7 space-y-4">
            <div className="rounded-3xl border border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)] p-5">
              <p className="text-[13px] font-900 font-['Syne'] text-[var(--cc-theme-fg)]">
                A conta criada no cadastro já é a conta admin principal da clínica.
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                Para adicionar médicos, admins clínicos ou secretárias, precisamos liberar mais vagas no plano. Por enquanto, esse upgrade já pode ser feito direto na tela de Gerenciar plano.
              </p>
            </div>
          </div>

          <div className="px-6 md:px-7 py-5 border-t border-[color:var(--cc-theme-card-border)] bg-[var(--cc-theme-card)]">
            <DialogFooter className="gap-3 sm:justify-between sm:flex-row">
              <button
                type="button"
                onClick={() => setUpgradeDialogOpen(false)}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-2xl px-5 py-3 font-['Space_Grotesk'] font-900 text-[12px] uppercase tracking-[0.16em] border border-[color:var(--cc-theme-card-border)] text-[var(--cc-theme-muted)] hover:text-[var(--cc-theme-fg)] transition-colors"
              >
                Agora não
              </button>
              <button
                type="button"
                onClick={() => {
                  setUpgradeDialogOpen(false);
                  onManagePlan(upgradeTargetPlanKey);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 font-['Syne'] font-900 text-[12px] uppercase tracking-[0.16em] bg-[var(--cc-theme-action-bg)] text-[var(--cc-theme-action-fg)] hover:brightness-110 transition-all"
              >
                Gerenciar plano
                <ArrowRight className="size-4" strokeWidth={2.4} />
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
