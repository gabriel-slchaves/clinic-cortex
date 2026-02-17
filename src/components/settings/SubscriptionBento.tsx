import cliniccortexLogoImg from "@/assets/cliniccortex-logo-img.png";
import { ArrowRight, MapPin, Phone } from "lucide-react";

const INPUT_GLASS =
  "w-full px-4 py-3 rounded-2xl cc-glass-solid text-[var(--cc-theme-fg)] placeholder:text-[var(--cc-theme-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--cc-theme-accent)] transition-all font-['Space_Grotesk'] text-[14px]";

export default function SubscriptionBento({
  clinicName,
  onClinicNameChange,
  loading,
  saving,
  planName,
  subscriptionStatus,
  subscriptionSummary,
  monthlyPatientsValue,
  monthlyPatientsMeta,
  monthlyPatientsProgress,
  monthlyPatientsUnlimited,
  storageValue,
  storageMeta,
  onManagePlan,
  canManagePlan,
  managePlanHint,
}: {
  clinicName: string;
  onClinicNameChange: (next: string) => void;
  loading: boolean;
  saving: boolean;
  planName: string;
  subscriptionStatus: string;
  subscriptionSummary: string;
  monthlyPatientsValue: string;
  monthlyPatientsMeta: string;
  monthlyPatientsProgress: number | null;
  monthlyPatientsUnlimited?: boolean;
  storageValue: string;
  storageMeta: string;
  onManagePlan: () => void;
  canManagePlan: boolean;
  managePlanHint?: string;
}) {
  const patientsProgress = monthlyPatientsUnlimited ? 100 : Math.max(0, Math.min(100, monthlyPatientsProgress ?? 0));
  const showPatientsTick = !monthlyPatientsUnlimited && patientsProgress > 0;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="cc-glass-card rounded-3xl p-7 md:p-8 lg:col-span-2 flex flex-col justify-between overflow-hidden relative group text-[var(--cc-theme-fg)]">
        <div className="absolute -right-10 -top-10 w-60 h-60 bg-[var(--cc-theme-accent-soft)] rounded-full blur-3xl group-hover:opacity-80 transition-opacity" />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-900 uppercase tracking-[0.28em] font-['Space_Grotesk'] text-[var(--cc-theme-accent)] opacity-80">
                Assinatura atual
              </p>
              <h2 className="mt-3 text-3xl md:text-4xl font-900 font-['Syne'] tracking-tight">
                {planName || "Plano"}
              </h2>
              {subscriptionSummary ? (
                <p className="mt-3 text-sm text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                  {subscriptionSummary}
                </p>
              ) : null}
            </div>
            {subscriptionStatus ? (
              <span className="shrink-0 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-accent)] text-[var(--cc-theme-accent)] text-[11px] font-900 uppercase tracking-[0.14em] font-['Space_Grotesk']">
                {subscriptionStatus}
              </span>
            ) : null}
          </div>

          <div className="mt-8 space-y-5">
            <div>
              <div className="text-[12px] font-700 font-['Space_Grotesk'] text-[var(--cc-theme-muted)]">
                Limite de pacientes
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div
                  className="flex-1 h-2.5 rounded-full border border-[color:var(--cc-theme-card-border)] overflow-hidden"
                  style={{ background: "var(--cc-theme-card-border)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${patientsProgress}%`,
                      minWidth: showPatientsTick ? "0.625rem" : "0px",
                      background: monthlyPatientsUnlimited
                        ? "linear-gradient(90deg, var(--cc-theme-accent) 0%, var(--cc-theme-accent-soft) 100%)"
                        : "var(--cc-theme-accent)",
                    }}
                  />
                </div>
                <span className="min-w-[56px] text-right text-[13px] font-900 font-['Space_Grotesk'] text-[var(--cc-theme-accent)]">
                  {monthlyPatientsValue}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                {monthlyPatientsMeta}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-[12px] font-700 font-['Space_Grotesk'] text-[var(--cc-theme-muted)]">
                <span>Armazenamento</span>
                <span className="text-[var(--cc-theme-accent)] font-900">{storageValue}</span>
              </div>
              <p className="mt-2 text-[11px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
                {storageMeta}
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            className="cc-glass-solid px-5 py-3 rounded-2xl text-sm font-900 font-['Syne'] text-[var(--cc-theme-fg)] hover:brightness-110 transition-all"
          >
            Gerenciar cobrança
          </button>
          <button
            type="button"
            onClick={onManagePlan}
            title={!canManagePlan ? managePlanHint : "Gerenciar plano"}
            className="px-4 py-3 rounded-2xl text-sm font-900 font-['Syne'] text-[var(--cc-theme-accent)] hover:bg-[var(--cc-theme-accent-soft)] transition-colors inline-flex items-center gap-2"
          >
            Gerenciar plano <ArrowRight className="size-4" strokeWidth={2.4} />
          </button>
        </div>

        {!canManagePlan && managePlanHint ? (
          <p className="relative z-10 mt-3 text-[11px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
            {managePlanHint}
          </p>
        ) : null}
      </div>

      <div className="cc-glass-card rounded-3xl p-7 md:p-8 text-[var(--cc-theme-fg)] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -right-16 -bottom-16 w-72 h-72 bg-[var(--cc-theme-accent-soft)] rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center overflow-hidden">
              <img
                src={cliniccortexLogoImg}
                alt="ClinicCortex"
                className="w-10 h-10 object-contain"
                loading="eager"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-900 font-['Syne'] truncate">{clinicName || "Cortex Health Center"}</p>
              <p className="mt-1 text-[12px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-700 truncate">
                CNPJ: 12.345.678/0001-90
              </p>
            </div>
          </div>

          <div className="mt-7 space-y-3 text-[13px] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] font-600">
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)]">
                <MapPin className="size-4" strokeWidth={2.4} />
              </span>
              <span className="truncate">Avenida Paulista, 1000 — SP</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-2xl bg-[var(--cc-theme-accent-soft)] border border-[color:var(--cc-theme-card-border)] flex items-center justify-center text-[var(--cc-theme-accent)]">
                <Phone className="size-4" strokeWidth={2.4} />
              </span>
              <span className="truncate">+55 (11) 99876-5432</span>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <label className="block text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-theme-muted)] font-['Space_Grotesk'] px-1 mb-2">
              Nome da clínica
            </label>
            <input
              value={clinicName}
              onChange={(e) => onClinicNameChange(e.target.value)}
              placeholder="Nome da clínica"
              className={INPUT_GLASS}
              disabled={loading || saving}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
