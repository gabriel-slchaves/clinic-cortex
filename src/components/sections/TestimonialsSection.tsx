/**
 * ClinicCortex TestimonialsSection — Light Mode Premium
 */

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Quote } from "lucide-react";

const TESTIMONIALS = [
  { name: "Dra. Juliana Mendes", role: "Dermatologista", clinic: "Clínica Mendes Dermatologia", text: "Vivia preocupada com pacientes que agendavam e não apareciam. Com os lembretes automáticos do ClinicCortex, isso acabou! Minha secretária tem tempo para se dedicar a outros atendimentos.", rating: 5, avatar: "JM" },
  { name: "Dr. André Souza", role: "Cardiologista", clinic: "Instituto Cardio Souza", text: "Gerenciar pacientes por mensagens lidas e não lidas era realmente um caos. Com o CRM do ClinicCortex, tenho visão completa do funil de atendimento. Nunca mais perdi um paciente por falta de follow-up.", rating: 5, avatar: "AS" },
  { name: "Dra. Mariana Castro", role: "Nutricionista", clinic: "Clínica Castro Nutrição", text: "Sabia que muitos pacientes sumiam por falta de acompanhamento, mas não tinha como controlar. O ClinicCortex resolveu isso! Agora sei quem é o próximo, e os pacientes seguem o tratamento.", rating: 5, avatar: "MC" },
  { name: "Dr. Roberto Lima", role: "Ortopedista", clinic: "Ortopedia Lima & Associados", text: "O analytics do ClinicCortex me mostrou que 40% dos meus pacientes não retornavam após a primeira consulta. Com as automações de follow-up, esse número caiu para 12%. Resultado impressionante.", rating: 5, avatar: "RL" },
  { name: "Dra. Patricia Alves", role: "Ginecologista", clinic: "Clínica Alves Saúde da Mulher", text: "Antes usava 3 sistemas diferentes para agenda, prontuário e financeiro. O ClinicCortex unificou tudo. Economizo 2 horas por dia e minha equipe está muito mais produtiva.", rating: 5, avatar: "PA" },
  { name: "Dr. Felipe Torres", role: "Pediatra", clinic: "Pediatria Torres", text: "A integração com WhatsApp é incrível. Os pais recebem lembretes automáticos, confirmam a consulta e minha secretária não precisa fazer nenhuma ligação. Revolucionou minha clínica.", rating: 5, avatar: "FT" },
];

function TestimonialCard({ testimonial }: { testimonial: (typeof TESTIMONIALS)[0] }) {
  return (
    <div className="cc-home-panel rounded-2xl p-6 flex flex-col gap-4 min-w-[320px] sm:min-w-[380px] flex-shrink-0">
      <Quote className="w-6 h-6 text-[var(--cc-secondary)] opacity-25" strokeWidth={1.5} />
      <p className="text-sm text-[var(--cc-text-body)] opacity-90 font-['Space_Grotesk'] leading-relaxed flex-1">
        "{testimonial.text}"
      </p>
      <div className="flex gap-1">
        {[...Array(testimonial.rating)].map((_, i) => (
          <span key={i} className="text-[var(--cc-tertiary)] text-sm">★</span>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-2 border-t border-[color:var(--cc-border)]">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, var(--cc-primary), var(--cc-secondary))" }}
        >
          <span className="text-xs font-['Syne'] font-800 text-[var(--cc-text-on-primary)]">{testimonial.avatar}</span>
        </div>
        <div>
          <div className="text-sm font-['Syne'] font-700 text-[var(--cc-text-primary)]">{testimonial.name}</div>
          <div className="text-xs text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk']">
            {testimonial.role} · {testimonial.clinic}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsSection() {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true, margin: "-100px" });
  return (
    <section className="relative py-24 lg:py-32 bg-[var(--cc-bg-white)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,rgba(35,217,150,0.05),transparent)]" />
      <div className="relative z-10">
        <div ref={titleRef} className="text-center mb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 mb-4">
            <span className="cc-home-chip px-3 py-1 rounded-full text-xs font-['Space_Grotesk'] font-700 tracking-wider uppercase">
              Depoimentos
            </span>
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.6 }} className="font-['Syne'] font-800 text-3xl sm:text-4xl lg:text-5xl text-[var(--cc-text-primary)] mb-4 tracking-tight">
            Clínicas que já{" "}<span className="cc-gradient-text">transformaram sua operação</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2, duration: 0.6 }} className="text-base sm:text-lg text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] max-w-xl mx-auto">
            Veja o que médicos e gestores de clínicas dizem sobre o ClinicCortex.
          </motion.p>
        </div>
        {/* Scrolling row 1 */}
        <div className="relative overflow-hidden mb-4">
          <div className="absolute left-0 top-0 bottom-0 w-24 cc-home-fade-left z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 cc-home-fade-right z-10 pointer-events-none" />
          <motion.div className="flex gap-4 px-4" animate={{ x: [0, -1200] }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }}>
            {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => <TestimonialCard key={i} testimonial={t} />)}
          </motion.div>
        </div>
        {/* Scrolling row 2 (reverse) */}
        <div className="relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-24 cc-home-fade-left z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 cc-home-fade-right z-10 pointer-events-none" />
          <motion.div className="flex gap-4 px-4" animate={{ x: [-1200, 0] }} transition={{ duration: 35, repeat: Infinity, ease: "linear" }}>
            {[...TESTIMONIALS.slice(3), ...TESTIMONIALS.slice(0, 3), ...TESTIMONIALS.slice(3), ...TESTIMONIALS.slice(0, 3)].map((t, i) => <TestimonialCard key={i} testimonial={t} />)}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
