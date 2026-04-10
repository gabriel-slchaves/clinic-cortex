import {
  getConfiguredInternalServiceOrigin,
  getFrontendAppEnvironment,
  isLocalOrigin,
} from "@/lib/runtimeEnvironment";

function shouldUseConfiguredInternalOrigin(origin: string) {
  if (!origin) return false;
  if (getFrontendAppEnvironment() !== "local") return true;
  return isLocalOrigin(origin);
}

function getExplicitInternalServiceOrigin() {
  return getConfiguredInternalServiceOrigin();
}

function deriveInternalServiceOriginFromWindow() {
  if (typeof window === "undefined") return "";

  const { protocol, hostname } = window.location;

  if (hostname === "app.localhost") {
    return "http://localhost:3001";
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return "";
  }

  if (hostname.startsWith("app.")) {
    return `${protocol}//wa.${hostname.slice(4)}`;
  }

  if (hostname.startsWith("app-")) {
    return `${protocol}//wa-${hostname.slice(4)}`;
  }

  return "";
}

function getInternalServiceOrigin() {
  const explicitOrigin = getExplicitInternalServiceOrigin();
  if (shouldUseConfiguredInternalOrigin(explicitOrigin)) {
    return explicitOrigin;
  }

  return deriveInternalServiceOriginFromWindow();
}

export function getInternalServiceUrl(
  service: "whatsapp" | "team",
  path: string
) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const origin = getInternalServiceOrigin();

  if (origin) {
    return `${origin}/${service}${normalizedPath}`;
  }

  return `/api/${service}${normalizedPath}`;
}
