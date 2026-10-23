// Sem "server-only": o proxy, o menu e a tela da equipe usam as mesmas regras.

/**
 * Áreas do painel que a dona libera para cada pessoa da equipe. Os nomes ficam gravados em
 * clinic_members.permissions e nas políticas do banco (migração 0023): não renomeie.
 * Início e "Minha conta" são de todo mundo; equipe e assinatura, só da dona.
 */
export const AREAS = {
  conversas: { label: "Conversas", paths: ["/painel/atendimento"] },
  funil: {
    label: "Funil",
    paths: ["/painel/funil", "/painel/oportunidades"],
  },
  relatorios: {
    label: "Relatórios",
    paths: ["/painel/relatorios", "/painel/analise", "/painel/motivos"],
  },
  testar: { label: "Testar assistente", paths: ["/painel/testar"] },
  assistente: { label: "Personalidade", paths: ["/painel/assistente"] },
  conhecimento: {
    label: "Conhecimento",
    paths: ["/painel/faqs", "/painel/fotos", "/painel/conversas-anteriores"],
  },
  roteiro: {
    label: "Roteiro de atendimento",
    paths: ["/painel/perguntas", "/painel/dados-agendamento"],
  },
  retomadas: { label: "Retomadas", paths: ["/painel/retomadas"] },
  procedimentos: { label: "Procedimentos", paths: ["/painel/procedimentos"] },
  profissionais: { label: "Profissionais", paths: ["/painel/profissionais"] },
  horarios: { label: "Horários", paths: ["/painel/horarios"] },
  avisos: { label: "Lembretes e avisos", paths: ["/painel/avisos"] },
  mensagens: { label: "Mensagens prontas", paths: ["/painel/mensagens"] },
  whatsapp: { label: "WhatsApp", paths: ["/painel/whatsapp"] },
  instagram: { label: "Instagram", paths: ["/painel/instagram"] },
  agenda: { label: "Agenda", paths: ["/painel/agenda"] },
} as const;

export type Area = keyof typeof AREAS;

export const AREA_KEYS = Object.keys(AREAS) as Area[];

export const isArea = (value: unknown): value is Area =>
  typeof value === "string" && value in AREAS;

/** O que a pessoa pode abrir: `null` é tudo (dona, ou equipe antiga sem lista). */
export type Access = { owner: boolean; areas: Area[] | null };

export function canAccess(access: Access, area: Area) {
  return access.owner || access.areas === null || access.areas.includes(area);
}

/** Área de uma tela do painel, ou null para as telas de todo mundo. */
export function areaForPath(pathname: string): Area | null {
  for (const key of AREA_KEYS) {
    if (
      AREAS[key].paths.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      )
    ) {
      return key;
    }
  }
  return null;
}

/** Telas só da dona (fora do /painel, a assinatura é conferida na própria página). */
export const OWNER_ONLY_PATHS = ["/painel/equipe"];

/** Lista gravada no banco → áreas conhecidas (ignora nomes antigos ou inválidos). */
export function toAccess(
  role: string,
  permissions: string[] | null | undefined,
): Access {
  return {
    owner: role === "owner",
    areas: permissions == null ? null : permissions.filter(isArea),
  };
}
