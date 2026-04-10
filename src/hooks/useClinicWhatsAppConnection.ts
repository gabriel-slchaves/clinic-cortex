import {
  completeWhatsAppEmbeddedSignup,
  createWhatsAppEmbeddedSignupSessionByClinic,
  getWhatsAppConnectionStatusByClinic,
  WhatsAppApiError,
  type WhatsAppConnectionResponse,
} from "@/lib/whatsappApi";
import {
  isMetaEmbeddedSignupCallbackPayload,
  META_EMBEDDED_SIGNUP_MESSAGE_TYPE,
  type MetaEmbeddedSignupCallbackPayload,
} from "@/lib/whatsappEmbeddedSignup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ClinicWhatsAppState = {
  connection: WhatsAppConnectionResponse | null;
  loading: boolean;
  error: string | null;
  isStarting: boolean;
  pollingActive: boolean;
};

function getFriendlyError(error: unknown) {
  if (error instanceof WhatsAppApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Não foi possível comunicar com o serviço oficial do WhatsApp.";
}

function shouldKeepPolling(connection: WhatsAppConnectionResponse | null) {
  if (!connection) return false;
  if (connection.operationalStatus === "onboarding") return true;
  return connection.verificationStatus === "pending";
}

function openPopup(url: string) {
  return window.open(
    url,
    "cliniccortex-meta-whatsapp",
    "width=540,height=720,menubar=no,toolbar=no,status=no,location=yes,resizable=yes,scrollbars=yes"
  );
}

function waitForPopupCallback(popup: Window, expectedState: string) {
  return new Promise<MetaEmbeddedSignupCallbackPayload>((resolve, reject) => {
    const startedAt = Date.now();

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(intervalId);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isMetaEmbeddedSignupCallbackPayload(event.data)) return;
      if (
        expectedState &&
        event.data.state &&
        event.data.state !== expectedState
      )
        return;

      cleanup();
      resolve(event.data);
    };

    const intervalId = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(
          new Error(
            "O onboarding oficial da Meta foi fechado antes de ser concluído."
          )
        );
        return;
      }

      if (Date.now() - startedAt > 5 * 60 * 1000) {
        cleanup();
        popup.close();
        reject(
          new Error("O onboarding oficial da Meta excedeu o tempo limite.")
        );
      }
    }, 400);

    window.addEventListener("message", onMessage);
  });
}

export function useClinicWhatsAppConnection(clinicId: string | null) {
  const pollingRef = useRef<number | null>(null);
  const [state, setState] = useState<ClinicWhatsAppState>({
    connection: null,
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
    setState(current => ({ ...current, pollingActive: false }));
  }, []);

  const applyConnectionState = useCallback(
    (connection: WhatsAppConnectionResponse | null) => {
      setState(current => ({
        ...current,
        connection,
        error:
          connection?.operationalStatus === "action_required"
            ? connection.lastError ||
              connection.lastEvent?.message ||
              current.error
            : current.error,
      }));
    },
    []
  );

  const pollConnection =
    useCallback(async (): Promise<WhatsAppConnectionResponse | null> => {
      if (!clinicId) return null;

      const status = await getWhatsAppConnectionStatusByClinic(clinicId);
      applyConnectionState(status);
      return status;
    }, [applyConnectionState, clinicId]);

  const startPolling = useCallback(() => {
    stopPolling();
    setState(current => ({ ...current, pollingActive: true }));
    void pollConnection();
    pollingRef.current = window.setInterval(() => {
      void pollConnection().catch(() => undefined);
    }, 4_000);
  }, [pollConnection, stopPolling]);

  const loadConnection = useCallback(async () => {
    if (!clinicId) return;

    setState(current => ({ ...current, loading: true, error: null }));
    try {
      const existing = await getWhatsAppConnectionStatusByClinic(clinicId);
      setState(current => ({
        ...current,
        connection: existing,
        error: existing.lastError || null,
      }));

      if (shouldKeepPolling(existing)) {
        startPolling();
      } else {
        stopPolling();
      }
    } catch (error) {
      if (error instanceof WhatsAppApiError && error.status === 404) {
        stopPolling();
        setState(current => ({
          ...current,
          connection: null,
          error: null,
          loading: false,
        }));
        return;
      }

      stopPolling();
      setState(current => ({
        ...current,
        error: getFriendlyError(error),
      }));
    } finally {
      setState(current => ({ ...current, loading: false }));
    }
  }, [clinicId, startPolling, stopPolling]);

  useEffect(() => {
    if (!clinicId) return;
    void loadConnection();
    return () => stopPolling();
  }, [clinicId, loadConnection, stopPolling]);

  const startConnection = useCallback(
    async (clinicName?: string | null) => {
      if (!clinicId) return null;

      setState(current => ({
        ...current,
        isStarting: true,
        loading: true,
        error: null,
      }));

      try {
        const session = await createWhatsAppEmbeddedSignupSessionByClinic(
          clinicId,
          clinicName ?? null
        );
        setState(current => ({
          ...current,
          connection: session.connection,
        }));

        const popup = openPopup(session.launchUrl);
        if (!popup) {
          throw new Error(
            "O navegador bloqueou a janela da Meta. Libere pop-ups e tente novamente."
          );
        }

        const callbackPayload = await waitForPopupCallback(
          popup,
          session.state
        );
        popup.close();

        if (callbackPayload.error) {
          throw new Error(
            callbackPayload.errorDescription ||
              callbackPayload.errorReason ||
              "A Meta não concluiu o onboarding oficial do WhatsApp."
          );
        }

        const authorizationCode = String(callbackPayload.code || "").trim();
        if (!authorizationCode) {
          throw new Error(
            "A Meta não retornou o authorization code do onboarding oficial."
          );
        }

        const completed = await completeWhatsAppEmbeddedSignup(
          session.connection.connectionId,
          {
            state: callbackPayload.state || session.state,
            authorizationCode,
            businessAccountId: callbackPayload.businessAccountId ?? null,
            wabaId: callbackPayload.wabaId ?? null,
            phoneNumberId: callbackPayload.phoneNumberId ?? null,
            displayPhoneNumber: callbackPayload.displayPhoneNumber ?? null,
            verifiedName: callbackPayload.verifiedName ?? null,
            metadata: {
              source: META_EMBEDDED_SIGNUP_MESSAGE_TYPE,
            },
          }
        );

        setState(current => ({
          ...current,
          connection: completed,
          error: completed.lastError || null,
        }));

        if (shouldKeepPolling(completed)) {
          startPolling();
        } else {
          stopPolling();
        }

        return completed;
      } catch (error) {
        stopPolling();
        setState(current => ({
          ...current,
          error: getFriendlyError(error),
        }));
        throw error;
      } finally {
        setState(current => ({
          ...current,
          isStarting: false,
          loading: false,
        }));
      }
    },
    [clinicId, startPolling, stopPolling]
  );

  const refreshConnection = useCallback(async () => {
    if (!clinicId) return null;
    setState(current => ({ ...current, loading: true, error: null }));
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
      setState(current => ({
        ...current,
        error: getFriendlyError(error),
      }));
      throw error;
    } finally {
      setState(current => ({ ...current, loading: false }));
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

    if (connection.operationalStatus === "active") {
      return { label: "Conectado", tone: "positive" as const };
    }
    if (connection.operationalStatus === "onboarding") {
      return { label: "Em onboarding", tone: "warning" as const };
    }
    if (connection.operationalStatus === "action_required") {
      return { label: "Exige ação", tone: "critical" as const };
    }
    if (connection.verificationStatus === "pending") {
      return { label: "Verificando", tone: "warning" as const };
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
