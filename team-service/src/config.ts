function readRequiredEnv(name: string, fallbacks: string[] = []) {
  const names = [name, ...fallbacks];

  for (const candidate of names) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }

  throw new Error(`Environment variable ${name} is required.`);
}

function readPort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: readPort(process.env.TEAM_SERVICE_PORT, 3002),
  supabaseUrl: readRequiredEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"]),
  supabaseServiceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "",
  logLevel: process.env.TEAM_SERVICE_LOG_LEVEL?.trim() || "info",
};
