import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError } from "../errors.js";

export function withCorsHeaders(headers: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Hub-Signature-256, X-Hub-Signature",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    ...headers,
  };
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  response.writeHead(
    statusCode,
    withCorsHeaders({
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    })
  );
  response.end(JSON.stringify(payload));
}

export function sendText(
  response: ServerResponse,
  statusCode: number,
  body: string,
  headers: Record<string, string> = {}
) {
  response.writeHead(
    statusCode,
    withCorsHeaders({
      "Content-Type": "text/plain; charset=utf-8",
      ...headers,
    })
  );
  response.end(body);
}

export function sendNoContent(
  response: ServerResponse,
  headers: Record<string, string> = {}
) {
  response.writeHead(204, withCorsHeaders(headers));
  response.end();
}

export async function readRawBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonBody<T>(request: IncomingMessage) {
  const raw = await readRawBody(request);
  if (!raw.trim()) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new HttpError(400, "Corpo JSON inválido.", error);
  }
}
