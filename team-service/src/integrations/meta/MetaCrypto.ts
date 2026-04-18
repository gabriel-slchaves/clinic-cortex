import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function toKeyBuffer(secret: string) {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY is required.");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    return createHash("sha256").update(trimmed, "utf8").digest();
  }

  return createHash("sha256").update(trimmed, "utf8").digest();
}

export class MetaCrypto {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = toKeyBuffer(secret);
  }

  encrypt(plainText: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  decrypt(payload: string) {
    const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
    if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
      throw new Error("Encrypted WhatsApp credential payload is invalid.");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }
}
