import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import pino from "pino";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { TeamRepository } from "./supabase/TeamRepository.js";

const logger = pino({ level: config.logLevel });

const repository = new TeamRepository({
  supabaseUrl: config.supabaseUrl,
  supabaseServiceRoleKey: config.supabaseServiceRoleKey,
  logger: logger.child({ scope: "team-service" }),
});

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

function sendText(response: ServerResponse, statusCode: number, body: string) {
  response.writeHead(
    statusCode,
    withCorsHeaders({
      "Content-Type": "text/plain; charset=utf-8",
    })
  );
  response.end(body);
}

function sendNoContent(response: ServerResponse) {
  response.writeHead(204, withCorsHeaders());
  response.end();
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
  if (!raw.trim()) return {} as T;

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

  return repository.authenticateAccessToken(accessToken);
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

    const payload = await repository.listAvailablePlans(clinicId, userId);
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
    const updated = await repository.updateClinicPlan(
      clinicId,
      userId,
      String(body.planId || "")
    );

    sendJson(response, 200, updated);
    return true;
  }

  const membersMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/members$/);
  if (request.method === "GET" && membersMatch) {
    const clinicId = decodeURIComponent(membersMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const payload = await repository.listClinicMembers(clinicId, userId);
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "POST" && membersMatch) {
    const clinicId = decodeURIComponent(membersMatch[1] || "").trim();
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

    const created = await repository.createClinicMember(clinicId, userId, {
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

    const updated = await repository.updateClinicMember(
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

async function handleInternalAuthResolve(
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readJsonBody<{
    clinicId?: string | null;
    requireManage?: boolean;
  }>(request);

  try {
    const user = await authenticate(request);
    const clinicId = String(body.clinicId || "").trim() || null;

    if (!clinicId) {
      sendJson(response, 200, {
        ok: true,
        userId: user.id,
      });
      return true;
    }

    const membership = body.requireManage
      ? await repository.ensureClinicPlanAccess(user.id, clinicId)
      : await repository.ensureClinicAccess(user.id, clinicId);

    sendJson(response, 200, {
      ok: true,
      userId: user.id,
      clinicId,
      membership,
    });
    return true;
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message =
      error instanceof HttpError
        ? error.message
        : "Não foi possível validar a sessão interna.";

    sendJson(response, 200, {
      ok: false,
      statusCode,
      error: message,
    });
    return true;
  }
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

  const url = new URL(request.url, "http://internal.request.local");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && pathname === "/whatsapp/meta/webhook") {
    const mode = String(url.searchParams.get("hub.mode") || "").trim();
    const token = String(url.searchParams.get("hub.verify_token") || "").trim();
    const challenge = String(url.searchParams.get("hub.challenge") || "").trim();

    if (mode !== "subscribe" || !challenge) {
      sendText(response, 400, "Parâmetros de verificação inválidos.");
      return;
    }

    if (!config.metaWebhookVerifyToken || token !== config.metaWebhookVerifyToken) {
      sendText(response, 403, "Webhook da Meta não autorizado.");
      return;
    }

    sendText(response, 200, challenge);
    return;
  }

  if (request.method === "POST" && pathname === "/team/internal/auth/resolve") {
    await handleInternalAuthResolve(request, response);
    return;
  }

  if (!pathname.startsWith("/team/")) {
    throw new HttpError(404, "Endpoint não encontrado.");
  }

  const user = await authenticate(request);
  const handled = await handleTeamRoutes(request, response, pathname, user.id);
  if (handled) return;

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
        "Team service request failed"
      );

      sendJson(response, statusCode, {
        error: message,
      });
    }
  });

  server.listen(config.port, () => {
    logger.info(
      { port: config.port },
      "Clinic team service listening"
    );
  });
}

void main();
