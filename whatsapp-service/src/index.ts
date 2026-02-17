import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import pino from "pino";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { N8nWebhookClient } from "./n8n/N8nWebhookClient.js";
import { FileSystemSessionStore } from "./session/FileSystemSessionStore.js";
import { TeamRepository } from "./supabase/TeamRepository.js";
import { WhatsAppRepository } from "./supabase/WhatsAppRepository.js";
import { WhatsAppConnectionManager } from "./whatsapp/WhatsAppConnectionManager.js";

const logger = pino({ level: config.logLevel });

const repository = new WhatsAppRepository({
  supabaseUrl: config.supabaseUrl,
  supabaseServiceRoleKey: config.supabaseServiceRoleKey,
});
const teamRepository = new TeamRepository({
  supabaseUrl: config.supabaseUrl,
  supabaseServiceRoleKey: config.supabaseServiceRoleKey,
});

const sessionStore = new FileSystemSessionStore(config.sessionRoot);
const n8nWebhookClient = config.n8nMessageWebhookUrl
  ? new N8nWebhookClient(
      config.n8nMessageWebhookUrl,
      config.n8nMessageWebhookTimeoutMs,
      config.n8nMessageWebhookSecret
    )
  : null;
const manager = new WhatsAppConnectionManager(
  repository,
  sessionStore,
  logger.child({ scope: "whatsapp-connector" }),
  n8nWebhookClient
);

let shuttingDownFromFatalError = false;

function registerProcessSafetyHandlers() {
  process.on("uncaughtException", (error) => {
    void manager
      .handleFatalProcessError(error)
      .then((handled) => {
        if (handled) {
          logger.error(
            { error: error instanceof Error ? error.message : String(error) },
            "Recovered WhatsApp connector from fatal Baileys session error"
          );
          return;
        }

        logger.fatal(
          { error: error instanceof Error ? error.message : String(error) },
          "Uncaught exception crashed the WhatsApp connector"
        );
        if (!shuttingDownFromFatalError) {
          shuttingDownFromFatalError = true;
          process.exit(1);
        }
      })
      .catch((handlerError) => {
        logger.fatal(
          {
            error: error instanceof Error ? error.message : String(error),
            handlerError: handlerError instanceof Error ? handlerError.message : String(handlerError),
          },
          "Fatal exception handler failed in the WhatsApp connector"
        );
        if (!shuttingDownFromFatalError) {
          shuttingDownFromFatalError = true;
          process.exit(1);
        }
      });
  });

  process.on("unhandledRejection", (reason) => {
    void manager
      .handleFatalProcessError(reason)
      .then((handled) => {
        if (handled) {
          logger.error(
            { error: reason instanceof Error ? reason.message : String(reason) },
            "Recovered WhatsApp connector from fatal rejected Baileys session error"
          );
          return;
        }

        logger.fatal(
          { error: reason instanceof Error ? reason.message : String(reason) },
          "Unhandled promise rejection crashed the WhatsApp connector"
        );
        if (!shuttingDownFromFatalError) {
          shuttingDownFromFatalError = true;
          process.exit(1);
        }
      })
      .catch((handlerError) => {
        logger.fatal(
          {
            error: reason instanceof Error ? reason.message : String(reason),
            handlerError: handlerError instanceof Error ? handlerError.message : String(handlerError),
          },
          "Fatal rejection handler failed in the WhatsApp connector"
        );
        if (!shuttingDownFromFatalError) {
          shuttingDownFromFatalError = true;
          process.exit(1);
        }
      });
  });
}

type ConnectionResponse = {
  connectionId: string;
  clinicId: string;
  status: "idle" | "creating" | "qr_pending" | "connected" | "error";
  connectedAt: string | null;
  lastError: string | null;
  phoneNumber?: string | null;
  lastSeenAt?: string | null;
  manualActionRequired?: boolean;
  isRecovering?: boolean;
  recoveryAttemptCount?: number;
  nextRetryAt?: string | null;
  lastEventCode?: string | null;
  lastEventMessage?: string | null;
  cooldownUntil?: string | null;
  pairingBlocked?: boolean;
  reconnectMode?: "connected" | "recover" | "pairing_qr" | "cooldown" | "manual_action";
  manualActionRequiredReason?: string | null;
};

function deriveReconnectMode(connection: {
  status: "idle" | "creating" | "qr_pending" | "connected" | "error";
  manual_action_required?: boolean;
  is_recovering?: boolean;
  next_retry_at?: string | null;
  last_event_code?: string | null;
  last_error?: string | null;
}) {
  const eventCode = String(connection.last_event_code || "");
  const lastError = String(connection.last_error || "").toLowerCase();
  const pairingBlocked = Boolean(
    (connection.next_retry_at && eventCode.startsWith("whatsapp_pairing_")) ||
      lastError.includes("bloqueou temporariamente novas conexões") ||
      lastError.includes("bloqueou temporariamente novos dispositivos")
  );
  if (connection.status === "connected") return "connected" as const;
  if (pairingBlocked) return "cooldown" as const;
  if (connection.is_recovering || connection.status === "creating") return "recover" as const;
  if (connection.status === "qr_pending") return "pairing_qr" as const;
  if (connection.manual_action_required) return "manual_action" as const;
  return "manual_action" as const;
}

function withCorsHeaders(headers: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    ...headers,
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
) {
  response.writeHead(
    statusCode,
    withCorsHeaders({
      "Content-Type": "application/json; charset=utf-8",
    })
  );
  response.end(JSON.stringify(payload));
}

function sendNoContent(response: ServerResponse) {
  response.writeHead(204, withCorsHeaders());
  response.end();
}

function serializeConnection(connection: {
  id: string;
  clinic_id: string;
  status: "idle" | "creating" | "qr_pending" | "connected" | "error";
  connected_at: string | null;
  last_error: string | null;
  phone_number?: string | null;
  last_seen_at?: string | null;
  manual_action_required?: boolean;
  is_recovering?: boolean;
  recovery_attempt_count?: number;
  next_retry_at?: string | null;
  last_event_code?: string | null;
  last_event_message?: string | null;
}) {
  const eventCode = connection.last_event_code || null;
  const lastError = String(connection.last_error || "").toLowerCase();
  const pairingBlocked = Boolean(
    (connection.next_retry_at && String(eventCode || "").startsWith("whatsapp_pairing_")) ||
      lastError.includes("bloqueou temporariamente novas conexões") ||
      lastError.includes("bloqueou temporariamente novos dispositivos")
  );
  return {
    connectionId: connection.id,
    clinicId: connection.clinic_id,
    status: connection.status,
    connectedAt: connection.connected_at,
    lastError: connection.last_error,
    phoneNumber: connection.phone_number || null,
    lastSeenAt: connection.last_seen_at || null,
    manualActionRequired: Boolean(connection.manual_action_required),
    isRecovering: Boolean(connection.is_recovering),
    recoveryAttemptCount: Number(connection.recovery_attempt_count || 0),
    nextRetryAt: connection.next_retry_at || null,
    lastEventCode: connection.last_event_code || null,
    lastEventMessage: connection.last_event_message || null,
    cooldownUntil: pairingBlocked ? connection.next_retry_at || null : null,
    pairingBlocked,
    reconnectMode: deriveReconnectMode(connection),
    manualActionRequiredReason: Boolean(connection.manual_action_required) ? eventCode : null,
  } satisfies ConnectionResponse;
}

function serializeQr(connection: {
  id: string;
  clinic_id: string;
  status: "idle" | "creating" | "qr_pending" | "connected" | "error";
  connected_at: string | null;
  last_error: string | null;
  qr_code: string | null;
}) {
  return {
    ...serializeConnection(connection),
    qrCode: connection.qr_code,
  };
}

async function readJsonBody<T>(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {} as T;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch (error) {
    throw new HttpError(400, "Corpo JSON inválido.", error);
  }
}

async function authenticate(request: IncomingMessage) {
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "Token de sessão não informado.");
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) {
    throw new HttpError(401, "Token de sessão não informado.");
  }

  return repository.authenticateAccessToken(accessToken);
}

async function handleWhatsAppRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  userId: string
) {
  async function startManagedConnection(connectionId: string) {
    const refreshed = await manager.startConnection(connectionId);
    sendJson(response, 200, serializeConnection(refreshed));
    return true;
  }

  const pathSegments = pathname.split("/").filter(Boolean);
  const isByClinicPath =
    pathSegments[0] === "whatsapp" &&
    pathSegments[1] === "connections" &&
    pathSegments[2] === "by-clinic" &&
    pathSegments.length >= 4;

  if (request.method === "POST" && pathname === "/whatsapp/connections") {
    const body = await readJsonBody<{ clinicId?: string }>(request);
    const clinicId = body.clinicId?.trim();

    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    await repository.ensureClinicManageAccess(userId, clinicId);
    const connection = await manager.createConnection(clinicId);
    sendJson(response, 200, serializeConnection(connection));
    return true;
  }

  const byClinicMatch = pathname.match(/^\/whatsapp\/connections\/by-clinic\/([^/]+)$/);
  if (request.method === "GET" && (byClinicMatch || (isByClinicPath && pathSegments.length === 4))) {
    const clinicId = decodeURIComponent((byClinicMatch?.[1] || pathSegments[3] || "")).trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    await repository.ensureClinicAccess(userId, clinicId);
    const connection = await repository.getConnectionByClinicId(clinicId);

    if (!connection) {
      throw new HttpError(404, "Nenhuma conexão WhatsApp encontrada para esta clínica.");
    }

    sendJson(response, 200, serializeConnection(connection));
    return true;
  }

  const startMatch = pathname.match(/^\/whatsapp\/connections\/([^/]+)\/start$/);
  if (request.method === "POST" && startMatch) {
    const connectionId = decodeURIComponent(startMatch[1] || "").trim();
    const connection = await repository.ensureConnectionManageAccess(userId, connectionId);
    return startManagedConnection(connection.id);
  }

  const startByClinicMatch = pathname.match(/^\/whatsapp\/connections\/by-clinic\/([^/]+)\/start$/);
  if (
    request.method === "POST" &&
    (startByClinicMatch || (isByClinicPath && pathSegments.length === 5 && pathSegments[4] === "start"))
  ) {
    const clinicId = decodeURIComponent((startByClinicMatch?.[1] || pathSegments[3] || "")).trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    await repository.ensureClinicManageAccess(userId, clinicId);
    const connection =
      (await repository.getConnectionByClinicId(clinicId)) || (await manager.createConnection(clinicId));
    return startManagedConnection(connection.id);
  }

  const qrByClinicMatch = pathname.match(/^\/whatsapp\/connections\/by-clinic\/([^/]+)\/qr$/);
  if (
    request.method === "GET" &&
    (qrByClinicMatch || (isByClinicPath && pathSegments.length === 5 && pathSegments[4] === "qr"))
  ) {
    const clinicId = decodeURIComponent((qrByClinicMatch?.[1] || pathSegments[3] || "")).trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    await repository.ensureClinicAccess(userId, clinicId);
    const connection = await repository.getConnectionByClinicId(clinicId);
    if (!connection) {
      throw new HttpError(404, "Nenhuma conexão WhatsApp encontrada para esta clínica.");
    }

    sendJson(response, 200, serializeQr(connection));
    return true;
  }

  const statusByClinicMatch = pathname.match(/^\/whatsapp\/connections\/by-clinic\/([^/]+)\/status$/);
  if (
    request.method === "GET" &&
    (statusByClinicMatch || (isByClinicPath && pathSegments.length === 5 && pathSegments[4] === "status"))
  ) {
    const clinicId = decodeURIComponent((statusByClinicMatch?.[1] || pathSegments[3] || "")).trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    await repository.ensureClinicAccess(userId, clinicId);
    const connection = await repository.getConnectionByClinicId(clinicId);
    if (!connection) {
      throw new HttpError(404, "Nenhuma conexão WhatsApp encontrada para esta clínica.");
    }

    const reconciled = await manager.getConnectionStatusSnapshot(connection.id);
    if (!reconciled) {
      throw new HttpError(404, "Nenhuma conexão WhatsApp encontrada para esta clínica.");
    }

    sendJson(response, 200, serializeConnection(reconciled));
    return true;
  }

  const qrMatch = pathname.match(/^\/whatsapp\/connections\/([^/]+)\/qr$/);
  if (request.method === "GET" && qrMatch) {
    const connectionId = decodeURIComponent(qrMatch[1] || "").trim();
    const connection = await repository.ensureConnectionAccess(userId, connectionId);
    sendJson(response, 200, serializeQr(connection));
    return true;
  }

  const statusMatch = pathname.match(/^\/whatsapp\/connections\/([^/]+)\/status$/);
  if (request.method === "GET" && statusMatch) {
    const connectionId = decodeURIComponent(statusMatch[1] || "").trim();
    await repository.ensureConnectionAccess(userId, connectionId);
    const connection = await manager.getConnectionStatusSnapshot(connectionId);
    if (!connection) {
      throw new HttpError(404, "Conexão WhatsApp não encontrada.");
    }

    sendJson(response, 200, serializeConnection(connection));
    return true;
  }

  return false;
}

async function handleTeamRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  userId: string
) {
  const plansMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/plans$/);
  if (request.method === "GET" && plansMatch) {
    const clinicId = decodeURIComponent(plansMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const payload = await teamRepository.listAvailablePlans(clinicId, userId);
    sendJson(response, 200, payload);
    return true;
  }

  const activePlanMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/plan$/);
  if (request.method === "PATCH" && activePlanMatch) {
    const clinicId = decodeURIComponent(activePlanMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const body = await readJsonBody<{ planId?: string }>(request);
    const updated = await teamRepository.updateClinicPlan(clinicId, userId, String(body.planId || ""));
    sendJson(response, 200, updated);
    return true;
  }

  const listMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/members$/);
  if (request.method === "GET" && listMatch) {
    const clinicId = decodeURIComponent(listMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const payload = await teamRepository.listClinicMembers(clinicId, userId);
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "POST" && listMatch) {
    const clinicId = decodeURIComponent(listMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const body = await readJsonBody<{
      fullName?: string;
      email?: string;
      accessLevel?: "doctor_admin" | "doctor" | "secretary";
      areaId?: string | null;
      specialties?: string[];
      licenseCode?: string | null;
    }>(request);

    const created = await teamRepository.createClinicMember(clinicId, userId, {
      fullName: String(body.fullName || ""),
      email: String(body.email || ""),
      accessLevel: body.accessLevel || "doctor",
      areaId: body.areaId ?? null,
      specialties: Array.isArray(body.specialties) ? body.specialties : [],
      licenseCode: body.licenseCode ?? null,
    });

    sendJson(response, 200, { member: created });
    return true;
  }

  const detailMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/members\/([^/]+)$/);
  if (request.method === "PATCH" && detailMatch) {
    const clinicId = decodeURIComponent(detailMatch[1] || "").trim();
    const memberId = decodeURIComponent(detailMatch[2] || "").trim();
    if (!clinicId || !memberId) {
      throw new HttpError(400, "clinicId e memberId são obrigatórios.");
    }

    const body = await readJsonBody<{
      fullName?: string;
      accessLevel?: "owner" | "doctor_admin" | "doctor" | "secretary";
      areaId?: string | null;
      specialties?: string[];
      licenseCode?: string | null;
    }>(request);

    const updated = await teamRepository.updateClinicMember(clinicId, memberId, userId, {
      fullName: String(body.fullName || ""),
      accessLevel: body.accessLevel,
      areaId: body.areaId ?? null,
      specialties: Array.isArray(body.specialties) ? body.specialties : [],
      licenseCode: body.licenseCode ?? null,
    });

    sendJson(response, 200, { member: updated });
    return true;
  }

  return false;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  if (!request.url || !request.method) {
    throw new HttpError(400, "Requisição inválida.");
  }

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (!pathname.startsWith("/whatsapp/") && !pathname.startsWith("/team/")) {
    throw new HttpError(404, "Endpoint não encontrado.");
  }

  const user = await authenticate(request);

  if (pathname.startsWith("/whatsapp/")) {
    const handled = await handleWhatsAppRoutes(request, response, pathname, user.id);
    if (handled) return;
  }

  if (pathname.startsWith("/team/")) {
    const handled = await handleTeamRoutes(request, response, pathname, user.id);
    if (handled) return;
  }

  throw new HttpError(404, "Endpoint não encontrado.");
}

async function main() {
  await sessionStore.ensureRoot();
  registerProcessSafetyHandlers();
  const capabilities = await repository.initializeSchemaCapabilities();
  for (const warning of repository.consumeCapabilityWarnings()) {
    logger.warn(
      {
        capability: warning.capability,
        reason: warning.reason,
        capabilities,
      },
      "WhatsApp persistence feature disabled by schema mismatch"
    );
  }

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : "Não foi possível processar a requisição do serviço interno.";

      logger.error(
        {
          statusCode,
          error: error instanceof Error ? error.message : String(error),
          path: request.url,
          method: request.method,
        },
        "Service request failed"
      );

      sendJson(response, statusCode, {
        error: message,
      });
    }
  });

  server.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        sessionRoot: config.sessionRoot,
      },
      "WhatsApp connector listening"
    );

    void manager.bootstrap().catch((error) => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to bootstrap WhatsApp connections"
      );
    });
  });
}

void main();
