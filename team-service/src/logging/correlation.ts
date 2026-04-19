import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

function normalizeHeaderValue(value: string | string[] | undefined) {
  const source = Array.isArray(value) ? value[0] : value;
  const normalized = String(source || "").trim();
  return normalized || null;
}

export type RequestCorrelation = {
  requestId: string;
  method: string;
  path: string;
};

export function createRequestCorrelation(
  request: IncomingMessage,
  pathname: string
): RequestCorrelation {
  const requestId =
    normalizeHeaderValue(request.headers["x-request-id"]) ||
    normalizeHeaderValue(request.headers["x-correlation-id"]) ||
    randomUUID();

  return {
    requestId,
    method: String(request.method || "UNKNOWN"),
    path: pathname,
  };
}
