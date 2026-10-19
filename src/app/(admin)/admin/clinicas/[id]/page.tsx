import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { z } from "zod";

import { AuditList } from "@/components/admin/audit-list";
import {
  AdminAssistantToggle,
  AdminDisconnectButton,
  AgendaForm,
  ClinicTabs,
  TemplatesForm,
  WhatsappTechForm,
} from "@/components/admin/clinic-forms";
import { PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getAdminContext } from "@/lib/admin/context";
import {
  pickActiveSubscription,
  type SubscriptionRow,
} from "@/lib/billing/subscription";
import { formatDateTime, formatPhone, formatPrice } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Clínica" };

export default function ClinicPage({
  params,
}: PageProps<"/admin/clinicas/[id]">) {
  return (
    <>
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Clientes
      </Link>
      <Suspense fallback={<PanelSkeleton />}>
        <Clinic params={params} />
      </Suspense>
    </>
  );
}

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86400_000).toISOString();

const ROLE = { owner: "Dona", staff: "Equipe" } as const;
const STATUS = {
  pending: "Aguardando pagamento",
  authorized: "Ativa",
  paused: "Pausada",
  cancelled: "Renovação cancelada",
} as const;

async function Clinic({
  params,
}: Pick<PageProps<"/admin/clinicas/[id]">, "params">) {
  const [{ supabase }, { id }] = await Promise.all([getAdminContext(), params]);
  if (!z.uuid().safeParse(id).success) notFound();

  const [
    clinicRes,
    integrationRes,
    membersRes,
    subsRes,
    auditRes,
    secretsRes,
    convRes,
  ] = await Promise.all([
    supabase.from("clinics").select("*").eq("id", id).maybeSingle(),
    supabase.from("integrations").select("*").eq("clinic_id", id).maybeSingle(),
    supabase.rpc("admin_clinic_members", { p_clinic_id: id }),
    supabase
      .from("subscriptions")
      .select("*, plans(code, name, message_quota, price_cents)")
      .eq("clinic_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("admin_audit_log")
      .select("id, action, details, created_at, profiles(full_name)")
      .eq("clinic_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    // Só diz se cada segredo existe; o valor nunca sai do Vault.
    createAdminClient().rpc("clinic_secret_status", { p_clinic_id: id }),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", id)
      .gte("started_at", daysAgo(30)),
  ]);
  for (const r of [
    clinicRes,
    integrationRes,
    membersRes,
    subsRes,
    auditRes,
    secretsRes,
  ]) {
    if (r.error) throw new Error(r.error.message);
  }
  const clinic = clinicRes.data;
  if (!clinic) notFound();
  const integration = integrationRes.data;
  const secrets = (secretsRes.data ?? {}) as Record<string, boolean>;
  const subs = (subsRes.data ?? []) as (Omit<SubscriptionRow, "plans"> & {
    plans:
      (NonNullable<SubscriptionRow["plans"]> & { price_cents: number }) | null;
  })[];
  const active = pickActiveSubscription(subs as SubscriptionRow[]);
  const current = active ? subs.find((s) => s.id === active.id)! : subs[0];
  const connected = Boolean(clinic.whatsapp_phone_number_id);

  const overview = (
    <div className="grid gap-6 lg:grid-cols-2">
      <PanelCard title="Assinatura">
        {current ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Item label="Plano">
              {current.plans?.name ?? "—"}
              {current.plans?.price_cents != null &&
                ` · ${formatPrice(current.plans.price_cents)}/mês`}
            </Item>
            <Item label="Situação">
              {active ? STATUS[current.status] : "Vencida"}
            </Item>
            <Item label="Período pago até">
              {current.current_period_end
                ? formatDateTime(current.current_period_end)
                : "—"}
            </Item>
            <Item label="Tolerância até">
              {current.grace_until ? formatDateTime(current.grace_until) : "—"}
            </Item>
            <Item label="Respostas da IA no ciclo">
              {current.messages_used_this_period} /{" "}
              {current.plans?.message_quota ?? "—"}
            </Item>
            <Item label="Conversas (30 dias)">{convRes.count ?? 0}</Item>
            <Item label="Mercado Pago">
              <span className="font-mono text-xs break-all">
                {current.mp_preapproval_id ?? "—"}
              </span>
            </Item>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma assinatura.</p>
        )}
      </PanelCard>

      <PanelCard title="WhatsApp e assistente">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm">
            <p className="font-medium">
              {connected
                ? (clinic.whatsapp_display_phone ??
                  clinic.whatsapp_phone_number_id)
                : "Não conectado"}
            </p>
            <p className="text-muted-foreground">
              {connected
                ? [
                    clinic.whatsapp_verified_name,
                    clinic.whatsapp_connected_at &&
                      `conectado em ${formatDateTime(clinic.whatsapp_connected_at)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Conectado"
                : "A clínica conecta pelo menu WhatsApp do painel."}
            </p>
          </div>
          <AdminAssistantToggle
            clinicId={clinic.id}
            active={clinic.is_active}
            connected={connected}
          />
        </div>
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          <li>Token no Vault: {secrets.whatsapp_token ? "sim" : "não"}</li>
          <li>
            PIN de duas etapas: {secrets.whatsapp_pin ? "guardado" : "não"}
          </li>
          <li>
            Agenda:{" "}
            {integration?.enabled
              ? `ligada (${integration.provider_name || integration.mode})`
              : "desligada"}
          </li>
        </ul>
        {connected && (
          <div className="mt-4">
            <AdminDisconnectButton clinicId={clinic.id} />
          </div>
        )}
      </PanelCard>

      <PanelCard title="Pessoas" className="lg:col-span-2">
        <ul className="divide-y text-sm">
          {membersRes.data!.map((m) => (
            <li
              key={m.user_id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3"
            >
              <span className="font-medium">{m.full_name || "Sem nome"}</span>
              <span className="text-muted-foreground">{m.email}</span>
              {m.phone && (
                <span className="text-muted-foreground">
                  {formatPhone(m.phone)}
                </span>
              )}
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">
                {ROLE[m.role]}
                {m.is_admin && " · equipe LumenzIA"}
              </span>
              <span className="w-full text-xs text-muted-foreground">
                {m.last_sign_in_at
                  ? `Último acesso ${formatDateTime(m.last_sign_in_at)}`
                  : "Nunca entrou"}
              </span>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );

  return (
    <>
      <div className="mb-8 flex gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-glow/15 text-primary ring-1 ring-primary/15">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {clinic.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cliente desde {formatDateTime(clinic.created_at)} · assistente “
            {clinic.assistant_name}”
          </p>
        </div>
      </div>
      <ClinicTabs
        overview={overview}
        whatsapp={
          <PanelCard>
            <WhatsappTechForm
              clinicId={clinic.id}
              tokenStored={Boolean(secrets.whatsapp_token)}
              initial={{
                phoneNumberId: clinic.whatsapp_phone_number_id ?? "",
                wabaId: clinic.whatsapp_waba_id ?? "",
                displayPhone: clinic.whatsapp_display_phone ?? "",
                staffPhone: clinic.staff_phone_number ?? "",
                token: "",
                removeToken: false,
              }}
            />
          </PanelCard>
        }
        templates={
          <PanelCard>
            <TemplatesForm
              clinicId={clinic.id}
              initial={{
                reminderTemplate: clinic.reminder_template_name ?? "",
                staffAlertTemplate: clinic.staff_alert_template_name ?? "",
                language: clinic.template_language,
              }}
            />
          </PanelCard>
        }
        agenda={
          <PanelCard>
            <AgendaForm
              clinicId={clinic.id}
              apiKeyStored={Boolean(secrets.agenda_api_key)}
              initial={{
                providerName: integration?.provider_name ?? "",
                mode: integration?.mode ?? "webhook",
                webhookUrl: integration?.webhook_url ?? "",
                actionsConfig: integration?.actions_config
                  ? JSON.stringify(integration.actions_config, null, 2)
                  : "",
                enabled: integration?.enabled ?? false,
                apiKey: "",
                removeApiKey: false,
              }}
            />
          </PanelCard>
        }
        audit={
          <PanelCard>
            <AuditList
              entries={auditRes.data!.map((e) => ({
                id: e.id,
                action: e.action,
                details: e.details,
                createdAt: e.created_at,
                who: e.profiles?.full_name ?? null,
              }))}
            />
          </PanelCard>
        }
      />
    </>
  );
}

function Item({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
