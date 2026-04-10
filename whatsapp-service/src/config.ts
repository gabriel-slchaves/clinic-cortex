function readRequiredEnv(name: string, fallbacks: string[] = []) {
  const names = [name, ...fallbacks];

  for (const candidate of names) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }

  throw new Error(`Environment variable ${name} is required.`);
}

function readOptionalEnv(name: string, fallbacks: string[] = []) {
  const names = [name, ...fallbacks];

  for (const candidate of names) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }

  return undefined;
}

function readPort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEnvironment(
  value: string | undefined
): "local" | "homolog" | "production" {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (
    normalized === "local" ||
    normalized === "homolog" ||
    normalized === "production"
  ) {
    return normalized;
  }

  return process.env.NODE_ENV === "production" ? "production" : "local";
}

function normalizeOrigin(value: string, name: string) {
  try {
    return new URL(value).origin.replace(/\/+$/, "");
  } catch {
    throw new Error(
      `Environment variable ${name} must be an absolute origin URL.`
    );
  }
}

function readOptionalOriginEnv(name: string, fallbacks: string[] = []) {
  const value = readOptionalEnv(name, fallbacks);
  return value ? normalizeOrigin(value, name) : undefined;
}

function normalizeAbsoluteUrl(value: string, name: string) {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(
      `Environment variable ${name} must be an absolute URL.`
    );
  }
}

function readOptionalAbsoluteUrlEnv(name: string, fallbacks: string[] = []) {
  const value = readOptionalEnv(name, fallbacks);
  return value ? normalizeAbsoluteUrl(value, name) : undefined;
}

function readCsv(value: string | undefined, fallback: string[]) {
  const source = value?.trim();
  if (!source) return fallback;
  const parsed = source
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

export const config = {
  appEnvironment: normalizeEnvironment(
    readOptionalEnv("APP_ENV", ["VITE_APP_ENV", "NODE_ENV"])
  ),
  port: readPort(process.env.WHATSAPP_SERVICE_PORT, 3001),
  supabaseUrl: readRequiredEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"]),
  supabaseAnonKey: readRequiredEnv("SUPABASE_ANON_KEY", [
    "VITE_SUPABASE_ANON_KEY",
  ]),
  supabaseServiceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  publicAppOrigin: readOptionalOriginEnv("PUBLIC_APP_ORIGIN", [
    "VITE_PUBLIC_APP_ORIGIN",
  ]),
  publicWaOrigin: readOptionalOriginEnv("PUBLIC_WA_ORIGIN"),
  logLevel: process.env.WHATSAPP_LOG_LEVEL?.trim() || "info",
  n8nMessageWebhookUrl: readOptionalEnv("N8N_MESSAGE_WEBHOOK_URL"),
  n8nMessageWebhookSecret: readOptionalEnv("N8N_MESSAGE_WEBHOOK_SECRET"),
  n8nMessageWebhookTimeoutMs: readPositiveInteger(
    process.env.N8N_MESSAGE_WEBHOOK_TIMEOUT_MS,
    15000
  ),
  metaAppId: readOptionalEnv("META_APP_ID"),
  metaAppSecret: readOptionalEnv("META_APP_SECRET"),
  metaGraphVersion: process.env.META_GRAPH_VERSION?.trim() || "v23.0",
  metaEmbeddedSignupConfigId: readOptionalEnv("META_EMBEDDED_SIGNUP_CONFIG_ID"),
  metaEmbeddedSignupRedirectUri: readOptionalAbsoluteUrlEnv(
    "META_EMBEDDED_SIGNUP_REDIRECT_URI"
  ),
  metaEmbeddedSignupScopes: readCsv(process.env.META_EMBEDDED_SIGNUP_SCOPES, [
    "business_management",
    "whatsapp_business_management",
    "whatsapp_business_messaging",
  ]),
  metaWebhookVerifyToken: readOptionalEnv("META_WEBHOOK_VERIFY_TOKEN"),
  metaWebhookAppSecret: readOptionalEnv("META_WEBHOOK_APP_SECRET", [
    "META_APP_SECRET",
  ]),
  metaHealthcheckIntervalMs: readPositiveInteger(
    process.env.META_HEALTHCHECK_INTERVAL_MS,
    300000
  ),
  whatsappTokenEncryptionKey: readOptionalEnv("WHATSAPP_TOKEN_ENCRYPTION_KEY"),
};

function validateConfig() {
  if (config.appEnvironment === "local") {
    return;
  }

  if (!config.publicAppOrigin) {
    throw new Error(
      "Environment variable PUBLIC_APP_ORIGIN is required outside local."
    );
  }

  if (!config.publicWaOrigin) {
    throw new Error(
      "Environment variable PUBLIC_WA_ORIGIN is required outside local."
    );
  }

  if (!config.metaEmbeddedSignupRedirectUri) {
    throw new Error(
      "Environment variable META_EMBEDDED_SIGNUP_REDIRECT_URI is required outside local."
    );
  }

  if (!config.publicAppOrigin.startsWith("https://")) {
    throw new Error("PUBLIC_APP_ORIGIN must use HTTPS outside local.");
  }

  if (!config.publicWaOrigin.startsWith("https://")) {
    throw new Error("PUBLIC_WA_ORIGIN must use HTTPS outside local.");
  }

  if (!config.metaEmbeddedSignupRedirectUri.startsWith("https://")) {
    throw new Error(
      "META_EMBEDDED_SIGNUP_REDIRECT_URI must use HTTPS outside local."
    );
  }

  const redirectOrigin = new URL(config.metaEmbeddedSignupRedirectUri).origin;
  if (redirectOrigin !== config.publicAppOrigin) {
    throw new Error(
      "META_EMBEDDED_SIGNUP_REDIRECT_URI must use the same origin as PUBLIC_APP_ORIGIN."
    );
  }
}

validateConfig();
