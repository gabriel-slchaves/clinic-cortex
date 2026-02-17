export type DayId = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DayMeta = { id: DayId; short: string; label: string };

export const OPERATING_DAYS: DayMeta[] = [
  { id: "mon", short: "SEG", label: "Segunda" },
  { id: "tue", short: "TER", label: "Terça" },
  { id: "wed", short: "QUA", label: "Quarta" },
  { id: "thu", short: "QUI", label: "Quinta" },
  { id: "fri", short: "SEX", label: "Sexta" },
  { id: "sat", short: "SÁB", label: "Sábado" },
  { id: "sun", short: "DOM", label: "Domingo" },
];

export type DaySchedule = {
  enabled: boolean;
  start: string;
  end: string;
  break_enabled: boolean;
  break_start: string;
  break_end: string;
};

export type OperationHours = Record<DayId, DaySchedule>;

export function isTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

export function isStartBeforeEnd(start: string, end: string) {
  if (!isTime(start) || !isTime(end)) return false;
  return start < end;
}

export function intervalFitsWithinDay(
  dayStart: string,
  dayEnd: string,
  breakStart: string,
  breakEnd: string
) {
  if (
    !isTime(dayStart) ||
    !isTime(dayEnd) ||
    !isTime(breakStart) ||
    !isTime(breakEnd)
  ) {
    return false;
  }
  return dayStart < breakStart && breakStart < breakEnd && breakEnd < dayEnd;
}

export function timeToMinutes(value: string) {
  if (!isTime(value)) return null;
  const [h, m] = value.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return Math.min(23, Math.max(0, h)) * 60 + Math.min(59, Math.max(0, m));
}

export function minutesToTime(value: number) {
  const v = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const h = String(Math.floor(v / 60)).padStart(2, "0");
  const m = String(v % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function roundTo5(mins: number) {
  return Math.round(mins / 5) * 5;
}

export function suggestBreakWindow(dayStart: string, dayEnd: string) {
  const s = timeToMinutes(dayStart);
  const e = timeToMinutes(dayEnd);
  if (s == null || e == null || e - s < 30) {
    return { breakStart: "12:00", breakEnd: "13:30" };
  }

  const span = e - s;
  const duration = span >= 480 ? 90 : span >= 180 ? 60 : 30;
  const usable = Math.max(0, span - duration);
  const start = roundTo5(s + Math.max(5, Math.floor(usable / 2)));
  const end = roundTo5(start + duration);
  const minStart = s + 5;
  const maxEnd = e - 5;

  let bStart = start;
  let bEnd = end;
  if (bStart < minStart) bStart = roundTo5(minStart);
  if (bEnd > maxEnd) bEnd = roundTo5(maxEnd);
  if (bEnd <= bStart) {
    bStart = roundTo5(minStart);
    bEnd = roundTo5(Math.min(maxEnd, bStart + 30));
  }
  return { breakStart: minutesToTime(bStart), breakEnd: minutesToTime(bEnd) };
}

export function buildOperationHours({
  enabledDays,
  start,
  end,
}: {
  enabledDays: DayId[];
  start: string;
  end: string;
}): OperationHours {
  const enabled = new Set(enabledDays);
  const safeStart = isTime(start) ? start : "08:00";
  const safeEnd = isTime(end) ? end : "18:00";
  const result = {} as OperationHours;

  for (const d of OPERATING_DAYS) {
    result[d.id] = {
      enabled: enabled.has(d.id),
      start: safeStart,
      end: safeEnd,
      break_enabled: false,
      break_start: "12:00",
      break_end: "13:30",
    };
  }

  return result;
}

