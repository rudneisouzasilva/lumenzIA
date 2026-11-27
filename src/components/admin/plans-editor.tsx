"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { updatePlan } from "@/app/(admin)/admin/actions";
import { FieldError } from "@/components/painel/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";

export type EditablePlan = {
  id: number;
  name: string;
  priceCents: number;
  quota: number;
  active: boolean;
};

/** 19700 → "197,00" */
const toReais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** "197", "197,5", "1.297,90" ou "197.90" → centavos; null se não for um valor. */
export function parseReais(raw: string): number | null {
  let text = raw.replace(/[R$\s]/g, "");
  if (!text) return null;
  // Com vírgula, ela é o decimal e os pontos são milhar; sem vírgula, um ponto com 1 ou 2
  // dígitos no fim é decimal.
  if (text.includes(",")) text = text.replaceAll(".", "").replace(",", ".");
  else if (!/\.\d{1,2}$/.test(text)) text = text.replaceAll(".", "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export function PlansEditor({ plans }: { plans: EditablePlan[] }) {
  if (!plans.length) {
    return <p className="text-sm text-muted-foreground">Nenhum plano.</p>;
  }
  return (
    <div className="grid gap-4">
      {plans.map((plan) => (
        <PlanRow key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

function PlanRow({ plan }: { plan: EditablePlan }) {
  const [price, setPrice] = useState(toReais(plan.priceCents));
  const [quota, setQuota] = useState(String(plan.quota));
  const [saved, setSaved] = useState({
    priceCents: plan.priceCents,
    quota: plan.quota,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const priceCents = parseReais(price);
  const quotaNumber = Number(quota);
  const changed =
    priceCents !== saved.priceCents || quotaNumber !== saved.quota;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (priceCents == null) {
      setError("Escreva o preço em reais, por exemplo 197 ou 9,90.");
      return;
    }
    startTransition(async () => {
      const result = await updatePlan({
        planId: plan.id,
        priceCents,
        messageQuota: quotaNumber,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved({ priceCents, quota: quotaNumber });
      setPrice(toReais(priceCents));
      toast.success(`${plan.name}: agora ${formatPrice(priceCents)} por mês.`);
    });
  };

  const priceId = `plan-${plan.id}-price`;
  const quotaId = `plan-${plan.id}-quota`;
  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end"
    >
      <div>
        <p className="font-medium">{plan.name}</p>
        <p className="text-sm text-muted-foreground">
          Hoje: {formatPrice(saved.priceCents)}/mês ·{" "}
          {saved.quota.toLocaleString("pt-BR")} mensagens
          {!plan.active && " · fora do site"}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={priceId}>Preço (R$)</Label>
        <Input
          id={priceId}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={quotaId}>Mensagens por mês</Label>
        <Input
          id={quotaId}
          inputMode="numeric"
          value={quota}
          onChange={(e) => setQuota(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <Button type="submit" disabled={pending || !changed}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        Salvar
      </Button>
      <div className="empty:hidden sm:col-span-4">
        <FieldError message={error ?? undefined} />
      </div>
    </form>
  );
}
