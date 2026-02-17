/**
 * ClinicCortex ProblemSection — Light Mode Premium
 */

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  CalendarX2, BellOff, BarChart2, Puzzle, Layers, TrendingDown,
} from "lucide-react";

const PROBLEMS = [
  { icon: CalendarX2, title: "Agenda Desorganizada", description: "Horários conflitantes, duplos agendamentos e cancelamentos de última hora causam caos operacional e perda de receita." },
  { icon: BellOff, title: "Pacientes Esquecendo Consultas", description: "Sem lembretes automáticos, o no-show chega a 30%. Cada falta representa receita perdida e agenda desperdiçada." },
  { icon: BarChart2, title: "Falta de Dados Estratégicos", description: "Decisões baseadas em intuição ao invés de dados reais. Sem analytics, é impossível escalar com inteligência." },
  { icon: Puzzle, title: "Gestão Fragmentada", description: "Prontuário em um sistema, agenda em outro, financeiro em planilha. A fragmentação custa tempo e gera erros." },
  { icon: Layers, title: "Ferramentas Separadas", description: "Múltiplas assinaturas, múltiplos logins, múltiplos treinamentos. Complexidade que drena energia da equipe." },
  { icon: TrendingDown, title: "Crescimento Estagnado", description: "Sem automação e sem dados, a clínica fica presa em operação manual. Impossível escalar sem a tecnologia certa." },
];

function ProblemCard({ problem, index }: { problem: (typeof PROBLEMS)[0]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const Icon = problem.icon;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.08, duration: 0.6 }}
      className="cc-card rounded-2xl p-6 group relative overflow-hidden"
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_50%_0%,rgba(1,82,58,0.04),transparent_60%)]" />
      <div className="relative z-10">
        <div className="cc-home-icon-box w-10 h-10 rounded-xl flex items-center justify-center mb-4">
          <Icon className="w-5 h-5 text-[var(--cc-text-on-primary)]" strokeWidth={2} />
        </div>
        <h3 className="font-['Syne'] font-700 text-base text-[var(--cc-text-primary)] mb-2">{problem.title}</h3>
        <p className="text-sm text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] leading-relaxed">
          {problem.description}
        </p>
      </div>
    </motion.div>
  );
}

export default function ProblemSection() {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true, margin: "-100px" });
  return (
    <section id="audience" className="relative py-24 lg:py-32 bg-[var(--cc-bg-white)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_100%,rgba(35,217,150,0.06),transparent)]" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={titleRef} className="text-center mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 mb-4">
            <span className="cc-home-chip px-3 py-1 rounded-full text-xs font-['Space_Grotesk'] font-700 tracking-wider uppercase">
              O Problema
            </span>
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.6 }} className="font-['Syne'] font-800 text-3xl sm:text-4xl lg:text-5xl text-[var(--cc-text-primary)] mb-4 tracking-tight">
            Por que clínicas perdem{" "}
            <span className="cc-gradient-text">dinheiro e pacientes</span>
            <br />todos os dias?
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2, duration: 0.6 }} className="text-base sm:text-lg text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] max-w-2xl mx-auto leading-relaxed">
            Da primeira mensagem no WhatsApp até o retorno do paciente: veja onde sua clínica pode estar perdendo oportunidades todos os dias.
          </motion.p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {PROBLEMS.map((problem, i) => <ProblemCard key={i} problem={problem} index={i} />)}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }} className="text-center mt-12">
          <p className="text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] text-sm">
            O ClinicCortex resolve todos esses problemas em uma única plataforma.
          </p>
          <div className="cc-section-divider mt-8" />
        </motion.div>
      </div>
    </section>
  );
}
