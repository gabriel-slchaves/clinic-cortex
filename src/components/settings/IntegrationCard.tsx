import { cn } from "@/lib/utils";

export default function IntegrationCard({
  title,
  description,
  status,
  icon,
  cta = "Configurar",
  onClick,
  disabled = false,
  footer,
  statusTone = "default",
  className,
}: {
  title: string;
  description: string;
  status: string;
  icon: React.ReactNode;
  cta?: string;
  onClick?: () => void;
  disabled?: boolean;
  footer?: React.ReactNode;
  statusTone?: "default" | "positive" | "warning" | "critical";
  className?: string;
}) {
  const statusClass =
    statusTone === "positive"
      ? "bg-[#E8F5ED] border-[#118C5F]/20 text-[#118C5F]"
      : statusTone === "warning"
        ? "bg-[#FFF7DB] border-[#E9B949]/30 text-[#9A6B00]"
        : statusTone === "critical"
          ? "bg-[#FFF1F1] border-[#F2C0C0] text-[#C73A3A]"
          : "bg-[var(--cc-theme-accent-soft)] border-[color:var(--cc-theme-accent)] text-[var(--cc-theme-accent)]";

  return (
    <div className={cn("cc-glass-card rounded-3xl p-6 text-[var(--cc-theme-fg)]", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="size-12 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center overflow-hidden">
          {icon}
        </div>
        <span className={cn("px-3 py-1 rounded-full border text-[11px] font-900 uppercase tracking-[0.14em] font-['Space_Grotesk']", statusClass)}>
          {status}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-[15px] font-900 font-['Syne']">{title}</p>
        <p className="mt-2 text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600 leading-relaxed">
          {description}
        </p>
      </div>

      {footer ? <div className="mt-4">{footer}</div> : null}

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-5 w-full rounded-2xl cc-glass-solid hover:brightness-110 transition-all py-3 text-[12px] font-900 text-[var(--cc-theme-fg)] font-['Space_Grotesk'] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {cta}
      </button>
    </div>
  );
}
