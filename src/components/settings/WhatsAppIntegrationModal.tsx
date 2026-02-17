import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { WhatsAppConnectionResponse } from "@/lib/whatsappApi";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Link2, QrCode, RefreshCcw, ShieldAlert, X } from "lucide-react";

function getStatusPresentation(connection: WhatsAppConnectionResponse | null) {
  if (!connection) {
    return {
      badge: "Sem conexão",
      badgeClass: "text-[#C73A3A] bg-[#FFF1F1] border border-[#F2C0C0]",
      title: "Nenhuma sessão conectada",
      description: "Gere um QR Code quando quiser conectar o número oficial da clínica a esta conta do ClinicCortex.",
    };
  }

  if (connection.pairingBlocked) {
    return {
      badge: "Em pausa",
      badgeClass: "text-[#9A6B00] bg-[#FFF7DB] border border-[#E9B949]/30",
      title: "Novo pareamento pausado temporariamente",
      description: connection.cooldownUntil
        ? `O WhatsApp bloqueou temporariamente novas conexões. Aguarde até ${new Date(
            connection.cooldownUntil
          ).toLocaleString("pt-BR")} antes de tentar gerar outro QR Code.`
        : "O WhatsApp bloqueou temporariamente novas conexões. Aguarde um pouco antes de tentar gerar outro QR Code.",
    };
  }

  if (connection.status === "connected") {
    return {
      badge: "Conectado",
      badgeClass: "text-[#118C5F] bg-[#E8F5ED] border border-[#118C5F]/15",
      title: "WhatsApp conectado com sucesso",
      description: "A clínica está autenticada. Se for necessário renovar a sessão, o administrador pode iniciar uma nova conexão.",
    };
  }

  if (connection.status === "qr_pending") {
    return {
      badge: "QR disponível",
      badgeClass: "text-[#9A6B00] bg-[#FFF7DB] border border-[#E9B949]/30",
      title: "Escaneie o QR Code com o WhatsApp da clínica",
      description: "Abra o WhatsApp no celular oficial da clínica, vá em Dispositivos conectados e escaneie o código exibido aqui.",
    };
  }

  if (connection.isRecovering || connection.status === "creating") {
    return {
      badge: "Reconectando",
      badgeClass: "text-[#8A5A00] bg-[#FFF4DB] border border-[#E4B04A]/30",
      title: "Recuperação automática em andamento",
      description: "O sistema está tentando reabrir a sessão salva do WhatsApp. Em cenários normais, nenhuma ação manual será necessária.",
    };
  }

  if (connection.manualActionRequired) {
    return {
      badge: "Ação necessária",
      badgeClass: "text-[#C73A3A] bg-[#FFF1F1] border border-[#F2C0C0]",
      title: "A sessão precisa de nova conexão",
      description: "A recuperação automática foi esgotada ou a sessão foi invalidada. Um administrador precisa gerar um novo QR Code.",
    };
  }

  return {
    badge: "Sem conexão",
    badgeClass: "text-[#C73A3A] bg-[#FFF1F1] border border-[#F2C0C0]",
    title: "WhatsApp indisponível",
    description: "Revise o estado da integração e tente novamente.",
  };
}

function getActionLabel(connection: WhatsAppConnectionResponse | null) {
  if (!connection) return "Gerar QR Code";
  if (connection.pairingBlocked) return "Aguardando liberação";
  if (connection.status === "connected") return "Reconectar";
  if (connection.status === "qr_pending") return "Atualizar QR Code";
  if (connection.manualActionRequired) return "Gerar novo QR Code";
  if (connection.isRecovering || connection.status === "creating") return "Forçar nova tentativa";
  return "Gerar QR Code";
}

export default function WhatsAppIntegrationModal({
  open,
  onOpenChange,
  clinicName,
  canManage,
  connection,
  qrCode,
  loading,
  isStarting,
  pollingActive,
  error,
  onRefresh,
  onStartConnection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicName: string;
  canManage: boolean;
  connection: WhatsAppConnectionResponse | null;
  qrCode: string | null;
  loading: boolean;
  isStarting: boolean;
  pollingActive: boolean;
  error: string | null;
  onRefresh: () => Promise<unknown>;
  onStartConnection: () => Promise<unknown>;
}) {
  const status = getStatusPresentation(connection);
  const actionLabel = getActionLabel(connection);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(96vw,1240px)] max-w-[calc(100%-1rem)] sm:max-w-[1240px] max-h-[calc(100vh-2rem)] rounded-[2rem] border border-[#025940]/10 bg-[#F5FFF9] p-0 overflow-hidden shadow-[0_30px_90px_rgba(2,89,64,0.18)]"
        overlayClassName="bg-[#062B1D]/55 backdrop-blur-[6px]"
      >
        <div className="relative max-h-[calc(100vh-2rem)] overflow-hidden">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#23D996]/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-[#025940]/8 blur-3xl" />

          <div className="relative max-h-[calc(100vh-2rem)] overflow-y-auto px-5 py-6 md:px-8 md:py-8 xl:px-10 xl:py-9">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-900 uppercase tracking-[0.24em] text-[#118C5F] font-['Space_Grotesk']">
                  Integracao WhatsApp
                </div>
                <h3 className="mt-2 text-3xl md:text-4xl font-['Syne'] font-800 text-[#003F2D] tracking-tight">
                  Conexão da clínica
                </h3>
                <p className="mt-3 max-w-3xl text-[15px] md:text-[16px] leading-relaxed text-[#3F4944] font-['Space_Grotesk'] font-600">
                  {clinicName || "Clínica"} acompanha por aqui o status real da integração, o QR Code atual e qualquer necessidade de intervenção humana.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#025940]/10 bg-white text-[#003F2D] hover:bg-[#E8F5ED] transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 xl:grid-cols-12 gap-6 xl:items-start">
              <div className="xl:col-span-7 rounded-[2rem] border border-[#025940]/10 bg-white p-5 md:p-6 xl:p-7 shadow-[0_20px_60px_-40px_rgba(2,89,64,0.35)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#025940]/10 bg-[#E8F5ED]">
                      <QrCode className="h-6 w-6 text-[#118C5F]" strokeWidth={2.2} />
                    </div>
                    <div>
                      <div className="text-[11px] font-900 uppercase tracking-[0.22em] text-[#7AA88D] font-['Space_Grotesk']">
                        QR Code
                      </div>
                      <div className="text-xl font-800 text-[#062B1D] font-['Syne']">WhatsApp Business</div>
                    </div>
                  </div>

                  <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-900 uppercase tracking-[0.2em] font-['Space_Grotesk']", status.badgeClass)}>
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        connection?.status === "connected"
                          ? "bg-[#23D996]"
                          : connection?.isRecovering || connection?.status === "creating" || connection?.status === "qr_pending"
                            ? "bg-[#E9B949] animate-pulse"
                            : "bg-[#E15B5B]"
                      )}
                    />
                    {status.badge}
                  </span>
                </div>

                <div className="mt-6 rounded-[1.75rem] border border-dashed border-[#025940]/12 bg-[#F7FFFA] p-5 md:p-6 min-h-[320px] md:min-h-[360px] flex items-center justify-center">
                  {loading && !qrCode ? (
                    <div className="text-center">
                      <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#23D996] border-t-transparent animate-spin" />
                      <p className="mt-4 text-sm font-700 text-[#3F4944] font-['Space_Grotesk']">Atualizando status da integração...</p>
                    </div>
                  ) : qrCode && !connection?.pairingBlocked ? (
                    <img src={qrCode} alt="QR Code do WhatsApp da clínica" className="max-w-[280px] rounded-[1.5rem] border border-[#025940]/10 bg-white p-3 shadow-sm" />
                  ) : connection?.status === "connected" ? (
                    <div className="text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-[#118C5F]/10 bg-[#E8F5ED] text-[#118C5F]">
                        <CheckCircle2 className="h-8 w-8" strokeWidth={2.2} />
                      </div>
                      <p className="mt-4 text-lg font-800 text-[#062B1D] font-['Syne']">WhatsApp conectado</p>
                      <p className="mt-2 text-sm text-[#3F4944] font-['Space_Grotesk'] font-600">
                        {connection.phoneNumber ? `Número conectado: ${connection.phoneNumber}` : "A sessão está autenticada e pronta para responder."}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center max-w-sm">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-[#C73A3A]/10 bg-[#FFF1F1] text-[#C73A3A]">
                        <ShieldAlert className="h-8 w-8" strokeWidth={2.2} />
                      </div>
                      <p className="mt-4 text-lg font-800 text-[#062B1D] font-['Syne']">Sem QR disponível no momento</p>
                      <p className="mt-2 text-sm text-[#3F4944] font-['Space_Grotesk'] font-600">
                        {connection?.pairingBlocked && connection.cooldownUntil
                          ? `O WhatsApp pausou novas conexões temporariamente. Aguarde até ${new Date(
                              connection.cooldownUntil
                            ).toLocaleString("pt-BR")} para gerar outro QR.`
                          : connection?.pairingBlocked
                            ? "O WhatsApp pausou novas conexões temporariamente. Aguarde um pouco antes de gerar outro QR."
                            : "Gere uma nova tentativa de conexão para disponibilizar o QR Code ou aguarde a recuperação automática terminar."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="xl:col-span-5 space-y-5">
                <div className="rounded-[2rem] border border-[#025940]/10 bg-white p-5 md:p-6 shadow-[0_20px_60px_-40px_rgba(2,89,64,0.35)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#025940]/10 bg-[#E8F5ED] text-[#118C5F]">
                      <Link2 className="h-5 w-5" strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-800 text-[#062B1D] font-['Syne']">{status.title}</p>
                      <p className="mt-2 text-[13px] text-[#3F4944] font-['Space_Grotesk'] font-600 leading-relaxed">{status.description}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3 rounded-[1.5rem] border border-[#025940]/10 bg-[#F7FFFA] p-4">
                    <div>
                      <p className="text-[11px] font-900 uppercase tracking-[0.2em] text-[#7AA88D] font-['Space_Grotesk']">Último evento</p>
                      <p className="mt-1 text-[13px] font-700 text-[#062B1D] font-['Space_Grotesk']">
                        {connection?.lastEventMessage || "Nenhum evento operacional registrado ainda."}
                      </p>
                    </div>

                    {connection?.nextRetryAt ? (
                      <div>
                        <p className="text-[11px] font-900 uppercase tracking-[0.2em] text-[#7AA88D] font-['Space_Grotesk']">
                          {connection.pairingBlocked ? "Liberado após" : "Próxima tentativa"}
                        </p>
                        <p className="mt-1 text-[13px] font-700 text-[#062B1D] font-['Space_Grotesk']">{new Date(connection.nextRetryAt).toLocaleString("pt-BR")}</p>
                      </div>
                    ) : null}

                    {connection?.lastSeenAt ? (
                      <div>
                        <p className="text-[11px] font-900 uppercase tracking-[0.2em] text-[#7AA88D] font-['Space_Grotesk']">Última atividade</p>
                        <p className="mt-1 text-[13px] font-700 text-[#062B1D] font-['Space_Grotesk']">{new Date(connection.lastSeenAt).toLocaleString("pt-BR")}</p>
                      </div>
                    ) : null}
                  </div>

                  {error || connection?.lastError ? (
                    <div className="mt-5 rounded-[1.5rem] border border-[#F2C0C0] bg-[#FFF6F6] p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4.5 w-4.5 text-[#C73A3A]" strokeWidth={2.2} />
                        <div>
                          <p className="text-[13px] font-800 text-[#7A1F1F] font-['Syne']">Último erro amigável</p>
                          <p className="mt-1 text-[12px] leading-relaxed text-[#7A1F1F]/85 font-['Space_Grotesk'] font-600">
                            {error || connection?.lastError}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {!canManage ? (
                    <div className="mt-5 rounded-[1.5rem] border border-[#025940]/10 bg-[#F7FFFA] p-4">
                      <p className="text-[13px] font-800 text-[#062B1D] font-['Syne']">Ação restrita</p>
                      <p className="mt-1 text-[12px] text-[#3F4944] font-['Space_Grotesk'] font-600 leading-relaxed">
                        Todos os usuários acompanham o estado do WhatsApp, mas somente o administrador da clínica pode reconectar manualmente a sessão.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[2rem] border border-[#025940]/10 bg-white p-5 md:p-6 shadow-[0_20px_60px_-40px_rgba(2,89,64,0.35)]">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => void onStartConnection()}
                      disabled={!canManage || loading || isStarting || Boolean(connection?.pairingBlocked)}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#062B1D] px-5 py-4 text-[12px] font-900 uppercase tracking-[0.22em] text-white font-['Syne'] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <QrCode className="h-4 w-4" strokeWidth={2.4} />
                      {isStarting ? "Processando..." : actionLabel}
                    </button>

                    <div className="flex justify-end sm:justify-start">
                      <button
                        type="button"
                        onClick={() => void onRefresh()}
                        disabled={loading}
                        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#025940]/10 bg-[#F7FFFA] text-[#062B1D] transition-colors hover:bg-[#E8F5ED] disabled:cursor-not-allowed disabled:opacity-55"
                        aria-label="Atualizar status"
                      >
                        <RefreshCcw className={cn("h-5 w-5", loading || pollingActive ? "animate-spin" : "")} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>

                  <p className="mt-4 text-[12px] text-[#3F4944] font-['Space_Grotesk'] font-600 leading-relaxed">
                    {canManage
                      ? "Use esta área para acompanhar a recuperação automática, gerar novo QR Code quando necessário e confirmar se o número oficial da clínica está conectado."
                      : "Você pode acompanhar o status por aqui. Se houver necessidade de nova conexão, avise o administrador da clínica."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
