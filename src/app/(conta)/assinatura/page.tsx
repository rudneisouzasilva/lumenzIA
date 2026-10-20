import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  KeyRound,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/user";
import { getPaymentMode, type PaymentMode } from "@/lib/billing/config";
import {
  findRecentPending,
  getClinicSubscriptions,
  isInGracePeriod,
  getMyClinic,
  pickActiveSubscription,
  type SubscriptionRow,
} from "@/lib/billing/subscription";
import { getPlans } from "@/lib/data/plans";
import { formatDate } from "@/lib/format";
import { whatsappLink } from "@/lib/site";

import { CancelRenewalButton } from "./cancel-renewal-button";
import { PlanPicker } from "./plan-picker";

export const metadata: Metadata = { title: "Assinatura" };

export default function SubscriptionPage({
  searchParams,
}: PageProps<"/assinatura">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SubscriptionView searchParams={searchParams} />
    </Suspense>
  );
}

async function SubscriptionView({
  searchParams,
}: Pick<PageProps<"/assinatura">, "searchParams">) {
  const params = await searchParams;
  const planParam = typeof params.plano === "string" ? params.plano : null;
  const { supabase, user } = await requireUser(
    planParam ? `/assinatura?plano=${planParam}` : "/assinatura",
  );

  const [clinic, plans] = await Promise.all([
    getMyClinic(supabase, user.id),
    getPlans(),
  ]);
  const firstName =
    String(user.user_metadata?.full_name ?? "").split(" ")[0] || "olá";

  let mode: PaymentMode | null = null;
  try {
    mode = getPaymentMode();
  } catch (e) {
    console.error("[assinatura]", (e as Error).message);
  }

  if (!clinic) {
    // Conta só da equipe LumenzIA: não assina plano nenhum.
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin) redirect("/admin");
    return (
      <Notice
        icon={<TriangleAlert className="size-6 text-destructive" />}
        title="Sua conta não está ligada a uma clínica"
      >
        Isso não deveria acontecer.{" "}
        <a
          href={whatsappLink("Olá! Minha conta da LumenzIA está sem clínica.")}
          className="font-medium text-primary underline underline-offset-4"
        >
          Fale com a gente no WhatsApp
        </a>{" "}
        que resolvemos.
      </Notice>
    );
  }

  const subs = await getClinicSubscriptions(supabase, clinic.id);
  const active = pickActiveSubscription(subs);
  const pending = active ? undefined : findRecentPending(subs);
  const isOwner = clinic.role === "owner";

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-medium text-primary">{clinic.name}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {active ? `Tudo certo, ${firstName}!` : `Falta pouco, ${firstName}`}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {active
            ? "Sua assinatura está ativa. Aqui você acompanha o plano e o uso do mês."
            : "Escolha o plano da sua clínica para liberar a assistente."}
        </p>
      </div>

      {params.senha === "alterada" && (
        <Notice
          icon={<KeyRound className="size-5 text-primary" />}
          title="Senha alterada"
        >
          Da próxima vez, entre com a nova senha.
        </Notice>
      )}

      {active ? (
        <ActiveSubscription
          sub={active}
          canCancel={isOwner && active.status !== "cancelled"}
        />
      ) : (
        <>
          {pending && (
            <Notice
              icon={<Clock3 className="size-5 text-glow" />}
              title={`Pagamento do ${pending.plans?.name ?? "plano"} ainda não confirmado`}
            >
              Se você já autorizou a cobrança,{" "}
              <Link
                href={`/pagamento?assinatura=${pending.id}`}
                className="font-medium text-primary underline underline-offset-4"
              >
                acompanhe aqui
              </Link>
              . Ou escolha um plano abaixo para começar de novo.
            </Notice>
          )}
          {!mode ? (
            <Notice
              icon={<TriangleAlert className="size-5 text-destructive" />}
              title="Cobrança indisponível"
            >
              A cobrança não está configurada neste ambiente. Fale com o
              suporte.
            </Notice>
          ) : (
            <PlanPicker
              plans={plans}
              initialCode={planParam}
              testMode={mode === "mock"}
              disabledReason={
                isOwner ? null : "Só a dona da conta pode assinar um plano."
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function ActiveSubscription({
  sub,
  canCancel,
}: {
  sub: SubscriptionRow;
  canCancel: boolean;
}) {
  const quota = sub.plans?.message_quota ?? 0;
  const used = sub.messages_used_this_period;
  const percent = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const inGrace = isInGracePeriod(sub);
  const cancelled = sub.status === "cancelled";
  const until = inGrace ? sub.grace_until! : sub.current_period_end!;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-primary/10 via-transparent to-glow/10 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Seu plano</p>
          <p className="font-display text-2xl font-semibold">
            {sub.plans?.name ?? "Plano"}
          </p>
        </div>
        <span
          className={
            inGrace
              ? "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive"
              : cancelled
                ? "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
                : "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-600 dark:text-emerald-400"
          }
        >
          {inGrace ? (
            <TriangleAlert className="size-4" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          {inGrace
            ? "Pagamento recusado"
            : cancelled
              ? "Renovação cancelada"
              : "Ativa"}
        </span>
      </div>

      <div className="grid gap-8 p-6 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">
            Mensagens da IA neste ciclo
          </p>
          <p className="mt-1 font-display text-2xl font-semibold">
            {used.toLocaleString("pt-BR")}{" "}
            <span className="text-base font-normal text-muted-foreground">
              de {quota.toLocaleString("pt-BR")}
            </span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-glow transition-[width] duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {inGrace
              ? "Atendimento garantido até"
              : cancelled
                ? "Acesso até"
                : "Próxima renovação"}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold">
            {formatDate(until)}
          </p>
          {inGrace && (
            <p className="mt-2 text-sm text-muted-foreground">
              O Mercado Pago vai tentar cobrar de novo. Confira o cartão
              cadastrado para não interromper o atendimento.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-6">
        <Button asChild>
          <Link href="/painel">
            <Settings2 />
            Configurar a assistente
          </Link>
        </Button>
        {canCancel && <CancelRenewalButton until={formatDate(until)} />}
      </div>
    </section>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-10" aria-hidden>
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-9 w-72 rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-56 rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
