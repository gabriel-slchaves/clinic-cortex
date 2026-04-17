import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const target = (process.argv[2] || "local").trim();

const containerByTarget = {
  local: "cliniccortex-n8n-dev",
  homolog: "cliniccortex-n8n-hml",
  production: "cliniccortex-n8n-prod",
};

const container = containerByTarget[target];
if (!container) {
  console.error(
    `Ambiente inválido: "${target}". Use local, homolog ou production.`
  );
  process.exit(1);
}

const workflowFile = resolve("workflow.json");
const generatorFile = resolve("scripts", "generate-whatsapp-n8n-workflow.mjs");

if (!existsSync(generatorFile)) {
  console.error(`Gerador não encontrado em ${generatorFile}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    stdio: "inherit",
    cwd: resolve("."),
    ...options,
  });
}

function capture(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      cwd: resolve("."),
      ...options,
    }).trim();
  } catch (error) {
    const stderr = String(error?.stderr || "").trim();
    const message = stderr || (error instanceof Error ? error.message : String(error));
    console.error(`Falha ao executar ${command} ${args.join(" ")}.`);
    console.error(message);
    process.exit(1);
  }
}

function tryCapture(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      cwd: resolve("."),
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function ensureContainerRunning(name) {
  const state = capture("docker", [
    "inspect",
    "-f",
    "{{.State.Running}}",
    name,
  ]);

  if (state !== "true") {
    console.error(
      `O container ${name} não está em execução. Suba o stack antes de sincronizar o workflow.`
    );
    process.exit(1);
  }
}

function waitForN8nHealth(name) {
  const attempts = 40;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const body = tryCapture("docker", [
      "exec",
      name,
      "wget",
      "-qO-",
      "http://127.0.0.1:5678/healthz",
    ]);

    if (body.includes('"status":"ok"')) {
      return;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }

  console.error(
    `O n8n no container ${name} não respondeu ao healthcheck após reiniciar.`
  );
  process.exit(1);
}

function waitForWorkflowWebhooks(name) {
  const attempts = 40;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const output = tryCapture("docker", [
      "exec",
      name,
      "sh",
      "-lc",
      "wget -S -O- 'http://127.0.0.1:5678/webhook/whatsapp/connections/status?clinicId=sync-probe' 2>&1 || true",
    ]);

    if (
      output.includes("Token de sessão não informado") ||
      output.includes("HTTP/1.1 401")
    ) {
      return;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }

  console.error(
    `Os webhooks do workflow ${name} não ficaram disponíveis após reiniciar o n8n.`
  );
  process.exit(1);
}

run("node", [generatorFile]);

const workflow = JSON.parse(readFileSync(workflowFile, "utf8"));
const workflowId = String(workflow.id || "").trim();
if (!workflowId) {
  console.error("workflow.json não contém um id estável.");
  process.exit(1);
}

ensureContainerRunning(container);

const remoteFile = "/tmp/cliniccortex-whatsapp-workflow.json";

run("docker", ["cp", workflowFile, `${container}:${remoteFile}`]);
run("docker", ["exec", container, "n8n", "import:workflow", `--input=${remoteFile}`]);
run("docker", [
  "exec",
  container,
  "n8n",
  "publish:workflow",
  `--id=${workflowId}`,
]);
run("docker", [
  "exec",
  container,
  "n8n",
  "update:workflow",
  `--id=${workflowId}`,
  "--active=true",
]);
run("docker", ["restart", container]);
waitForN8nHealth(container);
waitForWorkflowWebhooks(container);

console.log("");
console.log(
  `Workflow ${workflowId} sincronizado no container ${container}.`
);
console.log(
  "Próximo passo: rode o probe do ambiente para validar os endpoints registrados."
);
