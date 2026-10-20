/** Cores das etapas do funil (o nome vai para o banco; as classes, para a tela). */
export const STAGE_COLORS = [
  "slate",
  "blue",
  "violet",
  "amber",
  "emerald",
  "teal",
  "rose",
  "orange",
] as const;

export type StageColor = (typeof STAGE_COLORS)[number];
export type StageKind = "aberto" | "ganho" | "perdido";

export const STAGE_COLOR_CLASS: Record<StageColor, string> = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  rose: "bg-rose-500",
  orange: "bg-orange-500",
};

export const STAGE_COLOR_LABEL: Record<StageColor, string> = {
  slate: "Cinza",
  blue: "Azul",
  violet: "Roxo",
  amber: "Amarelo",
  emerald: "Verde",
  teal: "Turquesa",
  rose: "Vermelho",
  orange: "Laranja",
};

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  aberto: "Em negociação",
  ganho: "Ganho (agendou)",
  perdido: "Perdido",
};

export const AUTO_RULE_LABEL: Record<string, string> = {
  novo_contato: "Recebe os contatos novos",
  em_conversa: "Quando a clínica responde",
  agendou: "Quando agenda",
  compareceu: "Quando o atendimento é concluído",
};
