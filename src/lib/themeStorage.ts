const THEMES = ["light", "dark", "forest", "emerald"] as const;

export type StoredTheme = (typeof THEMES)[number];

export const DEFAULT_THEME: StoredTheme = "light";
export const ACTIVE_THEME_STORAGE_KEY = "cc_theme";

const USER_THEME_STORAGE_PREFIX = "cc_user_theme:";

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeTheme(value: unknown): StoredTheme | null {
  if (value === "light" || value === "dark" || value === "forest" || value === "emerald") {
    return value;
  }
  return null;
}

export function readStoredActiveTheme(): StoredTheme | null {
  const storage = getStorage();
  if (!storage) return null;
  return normalizeTheme(storage.getItem(ACTIVE_THEME_STORAGE_KEY));
}

export function writeStoredActiveTheme(theme: StoredTheme) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(ACTIVE_THEME_STORAGE_KEY, theme);
}

export function readStoredUserTheme(userId: string | null | undefined): StoredTheme | null {
  if (!userId) return null;
  const storage = getStorage();
  if (!storage) return null;
  return normalizeTheme(storage.getItem(`${USER_THEME_STORAGE_PREFIX}${userId}`));
}

export function writeStoredUserTheme(
  userId: string | null | undefined,
  theme: StoredTheme | null | undefined
) {
  if (!userId) return;

  const normalizedTheme = normalizeTheme(theme);
  if (!normalizedTheme) return;

  const storage = getStorage();
  if (!storage) return;
  storage.setItem(`${USER_THEME_STORAGE_PREFIX}${userId}`, normalizedTheme);
}
