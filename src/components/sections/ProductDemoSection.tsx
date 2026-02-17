/**
 * ClinicCortex ProductDemoSection — Light Mode Premium
 */

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Users, TrendingUp, Calendar, Activity, LayoutDashboard } from "lucide-react";

const CALENDAR_EVENTS = [
  { title: "Dr. Ana Lima — Consulta", start: new Date().toISOString().slice(0, 10) + "T09:00:00", end: new Date().toISOString().slice(0, 10) + "T09:45:00", color: "var(--cc-primary)" },
  { title: "Dr. Carlos Mendes — Retorno", start: new Date().toISOString().slice(0, 10) + "T10:00:00", end: new Date().toISOString().slice(0, 10) + "T10:30:00", color: "var(--cc-secondary)" },
  { title: "Dra. Sofia Ramos — Avaliação", start: new Date().toISOString().slice(0, 10) + "T11:00:00", end: new Date().toISOString().slice(0, 10) + "T12:00:00", color: "var(--cc-tertiary)" },
  { title: "Dr. Pedro Alves — Consulta", start: new Date().toISOString().slice(0, 10) + "T14:00:00", end: new Date().toISOString().slice(0, 10) + "T14:45:00", color: "var(--cc-primary)" },
  { title: "Dra. Maria Santos — Retorno", start: new Date().toISOString().slice(0, 10) + "T15:00:00", end: new Date().toISOString().slice(0, 10) + "T15:30:00", color: "var(--cc-secondary)" },
  { title: "Dr. Lucas Oliveira — Avaliação", start: new Date().toISOString().slice(0, 10) + "T16:00:00", end: new Date().toISOString().slice(0, 10) + "T17:00:00", color: "var(--cc-primary)" },
];
const today = new Date();
for (let d = 1; d <= 5; d++) {
  const date = new Date(today);
  date.setDate(today.getDate() + d);
  const dateStr = date.toISOString().slice(0, 10);
  CALENDAR_EVENTS.push(
    { title: "Consulta Agendada", start: `${dateStr}T09:30:00`, end: `${dateStr}T10:00:00`, color: "var(--cc-primary)" },
    { title: "Retorno Confirmado", start: `${dateStr}T14:00:00`, end: `${dateStr}T14:30:00`, color: "var(--cc-secondary)" },
  );
}

const METRICS = [
  { icon: Users, label: "Pacientes Ativos", value: "1.247", change: "+18%", positive: true },
  { icon: TrendingUp, label: "Taxa de Retorno", value: "84%", change: "+12%", positive: true },
  { icon: Calendar, label: "Consultas/Mês", value: "342", change: "+24%", positive: true },
  { icon: Activity, label: "No-show Rate", value: "2.1%", change: "-96%", positive: true },
];

const RECENT_PATIENTS = [
  { name: "Ana Beatriz Silva", type: "Consulta", time: "09:00", status: "confirmed" },
  { name: "Carlos Eduardo Mendes", type: "Retorno", time: "10:00", status: "confirmed" },
  { name: "Sofia Ramos Pereira", type: "Avaliação", time: "11:00", status: "pending" },
  { name: "Pedro Alves Costa", type: "Consulta", time: "14:00", status: "confirmed" },
];

export default function ProductDemoSection() {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true, margin: "-100px" });
  const [activeTab, setActiveTab] = useState<"dashboard" | "calendar">("dashboard");

  return (
    <section id="demo" className="relative py-24 lg:py-32 bg-[var(--cc-bg-white)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(35,217,150,0.05),transparent)]" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div ref={titleRef} className="text-center mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 mb-4">
            <span className="cc-home-chip px-3 py-1 rounded-full text-xs font-['Space_Grotesk'] font-700 tracking-wider uppercase">
              Demonstração
            </span>
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.6 }} className="font-['Syne'] font-800 text-3xl sm:text-4xl lg:text-5xl text-[var(--cc-text-primary)] mb-4 tracking-tight">
            Veja o ClinicCortex{" "}<span className="cc-gradient-text">em ação</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={titleInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2, duration: 0.6 }} className="text-base sm:text-lg text-[var(--cc-text-muted)] opacity-90 font-['Space_Grotesk'] max-w-2xl mx-auto">
            Dashboard operacional completo e agenda inteligente integrados em uma experiência fluida.
          </motion.p>
        </div>

        {/* Tab switcher */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex justify-center mb-8">
          <div className="inline-flex cc-home-panel-soft rounded-xl p-1 gap-1">
            {(["dashboard", "calendar"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-lg text-sm font-['Space_Grotesk'] font-600 transition-all duration-300 ${
                  activeTab === tab
                    ? "bg-[var(--cc-primary)] text-[var(--cc-text-on-primary)] shadow-sm"
                    : "text-[var(--cc-text-muted)] opacity-80 hover:text-[var(--cc-primary)] hover:opacity-100"
                }`}
              >
                {tab === "dashboard" ? "Dashboard" : "Agenda Inteligente"}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Demo frame */}
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="cc-home-panel rounded-2xl overflow-hidden"
        >
          {/* Mock browser bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--cc-border)] bg-[var(--cc-bg-subtle)]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[rgba(239,68,68,0.45)]" />
              <div className="w-3 h-3 rounded-full bg-[rgba(234,179,8,0.55)]" />
              <div className="w-3 h-3 rounded-full bg-[rgba(34,197,94,0.55)]" />
            </div>
            <div className="flex-1 mx-4">
              <div className="cc-home-panel rounded-lg px-3 py-1 text-xs text-[var(--cc-text-muted)] font-['Space_Grotesk'] max-w-xs">
                app.cliniccortex.com.br
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--cc-tertiary)] animate-pulse" />
              <span className="text-xs text-[var(--cc-text-muted)] font-['Space_Grotesk']">Live</span>
            </div>
          </div>

          {/* Dashboard with Sidebar Mockup */}
          {activeTab === "dashboard" && (
            <div className="flex bg-[var(--cc-bg-subtle)] min-h-[480px]">
              {/* Simulated Sidebar */}
              <div className="w-12 sm:w-16 border-r border-[color:var(--cc-border)] bg-[var(--cc-bg-white)] flex flex-col items-center py-6 gap-6">
                <div className="w-8 h-8 rounded-lg bg-[var(--cc-primary)] flex items-center justify-center text-[var(--cc-text-on-primary)] font-['Syne'] font-800 text-xs">C</div>
                <div className="flex flex-col gap-4">
                  {[Calendar, Users, Activity, LayoutDashboard].map((Icon, i) => (
                    <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${i === 3 ? "bg-[var(--cc-accent-soft)] text-[var(--cc-primary)]" : "text-[var(--cc-text-muted)] hover:bg-[var(--cc-bg-subtle)]"}`}>
                      <Icon className="w-4 h-4" strokeWidth={1.5} />
                    </div>
                  ))}
                </div>
                <div className="mt-auto w-8 h-8 rounded-full bg-[var(--cc-accent-soft)] overflow-hidden">
                  <div
                    className="w-full h-full"
                    style={{ background: "color-mix(in srgb, var(--cc-secondary) 20%, transparent)" }}
                  />
                </div>
              </div>

              {/* Main App Content */}
              <div className="flex-1 p-4 sm:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-['Syne'] font-700 text-sm text-[var(--cc-text-primary)]">Performance da Clínica</h3>
                    <p className="text-[10px] text-[var(--cc-text-muted)] font-['Space_Grotesk']">Plano Professional · Unidade Jardins</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="cc-home-chip px-2 py-0.5 rounded-full text-[10px] font-['Space_Grotesk']">Fev/2026</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  {METRICS.map((metric, i) => {
                    const Icon = metric.icon;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08, duration: 0.4 }}
                        className="cc-home-panel rounded-xl p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className="w-3.5 h-3.5 text-[var(--cc-primary)]" strokeWidth={1.5} />
                          <span className="text-[10px] font-['Space_Grotesk'] font-600 text-[var(--cc-secondary)]">{metric.change}</span>
                        </div>
                        <div className="font-['Syne'] font-800 text-lg text-[var(--cc-text-primary)]">{metric.value}</div>
                        <div className="text-[10px] text-[var(--cc-text-muted)] font-['Space_Grotesk'] mt-0.5">{metric.label}</div>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="grid lg:grid-cols-3 gap-4">
                  {/* Chart */}
                  <div className="lg:col-span-2 cc-home-panel rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-['Syne'] font-700 text-xs text-[var(--cc-text-primary)]">Evolução de Pacientes</h3>
                      <span className="text-[10px] text-[var(--cc-text-muted)] font-['Space_Grotesk']">Últimos 6 meses</span>
                    </div>
                    <div className="flex items-end gap-2 h-20">
                      {[65, 72, 68, 85, 91, 100].map((h, i) => (
                        <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: i * 0.1, duration: 0.6 }}
                          className="flex-1 rounded-t-sm relative group"
                          style={{ background: "linear-gradient(to top, var(--cc-primary), color-mix(in srgb, var(--cc-tertiary) 40%, transparent))", opacity: 0.7 + i * 0.05 }}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Quick Access */}
                  <div className="cc-home-panel rounded-xl p-4">
                    <h3 className="font-['Syne'] font-700 text-xs text-[var(--cc-text-primary)] mb-4">Próximos</h3>
                    <div className="flex flex-col gap-2">
                      {RECENT_PATIENTS.slice(0, 3).map((patient, i) => (
                        <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[var(--cc-bg-subtle)]">
                          <div className="w-6 h-6 rounded-full bg-[var(--cc-accent-soft)] flex items-center justify-center text-[10px] font-700 text-[var(--cc-primary)]">{patient.name.charAt(0)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-600 text-[var(--cc-text-primary)] truncate">{patient.name.split(" ")[0]}</div>
                            <div className="text-[9px] text-[var(--cc-text-muted)]">{patient.time}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Calendar */}
          {activeTab === "calendar" && (
            <div className="p-4 sm:p-6 bg-[var(--cc-bg-subtle)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-['Syne'] font-700 text-base text-[var(--cc-text-primary)]">Agenda Inteligente ClinicCortex</h3>
                  <p className="text-xs text-[var(--cc-text-muted)] font-['Space_Grotesk'] mt-0.5">Confirmações automáticas via WhatsApp · Lembretes inteligentes</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--cc-tertiary)] animate-pulse" />
                  <span className="text-xs text-[var(--cc-text-muted)] font-['Space_Grotesk']">Sincronizado</span>
                </div>
              </div>
              <div className="cc-home-panel rounded-xl overflow-hidden" style={{ height: "480px" }}>
                <div className="cc-public-fc h-full">
                  <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
                    events={CALENDAR_EVENTS}
                    height="100%"
                    locale="pt-br"
                    buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia" }}
                    slotMinTime="08:00:00"
                    slotMaxTime="19:00:00"
                    allDaySlot={false}
                    nowIndicator={true}
                    editable={true}
                    selectable={true}
                    eventColor="var(--cc-primary)"
                    eventTextColor="var(--cc-text-on-primary)"
                  />
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
