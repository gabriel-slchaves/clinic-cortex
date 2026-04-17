import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const target = (process.argv[2] || "local").trim();

const envFileByTarget = {
  local: resolve(".env.local"),
  homolog: resolve(".env.homolog"),
  production: resolve(".env.production"),
};

const envFile = envFileByTarget[target];
if (!envFile) {
  console.error(
    `Ambiente inválido: "${target}". Use local, homolog ou production.`
  );
  process.exit(1);
}

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const env = parseEnvFile(envFile);
const n8nPort = String(env.N8N_PORT || "5678").trim();
const internalOrigin = String(env.VITE_INTERNAL_SERVICE_ORIGIN || "").trim();
const localLoopback = "127.0.0.1";
const directBase = `http://${localLoopback}:${n8nPort}`;
const webhookBase =
  target === "local"
    ? `${directBase}/webhook/whatsapp`
    : `${internalOrigin.replace(/\/$/, "")}/whatsapp`;
const teamBase =
  target === "local"
    ? `http://${localLoopback}:${String(env.TEAM_SERVICE_PORT || "3002").trim()}`
    : internalOrigin.replace(/\/$/, "");
const verifyToken = String(env.META_WEBHOOK_VERIFY_TOKEN || "").trim();

const results = [];

function probeLocalN8nEnvAccess() {
  if (target !== "local") {
    results.push({
      name: "n8n env access",
      ok: true,
      skipped: true,
      detail:
        "checagem direta do container disponível apenas no ambiente local.",
    });
    return;
  }

  try {
    const output = execFileSync(
      "docker",
      ["exec", "cliniccortex-n8n-dev", "env"],
      { encoding: "utf8" }
    );
    const envLines = new Map(
      output
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => {
          const separator = line.indexOf("=");
          return separator === -1
            ? [line, ""]
            : [line.slice(0, separator), line.slice(separator + 1)];
        })
    );
    const blockEnvAccess = String(
      envLines.get("N8N_BLOCK_ENV_ACCESS_IN_NODE") || ""
    ).toLowerCase();
    const teamServiceUrl = String(envLines.get("TEAM_SERVICE_INTERNAL_URL") || "");
    const supabaseUrl = String(envLines.get("SUPABASE_URL") || "");
    const metaAppId = String(envLines.get("META_APP_ID") || "");

    const missing = [
      blockEnvAccess !== "false"
        ? "N8N_BLOCK_ENV_ACCESS_IN_NODE=false"
        : null,
      !teamServiceUrl ? "TEAM_SERVICE_INTERNAL_URL" : null,
      !supabaseUrl ? "SUPABASE_URL" : null,
      !metaAppId ? "META_APP_ID" : null,
    ].filter(Boolean);

    results.push({
      name: "n8n env access",
      ok: missing.length === 0,
      detail: missing.length
        ? `faltando/inválido: ${missing.join(", ")}`
        : "N8N_BLOCK_ENV_ACCESS_IN_NODE=false e envs críticas presentes",
    });
  } catch (error) {
    results.push({
      name: "n8n env access",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function probe(name, request, evaluate) {
  try {
    const response = await fetch(request.url, {
      method: request.method || "GET",
      headers: request.headers,
      body: request.body,
    });
    const text = await response.text();
    const verdict = evaluate(response, text);
    results.push({ name, ok: verdict.ok, detail: verdict.detail });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

await probe("n8n healthz", { url: `${directBase}/healthz` }, response => ({
  ok: response.ok,
  detail: `status ${response.status}`,
}));

await probe("team-service health", { url: `${teamBase}/health` }, response => ({
  ok: response.ok,
  detail: `status ${response.status}`,
}));

probeLocalN8nEnvAccess();

if (verifyToken) {
  const metaVerifyBase =
    target === "local"
      ? `${teamBase}/whatsapp/meta/webhook`
      : `${webhookBase}/meta/webhook`;
  await probe(
    "webhook verify challenge",
    {
      url: `${metaVerifyBase}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
        verifyToken
      )}&hub.challenge=123`,
    },
    (response, text) => ({
      ok: response.status === 200 && text.includes("123"),
      detail: `status ${response.status}${text ? ` body=${text}` : ""}`,
    })
  );
} else {
  results.push({
    name: "webhook verify challenge",
    ok: true,
    skipped: true,
    detail:
      "META_WEBHOOK_VERIFY_TOKEN vazio no ambiente. O challenge da Meta foi pulado.",
  });
}

await probe(
  "status endpoint registrado",
  { url: `${webhookBase}/connections/status?clinicId=probe-clinic` },
  (response, text) => ({
    ok: response.status !== 404,
    detail: `status ${response.status}${text ? ` body=${text}` : ""}`,
  })
);

await probe(
  "start onboarding endpoint registrado",
  {
    url: `${webhookBase}/connections/onboarding/session`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clinicId: "probe-clinic", clinicName: "Probe" }),
  },
  (response, text) => ({
    ok: response.status !== 404,
    detail: `status ${response.status}${text ? ` body=${text}` : ""}`,
  })
);

await probe(
  "complete onboarding endpoint registrado",
  {
    url: `${webhookBase}/connections/onboarding/complete`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectionId: "probe-connection",
      state: "probe-state",
      authorizationCode: "probe-code",
    }),
  },
  (response, text) => ({
    ok: response.status !== 404,
    detail: `status ${response.status}${text ? ` body=${text}` : ""}`,
  })
);

const failed = results.filter(result => !result.ok);

console.log(`Probe do WhatsApp via n8n (${target})`);
console.log("");
for (const result of results) {
  const label = result.skipped ? "SKIP" : result.ok ? "OK  " : "FAIL";
  console.log(`${label} ${result.name}: ${result.detail}`);
}

if (failed.length) {
  process.exitCode = 1;
}
