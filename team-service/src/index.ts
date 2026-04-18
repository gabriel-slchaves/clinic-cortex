import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import pino from "pino";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import {
  readJsonBody,
  readRawBody,
  sendJson,
  sendNoContent,
  sendText,
} from "./http/responses.js";
import { resolveClinicAccess } from "./modules/auth/clinicAccess.js";
import {
  createWhatsAppService,
  extractSignatureHeader,
} from "./modules/whatsapp/service.js";
import { TeamRepository } from "./supabase/TeamRepository.js";
import { WhatsAppRepository } from "./supabase/WhatsAppRepository.js";

const logger = pino({ level: config.logLevel });

const teamRepository = new TeamRepository({
  supabaseUrl: config.supabaseUrl,
  supabaseServiceRoleKey: config.supabaseServiceRoleKey,
  logger: logger.child({ scope: "team-service" }),
});

const whatsappRepository = new WhatsAppRepository({
  supabaseUrl: config.supabaseUrl,
  supabaseServiceRoleKey: config.supabaseServiceRoleKey,
});

const whatsappService = createWhatsAppService({
  repository: whatsappRepository,
  teamRepository,
  logger: logger.child({ scope: "whatsapp" }),
});

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

  const membersMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/members$/);
  if (request.method === "GET" && membersMatch) {
    const clinicId = decodeURIComponent(membersMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const payload = await teamRepository.listClinicMembers(clinicId, userId);
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

async function handleInternalAuthResolve(
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readJsonBody<{
    clinicId?: string | null;
    requireManage?: boolean;
  }>(request);

  try {
    const access = await resolveClinicAccess(teamRepository, {
      authorizationHeader: request.headers.authorization,
      clinicId: body.clinicId ?? null,
      requireManage: body.requireManage,
    });

    sendJson(response, 200, access);
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

async function handleWhatsAppRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  url: URL
) {
  if (
    request.method === "POST" &&
    pathname === "/whatsapp/connections/onboarding/session"
  ) {
    const body = await readJsonBody<{
      clinicId?: string | null;
      clinicName?: string | null;
    }>(request);
    const payload = await whatsappService.startOnboardingSession({
      authorizationHeader: request.headers.authorization,
      clinicId: body.clinicId ?? null,
      clinicName: body.clinicName ?? null,
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "GET" && pathname === "/whatsapp/connections/status") {
    const payload = await whatsappService.getConnectionStatus({
      authorizationHeader: request.headers.authorization,
      clinicId: url.searchParams.get("clinicId"),
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (
    request.method === "POST" &&
    pathname === "/whatsapp/connections/onboarding/complete"
  ) {
    const body = await readJsonBody<{
      connectionId?: string | null;
      state?: string | null;
      authorizationCode?: string | null;
      accessToken?: string | null;
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

    const payload = await whatsappService.completeOnboarding({
      authorizationHeader: request.headers.authorization,
      ...body,
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "GET" && pathname === "/whatsapp/meta/webhook") {
    const challenge = whatsappService.verifyWebhookHandshake(url.searchParams);
    sendText(response, 200, challenge);
    return true;
  }

  if (request.method === "POST" && pathname === "/whatsapp/meta/webhook") {
    const rawBody = await readRawBody(request);
    const payload = await whatsappService.ingestWebhook(
      rawBody,
      extractSignatureHeader(request.headers)
    );
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "POST" && pathname === "/whatsapp/_drain") {
    const payload = await whatsappService.drainWebhookQueue({
      authorizationHeader: request.headers.authorization,
      batchSize: Number(url.searchParams.get("batchSize") || 0) || null,
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "POST" && pathname === "/whatsapp/agent/_drain") {
    const payload = await whatsappService.drainConversationQueue({
      authorizationHeader: request.headers.authorization,
      batchSize: Number(url.searchParams.get("batchSize") || 0) || null,
    });
    sendJson(response, 200, payload);
    return true;
  }

  if (request.method === "POST" && pathname === "/whatsapp/messages/send") {
    const body = await readJsonBody<{
      sourceMessageId?: string | null;
      originJobId?: string | null;
      agentRunId?: string | null;
      text?: string | null;
    }>(request);
    const payload = await whatsappService.sendMessage({
      authorizationHeader: request.headers.authorization,
      ...body,
    });
    sendJson(response, 200, { ok: true, message: payload });
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

  const url = new URL(request.url, "http://internal.request.local");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "team-service",
      whatsapp: {
        workersEnabled: config.whatsappEnableWorkers,
        agentEnabled: config.whatsappEnableAgent,
      },
    });
    return;
  }

  if (request.method === "POST" && pathname === "/team/internal/auth/resolve") {
    await handleInternalAuthResolve(request, response);
    return;
  }

  if (pathname.startsWith("/whatsapp/")) {
    const handled = await handleWhatsAppRoutes(request, response, pathname, url);
    if (handled) return;
    throw new HttpError(404, "Endpoint não encontrado.");
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
        statusCode,
      });
    }
  });

  server.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        environment: config.appEnvironment,
        publicWaOrigin: config.publicWaOrigin || null,
        whatsappWorkersEnabled: config.whatsappEnableWorkers,
        whatsappAgentEnabled: config.whatsappEnableAgent,
      },
      "Clinic team service listening"
    );
  });
}

void main();
