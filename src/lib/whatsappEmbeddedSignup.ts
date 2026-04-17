export const META_EMBEDDED_SIGNUP_MESSAGE_TYPE =
  "cliniccortex.meta-whatsapp.embedded-signup";

const FACEBOOK_SDK_SCRIPT_ID = "facebook-jssdk";
const FACEBOOK_SDK_URL = "https://connect.facebook.net/en_US/sdk.js";
const DEFAULT_GRAPH_VERSION = "v23.0";
const FACEBOOK_EMBEDDED_SIGNUP_TYPE = "WA_EMBEDDED_SIGNUP";
const FACEBOOK_EMBEDDED_SIGNUP_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
]);

type FacebookLoginResponse = {
  status?: string;
  authResponse?: {
    code?: string;
    accessToken?: string;
    expiresIn?: number;
    grantedScopes?: string;
  } | null;
};

type FacebookSdk = {
  init: (options: {
    appId: string;
    cookie?: boolean;
    xfbml?: boolean;
    version: string;
  }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export type MetaEmbeddedSignupCallbackPayload = {
  type: typeof META_EMBEDDED_SIGNUP_MESSAGE_TYPE;
  state?: string;
  code?: string;
  accessToken?: string;
  grantedScopes?: string[];
  tokenExpiresInSeconds?: number | null;
  error?: string;
  errorReason?: string;
  errorDescription?: string;
  businessAccountId?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
};

export type MetaEmbeddedSignupSession = {
  appId: string;
  configId: string;
  state: string;
  redirectUri: string;
  launchUrl?: string | null;
  graphVersion?: string | null;
  scopes?: string[] | null;
  extras?: Record<string, unknown> | null;
};

export class MetaEmbeddedSignupSdkUnavailableError extends Error {
  readonly publicMessage =
    "Não foi possível abrir a conexão oficial do WhatsApp agora. Tente novamente ou acione o suporte.";

  constructor(message: string) {
    super(message);
    this.name = "MetaEmbeddedSignupSdkUnavailableError";
  }
}

export class MetaEmbeddedSignupConfigurationError extends Error {
  readonly publicMessage =
    "Não foi possível iniciar a conexão oficial do WhatsApp agora. Tente novamente ou acione o suporte.";

  constructor(
    public readonly diagnosticMessage: string,
    public readonly diagnostic?: unknown
  ) {
    super(diagnosticMessage);
    this.name = "MetaEmbeddedSignupConfigurationError";
  }
}

export function isMetaEmbeddedSignupCallbackPayload(
  value: unknown
): value is MetaEmbeddedSignupCallbackPayload {
  if (!value || typeof value !== "object") return false;
  return (
    (value as { type?: string }).type === META_EMBEDDED_SIGNUP_MESSAGE_TYPE
  );
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeGraphVersion(value: unknown) {
  const version = cleanString(value);
  return version || DEFAULT_GRAPH_VERSION;
}

function parseGrantedScopes(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(cleanString).filter(Boolean) as string[];
  }

  const raw = cleanString(value);
  if (!raw) return [];

  return raw
    .split(",")
    .map(scope => scope.trim())
    .filter(Boolean);
}

function getEmbeddedSignupExtras(session: MetaEmbeddedSignupSession) {
  return {
    feature: "whatsapp_embedded_signup",
    sessionInfoVersion: "3",
    setup: {},
    ...(session.extras || {}),
  };
}

function normalizeEmbeddedSignupMessageData(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const data = value as Record<string, unknown>;

  return {
    businessAccountId:
      cleanString(data.business_account_id) ||
      cleanString(data.business_id) ||
      null,
    wabaId: cleanString(data.waba_id) || null,
    phoneNumberId: cleanString(data.phone_number_id) || null,
    displayPhoneNumber: cleanString(data.display_phone_number) || null,
    verifiedName: cleanString(data.verified_name) || null,
  };
}

function parseEmbeddedSignupMessage(eventData: unknown) {
  try {
    const payload =
      typeof eventData === "string" ? JSON.parse(eventData) : eventData;

    if (!payload || typeof payload !== "object") return null;

    const data = payload as {
      type?: unknown;
      event?: unknown;
      data?: unknown;
    };

    if (data.type !== FACEBOOK_EMBEDDED_SIGNUP_TYPE) return null;

    return {
      event: cleanString(data.event),
      data: normalizeEmbeddedSignupMessageData(data.data),
      rawData: data.data,
    };
  } catch {
    return null;
  }
}

function validateRequiredSignupField(value: unknown, label: string) {
  const normalized = cleanString(value);
  if (!normalized) {
    throw new MetaEmbeddedSignupConfigurationError(
      `Embedded Signup session is missing required field: ${label}.`,
      { missingField: label }
    );
  }

  return normalized;
}

export function getValidatedMetaLaunchUrl(session: MetaEmbeddedSignupSession) {
  const rawUrl = cleanString(session.launchUrl);
  if (!rawUrl) {
    throw new MetaEmbeddedSignupConfigurationError(
      "Embedded Signup session is missing launchUrl.",
      { missingField: "launchUrl" }
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MetaEmbeddedSignupConfigurationError(
      "Embedded Signup session returned a malformed launchUrl.",
      { launchUrl: rawUrl }
    );
  }

  if (
    url.protocol !== "https:" ||
    !["www.facebook.com", "web.facebook.com", "facebook.com"].includes(
      url.hostname
    )
  ) {
    throw new MetaEmbeddedSignupConfigurationError(
      "Embedded Signup session returned a non-Meta launchUrl.",
      { launchUrl: rawUrl }
    );
  }

  return url.toString();
}

let facebookSdkPromise: Promise<FacebookSdk> | null = null;

function loadFacebookSdk() {
  if (window.FB) return Promise.resolve(window.FB);
  if (facebookSdkPromise) return facebookSdkPromise;

  facebookSdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const existingScript = document.getElementById(FACEBOOK_SDK_SCRIPT_ID);
    const previousInit = window.fbAsyncInit;

    const timeoutId = window.setTimeout(() => {
      reject(
        new MetaEmbeddedSignupSdkUnavailableError(
          "A SDK da Meta não carregou a tempo. Verifique bloqueadores de script, rede ou configuração do navegador."
        )
      );
    }, 15_000);

    window.fbAsyncInit = () => {
      previousInit?.();
      window.clearTimeout(timeoutId);

      if (!window.FB) {
        reject(
          new MetaEmbeddedSignupSdkUnavailableError(
            "A SDK da Meta carregou, mas não expôs o objeto FB."
          )
        );
        return;
      }

      resolve(window.FB);
    };

    if (existingScript) return;

    const script = document.createElement("script");
    script.id = FACEBOOK_SDK_SCRIPT_ID;
    script.src = FACEBOOK_SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(
        new MetaEmbeddedSignupSdkUnavailableError(
          "Não foi possível carregar a SDK da Meta."
        )
      );
    };

    const firstScript = document.getElementsByTagName("script")[0];
    firstScript?.parentNode?.insertBefore(script, firstScript);
  }).catch(error => {
    facebookSdkPromise = null;
    throw error;
  });

  return facebookSdkPromise;
}

export async function startMetaEmbeddedSignupWithSdk(
  session: MetaEmbeddedSignupSession
) {
  const appId = validateRequiredSignupField(session.appId, "META_APP_ID");
  const configId = validateRequiredSignupField(
    session.configId,
    "META_EMBEDDED_SIGNUP_CONFIG_ID"
  );
  const state = validateRequiredSignupField(session.state, "state");
  const graphVersion = normalizeGraphVersion(session.graphVersion);
  const scopes = parseGrantedScopes(session.scopes);
  const extras = getEmbeddedSignupExtras(session);
  const fb = await loadFacebookSdk();

  fb.init({
    appId,
    cookie: false,
    xfbml: false,
    version: graphVersion,
  });

  return new Promise<MetaEmbeddedSignupCallbackPayload>((resolve, reject) => {
    let sessionInfo: Partial<MetaEmbeddedSignupCallbackPayload> = {};
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
    };

    const settle = (
      callback: typeof resolve | typeof reject,
      value: MetaEmbeddedSignupCallbackPayload | Error
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value as never);
    };

    const onMessage = (event: MessageEvent) => {
      if (!FACEBOOK_EMBEDDED_SIGNUP_ORIGINS.has(event.origin)) return;

      const message = parseEmbeddedSignupMessage(event.data);
      if (!message) return;

      if (message.event === "FINISH" || message.event === "FINISH_ONLY_WABA") {
        sessionInfo = {
          ...sessionInfo,
          ...message.data,
        };
        return;
      }

      if (message.event === "CANCEL") {
        settle(
          reject,
          new Error("O onboarding oficial da Meta foi cancelado antes do fim.")
        );
        return;
      }

      if (message.event === "ERROR") {
        settle(
          reject,
          new Error("A Meta retornou erro ao abrir o Embedded Signup.")
        );
      }
    };

    const timeoutId = window.setTimeout(() => {
      settle(
        reject,
        new Error("O onboarding oficial da Meta excedeu o tempo limite.")
      );
    }, 5 * 60 * 1000);

    window.addEventListener("message", onMessage);

    fb.login(
      response => {
        const code = cleanString(response.authResponse?.code);
        const accessToken = cleanString(response.authResponse?.accessToken);

        if (!code && !accessToken) {
          settle(
            reject,
            new Error(
              "A Meta não retornou authorization code nem access token para concluir o onboarding oficial."
            )
          );
          return;
        }

        settle(resolve, {
          type: META_EMBEDDED_SIGNUP_MESSAGE_TYPE,
          state,
          code,
          accessToken,
          grantedScopes: parseGrantedScopes(
            response.authResponse?.grantedScopes || scopes
          ),
          tokenExpiresInSeconds:
            typeof response.authResponse?.expiresIn === "number"
              ? response.authResponse.expiresIn
              : null,
          businessAccountId: sessionInfo.businessAccountId ?? null,
          wabaId: sessionInfo.wabaId ?? null,
          phoneNumberId: sessionInfo.phoneNumberId ?? null,
          displayPhoneNumber: sessionInfo.displayPhoneNumber ?? null,
          verifiedName: sessionInfo.verifiedName ?? null,
        });
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras,
        ...(scopes.length ? { scope: scopes.join(",") } : {}),
      }
    );
  });
}
