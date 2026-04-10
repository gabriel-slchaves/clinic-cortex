import { useEffect } from "react";
import {
  META_EMBEDDED_SIGNUP_MESSAGE_TYPE,
  type MetaEmbeddedSignupCallbackPayload,
} from "@/lib/whatsappEmbeddedSignup";

function getParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value && value.trim() ? value.trim() : undefined;
}

export default function WhatsAppMetaCallback() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const payload: MetaEmbeddedSignupCallbackPayload = {
      type: META_EMBEDDED_SIGNUP_MESSAGE_TYPE,
      state: getParam(params, "state"),
      code: getParam(params, "code"),
      error: getParam(params, "error"),
      errorReason: getParam(params, "error_reason"),
      errorDescription: getParam(params, "error_description"),
      businessAccountId: getParam(params, "business_account_id") || null,
      wabaId: getParam(params, "waba_id") || null,
      phoneNumberId: getParam(params, "phone_number_id") || null,
      displayPhoneNumber: getParam(params, "display_phone_number") || null,
      verifiedName: getParam(params, "verified_name") || null,
    };

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      window.setTimeout(() => window.close(), 200);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] flex items-center justify-center px-4">
      <div className="max-w-md w-full cc-card rounded-3xl p-8 text-center">
        <p className="font-['Syne'] font-800 text-xl text-[var(--cc-text-primary)]">
          Finalizando conexão oficial
        </p>
        <p className="mt-3 text-sm text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600">
          A autorização da Meta foi recebida. Você já pode voltar para a janela
          principal da ClinicCortex.
        </p>
      </div>
    </div>
  );
}
