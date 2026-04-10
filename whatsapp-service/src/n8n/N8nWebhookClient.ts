export type N8nIncomingMessagePayload = {
  clinicId: string;
  connectionId: string;
  contactWaId: string;
  providerMessageId: string;
  messageText: string;
  messageType: string | null;
  profileName: string | null;
  receivedAt: string;
};

export type N8nWebhookResponse = {
  replyText?: string | null;
  [key: string]: unknown;
};

export class N8nWebhookError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null = null,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "N8nWebhookError";
  }
}

function normalizeWebhookResponse(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") {
      return { replyText: parsed } satisfies N8nWebhookResponse;
    }

    if (parsed && typeof parsed === "object") {
      return parsed as N8nWebhookResponse;
    }
  } catch {
    return { replyText: trimmed } satisfies N8nWebhookResponse;
  }

  return null;
}

export class N8nWebhookClient {
  constructor(
    private readonly webhookUrl: string,
    private readonly timeoutMs: number,
    private readonly secret?: string
  ) {}

  async requestReply(payload: N8nIncomingMessagePayload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.secret) {
        headers["x-cliniccortex-webhook-secret"] = this.secret;
      }

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new N8nWebhookError(
          `Webhook n8n respondeu com status ${response.status}${raw ? `: ${raw}` : ""}`,
          response.status,
          response.status >= 500
        );
      }

      return normalizeWebhookResponse(raw);
    } catch (error) {
      if (error instanceof N8nWebhookError) throw error;
      if ((error as Error)?.name === "AbortError") {
        throw new N8nWebhookError(
          "Webhook n8n excedeu o tempo limite.",
          null,
          true
        );
      }
      throw new N8nWebhookError(
        error instanceof Error ? error.message : "Falha ao chamar webhook n8n.",
        null,
        true
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
