import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import pino from "pino";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { MetaCrypto } from "./meta/MetaCrypto.js";
import { MetaGraphClient } from "./meta/MetaGraphClient.js";
import { MetaWebhookVerifier } from "./meta/MetaWebhookVerifier.js";
import { N8nWebhookClient } from "./n8n/N8nWebhookClient.js";
import { TeamRepository } from "./supabase/TeamRepository.js";
import {
  WhatsAppRepository,
  type WhatsAppConnectionRow,
} from "./supabase/WhatsAppRepository.js";
import { WhatsAppCloudService } from "./whatsapp/WhatsAppCloudService.js";

const logger = pino({ level: config.logLevel });

const repository = new WhatsAppRepository({
  supabaseUrl: config.supabaseUrl,
  supabaseServiceRoleKey: config.supabaseServiceRoleKey,
});
const teamRepository = new TeamRepository({
  supabaseUrl: config.supabaseUrl,
  supabaseServiceRoleKey: config.supabaseServiceRoleKey,
  logger: logger.child({ scope: "team-service" }),
});
const n8nWebhookClient = config.n8nMessageWebhookUrl
  ? new N8nWebhookClient(
      config.n8nMessageWebhookUrl,
      config.n8nMessageWebhookTimeoutMs,
      config.n8nMessageWebhookSecret
    )
  : null;
const graphClient = new MetaGraphClient(
  config.metaGraphVersion,
  config.metaAppId,
  config.metaAppSecret
);
const webhookVerifier = new MetaWebhookVerifier(config.metaWebhookAppSecret);
const crypto = config.whatsappTokenEncryptionKey
  ? new MetaCrypto(config.whatsappTokenEncryptionKey)
  : null;
const manager = new WhatsAppCloudService(
  repository,
  graphClient,
  webhookVerifier,
  logger.child({ scope: "whatsapp-cloud-api" }),
  n8nWebhookClient,
  crypto
);

function withCorsHeaders(headers: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Hub-Signature-256, X-Hub-Signature",
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

function sendText(
  response: ServerResponse,
  statusCode: number,
  payload: string
) {
  response.writeHead(
    statusCode,
    withCorsHeaders({
      "Content-Type": "text/plain; charset=utf-8",
    })
  );
  response.end(payload);
}

function sendNoContent(response: ServerResponse) {
  response.writeHead(204, withCorsHeaders());
  response.end();
}

function serializeConnection(connection: WhatsAppConnectionRow) {
  return manager.serializeConnection(connection);
}

async function readRawBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody<T>(request: IncomingMessage) {
  const raw = await readRawBody(request);
  if (!raw.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
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

  return teamRepository.authenticateAccessToken(accessToken);
}

async function ensureConnectionForClinic(userId: string, clinicId: string) {
  await repository.ensureClinicManageAccess(userId, clinicId);
  return (
    (await repository.getConnectionByClinicId(clinicId)) ||
    (await manager.createConnection(clinicId))
  );
}

async function handleMetaWebhookRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  url: URL
) {
  if (pathname !== "/whatsapp/meta/webhook") {
    return false;
  }

  if (request.method === "GET") {
    const challenge = manager.verifyWebhookHandshake(url.searchParams);
    sendText(response, 200, challenge);
    return true;
  }

  if (request.method === "POST") {
    const rawBody = await readRawBody(request);
    let payload: Record<string, unknown>;

    try {
      payload = rawBody.trim()
        ? (JSON.parse(rawBody) as Record<string, unknown>)
        : {};
    } catch (error) {
      throw new HttpError(
        400,
        "Payload JSON inválido recebido da Meta.",
        error
      );
    }

    await manager.acceptWebhook(
      rawBody,
      (request.headers["x-hub-signature-256"] ||
        request.headers["x-hub-signature"]) as string | undefined,
      payload as never
    );

    sendJson(response, 200, { received: true });
    return true;
  }

  throw new HttpError(405, "Método não suportado para o webhook da Meta.");
}

async function handleWhatsAppRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  userId: string
) {
  if (request.method === "POST" && pathname === "/whatsapp/connections") {
    const body = await readJsonBody<{ clinicId?: string }>(request);
    const clinicId = String(body.clinicId || "").trim();

    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const connection = await ensureConnectionForClinic(userId, clinicId);
    sendJson(response, 200, serializeConnection(connection));
    return true;
  }

  const byClinicMatch = pathname.match(
    /^\/whatsapp\/connections\/by-clinic\/([^/]+)$/
  );
  if (request.method === "GET" && byClinicMatch) {
    const clinicId = decodeURIComponent(byClinicMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    await repository.ensureClinicAccess(userId, clinicId);
    const connection = await repository.getConnectionByClinicId(clinicId);

    if (!connection) {
      throw new HttpError(
        404,
        "Nenhuma conexão WhatsApp encontrada para esta clínica."
      );
    }

    sendJson(response, 200, serializeConnection(connection));
    return true;
  }

  const statusByClinicMatch = pathname.match(
    /^\/whatsapp\/connections\/by-clinic\/([^/]+)\/status$/
  );
  if (request.method === "GET" && statusByClinicMatch) {
    const clinicId = decodeURIComponent(statusByClinicMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    await repository.ensureClinicAccess(userId, clinicId);
    const connection = await repository.getConnectionByClinicId(clinicId);
    if (!connection) {
      throw new HttpError(
        404,
        "Nenhuma conexão WhatsApp encontrada para esta clínica."
      );
    }

    const refreshed = await manager.getConnectionStatusSnapshot(connection.id);
    if (!refreshed) {
      throw new HttpError(
        404,
        "Nenhuma conexão WhatsApp encontrada para esta clínica."
      );
    }

    sendJson(response, 200, serializeConnection(refreshed));
    return true;
  }

  const statusMatch = pathname.match(
    /^\/whatsapp\/connections\/([^/]+)\/status$/
  );
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

  const onboardingSessionByClinicMatch = pathname.match(
    /^\/whatsapp\/connections\/by-clinic\/([^/]+)\/onboarding\/session$/
  );
  if (request.method === "POST" && onboardingSessionByClinicMatch) {
    const clinicId = decodeURIComponent(
      onboardingSessionByClinicMatch[1] || ""
    ).trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const body = await readJsonBody<{ clinicName?: string | null }>(request);
    const connection = await ensureConnectionForClinic(userId, clinicId);
    const session = await manager.createEmbeddedSignupSession(
      connection,
      body.clinicName ? String(body.clinicName) : null
    );
    sendJson(response, 200, session);
    return true;
  }

  const completeMatch = pathname.match(
    /^\/whatsapp\/connections\/([^/]+)\/onboarding\/complete$/
  );
  if (request.method === "POST" && completeMatch) {
    const connectionId = decodeURIComponent(completeMatch[1] || "").trim();
    const connection = await repository.ensureConnectionManageAccess(
      userId,
      connectionId
    );
    const body = await readJsonBody<{
      state?: string;
      authorizationCode?: string;
      accessToken?: string;
      businessAccountId?: string | null;
      wabaId?: string | null;
      phoneNumberId?: string | null;
      displayPhoneNumber?: string | null;
      verifiedName?: string | null;
      grantedScopes?: string[] | null;
      metadata?: Record<string, unknown> | null;
      tokenExpiresAt?: string | null;
      tokenExpiresInSeconds?: number | null;
    }>(request);

    const completed = await manager.completeEmbeddedSignup(connection, body);
    sendJson(response, 200, serializeConnection(completed));
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
    const updated = await teamRepository.updateClinicPlan(
      clinicId,
      userId,
      String(body.planId || "")
    );
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

  const detailMatch = pathname.match(
    /^\/team\/clinics\/([^/]+)\/members\/([^/]+)$/
  );
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

    const updated = await teamRepository.updateClinicMember(
      clinicId,
      memberId,
      userId,
      {
        fullName: String(body.fullName || ""),
        accessLevel: body.accessLevel,
        areaId: body.areaId ?? null,
        specialties: Array.isArray(body.specialties) ? body.specialties : [],
        licenseCode: body.licenseCode ?? null,
      }
    );

    sendJson(response, 200, { member: updated });
    return true;
  }

  return false;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
) {
  if (!request.url || !request.method) {
    throw new HttpError(400, "Requisição inválida.");
  }

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  const url = new URL(
    request.url,
    config.publicWaOrigin || "http://internal.request.local"
  );
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  const handledWebhook = await handleMetaWebhookRoutes(
    request,
    response,
    pathname,
    url
  );
  if (handledWebhook) return;

  if (!pathname.startsWith("/whatsapp/") && !pathname.startsWith("/team/")) {
    throw new HttpError(404, "Endpoint não encontrado.");
  }

  const user = await authenticate(request);

  if (pathname.startsWith("/whatsapp/")) {
    const handled = await handleWhatsAppRoutes(
      request,
      response,
      pathname,
      user.id
    );
    if (handled) return;
  }

  if (pathname.startsWith("/team/")) {
    const handled = await handleTeamRoutes(
      request,
      response,
      pathname,
      user.id
    );
    if (handled) return;
  }

  throw new HttpError(404, "Endpoint não encontrado.");
}

async function main() {
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
          details: error instanceof HttpError ? error.details : undefined,
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
        environment: config.appEnvironment,
        provider: "meta_cloud_api",
        publicWaOrigin: config.publicWaOrigin || null,
      },
      "WhatsApp Cloud API service listening"
    );

    void manager.bootstrap().catch(error => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to bootstrap Meta Cloud API WhatsApp service"
      );
    });
  });

  if (config.metaHealthcheckIntervalMs > 0) {
    const interval = setInterval(() => {
      void manager.auditActiveConnections().catch(error => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          "Failed to audit active Meta Cloud API connections"
        );
      });
    }, config.metaHealthcheckIntervalMs);
    interval.unref();
  }
}

void main();
