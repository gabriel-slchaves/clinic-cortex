import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError } from "../../errors.js";
import { readJsonBody, sendJson } from "../../http/responses.js";
import { TeamRepository } from "../../repositories/supabase/TeamRepository.js";
import {
  extractBearerAccessToken,
  resolveClinicAccess,
} from "./clinicAccess.js";

export async function authenticateRequest(
  repository: TeamRepository,
  request: IncomingMessage
) {
  const accessToken = extractBearerAccessToken(request.headers.authorization);
  return repository.authenticateAccessToken(accessToken);
}

export async function handleInternalAuthResolveRoute(args: {
  repository: TeamRepository;
  request: IncomingMessage;
  response: ServerResponse;
}) {
  const body = await readJsonBody<{
    clinicId?: string | null;
    requireManage?: boolean;
  }>(args.request);

  try {
    const access = await resolveClinicAccess(args.repository, {
      authorizationHeader: args.request.headers.authorization,
      clinicId: body.clinicId ?? null,
      requireManage: body.requireManage,
    });

    sendJson(args.response, 200, access);
    return true;
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message =
      error instanceof HttpError
        ? error.message
        : "Não foi possível validar a sessão interna.";

    sendJson(args.response, 200, {
      ok: false,
      statusCode,
      error: message,
    });
    return true;
  }
}
