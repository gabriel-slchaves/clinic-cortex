import { createClient } from "@supabase/supabase-js";

type EnvironmentName = "local" | "homolog" | "production";

type CheckResult = {
  label: string;
  ok: boolean;
  detail: string;
};

type CliOptions = {
  checkHttp: boolean;
  httpOrigin?: string;
  expectEnv?: EnvironmentName;
};

type RuntimeConfig = {
  appEnvironment: EnvironmentName;
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  publicAppOrigin?: string;
  publicWaOrigin?: string;
  metaAppId?: string;
  metaAppSecret?: string;
  metaEmbeddedSignupConfigId?: string;
  metaEmbeddedSignupRedirectUri?: string;
  metaWebhookVerifyToken?: string;
  metaWebhookAppSecret?: string;
  whatsappTokenEncryptionKey?: string;
};

const REQUIRED_SCHEMA_CHECKS = [
  {
    table: "whatsapp_connections",
    columns:
      "id,clinic_id,provider,operational_status,onboarding_status,verification_status,webhook_status,business_account_id,waba_id,phone_number_id,display_phone_number,verified_name,last_event_code,last_event_message,last_event_at",
  },
  {
    table: "whatsapp_connection_credentials",
    columns:
      "id,connection_id,encrypted_access_token,granted_scopes,token_obtained_at,token_expires_at,revoked_at",
  },
  {
    table: "whatsapp_webhook_events",
    columns:
      "id,connection_id,clinic_id,provider_event_hash,event_kind,processing_status,processing_attempts,processed_at",
  },
  {
    table: "whatsapp_messages",
    columns:
      "id,clinic_id,connection_id,provider,provider_message_id,contact_wa_id,from_me,message_type,text_body,provider_message_status,provider_timestamp,received_at",
  },
  {
    table: "whatsapp_message_status_events",
    columns:
      "id,clinic_id,connection_id,provider_message_id,status,occurred_at",
  },
] as const;

const LEGACY_SCHEMA_CHECKS = [
  {
    table: "whatsapp_connections",
    columns:
      "status,session_path,qr_code,qr_generated_at,phone_jid,phone_number,connected_at,last_seen_at,manual_action_required,is_recovering,recovery_attempt_count,next_retry_at",
  },
  {
    table: "whatsapp_messages",
    columns: "wa_message_id,remote_jid",
  },
] as const;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    checkHttp: false,
  };

  for (const arg of argv) {
    if (arg === "--check-http") {
      options.checkHttp = true;
      continue;
    }

    if (arg.startsWith("--http-origin=")) {
      options.httpOrigin = arg.slice("--http-origin=".length).trim();
      continue;
    }

    if (arg.startsWith("--expect-env=")) {
      const value = arg.slice("--expect-env=".length).trim().toLowerCase();
      if (value === "local" || value === "homolog" || value === "production") {
        options.expectEnv = value;
      }
    }
  }

  return options;
}

function ok(label: string, detail: string): CheckResult {
  return { label, ok: true, detail };
}

function fail(label: string, detail: string): CheckResult {
  return { label, ok: false, detail };
}

function printResults(results: CheckResult[]) {
  for (const result of results) {
    const prefix = result.ok ? "[ok]" : "[fail]";
    console.log(`${prefix} ${result.label}: ${result.detail}`);
  }
}

function looksLikePlaceholder(value: string | undefined) {
  if (!value) return true;
  const normalized = value.trim();
  if (!normalized) return true;

  return (
    normalized.includes("YOUR_") ||
    normalized.includes("GENERATE_") ||
    normalized.includes("<") ||
    normalized.includes("example.com")
  );
}

function getHostname(value: string | undefined) {
  if (!value) return "";

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function validateEncryptionKey(value: string | undefined) {
  if (!value || looksLikePlaceholder(value)) {
    return "WHATSAPP_TOKEN_ENCRYPTION_KEY não foi preenchida.";
  }

  try {
    const decoded = Buffer.from(value, "base64");
    const normalizedInput = value.replace(/=+$/, "");
    const normalizedDecoded = decoded.toString("base64").replace(/=+$/, "");
    if (decoded.length !== 32 || normalizedDecoded !== normalizedInput) {
      return "WHATSAPP_TOKEN_ENCRYPTION_KEY precisa ser base64 válido de 32 bytes.";
    }
  } catch {
    return "WHATSAPP_TOKEN_ENCRYPTION_KEY precisa ser base64 válido de 32 bytes.";
  }

  return null;
}

function validateVerifyToken(value: string | undefined) {
  if (!value || looksLikePlaceholder(value)) {
    return "META_WEBHOOK_VERIFY_TOKEN não foi preenchido.";
  }

  if (value.trim().length < 32) {
    return "META_WEBHOOK_VERIFY_TOKEN deve ter pelo menos 32 caracteres.";
  }

  return null;
}

function isMissingSchemaError(error: unknown) {
  const input = error as { code?: string; message?: string; details?: string };
  const code = String(input?.code || "");
  const message =
    `${String(input?.message || "")} ${String(input?.details || "")}`.toLowerCase();

  return (
    code === "42703" ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

async function loadConfig(): Promise<RuntimeConfig> {
  try {
    const module = (await import("../config.js")) as { config: RuntimeConfig };
    return module.config;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao carregar a configuração do conector: ${detail}`);
  }
}

async function checkRequiredSchema(
  supabaseUrl: string,
  serviceRoleKey: string
) {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const results: CheckResult[] = [];

  for (const check of REQUIRED_SCHEMA_CHECKS) {
    const { error } = await admin
      .from(check.table)
      .select(check.columns, { head: true, count: "exact" })
      .limit(1);

    if (error) {
      results.push(
        fail(
          `Schema ${check.table}`,
          `Falha ao validar tabela/colunas obrigatórias: ${error.message}`
        )
      );
      continue;
    }

    results.push(
      ok(
        `Schema ${check.table}`,
        "Tabela e colunas obrigatórias acessíveis."
      )
    );
  }

  for (const legacy of LEGACY_SCHEMA_CHECKS) {
    const { error } = await admin
      .from(legacy.table)
      .select(legacy.columns, { head: true, count: "exact" })
      .limit(1);

    if (!error) {
      results.push(
        fail(
          `Legado ${legacy.table}`,
          `As colunas legadas ainda existem: ${legacy.columns}`
        )
      );
      continue;
    }

    if (isMissingSchemaError(error)) {
      results.push(
        ok(
          `Legado ${legacy.table}`,
          "As colunas legadas do Baileys nao estao mais acessiveis."
        )
      );
      continue;
    }

    results.push(
      fail(
        `Legado ${legacy.table}`,
        `Erro inesperado ao validar cleanup legado: ${error.message}`
      )
    );
  }

  return results;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHttpEndpoints(
  config: RuntimeConfig,
  httpOrigin: string | undefined
) {
  const baseOrigin =
    httpOrigin?.trim() ||
    config.publicWaOrigin ||
    `http://127.0.0.1:${config.port}`;
  const normalizedOrigin = baseOrigin.replace(/\/+$/, "");
  const results: CheckResult[] = [];

  if (looksLikePlaceholder(normalizedOrigin)) {
    results.push(
      fail(
        "HTTP endpoints",
        "A origem HTTP ainda esta com placeholder. Preencha PUBLIC_WA_ORIGIN ou use --http-origin."
      )
    );
    return results;
  }

  try {
    const healthResponse = await fetchWithTimeout(`${normalizedOrigin}/health`);
    const raw = await healthResponse.text();
    const payload = raw ? (JSON.parse(raw) as { ok?: boolean }) : {};

    if (!healthResponse.ok || payload.ok !== true) {
      results.push(
        fail(
          "HTTP /health",
          `Resposta inesperada de ${normalizedOrigin}/health: status ${healthResponse.status}.`
        )
      );
    } else {
      results.push(
        ok(
          "HTTP /health",
          `Healthcheck respondeu com sucesso em ${normalizedOrigin}/health.`
        )
      );
    }
  } catch (error) {
    results.push(
      fail(
        "HTTP /health",
        `Nao foi possivel acessar ${normalizedOrigin}/health: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }

  if (!config.metaWebhookVerifyToken) {
    results.push(
      fail(
        "HTTP GET webhook",
        "META_WEBHOOK_VERIFY_TOKEN nao esta disponivel para validar o challenge."
      )
    );
    return results;
  }

  try {
    const challenge = "cliniccortex-preflight";
    const webhookUrl = new URL(
      `${normalizedOrigin}/whatsapp/meta/webhook`
    );
    webhookUrl.searchParams.set("hub.mode", "subscribe");
    webhookUrl.searchParams.set(
      "hub.verify_token",
      config.metaWebhookVerifyToken
    );
    webhookUrl.searchParams.set("hub.challenge", challenge);

    const response = await fetchWithTimeout(webhookUrl.toString());
    const raw = await response.text();

    if (!response.ok || raw.trim() !== challenge) {
      results.push(
        fail(
          "HTTP GET webhook",
          `Verificacao do webhook falhou em ${webhookUrl.origin}: status ${response.status}.`
        )
      );
    } else {
      results.push(
        ok(
          "HTTP GET webhook",
          "Challenge do webhook respondeu corretamente."
        )
      );
    }
  } catch (error) {
    results.push(
      fail(
        "HTTP GET webhook",
        `Nao foi possivel validar o webhook publico: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }

  return results;
}

function buildConfigChecks(
  config: RuntimeConfig,
  options: CliOptions
): CheckResult[] {
  const results: CheckResult[] = [];

  if (options.expectEnv) {
    results.push(
      config.appEnvironment === options.expectEnv
        ? ok(
            "APP_ENV",
            `Ambiente ativo confirmado como ${config.appEnvironment}.`
          )
        : fail(
            "APP_ENV",
            `Esperado ${options.expectEnv}, mas o conector carregou ${config.appEnvironment}.`
          )
    );
  }

  const publicAppOrigin = config.publicAppOrigin || "";
  const publicWaOrigin = config.publicWaOrigin || "";
  const redirectUri = config.metaEmbeddedSignupRedirectUri || "";

  results.push(
    !looksLikePlaceholder(config.supabaseUrl) &&
      !looksLikePlaceholder(config.supabaseServiceRoleKey)
      ? ok("Supabase", "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY preenchidos.")
      : fail(
          "Supabase",
          "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar preenchidos com valores reais."
        )
  );

  results.push(
    !looksLikePlaceholder(config.metaAppId) &&
      !looksLikePlaceholder(config.metaAppSecret)
      ? ok("Meta App", "META_APP_ID e META_APP_SECRET preenchidos.")
      : fail(
          "Meta App",
          "META_APP_ID e META_APP_SECRET precisam estar preenchidos com valores reais."
        )
  );

  results.push(
    !looksLikePlaceholder(config.metaEmbeddedSignupConfigId)
      ? ok(
          "Embedded Signup",
          "META_EMBEDDED_SIGNUP_CONFIG_ID preenchido."
        )
      : fail(
          "Embedded Signup",
          "META_EMBEDDED_SIGNUP_CONFIG_ID precisa estar preenchido."
        )
  );

  results.push(
    !looksLikePlaceholder(publicAppOrigin) && !looksLikePlaceholder(publicWaOrigin)
      ? ok(
          "Origens publicas",
          `PUBLIC_APP_ORIGIN=${publicAppOrigin} e PUBLIC_WA_ORIGIN=${publicWaOrigin}.`
        )
      : fail(
          "Origens publicas",
          "PUBLIC_APP_ORIGIN e PUBLIC_WA_ORIGIN precisam usar dominios publicos reais."
        )
  );

  results.push(
    !looksLikePlaceholder(process.env.VITE_INTERNAL_SERVICE_ORIGIN) &&
      process.env.VITE_INTERNAL_SERVICE_ORIGIN === publicWaOrigin
      ? ok(
          "Frontend origin",
          "VITE_INTERNAL_SERVICE_ORIGIN esta alinhado com PUBLIC_WA_ORIGIN."
        )
      : fail(
          "Frontend origin",
          "VITE_INTERNAL_SERVICE_ORIGIN precisa apontar para o mesmo host de PUBLIC_WA_ORIGIN."
        )
  );

  results.push(
    !looksLikePlaceholder(process.env.VITE_PUBLIC_APP_ORIGIN) &&
      process.env.VITE_PUBLIC_APP_ORIGIN === publicAppOrigin
      ? ok(
          "Frontend app origin",
          "VITE_PUBLIC_APP_ORIGIN esta alinhado com PUBLIC_APP_ORIGIN."
        )
      : fail(
          "Frontend app origin",
          "VITE_PUBLIC_APP_ORIGIN precisa apontar para o mesmo host de PUBLIC_APP_ORIGIN."
        )
  );

  const redirectPathOk =
    !looksLikePlaceholder(redirectUri) &&
    redirectUri.endsWith("/integrations/whatsapp/meta/callback");
  const redirectOriginOk =
    redirectUri && publicAppOrigin && new URL(redirectUri).origin === publicAppOrigin;

  results.push(
    redirectPathOk && redirectOriginOk
      ? ok(
          "Redirect URI",
          "META_EMBEDDED_SIGNUP_REDIRECT_URI esta alinhada com o app."
        )
      : fail(
          "Redirect URI",
          "META_EMBEDDED_SIGNUP_REDIRECT_URI precisa usar o app do ambiente e terminar em /integrations/whatsapp/meta/callback."
        )
  );

  const verifyTokenError = validateVerifyToken(config.metaWebhookVerifyToken);
  results.push(
    verifyTokenError
      ? fail("Webhook verify token", verifyTokenError)
      : ok("Webhook verify token", "META_WEBHOOK_VERIFY_TOKEN valido.")
  );

  results.push(
    !looksLikePlaceholder(config.metaWebhookAppSecret)
      ? ok("Webhook app secret", "META_WEBHOOK_APP_SECRET preenchido.")
      : fail(
          "Webhook app secret",
          "META_WEBHOOK_APP_SECRET precisa estar preenchido."
        )
  );

  const encryptionKeyError = validateEncryptionKey(
    config.whatsappTokenEncryptionKey
  );
  results.push(
    encryptionKeyError
      ? fail("Encryption key", encryptionKeyError)
      : ok("Encryption key", "WHATSAPP_TOKEN_ENCRYPTION_KEY valida.")
  );

  if (
    config.appEnvironment !== "local" &&
    (getHostname(publicAppOrigin).includes("localhost") ||
      getHostname(publicWaOrigin).includes("localhost"))
  ) {
    results.push(
      fail(
        "Dominios publicos",
        "Homolog/producao nao podem usar localhost como origem publica."
      )
    );
  } else {
    results.push(
      ok(
        "Dominios publicos",
        "As origens publicas nao apontam para localhost fora de local."
      )
    );
  }

  if (
    config.metaWebhookAppSecret &&
    config.metaAppSecret &&
    config.metaWebhookAppSecret !== config.metaAppSecret
  ) {
    results.push(
      ok(
        "Webhook secret parity",
        "META_WEBHOOK_APP_SECRET diverge de META_APP_SECRET. Isso so e valido se a configuracao separada for intencional."
      )
    );
  } else {
    results.push(
      ok(
        "Webhook secret parity",
        "META_WEBHOOK_APP_SECRET esta alinhado com META_APP_SECRET."
      )
    );
  }

  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const results: CheckResult[] = [];

  try {
    const config = await loadConfig();
    const hasSupabaseCredentials =
      !looksLikePlaceholder(config.supabaseUrl) &&
      !looksLikePlaceholder(config.supabaseServiceRoleKey);

    results.push(...buildConfigChecks(config, options));
    if (hasSupabaseCredentials) {
      results.push(
        ...(await checkRequiredSchema(
          config.supabaseUrl,
          config.supabaseServiceRoleKey
        ))
      );
    } else {
      results.push(
        fail(
          "Schema probe",
          "Validacao de schema ignorada porque as credenciais do Supabase ainda estao com placeholder."
        )
      );
    }

    if (options.checkHttp) {
      results.push(...(await checkHttpEndpoints(config, options.httpOrigin)));
    }

    printResults(results);

    const failures = results.filter(result => !result.ok);
    if (failures.length > 0) {
      console.error(
        `Preflight falhou com ${failures.length} verificacao(oes) pendente(s).`
      );
      process.exitCode = 1;
      return;
    }

    console.log("Preflight concluido com sucesso.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Preflight interrompido: ${detail}`);
    process.exitCode = 1;
  }
}

void main();
