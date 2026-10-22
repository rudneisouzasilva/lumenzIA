import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { GenerateInsightsButton } from "@/components/painel/generate-insights-button";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { PageTabs } from "@/components/painel/page-tabs";
import type { Insights } from "@/lib/ai/insights";
import { formatDate, isoDateInBrasilia } from "@/lib/format";
import { getPanelContext } from "@/lib/painel/context";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Análise da IA" };

// A IA leva de 20 a 40 segundos para ler os 12 meses.
export const maxDuration = 60;

const monthName = (month: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T12:00:00Z`));

export default function InsightsPage({
  searchParams,
}: PageProps<"/painel/analise">) {
  return (
    <>
      <PageTabs group="relatorios" />
      <PageHeader
        icon={Brain}
        title="Análise da IA"
        description="Uma vez por mês, a IA lê os últimos 12 meses de atendimento da clínica e mostra o que está funcionando, por que as pessoas não agendam e o que fazer."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Analysis searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Analysis({
  searchParams,
}: Pick<PageProps<"/painel/analise">, "searchParams">) {
  const [{ supabase, clinic }, params] = await Promise.all([
    getPanelContext(),
    searchParams,
  ]);
  const { data: rows } = await supabase
    .from("ai_insights")
    .select("id, month, status, period_from, period_to, content, created_at")
    .eq("clinic_id", clinic.id)
    .order("month", { ascending: false })
    .limit(24)
    .throwOnError();

  const currentMonth = `${isoDateInBrasilia().slice(0, 7)}-01`;
  const ready = rows.filter((r) => r.status === "pronto");
  const wanted = typeof params.mes === "string" ? `${params.mes}-01` : null;
  const shown = ready.find((r) => r.month === wanted) ?? ready[0] ?? null;
  const thisMonth = rows.find((r) => r.month === currentMonth);
  const insights = shown?.content as Insights | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {ready.length > 1 ? (
          <nav className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
            {ready.map((r) => (
              <Link
                key={r.id}
                href={`/painel/analise?mes=${r.month.slice(0, 7)}`}
                aria-current={r.id === shown?.id ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm capitalize transition-colors",
                  r.id === shown?.id
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {monthName(r.month)}
              </Link>
            ))}
          </nav>
        ) : (
          <span />
        )}
        {thisMonth ? (
          <p className="text-sm text-muted-foreground">
            {thisMonth.status === "gerando"
              ? "A análise deste mês está sendo gerada…"
              : "A próxima análise pode ser gerada no mês que vem."}
          </p>
        ) : (
          <GenerateInsightsButton
            label={`Gerar a análise de ${monthName(currentMonth)}`}
          />
        )}
      </div>

      {!insights ? (
        <PanelCard>
          <div className="mx-auto max-w-md py-10 text-center">
            <Sparkles className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-display text-lg font-semibold">
              Nenhuma análise ainda
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clique em gerar para a IA ler os últimos 12 meses. Ela usa só os
              números e os resumos das conversas, sem nome nem telefone de
              ninguém.
            </p>
          </div>
        </PanelCard>
      ) : (
        <>
          <PanelCard
            title={`Análise de ${monthName(shown!.month)}`}
            description={`Período lido: ${formatDate(`${shown!.period_from}T12:00:00Z`)} a ${formatDate(`${shown!.period_to}T12:00:00Z`)}.`}
          >
            <p className="text-base leading-relaxed">{insights.resumo}</p>
          </PanelCard>

          {insights.recomendacoes.length > 0 && (
            <PanelCard title="O que fazer agora">
              <ol className="grid gap-3">
                {insights.recomendacoes.map((r, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border p-4">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {r.acao} <ImpactBadge impact={r.impacto} />
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.porque}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </PanelCard>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              icon={TrendingUp}
              title="Destaques"
              items={insights.destaques.map((d) => [d.titulo, d.detalhe])}
            />
            <Section
              icon={Target}
              title="Por que procuram a clínica"
              items={insights.motivacoes.map((m) => [m.motivo, m.leitura])}
            />
            <Section
              icon={AlertTriangle}
              title="Por que não agendam"
              items={insights.perdas.map((p) => [p.causa, p.leitura])}
            />
            <Section
              icon={Lightbulb}
              title="Oportunidades"
              items={insights.oportunidades.map((o) => [o.titulo, o.acao])}
              footer={
                <Link
                  href="/painel/oportunidades"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver quem retomar no funil
                </Link>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function ImpactBadge({ impact }: { impact: "alto" | "medio" | "baixo" }) {
  const map = {
    alto: [
      "Impacto alto",
      "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    ],
    medio: [
      "Impacto médio",
      "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    ],
    baixo: ["Impacto baixo", "bg-muted text-muted-foreground"],
  } as const;
  const [label, css] = map[impact];
  return (
    <span
      className={cn(
        "ml-1 inline-flex rounded-full px-2 py-0.5 align-middle text-[11px] font-medium",
        css,
      )}
    >
      {label}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  items,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: [string, string][];
  footer?: React.ReactNode;
}) {
  if (!items.length) return null;
  return (
    <PanelCard>
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <Icon className="size-5 text-primary" />
        {title}
      </h2>
      <ul className="grid gap-3">
        {items.map(([head, body], i) => (
          <li key={i}>
            <p className="text-sm font-medium">{head}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-4">{footer}</div>}
    </PanelCard>
  );
}
