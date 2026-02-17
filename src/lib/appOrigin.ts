function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isAppHostname(hostname: string): boolean {
  return hostname === "app.localhost" || hostname.startsWith("app.");
}

function getAppHostname(hostname: string): string {
  if (hostname === "app.localhost") return hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "app.localhost";
  if (hostname.startsWith("app.")) return hostname;
  return `app.${stripWww(hostname)}`;
}

function getPublicHostname(hostname: string): string {
  if (hostname === "app.localhost") return "localhost";
  if (hostname.startsWith("app.")) return hostname.slice(4);
  return hostname;
}

/**
 * Base URL da aplicação autenticada.
 * O Supabase guarda a sessão por origem; login/signup devem ocorrer no mesmo host
 * para persistência e redirects pós-auth funcionarem.
 */
export function getAppOrigin(): string {
  if (typeof window === "undefined") return "";
  const { protocol, hostname, port } = window.location;
  const appHostname = getAppHostname(hostname);
  return `${protocol}//${appHostname}${port ? `:${port}` : ""}`;
}

export function getPublicOrigin(): string {
  if (typeof window === "undefined") return "";
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
