import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readJsonBody,
  readRawBody,
  sendJson,
  sendText,
} from "../../http/responses.js";
import { parseBatchSize } from "../../http/routing.js";
import {
  extractSignatureHeader,
  WhatsAppService,
} from "./service.js";

export async function handleWhatsAppRoutes(args: {
  request: IncomingMessage;
  response: ServerResponse;
  pathname: string;
  url: URL;
  service: WhatsAppService;
}) {
  const { request, response, pathname, url, service } = args;

  if (
    request.method === "POST" &&
    pathname === "/whatsapp/connections/onboarding/session"
  ) {
    const body = await readJsonBody<{
      clinicId?: string | null;
      clinicName?: string | null;
    }>(request);
    sendJson(
      response,
      200,
      await service.startOnboardingSession({
        authorizationHeader: request.headers.authorization,
        clinicId: body.clinicId ?? null,
        clinicName: body.clinicName ?? null,
      })
    );
    return true;
  }

  if (request.method === "GET" && pathname === "/whatsapp/connections/status") {
    sendJson(
      response,
      200,
      await service.getConnectionStatus({
        authorizationHeader: request.headers.authorization,
        clinicId: url.searchParams.get("clinicId"),
      })
    );
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

    sendJson(
      response,
      200,
      await service.completeOnboarding({
        authorizationHeader: request.headers.authorization,
        ...body,
      })
    );
    return true;
  }

  if (request.method === "GET" && pathname === "/whatsapp/meta/webhook") {
    sendText(response, 200, service.verifyWebhookHandshake(url.searchParams));
    return true;
  }

  if (request.method === "POST" && pathname === "/whatsapp/meta/webhook") {
    const rawBody = await readRawBody(request);
    sendJson(
      response,
      200,
      await service.ingestWebhook(
        rawBody,
        extractSignatureHeader(request.headers)
      )
    );
    return true;
  }

  if (request.method === "POST" && pathname === "/whatsapp/_drain") {
    sendJson(
      response,
      200,
      await service.drainWebhookQueue({
        authorizationHeader: request.headers.authorization,
        batchSize: parseBatchSize(url.searchParams, 0) || null,
      })
    );
    return true;
  }

  if (request.method === "POST" && pathname === "/whatsapp/agent/_drain") {
    sendJson(
      response,
      200,
      await service.drainConversationQueue({
        authorizationHeader: request.headers.authorization,
        batchSize: parseBatchSize(url.searchParams, 0) || null,
      })
    );
    return true;
  }

  if (request.method === "POST" && pathname === "/whatsapp/messages/send") {
    const body = await readJsonBody<{
      sourceMessageId?: string | null;
      originJobId?: string | null;
      agentRunId?: string | null;
      text?: string | null;
    }>(request);
    sendJson(response, 200, {
      ok: true,
      message: await service.sendMessage({
        authorizationHeader: request.headers.authorization,
        ...body,
      }),
    });
    return true;
  }

  return false;
}
