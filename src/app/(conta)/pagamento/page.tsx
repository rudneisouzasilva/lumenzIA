import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleX, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/user";
import { getPaymentMode } from "@/lib/billing/config";
import { getPreapproval } from "@/lib/billing/mercadopago";
import { isSubscriptionActive } from "@/lib/billing/subscription";
import { formatDate, formatPrice } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

import { MockConfirm, PaymentSuccess, WaitingConfirmation } from "./status";

export const metadata: Metadata = { title: "Pagamento" };

/** Para onde a pessoa volta depois de pagar (ou, no modo de teste, onde confirma o pagamento). */
export default function PaymentPage({ searchParams }: PageProps<"/pagamento">) {
  return (
    <div className="mx-auto max-w-lg">
      <Suspense
        fallback={<div className="h-72 animate-pulse rounded-2xl bg-muted" />}
      >
        <PaymentView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PaymentView({
  searchParams,
}: Pick<PageProps<"/pagamento">, "searchParams">) {
  const { assinatura } = await searchParams;
  const id = typeof assinatura === "string" ? assinatura : "";
  const { supabase } = await requireUser(`/pagamento?assinatura=${id}`);

  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const { data: sub } = isUuid
    ? await supabase
        .from("subscriptions")
        .select(
          "id, status, mp_preapproval_id, current_period_end, grace_until, plans(name, price_cents)",
        )
        .eq("id", id)
        .maybeSingle()
    : { data: null };

  if (!sub) {
    return (
      <Card
        icon={<SearchX className="size-7 text-muted-foreground" />}
        title="Assinatura não encontrada"
        text="O link pode estar incompleto. Veja sua assinatura para continuar."
      />
    );
  }

  const planName = sub.plans?.name ?? "plano";
  if (isSubscriptionActive(sub)) {
    return (
      <PaymentSuccess
        planName={planName}
        until={formatDate(sub.current_period_end ?? sub.grace_until!)}
      />
    );
  }

  let mode = null;
  try {
    mode = getPaymentMode();
  } catch {}

  if (mode === "mock") {
    return (
      <MockConfirm
        subscriptionId={sub.id}
        planName={planName}
        price={formatPrice(sub.plans?.price_cents ?? 0)}
      />
    );
  }

  // Ao voltar do Mercado Pago, atualiza o status da autorização (quem libera o acesso é a
  // cobrança aprovada, que chega pelo webhook).
  let status = sub.status;
  if (mode === "mercadopago" && sub.mp_preapproval_id) {
    try {
      const preapproval = await getPreapproval(sub.mp_preapproval_id);
      if (preapproval.status !== status) {
        status = preapproval.status;
        await createAdminClient()
          .from("subscriptions")
          .update({ status })
          .eq("id", sub.id)
          .throwOnError();
      }
    } catch (e) {
      console.error("[pagamento] sincronizar:", (e as Error).message);
    }
  }

  if (status === "cancelled") {
    return (
      <Card
        icon={<CircleX className="size-7 text-destructive" />}
        title="A assinatura não foi concluída"
        text="O Mercado Pago informou que esta assinatura foi cancelada. Você pode escolher o plano de novo."
      />
    );
  }

  return <WaitingConfirmation planName={planName} />;
}

function Card({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
        {icon}
      </span>
      <h1 className="mt-5 font-display text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{text}</p>
      <Button asChild className="mt-6">
        <Link href="/assinatura">Ver minha assinatura</Link>
      </Button>
    </div>
  );
}
