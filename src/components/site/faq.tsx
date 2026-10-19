import Link from "next/link";

import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section-heading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: "A assistente pode passar um preço errado?",
    a: "Ela só usa o que você cadastrou. Sem a informação, diz que vai confirmar com a equipe. Mesmo assim, recomendamos testar no painel antes de ativar.",
  },
  {
    q: "Preciso trocar o número de WhatsApp da clínica?",
    a: "O número precisa estar ativo na API oficial do WhatsApp Business (Meta). Nossa equipe ajuda nesse passo; se tiver dúvida, fale com a gente pelo WhatsApp.",
  },
  {
    q: "E quando o paciente quer falar com uma pessoa?",
    a: "A assistente avisa a sua equipe na hora. Pelo painel, alguém assume a conversa e responde direto, e depois pode devolver o atendimento para a IA.",
  },
  {
    q: "Como funciona o pagamento?",
    a: "Online, pelo Mercado Pago, com renovação automática todo mês. O painel é liberado assim que o pagamento é confirmado.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Você cancela a renovação a qualquer momento pelo painel. O acesso continua até o fim do período que você já pagou, sem cobrança surpresa depois disso.",
  },
  {
    q: "E os dados dos meus pacientes?",
    a: (
      <>
        As conversas ficam no painel, com acesso restrito à sua clínica. Para
        gerar as respostas, o texto da conversa é processado pelo Google
        (Gemini). Os detalhes estão na{" "}
        <Link
          href="/privacidade"
          className="text-primary underline underline-offset-4"
        >
          Política de Privacidade
        </Link>
        .
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="perguntas" className="scroll-mt-20 py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <SectionHeading eyebrow="Perguntas" title="Perguntas frequentes" />
        <Reveal>
          <Accordion
            type="single"
            collapsible
            className="rounded-2xl border bg-card/70 px-6 shadow-sm"
          >
            {faqs.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
