import {
  Apple,
  Brain,
  Dumbbell,
  Smile,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export type AreaId =
  | "medicina"
  | "nutricao"
  | "psicologia"
  | "odontologia"
  | "fisioterapia"
  | "estetica";

export type ClinicArea = {
  id: AreaId;
  title: string;
  description: string;
  Icon: LucideIcon;
  specialties: string[];
};

export const CLINIC_AREAS: ClinicArea[] = [
  {
    id: "medicina",
    title: "Medicina",
    description: "Atendimento clínico geral ou especializado com foco em diagnósticos precisos.",
    Icon: Stethoscope,
    specialties: ["Clínica Geral", "Cardiologia", "Dermatologia", "Ortopedia", "Pediatria", "Ginecologia"],
  },
  {
    id: "nutricao",
    title: "Nutrição",
    description: "Gestão de planos alimentares, metas e acompanhamento nutricional detalhado.",
    Icon: Apple,
    specialties: [
      "Clínica",
      "Esportiva",
      "Funcional",
      "Materno-Infantil",
      "Comportamental",
      "Oncológica",
      "Vegetariana/Vegana",
      "Hospitalar",
    ],
  },
  {
    id: "psicologia",
    title: "Psicologia",
    description: "Foco em acolhimento, sigilo absoluto e agendamentos de sessões recorrentes.",
    Icon: Brain,
    specialties: ["TCC", "Psicanálise", "Infantil", "Casal", "Ansiedade", "Depressão"],
  },
  {
    id: "odontologia",
    title: "Odontologia",
    description: "Gestão de procedimentos odontológicos e retornos preventivos.",
    Icon: Smile,
    specialties: ["Ortodontia", "Implantodontia", "Endodontia", "Odontopediatria", "Estética Dental"],
  },
  {
    id: "fisioterapia",
    title: "Fisioterapia",
    description: "Recuperação física, reabilitação motora e acompanhamento de sessões.",
    Icon: Dumbbell,
    specialties: ["Ortopédica", "Neurológica", "Respiratória", "Esportiva", "Pilates"],
  },
  {
    id: "estetica",
    title: "Estética",
    description: "Tratamentos personalizados, harmonização e cuidados avançados com a pele.",
    Icon: Sparkles,
    specialties: ["Facial", "Corporal", "Toxina Botulínica", "Preenchimento", "Laser", "Capilar"],
  },
];

export function getClinicAreaById(areaId: string | null | undefined) {
  return CLINIC_AREAS.find((area) => area.id === areaId) || null;
}

export function getClinicAreaTitle(areaId: string | null | undefined) {
  return getClinicAreaById(areaId)?.title || "";
}

export function getClinicSpecialtiesByArea(areaId: string | null | undefined) {
  return getClinicAreaById(areaId)?.specialties || [];
}
