/**
 * ClinicCortex EcosystemSection — Light Mode Premium
 */

import { motion, useInView } from "framer-motion";
import { useRef, Suspense, lazy } from "react";
import { Users, Calendar, BarChart3, Zap, MessageSquare, ArrowRight } from "lucide-react";

const EcosystemOrbit = lazy(() => import("../three/EcosystemOrbit"));

const ECOSYSTEM_NODES = [
  { icon: Users, title: "CRM Médico", description: "Gestão completa do relacionamento com pacientes. Histórico, funil e segmentação inteligente.", color: "#01523A" },
  { icon: Calendar, title: "Agenda", description: "Agendamento automatizado com confirmações e lembretes via WhatsApp.", color: "#118C5F" },
  { icon: BarChart3, title: "Analytics", description: "Dashboards e relatórios em tempo real. Tome decisões baseadas em dados.", color: "#01523A" },
  { icon: Zap, title: "Automação", description: "Fluxos automáticos que eliminam tarefas manuais e reduzem erros operacionais.", color: "#118C5F" },
  { icon: MessageSquare, title: "Comunicação", description: "WhatsApp, SMS e e-mail integrados. Comunicação omnichannel com pacientes.", color: "#01523A" },
];

export default function EcosystemSection() {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true, margin: "-100px" });
  return (
    <section id="ecosystem" className="relative py-24 lg:py-32 bg-[var(--cc-bg-base)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(35,217,150,0.07),transparent)]" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={titleRef} className="text-center mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 mb-4">
            <span className="cc-home-chip px-3 py-1 rounded-full text-xs font-['Space_Grotesk'] font-700 tracking-wider uppercase">
              Ecossistema
            </span>
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.6 }} className="font-['Syne'] font-800 text-3xl sm:text-4xl lg:text-5xl text-[var(--cc-text-primary)] mb-4 tracking-tight">
            Um ecossistema{" "}<span className="cc-gradient-text">completo e integrado</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2, duration: 0.6 }} className="text-base sm:text-lg text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] max-w-2xl mx-auto leading-relaxed">
            O ClinicCortex não é apenas um software. É um sistema operacional completo onde todos os módulos se comunicam e potencializam uns aos outros.
          </motion.p>
        </div>
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }} className="relative">
            <div className="relative aspect-square max-w-[300px] sm:max-w-[480px] mx-auto">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(35,217,150,0.12)_0%,transparent_70%)]" />
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-24 h-24 rounded-full border-2 border-[color:var(--cc-border-accent)] animate-spin border-t-[var(--cc-secondary)]" /></div>}>
                <EcosystemOrbit />
              </Suspense>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="font-['Syne'] font-800 text-xs sm:text-sm text-[var(--cc-text-primary)]">ClinicCortex</div>
                  <div className="text-[10px] sm:text-xs text-[var(--cc-secondary)] font-['Space_Grotesk'] mt-0.5">Core</div>
                </div>
              </div>
              <div className="absolute inset-0 opacity-10 mix-blend-multiply pointer-events-none" style={{ backgroundImage: `url(https://d2xsxph8kpxj0f.cloudfront.net/310519663409840608/CW5XuVQnNoaYUVjyRygXLP/ecosystem-network-V2LW2Bs98QDb4icTkJjE3r.webp)`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: "50%" }} />
            </div>
          </motion.div>
          <div className="flex flex-col gap-4">
            {ECOSYSTEM_NODES.map((node, i) => {
              const Icon = node.icon;
              return (
                <motion.div key={i} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: i * 0.1, duration: 0.5 }} className="cc-card rounded-xl p-4 flex items-start gap-4 group">
                  <div className="cc-home-icon-box w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-[var(--cc-text-on-primary)]" strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-['Syne'] font-700 text-sm text-[var(--cc-text-primary)] mb-1 group-hover:text-[var(--cc-secondary)] transition-colors">
                      {node.title}
                    </h3>
                    <p className="text-xs text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] leading-relaxed">
                      {node.description}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--cc-text-muted)] group-hover:text-[var(--cc-secondary)] transition-colors flex-shrink-0 mt-0.5" />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
