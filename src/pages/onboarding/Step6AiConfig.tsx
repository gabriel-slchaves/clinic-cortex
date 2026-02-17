import { navigateToAppPath } from "@/lib/appOrigin";
import { useAuth } from "@/contexts/AuthContext";
import { useCortexAIConfig } from "@/hooks/useCortexAIConfig";
import { supabase } from "@/lib/supabase";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  PencilLine,
  RefreshCcw,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type PersonalityId = "executivo" | "acolhedor" | "direto";
type PromptMode = "auto" | "custom";
type Step6AiConfigMode = "onboarding" | "app";

type ClinicRow = {
  id: string;
  name: string;
  assistant_area: string | null;
  assistant_specialties: string[] | null;
  assistant_personality?: string | null;
  assistant_prompt?: string | null;
  onboarding_step?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  operation_days?: string[] | null;
  operation_hours?: unknown | null;
  shift_morning_enabled?: boolean | null;
  shift_morning_start?: string | null;
  shift_morning_end?: string | null;
  shift_afternoon_enabled?: boolean | null;
  shift_afternoon_start?: string | null;
  shift_afternoon_end?: string | null;
};

type ServiceLite = {
  name: string;
  mode: string;
  duration_minutes: number;
  price_brl: number | null;
};

const ASSISTANT_NAME = "CortexAI";
const PROMPT_TEMPLATE_VERSION = 2;

const PERSONALITIES: Array<{
  id: PersonalityId;
  label: string;
  short: string;
  description: string;
}> = [
  {
    id: "executivo",
    label: "Profissional & Executivo",
    short: "Executivo",
    description: "Objetivo, organizado, com linguagem clara e formal na medida certa.",
  },
  {
    id: "acolhedor",
    label: "Acolhedor & Empático",
    short: "Acolhedor",
    description: "Humano, gentil, tranquilizador e com foco em acolhimento.",
  },
  {
    id: "direto",
    label: "Direto & Eficiente",
    short: "Direto",
    description: "Curto, eficiente e sem rodeios, sem perder a educação.",
  },
];

function step6DraftKey(clinicId: string) {
  return `cc_onboarding_step6_ai_config_${clinicId}`;
}

function normalizePersonality(value: unknown): PersonalityId {
  if (value === "acolhedor" || value === "direto" || value === "executivo") return value;
  return "executivo";
}

function areaTitle(area: string | null | undefined) {
  const v = String(area || "").trim().toLowerCase();
  if (v === "medicina") return "Medicina";
  if (v === "nutricao") return "Nutrição";
  if (v === "psicologia") return "Psicologia";
  if (v === "odontologia") return "Odontologia";
  if (v === "fisioterapia") return "Fisioterapia";
  if (v === "estetica") return "Estética";
  return "";
}

function personalityToken(p: PersonalityId) {
  if (p === "acolhedor") return "ACOLHEDOR";
  if (p === "direto") return "DIRETO";
  return "EXECUTIVO";
}

const PROMPT_TEMPLATE = `Você é {{ASSISTANT_NAME}}, assistente virtual da {{CLINIC_NAME}}, 
especializada em {{ASSISTANT_AREA}}.

Seu estilo de atendimento é {{ASSISTANT_PERSONALITY}}.

[EXECUTIVO]: Comunicação objetiva, linguagem formal, respostas 
diretas sem rodeios. Evite emojis excessivos.

[ACOLHEDOR]: Comunicação calorosa, empática e próxima. Use o nome 
do paciente. Emojis leves são bem-vindos 😊.

[DIRETO]: Respostas curtas e claras. Vá direto ao ponto sem 
formalidade excessiva nem excesso de empatia.

---

SOBRE A CLÍNICA

Nome: {{CLINIC_NAME}}
Área de atuação: {{ASSISTANT_AREA}}
Especialidades atendidas: {{ASSISTANT_SPECIALTIES}}
Localização: {{CLINIC_LOCATION}}

---

SERVIÇOS DISPONÍVEIS

{{SERVICES_TABLE}}

Ao apresentar serviços ao paciente, use linguagem natural — 
não exiba a tabela bruta.

---

HORÁRIOS DE ATENDIMENTO

Dias de funcionamento: {{OPERATION_DAYS}}

Horários por dia:
{{OPERATION_HOURS}}

Nunca ofereça horários fora desses intervalos.
Se o paciente solicitar um horário indisponível, ofereça 
as alternativas mais próximas.

---

SUAS CAPACIDADES

Você pode realizar diretamente:
- Agendar consultas (verificando disponibilidade em tempo real)
- Remarcar ou cancelar consultas existentes
- Confirmar presença de pacientes
- Responder dúvidas gerais sobre a clínica, serviços e horários

Você NÃO pode:
- Dar diagnósticos, opiniões clínicas ou interpretar exames
- Compartilhar dados de outros pacientes
- Confirmar informações que não estejam no seu contexto
- Realizar cobranças ou negociar valores
- Atender solicitações fora do escopo de {{ASSISTANT_AREA}}

Se a solicitação estiver fora das suas capacidades, informe 
claramente e oriente o paciente a entrar em contato com a clínica.

---

FLUXO DE AGENDAMENTO

Ao identificar intenção de agendar:
1. Pergunte o nome completo do paciente
2. Se o paciente ainda não informou o serviço ou a especialidade, apresente primeiro as opções disponíveis no seu contexto antes de pedir a preferência
3. Se houver apenas um serviço disponível no contexto, ofereça esse serviço diretamente de forma natural
4. Não peça nome de profissional se o contexto não trouxer uma lista explícita de profissionais cadastrados
5. Verifique se o atendimento é presencial ou online
   — Para presencial: confirme disponibilidade de comparecer 
     a {{CLINIC_LOCATION}}
6. Ofereça no máximo 3 opções de data e horário disponíveis
7. Confirme todos os dados antes de registrar:
   nome, serviço, modalidade, data e horário
8. Envie resumo completo após confirmação

Nunca registre um agendamento sem confirmação explícita do paciente.

---

FLUXO DE REMARCAÇÃO OU CANCELAMENTO

1. Solicite nome completo e data da consulta atual
2. Confirme os dados da consulta encontrada
3. Remarcação: ofereça novas opções disponíveis dentro do horário 
   de funcionamento
4. Cancelamento: confirme a intenção antes de executar
5. Envie confirmação após qualquer alteração

---

FLUXO DE CONFIRMAÇÃO DE PRESENÇA

Mensagem padrão de confirmação:
"Olá, [nome do paciente]! 👋 Passando para confirmar seu(sua) 
[nome do serviço] [presencial/online] amanhã, 
[data], às [horário]. Você confirma sua presença?"

— Aceite variações de "sim" como confirmação.
— Se o paciente não puder comparecer, inicie o fluxo de remarcação.
— Para atendimento presencial, reforce o endereço: {{CLINIC_LOCATION}}

---

REGRAS DE COMPORTAMENTO

- Apresente-se apenas no primeiro contato da conversa
- Ao se apresentar, use o nome oficial da clínica sempre que ele estiver disponível
- Use o nome do paciente sempre que souber
- Nunca invente informações — se não souber, diga que não sabe
- Em caso de dúvida sobre a intenção do paciente, pergunte antes 
  de agir
- Não discuta assuntos fora do escopo da clínica
- Nunca confirme dados de um paciente para terceiros

---

PRIVACIDADE E LGPD

Você lida com dados sensíveis de saúde. Sempre:
- Colete apenas os dados necessários para a ação solicitada
- Não repita dados sensíveis desnecessariamente na conversa
- Em caso de dúvida sobre consentimento, não prossiga com a ação
- Nunca armazene ou mencione informações clínicas além do 
  necessário para o agendamento`;

function formatPriceBRL(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Sob consulta";
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  }
}

const DAY_LABEL: Record<string, string> = {
  mon: "SEG",
  tue: "TER",
  wed: "QUA",
  thu: "QUI",
  fri: "SEX",
  sat: "SÁB",
  sun: "DOM",
};

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function formatOperationDays(days: unknown) {
  const list = Array.isArray(days) ? (days as string[]).filter(Boolean) : [];
  const mapped = list.map((d) => DAY_LABEL[String(d).toLowerCase()] || String(d).toUpperCase());
  if (!mapped.length) return "Não informado";
  return mapped.join(", ");
}

function coerceTime(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const v = value.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(v) ? v : fallback;
}

function formatShift(enabled: unknown, start: unknown, end: unknown) {
  if (enabled === false) return "Indisponível";
  const s = typeof start === "string" ? start.slice(0, 5) : "";
  const e = typeof end === "string" ? end.slice(0, 5) : "";
  if (s && e) return `${s} às ${e}`;
  return "Não informado";
}

function digitsOnly(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function formatCep(value: string) {
  const d = digitsOnly(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function normalizeUf(value: string) {
  const v = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : "";
}

function parseClinicAddressText(address: string) {
  const lines = String(address || "")
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let line2 = "";
  let line3 = "";

  if (lines.length >= 3) {
    line2 = lines[1] || "";
    line3 = lines.slice(2).join(" ");
  } else if (lines.length === 2) {
    line2 = lines[0] || "";
    line3 = lines[1] || "";
  } else if (lines.length === 1) {
    line2 = lines[0] || "";
  }

  let street = "";
  let number = "";
  let complement = "";
  let neighborhood = "";

  if (line2) {
    const parts = line2
      .split(" - ")
      .map((p) => p.trim())
      .filter(Boolean);

    const first = parts[0] || "";
    if (first) {
      const idx = first.lastIndexOf(",");
      if (idx >= 0) {
        street = first.slice(0, idx).trim();
        number = first.slice(idx + 1).trim();
      } else {
        street = first.trim();
      }
    }

    const looksLikeComplement = (v: string) =>
      /(sala|apto|apart|apartamento|conj|conjunto|bloco|andar|casa|fundos|lote|cj)\b/i.test(v);

    if (parts.length >= 3) {
      complement = parts[1] || "";
      neighborhood = parts.slice(2).join(" - ");
    } else if (parts.length === 2) {
      const p = parts[1] || "";
      if (looksLikeComplement(p)) complement = p;
      else neighborhood = p;
    }
  }

  let cep = "";
  let city = "";
  let uf = "";
  if (line3) {
    // Backward compatible with older saved values: "CEP • Cidade • UF"
    const parts = line3
      .split("•")
      .map((p) => p.trim())
      .filter(Boolean);

    const cepDigits = digitsOnly(parts[0] || "");
    if (cepDigits.length >= 8) cep = cepDigits.slice(0, 8);

    city = String(parts[1] || "").trim();
    uf = normalizeUf(parts[2] || "");
  }

  return { street, number, complement, neighborhood, cep, city, uf };
}

function formatOperationHoursByDay({
  operationHours,
  operationDays,
  fallbackStart,
  fallbackEnd,
}: {
  operationHours: unknown;
  operationDays: unknown;
  fallbackStart: string;
  fallbackEnd: string;
}) {
  const enabledFromDays = new Set(
    Array.isArray(operationDays) ? (operationDays as any[]).map((d) => String(d || "").toLowerCase()) : []
  );

  const raw = operationHours && typeof operationHours === "object" ? (operationHours as any) : null;
  const lines: string[] = [];

  for (const dayId of DAY_ORDER) {
    const row = raw ? raw[dayId] : null;
    const enabled = typeof row?.enabled === "boolean" ? Boolean(row.enabled) : enabledFromDays.has(dayId);
    if (!enabled) continue;

    const start = typeof row?.start === "string" ? String(row.start).slice(0, 5) : fallbackStart;
    const end = typeof row?.end === "string" ? String(row.end).slice(0, 5) : fallbackEnd;
    const breakEnabled = Boolean(row?.break_enabled);
    const breakStart = typeof row?.break_start === "string" ? String(row.break_start).slice(0, 5) : "";
    const breakEnd = typeof row?.break_end === "string" ? String(row.break_end).slice(0, 5) : "";
    const label = DAY_LABEL[dayId] || dayId.toUpperCase();
    if (start && end) {
      const interval =
        breakEnabled && /^\d{2}:\d{2}$/.test(breakStart) && /^\d{2}:\d{2}$/.test(breakEnd)
          ? ` (intervalo ${breakStart} às ${breakEnd})`
          : "";
      lines.push(`${label}: ${start} às ${end}${interval}`);
    }
    else lines.push(`${label}: Não informado`);
  }

  if (!lines.length) return "Não informado";
  return lines.join("\n");
}

function buildServicesTable(services: ServiceLite[]) {
  if (!services.length) return "_Nenhum serviço cadastrado ainda._";
  const header = `| Serviço | Modalidade | Duração | Valor |\n|---|---|---:|---|`;
  const rows = services.map((s) => {
    const mode = s.mode === "online" ? "Online" : "Presencial";
    const dur = `${Math.max(0, Number(s.duration_minutes || 0))} min`;
    const price = formatPriceBRL(s.price_brl);
    const name = String(s.name || "").trim() || "Serviço";
    return `| ${name} | ${mode} | ${dur} | ${price} |`;
  });
  return `${header}\n${rows.join("\n")}`;
}

function buildScheduleSummary({
  operationDays,
  shiftMorning,
  shiftAfternoon,
}: {
  operationDays: string;
  shiftMorning: string;
  shiftAfternoon: string;
}) {
  // Legacy helper kept for compatibility with older saved prompts.
  if (!operationDays && !shiftMorning && !shiftAfternoon) return "";
  return `Resumo:\n- Manhã: ${shiftMorning}\n- Tarde: ${shiftAfternoon}`;
}

function buildClinicLocation(clinic: ClinicRow | null) {
  const addressRaw = String(clinic?.address || "").trim();
  const cityDb = String(clinic?.city || "").trim();
  const stateDb = String(clinic?.state || "").trim();

  const hasAnyLocation = Boolean(addressRaw || cityDb || stateDb);
  if (!hasAnyLocation) return "Atendimento online (sem endereço físico)";

  const parsed = addressRaw ? parseClinicAddressText(addressRaw) : null;

  const street = String(parsed?.street || "").trim();
  const number = String(parsed?.number || "").trim();
  const complement = String(parsed?.complement || "").trim();
  const neighborhood = String(parsed?.neighborhood || "").trim();
  const cep = parsed?.cep ? formatCep(parsed.cep) : "";
  const city = cityDb || String(parsed?.city || "").trim();
  const state = stateDb || String(parsed?.uf || "").trim();

  const line1 = [street, number].filter(Boolean).join(", ").trim();
  const extra = [complement, neighborhood].filter(Boolean).join(" - ").trim();
  const addressLine = [line1, extra].filter(Boolean).join(" - ").trim();

  const main = [addressLine, cep].filter(Boolean).join(", ").trim();
  const tail = [city, state].filter(Boolean).join(" - ").trim();
  const parts = [main, tail].filter(Boolean);
  if (parts.length) return parts.join(", ").replace(/\s+/g, " ").trim();

  return (addressRaw || [cityDb, stateDb].filter(Boolean).join(" - ")).replace(/\s+/g, " ").trim();
}

function interpolatePrompt(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    const k = String(key || "");
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? "") : "";
  });
}

function buildPromptSignature({
  clinic,
  personality,
  services,
}: {
  clinic: ClinicRow | null;
  personality: PersonalityId;
  services: ServiceLite[];
}) {
  const c = clinic || ({} as ClinicRow);
  const servicesSig = services.map((s) => ({
    name: String(s.name || "").trim(),
    mode: String(s.mode || "").trim(),
    duration_minutes: Number(s.duration_minutes || 0),
    price_brl: s.price_brl == null ? null : Number(s.price_brl),
  }));

  // Keep this intentionally small/stable; only data that changes the rendered prompt should be here.
  const sig = {
    v: PROMPT_TEMPLATE_VERSION,
    clinic: {
      name: String(c.name || "").trim(),
      assistant_area: String(c.assistant_area || "").trim(),
      assistant_specialties: Array.isArray(c.assistant_specialties) ? c.assistant_specialties.filter(Boolean) : [],
      assistant_personality: String(personality || "").trim(),
      address: String(c.address || "").trim(),
      city: String(c.city || "").trim(),
      state: String(c.state || "").trim(),
      operation_days: Array.isArray(c.operation_days) ? c.operation_days : [],
      operation_hours: (c as any)?.operation_hours ?? null,
      shift_morning_enabled: Boolean((c as any)?.shift_morning_enabled),
      shift_morning_start: String((c as any)?.shift_morning_start || ""),
      shift_morning_end: String((c as any)?.shift_morning_end || ""),
      shift_afternoon_enabled: Boolean((c as any)?.shift_afternoon_enabled),
      shift_afternoon_start: String((c as any)?.shift_afternoon_start || ""),
      shift_afternoon_end: String((c as any)?.shift_afternoon_end || ""),
    },
    services: servicesSig,
  };

  try {
    return JSON.stringify(sig);
  } catch {
    return String(PROMPT_TEMPLATE_VERSION);
  }
}

function applyPersonalityOnTemplate(prompt: string, p: PersonalityId) {
  const token = personalityToken(p);
  if (prompt.includes("{{ASSISTANT_PERSONALITY}}")) {
    return prompt.replaceAll("{{ASSISTANT_PERSONALITY}}", token);
  }
  // Best-effort update if the placeholder is already interpolated.
  return prompt.replace(/^(Seu estilo de atendimento é)\s+.*\.$/gim, `$1 ${token}.`);
}

function keepOnlySelectedPersonalityBlock(prompt: string, p: PersonalityId) {
  const keep = personalityToken(p);
  const all = ["EXECUTIVO", "ACOLHEDOR", "DIRETO"] as const;
  let next = prompt;

  for (const t of all) {
    if (t === keep) continue;
    // Remove the whole block for this personality, up to the next block or the first section divider.
    const re = new RegExp(
      `^\\[${t}\\]:[\\s\\S]*?(?=^\\[(?:EXECUTIVO|ACOLHEDOR|DIRETO)\\]:|^---\\s*$)`,
      "gim"
    );
    next = next.replace(re, "").trimEnd();
  }

  // Collapse excess blank lines after removals.
  next = next.replace(/\n{3,}/g, "\n\n");
  return next.trim();
}

function cleanupTemplateArtifacts(prompt: string, clinic: ClinicRow | null, personality: PersonalityId) {
  let next = prompt;

  // Ensure we keep only the selected personality block.
  next = applyPersonalityOnTemplate(next, personality);
  next = keepOnlySelectedPersonalityBlock(next, personality);

  // Remove legacy "schedule summary" + divider if they exist in saved prompts.
  next = next.replace(/^\s*—\s*ou,\s*se disponível em campos separados\s*—\s*$/gim, "");
  next = next.replace(/^\s*\{\{SCHEDULE_SUMMARY\}\}\s*$/gim, "");
  next = next.replace(/^\s*Resumo:\s*\r?\n(?:-.*\r?\n)+/gim, "");

  // Remove internal table format instructions (older prompts).
  next = next.replace(/\r?\nFormato da tabela:[\s\S]*?(?=\r?\n\r?\nAo apresentar serviços ao paciente,)/i, "");

  // Remove the old "Exemplo" block (older prompts) without changing the base instruction text.
  next = next.replace(
    /(Ao apresentar serviços ao paciente,[\s\S]*?não exiba a tabela bruta\.)\s*Exemplo:[\s\S]*?(?=\r?\n\r?\n---)/i,
    "$1"
  );

  // Fix the "confirmação de presença" line if it was rendered with area in the middle.
  next = next.replace(
    /(\[nome do serviço\])\s+.*?\s+(\[presencial\/online\])/gi,
    "$1 $2"
  );

  // Replace the location block with a clean single-line string.
  const loc = buildClinicLocation(clinic);
  next = next.replace(/^Localização:\s*[\s\S]*?(?=\r?\n\r?\n---)/im, `Localização: ${loc}`);

  // Also ensure any CLINIC_LOCATION occurrences don't inject newlines.
  next = next.replace(/\{\{CLINIC_LOCATION\}\}/g, loc);

  // Final whitespace normalization.
  next = next.replace(/\n{3,}/g, "\n\n").trim();
  return next;
}

function insertRuleIntoBehaviorSection(prompt: string, rule: string) {
  const lines = prompt.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim().toUpperCase() === "REGRAS DE COMPORTAMENTO");
  if (headerIdx < 0) return `${prompt.trim()}\n- ${rule}\n`;
  const afterHeader = headerIdx + 1;
  let endIdx = -1;
  for (let i = afterHeader; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  const insertAt = endIdx > 0 ? endIdx : lines.length;
  const bullet = `- ${rule}`;
  const nextLines = [...lines.slice(0, insertAt), bullet, ...lines.slice(insertAt)];
  return nextLines.join("\n");
}

function buildDefaultPrompt({
  clinic,
  personality,
  services,
}: {
  clinic: ClinicRow | null;
  personality: PersonalityId;
  services: ServiceLite[];
}) {
  const clinicName = String(clinic?.name || "").trim() || "sua clínica";
  const area = areaTitle(clinic?.assistant_area) || "atendimento";
  const specialties = Array.isArray(clinic?.assistant_specialties) ? clinic!.assistant_specialties!.filter(Boolean) : [];
  const specialtiesLabel = specialties.length ? specialties.join(", ") : "Não informado";

  const clinicLocation = buildClinicLocation(clinic);
  const operationDays = formatOperationDays((clinic as any)?.operation_days);

  const fallbackStart = coerceTime((clinic as any)?.shift_morning_start, "08:00");
  const fallbackEnd = (() => {
    const aEnabled = (clinic as any)?.shift_afternoon_enabled;
    const aEnd = (clinic as any)?.shift_afternoon_end;
    const mEnd = (clinic as any)?.shift_morning_end;
    if (aEnabled === true) return coerceTime(aEnd, "18:00");
    return coerceTime(mEnd, "18:00");
  })();

  const operationHoursByDay = formatOperationHoursByDay({
    operationHours: (clinic as any)?.operation_hours,
    operationDays: (clinic as any)?.operation_days,
    fallbackStart,
    fallbackEnd,
  });

  const shiftMorning = formatShift(
    (clinic as any)?.shift_morning_enabled,
    (clinic as any)?.shift_morning_start,
    (clinic as any)?.shift_morning_end
  );
  const shiftAfternoon = formatShift(
    (clinic as any)?.shift_afternoon_enabled,
    (clinic as any)?.shift_afternoon_start,
    (clinic as any)?.shift_afternoon_end
  );

  const scheduleSummary = buildScheduleSummary({
    operationDays,
    shiftMorning,
    shiftAfternoon,
  });

  const vars: Record<string, string> = {
    ASSISTANT_NAME,
    CLINIC_NAME: clinicName,
    ASSISTANT_AREA: area,
    ASSISTANT_PERSONALITY: personalityToken(personality),
    ASSISTANT_SPECIALTIES: specialtiesLabel,
    CLINIC_LOCATION: clinicLocation,
    SERVICES_TABLE: buildServicesTable(services),
    OPERATION_DAYS: operationDays,
    OPERATION_HOURS: operationHoursByDay,
    SCHEDULE_SUMMARY: scheduleSummary,
    SHIFT_MORNING: shiftMorning,
    SHIFT_AFTERNOON: shiftAfternoon,
  };

  return cleanupTemplateArtifacts(interpolatePrompt(PROMPT_TEMPLATE, vars), clinic, personality);
}

function applyPersonalityToPrompt(current: string, p: PersonalityId) {
  return keepOnlySelectedPersonalityBlock(applyPersonalityOnTemplate(current, p), p);
}

function needsPromptCleanup(prompt: string) {
  const p = String(prompt || "");
  if (!p.trim()) return false;
  return (
    /\[(EXECUTIVO|ACOLHEDOR|DIRETO)\]:/i.test(p) ||
    /Formato da tabela:/i.test(p) ||
    /—\s*ou,\s*se disponível em campos separados\s*—/i.test(p) ||
    /^\s*Resumo:\s*$/im.test(p) ||
    /^Localização:\s*[^\r\n]*\r?\n[^\r\n]+/im.test(p) ||
    /\[nome do serviço\]\s+.*?\s+\[presencial\/online\]/i.test(p)
  );
}

function buildPreviewExamples({
  clinicName,
  area,
  personality,
  services,
}: {
  clinicName: string;
  area: string;
  personality: PersonalityId;
  services: ServiceLite[];
}) {
  const name = clinicName?.trim() || "a clínica";
  const areaHint = area ? `especializada em ${area}` : "da nossa clínica";
  const serviceName = services[0]?.name || "consulta";
  const opening =
    personality === "acolhedor"
      ? "Oi! Tudo bem? Eu posso te ajudar agora mesmo."
      : personality === "direto"
        ? "Olá! Vamos resolver isso rapidinho."
        : "Olá! Como posso ajudar hoje?";

  return [
      `${opening} Eu sou a CortexAI, assistente da ${name} (${areaHint}). Você prefere agendar ${serviceName} presencial ou online?`,
    `Perfeito. Para eu agendar, me diga por favor: nome completo, serviço desejado e duas opções de dia/horário.`,
    `Entendi. Posso te passar os valores e já deixar um horário reservado. Você quer ${serviceName} ou outro serviço?`,
  ];
}

export default function Step6AiConfig({
  clinicId,
  persistedStep,
  onBack,
  onDone,
  mode = "onboarding",
}: {
  clinicId: string;
  persistedStep?: number;
  onBack?: () => void;
  onDone?: () => void;
  mode?: Step6AiConfigMode;
}) {
  const { signOut: signOutSession } = useAuth();
  const readDraft = () => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(step6DraftKey(clinicId)) || "";
      return raw ? (JSON.parse(raw) as any) : null;
    } catch {
      return null;
    }
  };

  const draft = readDraft();

  const draftPrompt =
    draft && draft?.templateVersion === PROMPT_TEMPLATE_VERSION ? String(draft?.prompt || "") : "";
  const draftPromptMode: PromptMode =
    draft && draft?.templateVersion === PROMPT_TEMPLATE_VERSION && draft?.promptMode === "custom" ? "custom" : "auto";
  const draftAutoSignature =
    draft && draft?.templateVersion === PROMPT_TEMPLATE_VERSION && typeof draft?.autoSignature === "string"
      ? String(draft.autoSignature || "")
      : "";

  const cortexConfig = useCortexAIConfig(clinicId);
  const clinic = cortexConfig.clinic as ClinicRow | null;
  const services = cortexConfig.services as ServiceLite[];
  const [prompt, setPrompt] = useState(() => draftPrompt);
  const [promptMode, setPromptMode] = useState<PromptMode>(() => draftPromptMode);
  const [autoSignature, setAutoSignature] = useState(() => draftAutoSignature);
  const [personality, setPersonality] = useState<PersonalityId>(() => normalizePersonality(draft?.personality));
  const [previewIndex, setPreviewIndex] = useState(() => Number(draft?.previewIndex || 0));
  const [addingRule, setAddingRule] = useState(false);
  const [newRule, setNewRule] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const hydratedClinicRef = useRef<string | null>(null);
  const [persistedStepState, setPersistedStepState] = useState<number>(() => {
    const fromLocal = Number(draft?.persistedStep || 0);
    const fromProp = Number(persistedStep || 0);
    return Math.max(fromLocal || 0, fromProp || 0, 6);
  });
  const isOnboardingMode = mode === "onboarding";
  const [isPromptEditable, setIsPromptEditable] = useState(() => isOnboardingMode);
  const saving = cortexConfig.saving;
  const canMutatePrompt = isOnboardingMode || isPromptEditable;
  const promptLocked = !canMutatePrompt;

  const step = 6;
  const progress = Math.min(100, Math.max(0, (step / 7) * 100));

  const aTitle = useMemo(() => areaTitle(clinic?.assistant_area), [clinic?.assistant_area]);
  const examples = useMemo(
    () =>
      buildPreviewExamples({
        clinicName: clinic?.name || "",
        area: aTitle,
        personality,
        services,
      }),
    [clinic?.name, aTitle, personality, services]
  );
  const previewText = examples[Math.abs(previewIndex) % Math.max(1, examples.length)] || examples[0] || "";

  useEffect(() => {
    // Keep the prompt always synced with previous onboarding data while the user hasn't customized it.
    if (!clinic) return;
    if (promptMode !== "auto") return;
    const sig = buildPromptSignature({ clinic, personality, services });
    if (sig === autoSignature) return;
    const next = buildDefaultPrompt({ clinic, personality, services });
    setPrompt(next);
    setAutoSignature(sig);
  }, [clinic, services, personality, promptMode, autoSignature]);

  useEffect(() => {
    // Persist local draft to keep the user safe on refresh.
    try {
      window.localStorage.setItem(
        step6DraftKey(clinicId),
        JSON.stringify({
          prompt,
          promptMode,
          autoSignature,
          personality,
          previewIndex,
          persistedStep: persistedStepState,
          templateVersion: PROMPT_TEMPLATE_VERSION,
        })
      );
    } catch {
      // ignore
    }
  }, [clinicId, prompt, promptMode, autoSignature, personality, previewIndex, persistedStepState]);

  useEffect(() => {
    setSaved(false);
  }, [prompt, promptMode, autoSignature, personality]);

  useEffect(() => {
    if (!clinic) return;
    if (hydratedClinicRef.current === clinic.id) return;

    hydratedClinicRef.current = clinic.id;
    setError(null);

    const stepDb = Number((clinic as any)?.onboarding_step || 0);
    if (Number.isFinite(stepDb) && stepDb > 0) {
      setPersistedStepState((prev) => (prev > 0 ? Math.max(prev, stepDb) : stepDb));
    }

    const dbPersonality = normalizePersonality((clinic as any)?.assistant_personality);
    const dbPrompt = String((clinic as any)?.assistant_prompt || "");

    const effectivePersonality = (() => {
      const fromLocal = normalizePersonality(draft?.personality);
      if ((clinic as any)?.assistant_personality) return dbPersonality;
      if (draft?.personality) return fromLocal;
      return personality;
    })();

    setPersonality((prev) => {
      const fromLocal = normalizePersonality(draft?.personality);
      if ((clinic as any)?.assistant_personality) return dbPersonality;
      if (draft?.personality) return fromLocal;
      return prev;
    });

    const baseDefault = buildDefaultPrompt({ clinic, personality: effectivePersonality, services });
    const signature = buildPromptSignature({ clinic, personality: effectivePersonality, services });

    if (promptMode === "auto") {
      setPrompt(baseDefault);
      setAutoSignature(signature);
      return;
    }

    setPrompt((prev) => {
      const base = prev.trim()
        ? prev
        : dbPrompt.trim()
          ? applyPersonalityToPrompt(dbPrompt, effectivePersonality)
          : baseDefault;

      if (!needsPromptCleanup(base)) return base;
      return cleanupTemplateArtifacts(base, clinic, effectivePersonality);
    });
  }, [clinic, draft?.personality, personality, promptMode, services]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current != null) window.clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (canMutatePrompt) return;
    setAddingRule(false);
    setNewRule("");
  }, [canMutatePrompt]);

  const handleSignOut = async () => {
    await signOutSession();
    navigateToAppPath("/login");
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt || "");
      setCopied(true);
      if (copiedTimeoutRef.current != null) window.clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const regenerateDefault = () => {
    if (!clinic) return;
    const next = buildDefaultPrompt({ clinic, personality, services });
    setPrompt(next);
    setPromptMode("auto");
    setAutoSignature(buildPromptSignature({ clinic, personality, services }));
  };

  const addRule = () => {
    const rule = newRule.trim();
    if (!rule) return;
    setPrompt((prev) => insertRuleIntoBehaviorSection(prev, rule));
    setPromptMode("custom");
    setNewRule("");
    setAddingRule(false);
  };

  const saveToDb = async (nextStep?: number) => {
    setError(null);
    try {
      const persistedStep = isOnboardingMode
        ? typeof nextStep === "number"
          ? nextStep
          : Math.max(persistedStepState || 1, 6)
        : undefined;

      await cortexConfig.saveConfig({
        personality,
        prompt,
        nextStep: persistedStep,
      });

      if (typeof persistedStep === "number") {
        setPersistedStepState(persistedStep);
      }
      return true;
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Onboarding] step6 save unexpected:", e);
      setError("Não foi possível salvar. Tente novamente.");
      return false;
    }
  };

  const onSaveDraft = async () => {
    await saveToDb(Math.max(persistedStepState || 1, 6));
  };

  const minPromptLen = 80;

  const validatePrompt = () => {
    if (!prompt.trim() || prompt.trim().length < minPromptLen) {
      setError(
        isOnboardingMode
          ? `Escreva um prompt com pelo menos ${minPromptLen} caracteres para continuar.`
          : `Escreva um prompt com pelo menos ${minPromptLen} caracteres antes de salvar.`
      );
      return false;
    }
    return true;
  };

  const onSaveChanges = async () => {
    if (!validatePrompt()) return;
    const ok = await saveToDb();
    if (!ok) return;
    setSaved(true);
    if (!isOnboardingMode) setIsPromptEditable(false);
  };

  const onContinue = async () => {
    if (!validatePrompt()) return;
    const next = Math.max(persistedStepState || 1, 7);
    const ok = await saveToDb(next);
    if (!ok) return;
    onDone?.();
  };

  if (!isOnboardingMode && cortexConfig.isInitialLoading && !clinic && !prompt.trim()) {
    return (
      <div className="min-h-[100dvh] bg-[#E9FDF4] text-[#002115] overflow-x-hidden">
        <main className="pb-16 min-h-screen">
          <div className="max-w-6xl mx-auto px-5 md:px-12 py-10 md:py-14 space-y-8">
            <div className="bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_24px_60px_-35px_rgba(2,89,64,0.25)] p-8 md:p-10 space-y-5">
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-12 w-96 max-w-full rounded-2xl" />
              <Skeleton className="h-5 w-[32rem] max-w-full rounded-full" />
              <Skeleton className="h-5 w-[26rem] max-w-full rounded-full" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 items-start">
              <div className="lg:col-span-8 bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_32px_64px_-16px_rgba(0,108,72,0.12)] p-6 md:p-8 space-y-5">
                <Skeleton className="h-8 w-48 rounded-2xl" />
                <Skeleton className="h-[420px] w-full rounded-[1.75rem]" />
              </div>
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_24px_60px_-35px_rgba(2,89,64,0.25)] p-6 space-y-4">
                  <Skeleton className="h-6 w-40 rounded-xl" />
                  <Skeleton className="h-24 w-full rounded-[1.5rem]" />
                  <Skeleton className="h-10 w-full rounded-2xl" />
                </div>
                <div className="bg-white rounded-[2rem] border border-[#025940]/[0.10] shadow-[0_24px_60px_-35px_rgba(2,89,64,0.25)] p-6 space-y-4">
                  <Skeleton className="h-6 w-32 rounded-xl" />
                  <Skeleton className="h-40 w-full rounded-[1.5rem]" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#E9FDF4] text-[#002115] overflow-x-hidden">
      {isOnboardingMode ? <OnboardingHeader step={step} totalSteps={7} progress={progress} onExit={handleSignOut} /> : null}

      <main className={isOnboardingMode ? "pt-16 md:pt-20 pb-28 min-h-screen" : "pb-16 min-h-screen"}>
        <div className="max-w-6xl mx-auto px-5 md:px-12 py-10 md:py-14">
          {isOnboardingMode ? (
            <section className="mb-10 md:mb-12">
              <h2 className="font-['Syne'] text-4xl md:text-5xl font-800 text-[#003F2D] tracking-tight mb-4 leading-tight">
                IA pronta para começar
              </h2>
              <p className="text-[#3F4944] text-lg md:text-xl font-600 max-w-3xl font-['Space_Grotesk'] opacity-80">
                Revise e personalize o prompt base da sua secretária virtual. Este texto define como a IA irá interagir
                com seus pacientes.
              </p>
            </section>
          ) : (
            <section className="mb-10 md:mb-12">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#025940]/[0.12] bg-white/80 px-4 py-2 text-[11px] font-900 uppercase tracking-[0.24em] text-[#118C5F] font-['Space_Grotesk']">
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2.2} />
                    CortexAI
                  </span>
                  {clinic ? (
                    <>
                      <h2 className="mt-5 font-['Syne'] text-4xl md:text-5xl font-800 text-[#003F2D] tracking-tight leading-tight">
                        Configure a secretária virtual da {clinic.name}
                      </h2>
                      <p className="mt-4 text-[#3F4944] text-lg md:text-xl font-600 max-w-3xl font-['Space_Grotesk'] opacity-80">
                        Ajuste o prompt base, o tom de voz e as regras operacionais da CortexAI. A base é gerada com os
                        serviços, horários e dados atuais da clínica.
                      </p>
                    </>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <Skeleton className="h-12 w-96 max-w-full rounded-2xl" />
                      <Skeleton className="h-5 w-[32rem] max-w-full rounded-full" />
                      <Skeleton className="h-5 w-[26rem] max-w-full rounded-full" />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-[11px] font-900 uppercase tracking-[0.2em] text-[#025940] border border-[#025940]/[0.10] font-['Space_Grotesk'] shadow-[0_14px_24px_-20px_rgba(2,89,64,0.45)]">
                    <span className={`h-2 w-2 rounded-full ${promptMode === "auto" ? "bg-[#23D996]" : "bg-[#118C5F]"}`} />
                    {promptMode === "auto" ? "Prompt dinâmico" : "Prompt personalizado"}
                  </span>
                  {saved ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#062B1D] px-4 py-3 text-[11px] font-900 uppercase tracking-[0.2em] text-white font-['Space_Grotesk'] shadow-[0_18px_30px_-24px_rgba(6,43,29,0.75)]">
                      <CheckCircle2 className="w-4 h-4 text-[#23D996]" strokeWidth={2.3} />
                      Configuração salva
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={onSaveChanges}
                    disabled={saving || !clinic}
                    className="inline-flex items-center gap-3 rounded-[1.4rem] bg-[#062B1D] px-6 py-4 text-white font-['Syne'] font-800 text-sm shadow-[0_18px_40px_-24px_rgba(6,43,29,0.75)] transition-all hover:bg-[#0A3B27] disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    <span>{saving ? "Salvando..." : "Salvar configuração"}</span>
                    <span className="text-[#23D996]" aria-hidden>
                      →
                    </span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {!isOnboardingMode && cortexConfig.loadError ? (
            <div className="mb-6 rounded-[1.5rem] border border-[#BE123C]/15 bg-[#FFF1F2] px-5 py-4 text-[#8A1538] shadow-[0_18px_36px_-28px_rgba(138,21,56,0.35)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 mt-0.5" />
                <div>
                  <p className="font-['Syne'] font-800 text-base">Não foi possível carregar a configuração atual</p>
                  <p className="mt-1 text-sm font-['Space_Grotesk'] font-600 opacity-80">{cortexConfig.loadError}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 items-start">
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-[2rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,108,72,0.12)] border border-[#025940]/[0.10]">
                <div className="bg-white border-b border-[#025940]/[0.10] px-7 md:px-8 py-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#E8F5ED] flex items-center justify-center text-[#118C5F] border border-[#025940]/[0.08]">
                      <Terminal className="w-4.5 h-4.5" strokeWidth={2.2} />
                    </div>
                    <span className="text-[11px] md:text-xs font-900 text-[#062B1D]/70 uppercase tracking-[0.22em] font-['Space_Grotesk']">
                      Configuração do prompt
                    </span>
                  </div>
                  {isOnboardingMode ? (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#23D996] animate-pulse" />
                      <span className="bg-[#E8F5ED] text-[#025940] text-[10px] font-900 px-3 py-1.5 rounded-full uppercase tracking-[0.2em] border border-[#025940]/[0.10] font-['Space_Grotesk']">
                        Cortex v4 ativo
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsPromptEditable((prev) => !prev)}
                      disabled={!clinic}
                      className="inline-flex items-center gap-2 rounded-full bg-[#E8F5ED] px-4 py-2.5 text-[11px] font-900 uppercase tracking-[0.2em] text-[#025940] border border-[#025940]/[0.10] font-['Space_Grotesk'] shadow-[0_14px_24px_-20px_rgba(2,89,64,0.35)] transition-all hover:bg-[#DDF7EB] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <PencilLine className="w-4 h-4" strokeWidth={2.2} />
                      {isPromptEditable ? "Bloquear edição" : "Editar prompt"}
                    </button>
                  )}
                </div>

                <div className="p-6 md:p-8">
                  <div className="relative group">
                    <div className="absolute -inset-2 bg-[#E8F5ED] rounded-[2rem] opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
                    <textarea
                      value={prompt}
                      readOnly={promptLocked}
                      aria-readonly={promptLocked}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        setPromptMode("custom");
                      }}
                      spellCheck={false}
                      className={`relative w-full h-[360px] md:h-[420px] border-2 rounded-[1.75rem] p-6 md:p-8 text-[#062B1D] font-['Space_Grotesk'] text-[15px] md:text-[16px] leading-relaxed transition-all resize-none shadow-inner ${
                        promptLocked
                          ? "bg-[#F7FBF8] border-[#025940]/[0.08] cursor-default text-[#062B1D]/80"
                          : "bg-[#F4FBF7] border-transparent focus:border-[#23D996]/35 focus:ring-0"
                      }`}
                    />

                    <div className="absolute top-5 right-5 flex flex-col gap-2.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={onCopy}
                        className="bg-white p-3 rounded-2xl text-[#118C5F] hover:text-[#062B1D] shadow-md hover:shadow-lg transition-all border border-[#025940]/[0.08]"
                        title="Copiar prompt"
                      >
                        <Copy className="w-4.5 h-4.5" strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        onClick={regenerateDefault}
                        disabled={promptLocked || !clinic}
                        className="bg-white p-3 rounded-2xl text-[#118C5F] hover:text-[#062B1D] shadow-md hover:shadow-lg transition-all border border-[#025940]/[0.08] disabled:opacity-45 disabled:cursor-not-allowed"
                        title={promptLocked ? "Clique em Editar prompt para restaurar o padrão" : "Restaurar prompt padrão"}
                      >
                        <RefreshCcw className="w-4.5 h-4.5" strokeWidth={2.2} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {copied ? (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-[#062B1D] text-white px-4 py-2 text-[11px] font-800 uppercase tracking-[0.2em] font-['Space_Grotesk'] shadow-[0_14px_30px_-18px_rgba(6,43,29,0.85)]"
                        >
                          <CheckCircle2 className="w-4 h-4 text-[#23D996]" strokeWidth={2.3} />
                          Copiado
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>

                  <div className="mt-6 flex items-center gap-3 text-[#3F4944]/55 text-sm font-['Space_Grotesk'] font-600">
                    <Info className="w-4 h-4" />
                    <span>
                      {promptLocked
                        ? 'O prompt está trancado. Clique em "Editar prompt" para liberar ajustes.'
                        : "Dica: quanto mais específico o texto, mais consistente a IA ficará. Você pode ajustar isso depois."}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-900 text-[#062B1D]/40 uppercase tracking-[0.25em] ml-2 font-['Space_Grotesk']">
                  Personalidades sugeridas
                </h4>
                <div className="flex flex-wrap gap-3">
                  {PERSONALITIES.map((p) => {
                    const active = personality === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (promptLocked) return;
                          setPersonality(p.id);
                          if (promptMode !== "auto") setPrompt((prev) => applyPersonalityToPrompt(prev, p.id));
                        }}
                        disabled={promptLocked}
                        className={`rounded-full px-6 py-3 text-sm font-800 transition-all active:scale-[0.98] font-['Space_Grotesk'] ${
                          active
                            ? "bg-[#118C5F] text-white shadow-[0_16px_30px_-18px_rgba(17,140,95,0.55)]"
                            : "bg-white border border-[#025940]/[0.10] text-[#3F4944] hover:bg-[#E8F5ED]/60"
                        } disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-white`}
                        title={p.description}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Sparkles className={`w-4 h-4 ${active ? "text-[#23D996]" : "text-[#118C5F]"}`} />
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setAddingRule(true)}
                    disabled={promptLocked}
                    className="rounded-full px-6 py-3 text-sm font-900 transition-all active:scale-[0.98] font-['Space_Grotesk'] border-2 border-dashed border-[#23D996]/40 text-[#118C5F] hover:bg-white hover:border-[#23D996]/70 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-[#23D996]/40"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Wand2 className="w-4 h-4" />
                      Nova regra
                    </span>
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {canMutatePrompt && addingRule ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mt-2 bg-white border border-[#025940]/[0.10] rounded-[1.5rem] p-4 md:p-5 shadow-[0_18px_40px_-30px_rgba(2,89,64,0.35)]"
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 text-[#062B1D] font-900 text-sm font-['Syne']">
                          <Wand2 className="w-4.5 h-4.5 text-[#118C5F]" />
                          Adicionar regra
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingRule(false);
                            setNewRule("");
                          }}
                          className="text-[#062B1D]/40 hover:text-[#062B1D] text-sm font-['Space_Grotesk'] font-800"
                        >
                          Fechar
                        </button>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          value={newRule}
                          onChange={(e) => setNewRule(e.target.value)}
                          placeholder="Ex: Sempre peça confirmação antes de finalizar o agendamento."
                          className="flex-1 w-full bg-[#F4FBF7] border-2 border-transparent rounded-2xl px-5 py-4 focus:ring-0 focus:bg-white focus:border-[#23D996]/40 transition-all placeholder:text-black/30 font-['Space_Grotesk'] font-600 text-[14px] text-[#062B1D]"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={addRule}
                            className="h-12 px-6 rounded-2xl bg-[#062B1D] text-white font-['Syne'] font-800 shadow-[0_10px_22px_rgba(2,89,64,0.22)] hover:bg-[#0a3b27] transition-colors"
                          >
                            Adicionar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingRule(false);
                              setNewRule("");
                            }}
                            className="h-12 px-6 rounded-2xl bg-white border border-[#025940]/[0.12] text-[#025940] font-['Space_Grotesk'] font-800 hover:bg-[#F4FBF7] transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="bg-[#062B1D] text-white rounded-[2rem] p-8 md:p-10 relative overflow-hidden shadow-[0_30px_70px_-40px_rgba(2,89,64,0.75)]">
                <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-[#23D996]/10 rounded-full blur-3xl" />
                <div className="absolute -top-16 -left-16 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-7 border border-white/10">
                    <Sparkles className="w-6 h-6 text-[#23D996]" strokeWidth={2.2} />
                  </div>
                  <h3 className="text-2xl font-800 mb-5 font-['Syne'] leading-tight">Como o texto define a sua IA</h3>
                  <p className="text-white/70 text-[15px] leading-relaxed mb-7 font-['Space_Grotesk'] font-600">
                    O prompt funciona como um guia operacional. Ele alinha tom, limites e regras para manter consistência
                    no atendimento, mesmo em grande volume.
                  </p>
                  <div className="space-y-4">
                    {[
                      "Respostas rápidas e consistentes",
                      "Menos no-show com confirmações",
                      "Tom alinhado ao perfil da clínica",
                    ].map((t) => (
                      <div key={t} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-[#23D996]/15 flex items-center justify-center border border-[#23D996]/20">
                          <CheckCircle2 className="w-4.5 h-4.5 text-[#23D996]" strokeWidth={2.3} />
                        </div>
                        <span className="text-sm font-700 text-white/90 font-['Space_Grotesk']">{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] p-7 md:p-8 border border-[#025940]/[0.10] shadow-[0_24px_50px_-35px_rgba(2,89,64,0.35)]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-[#E8F5ED] flex items-center justify-center border border-[#025940]/[0.10]">
                    <Sparkles className="w-5 h-5 text-[#118C5F]" strokeWidth={2.2} />
                  </div>
                  <div>
                    <span className="block text-[10px] font-900 text-[#062B1D]/35 uppercase tracking-[0.25em] font-['Space_Grotesk']">
                      Preview dinâmico
                    </span>
                    <span className="text-sm font-900 text-[#062B1D] font-['Syne']">CortexAI diz:</span>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute -top-5 -left-2 text-6xl text-[#E8F5ED] leading-none select-none font-serif">
                    “
                  </span>
                  <p className="relative z-10 text-[#3F4944] font-['Space_Grotesk'] leading-relaxed text-[14px] italic bg-[#E8F5ED]/40 p-4 rounded-2xl border-l-4 border-[#118C5F]">
                    {previewText}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewIndex((p) => p + 1)}
                  className="mt-5 w-full py-3 bg-[#E8F5ED] text-[#118C5F] text-[11px] font-900 uppercase tracking-[0.22em] rounded-2xl hover:bg-[#118C5F] hover:text-white transition-all font-['Space_Grotesk']"
                >
                  Regerar exemplo
                </button>

                <div className="mt-5 flex items-start gap-3 text-[#3F4944]/55 text-sm font-['Space_Grotesk'] font-600">
                  <AlertTriangle className="w-4 h-4 mt-0.5 text-[#118C5F]" />
                  <span>
                    Este preview é apenas ilustrativo. As respostas reais dependem do contexto do paciente e das regras do
                    prompt.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-700 text-sm font-['Space_Grotesk'] font-600"
            >
              {error}
            </motion.div>
          )}
        </div>
      </main>

      {isOnboardingMode ? (
        <footer className="fixed bottom-0 inset-x-0 h-24 md:h-28 bg-[#062B1D]/95 backdrop-blur-xl border-t border-white/10 flex justify-between items-center px-5 md:px-12 z-40">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-3 text-white/70 font-800 text-[11px] md:text-xs uppercase tracking-[0.2em] hover:text-white transition-all font-['Space_Grotesk']"
          >
            <span aria-hidden>←</span>
            <span>Voltar</span>
          </button>

          <div className="flex items-center gap-3 md:gap-6">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={saving}
              className="hidden sm:inline-flex items-center gap-2 text-white/70 text-[11px] font-900 uppercase tracking-[0.22em] hover:text-white transition-colors font-['Space_Grotesk'] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Salvar rascunho
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={saving}
              className="bg-white text-[#062B1D] h-14 md:h-16 px-8 md:px-12 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.32)] font-['Syne'] font-800 text-xs md:text-sm uppercase tracking-[0.2em] hover:bg-white/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] flex items-center gap-4"
            >
              <span>{saving ? "Salvando..." : "Continuar"}</span>
              <span className="text-[#23D996]" aria-hidden>
                →
              </span>
            </button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
