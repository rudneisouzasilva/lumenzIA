"use client";

import { useState, useTransition } from "react";
import { Check, FlaskConical, Loader2, Lock } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/data/plans";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

import { startCheckout } from "./actions";

export function PlanPicker({
  plans,
  initialCode,
  testMode,
  disabledReason,
}: {
  plans: Plan[];
  initialCode: string | null;
  testMode: boolean;
  disabledReason: string | null;
}) {
  const [selected, setSelected] = useState(
    plans.find((p) => p.code === initialCode)?.code ??
      plans.find((p) => p.highlight)?.code ??
      plans[0]?.code,
  );
  const [pending, startTransition] = useTransition();
  const plan = plans.find((p) => p.code === selected);

  const checkout = () => {
    if (!plan) return;
    startTransition(async () => {
      const result = await startCheckout(plan.code);
      if (result && !result.ok) toast.error(result.error);
    });
  };

  return (
    <section className="space-y-6">
      <div
        role="radiogroup"
        aria-label="Planos"
        className="grid gap-4 md:grid-cols-3"
      >
        {plans.map((p) => {
          const isSelected = p.code === selected;
          return (
            <button
              key={p.code}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${p.name}, ${formatPrice(p.priceCents)} por mês, até ${p.messageQuota.toLocaleString("pt-BR")} mensagens`}
              onClick={() => setSelected(p.code)}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 text-left shadow-sm transition-all duration-300 outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50",
                isSelected && "border-transparent",
              )}
            >
              {isSelected && (
                <motion.span
                  layoutId="plan-selected"
                  aria-hidden
                  className="absolute inset-0 rounded-2xl border-2 border-primary shadow-lg shadow-primary/15"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="flex items-center justify-between">
                <span className="font-display text-lg font-semibold">
                  {p.name}
                </span>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border transition-colors",
                    isSelected && "border-primary bg-primary text-white",
                  )}
                >
                  {isSelected && <Check className="size-3.5" />}
                </span>
              </span>
              {p.highlight && (
                <span className="mt-2 w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Mais escolhido
                </span>
              )}
              <span className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-3xl font-semibold tracking-tight">
                  {formatPrice(p.priceCents)}
                </span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </span>
              <span className="mt-1 text-sm text-muted-foreground">
                Até {p.messageQuota.toLocaleString("pt-BR")} mensagens da IA por
                mês
              </span>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.slice(1, 4).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card/60 p-6 text-center backdrop-blur sm:flex-row sm:justify-between sm:text-left">
        <div className="text-sm text-muted-foreground">
          {testMode ? (
            <span className="flex items-center gap-2">
              <FlaskConical className="size-4 text-glow" />
              Modo de teste: nenhum valor será cobrado.
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Lock className="size-4 text-primary" />
              Pagamento seguro pelo Mercado Pago. Renovação mensal, cancele
              quando quiser.
            </span>
          )}
          {disabledReason && (
            <span className="mt-1 block text-destructive">
              {disabledReason}
            </span>
          )}
        </div>
        <Button
          size="lg"
          onClick={checkout}
          disabled={pending || !plan || Boolean(disabledReason)}
          className="w-full sm:w-auto"
        >
          {pending && <Loader2 className="animate-spin" />}
          {plan
            ? `Assinar ${plan.name} por ${formatPrice(plan.priceCents)}/mês`
            : "Escolha um plano"}
        </Button>
      </div>
    </section>
  );
}
