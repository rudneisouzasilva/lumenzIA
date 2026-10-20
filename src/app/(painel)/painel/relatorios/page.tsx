import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarSync,
  CheckCircle2,
  Download,
  Hand,
  Headset,
  MessagesSquare,
  Sparkles,
  Users,
  UserX,
} from "lucide-react";

import { DailyChart } from "@/components/painel/daily-chart";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatPhone } from "@/lib/format";
import { getPanelContext } from "@/lib/painel/context";
import { parsePeriod, PRESETS } from "@/lib/painel/period";
import { STAGE_COLOR_CLASS, type StageColor } from "@/lib/painel/pipeline";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Relatórios" };

type Stats = {
  total: number;
  concluida: number;
  abandonada: number;
  aberta: number;
  open_now: number;
  pending_now: number;
  ai_messages: number;
  staff_messages: number;
  staff_conversations: number;
  contacts: number;
  by_reason: { reason: string; total: number }[];
  daily: { day: string; total: number }[];
};

type FunnelStats = {
  new_contacts: number;
  won: number;
  lost: number;
  open: number;
  avg_hours_to_book: number | null;
  by_stage: {
    stage: string;
    color: StageColor;
    kind: string;
    reached: number;
    now: number;
  }[];
  by_reason: { reason: string; total: number; booked: number }[];
  lost_reasons: { reason: string; total: number }[];
  follow_ups: { sent: number; responded: number; booked: number };
};

type Params = Awaited<PageProps<"/painel/relatorios">["searchParams"]>;

export default function ReportsPage({
  searchParams,
}: PageProps<"/painel/relatorios">) {
  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Relatórios"
        description="Quantas conversas a assistente atendeu, como terminaram e por que os pacientes procuraram a clínica."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const num = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const dayLabel = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function Report({
  searchParams,
}: Pick<PageProps<"/painel/relatorios">, "searchParams">) {
  const [{ supabase, clinic }, params] = await Promise.all([
    getPanelContext(),
    searchParams,
  ]);
  const period = parsePeriod(params);
  const [{ data, error }, { data: funnelData }, { data: upcoming }] =
    await Promise.all([
      supabase.rpc("conversation_stats", {
        p_clinic_id: clinic.id,
        p_from: period.from,
        p_to: period.to,
      }),
      supabase
        .rpc("funnel_stats", {
          p_clinic_id: clinic.id,
          p_from: period.from,
          p_to: period.to,
        })
        .throwOnError(),
      supabase
        .from("appointments")
        .select(
          "id, contact_phone, patient_name, procedure_name, professional_name, starts_at, reminder_sent_at",
        )
        .eq("clinic_id", clinic.id)
        .eq("status", "agendado")
        .gt("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(8),
    ]);
  if (error) throw new Error(error.message);
  const stats = data as Stats;
  const funnel = funnelData as FunnelStats;

  const finished = stats.concluida + stats.abandonada;
  const completion = finished
    ? Math.round((stats.concluida / finished) * 100)
    : null;
  const maxReason = Math.max(1, ...stats.by_reason.map((r) => r.total));
  const exportHref = `/painel/relatorios/exportar?de=${period.from}&ate=${period.to}`;

  return (
    <div className="space-y-6">
      <PeriodBar period={period} params={params} exportHref={exportHref} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Tile
          icon={MessagesSquare}
          label="Conversas"
          value={num(stats.total)}
          hint={`${num(stats.contacts)} ${stats.contacts === 1 ? "contato" : "contatos"}`}
        />
        <Tile
          icon={CheckCircle2}
          label="Concluídas"
          value={num(stats.concluida)}
          hint={
            completion === null
              ? "nenhuma encerrada ainda"
              : `${completion}% das encerradas`
          }
        />
        <Tile
          icon={UserX}
          label="Não finalizadas"
          value={num(stats.abandonada)}
          hint="paciente parou de responder"
        />
        <Tile
          icon={Sparkles}
          label="Respostas da IA"
          value={num(stats.ai_messages)}
          hint="contam na cota do plano"
        />
        <Tile
          icon={Headset}
          label="Atendidas pela equipe"
          value={num(stats.staff_conversations)}
          hint={`${num(stats.staff_messages)} mensagens enviadas`}
        />
        <Tile
          icon={Hand}
          label="Em andamento agora"
          value={num(stats.open_now)}
          hint={
            stats.pending_now
              ? `${num(stats.pending_now)} esperando a equipe`
              : "ninguém esperando"
          }
          href="/painel/atendimento"
          highlight={stats.pending_now > 0}
        />
      </div>

      <FunnelSection funnel={funnel} />

      <PanelCard
        title="Conversas por dia"
        description={`De ${dayLabel(period.from)} a ${dayLabel(period.to)}, pelo dia em que o paciente escreveu pela primeira vez.`}
      >
        {stats.total ? (
          <DailyChart data={stats.daily} />
        ) : (
          <Empty text="Nenhuma conversa neste período." />
        )}
      </PanelCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <PanelCard
          title="Motivos de contato"
          description="Das conversas já encerradas, classificadas pela IA com os motivos que você cadastrou."
        >
          {stats.by_reason.length ? (
            <ul className="space-y-3">
              {stats.by_reason.map((r) => (
                <li key={r.reason}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">{r.reason}</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {num(r.total)}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {Math.round((r.total / finished) * 100)}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(r.total / maxReason) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              text={
                stats.aberta
                  ? "As conversas deste período ainda estão em andamento. Elas são classificadas quando encerram."
                  : "Nenhuma conversa encerrada neste período."
              }
            />
          )}
          <p className="mt-5 text-xs text-muted-foreground">
            Faltou algum motivo?{" "}
            <Link
              href="/painel/motivos"
              className="text-primary underline-offset-4 hover:underline"
            >
              Cadastre em Motivos de contato
            </Link>
            .
          </p>
        </PanelCard>

        <PanelCard
          title="Próximos agendamentos"
          description="Marcados pela assistente ou trazidos da agenda da clínica."
        >
          {upcoming?.length ? (
            <ul className="divide-y">
              {upcoming.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <CalendarDays className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">
                      {a.patient_name || formatPhone(a.contact_phone)}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {[a.procedure_name, a.professional_name]
                        .filter(Boolean)
                        .join(" · ") || "Procedimento não informado"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <p className="font-medium tabular-nums">
                      {formatDateTime(a.starts_at)}
                    </p>
                    {a.reminder_sent_at && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        lembrete enviado
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Nenhum agendamento futuro. Quando a agenda estiver conectada, eles aparecem aqui." />
          )}
        </PanelCard>
      </div>
    </div>
  );
}

const pct = (part: number, total: number) =>
  total ? `${Math.round((part / total) * 100)}%` : "-";

/** Do primeiro contato ao agendamento, para quem chamou a clínica pela primeira vez no período. */
function FunnelSection({ funnel }: { funnel: FunnelStats }) {
  const stages = funnel.by_stage.filter((s) => s.kind !== "perdido");
  const top = Math.max(1, ...stages.map((s) => s.reached));
  const hours = funnel.avg_hours_to_book;
  const lostTotal = funnel.lost_reasons.reduce((n, r) => n + r.total, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={Users}
          label="Contatos novos"
          value={num(funnel.new_contacts)}
          hint="chamaram pela primeira vez"
        />
        <Tile
          icon={CalendarCheck}
          label="Agendaram"
          value={pct(funnel.won, funnel.new_contacts)}
          hint={`${num(funnel.won)} de ${num(funnel.new_contacts)}${
            hours !== null && funnel.won
              ? ` · em ${hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} dias`}, em média`
              : ""
          }`}
        />
        <Tile
          icon={UserX}
          label="Perdidos"
          value={pct(funnel.lost, funnel.new_contacts)}
          hint="perda marcada ou 30 dias sem falar"
        />
        <Tile
          icon={CalendarSync}
          label="Retomadas"
          value={num(funnel.follow_ups.sent)}
          hint={`${num(funnel.follow_ups.responded)} responderam · ${num(funnel.follow_ups.booked)} agendaram`}
          href="/painel/retomadas"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PanelCard
          title="Funil"
          description="Dos contatos novos do período, quantos chegaram a cada etapa."
        >
          {funnel.new_contacts ? (
            <ul className="space-y-3">
              {stages.map((s) => (
                <li key={s.stage}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className={cn(
                          "size-2.5 shrink-0 rounded-full",
                          STAGE_COLOR_CLASS[s.color] ?? "bg-primary",
                        )}
                      />
                      {s.stage}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {num(s.reached)}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {pct(s.reached, funnel.new_contacts)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-2 rounded-full",
                        STAGE_COLOR_CLASS[s.color] ?? "bg-primary",
                      )}
                      style={{ width: `${(s.reached / top) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Nenhum contato novo neste período." />
          )}
          <p className="mt-5 text-xs text-muted-foreground">
            <Link
              href="/painel/funil"
              className="text-primary underline-offset-4 hover:underline"
            >
              Abrir o funil
            </Link>{" "}
            ·{" "}
            <Link
              href="/painel/oportunidades"
              className="text-primary underline-offset-4 hover:underline"
            >
              Contatos a fazer
            </Link>
          </p>
        </PanelCard>

        <PanelCard
          title="Motivos que viram agendamento"
          description="Conversas encerradas no período, pelo motivo, e quantas viraram agendamento em até 30 dias."
        >
          {funnel.by_reason.length ? (
            <ul className="divide-y text-sm">
              {funnel.by_reason.map((r) => (
                <li
                  key={r.reason}
                  className="flex items-baseline justify-between gap-3 py-2 first:pt-0"
                >
                  <span className="truncate">{r.reason}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-medium">
                      {pct(r.booked, r.total)}
                    </span>
                    <span className="ml-1.5 text-muted-foreground">
                      {num(r.booked)} de {num(r.total)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Nenhuma conversa encerrada neste período." />
          )}
          {funnel.lost_reasons.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-sm font-medium">Por que perderam</p>
              <ul className="space-y-1.5 text-sm">
                {funnel.lost_reasons.map((r) => (
                  <li
                    key={r.reason}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="truncate">{r.reason}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {num(r.total)} · {pct(r.total, lostTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PanelCard>
      </div>
    </>
  );
}

function PeriodBar({
  period,
  params,
  exportHref,
}: {
  period: ReturnType<typeof parsePeriod>;
  params: Params;
  exportHref: string;
}) {
  const custom = period.preset === null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1 rounded-xl border bg-card p-1">
        {PRESETS.map((days) => (
          <Link
            key={days}
            href={`/painel/relatorios?periodo=${days}`}
            aria-current={period.preset === days ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              period.preset === days
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {days} dias
          </Link>
        ))}
      </div>
      <form
        action="/painel/relatorios"
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border bg-card p-1 pl-3 text-sm",
          custom && "border-primary/40",
        )}
      >
        <label htmlFor="de" className="text-muted-foreground">
          De
        </label>
        <Input
          id="de"
          name="de"
          type="date"
          defaultValue={typeof params.de === "string" ? params.de : period.from}
          className="h-8 w-auto"
          required
        />
        <label htmlFor="ate" className="text-muted-foreground">
          até
        </label>
        <Input
          id="ate"
          name="ate"
          type="date"
          defaultValue={typeof params.ate === "string" ? params.ate : period.to}
          className="h-8 w-auto"
          required
        />
        <Button
          type="submit"
          size="sm"
          variant={custom ? "default" : "outline"}
        >
          Ver
        </Button>
      </form>
      <Button asChild variant="outline" className="ml-auto">
        <a href={exportHref} download>
          <Download />
          Exportar CSV
        </a>
      </Button>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  href,
  highlight = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  href?: string;
  highlight?: boolean;
}) {
  const body = (
    <>
      <Icon
        className={cn("size-5", highlight ? "text-amber-500" : "text-primary")}
      />
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-sm font-medium">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xs",
          highlight
            ? "text-amber-700 dark:text-amber-300"
            : "text-muted-foreground",
        )}
      >
        {hint}
      </p>
    </>
  );
  const className = cn(
    "rounded-2xl border bg-card p-4 shadow-xs",
    highlight && "border-amber-500/40 bg-amber-500/5",
    href && "transition-all hover:-translate-y-0.5 hover:shadow-md",
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
