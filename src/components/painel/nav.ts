import {
  CalendarClock,
  CreditCard,
  FlaskConical,
  Images,
  LayoutDashboard,
  ListChecks,
  MessageCircleQuestion,
  MessagesSquare,
  Rocket,
  Sparkles,
  Stethoscope,
  Tags,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Palavras extras para a busca rápida (Ctrl+K). */
  keywords?: string;
};

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Assistente",
    items: [
      { href: "/painel", label: "Visão geral", icon: LayoutDashboard },
      {
        href: "/painel/comecar",
        label: "Passo a passo",
        icon: Rocket,
        keywords: "onboarding começar configurar",
      },
      {
        href: "/painel/testar",
        label: "Testar assistente",
        icon: FlaskConical,
        keywords: "teste simular conversa chat",
      },
      {
        href: "/painel/assistente",
        label: "Assistente",
        icon: Sparkles,
        keywords: "nome tom voz informações regras",
      },
      {
        href: "/painel/faqs",
        label: "Perguntas frequentes",
        icon: MessageCircleQuestion,
        keywords: "faq dúvidas respostas",
      },
      {
        href: "/painel/fotos",
        label: "Fotos",
        icon: Images,
        keywords: "imagens antes depois",
      },
      {
        href: "/painel/perguntas",
        label: "Perguntas da IA",
        icon: ListChecks,
        keywords: "qualificação perguntar paciente",
      },
      {
        href: "/painel/conversas-anteriores",
        label: "Conversas anteriores",
        icon: MessagesSquare,
        keywords: "exemplos histórico aprender",
      },
    ],
  },
  {
    title: "Clínica",
    items: [
      {
        href: "/painel/procedimentos",
        label: "Procedimentos",
        icon: Stethoscope,
        keywords: "serviços duração",
      },
      {
        href: "/painel/profissionais",
        label: "Profissionais",
        icon: Users,
        keywords: "equipe atendentes",
      },
      {
        href: "/painel/horarios",
        label: "Horários",
        icon: CalendarClock,
        keywords: "funcionamento feriados lembrete",
      },
      {
        href: "/painel/motivos",
        label: "Motivos de contato",
        icon: Tags,
        keywords: "classificação categorias",
      },
    ],
  },
  {
    title: "Conta",
    items: [
      {
        href: "/painel/conta",
        label: "Minha conta",
        icon: UserCog,
        keywords: "perfil senha telefone equipe",
      },
      {
        href: "/assinatura",
        label: "Assinatura",
        icon: CreditCard,
        keywords: "plano pagamento mensagens",
      },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export function isActive(pathname: string, href: string) {
  return href === "/painel"
    ? pathname === "/painel"
    : pathname === href || pathname.startsWith(`${href}/`);
}
