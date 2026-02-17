/**
 * ClinicCortex CTASection — Dark premium block (intentional contrast in light mode page)
 */

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Zap } from "lucide-react";

export default function CTASection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="cta" className="cc-home-contrast relative py-24 lg:py-40 overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url(https://d2xsxph8kpxj0f.cloudfront.net/310519663409840608/CW5XuVQnNoaYUVjyRygXLP/cta-bg-n4LJwyTSNsCnHyHmjMPVcW.webp)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, var(--cc-public-contrast-bg), color-mix(in srgb, var(--cc-public-contrast-bg) 82%, transparent), var(--cc-public-contrast-bg))",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(35,217,150,0.12),transparent)]" />

      {/* Animated particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-[var(--cc-public-contrast-accent)]"
          style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, opacity: 0.2 + Math.random() * 0.3 }}
          animate={{ y: [0, -30, 0], opacity: [0.15, 0.45, 0.15] }}
          transition={{ duration: 3 + Math.random() * 4, repeat: Infinity, delay: Math.random() * 3 }}
        />
      ))}

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center" ref={ref}>
        {/* Icon */}
        <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={inView ? { opacity: 1, scale: 1 } : {}} transition={{ duration: 0.6 }} className="flex justify-center mb-8">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-2xl blur-xl animate-pulse-glow"
              style={{ background: "color-mix(in srgb, var(--cc-public-contrast-accent) 20%, transparent)" }}
            />
            <div
              className="relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(35,217,150,0.35)]"
              style={{ background: "linear-gradient(135deg, var(--cc-public-contrast-accent), var(--cc-public-contrast-accent-strong))" }}
            >
              <Zap className="w-8 h-8 text-[var(--cc-text-on-primary)]" strokeWidth={2.5} />
            </div>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h2 initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.7 }} className="font-['Syne'] font-800 text-4xl sm:text-5xl lg:text-6xl text-[var(--cc-public-contrast-fg)] mb-6 tracking-tight leading-[1.05]">
          Transforme sua clínica em{" "}
          <span className="text-[var(--cc-public-contrast-accent)]">uma operação inteligente</span>
        </motion.h2>

        {/* Subheadline */}
        <motion.p initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2, duration: 0.6 }} className="text-base sm:text-xl text-[var(--cc-public-contrast-muted)] font-['Space_Grotesk'] mb-10 max-w-2xl mx-auto leading-relaxed">
          Junte-se a centenas de clínicas que já automatizaram sua gestão, reduziram no-show e escalaram seus resultados com o ClinicCortex.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.3, duration: 0.6 }} className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: "0 0 50px rgba(35,217,150,0.50)" }}
            whileTap={{ scale: 0.97 }}
            className="cc-home-contrast-button font-['Syne'] font-700 text-base flex items-center justify-center gap-2 px-8 py-4 rounded-xl transition-all duration-300"
          >
            Começar agora — Grátis por 14 dias
            <ArrowRight className="w-5 h-5" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="cc-home-contrast-outline font-['Syne'] font-600 text-base flex items-center justify-center gap-2 px-8 py-4 rounded-xl transition-all duration-300"
          >
            Falar com especialista
          </motion.button>
        </motion.div>

        {/* Trust indicators */}
        <motion.div initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.5, duration: 0.6 }} className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-[var(--cc-public-contrast-muted)] font-['Space_Grotesk']">
          {["✓ 14 dias grátis", "✓ Sem cartão de crédito", "✓ Cancele quando quiser", "✓ Suporte em português"].map((item, i) => (
            <span key={i} className="flex items-center gap-1">{item}</span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
