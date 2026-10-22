import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import {
  AgendaSystems,
  ClinicaExpertsSettings,
} from "@/components/painel/agenda-systems";
import {
  GoogleAgendaSettings,
  type AccountItem,
} from "@/components/painel/google-agenda-settings";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import {
  clinicKey,
  listCeProfessionals,
  type CeProfessional,
} from "@/lib/clinica-experts/client";
import { googleCredentials, listCalendars } from "@/lib/google/client";
import { getPanelContext } from "@/lib/painel/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agenda" };

const NOTICES: Record<string, { ok: boolean; text: string }> = {
  conectado: {
    ok: true,
    text: "Conta do Google conectada. Agora escolha as agendas.",
  },
  cancelado: { ok: false, text: "A conexão com o Google foi cancelada." },
  "sem-permissao": {
    ok: false,
    text: "Faltou autorizar o acesso à agenda. Conecte de novo e deixe todas as permissões marcadas.",
  },
  indisponivel: {
    ok: false,
    text: "A conexão com o Google ainda não foi ativada na LumenzIA. Fale com o suporte.",
  },
  erro: {
    ok: false,
    text: "Não foi possível conectar a conta do Google. Tente de novo.",
  },
};

export default function AgendaPage({
  searchParams,
}: PageProps<"/painel/agenda">) {
  return (
    <>
      <PageHeader
        icon={CalendarDays}
        title="Agenda"
        description="Conecte o sistema onde fica a agenda da clínica para a assistente ver os horários livres e marcar sozinha."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Settings({
  searchParams,
}: Pick<PageProps<"/painel/agenda">, "searchParams">) {
  const [{ supabase, clinic }, params] = await Promise.all([
    getPanelContext(),
    searchParams,
  ]);
  const admin = createAdminClient();
  const [
    { data: integration },
    { data: professionals },
    { data: accounts },
    { data: ceAccount },
  ] = await Promise.all([
    admin
      .from("integrations")
      .select(
        "mode, enabled, provider_name, google_account_id, google_calendar_id, google_calendar_name, ce_professional_uuid, ce_professional_name",
      )
      .eq("clinic_id", clinic.id)
      .single()
      .throwOnError(),
    admin
      .from("professionals")
      .select(
        "id, name, google_account_id, google_calendar_id, google_calendar_name, ce_professional_uuid, ce_professional_name",
      )
      .eq("clinic_id", clinic.id)
      .order("sort_order")
      .order("id")
      .throwOnError(),
    supabase
      .from("google_accounts")
      .select("id, email, status, last_error")
      .eq("clinic_id", clinic.id)
      .order("created_at")
      .throwOnError(),
    supabase
      .from("clinica_experts_accounts")
      .select("status, last_error")
      .eq("clinic_id", clinic.id)
      .maybeSingle()
      .throwOnError(),
  ]);

  // As agendas de cada conta, lidas no Google agora.
  const items: AccountItem[] = await Promise.all(
    accounts.map(async (a) => {
      if (a.status !== "ativo")
        return { ...a, calendars: [], error: a.last_error };
      try {
        return { ...a, calendars: await listCalendars(a.id), error: null };
      } catch (e) {
        console.error("[agenda] agendas da conta:", (e as Error).message);
        return {
          ...a,
          calendars: [],
          error: "Não foi possível ler as agendas desta conta agora.",
        };
      }
    }),
  );

  // Os profissionais do Clínica Experts, lidos agora, para ligar aos daqui.
  let ceProfessionals: CeProfessional[] = [];
  let ceError = ceAccount?.status === "ativo" ? null : ceAccount?.last_error;
  if (ceAccount?.status === "ativo") {
    try {
      const apiKey = await clinicKey(clinic.id);
      ceProfessionals = apiKey ? await listCeProfessionals(apiKey) : [];
    } catch (e) {
      console.error(
        "[agenda] profissionais do Clínica Experts:",
        (e as Error).message,
      );
      ceError =
        "Não foi possível ler os profissionais do Clínica Experts agora.";
    }
  }

  const usingGoogle = integration.mode === "google" && integration.enabled;
  const usingCe = integration.mode === "clinica_experts" && integration.enabled;
  const otherSystem =
    integration.enabled &&
    (integration.mode === "webhook" || integration.mode === "custom")
      ? integration.provider_name || "o sistema da clínica"
      : null;

  const key = (accountId: string | null, calendarId: string | null) =>
    accountId && calendarId ? `${accountId}::${calendarId}` : null;
  const status =
    typeof params.google === "string" ? NOTICES[params.google] : undefined;

  return (
    <div className="space-y-6">
      {status && (
        <p
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            status.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
          )}
        >
          {status.text}
        </p>
      )}
      {otherSystem && (
        <p className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Hoje a assistente usa {otherSystem}, conectado pela equipe LumenzIA.
          Para trocar, conecte um dos sistemas abaixo e ligue a opção dele.
        </p>
      )}

      <AgendaSystems
        google={{
          ready: Boolean(googleCredentials()),
          connected: accounts.length > 0,
          inUse: usingGoogle,
        }}
        clinicaExperts={{
          connected: Boolean(ceAccount),
          broken: ceAccount?.status === "desconectado",
          inUse: usingCe,
        }}
      />

      {ceAccount?.status === "ativo" && (
        <ClinicaExpertsSettings
          inUse={usingCe}
          error={ceError ?? null}
          ceProfessionals={ceProfessionals}
          main={{
            value: integration.ce_professional_uuid,
            name: integration.ce_professional_name,
          }}
          professionals={professionals.map((p) => ({
            id: p.id,
            name: p.name,
            value: p.ce_professional_uuid,
            ceName: p.ce_professional_name,
          }))}
        />
      )}

      {(accounts.length > 0 || usingGoogle) && (
        <div id="google" className="scroll-mt-24">
          <GoogleAgendaSettings
            notice={null}
            googleReady={Boolean(googleCredentials())}
            usingGoogle={usingGoogle}
            otherSystem={null}
            accounts={items}
            main={{
              value: key(
                integration.google_account_id,
                integration.google_calendar_id,
              ),
              name: integration.google_calendar_name,
            }}
            professionals={professionals.map((p) => ({
              id: p.id,
              name: p.name,
              value: key(p.google_account_id, p.google_calendar_id),
              calendarName: p.google_calendar_name,
            }))}
          />
        </div>
      )}
    </div>
  );
}
