import { navigateToAppPath } from "@/lib/appOrigin";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

function getParamFromHash(name: string): string | null {
  const raw = (typeof window === "undefined" ? "" : window.location.hash) || "";
  const hash = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get(name);
}

export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          navigateToAppPath("/dashboard");
          return;
        }

        // Fallback: implicit tokens in hash (older flows).
        const access_token = getParamFromHash("access_token");
        const refresh_token = getParamFromHash("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;
          navigateToAppPath("/dashboard");
          return;
        }

        // In some cases, Supabase may already have detected and stored a session.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          navigateToAppPath("/dashboard");
          return;
        }

        if (!cancelled) {
          setError(
            "Link de autenticação inválido ou expirado. Faça login novamente para continuar."
          );
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error("[AuthCallback] error:", e);
        }
        if (!cancelled) {
          setError(
            "Não foi possível validar seu link. Faça login novamente para continuar."
          );
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] flex items-center justify-center px-4 relative overflow-hidden text-center">
      <div className="absolute top-0 -left-10 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-10 w-96 h-96 bg-[#025940]/5 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-[var(--cc-bg-white)] border border-[var(--cc-border)] rounded-3xl p-10 shadow-[0_12px_48px_rgba(2,89,64,0.06)]"
        >
          <div className="w-10 h-10 mx-auto mb-6 rounded-full border-2 border-[var(--cc-tertiary)] border-t-transparent animate-spin" />
          <h1 className="text-2xl font-['Syne'] font-800 text-[var(--cc-primary)] mb-2 tracking-tight">
            Validando seu acesso
          </h1>
          <p className="text-[var(--cc-text-muted)] text-[14px] font-['Space_Grotesk'] opacity-80">
            Só mais um instante…
          </p>

          {error && (
            <div className="mt-6 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-700 text-sm font-['Space_Grotesk']">
              {error}
            </div>
          )}

          {error && (
            <button
              type="button"
              onClick={() => navigateToAppPath("/login")}
              className="mt-6 w-full py-4 rounded-xl cc-btn-primary font-['Syne'] font-700 text-[15px] transition-all shadow-[0_8px_20px_rgba(2,89,64,0.15)] active:scale-[0.98]"
            >
              Ir para login
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
