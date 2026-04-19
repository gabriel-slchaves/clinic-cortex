import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import pino from "pino";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { createInternalRequestUrl } from "./http/routing.js";
import { sendJson, sendNoContent } from "./http/responses.js";
import { createRequestCorrelation } from "./logging/correlation.js";
import { buildServiceHealthPayload } from "./logging/health.js";
import {
  authenticateRequest,
  handleInternalAuthResolveRoute,
} from "./modules/auth/session.js";
import { handleTeamRoutes } from "./modules/team/routes.js";
import { createTeamModuleService } from "./modules/team/service.js";
import { handleWhatsAppRoutes } from "./modules/whatsapp/routes.js";
import { createWhatsAppService } from "./modules/whatsapp/service.js";
import { TeamRepository } from "./repositories/supabase/TeamRepository.js";
import { WhatsAppRepository } from "./repositories/supabase/WhatsAppRepository.js";

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

const teamService = createTeamModuleService({
  repository: teamRepository,
});

const whatsappService = createWhatsAppService({
  repository: whatsappRepository,
  teamRepository,
  logger: logger.child({ scope: "whatsapp" }),
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
) {
  const url = createInternalRequestUrl(request);
  const pathname = url.pathname;
  const correlation = createRequestCorrelation(request, pathname);

  response.setHeader("X-Request-Id", correlation.requestId);
  response.setHeader("X-Backend-Service", "team-service");

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, buildServiceHealthPayload());
    return;
  }

  if (request.method === "POST" && pathname === "/team/internal/auth/resolve") {
    await handleInternalAuthResolveRoute({
      repository: teamRepository,
      request,
      response,
    });
    return;
  }

  if (pathname.startsWith("/whatsapp/")) {
    const handled = await handleWhatsAppRoutes({
      request,
      response,
      pathname,
      url,
      service: whatsappService,
    });

    if (handled) return;
    throw new HttpError(404, "Endpoint não encontrado.");
  }

  if (!pathname.startsWith("/team/")) {
    throw new HttpError(404, "Endpoint não encontrado.");
  }

  const user = await authenticateRequest(teamRepository, request);
  const handled = await handleTeamRoutes({
    request,
    response,
    pathname,
    userId: user.id,
    service: teamService,
  });

  if (handled) return;
  throw new HttpError(404, "Endpoint não encontrado.");
}

async function main() {
  const server = createServer(async (request, response) => {
    const pathname = request.url
      ? new URL(request.url, "http://internal.request.local").pathname
      : "/unknown";
    const correlation = createRequestCorrelation(request, pathname);
    const requestLogger = logger.child(correlation);

    try {
      await handleRequest(request, response);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : "Não foi possível processar a requisição do serviço interno.";

      requestLogger.error(
        {
          statusCode,
          error: error instanceof Error ? error.message : String(error),
          details: error instanceof HttpError ? error.details : undefined,
          path: request.url,
          method: request.method,
        },
        "Integrated backend request failed"
      );

      response.setHeader("X-Request-Id", correlation.requestId);
      sendJson(response, statusCode, {
        error: message,
        statusCode,
        requestId: correlation.requestId,
      });
    }
  });

  server.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        environment: config.appEnvironment,
        role: "integrated-backend",
      },
      "Team service listening"
    );
  });
}

void main();
