import { HttpError } from "../../errors.js";

export type VerificationStatus =
  | "unknown"
  | "pending"
  | "verified"
  | "restricted"
  | "failed";

type AccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type MetaCollection<T> = {
  data?: T[];
};

type MetaBusiness = {
  id: string;
  name?: string;
};

type MetaPhoneNumber = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
  status?: string;
  quality_rating?: string;
};

type MetaSendMessageResponse = {
  messaging_product?: string;
  messages?: Array<{ id?: string }>;
};

export type MetaDiscoveredAssets = {
  businessAccountId: string | null;
  wabaId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  verificationStatus: VerificationStatus;
};

function mapVerificationStatus(
  input: string | null | undefined
): VerificationStatus {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (!value) return "unknown";
  if (value.includes("verified") || value.includes("connected")) {
    return "verified";
  }
  if (value.includes("pending") || value.includes("requested")) {
    return "pending";
  }
  if (
    value.includes("restricted") ||
    value.includes("disabled") ||
    value.includes("rejected")
  ) {
    return "restricted";
  }
  if (value.includes("fail") || value.includes("error")) {
    return "failed";
  }
  return "unknown";
}

export class MetaGraphClient {
  constructor(
    private readonly graphVersion: string,
    private readonly appId?: string,
    private readonly appSecret?: string
  ) {}

  private buildGraphUrl(
    pathname: string,
    query?: Record<string, string | number | boolean | undefined | null>
  ) {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion}${path}`
    );

    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  private async requestJson<T>(url: string, init?: RequestInit) {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      throw new HttpError(
        503,
        "Não foi possível comunicar com a Meta Cloud API.",
        {
          source: "meta_graph_api",
          reason: error instanceof Error ? error.message : String(error),
        }
      );
    }

    const raw = await response.text();
    let payload: Record<string, unknown> | null = null;
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        payload = { raw };
      }
    }

    if (!response.ok) {
      throw new HttpError(
        response.status >= 500 ? 503 : 502,
        "Meta Cloud API rejeitou a requisição.",
        {
          source: "meta_graph_api",
          statusCode: response.status,
          payload,
        }
      );
    }

    return (payload || {}) as T;
  }

  async exchangeCodeForAccessToken(code: string, redirectUri: string) {
    if (!this.appId || !this.appSecret) {
      throw new HttpError(
        503,
        "Configuração da Meta incompleta para concluir o Embedded Signup."
      );
    }

    const url = this.buildGraphUrl("/oauth/access_token", {
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const payload = await this.requestJson<AccessTokenResponse>(url);
    if (!payload.access_token) {
      throw new HttpError(
        502,
        "A Meta não retornou um access token válido para o WhatsApp."
      );
    }

    return {
      accessToken: payload.access_token,
      expiresInSeconds:
        typeof payload.expires_in === "number" &&
        Number.isFinite(payload.expires_in)
          ? payload.expires_in
          : null,
    };
  }

  private async getCollection<T>(
    pathname: string,
    accessToken: string,
    fields?: string
  ) {
    const url = this.buildGraphUrl(pathname, {
      access_token: accessToken,
      fields,
    });
    return this.requestJson<MetaCollection<T>>(url);
  }

  async listBusinesses(accessToken: string) {
    const payload = await this.getCollection<MetaBusiness>(
      "/me/businesses",
      accessToken,
      "id,name"
    );
    return payload.data || [];
  }

  async listWhatsAppBusinessAccounts(businessId: string, accessToken: string) {
    const [owned, client] = await Promise.all([
      this.getCollection<{ id: string; name?: string }>(
        `/${businessId}/owned_whatsapp_business_accounts`,
        accessToken,
        "id,name"
      ).catch(() => ({ data: [] })),
      this.getCollection<{ id: string; name?: string }>(
        `/${businessId}/client_whatsapp_business_accounts`,
        accessToken,
        "id,name"
      ).catch(() => ({ data: [] })),
    ]);

    return [...(owned.data || []), ...(client.data || [])];
  }

  async listPhoneNumbers(wabaId: string, accessToken: string) {
    const payload = await this.getCollection<MetaPhoneNumber>(
      `/${wabaId}/phone_numbers`,
      accessToken,
      "id,display_phone_number,verified_name,code_verification_status,status,quality_rating"
    );
    return payload.data || [];
  }

  async inspectPhoneNumber(phoneNumberId: string, accessToken: string) {
    const url = this.buildGraphUrl(`/${phoneNumberId}`, {
      access_token: accessToken,
      fields:
        "id,display_phone_number,verified_name,code_verification_status,status,quality_rating",
    });
    return this.requestJson<MetaPhoneNumber>(url);
  }

  async subscribeAppToWaba(wabaId: string, accessToken: string) {
    const url = this.buildGraphUrl(`/${wabaId}/subscribed_apps`, {
      access_token: accessToken,
    });

    await this.requestJson<Record<string, unknown>>(url, {
      method: "POST",
    });
  }

  async discoverAssets(
    accessToken: string,
    preferred?: {
      businessAccountId?: string | null;
      wabaId?: string | null;
      phoneNumberId?: string | null;
      displayPhoneNumber?: string | null;
      verifiedName?: string | null;
    }
  ): Promise<MetaDiscoveredAssets> {
    if (preferred?.phoneNumberId) {
      const phone = await this.inspectPhoneNumber(
        preferred.phoneNumberId,
        accessToken
      ).catch(() => null);
      return {
        businessAccountId: preferred.businessAccountId || null,
        wabaId: preferred.wabaId || null,
        phoneNumberId: preferred.phoneNumberId,
        displayPhoneNumber:
          preferred.displayPhoneNumber || phone?.display_phone_number || null,
        verifiedName: preferred.verifiedName || phone?.verified_name || null,
        verificationStatus: mapVerificationStatus(
          phone?.code_verification_status || phone?.status || null
        ),
      };
    }

    const businesses = preferred?.businessAccountId
      ? [{ id: preferred.businessAccountId }]
      : await this.listBusinesses(accessToken);

    for (const business of businesses) {
      const wabas = preferred?.wabaId
        ? [{ id: preferred.wabaId }]
        : await this.listWhatsAppBusinessAccounts(business.id, accessToken);

      for (const waba of wabas) {
        const numbers = await this.listPhoneNumbers(waba.id, accessToken);
        const selected = numbers[0];
        if (!selected?.id) continue;

        return {
          businessAccountId: business.id,
          wabaId: waba.id,
          phoneNumberId: selected.id,
          displayPhoneNumber: selected.display_phone_number || null,
          verifiedName: selected.verified_name || null,
          verificationStatus: mapVerificationStatus(
            selected.code_verification_status || selected.status || null
          ),
        };
      }
    }

    throw new HttpError(
      502,
      "A Meta autorizou o aplicativo, mas nenhum ativo oficial do WhatsApp foi encontrado para esta clínica."
    );
  }

  async sendTextMessage(input: {
    accessToken: string;
    phoneNumberId: string;
    toWaId: string;
    textBody: string;
    replyToProviderMessageId?: string | null;
  }) {
    const url = this.buildGraphUrl(`/${input.phoneNumberId}/messages`);
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.toWaId,
      type: "text",
      text: {
        body: input.textBody,
        preview_url: false,
      },
    };

    if (input.replyToProviderMessageId) {
      body.context = {
        message_id: input.replyToProviderMessageId,
      };
    }

    const payload = await this.requestJson<MetaSendMessageResponse>(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const providerMessageId = payload.messages?.[0]?.id || null;
    if (!providerMessageId) {
      throw new HttpError(
        502,
        "A Meta aceitou o envio, mas não retornou o identificador da mensagem."
      );
    }

    return {
      providerMessageId,
      raw: payload,
    };
  }
}
