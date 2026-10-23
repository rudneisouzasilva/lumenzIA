import {
  BarChart3,
  BellRing,
  BookOpen,
  Brain,
  Camera,
  CalendarClock,
  CalendarDays,
  CalendarSync,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Headset,
  Images,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  MessageCircleQuestion,
  MessageSquareText,
  MessagesSquare,
  PhoneOutgoing,
  Route,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tags,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Palavras extras para a busca rápida (Ctrl+K). */
  keywords?: string;
  /** Outras telas (abas) em que este item fica marcado como ativo. */
  match?: string[];
};

/**
 * Telas-irmãs que aparecem como abas de um mesmo item do menu. A primeira aba é a tela
 * para onde o item do menu leva.
 */
export const PAGE_TABS = {
  funil: [
    {
      href: "/painel/funil",
      label: "Quadro",
      icon: KanbanSquare,
      keywords: "funil crm comercial kanban etapas leads contatos vendas",
    },
    {
      href: "/painel/oportunidades",
      label: "Para retomar",
      icon: PhoneOutgoing,
      keywords:
        "contatos a fazer oportunidades leads potenciais chamar ligar recuperar",
    },
  ],
  relatorios: [
    {
      href: "/painel/relatorios",
      label: "Números",
      icon: BarChart3,
      keywords: "relatórios dashboard indicadores gráficos exportar csv",
    },
    {
      href: "/painel/analise",
      label: "Análise da IA",
      icon: Brain,
      keywords: "insights inteligência mensal recomendações indicadores",
    },
    {
      href: "/painel/motivos",
      label: "Motivos de contato",
      icon: Tags,
      keywords: "motivos de contato classificação categorias",
    },
  ],
  conhecimento: [
    {
      href: "/painel/faqs",
      label: "Perguntas frequentes",
      icon: MessageCircleQuestion,
      keywords: "faq dúvidas respostas conhecimento",
    },
    {
      href: "/painel/fotos",
      label: "Fotos",
      icon: Images,
      keywords: "imagens antes depois",
    },
    {
      href: "/painel/conversas-anteriores",
      label: "Exemplos de conversa",
      icon: MessagesSquare,
      keywords: "conversas anteriores exemplos histórico aprender",
    },
  ],
  roteiro: [
    {
      href: "/painel/perguntas",
      label: "Perguntas ao paciente",
      icon: ListChecks,
      keywords: "perguntas da ia qualificação perguntar paciente roteiro",
    },
    {
      href: "/painel/dados-agendamento",
      label: "Dados do agendamento",
      icon: ClipboardList,
      keywords: "dados pedidos no agendamento cpf e-mail nascimento campos",
    },
  ],
} satisfies Record<string, NavItem[]>;

export type TabGroup = keyof typeof PAGE_TABS;

const tabHrefs = (group: TabGroup) => PAGE_TABS[group].map((t) => t.href);

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Dia a dia",
    items: [
      {
        href: "/painel",
        label: "Início",
        icon: LayoutDashboard,
        keywords: "visão geral passo a passo começar configurar onboarding",
        match: ["/painel/comecar"],
      },
      {
        href: "/painel/atendimento",
        label: "Conversas",
        icon: Headset,
        keywords: "atendimento whatsapp caixa de entrada assumir humano fila",
      },
      {
        href: "/painel/funil",
        label: "Funil",
        icon: KanbanSquare,
        keywords: "crm comercial kanban etapas leads contatos vendas",
        match: tabHrefs("funil"),
      },
    ],
  },
  {
    title: "Resultados",
    items: [
      {
        href: "/painel/relatorios",
        label: "Relatórios",
        icon: BarChart3,
        keywords: "dashboard indicadores gráficos exportar csv motivos análise",
        match: tabHrefs("relatorios"),
      },
    ],
  },
  {
    title: "Assistente",
    items: [
      {
        href: "/painel/testar",
        label: "Testar assistente",
        icon: FlaskConical,
        keywords: "teste simular conversa chat",
      },
      {
        href: "/painel/assistente",
        label: "Personalidade",
        icon: Sparkles,
        keywords: "assistente nome tom voz informações regras identidade",
      },
      {
        href: "/painel/faqs",
        label: "Conhecimento",
        icon: BookOpen,
        keywords: "perguntas frequentes faq fotos exemplos conversas",
        match: tabHrefs("conhecimento"),
      },
      {
        href: "/painel/perguntas",
        label: "Roteiro de atendimento",
        icon: Route,
        keywords: "perguntas da ia qualificação dados do agendamento",
        match: tabHrefs("roteiro"),
      },
      {
        href: "/painel/retomadas",
        label: "Retomadas",
        icon: CalendarSync,
        keywords: "follow-up retorno voltar a chamar remarketing abandonadas",
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
        keywords: "serviços duração avaliação obrigatória",
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
        keywords: "funcionamento feriados dias fechados",
      },
      {
        href: "/painel/avisos",
        label: "Lembretes e avisos",
        icon: BellRing,
        keywords:
          "notificações aviso equipe e-mail email whatsapp lembrete paciente",
      },
      {
        href: "/painel/mensagens",
        label: "Mensagens prontas",
        icon: MessageSquareText,
        keywords: "templates modelos meta aprovação 24 horas lembrete",
      },
    ],
  },
  {
    title: "Conexões",
    items: [
      {
        href: "/painel/whatsapp",
        label: "WhatsApp",
        icon: Smartphone,
        keywords: "conectar número meta facebook embedded",
      },
      {
        href: "/painel/instagram",
        label: "Instagram",
        icon: Camera,
        keywords: "conectar direct dm comentários meta",
      },
      {
        href: "/painel/agenda",
        label: "Agenda",
        icon: CalendarDays,
        keywords:
          "google agenda calendar calendário clínica experts conectar profissional",
      },
    ],
  },
];

/** Itens da conta, no rodapé do menu. */
export const NAV_FOOTER: NavItem[] = [
  {
    href: "/painel/conta",
    label: "Minha conta",
    icon: UserCog,
    keywords: "perfil senha telefone",
  },
  {
    href: "/painel/equipe",
    label: "Equipe",
    icon: UsersRound,
    keywords: "convidar convite pessoas acesso permissões telas funcionários",
  },
  {
    href: "/assinatura",
    label: "Assinatura",
    icon: CreditCard,
    keywords: "plano pagamento mensagens",
  },
];

export const NAV_ITEMS = [
  ...NAV_SECTIONS.flatMap((s) => s.items),
  ...NAV_FOOTER,
];

/**
 * Todas as telas para a busca rápida: os itens do menu e as abas que não estão nele,
 * com o nome do item do menu na frente (ex.: "Funil · Para retomar").
 */
export const SEARCH_ITEMS: NavItem[] = [
  ...NAV_ITEMS,
  ...Object.values(PAGE_TABS)
    .flat()
    .filter((tab) => !NAV_ITEMS.some((item) => item.href === tab.href))
    .map((tab) => {
      const parent = NAV_ITEMS.find((item) => item.match?.includes(tab.href));
      return parent ? { ...tab, label: `${parent.label} · ${tab.label}` } : tab;
    }),
];

export function isActive(pathname: string, href: string) {
  return href === "/painel"
    ? pathname === "/painel"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function isItemActive(pathname: string, item: NavItem) {
  return [item.href, ...(item.match ?? [])].some((href) =>
    isActive(pathname, href),
  );
}
