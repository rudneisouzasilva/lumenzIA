import Link from "next/link";
import { Check } from "lucide-react";

import { Reveal } from "@/components/site/reveal";
import { Button } from "@/components/ui/button";
import { formatPrice, type Plan } from "@/lib/data/plans";
import { cn } from "@/lib/utils";

export function PricingCards({ plans }: { plans: Plan[] }) {
  return (
    <div className="grid items-stretch gap-6 md:grid-cols-3">
      {plans.map((plan, i) => (
        <Reveal key={plan.code} delay={i * 0.1} className="h-full">
          <article
            className={cn(
              "relative flex h-full flex-col rounded-2xl border bg-card p-7 shadow-sm transition-transform duration-300 hover:-translate-y-1",
              plan.highlight &&
                "border-transparent shadow-xl shadow-primary/20 [background:linear-gradient(var(--card),var(--card))_padding-box,linear-gradient(135deg,var(--primary),var(--glow))_border-box] md:scale-[1.04]",
            )}
          >
            {plan.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-fuchsia-500 px-3 py-1 text-xs font-semibold text-white shadow">
                Mais escolhido
              </span>
            )}
            <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
            <p className="mt-2 min-h-12 text-sm text-muted-foreground">
              {plan.description}
            </p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="font-display text-4xl font-semibold tracking-tight">
                {formatPrice(plan.priceCents)}
              </span>
              <span className="text-muted-foreground">/mês</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              asChild
              size="lg"
              variant={plan.highlight ? "default" : "outline"}
              className="mt-8 w-full"
            >
              <Link href={`/cadastro?plano=${plan.code}`}>Assinar agora</Link>
            </Button>
          </article>
        </Reveal>
      ))}
    </div>
  );
}
