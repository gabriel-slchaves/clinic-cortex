import path from "node:path";

function readRequiredEnv(name: string, fallbacks: string[] = []) {
  const names = [name, ...fallbacks];

  for (const candidate of names) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }

  throw new Error(`Environment variable ${name} is required.`);
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readPort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: readPort(process.env.WHATSAPP_SERVICE_PORT, 3001),
  supabaseUrl: readRequiredEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"]),
  supabaseAnonKey: readRequiredEnv("SUPABASE_ANON_KEY", ["VITE_SUPABASE_ANON_KEY"]),
  supabaseServiceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  sessionRoot: path.resolve(process.env.WHATSAPP_SESSION_DIR || ".whatsapp-sessions"),
  logLevel: process.env.WHATSAPP_LOG_LEVEL?.trim() || "info",
  n8nMessageWebhookUrl: readOptionalEnv("N8N_MESSAGE_WEBHOOK_URL"),
  n8nMessageWebhookSecret: readOptionalEnv("N8N_MESSAGE_WEBHOOK_SECRET"),
  n8nMessageWebhookTimeoutMs: readPositiveInteger(
    process.env.N8N_MESSAGE_WEBHOOK_TIMEOUT_MS,
    15000
  ),
};
