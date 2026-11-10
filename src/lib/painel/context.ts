import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import {
  getMyClinicWithSubscriptions,
  pickActiveSubscription,
} from "@/lib/billing/subscription";
import { canAccess, type Area } from "@/lib/painel/areas";
import { createClient } from "@/lib/supabase/server";

/**
 * Quem abre o painel: logado, ligado a uma clínica e com assinatura ativa. Sem assinatura, vai
 * para /assinatura. Memorizado por requisição (o layout e a página leem uma vez só). Lê cookies:
 * quem chama precisa estar dentro de um <Suspense>.
 *
 * Para abrir telas, confere o login com getClaims (valida a assinatura do token sem ir ao
 * servidor de login quando o projeto usa chaves assimétricas) e lê clínica e assinatura numa
 * consulta só. As ações que alteram dados (getActionContext) continuam com getUser.
 */
export const getPanelContext = cache(async () => {
  // Sempre na hora do pedido: a sessão e as datas de validade dependem do relógio.
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) redirect(`/entrar?next=${encodeURIComponent("/painel")}`);
  const user = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };

  const found = await getMyClinicWithSubscriptions(supabase, user.id);
  if (!found) {
    // Conta só da equipe LumenzIA (sem clínica): o lugar dela é o painel da equipe.
    const { data: isAdmin } = await supabase.rpc("is_admin");
    redirect(isAdmin ? "/admin" : "/assinatura");
  }

  const subscription = pickActiveSubscription(found.subscriptions);
  if (!subscription) redirect("/assinatura");

  return { supabase, user, clinic: found.clinic, subscription };
});

type ActionContext =
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: User;
      clinic: NonNullable<
        Awaited<ReturnType<typeof getMyClinicWithSubscriptions>>
      >["clinic"];
    }
  | { error: string };

/**
 * O mesmo, para Server Actions: em vez de redirecionar, devolve o motivo para mostrar na tela.
 * A clínica vem sempre do login, nunca do navegador. `area` confere se a pessoa da equipe pode
 * mexer nessa parte do painel (com uma lista, basta uma delas; "owner": só a dona).
 */
export async function getActionContext(
  area?: Area | Area[] | "owner",
): Promise<ActionContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre de novo." };

  const found = await getMyClinicWithSubscriptions(supabase, user.id);
  if (!found) return { error: "Sua conta não está ligada a uma clínica." };
  const { clinic } = found;
  if (area === "owner" && clinic.role !== "owner") {
    return { error: "Só a dona da conta pode fazer isso." };
  }
  const areas = area === undefined || area === "owner" ? [] : [area].flat();
  if (areas.length && !areas.some((a) => canAccess(clinic.access, a))) {
    return { error: "Você não tem acesso a esta parte do painel." };
  }

  if (!pickActiveSubscription(found.subscriptions))
    return {
      error: "Sua assinatura não está ativa. Renove para continuar.",
    };

  return { supabase, user, clinic };
}
