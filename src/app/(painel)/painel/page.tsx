import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  AtSign,
  BellRing,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  FlaskConical,
  Headset,
  LayoutDashboard,
  Lock,
  MessagesSquare,
  Rocket,
  Smartphone,
} from "lucide-react";

import { AssistantToggle } from "@/components/painel/assistant-toggle";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { Button } from "@/components/ui/button";
import { NAV_SECTIONS } from "@/components/painel/nav";
import { areaForPath, canAccess, type Area } from "@/lib/painel/areas";
import { getPanelContext } from "@/lib/painel/context";
import { getClinicSettings } from "@/lib/painel/data";
import {
  contactHandle,
  formatDate,
  formatRelative,
  formatTime,
  isoDateInBrasilia,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Início" };

export default function OverviewPage({ searchParams }: PageProps<"/painel">) {
  return (
    <>
      <Suspense fallback={null}>
        <DeniedNotice searchParams={searchParams} />
      </Suspense>
      <PageHeader
        icon={LayoutDashboard}
        title="Início"
        description="O dia da clínica: agenda, conversas que precisam da equipe e lembretes enviados."
      >
        <Suspense fallback={null}>
          <TestButton />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<PanelSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function TestButton() {
  const { clinic } = await getPanelContext();
  if (!canAccess(clinic.access, "testar")) return null;
  return (
    <Button asChild variant="outline">
      <Link href="/painel/testar">
        <FlaskConical />
        Testar assistente
      </Link>
    </Button>
  );
}

/** Aviso de quem tentou abrir uma tela que a dona não liberou (o proxy manda para cá). */
async function DeniedNotice({
  searchParams,
}: Pick<PageProps<"/painel">, "searchParams">) {
  const { acesso } = await searchParams;
  if (acesso !== "negado") return null;
  return (
    <p className="mb-6 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <Lock className="size-4 shrink-0" />
      Essa parte do painel não foi liberada para você. Peça à responsável pela
      clínica, se precisar.
    </p>
  );
}

async function Overview() {
  const { supabase, clinic } = await getPanelContext();
  if (!clinic.access.owner && clinic.access.areas !== null) {
    return <StaffHome areas={clinic.access.areas} />;
  }
  const count = (table: "faqs" | "images" | "services") =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .then((r) => r.count ?? 0);

  // "Hoje" é o dia no horário de Brasília (-03:00, sem horário de verão).
  const today = isoDateInBrasilia();
  const dayStart = `${today}T00:00:00-03:00`;
  const dayEnd = `${today}T23:59:59.999-03:00`;

  const [
    settings,
    faqs,
    images,
    services,
    { data: agenda },
    remindersToday,
    bookedToday,
    conversationsToday,
    followUpsToday,
    { data: pending, count: pendingCount },
    { data: integration },
    { data: googleAccounts },
    { data: instagram },
  ] = await Promise.all([
    getClinicSettings(),
    count("faqs"),
    count("images"),
    count("services"),
    supabase
      .from("appointments")
      .select(
        "id, patient_name, procedure_name, professional_name, starts_at, status, reminder_sent_at",
      )
      .eq("clinic_id", clinic.id)
      .neq("status", "cancelado")
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd)
      .order("starts_at")
      .limit(50)
      .throwOnError(),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .gte("reminder_sent_at", dayStart)
      .lte("reminder_sent_at", dayEnd)
      .then((r) => r.count ?? 0),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .neq("status", "cancelado")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .then((r) => r.count ?? 0),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .eq("imported", false)
      .gte("last_message_at", dayStart)
      .then((r) => r.count ?? 0),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .eq("status", "enviado")
      .gte("sent_at", dayStart)
      .lte("sent_at", dayEnd)
      .then((r) => r.count ?? 0),
    supabase
      .from("conversations")
      .select(
        "id, contact_phone, needs_human_at, last_message_at, contacts(name, whatsapp_name, instagram_username)",
        { count: "exact" },
      )
      .eq("clinic_id", clinic.id)
      .eq("status", "aberta")
      .eq("attendance_state", "pendente")
      .order("needs_human_at", { ascending: true, nullsFirst: false })
      .limit(5)
      .throwOnError(),
    supabase
      .from("integrations")
      .select("mode, enabled, provider_name")
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
    supabase
      .from("google_accounts")
      .select("status")
      .eq("clinic_id", clinic.id),
    supabase
      .from("instagram_accounts")
      .select("username, status")
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
  ]);

  const steps = [
    {
      label: "Dê um nome e um tom para a assistente",
      href: "/painel/assistente",
      done: settings.assistant_name.trim() !== "Assistente",
    },
    {
      label: "Conte sobre a clínica: endereço, valores, pagamento",
      href: "/painel/assistente",
      done: settings.business_info.trim().length >= 50,
    },
    {
      label: "Defina os dias e horários de atendimento",
      href: "/painel/horarios",
      done: Boolean(settings.work_hours_start && settings.work_hours_end),
    },
    {
      label: "Cadastre pelo menos 3 perguntas frequentes",
      href: "/painel/faqs",
      done: faqs >= 3,
    },
    {
      label: "Liste os procedimentos que podem ser agendados",
      href: "/painel/procedimentos",
      done: services >= 1,
    },
    {
      label: "Adicione fotos para a assistente enviar",
      href: "/painel/fotos",
      done: images >= 1,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const percent = Math.round((done / steps.length) * 100);
  // O passo a passo some quando tudo está feito e volta se algo for desfeito
  // (é calculado a cada visita, não fica gravado).
  const setupComplete = done === steps.length;

  const connected = Boolean(settings.whatsapp_phone_number_id);
  const agendaName =
    integration?.mode === "google"
      ? "Google Agenda"
      : integration?.mode === "clinica_experts"
        ? "Clínica Experts"
        : integration?.provider_name || "Sistema da clínica";
  const googleDown =
    integration?.mode === "google" &&
    (googleAccounts ?? []).some((a) => a.status !== "ativo");
  const appointments = agenda ?? [];

  const connections = (
    <ConnectionsCard
      whatsapp={{ connected, active: settings.is_active }}
      agenda={
        integration?.enabled
          ? googleDown
            ? { state: "warn", text: `${agendaName}: conecte de novo` }
            : { state: "ok", text: agendaName }
          : { state: "off", text: "Não conectada" }
      }
      instagram={
        instagram
          ? instagram.status === "ativo"
            ? { state: "ok", text: `@${instagram.username}` }
            : { state: "warn", text: "Conecte de novo" }
          : { state: "off", text: "Não conectado" }
      }
    />
  );

  return (
    <div className="space-y-6">
      {!setupComplete && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <SetupCard steps={steps} done={done} percent={percent} />
          {connections}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          href="/painel/relatorios"
          icon={CalendarCheck}
          label="Agendamentos hoje"
          value={appointments.length}
          hint={
            bookedToday
              ? `${bookedToday} ${bookedToday === 1 ? "marcado" : "marcados"} hoje`
              : "nenhum marcado hoje"
          }
        />
        <Stat
          href="/painel/atendimento"
          icon={Headset}
          label="Precisam da equipe"
          value={pendingCount ?? 0}
          hint={pendingCount ? "aguardando alguém" : "tudo em dia"}
          alert={Boolean(pendingCount)}
        />
        <Stat
          href="/painel/atendimento"
          icon={MessagesSquare}
          label="Conversas hoje"
          value={conversationsToday}
          hint="com mensagens hoje"
        />
        <Stat
          href="/painel/avisos"
          icon={BellRing}
          label="Lembretes enviados"
          value={remindersToday}
          hint={
            followUpsToday
              ? `+ ${followUpsToday} ${followUpsToday === 1 ? "retomada" : "retomadas"}`
              : "hoje"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <PanelCard title="Agenda de hoje" description={formatDate(new Date())}>
          {appointments.length ? (
            <ul className="divide-y">
              {appointments.map((a) => {
                const past = isPast(a.starts_at);
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "flex items-center gap-4 py-3 text-sm",
                      past && "opacity-60",
                    )}
                  >
                    <span className="w-12 shrink-0 font-display font-semibold tabular-nums">
                      {formatTime(a.starts_at)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.patient_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[a.procedure_name, a.professional_name]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {a.reminder_sent_at ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <BellRing className="size-3.5" />
                        Lembrado
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum agendamento para hoje.
            </p>
          )}
        </PanelCard>

        <div className="space-y-6">
          <PanelCard
            title="Precisam de você"
            description="Conversas em que a assistente chamou a equipe."
          >
            {pending?.length ? (
              <ul className="space-y-1">
                {pending.map((c) => {
                  const contact = c.contacts;
                  const name =
                    contact?.name ||
                    contact?.whatsapp_name ||
                    contactHandle({
                      phone: c.contact_phone || null,
                      instagram_username: contact?.instagram_username,
                    });
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/painel/atendimento?c=${c.id}`}
                        className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/50"
                      >
                        <span className="size-2 shrink-0 rounded-full bg-amber-500" />
                        <span className="flex-1 truncate font-medium">
                          {name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(
                            c.needs_human_at ?? c.last_message_at,
                          )}
                        </span>
                        <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-500" />
                Ninguém esperando a equipe agora.
              </p>
            )}
            {(pendingCount ?? 0) > (pending?.length ?? 0) && (
              <Link
                href="/painel/atendimento"
                className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Ver todas as {pendingCount} conversas
              </Link>
            )}
          </PanelCard>
          {setupComplete && connections}
        </div>
      </div>
    </div>
  );
}

/** Horário que já passou (a lista é montada a cada visita). */
const isPast = (iso: string) => Date.parse(iso) < Date.now();

type Step = { label: string; href: string; done: boolean };

function SetupCard({
  steps,
  done,
  percent,
}: {
  steps: Step[];
  done: number;
  percent: number;
}) {
  return (
    <PanelCard>
      <div className="flex items-center gap-5">
        <ProgressRing percent={percent} />
        <div>
          <p className="font-display text-lg font-semibold">
            Configure sua assistente
          </p>
          <p className="text-sm text-muted-foreground">
            {done} de {steps.length} passos concluídos. Este quadro some quando
            tudo estiver pronto.
          </p>
        </div>
      </div>
      <ul className="mt-6 space-y-1">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/50"
            >
              {s.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground/50" />
              )}
              <span
                className={cn(
                  "flex-1",
                  s.done && "text-muted-foreground line-through",
                )}
              >
                {s.label}
              </span>
              <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
      {/* O passo a passo guiado não fica no menu: aparece aqui enquanto falta configurar. */}
      <Button
        asChild
        variant={done < 3 ? "default" : "outline"}
        className="mt-5 w-full sm:w-auto"
      >
        <Link href="/painel/comecar">
          <Rocket />
          Fazer o passo a passo guiado
        </Link>
      </Button>
    </PanelCard>
  );
}

type Connection = { state: "ok" | "warn" | "off"; text: string };

function ConnectionsCard({
  whatsapp,
  agenda,
  instagram,
}: {
  whatsapp: { connected: boolean; active: boolean };
  agenda: Connection;
  instagram: Connection;
}) {
  const { connected, active } = whatsapp;
  return (
    <PanelCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <Smartphone className="size-5 text-primary" />
            WhatsApp
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected
              ? active
                ? "A assistente está respondendo os pacientes."
                : "A assistente está pausada."
              : "Conecte o número da clínica para a assistente começar a responder."}
          </p>
        </div>
        <AssistantToggle active={active} disabled={!connected} />
      </div>
      <div
        className={cn(
          "mt-5 flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
          connected
            ? active
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
            : "bg-glow/15 text-amber-700 dark:text-glow",
        )}
      >
        <span className="relative flex size-2.5">
          {connected && active && (
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
          )}
          <span
            className={cn(
              "relative size-2.5 rounded-full",
              connected
                ? active
                  ? "bg-emerald-500"
                  : "bg-muted-foreground"
                : "bg-glow",
            )}
          />
        </span>
        {connected
          ? active
            ? "Online"
            : "Pausada"
          : "Aguardando conexão do número"}
      </div>
      {!connected && (
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link href="/painel/whatsapp">
            <Smartphone />
            Conectar WhatsApp
          </Link>
        </Button>
      )}
      <ul className="mt-5 space-y-1 border-t pt-4 text-sm">
        <ConnectionRow
          href="/painel/agenda"
          icon={CalendarDays}
          label="Agenda"
          status={agenda}
        />
        <ConnectionRow
          href="/painel/instagram"
          icon={AtSign}
          label="Instagram"
          status={instagram}
        />
      </ul>
    </PanelCard>
  );
}

function ConnectionRow({
  href,
  icon: Icon,
  label,
  status,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  status: Connection;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
      >
        <Icon className="size-4 text-muted-foreground" />
        <span className="flex-1">{label}</span>
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs",
            status.state === "ok" && "text-emerald-700 dark:text-emerald-400",
            status.state === "warn" && "text-amber-700 dark:text-amber-400",
            status.state === "off" && "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              status.state === "ok" && "bg-emerald-500",
              status.state === "warn" && "bg-amber-500",
              status.state === "off" && "bg-muted-foreground/40",
            )}
          />
          {status.text}
        </span>
      </Link>
    </li>
  );
}

function Stat({
  href,
  icon: Icon,
  label,
  value,
  hint,
  alert = false,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-2xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md",
        alert && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <Icon className={cn("size-5 text-primary", alert && "text-amber-600")} />
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          className="stroke-muted"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="url(#progress)"
          strokeDasharray={c}
          strokeDashoffset={c - (percent / 100) * c}
          className="transition-[stroke-dashoffset] duration-1000"
        />
        <defs>
          <linearGradient id="progress">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--glow)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

/** Início de quem é da equipe com acesso só a algumas telas: atalhos para elas. */
function StaffHome({ areas }: { areas: Area[] }) {
  const items = NAV_SECTIONS.flatMap((s) => s.items).filter((item) => {
    const area = areaForPath(item.href);
    return area !== null && areas.includes(area);
  });
  return (
    <PanelCard
      title="Suas telas"
      description="As partes do painel que a responsável pela clínica liberou para você."
    >
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 rounded-xl border p-4 text-sm transition-colors hover:bg-accent/50"
              >
                <item.icon className="size-5 text-primary" />
                <span className="flex-1 font-medium">{item.label}</span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma tela foi liberada ainda. Peça à responsável pela clínica.
        </p>
      )}
    </PanelCard>
  );
}
