import { useAuth } from "@/contexts/AuthContext";
import { getPublicOrigin, navigateToAppPath } from "@/lib/appOrigin";
import cliniccortexLogo from "@/assets/logo.png";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const REMEMBER_KEY = "cc_remember_session";
const CC_CHECKBOX_CLASS =
  "border-[var(--cc-border-mid)] bg-[var(--cc-bg-subtle)] data-[state=checked]:bg-[var(--cc-tertiary)] data-[state=checked]:border-[var(--cc-tertiary)] data-[state=checked]:text-white focus-visible:ring-[#23D996]/30 focus-visible:border-[#23D996] data-[state=checked]:shadow-[0_0_0_6px_rgba(35,217,150,0.14)] data-[state=checked]:scale-[1.03]";

export default function Login() {
  const { signIn, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(() => {
    try {
      const raw = window.localStorage.getItem(REMEMBER_KEY);
      return raw !== "0";
    } catch {
      return true;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) navigateToAppPath("/dashboard");
  }, [authLoading, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Controls whether Supabase persists the auth session in localStorage (remember)
      // or sessionStorage (do not remember). We never store the password.
      window.localStorage.setItem(REMEMBER_KEY, rememberSession ? "1" : "0");
    } catch {
      // ignore
    }

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigateToAppPath("/dashboard");
    }
  };

  return (
    <div className="h-[100dvh] bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background blobs for visual interest */}
      <div className="absolute top-0 -left-10 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-10 w-96 h-96 bg-[#025940]/5 rounded-full blur-3xl" />
      
      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
          className="bg-[var(--cc-bg-white)] border border-[var(--cc-border)] rounded-3xl p-7 sm:p-8 shadow-[0_10px_40px_rgba(2,89,64,0.05)] relative overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-[var(--cc-primary)]" />
          
          {/* Logo inside card with redirection */}
          <a
            href={getPublicOrigin() || "/"}
            className="flex flex-col items-center cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <img 
              src={cliniccortexLogo}
              alt="ClinicCortex Logo" 
              className="h-32 w-auto object-contain filter drop-shadow-sm"
              loading="eager"
            />
          </a>
          
          <h2 className="text-2xl font-['Syne'] font-800 text-[var(--cc-primary)] mb-6 text-center tracking-tight mt-4">
            Acesse sua conta
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-[13px] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)] opacity-80 mb-2 uppercase tracking-wider">
                E-mail Profissional
              </label>
              <input
                id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                onInvalid={(e) =>
                  e.currentTarget.setCustomValidity("Informe um e-mail válido.")
                }
                onInput={(e) => e.currentTarget.setCustomValidity("")}
                className="w-full px-5 py-4 rounded-xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] text-[var(--cc-text-body)] placeholder-[#7AA88D] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 focus:border-[#025940]/20 transition-all font-['Space_Grotesk'] text-[15px]"
                placeholder="exemplo@clinica.com"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="login-password" className="block text-[13px] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)] opacity-80 uppercase tracking-wider">
                  Senha
                </label>
                <button type="button" className="text-[11px] text-[var(--cc-primary)] hover:underline font-['Space_Grotesk'] font-600">Esqueci a senha</button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 pr-12 rounded-xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] text-[var(--cc-text-body)] placeholder-[#7AA88D] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 focus:border-[#025940]/20 transition-all font-['Space_Grotesk'] text-[15px]"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 transition"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember */}
            <div className="pt-0.5">
              <label
                htmlFor="cc-remember-session"
                className="flex items-center gap-3 select-none cursor-pointer"
              >
                <Checkbox
                  id="cc-remember-session"
                  checked={rememberSession}
                  onCheckedChange={(v) => {
                    const next = v === true;
                    setRememberSession(next);
                    try {
                      // Controls whether Supabase persists the auth session in localStorage (remember)
                      // or sessionStorage (do not remember). We never store the password.
                      window.localStorage.setItem(REMEMBER_KEY, next ? "1" : "0");
                    } catch {
                      // ignore
                    }
                  }}
                  className={CC_CHECKBOX_CLASS}
                />
                <span className="text-[13px] leading-relaxed text-[var(--cc-text-muted)] font-['Space_Grotesk'] opacity-80 transition-colors duration-200 peer-data-[state=checked]:opacity-100 peer-data-[state=checked]:text-[var(--cc-primary)]">
                  Continuar conectado neste dispositivo
                </span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm font-['Space_Grotesk'] font-500"
              >
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full py-4.5 rounded-xl cc-btn-primary font-['Syne'] font-700 text-[15px] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_8px_20px_rgba(2,89,64,0.15)] active:scale-[0.98]"
            >
              {loading ? "Autenticando..." : "Entrar"}
            </button>
          </form>

          {/* Link to signup */}
          <p className="text-center mt-7 text-[14px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk']">
            Novo por aqui?{" "}
            <button
              type="button"
              onClick={() => navigateToAppPath("/signup")}
              className="text-[var(--cc-primary)] hover:underline font-700"
            >
              Crie sua conta gratuita
            </button>
          </p>
        </motion.div>
      </div>

      <p className="absolute bottom-5 left-0 right-0 text-center text-[11px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] uppercase tracking-[0.2em] opacity-40">
        Powered by Sinapse Company
      </p>
    </div>
  );
}
