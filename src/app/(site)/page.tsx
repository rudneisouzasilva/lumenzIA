import { Faq } from "@/components/site/faq";
import { Features } from "@/components/site/features";
import { FinalCta } from "@/components/site/final-cta";
import { Hero } from "@/components/site/hero";
import { HowItWorks } from "@/components/site/how-it-works";
import { PricingCards } from "@/components/site/pricing";
import { SectionHeading } from "@/components/site/section-heading";
import { getPlans } from "@/lib/data/plans";

export default async function HomePage() {
  const plans = await getPlans();

  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <section id="planos" className="scroll-mt-20 py-24">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Planos"
            title="Escolha pelo volume de atendimento"
            description="Cobrança mensal, sem fidelidade. Cancele quando quiser."
          />
          <PricingCards plans={plans} />
        </div>
      </section>
      <Faq />
      <FinalCta />
    </>
  );
}
