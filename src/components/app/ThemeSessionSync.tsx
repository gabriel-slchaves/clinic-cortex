import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { DEFAULT_THEME, readStoredUserTheme, writeStoredUserTheme } from "@/lib/themeStorage";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

function isAuthScreen(pathname: string) {
  return pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth/callback");
}

export default function ThemeSessionSync() {
  const { user, loading } = useAuth();
  const { theme, setTheme, switchable } = useTheme();
  const [location] = useLocation();
  const previousUserIdRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!switchable || !userId) return;
    writeStoredUserTheme(userId, theme);
  }, [switchable, theme, userId]);

  useLayoutEffect(() => {
    if (loading || !switchable || !setTheme) return;

    const previousUserId = previousUserIdRef.current;

    if (userId && userId !== previousUserId) {
      const restoredTheme = readStoredUserTheme(userId) || DEFAULT_THEME;
      if (theme !== restoredTheme) setTheme(restoredTheme);
    }

    if (!userId && previousUserId && theme !== DEFAULT_THEME) {
      setTheme(DEFAULT_THEME);
    }

    previousUserIdRef.current = userId;
  }, [loading, setTheme, switchable, theme, userId]);

  useLayoutEffect(() => {
    if (loading || userId || !switchable || !setTheme) return;
    if (!isAuthScreen(location)) return;
    if (theme !== DEFAULT_THEME) setTheme(DEFAULT_THEME);
  }, [loading, location, setTheme, switchable, theme, userId]);

  return null;
}
