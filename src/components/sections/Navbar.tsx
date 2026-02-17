import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { navigateToAppPath } from "@/lib/appOrigin";
import cliniccortexLogoImg from "@/assets/cliniccortex-logo-img.png";

const navLinks = [
  { label: "Para quem é", href: "#audience" },
  { label: "Funcionalidades", href: "#features" },
  { label: "Demonstração", href: "#demo" },
  { label: "Ecossistema", href: "#ecosystem" },
  { label: "Planos", href: "#pricing" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const goLogin = () => navigateToAppPath("/login");
  const goSignup = () => navigateToAppPath("/signup");

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled
          ? "cc-home-nav-surface"
          : "bg-transparent"
          }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <motion.a
              href="#"
              onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="flex items-center group"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center gap-2">
                <img
                  src={cliniccortexLogoImg}
                  alt="ClinicCortex Logo"
                  className="h-10 object-contain"
                  loading="eager"
                />
                <span className="font-['Syne'] font-800 text-lg text-[var(--cc-text-body)] tracking-tight">
                  Clinic<span className="text-[var(--cc-primary)]">Cortex</span>
                </span>
              </div>
            </motion.a>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => handleNavClick(link.href)}
                  className="px-4 py-2 text-sm font-['Space_Grotesk'] font-500 text-[var(--cc-text-body)] hover:text-[var(--cc-primary)] transition-colors duration-200 rounded-lg hover:bg-[var(--cc-bg-subtle)] relative group"
                >
                  {link.label}
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-[var(--cc-primary)] group-hover:w-4 transition-all duration-300 rounded-full" />
                </button>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="hidden lg:flex items-center gap-3">
              <button
                type="button"
                onClick={goLogin}
                className="px-4 py-2 text-sm font-['Space_Grotesk'] font-600 text-[var(--cc-text-body)] hover:text-[var(--cc-primary)] transition-colors"
              >
                Login
              </button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={goSignup}
                className="cc-btn-primary px-5 py-2.5 rounded-lg text-sm font-['Syne'] font-700"
              >
                Começar agora
              </motion.button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2 text-[var(--cc-primary)] hover:bg-[var(--cc-bg-subtle)] rounded-lg transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 left-0 right-0 z-40 cc-home-nav-surface lg:hidden"
          >
            <div className="px-4 py-4 flex flex-col gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => handleNavClick(link.href)}
                  className="text-left px-4 py-3 text-sm font-['Space_Grotesk'] font-500 text-[var(--cc-text-muted)] hover:text-[var(--cc-primary)] hover:bg-[var(--cc-bg-subtle)] rounded-lg transition-all"
                >
                  {link.label}
                </button>
              ))}
              <div className="pt-3 border-t border-[color:var(--cc-border)] flex flex-col gap-2">
                <button
                  type="button"
                  onClick={goLogin}
                  className="px-4 py-3 text-sm font-['Space_Grotesk'] font-600 text-[var(--cc-text-muted)] hover:text-[var(--cc-primary)] text-left transition-colors"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={goSignup}
                  className="cc-btn-primary px-4 py-3 rounded-lg text-sm font-['Syne'] font-700 text-center"
                >
                  Começar agora
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
