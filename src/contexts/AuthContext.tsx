import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getAppOrigin } from "@/lib/appOrigin";

type MaybeAuthError = {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
};

function getErrorInfo(err: unknown): { message: string; status?: number; code?: string } {
  if (!err || typeof err !== "object") return { message: "" };
  const e = err as MaybeAuthError;
  return {
    message: typeof e.message === "string" ? e.message : "",
    status: typeof e.status === "number" ? e.status : undefined,
    code: typeof e.code === "string" ? e.code : undefined,
  };
}

function translateAuthError(err: unknown): string | null {
  const { message, status, code } = getErrorInfo(err);
  const m = (message || "").toLowerCase();

  // Prefer structured signals over string matching.
  if (status === 429 || code === "over_rate_limit" || code === "rate_limit_exceeded") {
    return "Muitas tentativas. Aguarde de 2 a 5 minutos e tente novamente.";
  }

  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.";
  if (m.includes("user already registered")) return "Este e-mail já está cadastrado. Faça login para continuar.";
  if (m.includes("already registered")) return "Este e-mail já está cadastrado. Faça login para continuar.";
  if (m.includes("password should be at least")) return "A senha deve ter pelo menos 6 caracteres.";
  if (m.includes("signup is disabled")) return "Cadastros estão temporariamente desativados. Tente novamente mais tarde.";
  if (m.includes("email address") && m.includes("invalid")) return "Informe um e-mail válido.";
  if (m.includes("network") || m.includes("failed to fetch")) return "Não foi possível conectar. Tente novamente em instantes.";

  return null;
}

function toPortugueseError(err: unknown, fallback: string): Error {
  const translated = translateAuthError(err);
  return new Error(translated || fallback);
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    options?: { fullName?: string; whatsappE164?: string; termsAcceptedAt?: string }
  ) => Promise<{ error: Error | null; session: Session | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Recupera sessão existente ao carregar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escuta mudanças de autenticação (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      options?: { fullName?: string; whatsappE164?: string; termsAcceptedAt?: string }
    ) => {
      try {
        if (!email?.trim() || !password) {
          return { error: new Error("Preencha e-mail e senha para continuar."), session: null };
        }
        if (!options?.termsAcceptedAt?.trim()) {
          return { error: new Error("Você precisa aceitar os Termos de Uso e a Política de Privacidade."), session: null };
        }

        const displayName =
          options?.fullName?.trim() ||
          email.split("@")[0] ||
          "Usuário";

        const whatsappE164 = options?.whatsappE164?.trim();
        const termsAcceptedAt = options?.termsAcceptedAt?.trim();
        const base = getAppOrigin().replace(/\/$/, "");
        const emailRedirectTo = base ? `${base}/auth/callback` : undefined;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            data: {
              full_name: displayName,
              ...(whatsappE164 ? { whatsapp_e164: whatsappE164 } : {}),
              ...(termsAcceptedAt ? { terms_accepted_at: termsAcceptedAt } : {}),
            },
          },
        });

        if (error) {
          if (import.meta.env.DEV) {
            const info = getErrorInfo(error);
            console.warn("[Auth] signUp error:", info, error);
          }
          return { error: toPortugueseError(error, "Não foi possível criar sua conta. Tente novamente."), session: null };
        }
        return {
          error: null,
          session: data.session ?? null,
        };
      } catch (e: unknown) {
        if (import.meta.env.DEV) {
          console.error("Signup error:", e);
        }
        return {
          error: toPortugueseError(
            e,
            "Não foi possível conectar. Tente novamente em instantes."
          ),
          session: null,
        };
      }
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      if (!email?.trim() || !password) {
        return { error: new Error("Preencha e-mail e senha para continuar.") };
      }
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        if (import.meta.env.DEV) {
          const info = getErrorInfo(error);
          console.warn("[Auth] signIn error:", info, error);
        }
        return { error: toPortugueseError(error, "Não foi possível fazer login. Verifique seus dados.") };
      }
      return { error: null };
    } catch (e: any) {
      if (import.meta.env.DEV) {
        console.error("Auth error:", e);
      }
      return {
        error: toPortugueseError(
          e,
          "Não foi possível conectar. Tente novamente em instantes."
        ),
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, signUp, signIn, signOut }),
    [user, session, loading, signUp, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
