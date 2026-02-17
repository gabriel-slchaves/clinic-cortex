import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "As variáveis de autenticação do ambiente são obrigatórias. Verifique o arquivo .env."
  );
}

const REMEMBER_KEY = "cc_remember_session";

function shouldRememberSession(): boolean {
  try {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    // Default: remember session unless explicitly turned off.
    return raw !== "0";
  } catch {
    return true;
  }
}

function getAuthStorage(): Storage {
  // When remember is off, keep tokens only for the browser session (no persistence).
  if (typeof window === "undefined") {
    // Fallback for non-browser environments (shouldn't happen in this app).
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    } as unknown as Storage;
  }
  return shouldRememberSession() ? window.localStorage : window.sessionStorage;
}

function getSecondaryAuthStorage(primary: Storage): Storage | null {
  if (typeof window === "undefined") return null;
  return primary === window.localStorage ? window.sessionStorage : window.localStorage;
}

const dynamicStorage = {
  getItem: (key: string) => {
    const primary = getAuthStorage();
    const secondary = getSecondaryAuthStorage(primary);

    try {
      const v = primary.getItem(key);
      if (v != null) return v;
    } catch {}

    try {
      const v = secondary?.getItem(key);
      if (v == null) return null;

      // If the user changed "remember", tokens might still exist in the other storage.
      // - When remember is ON, migrate tokens into localStorage so sessions persist.
      // - When remember is OFF, discard any persisted tokens from localStorage.
      const remember = primary === (typeof window !== "undefined" ? window.localStorage : primary);

      if (remember) {
        try {
          primary.setItem(key, v);
        } catch {}
      }

      try {
        secondary?.removeItem(key);
      } catch {}

      return remember ? v : null;
    } catch {}
    return null;
  },
  setItem: (key: string, value: string) => {
    const primary = getAuthStorage();
    const secondary = getSecondaryAuthStorage(primary);

    try {
      primary.setItem(key, value);
    } catch {}
    // Avoid duplicated/stale tokens when user toggles remember.
    try {
      secondary?.removeItem(key);
    } catch {}
  },
  removeItem: (key: string) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      }
    } catch {}
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: dynamicStorage,
  },
});
