/**
 * ClinicCortex HeroSection
 * Design: Dark Neon Biopunk — Syne headlines, Three.js sphere, Framer Motion animations
 * Full viewport hero with 3D sphere, strong headline, and CTA buttons
 */

import { motion } from "framer-motion";
import { ArrowRight, Play, ChevronDown } from "lucide-react";
import { Suspense, lazy } from "react";

const TechSphere = lazy(() => import("../three/TechSphere"));

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.7 },
  }),
};

const STATS = [
  { value: "98%", label: "Redução de no-show" },
  { value: "3x", label: "Mais pacientes retornando" },
  { value: "40h", label: "Economizadas por mês" },
];

export default function HeroSection() {
  const scrollToFeatures = () => {
    document.querySelector("#features")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden bg-[var(--cc-bg-base)]">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.16] cc-home-grid" />

      {/* Radial glow from center */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(35,217,150,0.14),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_70%_50%,rgba(35,217,150,0.07),transparent)]" />

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center min-h-[calc(100vh-80px)]">

            {/* Left: Text content */}
            <div className="flex flex-col justify-center py-12 lg:py-0">
              {/* Badge */}
              <motion.div
                custom={0}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="inline-flex items-center gap-2 mb-6 self-start"
              >
                <span className="cc-home-chip flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-['Space_Grotesk'] font-600 tracking-wider uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--cc-secondary)] animate-pulse" />
                  Sistema Operacional para Clínicas
                </span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                custom={1}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="font-['Syne'] font-800 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.05] tracking-tight text-[var(--cc-text-primary)] mb-6"
              >
                O cérebro{" "}
                <span className="relative">
                  <span className="cc-gradient-text">operacional e inteligente</span>
                  <motion.span
                    className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--cc-tertiary)] to-transparent"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
                  />
                </span>
                <br />
                da sua Clínica
              </motion.h1>

              {/* Subheadline */}
              <motion.p
                custom={2}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="text-base sm:text-lg text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-400 leading-relaxed mb-8 max-w-xl opacity-90"
              >
                Automação, inteligência e controle total da sua clínica em uma única plataforma.
                CRM médico, agenda inteligente, analytics avançado e gestão operacional integrados.
              </motion.p>

              {/* CTA Buttons */}
              <motion.div
                custom={3}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="flex flex-col sm:flex-row gap-3 mb-12"
              >
                <motion.button
                  whileHover={{ scale: 1.03, boxShadow: "0 0 40px rgba(35,217,150,0.5)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => document.querySelector("#cta")?.scrollIntoView({ behavior: "smooth" })}
                  className="cc-btn-primary flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-base font-['Syne'] font-700"
                >
                  Começar agora
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => document.querySelector("#demo")?.scrollIntoView({ behavior: "smooth" })}
                  className="cc-btn-outline flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-base"
                >
                  <div className="w-7 h-7 rounded-full bg-[var(--cc-accent-soft)] flex items-center justify-center">
                    <Play className="w-3 h-3 text-[var(--cc-secondary)] fill-[var(--cc-secondary)]" />
                  </div>
                  Ver demonstração
                </motion.button>
              </motion.div>

              {/* Stats */}
              <motion.div
                custom={4}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="flex gap-6 sm:gap-8"
              >
                {STATS.map((stat, i) => (
                  <div key={i} className="flex flex-col">
                    <span className="font-['Syne'] font-800 text-2xl sm:text-3xl text-[var(--cc-text-primary)]">
                      {stat.value}
                    </span>
                    <span className="text-xs sm:text-sm text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] mt-0.5">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right: 3D Sphere */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 1.2 }}
              className="relative flex items-center justify-center"
            >
              {/* Sphere container */}
              <div
                className="relative w-full aspect-square max-w-[500px] mx-auto rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, color-mix(in srgb, var(--cc-public-contrast-bg) 94%, transparent) 0%, color-mix(in srgb, var(--cc-public-contrast-bg) 40%, transparent) 50%, transparent 80%)",
                }}
              >

                {/* Optional overlay texture - Original Neon Harmony */}
                <div
                  className="absolute inset-0 rounded-full opacity-100 mix-blend-screen pointer-events-none"
                  style={{
                    backgroundImage: `url(https://d2xsxph8kpxj0f.cloudfront.net/310519663409840608/CW5XuVQnNoaYUVjyRygXLP/hero-sphere-A5HZe3kotPA6T7d2F48eJH.webp)`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "hue-rotate(35deg) saturate(1.1)",
                  }}
                />

                {/* Three.js canvas (interactive, so outside the pointer-events-none wrapper, but clipped by border radius if needed) */}

                {/* Three.js canvas */}
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full border-2 border-[color:var(--cc-border-accent)] animate-spin border-t-[var(--cc-tertiary)]" />
                    </div>
                  }
                >
                  <TechSphere />
                </Suspense>

                {/* Floating data badges */}
                <motion.div
                  animate={{ y: [0, -12, 0], rotate: [0, 2, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-8 -left-4 sm:-left-8 cc-home-panel rounded-xl px-3 py-2 text-xs font-['Space_Grotesk']"
                >
                  <div className="text-[var(--cc-text-primary)] font-700">+127 pacientes</div>
                  <div className="text-[var(--cc-text-muted)] opacity-80">este mês</div>
                </motion.div>

                <motion.div
                  animate={{ y: [0, 10, 0], rotate: [0, -2, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                  className="absolute bottom-16 -right-4 sm:-right-8 cc-home-panel rounded-xl px-3 py-2 text-xs font-['Space_Grotesk']"
                >
                  <div className="text-[var(--cc-text-primary)] font-700">No-show: 2%</div>
                  <div className="text-[var(--cc-text-muted)] opacity-80">↓ 96% redução</div>
                </motion.div>

                <motion.div
                  animate={{ y: [0, -8, 0], scale: [1, 1.05, 1] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute top-1/3 -right-2 sm:-right-6 cc-home-panel rounded-xl px-3 py-2 text-xs font-['Space_Grotesk']"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--cc-tertiary)] animate-pulse" />
                    <span className="text-[var(--cc-text-primary)] font-600">AI Ativo</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="relative z-10 flex justify-center pb-8"
      >
        <button
          onClick={scrollToFeatures}
          className="flex flex-col items-center gap-1 text-[var(--cc-text-muted)] hover:text-[var(--cc-secondary)] transition-colors group"
        >
          <span className="text-xs font-['Space_Grotesk'] tracking-widest uppercase text-[var(--cc-primary)]">
            Explorar
          </span>
          <motion.div
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </button>
      </motion.div>
    </section>
  );
}
