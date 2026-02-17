import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useAgendaResources, useAppointments, type Appointment } from "@/hooks/useAppointments";
import {
  intervalFitsWithinDay,
  isStartBeforeEnd,
  OPERATING_DAYS,
  timeToMinutes,
  type DayId,
  type OperationHours,
} from "@/lib/operatingHours";
import { cn } from "@/lib/utils";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { BusinessHoursInput, DateSpanApi, DatesSetArg, DateSelectArg, EventClickArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CalendarView = "timeGridDay" | "timeGridWeek" | "dayGridMonth";
type UiStatus = "scheduled" | "confirmed" | "completed" | "canceled";
type CalendarWindow = { minTime: string; maxTime: string };
type CalendarStep = { slotDuration: string; snapDuration: string };
type SlotStepOption = { minutes: number; label: string };

const INPUT =
  "w-full bg-[var(--cc-bg-subtle)] border-2 border-transparent rounded-2xl px-5 py-3.5 focus:ring-0 focus:bg-[var(--cc-bg-white)] focus:border-[#23D996]/40 transition-all placeholder:text-[var(--cc-text-muted)] placeholder:opacity-60 font-['Space_Grotesk'] font-600 text-[14px] text-[var(--cc-text-body)]";

const DEFAULT_SLOT_MIN_TIME = "07:00:00";
const DEFAULT_SLOT_MAX_TIME = "21:00:00";
const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;
const DAY_ID_TO_WEEKDAY: Record<DayId, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};
const WEEKDAY_TO_DAY_ID: DayId[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const STATUS_OPTIONS: Array<{ value: UiStatus; label: string }> = [
  { value: "scheduled", label: "Agendada" },
  { value: "confirmed", label: "Confirmada" },
  { value: "completed", label: "Concluída" },
  { value: "canceled", label: "Cancelada" },
];
const SLOT_STEP_OPTIONS: SlotStepOption[] = [
  { minutes: 60, label: "1h" },
  { minutes: 30, label: "30m" },
  { minutes: 15, label: "15m" },
  { minutes: 10, label: "10m" },
];
const DEFAULT_SLOT_STEP_MINUTES = 30;
const AGENDA_SLOT_STEP_STORAGE_KEY = "cc_agenda_slot_step_minutes";

function addMinutes(date: Date, minutes: number) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateTimeInputValue(date: Date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseLocalDateTimeInput(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [datePart, timePart] = raw.split("T");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map((v) => Number(v));
  const [hh, mm] = timePart.split(":").map((v) => Number(v));
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function capitalizePt(label: string) {
  const cleaned = String(label || "")
    .replace(/\s+de\s+/gi, " ")
    .trim()
    .replace(/\.$/, "");
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeUiStatus(value: unknown): UiStatus {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === "confirmed") return "confirmed";
  if (v === "completed" || v === "done") return "completed";
  if (v === "canceled" || v === "cancelled") return "canceled";
  return "scheduled";
}

function withSeconds(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

function stripSeconds(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function dateAtMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

function roundUpMinutes(value: number, step = 15) {
  return Math.ceil(value / step) * step;
}

function getDayIdFromDate(date: Date): DayId {
  return WEEKDAY_TO_DAY_ID[date.getDay()] || "sun";
}

function formatCalendarEdgeLabel(value: string) {
  const normalized = stripSeconds(value);
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : value;
}

function readAgendaSlotStepMinutes() {
  if (typeof window === "undefined") return DEFAULT_SLOT_STEP_MINUTES;

  try {
    const raw = Number(window.localStorage.getItem(AGENDA_SLOT_STEP_STORAGE_KEY) || DEFAULT_SLOT_STEP_MINUTES);
    return SLOT_STEP_OPTIONS.some((option) => option.minutes === raw) ? raw : DEFAULT_SLOT_STEP_MINUTES;
  } catch {
    return DEFAULT_SLOT_STEP_MINUTES;
  }
}

function computeCalendarWindow(operationHours: OperationHours): CalendarWindow {
  let minMinutes: number | null = null;
  let maxMinutes: number | null = null;

  for (const day of OPERATING_DAYS) {
    const row = operationHours[day.id];
    if (!row?.enabled || !isStartBeforeEnd(row.start, row.end)) continue;
    const startMinutes = timeToMinutes(row.start);
    const endMinutes = timeToMinutes(row.end);
    if (startMinutes == null || endMinutes == null) continue;
    minMinutes = minMinutes == null ? startMinutes : Math.min(minMinutes, startMinutes);
    maxMinutes = maxMinutes == null ? endMinutes : Math.max(maxMinutes, endMinutes);
  }

  return {
    minTime: minMinutes == null ? DEFAULT_SLOT_MIN_TIME : withSeconds(`${String(Math.floor(minMinutes / 60)).padStart(2, "0")}:${String(minMinutes % 60).padStart(2, "0")}`),
    maxTime: maxMinutes == null ? DEFAULT_SLOT_MAX_TIME : withSeconds(`${String(Math.floor(maxMinutes / 60)).padStart(2, "0")}:${String(maxMinutes % 60).padStart(2, "0")}`),
  };
}

function minutesToDurationString(totalMinutes: number) {
  const safeMinutes = Math.max(5, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${pad2(hours)}:${pad2(minutes)}:00`;
}

function computeCalendarStep(stepMinutes: number): CalendarStep {
  return {
    slotDuration: minutesToDurationString(stepMinutes),
    snapDuration: minutesToDurationString(stepMinutes),
  };
}

function buildBusinessHoursInput(operationHours: OperationHours): BusinessHoursInput {
  const segments: Array<{ daysOfWeek: number[]; startTime: string; endTime: string }> = [];

  for (const day of OPERATING_DAYS) {
    const row = operationHours[day.id];
    if (!row?.enabled || !isStartBeforeEnd(row.start, row.end)) continue;

    if (row.break_enabled && intervalFitsWithinDay(row.start, row.end, row.break_start, row.break_end)) {
      segments.push(
        { daysOfWeek: [DAY_ID_TO_WEEKDAY[day.id]], startTime: withSeconds(row.start), endTime: withSeconds(row.break_start) },
        { daysOfWeek: [DAY_ID_TO_WEEKDAY[day.id]], startTime: withSeconds(row.break_end), endTime: withSeconds(row.end) }
      );
      continue;
    }

    segments.push({
      daysOfWeek: [DAY_ID_TO_WEEKDAY[day.id]],
      startTime: withSeconds(row.start),
      endTime: withSeconds(row.end),
    });
  }

  return segments;
}

function isRangeWithinOperatingHours(start: Date, end: Date, operationHours: OperationHours) {
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end <= start) return false;
  if (
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  ) {
    return false;
  }

  const row = operationHours[getDayIdFromDate(start)];
  if (!row?.enabled || !isStartBeforeEnd(row.start, row.end)) return false;

  const dayStart = timeToMinutes(row.start);
  const dayEnd = timeToMinutes(row.end);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  if (dayStart == null || dayEnd == null) return false;
  if (startMinutes < dayStart || endMinutes > dayEnd) return false;

  if (row.break_enabled && intervalFitsWithinDay(row.start, row.end, row.break_start, row.break_end)) {
    const breakStart = timeToMinutes(row.break_start);
    const breakEnd = timeToMinutes(row.break_end);
    if (breakStart != null && breakEnd != null && startMinutes < breakEnd && endMinutes > breakStart) {
      return false;
    }
  }

  return true;
}

function findNextAvailableRange(baseDate: Date, operationHours: OperationHours, durationMinutes = DEFAULT_APPOINTMENT_DURATION_MINUTES) {
  const seed = new Date(baseDate);

  for (let offset = 0; offset < 14; offset += 1) {
    const currentDay = new Date(seed);
    currentDay.setDate(seed.getDate() + offset);
    currentDay.setHours(0, 0, 0, 0);

    const row = operationHours[getDayIdFromDate(currentDay)];
    if (!row?.enabled || !isStartBeforeEnd(row.start, row.end)) continue;

    const dayStart = timeToMinutes(row.start);
    const dayEnd = timeToMinutes(row.end);
    if (dayStart == null || dayEnd == null) continue;

    let startMinutes = offset === 0 ? roundUpMinutes(seed.getHours() * 60 + seed.getMinutes()) : dayStart;
    if (startMinutes < dayStart) startMinutes = dayStart;

    if (row.break_enabled && intervalFitsWithinDay(row.start, row.end, row.break_start, row.break_end)) {
      const breakStart = timeToMinutes(row.break_start);
      const breakEnd = timeToMinutes(row.break_end);
      if (breakStart != null && breakEnd != null) {
        if (startMinutes >= breakStart && startMinutes < breakEnd) startMinutes = breakEnd;
        if (startMinutes < breakStart && startMinutes + durationMinutes > breakStart) startMinutes = breakEnd;
      }
    }

    if (startMinutes + durationMinutes > dayEnd) continue;

    const start = dateAtMinutes(currentDay, startMinutes);
    const end = dateAtMinutes(currentDay, startMinutes + durationMinutes);
    if (isRangeWithinOperatingHours(start, end, operationHours)) return { start, end };
  }

  const fallbackStart = new Date(baseDate);
  return { start: fallbackStart, end: addMinutes(fallbackStart, durationMinutes) };
}

function buildPeriodTitle({ view, start, end }: DatesSetArg) {
  const type = String(view.type || "");
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (type === "dayGridMonth") {
    const raw = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(startDate);
    return capitalizePt(raw);
  }

  if (type === "timeGridDay") {
    const raw = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(startDate);
    return capitalizePt(raw);
  }

  // Week range (end is exclusive).
  const last = addMinutes(endDate, -1);
  const sameYear = startDate.getFullYear() === last.getFullYear();
  const fmtShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const fmtShortYear = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const startLabel = capitalizePt((sameYear ? fmtShort : fmtShortYear).format(startDate));
  const endLabel = capitalizePt((sameYear ? fmtShort : fmtShortYear).format(last));
  const yearSuffix = sameYear ? ` ${startDate.getFullYear()}` : "";
  return `${startLabel} — ${endLabel}${yearSuffix}`;
}

function getAppointmentEventAppearance(status: unknown) {
  const normalizedStatus = normalizeUiStatus(status);

  if (normalizedStatus === "completed") {
    return {
      classNames: ["cc-agenda-event", "cc-agenda-event--completed"],
      backgroundColor: "#8AF0C7",
      borderColor: "#23D996",
      textColor: "#062B1D",
    };
  }

  if (normalizedStatus === "scheduled") {
    return {
      classNames: ["cc-agenda-event", "cc-agenda-event--scheduled"],
      backgroundColor: "#F3CF69",
      borderColor: "#D2A23D",
      textColor: "#4E3B08",
    };
  }

  if (normalizedStatus === "canceled") {
    return {
      classNames: ["cc-agenda-event", "cc-agenda-event--canceled"],
      backgroundColor: "rgba(2, 89, 64, 0.10)",
      borderColor: "rgba(2, 89, 64, 0.22)",
      textColor: "rgba(6, 43, 29, 0.62)",
    };
  }

  return {
    classNames: ["cc-agenda-event", "cc-agenda-event--confirmed"],
    backgroundColor: "#025940",
    borderColor: "#025940",
    textColor: "#FFFFFF",
  };
}

function appointmentToEventInput(appointment: Appointment) {
  const start = new Date(appointment.startsAt);
  const end = appointment.endsAt ? new Date(appointment.endsAt) : addMinutes(start, 30);
  const patient = appointment.patientName?.trim() || "Consulta";
  const service = appointment.serviceName?.trim() || "";
  const title = service ? `${patient} • ${service}` : patient;
  const appearance = getAppointmentEventAppearance(appointment.status);

  return {
    id: appointment.id,
    title,
    start: appointment.startsAt,
    end: end.toISOString(),
    classNames: appearance.classNames,
    backgroundColor: appearance.backgroundColor,
    borderColor: appearance.borderColor,
    textColor: appearance.textColor,
    extendedProps: {
      patientId: appointment.patientId,
      patientName: appointment.patientName,
      serviceName: appointment.serviceName,
      status: appointment.status,
      notes: appointment.notes,
    },
  };
}

export default function Agenda() {
  const { user } = useAuth();
  const calendarRef = useRef<FullCalendar | null>(null);
  const calendarShellRef = useRef<HTMLDivElement | null>(null);

  const [activeView, setActiveView] = useState<CalendarView>(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) return "timeGridDay";
    return "timeGridWeek";
  });
  const [periodTitle, setPeriodTitle] = useState<string>(() => "");
  const [range, setRange] = useState<{ startIso: string | null; endIso: string | null }>({
    startIso: null,
    endIso: null,
  });

  const appointments = useAppointments({ userId: user?.id || null, startIso: range.startIso, endIso: range.endIso });

  const [actionError, setActionError] = useState<string | null>(null);

  const [axisPortalTarget, setAxisPortalTarget] = useState<HTMLElement | null>(null);
  const [slotStepMinutes, setSlotStepMinutes] = useState<number>(() => readAgendaSlotStepMinutes());
  const agendaResources = useAgendaResources(appointments.clinicId);
  const operationHours = agendaResources.operationHours;
  const patientOptions = agendaResources.patientOptions;
  const serviceOptions = agendaResources.serviceOptions;
  const lookupsLoading = agendaResources.lookupsLoading;
  const lookupsError = agendaResources.lookupsError;
  const scheduleError = agendaResources.scheduleError;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(AGENDA_SLOT_STEP_STORAGE_KEY, String(slotStepMinutes));
    } catch {
      // ignore persistence failures
    }
  }, [slotStepMinutes]);


  const views = useMemo(() => {
    return [
      { id: "timeGridDay", label: "Dia" },
      { id: "timeGridWeek", label: "Semana" },
      { id: "dayGridMonth", label: "Mês" },
    ] satisfies Array<{ id: CalendarView; label: string }>;
  }, []);

  const calendarEvents = useMemo(() => appointments.items.map(appointmentToEventInput), [appointments.items]);
  const calendarWindow = useMemo(() => computeCalendarWindow(operationHours), [operationHours]);
  const calendarStep = useMemo(() => computeCalendarStep(slotStepMinutes), [slotStepMinutes]);
  const calendarBusinessHours = useMemo(() => buildBusinessHoursInput(operationHours), [operationHours]);
  const calendarEndLabel = useMemo(() => formatCalendarEdgeLabel(calendarWindow.maxTime), [calendarWindow.maxTime]);

  useEffect(() => {
    const root = calendarShellRef.current;
    if (!root || activeView === "dayGridMonth") {
      setAxisPortalTarget(null);
      return;
    }

    let frameId = 0;

    const syncTarget = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const host = root.querySelector(".fc-timegrid-axis-chunk");
        setAxisPortalTarget(host instanceof HTMLElement ? host : null);
      });
    };

    syncTarget();

    const observer = new MutationObserver(syncTarget);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", syncTarget);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTarget);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [activeView, calendarWindow.maxTime, calendarWindow.minTime, slotStepMinutes]);

  const canScheduleRange = useCallback(
    (start: Date, end: Date) => isRangeWithinOperatingHours(start, end, operationHours),
    [operationHours]
  );

  const allowCalendarSpan = useCallback(
    (span: DateSpanApi) => canScheduleRange(new Date(span.start), new Date(span.end)),
    [canScheduleRange]
  );

  const setView = useCallback((next: CalendarView) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    setActiveView(next);
    api.changeView(next);
  }, []);

  const goPrev = useCallback(() => calendarRef.current?.getApi()?.prev(), []);
  const goNext = useCallback(() => calendarRef.current?.getApi()?.next(), []);
  const goToday = useCallback(() => calendarRef.current?.getApi()?.today(), []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [patientId, setPatientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [status, setStatus] = useState<UiStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setFormError(null);
  }, []);

  const openCreateDialog = useCallback((start: Date, end: Date) => {
    setDialogMode("create");
    setEditingId(null);
    setPatientId("");
    setServiceId("");
    setNotes("");
    setStatus("scheduled");
    setStartsAtLocal(toLocalDateTimeInputValue(start));
    setEndsAtLocal(toLocalDateTimeInputValue(end));
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((appointment: Appointment) => {
    const start = new Date(appointment.startsAt);
    const end = appointment.endsAt ? new Date(appointment.endsAt) : addMinutes(start, 30);
    const normalizedPatientName = String(appointment.patientName || "").trim();
    const normalizedServiceName = String(appointment.serviceName || "").trim();

    const matchedPatientId = (() => {
      if (appointment.patientId) return String(appointment.patientId);
      if (!normalizedPatientName) return "";
      const lowered = normalizedPatientName.toLocaleLowerCase();
      return patientOptions.find((opt) => opt.name.toLocaleLowerCase() === lowered)?.id || "";
    })();

    const matchedServiceId = (() => {
      if (!normalizedServiceName) return "";
      const lowered = normalizedServiceName.toLocaleLowerCase();
      return serviceOptions.find((opt) => opt.name.toLocaleLowerCase() === lowered)?.id || "";
    })();

    setDialogMode("edit");
    setEditingId(appointment.id);
    setPatientId(matchedPatientId);
    setServiceId(matchedServiceId);
    setNotes(appointment.notes || "");
    setStatus(normalizeUiStatus(appointment.status));
    setStartsAtLocal(toLocalDateTimeInputValue(start));
    setEndsAtLocal(toLocalDateTimeInputValue(end));
    setFormError(null);
    setDialogOpen(true);
  }, [patientOptions, serviceOptions]);

  const openNewFromHeader = useCallback(() => {
    const api = calendarRef.current?.getApi();
    const base = api ? api.getDate() : new Date();
    const now = new Date();
    const seed = new Date(base);
    if (seed.toDateString() === now.toDateString()) {
      seed.setHours(now.getHours(), now.getMinutes(), 0, 0);
    } else {
      seed.setHours(9, 0, 0, 0);
    }

    const nextRange = findNextAvailableRange(seed, operationHours, DEFAULT_APPOINTMENT_DURATION_MINUTES);
    if (!canScheduleRange(nextRange.start, nextRange.end)) {
      setActionError("Defina o horário de funcionamento da clínica para criar novos agendamentos.");
      return;
    }

    setActionError(null);
    openCreateDialog(nextRange.start, nextRange.end);
  }, [canScheduleRange, openCreateDialog, operationHours]);

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setActiveView(arg.view.type as CalendarView);
    setPeriodTitle(buildPeriodTitle(arg));
    setRange({ startIso: arg.start.toISOString(), endIso: arg.end.toISOString() });
  }, []);

  const onSelectSlot = useCallback(
    (arg: DateSelectArg) => {
      const api = calendarRef.current?.getApi();
      api?.unselect();
      if (!canScheduleRange(arg.start, arg.end)) {
        setActionError("Selecione um horário dentro do expediente da clínica.");
        return;
      }
      setActionError(null);
      openCreateDialog(arg.start, arg.end);
    },
    [canScheduleRange, openCreateDialog]
  );

  const onEventClick = useCallback(
    (arg: EventClickArg) => {
      arg.jsEvent.preventDefault();
      const id = String(arg.event.id || "").trim();
      if (!id) return;
      const appointment = appointments.items.find((item) => item.id === id);
      if (!appointment) return;
      openEditDialog(appointment);
    },
    [appointments.items, openEditDialog]
  );

  const onEventDrop = useCallback(
    async (arg: EventDropArg) => {
      setActionError(null);

      const startDate = arg.event.start ? new Date(arg.event.start) : null;
      const endDate = arg.event.end ? new Date(arg.event.end) : null;
      const start = startDate ? startDate.toISOString() : "";
      const end = endDate ? endDate.toISOString() : "";

      if (!start || !end || !startDate || !endDate) {
        arg.revert();
        setActionError("Não foi possível remarcar a consulta.");
        return;
      }

      if (!canScheduleRange(startDate, endDate)) {
        arg.revert();
        setActionError("A consulta precisa ficar dentro do horário de funcionamento da clínica.");
        return;
      }

      const res = await appointments.updateAppointment(String(arg.event.id), { startsAt: start, endsAt: end });
      if (res.error) {
        arg.revert();
        setActionError(res.error);
      }
    },
    [appointments, canScheduleRange]
  );

  const onEventResize = useCallback(
    async (arg: EventResizeDoneArg) => {
      setActionError(null);

      const startDate = arg.event.start ? new Date(arg.event.start) : null;
      const endDate = arg.event.end ? new Date(arg.event.end) : null;
      const start = startDate ? startDate.toISOString() : "";
      const end = endDate ? endDate.toISOString() : "";

      if (!start || !end || !startDate || !endDate) {
        arg.revert();
        setActionError("Não foi possível ajustar a duração.");
        return;
      }

      if (!canScheduleRange(startDate, endDate)) {
        arg.revert();
        setActionError("A duração da consulta precisa ficar dentro do horário de funcionamento da clínica.");
        return;
      }

      const res = await appointments.updateAppointment(String(arg.event.id), { startsAt: start, endsAt: end });
      if (res.error) {
        arg.revert();
        setActionError(res.error);
      }
    },
    [appointments, canScheduleRange]
  );

  const onDateClick = useCallback(
    (arg: { date: Date; view: { type: string }; allDay: boolean }) => {
      if (arg.view.type === "dayGridMonth" || arg.allDay) {
        const clickedDay = new Date(arg.date);
        clickedDay.setHours(9, 0, 0, 0);
        const nextRange = findNextAvailableRange(clickedDay, operationHours, DEFAULT_APPOINTMENT_DURATION_MINUTES);

        if (nextRange.start.toDateString() !== clickedDay.toDateString()) {
          setActionError("A clínica não atende nesse dia.");
          return;
        }

        setActionError(null);
        openCreateDialog(nextRange.start, nextRange.end);
        return;
      }

      const clicked = new Date(arg.date);
      const end = addMinutes(clicked, DEFAULT_APPOINTMENT_DURATION_MINUTES);
      if (!canScheduleRange(clicked, end)) {
        setActionError("Selecione um horário dentro do expediente da clínica.");
        return;
      }

      setActionError(null);
      openCreateDialog(clicked, end);
    },
    [canScheduleRange, openCreateDialog, operationHours]
  );

  const saveAppointment = useCallback(async () => {
    setFormError(null);

    const start = parseLocalDateTimeInput(startsAtLocal);
    const end = parseLocalDateTimeInput(endsAtLocal);
    if (!start || !end) {
      setFormError("Informe data/hora de início e fim.");
      return;
    }
    if (end <= start) {
      setFormError("O horário de fim precisa ser depois do início.");
      return;
    }
    if (!canScheduleRange(start, end)) {
      setFormError("O agendamento precisa ficar dentro do horário de funcionamento da clínica.");
      return;
    }

    if (lookupsLoading) {
      setFormError("Aguarde carregar pacientes e serviços.");
      return;
    }
    if (lookupsError) {
      setFormError(lookupsError);
      return;
    }

    const patient = patientOptions.find((opt) => opt.id === patientId) || null;
    if (!patient) {
      setFormError("Selecione um paciente.");
      return;
    }

    const service = serviceOptions.find((opt) => opt.id === serviceId) || null;
    if (!service) {
      setFormError("Selecione um serviço.");
      return;
    }

    const payload = {
      patientId: patient.id,
      patientName: patient.name,
      serviceName: service.name,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      status,
      notes: notes.trim() ? notes.trim() : null,
    };

    if (dialogMode === "create") {
      const res = await appointments.createAppointment(payload);
      if (res.error) {
        setFormError(res.error);
        return;
      }
      closeDialog();
      return;
    }

    if (!editingId) {
      setFormError("Não foi possível identificar a consulta.");
      return;
    }

    const res = await appointments.updateAppointment(editingId, payload);
    if (res.error) {
      setFormError(res.error);
      return;
    }

    closeDialog();
  }, [
    appointments,
    closeDialog,
    dialogMode,
    editingId,
    endsAtLocal,
    canScheduleRange,
    lookupsError,
    lookupsLoading,
    notes,
    patientId,
    patientOptions,
    serviceId,
    serviceOptions,
    startsAtLocal,
    status,
  ]);

  const handleDelete = useCallback(async () => {
    if (!editingId) return;
    setFormError(null);
    const ok = typeof window !== "undefined" ? window.confirm("Excluir esta consulta?") : true;
    if (!ok) return;

    const res = await appointments.deleteAppointment(editingId);
    if (res.error) {
      setFormError(res.error);
      return;
    }

    closeDialog();
  }, [appointments, closeDialog, editingId]);

  const showInitialCalendarSkeleton = appointments.loading && appointments.items.length === 0;

  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] relative overflow-hidden">
      <div className="absolute top-0 -left-16 w-96 h-96 bg-[#23D996]/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -right-20 w-[540px] h-[540px] bg-[#025940]/5 rounded-full blur-3xl" />

      <main className="relative z-10 max-w-7xl mx-auto px-5 md:px-12 py-7 md:py-10 space-y-6 md:space-y-8">
        <div className="flex flex-col gap-3">
          {appointments.clinicName ? (
            <div className="text-[11px] font-900 uppercase tracking-[0.22em] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] truncate">
              {appointments.clinicName}
            </div>
          ) : appointments.loading ? (
            <Skeleton className="h-3.5 w-32 rounded-full" />
          ) : null}
          <div>
            <h1 className="text-[34px] md:text-5xl font-900 text-[var(--cc-text-primary)] tracking-tight font-['Syne'] leading-[1.05]">
              Agenda
            </h1>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-[14px] md:text-[16px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600 max-w-2xl leading-relaxed">
                Remarque consultas com drag &amp; drop, ajuste duração e registre status em segundos.
              </p>
              <button
                type="button"
                onClick={openNewFromHeader}
                className="cc-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] w-full md:w-auto shrink-0"
              >
                <Plus className="w-4 h-4" />
                Nova consulta
              </button>
            </div>
          </div>
        </div>

        {appointments.error ? (
          <div className="cc-card rounded-3xl p-5 border-[#BE123C]/15 bg-[#FFF1F2]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#BE123C] mt-0.5" />
              <div className="min-w-0">
                <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                  Não foi possível carregar a agenda
                </div>
                <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] font-600">
                  {appointments.error}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {scheduleError ? (
          <div className="cc-card rounded-3xl p-5 border-[#BE123C]/15 bg-[#FFF1F2]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#BE123C] mt-0.5" />
              <div className="min-w-0">
                <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">
                  Horário de funcionamento indisponível
                </div>
                <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] font-600">
                  {scheduleError}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {actionError ? (
          <div className="cc-card rounded-3xl p-5 border-[#BE123C]/15 bg-[#FFF1F2]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#BE123C] mt-0.5" />
              <div className="min-w-0">
                <div className="text-[13px] font-900 text-[var(--cc-text-primary)] font-['Space_Grotesk']">Ação não concluída</div>
                <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-80 font-['Space_Grotesk'] font-600">{actionError}</div>
              </div>
            </div>
          </div>
        ) : null}

        <section className="cc-card rounded-3xl overflow-hidden flex flex-col">
          <div className="px-5 md:px-6 py-5 md:py-6 border-b border-[var(--cc-border)] bg-[var(--cc-bg-white)]">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-center">
              <div className="min-w-0">
                <div className="text-[18px] md:text-[22px] font-900 text-[var(--cc-text-primary)] font-['Syne'] tracking-tight truncate">
                  {periodTitle || " "}
                </div>
                <div className="mt-1 text-[12px] text-[var(--cc-text-muted)] opacity-70 font-['Space_Grotesk'] font-700">
                  Clique para criar • Clique no evento para editar
                </div>
              </div>

              <div className="flex lg:justify-center">
                <div className="inline-flex p-1 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] shadow-sm">
                  {views.map((item) => {
                    const active = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setView(item.id)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[13px] font-['Space_Grotesk'] font-800 transition-colors",
                          active
                            ? "bg-[var(--cc-primary)] text-[var(--cc-text-on-primary)] shadow-sm"
                            : "text-[var(--cc-primary)] opacity-60 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)]"
                        )}
                        aria-pressed={active}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
                <label className="inline-flex items-center gap-2 rounded-2xl border border-[var(--cc-border)] bg-[var(--cc-bg-white)] px-3 py-2 text-[12px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-700">
                  <span className="hidden md:inline">Blocos</span>
                  <select
                    value={slotStepMinutes}
                    onChange={(e) => setSlotStepMinutes(Number(e.target.value) || DEFAULT_SLOT_STEP_MINUTES)}
                    className="bg-transparent border-0 p-0 pr-5 text-[13px] text-[var(--cc-primary)] font-800 focus:ring-0"
                    aria-label="Intervalo visual da agenda"
                  >
                    {SLOT_STEP_OPTIONS.map((option) => (
                      <option key={option.minutes} value={option.minutes}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goPrev}
                    className="w-10 h-10 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] transition-colors inline-flex items-center justify-center"
                    aria-label="Anterior"
                    title="Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="w-10 h-10 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] opacity-70 hover:opacity-100 hover:bg-[var(--cc-bg-subtle)] transition-colors inline-flex items-center justify-center"
                    aria-label="Próximo"
                    title="Próximo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={goToday}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[var(--cc-bg-white)] border border-[var(--cc-border)] text-[var(--cc-primary)] hover:bg-[var(--cc-bg-subtle)] transition-colors font-['Space_Grotesk'] font-800 text-[13px]"
                  >
                    Hoje
                  </button>
                </div>

              </div>
            </div>
          </div>

          <div className="p-3 md:p-4">
            <div className="cc-agenda-fc h-[720px] md:h-[780px] rounded-3xl border border-[var(--cc-border)] bg-[var(--cc-bg-white)] overflow-hidden">
              <div ref={calendarShellRef} className="relative h-full">
                {showInitialCalendarSkeleton ? (
                  <div className="h-full p-5 md:p-6 bg-[var(--cc-bg-white)]">
                    <Skeleton className="h-9 w-48 rounded-2xl" />
                    <div className="mt-4 grid h-[620px] grid-cols-7 gap-3">
                      {Array.from({ length: 7 }).map((_, index) => (
                        <div key={index} className="flex h-full flex-col gap-3">
                          <Skeleton className="h-5 w-20 rounded-full" />
                          <Skeleton className="flex-1 rounded-[28px]" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <FullCalendar
                      ref={calendarRef}
                      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                      initialView={activeView}
                      headerToolbar={false}
                      footerToolbar={false}
                      locale={ptBrLocale}
                      height="100%"
                      expandRows={true}
                      events={calendarEvents}
                      editable={true}
                      selectable={true}
                      selectMirror={true}
                      nowIndicator={true}
                      allDaySlot={false}
                      slotDuration={calendarStep.slotDuration}
                      snapDuration={calendarStep.snapDuration}
                      slotLabelInterval="01:00:00"
                      slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                      slotMinTime={calendarWindow.minTime}
                      slotMaxTime={calendarWindow.maxTime}
                      businessHours={calendarBusinessHours}
                      selectConstraint="businessHours"
                      eventConstraint="businessHours"
                      selectAllow={allowCalendarSpan}
                      eventAllow={allowCalendarSpan}
                      eventOverlap={true}
                      eventStartEditable={true}
                      eventDurationEditable={true}
                      datesSet={onDatesSet}
                      select={onSelectSlot}
                      dateClick={onDateClick as any}
                      eventClick={onEventClick}
                      eventDrop={onEventDrop}
                      eventResize={onEventResize}
                    />

                    {activeView !== "dayGridMonth" && axisPortalTarget
                      ? createPortal(
                          <div className="cc-agenda-axis-end-label" aria-hidden="true">
                            <div className="fc-timegrid-slot-label-frame">
                              <div className="fc-timegrid-slot-label-cushion">{calendarEndLabel}</div>
                            </div>
                          </div>,
                          axisPortalTarget
                        )
                      : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent
          className="p-0 bg-transparent border-0 shadow-none max-w-[calc(100%-2rem)] sm:max-w-xl"
          showCloseButton={false}
        >
          <div className="bg-[var(--cc-bg-white)] rounded-[2rem] border border-[var(--cc-border)] shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden">
            <DialogHeader className="px-7 md:px-8 pt-7 md:pt-8">
              <DialogTitle className="font-['Syne'] font-800 text-xl text-[var(--cc-text-primary)]">
                {dialogMode === "create" ? "Nova consulta" : "Editar consulta"}
              </DialogTitle>
              <div className="mt-1 text-[13px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] font-600 opacity-80">
                {dialogMode === "create" ? "Crie um novo agendamento na agenda." : "Atualize os detalhes do agendamento."}
              </div>
            </DialogHeader>

            <div className="px-7 md:px-8 pb-7 md:pb-8 pt-6 space-y-4">
              {formError || lookupsError ? (
                <div className="rounded-2xl border border-[#BE123C]/20 bg-[#FFF1F2] px-4 py-3 text-[12px] text-[#BE123C] font-['Space_Grotesk'] font-700">
                  {formError || lookupsError}
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-900 uppercase tracking-[0.2em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Paciente
                  </label>
                  {lookupsLoading && !patientOptions.length && !lookupsError ? (
                    <Skeleton className="h-[54px] w-full rounded-2xl" />
                  ) : (
                    <select
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      className={INPUT}
                      autoFocus
                      disabled={lookupsLoading || Boolean(lookupsError) || patientOptions.length === 0}
                    >
                      <option value="" disabled>
                        {patientOptions.length ? "Selecione um paciente…" : "Nenhum paciente cadastrado"}
                      </option>
                      {patientOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-900 uppercase tracking-[0.2em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Serviço
                  </label>
                  {lookupsLoading && !serviceOptions.length && !lookupsError ? (
                    <Skeleton className="h-[54px] w-full rounded-2xl" />
                  ) : (
                    <select
                      value={serviceId}
                      onChange={(e) => setServiceId(e.target.value)}
                      className={INPUT}
                      disabled={lookupsLoading || Boolean(lookupsError) || serviceOptions.length === 0}
                    >
                      <option value="" disabled>
                        {serviceOptions.length ? "Selecione um serviço…" : "Nenhum serviço cadastrado"}
                      </option>
                      {serviceOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-900 uppercase tracking-[0.2em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Início
                  </label>
                  <input
                    type="datetime-local"
                    value={startsAtLocal}
                    onChange={(e) => setStartsAtLocal(e.target.value)}
                    className={INPUT}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-900 uppercase tracking-[0.2em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Fim
                  </label>
                  <input
                    type="datetime-local"
                    value={endsAtLocal}
                    onChange={(e) => setEndsAtLocal(e.target.value)}
                    className={INPUT}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-900 uppercase tracking-[0.2em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                    Status
                  </label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as UiStatus)} className={INPUT}>
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-900 uppercase tracking-[0.2em] text-[var(--cc-text-muted)] opacity-60 font-['Space_Grotesk']">
                  Observações
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações internas…"
                  className={cn(INPUT, "min-h-[110px] resize-none")}
                />
              </div>
            </div>

            <DialogFooter className="px-7 md:px-8 pb-7 md:pb-8 pt-0 flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {dialogMode === "edit" ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-[#BE123C]/25 bg-[#FFF1F2] text-[#BE123C] hover:bg-[#FFE4E6] transition-colors font-['Syne'] font-800 text-[13px]"
                  disabled={appointments.saving}
                >
                  <Trash2 className="w-4 h-4" />
                  Deletar
                </button>
              ) : (
                <div />
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="cc-btn-outline inline-flex items-center justify-center px-4 py-2.5 rounded-2xl text-[13px]"
                  disabled={appointments.saving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveAppointment}
                  className="cc-btn-primary inline-flex items-center justify-center px-4 py-2.5 rounded-2xl text-[13px]"
                  disabled={appointments.saving || lookupsLoading || Boolean(lookupsError)}
                >
                  {appointments.saving ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
