import { useAuth } from "@/contexts/AuthContext";
import { getPublicOrigin, navigateToAppPath } from "@/lib/appOrigin";
import cliniccortexLogo from "@/assets/logo.png";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function Signup() {
  const { signUp, user, loading: authLoading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) navigateToAppPath("/dashboard");
  }, [authLoading, user]);

  const CC_CHECKBOX_CLASS =
    "border-[var(--cc-border-mid)] bg-[var(--cc-bg-subtle)] data-[state=checked]:bg-[var(--cc-tertiary)] data-[state=checked]:border-[var(--cc-tertiary)] data-[state=checked]:text-white focus-visible:ring-[#23D996]/30 focus-visible:border-[#23D996] data-[state=checked]:shadow-[0_0_0_6px_rgba(35,217,150,0.14)] data-[state=checked]:scale-[1.03]";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    if (!acceptedTerms) {
      setError("Você precisa concordar com os Termos de Uso e a Política de Privacidade");
      return;
    }

    setLoading(true);

    const { error, session } = await signUp(email, password, {
      fullName: fullName.trim() || undefined,
      termsAcceptedAt: new Date().toISOString(),
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (session) {
      navigateToAppPath("/dashboard");
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] flex items-center justify-center px-4 relative overflow-hidden text-center">
        <div className="absolute top-0 -left-10 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
        <div className="w-full max-w-md relative z-10">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--cc-bg-white)] border border-[var(--cc-border)] rounded-3xl p-10 shadow-[0_12px_48px_rgba(2,89,64,0.06)]"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--cc-bg-subtle)] flex items-center justify-center border border-[var(--cc-border)]">
              <Check className="w-10 h-10 text-[var(--cc-primary)]" strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-['Syne'] font-800 text-[var(--cc-primary)] mb-3 tracking-tight">
              Confirme seu e-mail
            </h2>
            <p className="text-[var(--cc-text-muted)] text-[15px] font-['Space_Grotesk'] opacity-80 mb-8">
              Enviamos um link de confirmação para seu e-mail. Ao confirmar, você será
              redirecionado automaticamente para continuar o onboarding.
            </p>
            <button
              type="button"
              onClick={() => navigateToAppPath("/login")}
              className="w-full py-4 rounded-xl cc-btn-primary font-['Syne'] font-700 text-[15px] transition-all shadow-[0_8px_20px_rgba(2,89,64,0.15)]"
            >
              Ir para login
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 -left-10 w-72 h-72 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-10 w-96 h-96 bg-[#025940]/5 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
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
            Criar conta gratuita
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="signup-fullname" className="block text-[13px] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)] opacity-80 mb-2 uppercase tracking-wider">
                Nome completo
              </label>
              <input
                id="signup-fullname"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-5 py-4 rounded-xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] text-[var(--cc-text-body)] placeholder-[#7AA88D] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 transition-all font-['Space_Grotesk'] text-[15px]"
                placeholder="Como devemos te chamar"
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="block text-[13px] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)] opacity-80 mb-2 uppercase tracking-wider">
                E-mail Profissional
              </label>
              <input
                id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                onInvalid={(e) =>
                  e.currentTarget.setCustomValidity("Informe um e-mail válido.")
                }
                onInput={(e) => e.currentTarget.setCustomValidity("")}
                className="w-full px-5 py-4 rounded-xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] text-[var(--cc-text-body)] placeholder-[#7AA88D] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 transition-all font-['Space_Grotesk'] text-[15px]"
                placeholder="seu@contato.com"
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="block text-[13px] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)] opacity-80 mb-2 uppercase tracking-wider">
                Sua Senha
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 pr-12 rounded-xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] text-[var(--cc-text-body)] placeholder-[#7AA88D] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 transition-all font-['Space_Grotesk'] text-[15px]"
                  placeholder="Mínimo 6 caracteres"
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

            <div>
              <label htmlFor="signup-confirm-password" className="block text-[13px] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)] opacity-80 mb-2 uppercase tracking-wider">
                Repita a Senha
              </label>
              <div className="relative">
                <input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-5 py-4 pr-12 rounded-xl bg-[var(--cc-bg-subtle)] border border-[var(--cc-border)] text-[var(--cc-text-body)] placeholder-[#7AA88D] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 transition-all font-['Space_Grotesk'] text-[15px]"
                  placeholder="Confirmar senha"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] focus:outline-none focus:ring-2 focus:ring-[#23D996]/30 transition"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-0.5">
              <label
                htmlFor="cc-terms"
                className="flex items-start gap-3 cursor-pointer select-none"
              >
                <Checkbox
                  id="cc-terms"
                  checked={acceptedTerms}
                  onCheckedChange={(v) => setAcceptedTerms(v === true)}
                  className={`${CC_CHECKBOX_CLASS} mt-1`}
                />
                <span className="text-[13px] leading-relaxed text-[var(--cc-text-muted)] font-['Space_Grotesk'] opacity-80 transition-colors duration-200 peer-data-[state=checked]:opacity-100 peer-data-[state=checked]:text-[var(--cc-primary)]">
                  Eu li e concordo com os Termos de Uso e Políticas de Privacidade
                </span>
              </label>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm font-['Space_Grotesk'] font-500"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !fullName.trim() ||
                !email.trim() ||
                password.length < 6 ||
                password !== confirmPassword ||
                !acceptedTerms
              }
              className="w-full py-4.5 rounded-xl cc-btn-primary font-['Syne'] font-700 text-[15px] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_8px_20px_rgba(2,89,64,0.15)] active:scale-[0.98]"
            >
              {loading ? "Processando..." : "Começar 14 dias grátis"}
            </button>
          </form>

          <p className="text-center mt-6 text-[14px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk']">
            Já possui acesso?{" "}
            <button
              type="button"
              onClick={() => navigateToAppPath("/login")}
              className="text-[var(--cc-primary)] hover:underline font-700"
            >
              Faça login
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
