import type { IncomingMessage } from "node:http";
import { HttpError } from "../errors.js";

export function createInternalRequestUrl(request: IncomingMessage) {
  if (!request.url || !request.method) {
    throw new HttpError(400, "Requisição inválida.");
  }

  return new URL(request.url, "http://internal.request.local");
}

export function parseBatchSize(
  searchParams: URLSearchParams,
  fallback: number
) {
  const parsed = Number(searchParams.get("batchSize") || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
