export type FrontendAppEnvironment = "local" | "homolog" | "production";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeOrigin(value: string | undefined) {
  const source = String(value || "").trim();
  if (!source) return "";

  try {
    return trimTrailingSlash(new URL(source).origin);
  } catch {
    return "";
  }
}

export function getFrontendAppEnvironment(): FrontendAppEnvironment {
  const raw = String(import.meta.env.VITE_APP_ENV || "")
    .trim()
    .toLowerCase();

  if (raw === "local" || raw === "homolog" || raw === "production") {
    return raw;
  }

  return import.meta.env.DEV ? "local" : "production";
}

export function getConfiguredAppOrigin() {
  return normalizeOrigin(import.meta.env.VITE_PUBLIC_APP_ORIGIN);
}

export function getConfiguredLandingOrigin() {
  return normalizeOrigin(import.meta.env.VITE_PUBLIC_LANDING_ORIGIN);
}

export function getConfiguredInternalServiceOrigin() {
  return normalizeOrigin(import.meta.env.VITE_INTERNAL_SERVICE_ORIGIN);
}

export function getOriginHostname(origin: string) {
  if (!origin) return "";

  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

export function isLocalOrigin(origin: string) {
  const hostname = getOriginHostname(origin);
  return !!hostname && isLocalHostname(hostname);
}

