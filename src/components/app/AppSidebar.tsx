import { useQueryClient } from "@tanstack/react-query";
import cliniccortexLogoImg from "@/assets/cliniccortex-logo-img.png";
import { useAuth } from "@/contexts/AuthContext";
import { prefetchCortexAIPageData } from "@/hooks/useCortexAIConfig";
import { prefetchDashboardPageData } from "@/hooks/useDashboardOverview";
import { prefetchAgendaPageData } from "@/hooks/useAppointments";
import { prefetchPatientsPageData } from "@/hooks/usePatientsDirectory";
import { prefetchServicesPageData } from "@/hooks/useServicesPageData";
import { prefetchSettingsPageData } from "@/hooks/useSettingsPageData";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bot,
  BriefcaseMedical,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link, useLocation } from "wouter";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/servicos", label: "Serviços", icon: BriefcaseMedical },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/cortexai", label: "CortexAI", icon: Bot },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function isActivePath(currentPath: string, href: string) {
  if (href === "/dashboard") return currentPath === "/" || currentPath === "/dashboard";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function AppSidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();

  const handlePrefetch = (href: string) => {
    if (!user?.id) return;

    const viewer = {
      userId: user.id,
      email: String(user.email || "").trim(),
      fullName: String((user as any)?.user_metadata?.full_name || "").trim() || null,
    };

    if (href === "/configuracoes") {
      void prefetchSettingsPageData({ queryClient, viewer });
      return;
    }
    if (href === "/pacientes") {
      void prefetchPatientsPageData({ queryClient, userId: user.id });
      return;
    }
    if (href === "/dashboard") {
      void prefetchDashboardPageData({ queryClient, userId: user.id });
      return;
    }
    if (href === "/cortexai") {
      void prefetchCortexAIPageData({ queryClient, userId: user.id });
      return;
    }
    if (href === "/agenda") {
      void prefetchAgendaPageData({ queryClient, userId: user.id });
      return;
    }
    if (href === "/servicos") {
      void prefetchServicesPageData({ queryClient, userId: user.id });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setLocation("/");
    onNavigate?.();
  };

  return (
    <aside
      className={cn(
        "bg-[var(--cc-sidebar-bg)] text-[var(--cc-sidebar-fg)] h-screen w-80 fixed left-0 top-0 flex flex-col py-12 z-50 border-r border-[color:var(--cc-sidebar-border)]",
        className
      )}
    >
      <div className="px-8 mb-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--cc-sidebar-active-bg)] border border-[color:var(--cc-sidebar-border)] flex items-center justify-center overflow-hidden">
            <img
              src={cliniccortexLogoImg}
              alt="ClinicCortex"
              className="w-7 h-7 object-contain"
              loading="eager"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-900 text-[var(--cc-sidebar-fg)] tracking-tight font-['Syne'] truncate">
              ClinicCortex
            </h1>
            <p className="text-[var(--cc-sidebar-accent)] opacity-60 text-[10px] font-800 uppercase tracking-[0.22em] font-['Space_Grotesk'] mt-1 truncate">
              Clinical Precision Framework
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(location, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => onNavigate?.()}
                  onMouseEnter={() => handlePrefetch(item.href)}
                  onFocus={() => handlePrefetch(item.href)}
                  className={cn(
                    "flex items-center gap-4 px-8 py-4 transition-colors font-['Space_Grotesk']",
                    active
                      ? "text-[var(--cc-sidebar-accent)] bg-[var(--cc-sidebar-active-bg)] font-800 border-r-4 border-[color:var(--cc-sidebar-accent)]"
                      : "text-[var(--cc-sidebar-muted)] hover:text-[var(--cc-sidebar-fg)] hover:bg-[var(--cc-sidebar-active-bg)]"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={cn("w-5 h-5", active ? "text-[var(--cc-sidebar-accent)]" : "text-current")} />
                  <span className={cn("text-[13px]", active ? "font-800" : "font-700")}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-6 pt-6 border-t border-[color:var(--cc-sidebar-border)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-700 text-[var(--cc-sidebar-muted)] truncate font-['Space_Grotesk']">
              {user?.email || ""}
            </p>
            <p className="text-[10px] font-800 uppercase tracking-[0.18em] text-[var(--cc-sidebar-muted)] opacity-60 font-['Space_Grotesk']">
              Conta
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-[var(--cc-sidebar-active-bg)] hover:brightness-110 border border-[color:var(--cc-sidebar-border)] transition-all"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="w-5 h-5 text-[var(--cc-sidebar-fg)] opacity-90" />
          </button>
        </div>
      </div>
    </aside>
  );
}
