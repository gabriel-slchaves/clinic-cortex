import type { JsonValue } from "../../modules/whatsapp/shared.js";

function buildGeminiErrorMessage(
  statusCode: number,
  payload: Record<string, unknown>
) {
  const candidate =
    (typeof payload.error === "object" &&
    payload.error &&
    "message" in payload.error &&
    typeof (payload.error as { message?: unknown }).message === "string"
      ? (payload.error as { message: string }).message
      : null) ||
    (typeof payload.message === "string" ? payload.message : null);

  return candidate || `Gemini request failed with status ${statusCode}.`;
}

export class GeminiClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch
  ) {}

  async generateContent(
    model: string,
    requestPayload: Record<string, JsonValue>
  ) {
    const response = await this.fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      }
    );

    const rawBody = await response.text();
    let parsedBody: Record<string, unknown>;

    try {
      parsedBody = rawBody
        ? (JSON.parse(rawBody) as Record<string, unknown>)
        : {};
    } catch (error) {
      throw new Error(
        `Gemini returned an invalid JSON body: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!response.ok) {
      throw new Error(buildGeminiErrorMessage(response.status, parsedBody));
    }

    return parsedBody;
  }
}
