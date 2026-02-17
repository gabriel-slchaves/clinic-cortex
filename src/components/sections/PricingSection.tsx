/**
 * ClinicCortex PricingSection — Light Mode Premium
 */

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Check, Zap, Star, ArrowRight } from "lucide-react";

const PLANS = [
  {
    name: "Essencial", subtitle: "Para médicos autônomos e consultórios com 1 profissional", price: "R$ 397", period: "/mês",
    description: "Ideal para médicos autônomos e consultórios com 1 profissional. A base tecnológica perfeita para automatizar a gestão e reduzir o no-show.",
    features: ["WhatsApp com IA — agendamento, confirmações e lembretes", "Agenda inteligente com visualização personalizada", "CRM médico (até 500 pacientes)", "Dashboards e relatórios mensais", "1 médico"],
    cta: "Começar com Essencial", highlighted: false, badge: "Individual",
  },
  {
    name: "Professional", subtitle: "Para clínicas que buscam escala e automação total", price: "R$ 697", period: "/mês",
    description: "A solução completa para clínicas de médio porte que precisam de inteligência total, múltiplos acessos e gestão de unidades.",
    features: [
      "WhatsApp com IA — agendamento, confirmações e lembretes",
      "Agenda inteligente com visualização personalizada",
      "CRM médico com pacientes ilimitados",
      "Dashboards e relatórios mensais",
      "Até 5 médicos (+1 login extra para secretária)",
      "Múltiplas unidades",
      "Relatórios por profissional e por unidade"
    ],
    cta: "Começar com Professional", highlighted: true, badge: "Mais Popular",
  },
];

export default function PricingSection() {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true, margin: "-100px" });
  return (
    <section id="pricing" className="relative py-24 lg:py-32 bg-[var(--cc-bg-white)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(35,217,150,0.08),transparent)]" />
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={titleRef} className="text-center mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 mb-4">
            <span className="cc-home-chip px-3 py-1 rounded-full text-xs font-['Space_Grotesk'] font-700 tracking-wider uppercase">
              Planos
            </span>
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.6 }} className="font-['Syne'] font-800 text-3xl sm:text-4xl lg:text-5xl text-[var(--cc-text-primary)] mb-4 tracking-tight">
            Escolha o plano{" "}<span className="cc-gradient-text">ideal para sua clínica</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2, duration: 0.6 }} className="text-base sm:text-lg text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] max-w-xl mx-auto">
            Comece grátis por 14 dias, sem taxas ocultas. <br />
            Cancele quando quiser.
          </motion.p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {PLANS.map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
              className={`relative rounded-2xl p-8 overflow-hidden ${plan.highlighted
                ? "cc-home-contrast border"
                : "cc-home-panel"
                }`}
              style={plan.highlighted ? { boxShadow: "var(--cc-shadow-lg)", borderColor: "var(--cc-public-contrast-border)" } : {}}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--cc-public-contrast-accent)] to-transparent" />
              )}
              {plan.highlighted && (
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgba(35,217,150,0.12),transparent)] pointer-events-none" />
              )}
              <div className="relative z-10">
                {plan.badge && (
                  <div className={`inline-flex items-center gap-1.5 mb-4 px-3 py-1 rounded-full ${
                    plan.highlighted
                      ? "cc-home-contrast-chip"
                      : "cc-home-chip"
                  }`}>
                    <Star className="w-3 h-3 fill-current" />
                    <span className="text-xs font-['Syne'] font-800 tracking-tight">{plan.badge}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  {plan.highlighted ? (
                    <Zap className="w-5 h-5 text-[var(--cc-public-contrast-accent)]" strokeWidth={2} />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-[color:var(--cc-border-mid)] flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-[color:var(--cc-border-mid)]" />
                    </div>
                  )}
                  <h3 className={`font-['Syne'] font-800 text-xl ${plan.highlighted ? "text-[var(--cc-public-contrast-fg)]" : "text-[var(--cc-text-primary)]"}`}>{plan.name}</h3>
                </div>
                <p className={`text-sm font-['Space_Grotesk'] mb-6 ${plan.highlighted ? "text-[var(--cc-public-contrast-muted)]" : "text-[var(--cc-text-muted)] opacity-80"}`}>{plan.subtitle}</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`font-['Syne'] font-800 text-4xl ${plan.highlighted ? "text-[var(--cc-public-contrast-accent)]" : "text-[var(--cc-text-primary)]"}`}>{plan.price}</span>
                  <span className={`font-['Space_Grotesk'] text-sm ${plan.highlighted ? "text-[var(--cc-public-contrast-muted)]" : "text-[var(--cc-text-muted)] opacity-70"}`}>{plan.period}</span>
                </div>
                <p className={`text-sm font-['Space_Grotesk'] leading-relaxed mb-8 ${plan.highlighted ? "text-[var(--cc-public-contrast-muted)]" : "text-[var(--cc-text-muted)]"}`}>{plan.description}</p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-['Syne'] font-700 text-sm mb-8 transition-all duration-300 ${plan.highlighted
                    ? "cc-home-contrast-button"
                    : "cc-btn-primary"
                    }`}
                >
                  {plan.cta}<ArrowRight className="w-4 h-4" />
                </motion.button>
                <div className={`h-px mb-6 ${plan.highlighted ? "bg-[color:var(--cc-public-contrast-border)]" : "cc-section-divider"}`} />
                <ul className="flex flex-col gap-3">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? "text-[var(--cc-public-contrast-accent)]" : "text-[var(--cc-secondary)]"}`} strokeWidth={2.5} />
                      <span className={`text-sm font-['Space_Grotesk'] ${plan.highlighted ? "text-[var(--cc-public-contrast-fg)] opacity-85" : "text-[var(--cc-text-muted)]"}`}>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }} className="text-center text-sm text-[var(--cc-text-muted)] font-['Space_Grotesk'] mt-8">
          Todos os planos incluem 14 dias de teste gratuito. Sem necessidade de cartão de crédito.
        </motion.p>
      </div>
    </section>
  );
}
