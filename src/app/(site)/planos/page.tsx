import type { Metadata } from "next";

import { PricingCards } from "@/components/site/pricing";
import { getPlans } from "@/lib/data/plans";
import { whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Planos",
  description:
    "Planos mensais da LumenzIA por volume de mensagens da assistente no WhatsApp.",
};

export default async function PlansPage() {
  const plans = await getPlans();

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Escolha seu plano
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Assine e o painel é liberado assim que o pagamento for confirmado.
            Renovação mensal automática, cancele quando quiser.
          </p>
        </div>
        <PricingCards plans={plans} />
        <p className="mt-12 text-center text-sm text-muted-foreground">
          Dúvidas antes de assinar?{" "}
          <a
            href={whatsappLink(
              "Olá! Tenho uma dúvida sobre os planos da LumenzIA.",
            )}
            target="_blank"
            rel="noopener"
            className="font-medium text-primary underline underline-offset-4"
          >
            Fale com a gente no WhatsApp
          </a>
          .
        </p>
      </div>
    </div>
  );
}
