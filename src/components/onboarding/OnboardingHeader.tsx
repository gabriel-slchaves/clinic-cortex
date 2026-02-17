import { HelpCircle, LogOut } from "lucide-react";

export default function OnboardingHeader({
  step,
  totalSteps = 7,
  progress,
  planPill,
  onHelp,
  onExit,
}: {
  step: number;
  totalSteps?: number;
  progress: number;
  planPill?: string;
  onHelp?: () => void;
  onExit: () => void;
}) {
  const pct = Math.min(100, Math.max(0, Number(progress) || 0));

  return (
    <div className="fixed top-0 inset-x-0 z-30 pointer-events-none">
      <div className="px-4 sm:px-5 md:px-12 pt-4 md:pt-6">
        <div className="grid grid-cols-3 items-start gap-3">
          <div className="justify-self-start pointer-events-auto">
            <button
              type="button"
              onClick={onHelp}
              className="inline-flex items-center gap-2 text-white/80 font-800 text-xs md:text-sm hover:text-white transition-colors font-['Space_Grotesk'] bg-[#062B1D]/70 backdrop-blur-xl border border-white/10 px-3.5 py-2 rounded-2xl shadow-[0_16px_40px_-24px_rgba(0,0,0,0.8)]"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Precisa de ajuda?</span>
            </button>
          </div>

          <div className="justify-self-center pointer-events-auto w-full max-w-[320px] sm:max-w-[390px] md:max-w-[520px]">
            <div className="rounded-[1.35rem] bg-[#062B1D]/70 backdrop-blur-xl border border-white/10 px-4 py-3 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.85)]">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-white/70 font-800 text-[10px] md:text-xs tracking-[0.2em] uppercase font-['Space_Grotesk']">
                  Passo {step} de {totalSteps}
                </span>
                {planPill ? (
                  <span className="hidden md:inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-800 tracking-[0.18em] uppercase text-white/70 font-['Space_Grotesk']">
                    {planPill}
                  </span>
                ) : null}
              </div>

              <div className="relative h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#23D996] to-[#5AFEB7] shadow-[0_0_12px_rgba(35,217,150,0.35)] transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
                <div className="absolute inset-0 rounded-full ring-1 ring-white/10" aria-hidden />
              </div>
            </div>
          </div>

          <div className="justify-self-end pointer-events-auto">
            <button
              type="button"
              onClick={onExit}
              className="flex items-center gap-2 text-[#062B1D] font-800 text-xs md:text-sm bg-white px-4 md:px-5 py-2.5 rounded-2xl hover:bg-white/92 transition-all active:scale-95 font-['Space_Grotesk'] shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
