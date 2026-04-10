import { createHmac, timingSafeEqual } from "node:crypto";

export class MetaWebhookVerifier {
  constructor(private readonly appSecret?: string) {}

  hasSecret() {
    return Boolean(this.appSecret);
  }

  verify(rawBody: string, signatureHeader: string | undefined) {
    if (!this.appSecret || !signatureHeader) return false;
    const expected = `sha256=${createHmac("sha256", this.appSecret).update(rawBody, "utf8").digest("hex")}`;
    const actualBuffer = Buffer.from(signatureHeader, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
