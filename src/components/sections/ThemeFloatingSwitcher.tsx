import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const THEME_OPTIONS: Array<{
  id: Theme;
  name: string;
  description: string;
  swatch: string;
  accent: string;
}> = [
  { id: "light", name: "Claro", description: "Leve e clean", swatch: "#E9FDF4", accent: "#025940" },
  { id: "dark", name: "Escuro", description: "Neutro e discreto", swatch: "#131318", accent: "#23D996" },
  { id: "forest", name: "Verde floresta", description: "Clínico e profundo", swatch: "#062B1D", accent: "#23D996" },
  { id: "emerald", name: "Verde esmeralda", description: "Mais vibrante", swatch: "#23D996", accent: "#062B1D" },
];

export default function ThemeFloatingSwitcher() {
  const { theme, setTheme, switchable } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!switchable || !setTheme) return null;

  return (
    <div
      ref={containerRef}
      className="fixed right-4 sm:right-6 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[70] flex flex-col items-end"
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mb-3 w-[min(88vw,22rem)] origin-bottom-right rounded-[1.75rem] cc-home-theme-fab p-3 sm:p-4"
          >
            <div className="px-1">
              <p className="text-[11px] uppercase tracking-[0.22em] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)]">
                Personalização
              </p>
              <p className="mt-2 text-[var(--cc-text-primary)] font-['Syne'] font-800 text-lg">
                Alterar aparência
              </p>
              <p className="mt-1 text-[13px] font-['Space_Grotesk'] text-[var(--cc-text-muted)]">
                O tema muda a landing e o sistema inteiro.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {THEME_OPTIONS.map((option) => {
                const active = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setTheme(option.id);
                      setOpen(false);
                    }}
                    data-active={active ? "true" : "false"}
                    className="cc-home-theme-option rounded-2xl p-3 text-left"
                    aria-pressed={active}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-['Syne'] font-800 text-[var(--cc-text-primary)]">
                          {option.name}
                        </p>
                        <p className="mt-1 text-[11px] font-['Space_Grotesk'] text-[var(--cc-text-muted)]">
                          {option.description}
                        </p>
                      </div>
                      <span
                        className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border"
                        style={{
                          borderColor: active ? "var(--cc-tertiary)" : "var(--cc-border-mid)",
                          background: active ? "var(--cc-tertiary)" : "transparent",
                          color: active ? "var(--cc-text-on-primary)" : "transparent",
                        }}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className="h-8 flex-1 rounded-xl border"
                        style={{
                          background: `linear-gradient(135deg, ${option.swatch} 0%, ${option.accent} 100%)`,
                          borderColor: "var(--cc-border)",
                        }}
                      />
                      <span
                        className="h-8 w-8 rounded-xl border"
                        style={{ background: option.accent, borderColor: "var(--cc-border)" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.04, y: -1 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen((value) => !value)}
        className="cc-home-theme-fab group flex origin-right items-center gap-3 rounded-full px-4 py-3 sm:px-5"
        aria-expanded={open}
        aria-label="Alterar tema"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cc-accent-soft)] text-[var(--cc-primary)]">
          <Palette className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="hidden sm:block text-left">
          <p className="text-[11px] uppercase tracking-[0.2em] font-['Space_Grotesk'] font-700 text-[var(--cc-text-muted)]">
            Tema
          </p>
          <p className="text-sm font-['Syne'] font-800 text-[var(--cc-text-primary)]">
            {THEME_OPTIONS.find((option) => option.id === theme)?.name ?? "Aparência"}
          </p>
        </div>
      </motion.button>
    </div>
  );
}
