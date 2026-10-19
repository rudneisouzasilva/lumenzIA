import { cacheLife } from "next/cache";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase/env";

export type Plan = {
  code: string;
  name: string;
  description: string;
  priceCents: number;
  messageQuota: number;
  features: string[];
  highlight: boolean;
};

/** Os mesmos planos da migração 20261019000004_plans.sql, usados enquanto o Supabase não está ligado. */
const fallbackPlans: Plan[] = [
  {
    code: "plano-500",
    name: "Plano 500",
    description:
      "Ideal para começar: uma assistente no WhatsApp da sua clínica, configurada por você.",
    priceCents: 19700,
    messageQuota: 500,
    features: [
      "Até 500 mensagens da IA por mês",
      "Atendimento no WhatsApp 24 horas",
      "Respostas com base nas suas perguntas frequentes",
      "Envio das fotos que você aprovar",
      "Perguntas de qualificação definidas por você",
      "Histórico de conversas no painel",
    ],
    highlight: false,
  },
  {
    code: "plano-1500",
    name: "Plano 1500",
    description: "Para clínicas com volume maior de atendimento no WhatsApp.",
    priceCents: 39700,
    messageQuota: 1500,
    features: [
      "Até 1.500 mensagens da IA por mês",
      "Tudo do Plano 500",
      "Aprende com conversas reais da sua clínica",
      "Agenda integrada com lembrete automático",
    ],
    highlight: true,
  },
  {
    code: "plano-3000",
    name: "Plano 3000",
    description: "Para quem atende um volume alto de pacientes todos os meses.",
    priceCents: 69700,
    messageQuota: 3000,
    features: [
      "Até 3.000 mensagens da IA por mês",
      "Tudo do Plano 1500",
      "Prioridade no suporte",
    ],
    highlight: false,
  },
];

/** Planos ativos, em ordem. Lidos do Supabase (tabela pública) e guardados em cache por horas. */
export async function getPlans(): Promise<Plan[]> {
  "use cache";
  cacheLife("hours");

  if (!isSupabaseConfigured) return fallbackPlans;

  const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("plans")
    .select(
      "code, name, description, price_cents, message_quota, features, highlight",
    )
    .eq("active", true)
    .order("sort_order");

  if (error || !data?.length) {
    if (error)
      console.error("[planos] falha ao ler do Supabase:", error.message);
    return fallbackPlans;
  }

  return data.map((p) => ({
    code: p.code,
    name: p.name,
    description: p.description,
    priceCents: p.price_cents,
    messageQuota: p.message_quota,
    features: Array.isArray(p.features) ? p.features.map(String) : [],
    highlight: p.highlight,
  }));
}

export { formatPrice } from "@/lib/format";
