import {
  CalendarCheck,
  ChartLine,
  Headset,
  ImageIcon,
  MessageCircle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section-heading";
import { SpotlightCard } from "@/components/site/spotlight-card";
import { cn } from "@/lib/utils";

const features: {
  icon: LucideIcon;
  title: string;
  text: string;
  className?: string;
}[] = [
  {
    icon: MessageCircle,
    title: "Responde só com o que você cadastrou",
    text: "Procedimentos, valores, endereço e horários ficam no painel. Se não souber algo, a assistente avisa que vai confirmar com a equipe em vez de inventar.",
    className: "md:col-span-2",
  },
  {
    icon: ImageIcon,
    title: "Envia fotos na hora certa",
    text: "Você anexa as fotos e diz quando usar cada uma. Quando o paciente pede um exemplo, ela manda a que combina.",
  },
  {
    icon: CalendarCheck,
    title: "Agenda e lembra o paciente",
    text: "Consulta horários livres, marca a avaliação na agenda da clínica e envia um lembrete automático antes do horário.",
  },
  {
    icon: Headset,
    title: "Chama a equipe quando precisa",
    text: "Se o paciente pede um atendente ou a IA não consegue ajudar, a equipe é avisada e assume a conversa pelo painel, em tempo real.",
    className: "md:col-span-2",
  },
  {
    icon: Sparkles,
    title: "Aprende o jeito da sua clínica",
    text: "Cole conversas anteriores e ela passa a imitar o tom e o estilo do seu atendimento.",
    className: "md:col-span-2",
  },
  {
    icon: ChartLine,
    title: "Mostra o que os pacientes procuram",
    text: "Dashboard com conversas por dia, taxa de conclusão e os principais motivos de contato.",
  },
];

export function Features() {
  return (
    <section id="o-que-faz" className="scroll-mt-20 py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="O que faz"
          title="Uma assistente que segue as suas regras"
          description="Tudo o que ela sabe e diz vem do que você configura no painel."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, text, className }, i) => (
            <Reveal
              key={title}
              delay={(i % 3) * 0.08}
              className={cn(className)}
            >
              <SpotlightCard>
                <span className="mb-5 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <Icon className="size-5" />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-muted-foreground">{text}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
