import cliniccortexLogoImg from "@/assets/cliniccortex-logo-img.png";

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] px-5 md:px-12 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] flex items-center justify-center shadow-sm overflow-hidden">
            <img src={cliniccortexLogoImg} alt="ClinicCortex" className="w-7 h-7 object-contain" loading="eager" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] font-['Space_Grotesk'] truncate">
              {title}
            </div>
            <div className="text-[24px] md:text-[28px] font-900 text-[var(--cc-text-primary)] font-['Syne'] truncate">
              Em breve
            </div>
          </div>
        </div>

        <div className="mt-8 bg-[var(--cc-bg-white)] border border-[var(--cc-border)] rounded-3xl p-7 md:p-10 shadow-[0_10px_40px_rgba(2,89,64,0.06)]">
          <p className="text-[var(--cc-text-muted)] font-['Space_Grotesk'] text-[14px] leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  return (
    <Placeholder
      title="Relatórios"
      subtitle="Aqui você vai acompanhar indicadores, performance, taxa de retorno, no-show e receita — com exportação."
    />
  );
}
