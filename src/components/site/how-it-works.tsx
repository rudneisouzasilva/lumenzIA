import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section-heading";

const steps = [
  {
    title: "Crie sua conta",
    text: "Cadastro em um minuto, com o nome da sua clínica.",
  },
  {
    title: "Assine o plano",
    text: "Pagamento online pelo Mercado Pago. O painel é liberado assim que o pagamento é confirmado.",
  },
  {
    title: "Configure e teste",
    text: "Fotos, perguntas, respostas e conversas antigas. Converse com a assistente no painel antes de ligar.",
  },
  {
    title: "Conecte o WhatsApp",
    text: "Nossa equipe liga o número da clínica à API oficial do WhatsApp. Depois é só ativar.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="relative scroll-mt-20 border-y bg-muted/40 py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Como funciona"
          title="Da assinatura ao primeiro atendimento"
        />
        <ol className="relative grid gap-10 md:grid-cols-4 md:gap-6">
          <div
            aria-hidden
            className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 md:block"
          />
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.12}>
              <li className="relative flex flex-col items-center text-center">
                <span className="relative z-10 grid size-12 place-items-center rounded-full border-2 border-primary/30 bg-background font-display text-lg font-semibold text-primary shadow-sm">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-muted-foreground">{step.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
