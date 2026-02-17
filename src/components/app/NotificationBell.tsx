import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ClinicNotification } from "@/hooks/useClinicNotifications";
import { cn } from "@/lib/utils";
import { AlertTriangle, Bell, CheckCircle2, RefreshCcw, ShieldAlert } from "lucide-react";

function iconForSeverity(severity: ClinicNotification["severity"]) {
  if (severity === "critical") return ShieldAlert;
  if (severity === "warning") return AlertTriangle;
  return CheckCircle2;
}

function iconTone(severity: ClinicNotification["severity"]) {
  if (severity === "critical") return "text-[#C73A3A] bg-[#FFF1F1] border-[#F2C0C0]";
  if (severity === "warning") return "text-[#9A6B00] bg-[#FFF7DB] border-[#E9B949]/30";
  return "text-[#118C5F] bg-[#E8F5ED] border-[#118C5F]/20";
}

export default function NotificationBell({
  notifications,
  loading,
  canManage,
  onOpenSettings,
}: {
  notifications: ClinicNotification[];
  loading?: boolean;
  canManage: boolean;
  onOpenSettings: () => void;
}) {
  const activeCount = notifications.filter((item) => item.active).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] hover:bg-[var(--cc-bg-subtle)] transition-colors"
          aria-label="Abrir notificações"
        >
          <Bell className={cn("h-5 w-5", loading ? "animate-pulse" : "")} />
          {activeCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#C73A3A] px-1.5 py-0.5 text-[10px] font-900 text-white font-['Space_Grotesk']">
              {activeCount > 9 ? "9+" : activeCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[360px] rounded-3xl border-[var(--cc-border)] bg-[var(--cc-bg-white)] p-3 shadow-[0_20px_60px_rgba(2,89,64,0.16)]">
        <div className="px-2 py-2">
          <p className="text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] font-['Space_Grotesk']">
            Notificações
          </p>
          <p className="mt-2 text-[15px] font-800 text-[var(--cc-text-primary)] font-['Syne']">
            Estado operacional da clínica
          </p>
          <p className="mt-1 text-[12px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600">
            Alertas ativos e histórico curto das últimas resoluções do WhatsApp.
          </p>
        </div>

        <div className="max-h-[420px] overflow-y-auto space-y-2 px-1 py-2">
          {notifications.length ? (
            notifications.map((notification) => {
              const Icon = iconForSeverity(notification.severity);
              return (
                <div
                  key={notification.id}
                  className={cn(
                    "rounded-2xl border p-3",
                    notification.active ? "border-[var(--cc-border)] bg-[var(--cc-bg-subtle)]" : "border-[var(--cc-border)]/70 bg-transparent opacity-85"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className={cn("mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border", iconTone(notification.severity))}>
                      <Icon className="h-4.5 w-4.5" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] font-800 text-[var(--cc-text-primary)] font-['Syne'] leading-tight">
                          {notification.title}
                        </p>
                        <span className="shrink-0 text-[10px] font-900 uppercase tracking-[0.16em] text-[var(--cc-text-muted)] font-['Space_Grotesk']">
                          {notification.active ? "Ativo" : "Resolvido"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600">
                        {notification.message}
                      </p>
                      <p className="mt-2 text-[11px] text-[var(--cc-text-muted)]/80 font-['Space_Grotesk'] font-700">
                        {new Date(notification.updatedAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-[var(--cc-border)] bg-[var(--cc-bg-subtle)] px-4 py-8 text-center">
              <RefreshCcw className="mx-auto h-5 w-5 text-[var(--cc-text-muted)]/70" strokeWidth={2.2} />
              <p className="mt-3 text-[13px] font-800 text-[var(--cc-text-primary)] font-['Syne']">
                Nenhum alerta recente
              </p>
              <p className="mt-1 text-[12px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600">
                Quando houver eventos relevantes do WhatsApp, eles aparecerão aqui.
              </p>
            </div>
          )}
        </div>

        <div className="px-1 pt-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full rounded-2xl bg-[var(--cc-primary)] px-4 py-3 text-[12px] font-900 uppercase tracking-[0.18em] text-white font-['Syne'] transition-all hover:brightness-110"
          >
            {canManage ? "Abrir integração do WhatsApp" : "Ver integração do WhatsApp"}
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
