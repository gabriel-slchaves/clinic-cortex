export const META_EMBEDDED_SIGNUP_MESSAGE_TYPE =
  "cliniccortex.meta-whatsapp.embedded-signup";

export type MetaEmbeddedSignupCallbackPayload = {
  type: typeof META_EMBEDDED_SIGNUP_MESSAGE_TYPE;
  state?: string;
  code?: string;
  error?: string;
  errorReason?: string;
  errorDescription?: string;
  businessAccountId?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
};

export function isMetaEmbeddedSignupCallbackPayload(
  value: unknown
): value is MetaEmbeddedSignupCallbackPayload {
  if (!value || typeof value !== "object") return false;
  return (
    (value as { type?: string }).type === META_EMBEDDED_SIGNUP_MESSAGE_TYPE
  );
}
