import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, CircleDashed, Rocket } from "lucide-react";

import { SyncCronUrlButton } from "@/components/admin/sync-cron-url";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getAdminContext } from "@/lib/admin/context";
import { aiConfigured, aiModel, aiProviderLabel } from "@/lib/ai/provider";
import { formatDateTime } from "@/lib/format";
import { companyInfoComplete } from "@/lib/site";
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
      label: `IA (${aiProviderLabel()}, ${aiModel() || "sem modelo"})`,
      state: aiConfigured() ? "ok" : "todo",
      hint: "AI_PROVIDER escolhe a IA (padrão gemini, com GEMINI_API_KEY). Para groq, deepseek, openrouter ou openai: AI_API_KEY e, se preciso, AI_MODEL.",
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

  // Situação conferida à mão com a equipe (atualize aqui quando algo mudar). A política de
  // privacidade é a única conferida pelo código: depende de site.company estar preenchido.
  const manual: Check[] = [
    {
      label: "SMTP próprio no Supabase",
      state: "ok",
      hint: "Resend configurado em Authentication → Emails → SMTP Settings (22/10/2026).",
    },
    {
      label: "Modelos de e-mail do Supabase em português",
      state: "ok",
      hint: "Confirmar cadastro, redefinir senha e trocar e-mail traduzidos, com links token_hash (22/10/2026).",
    },
    {
      label: "Site URL e Redirect URLs do Supabase",
      state: "ok",
      hint: "Apontando para https://lumenzia.com.br (22/10/2026).",
    },
    {
      label: "Webhook do Mercado Pago no domínio próprio",
      state: "warn",
      hint: "Apontando para lumenzia.com.br/api/webhooks/mercadopago (22/10/2026). Ainda falta uma cobrança real aprovada para confirmar que a assinatura ativa sozinha.",
    },
    {
      label: "App da Meta publicado, empresa verificada e permissões aprovadas",
      state: "todo",
      hint: "App criado em 23/10/2026 e em modo de desenvolvimento (webhook do WhatsApp em configuração). Verificação da empresa, App Review e publicação esperam o CNPJ.",
    },
    {
      label: "Domínio próprio no Cadastro Incorporado",
      state: "todo",
      hint: "Junto da configuração do Cadastro Incorporado: “Allowed domains for the JavaScript SDK” com lumenzia.com.br.",
    },
    {
      label: "Política de privacidade completa",
      state: companyInfoComplete ? "ok" : "warn",
      hint: companyInfoComplete
        ? "Razão social, CNPJ e endereço preenchidos. Falta só a revisão jurídica, se ainda não foi feita."
        : "E-mail de privacidade e página de exclusão de dados prontos. Faltam razão social, CNPJ e endereço (site.company em src/lib/site.ts), que dependem do CNPJ.",
    },
    {
      label: "Supabase no plano pago e backups",
      state: "todo",
      hint: "Decidido ficar no gratuito até a primeira clínica pagante. O gratuito pausa após 7 dias sem uso e não tem backup diário.",
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
        description="Itens que o site não consegue verificar sozinho, com a situação da última conferência. O passo a passo completo está em docs/LANCAMENTO.md."
        className="lg:col-span-2"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CheckList checks={manual.slice(0, Math.ceil(manual.length / 2))} />
          <CheckList checks={manual.slice(Math.ceil(manual.length / 2))} />
        </div>
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
