/**
 * ClinicCortex Footer — Dark premium (follows dark CTA block)
 */

import { motion } from "framer-motion";
import { Twitter, Linkedin, Instagram, Mail, Phone } from "lucide-react";
import cliniccortexLogoImg from "@/assets/cliniccortex-logo-img.png";

const FOOTER_LINKS = {
  Produto: [
    { label: "Funcionalidades", href: "#features" },
    { label: "Demonstração", href: "#demo" },
    { label: "Ecossistema", href: "#ecosystem" },
    { label: "Planos", href: "#pricing" },
  ],
  Empresa: [
    { label: "Sobre nós", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Carreiras", href: "#" },
    { label: "Parceiros", href: "#" },
  ],
  Suporte: [
    { label: "Central de ajuda", href: "#" },
    { label: "Documentação", href: "#" },
    { label: "Status do sistema", href: "#" },
    { label: "Contato", href: "#" },
  ],
};

const SOCIAL_LINKS = [
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Instagram, href: "#", label: "Instagram" },
];

export default function Footer() {
  const handleNavClick = (href: string) => {
    if (href.startsWith("#")) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="relative bg-[var(--cc-bg-subtle)] border-t border-[color:var(--cc-border)] overflow-hidden">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--cc-border-mid)] to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer content */}
        <div className="py-16 grid grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand column */}
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center mb-4">
              <img
                src={cliniccortexLogoImg}
                alt="ClinicCortex Logo"
                className="h-8 w-auto object-contain"
                loading="eager"
              />
              <span className="font-['Syne'] font-800 text-lg text-[var(--cc-text-body)] tracking-tight ml-2">
                 Clinic<span className="text-[var(--cc-primary)]">Cortex</span>
              </span>
            </div>
            <p className="text-sm text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] leading-relaxed mb-6 max-w-xs">
              O Sistema Operacional Inteligente para Clínicas Modernas. Automação, inteligência e controle total em uma única plataforma.
            </p>
            <div className="flex flex-col gap-2 mb-6">
              <a href="mailto:contato@cliniccortex.com.br" className="flex items-center gap-2 text-xs text-[var(--cc-text-muted)] opacity-90 hover:text-[var(--cc-primary)] transition-colors font-['Space_Grotesk']">
                <Mail className="w-3.5 h-3.5" />contato@cliniccortex.com.br
              </a>
              <a href="tel:+5511999999999" className="flex items-center gap-2 text-xs text-[var(--cc-text-muted)] opacity-90 hover:text-[var(--cc-tertiary)] transition-colors font-['Space_Grotesk']">
                <Phone className="w-3.5 h-3.5" />(11) 99999-9999
              </a>
            </div>
            <div className="flex gap-3">
              {SOCIAL_LINKS.map((social) => {
                const Icon = social.icon;
                return (
                  <motion.a key={social.label} href={social.href} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                    className="w-8 h-8 rounded-lg cc-home-panel flex items-center justify-center text-[var(--cc-text-muted)] opacity-80 hover:opacity-100 hover:text-[var(--cc-primary)] hover:bg-[var(--cc-bg-base)] transition-all duration-300"
                    aria-label={social.label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </motion.a>
                );
              })}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-['Syne'] font-800 text-xs text-[var(--cc-primary)] tracking-widest uppercase mb-4">{category}</h4>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <button onClick={() => handleNavClick(link.href)} className="text-sm text-[var(--cc-text-muted)] opacity-90 hover:text-[var(--cc-primary)] hover:opacity-100 font-['Space_Grotesk'] transition-colors duration-200 text-left">
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="py-6 border-t border-[color:var(--cc-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk']">© 2025 ClinicCortex. Todos os direitos reservados.</p>
          <div className="flex items-center gap-6">
            {["Termos de uso", "Política de privacidade", "LGPD"].map((label) => (
              <button key={label} className="text-xs text-[var(--cc-text-muted)] opacity-80 hover:text-[var(--cc-primary)] font-['Space_Grotesk'] transition-colors">{label}</button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
