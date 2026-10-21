import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, CircleDashed, Rocket } from "lucide-react";

import { SyncCronUrlButton } from "@/components/admin/sync-cron-url";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getAdminContext } from "@/lib/admin/context";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lançamento" };

export default function LaunchPage() {
  return (
    <>
      <PageHeader
        icon={Rocket}
        title="Lançamento"
        description="O que já está pronto para receber clientes de verdade e o que falta. As conferências automáticas rodam a cada visita."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Checks />
      </Suspense>
    </>
  );
}

type State = "ok" | "warn" | "todo";
type Check = { label: string; state: State; hint: string };

type LaunchStatus = {
  app_url: string | null;
  cron_secret_in_vault: boolean;
  cron_secret_matches: boolean;
  jobs: {
    name: string;
    active: boolean;
    last_status: string | null;
    last_run: string | null;
    failures_24h: number;
  }[];
  http_ok_24h: number;
  http_failed_24h: number;
  http_last_error: string | null;
};

const env = (name: string) => Boolean(process.env[name]?.trim());

/** Configuração pública do Supabase Auth: diz se "Confirm email" está ligado. */
async function authSettings() {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabasePublishableKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { mailer_autoconfirm?: boolean };
  } catch {
    return null;
  }
}

async function Checks() {
  await getAdminContext();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";
  const [{ data, error }, auth] = await Promise.all([
    createAdminClient().rpc("launch_status", {
      p_cron_secret: process.env.CRON_SECRET?.trim() ?? "",
    }),
    authSettings(),
  ]);
  const status = error ? null : (data as LaunchStatus);

  const ownDomain =
    appUrl.startsWith("https://") && !appUrl.endsWith(".vercel.app");
  const site: Check[] = [
    {
      label: "Domínio próprio",
      state: ownDomain ? "ok" : appUrl ? "warn" : "todo",
      hint: ownDomain
        ? appUrl
        : "Ligue o domínio na Vercel e coloque-o em NEXT_PUBLIC_APP_URL (com https://).",
    },
    {
      label: "Confirmação de e-mail no cadastro",
      state: auth == null ? "warn" : auth.mailer_autoconfirm ? "todo" : "ok",
      hint:
        auth == null
          ? "Não deu para ler a configuração do Supabase Auth agora."
          : auth.mailer_autoconfirm
            ? "Desligada. Configure o SMTP próprio e ligue “Confirm email” no Supabase."
            : "Ligada. Confira se o SMTP próprio está configurado (o padrão do Supabase envia poucos e-mails por hora).",
    },
    {
      label: "Cobrança real (Mercado Pago)",
      state:
        process.env.PAYMENT_MODE === "mercadopago" &&
        env("MP_ACCESS_TOKEN") &&
        env("MP_WEBHOOK_SECRET")
          ? "ok"
          : "todo",
      hint: "PAYMENT_MODE=mercadopago, MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET.",
    },
    {
      label: "E-mails de avisos e lembretes (Resend)",
      state: env("RESEND_API_KEY") && env("NOTIFY_EMAIL_FROM") ? "ok" : "todo",
      hint: "RESEND_API_KEY e NOTIFY_EMAIL_FROM (endereço do domínio verificado no Resend).",
    },
    {
      label: "IA (Gemini)",
      state: env("GEMINI_API_KEY") ? "ok" : "todo",
      hint: "GEMINI_API_KEY.",
    },
  ];

  const whatsapp: Check[] = [
    {
      label: "Webhook do WhatsApp",
      state:
        env("WHATSAPP_VERIFY_TOKEN") && env("META_APP_SECRET") ? "ok" : "todo",
      hint: "WHATSAPP_VERIFY_TOKEN e META_APP_SECRET (App Secret do app na Meta).",
    },
    {
      label: "Botão “Conectar WhatsApp”",
      state:
        env("META_APP_ID") && env("META_EMBEDDED_SIGNUP_CONFIG_ID")
          ? "ok"
          : "todo",
      hint: "META_APP_ID e META_EMBEDDED_SIGNUP_CONFIG_ID (configuração do Cadastro Incorporado).",
    },
  ];

  const jobsOk =
    status?.jobs.length &&
    status.jobs.every((j) => j.active && j.last_status !== "failed");
  const jobs: Check[] = status
    ? [
        {
          label: "Senha dos jobs (CRON_SECRET)",
          state: status.cron_secret_matches ? "ok" : "todo",
          hint: status.cron_secret_matches
            ? "A da Vercel bate com a do Vault."
            : status.cron_secret_in_vault
              ? "CRON_SECRET na Vercel não bate com a do Vault (lumenzia_cron_secret)."
              : "A senha não está no Vault: rode a migração 0007.",
        },
        {
          label: "Endereço que os jobs chamam",
          state: !status.app_url
            ? "todo"
            : appUrl && status.app_url !== appUrl
              ? "warn"
              : "ok",
          hint:
            status.app_url && appUrl && status.app_url !== appUrl
              ? `Os jobs chamam ${status.app_url}, mas o site está em ${appUrl}.`
              : (status.app_url ?? "Não configurado."),
        },
        {
          label: "Jobs agendados",
          state: jobsOk ? "ok" : "warn",
          hint: `${status.jobs.length} jobs; respostas do site nas últimas 24 h: ${status.http_ok_24h} ok, ${status.http_failed_24h} com erro${status.http_last_error ? ` (último: ${status.http_last_error})` : ""}.`,
        },
      ]
    : [
        {
          label: "Jobs",
          state: "warn",
          hint: "Não deu para ler o estado dos jobs: confira se a migração 0008 foi aplicada.",
        },
      ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <PanelCard title="Site, e-mail e cobrança">
        <CheckList checks={site} />
      </PanelCard>
      <PanelCard title="WhatsApp (app da LumenzIA na Meta)">
        <CheckList checks={whatsapp} />
      </PanelCard>
      <PanelCard title="Jobs automáticos (pg_cron)" className="lg:col-span-2">
        <CheckList checks={jobs} />
        {status &&
          appUrl.startsWith("https://") &&
          status.app_url !== appUrl && (
            <div className="mt-4">
              <SyncCronUrlButton url={appUrl} />
            </div>
          )}
        {status && status.jobs.length > 0 && (
          <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
            {status.jobs.map((j) => (
              <li
                key={j.name}
                className="flex justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2"
              >
                <span className="font-mono text-xs">{j.name}</span>
                <span className="text-xs text-muted-foreground">
                  {j.last_run
                    ? `${j.last_status === "succeeded" ? "ok" : (j.last_status ?? "—")} · ${formatDateTime(j.last_run)}`
                    : "ainda não rodou"}
                  {j.failures_24h > 0 && ` · ${j.failures_24h} falhas`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
      <PanelCard
        title="Conferir à mão"
        description="Itens que o site não consegue verificar sozinho. O passo a passo completo está em docs/LANCAMENTO.md."
        className="lg:col-span-2"
      >
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            "SMTP próprio no Supabase (Authentication → Emails → SMTP Settings)",
            "Modelos de e-mail do Supabase traduzidos para português",
            "Site URL e Redirect URLs do Supabase com o domínio próprio",
            "Webhook do Mercado Pago apontando para o domínio próprio",
            "App da Meta publicado, empresa verificada e permissões aprovadas",
            "Domínio próprio na lista de domínios do Cadastro Incorporado",
            "Política de privacidade sem os textos [ENTRE COLCHETES]",
            "Supabase no plano pago (o gratuito pausa sem uso) e backups",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}

const ICONS = {
  ok: { icon: CheckCircle2, className: "text-emerald-500" },
  warn: { icon: CircleAlert, className: "text-amber-500" },
  todo: { icon: CircleDashed, className: "text-muted-foreground" },
};

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-4">
      {checks.map((c) => {
        const { icon: Icon, className } = ICONS[c.state];
        return (
          <li key={c.label} className="flex gap-3">
            <Icon className={cn("mt-0.5 size-5 shrink-0", className)} />
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-sm break-words text-muted-foreground">
                {c.hint}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
