/**
 * ClinicCortex FeaturesSection — Light Mode Premium
 */

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Users, Calendar, BarChart3, BellRing, LayoutDashboard, MessageSquare, Brain, Shield } from "lucide-react";

const FEATURES = [
  { icon: Users, title: "CRM Médico Inteligente", description: "Gestão completa de pacientes com histórico clínico, funil de atendimento e segmentação inteligente. Limite de 500 pacientes no plano Essencial.", badge: "Core" },
  { icon: Calendar, title: "Agenda Inteligente", description: "Agenda automatizada com visualização personalizada. Confirmações, lembretes e reagendamentos inteligentes via WhatsApp.", badge: "Automação" },
  { icon: BarChart3, title: "Analytics de Pacientes", description: "Insights profundos sobre retenção, frequência e comportamento. Relatórios por profissional e unidade no plano Professional.", badge: "IA" },
  { icon: BellRing, title: "Automação de Consultas", description: "Confirmações automáticas e redução drástica de no-show. Sistema envia lembretes estratégicos via IA nos momentos ideais.", badge: "Automação" },
  { icon: LayoutDashboard, title: "Dashboard Operacional", description: "Controle total da clínica em um único painel. Métricas em tempo real e visão 360° da sua operação.", badge: "Gestão" },
  { icon: MessageSquare, title: "WhatsApp com IA", description: "Agendamento, confirmações e lembretes automáticos via IA no WhatsApp. Comunicação fluída sem intervenção externa.", badge: "Integração" },
  { icon: Brain, title: "IA Preditiva", description: "Algoritmos de machine learning que preveem cancelamentos e sugerem ações proativas para manter a agenda cheia.", badge: "IA" },
  { icon: Shield, title: "Segurança & Compliance", description: "Dados protegidos com criptografia de ponta a ponta. Conformidade total com LGPD e normas do CRM/CFM.", badge: "Segurança" },
];

const BADGE_COLORS: Record<string, string> = {
  Core:       "bg-[var(--cc-bg-subtle)] text-[var(--cc-primary)] border-[color:var(--cc-border-mid)]",
  Automação:  "bg-[var(--cc-accent-soft)] text-[var(--cc-secondary)] border-[color:var(--cc-border-accent)]",
  IA:         "bg-[var(--cc-bg-subtle)] text-[var(--cc-primary)] border-[color:var(--cc-border-accent)]",
  Gestão:     "bg-[var(--cc-bg-subtle)] text-[var(--cc-primary)] border-[color:var(--cc-border-mid)]",
  Integração: "bg-[var(--cc-bg-subtle)] text-[var(--cc-primary)] border-[color:var(--cc-border-accent)]",
  Segurança:  "bg-[rgba(239,68,68,0.07)] text-[#dc2626] border-[rgba(239,68,68,0.16)]",
};

function FeatureCard({ feature, index }: { feature: (typeof FEATURES)[0]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const Icon = feature.icon;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.07, duration: 0.6 }}
      className="cc-card relative rounded-2xl p-6 group overflow-hidden transition-all duration-300"
      style={{ borderTop: "3px solid var(--cc-primary)" }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--cc-tertiary)] to-transparent" />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_50%_0%,rgba(1,82,58,0.03),transparent_60%)]" />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            className="cc-home-icon-box w-11 h-11 rounded-xl flex items-center justify-center"
          >
            <Icon className="w-5 h-5 text-[var(--cc-text-on-primary)]" strokeWidth={2} />
          </motion.div>
          <span className={`text-[10px] font-['Space_Grotesk'] font-700 px-2 py-0.5 rounded-full border uppercase tracking-wider ${BADGE_COLORS[feature.badge] || BADGE_COLORS["Core"]}`}>
            {feature.badge}
          </span>
        </div>
        <h3 className="font-['Syne'] font-700 text-base text-[var(--cc-text-primary)] mb-2 group-hover:text-[var(--cc-secondary)] transition-colors duration-300">
          {feature.title}
        </h3>
        <p className="text-sm text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] leading-relaxed">
          {feature.description}
        </p>
        <motion.div initial={{ opacity: 0, x: -10 }} whileHover={{ opacity: 1, x: 0 }} className="mt-4 flex items-center gap-1 text-xs text-[var(--cc-secondary)] font-['Space_Grotesk'] font-700">
          Saiba mais →
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function FeaturesSection() {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true, margin: "-100px" });
  return (
    <section id="features" className="relative py-24 lg:py-32 bg-[var(--cc-bg-base)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(35,217,150,0.07),transparent)]" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={titleRef} className="text-center mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 mb-4">
            <span className="cc-home-chip px-3 py-1 rounded-full text-xs font-['Space_Grotesk'] font-700 tracking-wider uppercase">
              Funcionalidades
            </span>
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.6 }} className="font-['Syne'] font-800 text-3xl sm:text-4xl lg:text-5xl text-[var(--cc-text-primary)] mb-4 tracking-tight">
            Tudo que sua clínica precisa{" "}<span className="cc-gradient-text">em um único lugar</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2, duration: 0.6 }} className="text-base sm:text-lg text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] max-w-2xl mx-auto leading-relaxed">
            Uma plataforma completa para transformar a gestão da sua clínica com organização, automação e inteligência operacional.
          </motion.p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {FEATURES.map((feature, i) => <FeatureCard key={i} feature={feature} index={i} />)}
        </div>
      </div>
    </section>
  );
}
