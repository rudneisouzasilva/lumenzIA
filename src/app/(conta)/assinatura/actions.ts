"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { getAppUrl } from "@/lib/app-url";
import type { FormResult } from "@/lib/auth/validation";
import { requireUser } from "@/lib/auth/user";
import { getPaymentMode } from "@/lib/billing/config";
import {
  cancelPreapproval,
  createPreapproval,
} from "@/lib/billing/mercadopago";
import {
  getClinicSubscriptions,
  getMyClinic,
  pickActiveSubscription,
} from "@/lib/billing/subscription";
import { createAdminClient } from "@/lib/supabase/admin";

function fail(error: string): FormResult {
  return { ok: false, error };
}

/** Só a dona da clínica assina ou cancela. */
async function requireOwner() {
  const { supabase, user } = await requireUser();
  const clinic = await getMyClinic(supabase, user.id);
  if (!clinic)
    return { error: fail("Sua conta não está ligada a uma clínica.") };
  if (clinic.role !== "owner")
    return { error: fail("Só a dona da conta pode mudar a assinatura.") };
  return { supabase, user, clinic };
}

/**
 * Cria a assinatura (pendente) e manda para o pagamento: no modo de teste, para a nossa página de
 * confirmação; no Mercado Pago, para a página onde a pessoa autoriza a cobrança mensal.
 */
export async function startCheckout(planCode: string): Promise<FormResult> {
  const ctx = await requireOwner();
  if ("error" in ctx) return ctx.error!;
  const { supabase, user, clinic } = ctx;

  let mode;
  try {
    mode = getPaymentMode();
  } catch (e) {
    console.error("[assinatura]", (e as Error).message);
    return fail("A cobrança não está configurada. Fale com o suporte.");
  }

  // Durante um acesso liberado pela equipe dá para assinar: os dias que faltavam passam para o
  // plano pago quando o primeiro pagamento é aprovado.
  const subs = await getClinicSubscriptions(supabase, clinic.id);
  if (pickActiveSubscription(subs.filter((s) => !s.is_grant))) {
    return fail("Sua clínica já tem uma assinatura ativa.");
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("id, name, price_cents")
    .eq("code", planCode)
    .eq("active", true)
    .maybeSingle();
  if (!plan) return fail("Plano não encontrado.");

  const admin = createAdminClient();
  const { data: sub, error } = await admin
    .from("subscriptions")
    .insert({ clinic_id: clinic.id, plan_id: plan.id, status: "pending" })
    .select("id")
    .single();
  if (error) {
    console.error("[assinatura] criar:", error.message);
    return fail("Não foi possível iniciar a assinatura. Tente de novo.");
  }

  const returnPath = `/pagamento?assinatura=${sub.id}`;
  if (mode === "mock") redirect(returnPath);

  let initPoint: string;
  try {
    const preapproval = await createPreapproval({
      subscriptionId: sub.id,
      planName: plan.name,
      priceCents: plan.price_cents,
      payerEmail: user.email!,
      backUrl: `${await getAppUrl()}${returnPath}`,
    });
    await admin
      .from("subscriptions")
      .update({ mp_preapproval_id: preapproval.id })
      .eq("id", sub.id)
      .throwOnError();
    initPoint = preapproval.initPoint;
  } catch (e) {
    console.error("[assinatura] Mercado Pago:", (e as Error).message);
    return fail(
      "O Mercado Pago não respondeu. Tente novamente em alguns instantes.",
    );
  }
  redirect(initPoint);
}

/** Modo de teste: aprova a primeira cobrança sem cobrar nada. */
export async function confirmMockPayment(
  subscriptionId: string,
): Promise<FormResult> {
  let mode;
  try {
    mode = getPaymentMode();
  } catch {
    mode = null;
  }
  if (mode !== "mock") return fail("O modo de teste está desligado.");

  const ctx = await requireOwner();
  if ("error" in ctx) return ctx.error!;

  // Lida pelo RLS: só encontra assinaturas da própria clínica.
  const { data: sub } = await ctx.supabase
    .from("subscriptions")
    .select("id, plans(price_cents)")
    .eq("id", subscriptionId)
    .eq("clinic_id", ctx.clinic.id)
    .maybeSingle();
  if (!sub) return fail("Assinatura não encontrada.");

  const { error } = await createAdminClient().rpc(
    "apply_subscription_payment",
    {
      p_subscription_id: sub.id,
      p_provider_payment_id: `mock-${randomUUID()}`,
      p_amount_cents: sub.plans?.price_cents ?? 0,
      p_approved: true,
    },
  );
  if (error) {
    console.error("[assinatura] mock:", error.message);
    return fail("Não foi possível confirmar o pagamento de teste.");
  }
  redirect(`/pagamento?assinatura=${sub.id}`);
}

/**
 * Cancela a renovação automática. O acesso continua até o fim do período já pago.
 */
export async function cancelRenewal(): Promise<FormResult> {
  const ctx = await requireOwner();
  if ("error" in ctx) return ctx.error!;

  const active = pickActiveSubscription(
    await getClinicSubscriptions(ctx.supabase, ctx.clinic.id),
  );
  if (!active) return fail("Não há assinatura ativa para cancelar.");
  if (active.is_grant) {
    return fail("Este acesso foi liberado pela equipe e não se renova.");
  }
  if (active.status === "cancelled") return { ok: true };

  try {
    if (getPaymentMode() === "mercadopago" && active.mp_preapproval_id) {
      await cancelPreapproval(active.mp_preapproval_id);
    }
    await createAdminClient()
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", active.id)
      .throwOnError();
  } catch (e) {
    console.error("[assinatura] cancelar:", (e as Error).message);
    return fail("Não foi possível cancelar agora. Tente de novo.");
  }
  return { ok: true };
}
