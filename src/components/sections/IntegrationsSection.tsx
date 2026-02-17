/**
 * ClinicCortex IntegrationsSection
 * Design: Dark Neon Biopunk — integration logos with subtle animation
 */

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const INTEGRATIONS = [
  { name: "WhatsApp com IA", icon: "https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" },
  { name: "Google Calendar", icon: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" },
  { name: "CRM Médico", icon: "https://cdn-icons-png.flaticon.com/512/2966/2966327.png" },
  { name: "Inteligência Artificial", icon: "https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg" },
  { name: "LGPD Compliance", icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" },
  { name: "Stripe Payments", icon: "https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" },
];

export default function IntegrationsSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="relative py-12 bg-[var(--cc-bg-base)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(35,217,150,0.1),transparent_70%)] pointer-events-none" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 15 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <p className="text-[10px] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)] opacity-80 tracking-widest uppercase mb-6">
            Ecosistema Integrado & Inteligente
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            {INTEGRATIONS.map((integration, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                whileHover={{ y: -3, scale: 1.02 }}
                className="cc-home-panel flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all duration-300"
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <img src={integration.icon} alt={integration.name} className="w-full h-full object-contain filter grayscale-[0.2] hover:grayscale-0 transition-all duration-300" />
                </div>
                <span className="text-xs font-['Space_Grotesk'] font-600 text-[var(--cc-text-primary)] opacity-90">
                  {integration.name}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
