import NotificationBell from "@/components/app/NotificationBell";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useClinicNotifications } from "@/hooks/useClinicNotifications";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { resolveUserEntry } from "@/lib/entryGate";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Cake,
  CalendarDays,
  Download,
  EllipsisVertical,
  Plus,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { useLocation } from "wouter";

function formatDeltaPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 100)}%`;
}

function initialsFromName(name: string) {
  return String(name || "CC")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const overview = useDashboardOverview(user?.id || null);
  const notifications = useClinicNotifications(user?.id || null);
  const membership = useQuery({
    queryKey: ["dashboard-whatsapp-manage", user?.id || ""],
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const userId = String(user?.id || "").trim();
      if (!userId) return { canManage: false };

      const entry = await resolveUserEntry(userId);
      const clinicId = String(entry.clinicId || "").trim();
      if (!clinicId) return { canManage: false };

      const { data, error } = await supabase
        .from("clinic_members")
        .select("role,is_admin")
        .eq("clinic_id", clinicId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      const role = String((data as any)?.role || "").trim().toLowerCase();
      const isAdmin = Boolean((data as any)?.is_admin);
      return { canManage: isAdmin || role === "owner" };
    },
  });

  const todayLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date());
    } catch {
      return "";
    }
  }, []);

  const kpis = useMemo(() => {
    const payload = overview.data;
    const k = payload?.kpis;
    const ops = payload?.operations;
    const birthdays = payload?.birthdaysWeek || [];
    if (!k || !ops) return [];

    const formatNextBirthday = (iso: string) => {
      try {
        return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(
          new Date(iso)
        );
      } catch {
        return "";
      }
    };

    const birthdayPreview = birthdays.length
      ? birthdays
          .slice(0, 2)
          .map((b) => `${b.name.split(" ")[0] || b.name} • ${formatNextBirthday(b.nextBirthday)}`)
          .join("  ·  ")
      : "Nenhum nos próximos 7 dias";

    return [
      {
        label: "Total de pacientes",
        value: k.totalPatients.toLocaleString("pt-BR"),
        delta: formatDeltaPct(k.newPatientsGrowthPct30d),
        helper: `${k.newPatients30d.toLocaleString("pt-BR")} novos (30d)`,
        icon: Users,
        tone: "emerald" as const,
      },
      {
        label: "Horários livres hoje",
        value: ops.today.free.toLocaleString("pt-BR"),
        helper: `${ops.today.booked.toLocaleString("pt-BR")} agendados • ${ops.today.total.toLocaleString("pt-BR")} total`,
        icon: CalendarDays,
        tone: "blue" as const,
      },
      {
        label: "Horários livres na semana",
        value: ops.week.free.toLocaleString("pt-BR"),
        helper: `${ops.week.booked.toLocaleString("pt-BR")} agendados • ${ops.week.total.toLocaleString("pt-BR")} total`,
        icon: CalendarDays,
        tone: "emerald" as const,
      },
      {
        label: "Aniversários (7 dias)",
        value: birthdays.length.toLocaleString("pt-BR"),
        helper: birthdayPreview,
        icon: Cake,
        tone: "rose" as const,
      },
    ];
  }, [overview.data]);

  const patientEvolution = overview.data?.patientEvolution || [];
  const noReturn30d = overview.data?.noReturn30d || [];
  const weekOps = overview.data?.operations?.weekdays || [];
  const activityToday = overview.data?.activityToday || [];
  const cancellationsLost7d = overview.data?.cancellationsLost7d || [];
  const pendingConfirmationsTomorrow = overview.data?.pendingConfirmationsTomorrow || [];
  const maxWeekBooked = useMemo(() => {
    let max = 0;
    for (const d of weekOps) {
      max = Math.max(max, Number(d.booked || 0));
    }
    return max;
  }, [weekOps]);

  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] relative overflow-hidden">
      <div className="absolute top-0 -left-16 w-96 h-96 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -right-20 w-[540px] h-[540px] bg-[#025940]/5 rounded-full blur-3xl" />

      <main className="relative z-10 max-w-7xl mx-auto px-5 md:px-12 py-7 md:py-10 space-y-6 md:space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="min-w-0">
            {overview.data?.clinic?.name ? (
              <div className="text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] truncate">
                {overview.data.clinic.name}
              </div>
            ) : overview.loading ? (
              <Skeleton className="h-3.5 w-32 rounded-full" />
            ) : null}
            <h1 className="text-[34px] md:text-5xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne'] leading-[1.05]">
              Dashboard
            </h1>
            <p className="mt-3 text-[14px] md:text-[16px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600 max-w-2xl leading-relaxed">
              Uma visão rápida do que merece ação agora — ocupação, pendências e oportunidades de recuperação.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 sm:justify-end">
            <div className="text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700 capitalize">
              {todayLabel}
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <NotificationBell
                notifications={notifications.data || []}
                loading={notifications.isLoading}
                canManage={Boolean(membership.data?.canManage)}
                onOpenSettings={() => setLocation("/configuracoes?integration=whatsapp")}
              />

              <button
                type="button"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] hover:bg-[var(--cc-bg-subtle)] transition-colors font-['Space_Grotesk'] font-700 text-[13px]"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>

              <button
                type="button"
                className="cc-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px]"
              >
                <Plus className="w-4 h-4" />
                Nova consulta
              </button>
            </div>
          </div>
        </div>

        {overview.error ? (
          <div className="cc-card rounded-3xl p-5 border-[#BE123C]/15 bg-[#FFF1F2]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#BE123C] mt-0.5" />
              <div className="min-w-0">
                <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                  Não foi possível carregar o dashboard
                </div>
                <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] font-600">
                  {overview.error}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {overview.loading && !overview.data
            ? Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="cc-card rounded-3xl p-6">
                  <Skeleton className="h-10 w-10 rounded-2xl" />
                  <Skeleton className="mt-5 h-9 w-28 rounded-xl" />
                  <Skeleton className="mt-2 h-4 w-40 rounded-lg" />
                  <Skeleton className="mt-4 h-4 w-32 rounded-lg" />
                </div>
              ))
            : kpis.map((kpi) => {
                const Icon = kpi.icon;
                const tone = kpi.tone;
                const toneStyles =
                  tone === "emerald"
                    ? "bg-[#E8F5ED] text-[#118C5F] border-[#118C5F]/10"
                    : tone === "blue"
                      ? "bg-[#EEF4FF] text-[#0566D9] border-[#0566D9]/10"
                      : "bg-[#FFF1F2] text-[#BE123C] border-[#BE123C]/10";

                return (
                  <div key={kpi.label} className="cc-card rounded-3xl p-6 relative overflow-hidden">
                    <div className="absolute -top-16 -right-16 w-40 h-40 bg-[#23D996]/10 rounded-full blur-2xl" />
                    <div className="relative z-10">
                      <div className="flex items-start justify-between gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] shadow-sm flex items-center justify-center">
                          <Icon className="w-5 h-5 text-[var(--cc-primary)]" strokeWidth={2.2} />
                        </div>
                        {kpi.delta ? (
                          <span
                            className={cn(
                              "text-[11px] font-900 uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border",
                              toneStyles
                            )}
                          >
                            {kpi.delta}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-5">
                        <div className="text-3xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne']">
                          {kpi.value}
                        </div>
                        <div className="mt-1 text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                          {kpi.label}
                        </div>
                        {kpi.helper ? (
                          <div className="mt-3 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                            {kpi.helper}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          <div className="lg:col-span-8 cc-card rounded-3xl p-6 md:p-8 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-28 -left-28 w-80 h-80 bg-[#025940]/5 rounded-full blur-3xl" />

            <div className="relative z-10">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl md:text-2xl font-900 tracking-tight text-[var(--cc-text-primary)] font-['Syne']">
                    Novos pacientes
                  </h2>
                  <p className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                    Aquisição nos últimos 6 meses.
                  </p>
                </div>
                <button
                  type="button"
                  className="w-10 h-10 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] transition-colors flex items-center justify-center"
                  aria-label="Mais opções"
                >
                  <EllipsisVertical className="w-5 h-5" />
                </button>
              </div>

              {overview.loading && !overview.data ? (
                <Skeleton className="h-[260px] md:h-[300px] w-full rounded-3xl" />
              ) : (
                <ChartContainer
                  className="w-full h-[240px] md:h-[280px] aspect-auto"
                  config={{
                    patients: {
                      label: "Pacientes",
                      color: "var(--cc-tertiary)",
                    },
                  }}
                >
                  <AreaChart data={patientEvolution} margin={{ left: 8, right: 12, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ccPatientsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-patients)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--color-patients)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} />
                    <ChartTooltip
                      cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          formatter={(value) => (
                            <div className="flex w-full items-center justify-between gap-3">
                              <span className="text-muted-foreground">Pacientes</span>
                              <span className="text-foreground font-mono font-medium tabular-nums">
                                {Number(value).toLocaleString("pt-BR")}
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="patients"
                      stroke="var(--color-patients)"
                      strokeWidth={2.5}
                      fill="url(#ccPatientsFill)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 cc-card rounded-3xl p-6 md:p-8 relative overflow-hidden">
            <div className="absolute -top-20 -left-16 w-64 h-64 bg-[#23D996]/10 rounded-full blur-3xl" />
              <div className="relative z-10 flex flex-col h-full">
              <h2 className="text-xl md:text-2xl font-900 tracking-tight text-[var(--cc-text-primary)] font-['Syne']">
                Pacientes sem retorno
              </h2>
              <p className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                Mais de 30 dias sem consulta registrada.
              </p>

              <div className="mt-6 flex-1">
                {overview.loading && !overview.data ? (
                  <div className="space-y-3">
                    <Skeleton className="h-14 w-full rounded-2xl" />
                    <Skeleton className="h-14 w-full rounded-2xl" />
                    <Skeleton className="h-14 w-full rounded-2xl" />
                  </div>
                ) : noReturn30d.length ? (
                  <div className="space-y-3">
                    {noReturn30d.slice(0, 5).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] hover:bg-[var(--cc-bg-subtle)] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] flex items-center justify-center text-[10px] font-900 text-[var(--cc-primary)] font-['Space_Grotesk'] shrink-0">
                            {initialsFromName(p.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk'] truncate">
                              {p.name}
                            </div>
                            <div className="mt-1 text-[11px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700 uppercase tracking-[0.16em] truncate">
                              Último atendimento{" "}
                              {p.lastVisitAt ? new Date(p.lastVisitAt).toLocaleDateString("pt-BR") : "—"}
                            </div>
                          </div>
                        </div>
                        <span className="text-[11px] font-900 uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-[#FFF7ED] text-[#C2410C] border border-[#C2410C]/15 font-['Space_Grotesk'] shrink-0">
                          Há {p.daysSince}d
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)]">
                    <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                      Sem histórico suficiente ainda
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600 leading-relaxed">
                      Assim que você começar a registrar consultas no sistema, esta lista mostra quem reativar.
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocation("/agenda")}
                      className="mt-4 w-full cc-btn-outline py-3 rounded-2xl text-[12px] font-800"
                    >
                      Ver agenda
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          <div className="lg:col-span-8 cc-card rounded-3xl overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-[var(--cc-border)] bg-[var(--cc-bg-white)] backdrop-blur-sm flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl md:text-2xl font-900 tracking-tight text-[var(--cc-text-primary)] font-['Syne']">
                    Últimas consultas realizadas
                  </h2>
                  <span className="inline-flex items-center gap-2 text-[11px] font-900 uppercase tracking-[0.18em] text-[var(--cc-secondary)] bg-[var(--cc-bg-subtle)] px-3 py-1.5 rounded-full border border-[var(--cc-border)] font-['Space_Grotesk']">
                    <span className="w-2 h-2 rounded-full bg-[var(--cc-tertiary)]" />
                    {activityToday.length ? `${activityToday.length} registros` : "Sem registros"}
                  </span>
                </div>
                <div className="mt-2 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600 capitalize truncate">
                  {todayLabel}
                </div>
              </div>
              <button
                type="button"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] hover:bg-[var(--cc-bg-subtle)] transition-colors font-['Space_Grotesk'] font-700 text-[13px]"
                onClick={() => setLocation("/agenda")}
              >
                <CalendarDays className="w-4 h-4" />
                Abrir agenda
              </button>
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              <div className="divide-y divide-[var(--cc-border)]">
                {overview.loading && !overview.data ? (
                  <div className="px-6 py-6">
                    <Skeleton className="h-10 w-full rounded-2xl" />
                    <Skeleton className="mt-3 h-10 w-full rounded-2xl" />
                    <Skeleton className="mt-3 h-10 w-full rounded-2xl" />
                  </div>
                ) : activityToday.length ? (
                  activityToday.map((appt) => {
                    const start = new Date(appt.startsAt);
                    const timeLabel = (() => {
                      try {
                        const fmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
                        return fmt.format(start);
                      } catch {
                        return "";
                      }
                    })();

                    const status = String(appt.status || "").toLowerCase();
                    const pill =
                      status === "cancelled" || status === "canceled"
                        ? { label: "Cancelada", className: "bg-[#FFF1F2] text-[#BE123C] border border-[#BE123C]/15" }
                        : status === "no_show" || status === "missed"
                          ? { label: "Faltou", className: "bg-[#FFF7ED] text-[#C2410C] border border-[#C2410C]/15" }
                          : status === "done" || status === "completed"
                            ? {
                                label: "Concluída",
                                className: "bg-[#E8F5ED] text-[#118C5F] border border-[#118C5F]/15",
                              }
                            : {
                                label: "Atualizada",
                                className: "bg-[#EEF4FF] text-[#0566D9] border border-[#0566D9]/15",
                              };

                    return (
                      <div
                        key={appt.id}
                        className="px-6 py-4 flex items-center gap-4 hover:bg-[var(--cc-bg-subtle)] transition-colors"
                      >
                        <div className="w-20 text-sm font-900 font-['Space_Grotesk'] text-[var(--cc-text-muted)] opacity-70">
                          {timeLabel || "—"}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="font-['Syne'] font-900 text-[var(--cc-text-primary)] truncate">
                            {appt.patientName || "Paciente"}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700 uppercase tracking-[0.16em] truncate">
                            Status registrado hoje
                          </div>
                        </div>

                        <span
                          className={cn(
                            "px-3 py-1.5 rounded-full text-[10px] font-900 uppercase tracking-[0.18em]",
                            pill.className
                          )}
                        >
                          {pill.label}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-6 py-10 text-center">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] flex items-center justify-center">
                      <CalendarDays className="w-6 h-6 text-[var(--cc-secondary)]" strokeWidth={2.2} />
                    </div>
                    <div className="mt-4 text-[14px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                      Nenhuma consulta finalizada ainda hoje
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                      Quando você registrar como concluída, faltou ou cancelada, ela aparece aqui para acompanhar o dia.
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocation("/agenda")}
                      className="mt-5 w-full cc-btn-outline py-3 rounded-2xl text-[12px] font-800"
                    >
                      Ir para a agenda
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4 md:space-y-6">
            <div className="cc-card rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute -top-20 -right-16 w-64 h-64 bg-[#BE123C]/10 rounded-full blur-3xl" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg md:text-xl font-900 tracking-tight text-[var(--cc-text-primary)] font-['Syne']">
                      Cancelados (7 dias) sem reagendamento
                    </h3>
                    <p className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600 leading-relaxed">
                      Pacientes que cancelaram e ainda não marcaram novamente — oportunidade direta de recuperação.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-[11px] font-900 uppercase tracking-[0.18em] text-[#BE123C] bg-[#FFF1F2] px-3 py-1.5 rounded-full border border-[#BE123C]/15 font-['Space_Grotesk'] shrink-0">
                    {cancellationsLost7d.length.toLocaleString("pt-BR")}
                  </span>
                </div>

                {overview.loading && !overview.data ? (
                  <div className="mt-6 space-y-3">
                    <Skeleton className="h-12 w-full rounded-2xl" />
                    <Skeleton className="h-12 w-full rounded-2xl" />
                    <Skeleton className="h-12 w-full rounded-2xl" />
                  </div>
                ) : cancellationsLost7d.length ? (
                  <div className="mt-6 space-y-3">
                    {cancellationsLost7d.map((appt) => {
                      const dateLabel = (() => {
                        try {
                          return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(
                            new Date(appt.startsAt)
                          );
                        } catch {
                          return "";
                        }
                      })();

                      const timeLabel = (() => {
                        try {
                          return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
                            new Date(appt.startsAt)
                          );
                        } catch {
                          return "";
                        }
                      })();

                      const name = appt.patientName || "Paciente";

                      return (
                        <div
                          key={appt.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] hover:bg-[var(--cc-bg-subtle)] transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-[#FFF1F2] border border-[#BE123C]/10 flex items-center justify-center text-[10px] font-900 text-[#BE123C] font-['Space_Grotesk'] shrink-0">
                              {initialsFromName(name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk'] truncate">
                                {name}
                              </div>
                              <div className="mt-1 text-[11px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700 uppercase tracking-[0.16em] truncate">
                                {dateLabel ? `${dateLabel} • ` : ""}
                                {timeLabel || "—"}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] font-900 uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-[#FFF1F2] text-[#BE123C] border border-[#BE123C]/15 font-['Space_Grotesk'] shrink-0">
                            Cancelou
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-6 p-4 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)]">
                    <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                      Nenhuma perda para recuperar
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600 leading-relaxed">
                      Nos últimos 7 dias, não encontramos cancelamentos sem reagendamento.
                    </div>
                  </div>
                )}

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setLocation("/agenda")}
                    className="cc-btn-outline w-full py-3 rounded-2xl text-[12px] font-800"
                  >
                    Ver agenda
                  </button>
                </div>
              </div>
            </div>

            <div className="cc-card rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute -top-20 -right-16 w-64 h-64 bg-[#0566D9]/10 rounded-full blur-3xl" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg md:text-xl font-900 tracking-tight text-[var(--cc-text-primary)] font-['Syne']">
                      Confirmações pendentes de amanhã
                    </h3>
                    <p className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600 leading-relaxed">
                      Pacientes ainda sem confirmação — ligue ou envie mensagem agora para reduzir no-show.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-[11px] font-900 uppercase tracking-[0.18em] text-[#0566D9] bg-[#EEF4FF] px-3 py-1.5 rounded-full border border-[#0566D9]/15 font-['Space_Grotesk'] shrink-0">
                    {pendingConfirmationsTomorrow.length.toLocaleString("pt-BR")}
                  </span>
                </div>

                {overview.loading && !overview.data ? (
                  <div className="mt-6 space-y-3">
                    <Skeleton className="h-12 w-full rounded-2xl" />
                    <Skeleton className="h-12 w-full rounded-2xl" />
                    <Skeleton className="h-12 w-full rounded-2xl" />
                  </div>
                ) : pendingConfirmationsTomorrow.length ? (
                  <div className="mt-6 space-y-3">
                    {pendingConfirmationsTomorrow.map((appt) => {
                      const timeLabel = (() => {
                        try {
                          return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
                            new Date(appt.startsAt)
                          );
                        } catch {
                          return "";
                        }
                      })();

                      const name = appt.patientName || "Paciente";

                      return (
                        <div
                          key={appt.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] hover:bg-[var(--cc-bg-subtle)] transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] border border-[#0566D9]/10 flex items-center justify-center text-[10px] font-900 text-[#0566D9] font-['Space_Grotesk'] shrink-0">
                              {initialsFromName(name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk'] truncate">
                                {name}
                              </div>
                              <div className="mt-1 text-[11px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700 uppercase tracking-[0.16em] truncate">
                                {timeLabel || "—"}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] font-900 uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-[#EEF4FF] text-[#0566D9] border border-[#0566D9]/15 font-['Space_Grotesk'] shrink-0">
                            Pendente
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-6 p-4 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)]">
                    <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                      Tudo confirmado
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600 leading-relaxed">
                      Não há consultas pendentes de confirmação para amanhã.
                    </div>
                  </div>
                )}

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setLocation("/agenda")}
                    className="cc-btn-outline w-full py-3 rounded-2xl text-[12px] font-800"
                  >
                    Ver agenda
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          <div className="lg:col-span-4 cc-card rounded-3xl p-6 md:p-8 relative overflow-hidden">
            <div className="absolute -top-24 -right-20 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <h3 className="text-lg md:text-xl font-900 tracking-tight text-[var(--cc-text-primary)] font-['Syne']">
                Ocupação da agenda
              </h3>
              <p className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                Horários livres hoje e nesta semana.
              </p>

              {overview.loading && !overview.data ? (
                <div className="mt-7 space-y-4">
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <Skeleton className="h-16 w-full rounded-2xl" />
                </div>
              ) : (
                <div className="mt-7 space-y-5">
                  {[
                    {
                      label: "Hoje",
                      total: overview.data?.operations.today.total ?? 0,
                      booked: overview.data?.operations.today.booked ?? 0,
                      free: overview.data?.operations.today.free ?? 0,
                    },
                    {
                      label: "Semana",
                      total: overview.data?.operations.week.total ?? 0,
                      booked: overview.data?.operations.week.booked ?? 0,
                      free: overview.data?.operations.week.free ?? 0,
                    },
                  ].map((row) => {
                    const pct = row.total ? Math.min(100, Math.round((row.booked / row.total) * 100)) : 0;
                    return (
                      <div key={row.label} className="p-4 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)]">
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                              {row.label}
                            </div>
                            <div className="mt-1 text-3xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne']">
                              {row.free.toLocaleString("pt-BR")}
                            </div>
                            <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700">
                              {row.booked.toLocaleString("pt-BR")} agendadas • {row.total.toLocaleString("pt-BR")} total
                            </div>
                          </div>
                          <span className="text-[11px] font-900 uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-[#E8F5ED] text-[#118C5F] border border-[#118C5F]/15 font-['Space_Grotesk']">
                            {pct}% ocupado
                          </span>
                        </div>
                        <div className="mt-4 h-1.5 w-full bg-[var(--cc-bg-subtle)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--cc-tertiary)] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setLocation("/agenda")}
                  className="cc-btn-primary w-full px-4 py-3 rounded-2xl text-[12px] font-800"
                >
                  Abrir agenda
                </button>
                <button
                  type="button"
                  onClick={() => setLocation("/onboarding/4")}
                  className="cc-btn-outline w-full py-3 rounded-2xl text-[12px] font-800"
                >
                  Editar horários
                </button>
              </div>

              <div className="mt-4 text-[11px] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk'] font-700 uppercase tracking-[0.18em]">
                Slot padrão: {overview.data?.operations.slotMinutes ?? 30} min
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 cc-card rounded-3xl p-6 md:p-8 relative overflow-hidden">
            <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-[#025940]/5 rounded-full blur-3xl" />
            <div className="relative z-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg md:text-xl font-900 tracking-tight text-[var(--cc-text-primary)] font-['Syne']">
                    Consultas da semana
                  </h3>
                  <p className="mt-2 text-[13px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-600">
                    Distribuição de consultas agendadas na semana
                  </p>
                </div>
                <span className="hidden sm:inline-flex items-center gap-2 text-[11px] font-900 uppercase tracking-[0.18em] text-[#118C5F] bg-[#E8F5ED] px-3 py-2 rounded-full border border-[#118C5F]/15 font-['Space_Grotesk']">
                  {(() => {
                    const totalBooked = overview.data?.operations.week.booked ?? 0;
                    if (totalBooked <= 0) return "Nenhuma consulta";
                    return `${totalBooked.toLocaleString("pt-BR")} consulta${totalBooked === 1 ? "" : "s"}`;
                  })()}
                </span>
              </div>

              {overview.loading && !overview.data ? (
                <div className="mt-8 space-y-4">
                  <Skeleton className="h-10 w-full rounded-2xl" />
                  <Skeleton className="h-10 w-full rounded-2xl" />
                  <Skeleton className="h-10 w-full rounded-2xl" />
                </div>
              ) : (
                <div className="mt-8 space-y-4">
                  {weekOps.map((d) => {
                    const pct =
                      maxWeekBooked > 0 ? Math.min(100, Math.round((d.booked / maxWeekBooked) * 100)) : 0;
                    return (
                      <div key={d.date} className="flex items-center gap-4">
                        <div className="w-12 text-[10px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
                          {d.label}
                        </div>
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-[var(--cc-bg-subtle)] overflow-hidden">
                            <div className="h-full bg-[var(--cc-secondary)] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="mt-2 text-[11px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700">
                            {d.booked > 0
                              ? `${d.booked.toLocaleString("pt-BR")} consulta${d.booked === 1 ? "" : "s"}`
                              : "Nenhuma consulta"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setLocation("/agenda")}
                  className="cc-btn-primary w-full px-4 py-3 rounded-2xl text-[12px] font-800"
                >
                  Ver agenda
                </button>
                <button
                  type="button"
                  onClick={() => setLocation("/pacientes")}
                  className="cc-btn-outline w-full py-3 rounded-2xl text-[12px] font-800"
                >
                  Acessar pacientes
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
