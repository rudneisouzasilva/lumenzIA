import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  FlaskConical,
  Images,
  LayoutDashboard,
  ListChecks,
  MessageCircleQuestion,
  Rocket,
  Smartphone,
  Stethoscope,
  Users,
} from "lucide-react";

import { AssistantToggle } from "@/components/painel/assistant-toggle";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { Button } from "@/components/ui/button";
import { getPanelContext } from "@/lib/painel/context";
import { getClinicSettings } from "@/lib/painel/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Visão geral" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title="Visão geral"
        description="O que já está pronto na sua assistente e o que falta configurar."
      >
        <Button asChild variant="outline">
          <Link href="/painel/testar">
            <FlaskConical />
            Testar assistente
          </Link>
        </Button>
      </PageHeader>
      <Suspense fallback={<PanelSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const { supabase, clinic } = await getPanelContext();
  const count = (
    table: "faqs" | "images" | "services" | "professionals" | "ai_questions",
  ) =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .then((r) => r.count ?? 0);

  const [settings, faqs, images, services, professionals, questions] =
    await Promise.all([
      getClinicSettings(),
      count("faqs"),
      count("images"),
      count("services"),
      count("professionals"),
      count("ai_questions"),
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
  const connected = Boolean(settings.whatsapp_phone_number_id);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <PanelCard>
          <div className="flex items-center gap-5">
            <ProgressRing percent={percent} />
            <div>
              <p className="font-display text-lg font-semibold">
                {percent === 100
                  ? "Sua assistente está pronta!"
                  : "Configure sua assistente"}
              </p>
              <p className="text-sm text-muted-foreground">
                {done} de {steps.length} passos concluídos
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
          {done < 3 && (
            <Button asChild className="mt-5 w-full sm:w-auto">
              <Link href="/painel/comecar">
                <Rocket />
                Fazer o passo a passo guiado
              </Link>
            </Button>
          )}
        </PanelCard>

        <PanelCard>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-semibold">
                <Smartphone className="size-5 text-primary" />
                WhatsApp
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {connected
                  ? settings.is_active
                    ? "A assistente está respondendo os pacientes."
                    : "A assistente está pausada."
                  : "A equipe LumenzIA conecta o número da clínica e avisa você."}
              </p>
            </div>
            <AssistantToggle
              active={settings.is_active}
              disabled={!connected}
            />
          </div>
          <div
            className={cn(
              "mt-5 flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              connected
                ? settings.is_active
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
                : "bg-glow/15 text-amber-700 dark:text-glow",
            )}
          >
            <span className="relative flex size-2.5">
              {connected && settings.is_active && (
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
              )}
              <span
                className={cn(
                  "relative size-2.5 rounded-full",
                  connected
                    ? settings.is_active
                      ? "bg-emerald-500"
                      : "bg-muted-foreground"
                    : "bg-glow",
                )}
              />
            </span>
            {connected
              ? settings.is_active
                ? "Online"
                : "Pausada"
              : "Aguardando conexão do número"}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Enquanto isso, deixe tudo configurado: quando o número for
            conectado, é só ligar.
          </p>
        </PanelCard>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          href="/painel/faqs"
          icon={MessageCircleQuestion}
          label="Perguntas frequentes"
          value={faqs}
        />
        <Stat href="/painel/fotos" icon={Images} label="Fotos" value={images} />
        <Stat
          href="/painel/procedimentos"
          icon={Stethoscope}
          label="Procedimentos"
          value={services}
        />
        <Stat
          href="/painel/profissionais"
          icon={Users}
          label="Profissionais"
          value={professionals}
        />
        <Stat
          href="/painel/perguntas"
          icon={ListChecks}
          label="Perguntas da IA"
          value={questions}
        />
      </div>
    </div>
  );
}

function Stat({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <Icon className="size-5 text-primary" />
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
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
