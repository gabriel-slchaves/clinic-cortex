import {
  createWhatsAppConnection,
  getWhatsAppConnectionByClinic,
  getWhatsAppConnectionQrByClinic,
  getWhatsAppConnectionStatusByClinic,
  startWhatsAppConnection,
  startWhatsAppConnectionByClinic,
  WhatsAppApiError,
  type WhatsAppConnectionResponse,
  type WhatsAppQrResponse,
} from "@/lib/whatsappApi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ClinicWhatsAppState = {
  connection: WhatsAppConnectionResponse | null;
  qrCode: string | null;
  loading: boolean;
  error: string | null;
  isStarting: boolean;
  pollingActive: boolean;
};

function getFriendlyError(error: unknown) {
  if (error instanceof WhatsAppApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Não foi possível comunicar com o serviço do WhatsApp.";
}

type ConnectionSnapshot = WhatsAppConnectionResponse | WhatsAppQrResponse;

function shouldKeepPolling(connection: WhatsAppConnectionResponse | null) {
  if (!connection) return false;
  if (connection.status === "qr_pending") return true;
  if (connection.status === "creating") return true;
  return Boolean(connection.isRecovering);
}

function isCooldownActive(connection: WhatsAppConnectionResponse | null) {
  if (connection?.pairingBlocked && !connection?.cooldownUntil) return true;
  if (!connection?.cooldownUntil) return false;
  const timestamp = Date.parse(connection.cooldownUntil);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function buildCooldownError(connection: WhatsAppConnectionResponse) {
  if (connection.lastEventMessage) return connection.lastEventMessage;
  if (connection.cooldownUntil) {
    return `O WhatsApp bloqueou temporariamente novas conexões. Tente novamente após ${new Date(
      connection.cooldownUntil
    ).toLocaleString("pt-BR")}.`;
  }
  return "O WhatsApp bloqueou temporariamente novas conexões. Aguarde antes de gerar um novo QR Code.";
}

async function getOrCreateConnectionByClinic(clinicId: string) {
  try {
    return await getWhatsAppConnectionByClinic(clinicId);
  } catch (error) {
    if (error instanceof WhatsAppApiError && error.status === 404) {
      return createWhatsAppConnection(clinicId);
    }
    throw error;
  }
}

export function useClinicWhatsAppConnection(clinicId: string | null) {
  const pollingRef = useRef<number | null>(null);
  const [state, setState] = useState<ClinicWhatsAppState>({
    connection: null,
    qrCode: null,
    loading: false,
    error: null,
    isStarting: false,
    pollingActive: false,
  });

  const stopPolling = useCallback(() => {
    if (pollingRef.current != null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setState((current) => ({ ...current, pollingActive: false }));
  }, []);

  const applyConnectionState = useCallback((connection: ConnectionSnapshot | null) => {
    setState((current) => ({
      ...current,
      connection,
      qrCode: connection && "qrCode" in connection ? connection.qrCode : current.qrCode,
      error:
        connection && isCooldownActive(connection)
          ? buildCooldownError(connection)
          : connection?.status === "error"
          ? connection.lastError || "Falha ao conectar o WhatsApp."
          : current.error,
    }));
  }, []);

  const pollConnection = useCallback(async (): Promise<ConnectionSnapshot | null> => {
    if (!clinicId) return null;

    const status = await getWhatsAppConnectionStatusByClinic(clinicId);
    applyConnectionState(status);

    if (status.status === "qr_pending") {
      const qrResponse = await getWhatsAppConnectionQrByClinic(clinicId);
      applyConnectionState(qrResponse);
      setState((current) => ({
        ...current,
        qrCode: qrResponse.qrCode,
        error: qrResponse.lastError || null,
      }));
      return qrResponse;
    }

    setState((current) => ({
      ...current,
      qrCode: status.status === "connected" ? null : current.qrCode,
      error: status.lastError || null,
    }));
    return status;
  }, [applyConnectionState, clinicId]);

  const startPolling = useCallback(() => {
    stopPolling();
    setState((current) => ({ ...current, pollingActive: true }));
    void pollConnection();
    pollingRef.current = window.setInterval(() => {
      void pollConnection().catch(() => undefined);
    }, 4_000);
  }, [pollConnection, stopPolling]);

  const loadConnection = useCallback(async () => {
    if (!clinicId) return;

    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const existing = await getWhatsAppConnectionStatusByClinic(clinicId);
      setState((current) => ({
        ...current,
        connection: existing,
        qrCode: existing.status === "connected" ? null : current.qrCode,
        error: existing.lastError || null,
      }));

      if (existing.status === "qr_pending") {
        const qrResponse = await getWhatsAppConnectionQrByClinic(clinicId);
        setState((current) => ({
          ...current,
          connection: qrResponse,
          qrCode: qrResponse.qrCode,
          error: qrResponse.lastError || null,
        }));
      }

      if (shouldKeepPolling(existing)) {
        startPolling();
      } else {
        stopPolling();
      }
    } catch (error) {
      if (error instanceof WhatsAppApiError && error.status === 404) {
        stopPolling();
        setState((current) => ({
          ...current,
          connection: null,
          qrCode: null,
          error: null,
          loading: false,
        }));
        return;
      }

      stopPolling();
      setState((current) => ({
        ...current,
        connection: current.connection,
        error: getFriendlyError(error),
      }));
    } finally {
      setState((current) => ({ ...current, loading: false }));
    }
  }, [clinicId, startPolling, stopPolling]);

  useEffect(() => {
    if (!clinicId) return;
    void loadConnection();
    return () => stopPolling();
  }, [clinicId, loadConnection, stopPolling]);

  const startConnection = useCallback(async () => {
    if (!clinicId) return null;

    setState((current) => ({ ...current, isStarting: true, loading: true, error: null }));
    try {
      const currentConnection = state.connection;
      if (currentConnection && isCooldownActive(currentConnection)) {
        const cooldownError = buildCooldownError(currentConnection);
        setState((current) => ({
          ...current,
          error: cooldownError,
        }));
        return currentConnection;
      }

      let started: WhatsAppConnectionResponse;
      try {
        started = await startWhatsAppConnectionByClinic(clinicId);
      } catch (error) {
        const shouldFallback =
          error instanceof WhatsAppApiError &&
          (error.status === 404 || error.status === 405 || error.status === 501);

        if (!shouldFallback) throw error;

        const connection = await getOrCreateConnectionByClinic(clinicId);
        started = await startWhatsAppConnection(connection.connectionId);
      }
      setState((current) => ({
        ...current,
        connection: started,
        qrCode: started.status === "connected" ? null : current.qrCode,
        error: started.lastError || null,
      }));

      let latest: ConnectionSnapshot = started;
      if (started.status === "qr_pending" || shouldKeepPolling(started)) {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          latest = (await pollConnection()) || latest;
          if (
            latest.status === "connected" ||
            latest.status === "error" ||
            latest.manualActionRequired ||
            ("qrCode" in latest && latest.qrCode)
          ) {
            break;
          }

          await new Promise((resolve) => window.setTimeout(resolve, 1_500));
        }
      }

      if (shouldKeepPolling(latest)) {
        startPolling();
      } else {
        stopPolling();
      }

      return latest;
    } catch (error) {
      stopPolling();
      setState((current) => ({
        ...current,
        error: getFriendlyError(error),
      }));
      throw error;
    } finally {
      setState((current) => ({ ...current, isStarting: false, loading: false }));
    }
  }, [clinicId, pollConnection, startPolling, state.connection, stopPolling]);

  const refreshConnection = useCallback(async () => {
    if (!clinicId) return null;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const latest = await pollConnection();
      if (!latest) return null;
      if (shouldKeepPolling(latest)) {
        startPolling();
      } else {
        stopPolling();
      }
      return latest;
    } catch (error) {
      stopPolling();
      setState((current) => ({
        ...current,
        error: getFriendlyError(error),
      }));
      throw error;
    } finally {
      setState((current) => ({ ...current, loading: false }));
    }
  }, [clinicId, pollConnection, startPolling, stopPolling]);

  const derivedStatus = useMemo(() => {
    const connection = state.connection;
    if (!connection) {
      return {
        label: "Sem conexão",
        tone: "critical" as const,
      };
    }

    if (connection.status === "connected") {
      return { label: "Conectado", tone: "positive" as const };
    }
    if (isCooldownActive(connection) || connection.pairingBlocked) {
      return { label: "Em pausa", tone: "warning" as const };
    }
    if (connection.status === "qr_pending") {
      return { label: "QR disponível", tone: "warning" as const };
    }
    if (connection.isRecovering || connection.status === "creating") {
      return { label: "Reconectando", tone: "warning" as const };
    }
    if (connection.manualActionRequired) {
      return { label: "Exige ação", tone: "critical" as const };
    }
    return { label: "Sem conexão", tone: "critical" as const };
  }, [state.connection]);

  return {
    ...state,
    statusMeta: derivedStatus,
    startConnection,
    refreshConnection,
    reloadConnection: loadConnection,
    stopPolling,
  };
}
