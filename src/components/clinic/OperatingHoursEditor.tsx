import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, Pause, Play, Plus } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  intervalFitsWithinDay,
  OPERATING_DAYS as DAYS,
  suggestBreakWindow,
  type DayId,
  type OperationHours,
} from "@/lib/operatingHours";

function Toggle({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-[color:var(--cc-border-accent)]",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        checked ? "bg-[var(--cc-tertiary)]" : "bg-[color:var(--cc-border-mid)]"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function TimeRow({
  label,
  icon,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between p-5 rounded-2xl border transition-colors",
        disabled
          ? "bg-[var(--cc-bg-subtle)] border-[color:var(--cc-border)] opacity-70"
          : "bg-[var(--cc-bg-subtle)] border-[color:var(--cc-border)] hover:bg-[var(--cc-accent-soft)]",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 text-[var(--cc-text-muted)]",
          disabled ? "opacity-40" : "opacity-80"
        )}
      >
        <span className="text-[var(--cc-tertiary)]">{icon}</span>
        <span className="text-sm font-700 font-['Space_Grotesk']">{label}</span>
      </div>
      <div
        className={cn(
          "relative flex items-center bg-[var(--cc-bg-white)] px-4 py-2 rounded-xl shadow-sm border transition-colors",
          disabled
            ? "border-[color:var(--cc-border)]"
            : "border-[color:var(--cc-border-mid)] focus-within:border-[color:var(--cc-border-accent)]"
        )}
      >
        <input
          type="time"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 bg-transparent border-none p-0 text-center font-800 text-[var(--cc-text-primary)] focus:ring-0 text-lg font-['Syne'] disabled:opacity-40"
        />
        <span className="ml-2 text-[var(--cc-tertiary)] text-sm pointer-events-none" aria-hidden>
          ▾
        </span>
      </div>
    </div>
  );
}

function TimeCell({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="md:hidden px-1 text-[10px] font-800 uppercase tracking-[0.2em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
        {label}
      </span>
      <div
        className={cn(
          "relative flex items-center bg-[var(--cc-bg-white)] px-4 py-2.5 rounded-xl shadow-sm border transition-colors",
          disabled
            ? "border-[color:var(--cc-border)] bg-[var(--cc-bg-subtle)]"
            : "border-[color:var(--cc-border-mid)] focus-within:border-[color:var(--cc-border-accent)] hover:border-[color:var(--cc-border)]"
        )}
      >
        <input
          type="time"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-none p-0 text-center font-800 text-[var(--cc-text-primary)] focus:ring-0 text-lg font-['Syne'] disabled:opacity-40"
        />
        <span className="ml-2 text-[var(--cc-tertiary)] text-sm pointer-events-none" aria-hidden>
          ▾
        </span>
      </div>
    </div>
  );
}

export default function OperatingHoursEditor({
  value,
  onChange,
  disabled = false,
  className,
  showTimezoneNote = false,
  timezoneNote = "Todos os horários estão em UTC-3 (São Paulo).",
}: {
  value: OperationHours;
  onChange: (next: OperationHours) => void;
  disabled?: boolean;
  className?: string;
  showTimezoneNote?: boolean;
  timezoneNote?: string;
}) {
  const enabledDays = useMemo(
    () => DAYS.filter((d) => Boolean(value[d.id]?.enabled)).map((d) => d.id) as DayId[],
    [value]
  );

  const setDayEnabled = (day: DayId, enabled: boolean) => {
    const current = value[day];
    if (!current) return;
    onChange({
      ...value,
      [day]: {
        ...current,
        enabled,
      },
    });
  };

  const setDayTime = (day: DayId, field: "start" | "end", v: string) => {
    const current = value[day];
    if (!current) return;
    onChange({
      ...value,
      [day]: {
        ...current,
        enabled: true,
        [field]: v,
      },
    });
  };

  const setDayBreakEnabled = (day: DayId, enabled: boolean) => {
    const current = value[day];
    if (!current) return;
    if (!enabled) {
      onChange({
        ...value,
        [day]: {
          ...current,
          break_enabled: false,
        },
      });
      return;
    }

    const start = current.start || "08:00";
    const end = current.end || "18:00";
    const currentStart = String(current.break_start || "12:00").slice(0, 5);
    const currentEnd = String(current.break_end || "13:30").slice(0, 5);
    const fits = intervalFitsWithinDay(start, end, currentStart, currentEnd);
    const suggested = fits ? { breakStart: currentStart, breakEnd: currentEnd } : suggestBreakWindow(start, end);

    onChange({
      ...value,
      [day]: {
        ...current,
        enabled: true,
        break_enabled: true,
        break_start: suggested.breakStart,
        break_end: suggested.breakEnd,
      },
    });
  };

  const setDayBreakTime = (day: DayId, field: "break_start" | "break_end", v: string) => {
    const current = value[day];
    if (!current) return;
    onChange({
      ...value,
      [day]: {
        ...current,
        enabled: true,
        break_enabled: true,
        [field]: v,
      },
    });
  };

  const DayTableRow = ({ day }: { day: { id: DayId; short: string; label: string } }) => {
    const row = value[day.id];
    const start = row?.start || "08:00";
    const end = row?.end || "18:00";
    const breakEnabled = Boolean(row?.break_enabled);
    const breakStart = String(row?.break_start || "12:00").slice(0, 5);
    const breakEnd = String(row?.break_end || "13:30").slice(0, 5);

    return (
      <div>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px_220px_200px] gap-4 md:items-center">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center font-800 tracking-[0.18em] text-xs font-['Space_Grotesk'] bg-[var(--cc-primary)] text-[var(--cc-text-on-primary)] shrink-0"
              aria-hidden
            >
              {day.short}
            </div>
            <div className="font-800 font-['Syne'] tracking-tight text-[var(--cc-text-primary)] truncate">
              {day.label}
            </div>
          </div>

          <TimeCell
            label="Início"
            value={start}
            disabled={disabled}
            onChange={(v) => setDayTime(day.id, "start", v)}
          />
          <TimeCell
            label="Término"
            value={end}
            disabled={disabled}
            onChange={(v) => setDayTime(day.id, "end", v)}
          />

          <div
            className={cn(
              "rounded-2xl border border-[color:var(--cc-border)] bg-[var(--cc-bg-subtle)] px-4 py-3 flex items-center justify-between gap-4",
              disabled && "opacity-70"
            )}
          >
            <span className="text-[11px] md:text-[10px] font-900 uppercase tracking-[0.25em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
              Intervalo
            </span>
            <Toggle
              checked={breakEnabled}
              disabled={disabled}
              onCheckedChange={(v) => setDayBreakEnabled(day.id, v)}
            />
          </div>
        </div>

        <motion.div
          initial={false}
          animate={breakEnabled ? "open" : "collapsed"}
          variants={{
            open: { opacity: 1, height: "auto", marginTop: 16 },
            collapsed: { opacity: 0, height: 0, marginTop: 0 },
          }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
          style={{ pointerEvents: breakEnabled && !disabled ? "auto" : "none" }}
          aria-hidden={!breakEnabled}
        >
          <div className="rounded-2xl border border-[color:var(--cc-border-accent)] bg-[var(--cc-accent-soft)] p-5 md:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TimeRow
                label="Início do intervalo"
                icon={<Pause className="w-4 h-4" strokeWidth={2.2} />}
                value={breakStart}
                disabled={disabled}
                onChange={(v) => setDayBreakTime(day.id, "break_start", v)}
              />
              <TimeRow
                label="Fim do intervalo"
                icon={<Play className="w-4 h-4" strokeWidth={2.2} />}
                value={breakEnd}
                disabled={disabled}
                onChange={(v) => setDayBreakTime(day.id, "break_end", v)}
              />
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="cc-card rounded-[2rem] p-7 md:p-10">
        <h3 className="text-sm font-800 text-[var(--cc-text-muted)] opacity-80 uppercase tracking-[0.2em] mb-7 font-['Space_Grotesk']">
          Dias de operação
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 md:gap-4">
          {DAYS.map((d) => {
            const on = Boolean(value[d.id]?.enabled);
            return (
              <button
                key={d.id}
                type="button"
                disabled={disabled}
                onClick={() => setDayEnabled(d.id, !on)}
                className={cn(
                  "h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors active:translate-y-[1px] border",
                  disabled && "opacity-60 cursor-not-allowed active:translate-y-0",
                  on
                    ? "bg-[var(--cc-primary)] text-[var(--cc-text-on-primary)] shadow-md border-[color:var(--cc-border-accent)]"
                    : "bg-[var(--cc-bg-subtle)] text-[var(--cc-text-muted)] hover:bg-[var(--cc-accent-soft)] border-dashed border-[color:var(--cc-border-mid)]"
                )}
                aria-pressed={on}
                title={d.label}
              >
                <span className={cn("text-xs font-800 uppercase tracking-[0.22em]", on ? "opacity-60" : "opacity-70")}>
                  {d.short}
                </span>
                <div className="relative h-6 w-6">
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 text-[var(--cc-text-on-primary)]"
                    animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.85 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CheckCircle2 className="h-6 w-6" strokeWidth={2.3} />
                  </motion.span>
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 text-[var(--cc-text-muted)] opacity-50"
                    animate={{ opacity: on ? 0 : 1, scale: on ? 0.85 : 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Plus className="h-6 w-6" strokeWidth={2.3} />
                  </motion.span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cc-card rounded-[2rem] p-7 md:p-10">
        <div className="flex items-center justify-between gap-6 mb-7">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[var(--cc-accent-soft)] flex items-center justify-center text-[var(--cc-primary)] shadow-inner border border-[color:var(--cc-border)]">
              <Clock className="w-7 h-7" strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-800 text-[var(--cc-text-primary)] font-['Syne']">
                Horário de atendimento
              </h3>
              <p className="text-xs md:text-sm text-[var(--cc-text-muted)] font-600 font-['Space_Grotesk'] opacity-80">
                Defina quando a IA pode sugerir horários para seus pacientes.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl border border-[color:var(--cc-border)] bg-[var(--cc-bg-white)]">
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_220px_220px_200px] gap-4 px-6 py-3 bg-[var(--cc-bg-subtle)] border-b border-[color:var(--cc-border)] text-[10px] font-800 uppercase tracking-[0.2em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk']">
            <div />
            <div className="text-center">Início</div>
            <div className="text-center">Término</div>
            <div className="text-center">Intervalo</div>
          </div>
          <div className="divide-y divide-[color:var(--cc-border)]">
            <AnimatePresence initial={false} mode="popLayout">
              {enabledDays.map((id) => {
                const meta = DAYS.find((d) => d.id === id);
                if (!meta) return null;
                return (
                  <motion.div
                    key={id}
                    layout="position"
                    initial="collapsed"
                    animate="open"
                    exit="collapsed"
                    variants={{
                      open: { opacity: 1, height: "auto" },
                      collapsed: { opacity: 0, height: 0 },
                    }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 md:px-6 py-5 hover:bg-[var(--cc-bg-subtle)] transition-colors">
                      <DayTableRow day={meta} />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {showTimezoneNote ? (
          <p className="mt-6 text-[11px] text-center text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700 uppercase tracking-[0.18em]">
            {timezoneNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}
