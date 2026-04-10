import {
  getConfiguredAppOrigin,
  getConfiguredLandingOrigin,
  getFrontendAppEnvironment,
  getOriginHostname,
  isLocalOrigin,
} from "@/lib/runtimeEnvironment";

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function hasAppPrefix(hostname: string): boolean {
  return (
    hostname === "app.localhost" ||
    hostname.startsWith("app.") ||
    hostname.startsWith("app-")
  );
}

function shouldUseConfiguredOrigin(origin: string) {
  if (!origin) return false;
  if (getFrontendAppEnvironment() !== "local") return true;
  return isLocalOrigin(origin);
}

export function isAppHostname(hostname: string): boolean {
  const configuredHostname = getOriginHostname(getConfiguredAppOrigin());
  if (configuredHostname) return hostname === configuredHostname;
  return hasAppPrefix(hostname);
}

function getAppHostname(hostname: string): string {
  const configuredHostname = getOriginHostname(getConfiguredAppOrigin());
  if (configuredHostname && shouldUseConfiguredOrigin(getConfiguredAppOrigin())) {
    return configuredHostname;
  }

  if (hostname === "app.localhost") return hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "app.localhost";
  if (hasAppPrefix(hostname)) return hostname;
  return `app.${stripWww(hostname)}`;
}

function getPublicHostname(hostname: string): string {
  const configuredHostname = getOriginHostname(getConfiguredLandingOrigin());
  if (
    configuredHostname &&
    shouldUseConfiguredOrigin(getConfiguredLandingOrigin())
  ) {
    return configuredHostname;
  }

  if (hostname === "app.localhost") return "localhost";
  if (hostname.startsWith("app.")) return hostname.slice(4);
  if (hostname.startsWith("app-")) return hostname;
  return hostname;
}

/**
 * Base URL da aplicação autenticada.
 * O Supabase guarda a sessão por origem; login/signup devem ocorrer no mesmo host
 * para persistência e redirects pós-auth funcionarem.
 */
export function getAppOrigin(): string {
  const explicitOrigin = getConfiguredAppOrigin();
  if (shouldUseConfiguredOrigin(explicitOrigin)) return explicitOrigin;
  if (typeof window === "undefined") return explicitOrigin;
  const { protocol, hostname, port } = window.location;
  const appHostname = getAppHostname(hostname);
  return `${protocol}//${appHostname}${port ? `:${port}` : ""}`;
}

export function getPublicOrigin(): string {
  const explicitOrigin = getConfiguredLandingOrigin();
  if (shouldUseConfiguredOrigin(explicitOrigin)) return explicitOrigin;
  if (typeof window === "undefined") return explicitOrigin;
  const { protocol, hostname, port } = window.location;
  const publicHostname = getPublicHostname(hostname);
  return `${protocol}//${publicHostname}${port ? `:${port}` : ""}`;
}

/** Redireciona para um path na origem da app (ex.: /dashboard). */
export function navigateToAppPath(path: string) {
  const base = getAppOrigin().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const target = `${base}${p}`;

  // If we're already on the app origin, prefer SPA navigation (no full reload).
  // This avoids UI "flashes" between onboarding steps.
  if (typeof window !== "undefined" && base === window.location.origin) {
    const nextUrl = `${p}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.pushState({}, "", nextUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    return;
  }

  window.location.href = target;
}

export function navigateToPublicPath(path: string) {
  const base = getPublicOrigin().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const target = `${base}${p}`;

  if (typeof window !== "undefined" && base === window.location.origin) {
    const nextUrl = `${p}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.pushState({}, "", nextUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    return;
  }

  window.location.href = target;
}
