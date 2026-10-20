"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck, Loader2, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  disconnectGoogleAccount,
  saveGoogleCalendars,
  setGoogleAgenda,
} from "@/app/(painel)/painel/agenda/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { GoogleCalendar } from "@/lib/google/client";
import { cn } from "@/lib/utils";

import { PanelCard } from "./page";
import { selectClassName } from "./template-send-dialog";

export type AccountItem = {
  id: string;
  email: string;
  status: string;
  calendars: GoogleCalendar[];
  error: string | null;
};

type ProfessionalItem = {
  id: string;
  name: string;
  value: string | null;
  calendarName: string;
};

export function GoogleAgendaSettings({
  notice,
  googleReady,
  usingGoogle,
  otherSystem,
  accounts,
  main,
  professionals,
}: {
  notice: { ok: boolean; text: string } | null;
  googleReady: boolean;
  usingGoogle: boolean;
  otherSystem: string | null;
  accounts: AccountItem[];
  main: { value: string | null; name: string };
  professionals: ProfessionalItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [mainValue, setMainValue] = useState(main.value ?? "");
  const [byProfessional, setByProfessional] = useState<Record<string, string>>(
    () => Object.fromEntries(professionals.map((p) => [p.id, p.value ?? ""])),
  );
  const dirty =
    mainValue !== (main.value ?? "") ||
    professionals.some((p) => (byProfessional[p.id] ?? "") !== (p.value ?? ""));
  const anyChosen =
    Boolean(main.value) || professionals.some((p) => Boolean(p.value));

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    success?: string,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
      else if (success) toast.success(success);
    });

  // Agendas que aparecem na escolha, inclusive a já salva se a conta não a mostra mais.
  const options = accounts.flatMap((a) =>
    a.calendars.map((c) => ({
      value: `${a.id}::${c.id}`,
      label: `${c.name}${c.primary ? " (principal)" : ""} · ${a.email}`,
    })),
  );
  const select = (
    id: string,
    value: string,
    onChange: (v: string) => void,
    savedName: string,
    saved: string | null,
  ) => (
    <select
      id={id}
      className={selectClassName}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Nenhuma</option>
      {saved && !options.some((o) => o.value === saved) && (
        <option value={saved}>
          {savedName || "Agenda salva"} (indisponível)
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      {notice && (
        <p
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            notice.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
          )}
        >
          {notice.text}
        </p>
      )}

      {otherSystem && (
        <p className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Hoje a assistente usa {otherSystem}, conectado pela equipe LumenzIA.
          Se a clínica usa o Google Agenda, conecte abaixo e ligue a opção para
          trocar. Para outro sistema, fale com o suporte.
        </p>
      )}

      <PanelCard
        title="Contas do Google"
        description="Pode conectar mais de uma conta, e cada conta pode ter várias agendas. A LumenzIA só vê os horários e cria ou cancela os agendamentos que a assistente marcar."
      >
        {accounts.length > 0 && (
          <ul className="mb-4 divide-y rounded-xl border">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.email}</p>
                  <p
                    className={cn(
                      "text-xs",
                      a.error ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {a.error ??
                      `${a.calendars.length} ${a.calendars.length === 1 ? "agenda" : "agendas"}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => disconnectGoogleAccount(a.id),
                      "Conta desconectada.",
                    )
                  }
                >
                  <LogOut />
                  Desconectar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {googleReady ? (
          <Button asChild variant={accounts.length ? "outline" : "default"}>
            {/* Rota de servidor: sai para o Google e volta. */}
            <a href="/api/google/conectar">
              <Plus />
              {accounts.length
                ? "Conectar outra conta"
                : "Conectar com o Google"}
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            A conexão com o Google ainda não foi ativada na LumenzIA.
          </p>
        )}
      </PanelCard>

      {accounts.some((a) => a.calendars.length) && (
        <PanelCard
          title="Qual agenda usar"
          description="Escolha a agenda de cada profissional. A principal vale para quando a pessoa não escolhe um profissional ou a clínica não tem profissionais cadastrados."
        >
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  saveGoogleCalendars({
                    main: mainValue || null,
                    professionals: Object.fromEntries(
                      professionals.map((p) => [
                        p.id,
                        byProfessional[p.id] || null,
                      ]),
                    ),
                  }),
                "Agendas salvas.",
              );
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="cal-main">Agenda principal</Label>
              {select(
                "cal-main",
                mainValue,
                setMainValue,
                main.name,
                main.value,
              )}
            </div>
            {professionals.map((p) => (
              <div key={p.id} className="grid gap-2">
                <Label htmlFor={`cal-${p.id}`}>{p.name}</Label>
                {select(
                  `cal-${p.id}`,
                  byProfessional[p.id] ?? "",
                  (v) => setByProfessional({ ...byProfessional, [p.id]: v }),
                  p.calendarName,
                  p.value,
                )}
              </div>
            ))}
            {!professionals.length && (
              <p className="text-sm text-muted-foreground">
                Para usar uma agenda por profissional, cadastre os profissionais
                em{" "}
                <Link
                  href="/painel/profissionais"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Profissionais
                </Link>
                .
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !dirty}>
                {pending && <Loader2 className="animate-spin" />}
                Salvar agendas
              </Button>
            </div>
          </form>
        </PanelCard>
      )}

      <PanelCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="use-google" className="flex items-center gap-2">
              <CalendarCheck className="size-4 text-primary" />A assistente usa
              o Google Agenda
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Ligado, ela consulta os horários livres pelo expediente da
              clínica, marca e cancela no Google, e os lembretes passam a sair.
            </p>
          </div>
          <Switch
            id="use-google"
            checked={usingGoogle}
            disabled={pending || (!usingGoogle && (!anyChosen || dirty))}
            onCheckedChange={(on) =>
              run(
                () => setGoogleAgenda(on),
                on ? "Google Agenda ligado." : "Google Agenda desligado.",
              )
            }
          />
        </div>
      </PanelCard>
    </div>
  );
}
