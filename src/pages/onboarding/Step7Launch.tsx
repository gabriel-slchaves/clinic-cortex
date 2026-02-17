import { navigateToAppPath } from "@/lib/appOrigin";
import { useAuth } from "@/contexts/AuthContext";
import { useClinicWhatsAppConnection } from "@/hooks/useClinicWhatsAppConnection";
import { supabase } from "@/lib/supabase";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  QrCode,
  RefreshCcw,
  Rocket,
} from "lucide-react";
import { useMemo, useState } from "react";

export default function Step7Launch({
  clinicId,
  persistedStep,
  onBack,
  onDone,
}: {
  clinicId: string;
  persistedStep?: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const { signOut: signOutSession } = useAuth();
  const whatsAppConnection = useClinicWhatsAppConnection(clinicId);
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [takeoffOpen, setTakeoffOpen] = useState(false);

  const step = 7;
  const progress = 100;

  const title = "Conecte seu WhatsApp";
  const subtitle =
    "No próximo passo, você vai escanear um QR Code para conectar o número da clínica e ativar a secretária de IA.";

  const canFinish = useMemo(() => Boolean(clinicId), [clinicId]);
  const connection = whatsAppConnection.connection;
  const connectionStatus = connection?.status || "idle";
  const qrCode = whatsAppConnection.qrCode;
  const qrLoading = whatsAppConnection.loading;
  const qrError = whatsAppConnection.error;
  const isStartingConnection = whatsAppConnection.isStarting;
  const pollingActive = whatsAppConnection.pollingActive;
  const isConnected = connectionStatus === "connected";
  const isPairingBlocked = Boolean(
    connection?.pairingBlocked &&
      (!connection?.cooldownUntil ||
        (Number.isFinite(Date.parse(String(connection.cooldownUntil))) &&
          Date.parse(String(connection.cooldownUntil)) > Date.now()))
  );
  const actionLabel = !connection
    ? "Gerar QR Code"
    : isPairingBlocked
      ? "Aguardando liberação"
      : connection.manualActionRequired
      ? "Gerar novo QR Code"
      : connectionStatus === "connected"
        ? "Reconectar"
        : connectionStatus === "qr_pending"
          ? "Atualizar QR Code"
          : connection?.isRecovering || connectionStatus === "creating"
            ? "Forçar nova tentativa"
            : "Gerar QR Code";

  const statusMeta = useMemo(() => {
    if (connectionStatus === "connected") {
      return {
        badgeLabel: "Conectado",
        badgeClass:
          "text-[#118C5F] bg-[#E8F5ED] border border-[#118C5F]/15",
        statusLabel: "Conectado",
        statusClass:
          "text-[#118C5F] bg-[#E8F5ED] border border-[#118C5F]/15",
        title: "WhatsApp conectado com sucesso",
        description:
          "A clínica já está autenticada. Se você quiser renovar a sessão, pode gerar um novo QR Code.",
      };
    }

    if (isPairingBlocked) {
      return {
        badgeLabel: "Em pausa",
        badgeClass:
          "text-[#9A6B00] bg-[#FFF7DB] border border-[#E9B949]/30",
        statusLabel: "Em pausa",
        statusClass:
          "text-[#9A6B00] bg-[#FFF7DB] border border-[#E9B949]/30",
        title: "Novo pareamento pausado temporariamente",
        description: connection?.cooldownUntil
          ? `O WhatsApp bloqueou temporariamente novas conexões. Aguarde até ${new Date(
              connection.cooldownUntil
            ).toLocaleString("pt-BR")} antes de gerar outro QR Code.`
          : "O WhatsApp bloqueou temporariamente novas conexões. Aguarde um pouco antes de tentar novamente.",
      };
    }

    if (connectionStatus === "qr_pending") {
      return {
        badgeLabel: connection?.manualActionRequired ? "Novo QR necessário" : "QR disponível",
        badgeClass:
          "text-[#9A6B00] bg-[#FFF7DB] border border-[#E9B949]/30",
        statusLabel: connection?.manualActionRequired ? "Novo QR necessário" : "QR disponível",
        statusClass:
          "text-[#9A6B00] bg-[#FFF7DB] border border-[#E9B949]/30",
        title: "Escaneie o QR Code com o WhatsApp da clínica",
        description:
          "Abra o WhatsApp no celular da clínica, vá em Dispositivos conectados e escaneie o código exibido aqui.",
      };
    }

    if (connectionStatus === "creating") {
      return {
        badgeLabel: connection?.isRecovering ? "Reconectando" : "Conectando",
        badgeClass:
          "text-[#8A5A00] bg-[#FFF4DB] border border-[#E4B04A]/30",
        statusLabel: connection?.isRecovering ? "Reconectando" : "Conectando",
        statusClass:
          "text-[#8A5A00] bg-[#FFF4DB] border border-[#E4B04A]/30",
        title: connection?.isRecovering
          ? "Recuperação automática em andamento"
          : "Preparando uma nova sessão do WhatsApp",
        description:
          connection?.isRecovering
            ? "O sistema está tentando recuperar a sessão salva da clínica. Se isso não for possível, você verá o próximo QR Code aqui."
            : "Estamos iniciando a conexão e aguardando o QR Code ficar disponível.",
      };
    }

    if (connectionStatus === "error") {
      return {
        badgeLabel: connection?.manualActionRequired ? "Ação necessária" : "Sem conexão",
        badgeClass:
          "text-[#C73A3A] bg-[#FFF1F1] border border-[#F2C0C0]",
        statusLabel: connection?.manualActionRequired ? "Ação necessária" : "Sem conexão",
        statusClass:
          "text-[#C73A3A] bg-[#FFF1F1] border border-[#F2C0C0]",
        title: connection?.manualActionRequired
          ? "A sessão precisa de nova conexão"
          : "Não foi possível concluir a conexão",
        description:
          connection?.manualActionRequired
            ? "A recuperação automática foi esgotada ou a sessão foi invalidada. Gere um novo QR Code quando quiser reconectar."
            : "Você pode tentar gerar o QR Code novamente. O onboarding continua liberado mesmo sem conectar agora.",
      };
    }

    return {
      badgeLabel: "Sem conexão",
      badgeClass: "text-[#C73A3A] bg-[#FFF1F1] border border-[#F2C0C0]",
      statusLabel: "Sem conexão",
      statusClass: "text-[#C73A3A] bg-[#FFF1F1] border border-[#F2C0C0]",
      title: "Nenhuma sessão conectada",
      description:
        "Gere o QR Code quando quiser conectar o número da clínica a esta conta do ClinicCortex.",
    };
  }, [connection, connectionStatus, isPairingBlocked]);

  const handleSignOut = async () => {
    await signOutSession();
    navigateToAppPath("/login");
  };

  const startQrFlow = async () => {
    await whatsAppConnection.startConnection();
  };

  const refreshConnectionState = async () => {
    await whatsAppConnection.refreshConnection();
  };

  const finishOnboarding = async () => {
    if (!canFinish) return;
    setSaving(true);
    setFinishError(null);
    try {
      const payload: Record<string, any> = {
        onboarding_step: Math.max(Number(persistedStep || 1), 7),
        onboarding_completed_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase.from("clinics").update(payload).eq("id", clinicId);
      if (updateError) {
        if (import.meta.env.DEV) console.warn("[Onboarding] step7 save error:", updateError);
        setFinishError("Não foi possível finalizar o onboarding. Tente novamente.");
        setSaving(false);
        return;
      }

      setSaving(false);
      setTakeoffOpen(true);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step7 unexpected:", e);
      setFinishError("Não foi possível finalizar o onboarding. Tente novamente.");
      setSaving(false);
    }
  };

  const confirmTakeoff = () => {
    setTakeoffOpen(false);
    onDone();
  };

  return (
    <div className="min-h-[100dvh] bg-[#E9FDF4] text-[#002115] overflow-x-hidden">
      <OnboardingHeader step={step} totalSteps={7} progress={progress} onExit={handleSignOut} />

      <main className="pt-20 md:pt-24 pb-28 md:pb-32">
        <div className="max-w-6xl mx-auto px-5 md:px-12 py-10 md:py-14">
          <div className="mb-10 md:mb-12">
            <h1 className="text-[38px] md:text-5xl font-800 text-[#062B1D] tracking-tight font-['Syne'] leading-[1.05]">
              {title}
            </h1>
            <p className="mt-4 text-[16px] md:text-xl text-[#3F4944] font-['Space_Grotesk'] font-600 max-w-3xl leading-relaxed">
              {subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            <div className="lg:col-span-7 bg-white rounded-[2rem] p-7 md:p-10 border border-[#025940]/[0.10] shadow-[0_30px_70px_-45px_rgba(2,89,64,0.55)] relative overflow-hidden">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#23D996]/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-28 -left-28 w-80 h-80 bg-[#025940]/5 rounded-full blur-3xl" />

              <div className="relative z-10">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8F5ED] flex items-center justify-center border border-[#025940]/[0.12]">
                      <QrCode className="w-6 h-6 text-[#118C5F]" strokeWidth={2.2} />
                    </div>
                    <div>
                      <div className="text-[11px] font-900 text-[#062B1D]/35 uppercase tracking-[0.25em] font-['Space_Grotesk']">
                        Conexao WhatsApp
                      </div>
                      <div className="text-xl font-800 text-[#062B1D] font-['Syne']">QR Code</div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-2 text-[11px] font-900 uppercase tracking-[0.22em] px-3 py-2 rounded-full font-['Space_Grotesk'] ${statusMeta.badgeClass}`}
                  >
                      <span
                      className={`w-2 h-2 rounded-full ${
                        isConnected
                          ? "bg-[#23D996]"
                          : connection?.isRecovering || connectionStatus === "creating" || connectionStatus === "qr_pending"
                            ? "bg-[#E9B949] animate-pulse"
                            : "bg-[#E15B5B]"
                      }`}
                    />
                    {statusMeta.badgeLabel}
                  </span>
                </div>

                <div className="mt-7 rounded-2xl border border-dashed border-[#025940]/[0.16] bg-[#F4FBF7] p-6 md:p-8">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-white border border-[#025940]/[0.10] flex items-center justify-center shadow-sm">
                        <Link2 className="w-5 h-5 text-[#062B1D]/70" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-['Syne'] font-800 text-[#062B1D] leading-tight">Conexão via WhatsApp</div>
                        <div className="mt-1 text-[13px] text-[#3F4944]/70 font-['Space_Grotesk'] font-600 leading-relaxed">
                          Gere o QR Code da clínica, escaneie com o celular oficial e acompanhe o status real da conexão por aqui.
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={startQrFlow}
                      disabled={isStartingConnection || qrLoading || isPairingBlocked}
                      className="h-12 px-6 rounded-2xl bg-[#062B1D] text-white border border-[#062B1D] font-['Space_Grotesk'] font-900 text-[11px] uppercase tracking-[0.22em] disabled:opacity-60 disabled:cursor-not-allowed transition-colors hover:bg-[#0B3A27]"
                    >
                      {isStartingConnection ? "Processando..." : actionLabel}
                    </button>
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-[220px,1fr] gap-5 items-center">
                    <div className="w-full max-w-[220px] mx-auto aspect-square rounded-[1.75rem] bg-white border border-[#025940]/[0.12] shadow-sm overflow-hidden flex items-center justify-center">
                      {qrCode && !isPairingBlocked ? (
                        <img
                          src={qrCode}
                          alt="QR Code do WhatsApp da clínica"
                          className="w-full h-full object-contain p-3"
                        />
                      ) : qrLoading || isStartingConnection || connectionStatus === "creating" ? (
                        <div className="flex flex-col items-center justify-center text-center px-5">
                          <div className="w-10 h-10 rounded-full border-2 border-[#118C5F]/25 border-t-[#118C5F] animate-spin" />
                          <p className="mt-4 text-sm font-['Space_Grotesk'] font-700 text-[#062B1D]">
                            Aguardando geração do QR
                          </p>
                        </div>
                      ) : isConnected ? (
                        <div className="flex flex-col items-center justify-center text-center px-5">
                          <CheckCircle2 className="w-12 h-12 text-[#118C5F]" strokeWidth={2.2} />
                          <p className="mt-4 text-sm font-['Space_Grotesk'] font-700 text-[#062B1D]">
                            WhatsApp conectado
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center px-5">
                          <QrCode className="w-12 h-12 text-[#062B1D]/25" strokeWidth={1.8} />
                          <p className="mt-4 text-sm font-['Space_Grotesk'] font-700 text-[#062B1D]">
                            QR ainda não gerado
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-900 uppercase tracking-[0.18em] font-['Space_Grotesk'] ${statusMeta.statusClass}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-current opacity-80" />
                        {statusMeta.statusLabel}
                      </div>

                      <div className="mt-4 font-['Syne'] font-800 text-[#062B1D] text-2xl leading-tight">
                        {statusMeta.title}
                      </div>
                      <div className="mt-2 text-[14px] text-[#3F4944]/80 font-['Space_Grotesk'] font-600 leading-relaxed">
                        {statusMeta.description}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={refreshConnectionState}
                          disabled={qrLoading}
                          className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl bg-white border border-[#025940]/[0.12] text-[#062B1D] font-['Space_Grotesk'] font-900 text-[11px] uppercase tracking-[0.2em] disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#F9FCFA] transition-colors"
                        >
                          <RefreshCcw className="w-4 h-4" strokeWidth={2.2} />
                          Atualizar status
                        </button>

                        {pollingActive ? (
                          <span className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl bg-[#FFF7DB] border border-[#E9B949]/30 text-[#8A5A00] font-['Space_Grotesk'] font-900 text-[11px] uppercase tracking-[0.2em]">
                            <span className="w-2 h-2 rounded-full bg-[#E9B949] animate-pulse" />
                            Verificando conexão
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {qrError && (
                    <div className="mt-5 rounded-2xl border border-[#F2C0C0] bg-[#FFF1F1] px-4 py-3 text-[#A63838] text-sm font-['Space_Grotesk'] font-700 flex items-start gap-3">
                      <AlertTriangle className="w-4.5 h-4.5 mt-0.5" strokeWidth={2.2} />
                      <span>{qrError}</span>
                    </div>
                  )}
                </div>

                <div className="mt-7 flex items-start gap-3 text-[#3F4944]/70 text-sm font-['Space_Grotesk'] font-600">
                  <CheckCircle2 className="w-4.5 h-4.5 mt-0.5 text-[#118C5F]" strokeWidth={2.4} />
                  <span>
                    Você pode finalizar agora e voltar depois para conectar o WhatsApp. O status atual da conexão fica salvo para esta clínica.
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#062B1D] text-white rounded-[2rem] p-7 md:p-10 shadow-[0_30px_70px_-45px_rgba(2,89,64,0.9)] relative overflow-hidden">
                <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-[#23D996]/10 rounded-full blur-3xl" />
                <div className="relative z-10">
                  <div className="text-[11px] font-900 uppercase tracking-[0.25em] text-white/60 font-['Space_Grotesk']">
                    Antes de finalizar
                  </div>
                  <div className="mt-2 text-2xl font-800 font-['Syne'] leading-tight">Revisao rapida</div>
                  <div className="mt-5 space-y-4 text-[14px] text-white/80 font-['Space_Grotesk'] font-600">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 w-2 h-2 rounded-full bg-[#23D996]" />
                      <span>Seu prompt e suas configuracoes ja estao salvos.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 w-2 h-2 rounded-full bg-[#23D996]" />
                      <span>Os servicos e horarios ja estao configurados.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 w-2 h-2 rounded-full bg-[#23D996]" />
                      <span>Voce podera conectar o WhatsApp a qualquer momento.</span>
                    </div>
                  </div>

                  <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                    <div className="text-[10px] font-900 uppercase tracking-[0.22em] text-white/45 font-['Space_Grotesk']">
                      Status da conexão
                    </div>
                    <div
                      className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-900 uppercase tracking-[0.2em] font-['Space_Grotesk'] ${
                        isConnected
                          ? "bg-[#23D996]/15 text-[#23D996]"
                          : "bg-[#FF6B6B]/15 text-[#FFB0B0]"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-current" />
                      {isConnected ? "Conectado" : "Sem conexão"}
                    </div>
                    <div className="mt-3 text-[14px] text-white/70 font-['Space_Grotesk'] font-600 leading-relaxed">
                      {isConnected
                        ? "Seu número já está pronto para uso nas próximas etapas do sistema."
                        : isPairingBlocked
                          ? "O WhatsApp pausou temporariamente novos pareamentos. Você pode finalizar agora e tentar novamente depois, sem perder o progresso."
                        : connection?.manualActionRequired
                          ? "A sessão exigirá um novo QR quando você quiser reconectar. Você pode finalizar o onboarding agora sem perder o progresso."
                          : "Você pode finalizar o onboarding agora e conectar o WhatsApp depois, sem perder o progresso."}
                    </div>
                  </div>
                </div>
              </div>

              {finishError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-red-700 text-sm font-['Space_Grotesk'] font-600"
                >
                  {finishError}
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {takeoffOpen && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center px-5 py-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-[#062B1D]/65 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-xl bg-[#062B1D] text-white rounded-[2.5rem] p-8 md:p-10 shadow-[0_40px_120px_-70px_rgba(0,0,0,0.9)] border border-white/10 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Pronto para decolar"
            >
              <div className="absolute -right-16 -bottom-16 w-72 h-72 bg-[#23D996]/10 rounded-full blur-[90px]" />
              <div className="absolute -left-20 -top-20 w-64 h-64 bg-white/5 rounded-full blur-[80px]" />

              <div className="relative z-10">
                <p className="text-[#23D996] font-900 text-[11px] uppercase tracking-[0.25em] font-['Space_Grotesk'] mb-4">
                  Pronto para a decolagem
                </p>
                <h3 className="text-3xl md:text-4xl font-900 font-['Syne'] leading-[1.05] tracking-tight">
                  Sua inteligência clínica está a um clique de distância.
                </h3>

                <button
                  type="button"
                  onClick={confirmTakeoff}
                  className="mt-8 w-full bg-[#23D996] hover:bg-[#1fb87f] text-[#062B1D] font-900 py-5 md:py-6 rounded-2xl shadow-[0_18px_45px_rgba(35,217,150,0.28)] transition-all active:scale-[0.99] flex items-center justify-center gap-3 text-[13px] md:text-sm uppercase tracking-[0.2em] font-['Syne']"
                >
                  <span>Começar a usar a ClinicCortex</span>
                  <Rocket className="w-5 h-5" strokeWidth={2.2} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="fixed bottom-0 inset-x-0 h-24 md:h-28 bg-[#062B1D]/95 backdrop-blur-xl border-t border-white/10 flex justify-between items-center px-5 md:px-12 z-40">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-3 text-white/70 font-800 text-[11px] md:text-xs uppercase tracking-[0.2em] hover:text-white transition-all font-['Space_Grotesk']"
        >
          <span aria-hidden>←</span>
          <span>Voltar</span>
        </button>

        <button
          type="button"
          onClick={finishOnboarding}
          disabled={!canFinish || saving || takeoffOpen}
          className="bg-white text-[#062B1D] h-14 md:h-16 px-8 md:px-12 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.32)] font-['Syne'] font-800 text-xs md:text-sm uppercase tracking-[0.2em] hover:bg-white/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] flex items-center gap-4"
        >
          <span>{saving ? "Finalizando..." : "Finalizar"}</span>
          <span className="text-[#23D996]" aria-hidden>
            →
          </span>
        </button>
      </footer>
    </div>
  );
}
