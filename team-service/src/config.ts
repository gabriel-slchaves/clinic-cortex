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

function readBoolean(value: string | undefined, fallback = false) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return fallback;
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
  port: readPort(process.env.TEAM_SERVICE_PORT, 3002),
  supabaseUrl: readRequiredEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"]),
  supabaseServiceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  publicAppOrigin: readOptionalOriginEnv("PUBLIC_APP_ORIGIN", [
    "VITE_PUBLIC_APP_ORIGIN",
  ]),
  publicWaOrigin: readOptionalOriginEnv("PUBLIC_WA_ORIGIN", [
    "VITE_INTERNAL_SERVICE_ORIGIN",
  ]),
  metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "",
  metaWebhookAppSecret:
    readOptionalEnv("META_WEBHOOK_APP_SECRET", ["META_APP_SECRET"]) || "",
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
  whatsappTokenEncryptionKey: readOptionalEnv("WHATSAPP_TOKEN_ENCRYPTION_KEY"),
  whatsappEnableWorkers: readBoolean(
    process.env.WHATSAPP_ENABLE_WORKERS,
    false
  ),
  whatsappEnableAgent: readBoolean(process.env.WHATSAPP_ENABLE_AGENT, false),
  whatsappDrainToken:
    readOptionalEnv("WHATSAPP_DRAIN_TOKEN", ["SUPABASE_SERVICE_ROLE_KEY"]) || "",
  whatsappDrainBatchSize: readPositiveInteger(
    process.env.WHATSAPP_DRAIN_BATCH_SIZE,
    10
  ),
  whatsappAgentHistoryLimit: readPositiveInteger(
    process.env.WHATSAPP_AGENT_HISTORY_LIMIT,
    16
  ),
  whatsappAgentModel: readOptionalEnv("WHATSAPP_AGENT_MODEL"),
  geminiApiKey: readOptionalEnv("GEMINI_API_KEY"),
  logLevel: process.env.TEAM_SERVICE_LOG_LEVEL?.trim() || "info",
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
}

validateConfig();
