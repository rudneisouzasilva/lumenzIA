import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import {
  GoogleAgendaSettings,
  type AccountItem,
} from "@/components/painel/google-agenda-settings";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { googleCredentials, listCalendars } from "@/lib/google/client";
import { getPanelContext } from "@/lib/painel/context";
import { createAdminClient } from "@/lib/supabase/admin";

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
        description="Conecte o Google Agenda da clínica para a assistente ver os horários livres e marcar no calendário de cada profissional."
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
  const [{ data: integration }, { data: professionals }, { data: accounts }] =
    await Promise.all([
      admin
        .from("integrations")
        .select(
          "mode, enabled, provider_name, google_account_id, google_calendar_id, google_calendar_name",
        )
        .eq("clinic_id", clinic.id)
        .single()
        .throwOnError(),
      admin
        .from("professionals")
        .select(
          "id, name, google_account_id, google_calendar_id, google_calendar_name",
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

  const key = (accountId: string | null, calendarId: string | null) =>
    accountId && calendarId ? `${accountId}::${calendarId}` : null;
  const status =
    typeof params.google === "string" ? NOTICES[params.google] : undefined;

  return (
    <GoogleAgendaSettings
      notice={status ?? null}
      googleReady={Boolean(googleCredentials())}
      usingGoogle={integration.mode === "google" && integration.enabled}
      otherSystem={
        integration.mode !== "google" && integration.enabled
          ? integration.provider_name || "o sistema da clínica"
          : null
      }
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
  );
}
