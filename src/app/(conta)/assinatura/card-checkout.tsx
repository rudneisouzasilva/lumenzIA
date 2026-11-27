"use client";

import { useEffect, useState } from "react";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { Loader2, Lock } from "lucide-react";
import { useTheme } from "next-themes";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Plan } from "@/lib/data/plans";
import { formatPrice } from "@/lib/format";

import { subscribeWithCard } from "./actions";

let initializedKey: string | null = null;

/**
 * Formulário de cartão do próprio Mercado Pago (Card Payment Brick) dentro da LumenzIA. Os dados
 * do cartão vão direto para o Mercado Pago, que devolve um token de uso único; o servidor só usa
 * esse token para criar a assinatura mensal. A pessoa não precisa ter conta no Mercado Pago.
 */
export function CardCheckout({
  open,
  onOpenChange,
  publicKey,
  plan,
  payerEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publicKey: string;
  plan: Plan;
  payerEmail: string;
}) {
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initializedKey === publicKey) return;
    initMercadoPago(publicKey, { locale: "pt-BR" });
    initializedKey = publicKey;
  }, [publicKey]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setReady(false);
          setError(null);
        }
      }}
    >
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>
          {plan.name} por {formatPrice(plan.priceCents)}/mês
        </DialogTitle>
        <DialogDescription className="flex items-start gap-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
          Os dados do cartão vão direto para o Mercado Pago. A cobrança se
          repete todo mês no mesmo cartão, e você cancela quando quiser.
        </DialogDescription>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {!ready && (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        )}
        {open && (
          <CardPayment
            key={`${plan.code}-${resolvedTheme}`}
            locale="pt-BR"
            initialization={{
              amount: plan.priceCents / 100,
              payer: { email: payerEmail },
            }}
            customization={{
              paymentMethods: {
                maxInstallments: 1,
                types: { included: ["credit_card"] },
              },
              visual: {
                style: { theme: resolvedTheme === "dark" ? "dark" : "default" },
              },
            }}
            onReady={() => setReady(true)}
            onError={(e) => {
              console.error("[assinatura] formulário do cartão:", e);
              setReady(true);
            }}
            onSubmit={async (data) => {
              setError(null);
              const result = await subscribeWithCard({
                planCode: plan.code,
                token: data.token,
                email: data.payer?.email || payerEmail,
              });
              // Sucesso redireciona para a página do pagamento; só volta aqui com erro.
              if (result && !result.ok) {
                setError(result.error);
                // Faz o formulário liberar o botão de novo.
                throw new Error(result.error);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
