"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveNotificationSettings } from "@/app/(painel)/painel/avisos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CHANNEL_LABELS,
  STAFF_CHANNELS,
  type NotificationSettings,
  type StaffChannel,
} from "@/lib/notifications/channels";

const CHANNEL_HINTS: Record<StaffChannel, string> = {
  whatsapp:
    "Mensagem pronta “Aviso para a equipe”, enviada pelo número da clínica. Conta como mensagem de utilidade na Meta.",
  email: "Enviado pela LumenzIA, sem custo para a clínica.",
};

function Row({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

/**
 * Por onde a equipe é avisada (paciente pedindo atendimento, cota do plano acabou) e se o
 * lembrete de agendamento também vai por e-mail.
 */
export function NotificationSettingsForm({
  initial,
  emailReady,
  bookingAsksEmail,
  remindersOn,
}: {
  initial: NotificationSettings;
  /** O envio de e-mail da LumenzIA está configurado. */
  emailReady: boolean;
  /** O e-mail é pedido no agendamento (menu Agenda). */
  bookingAsksEmail: boolean;
  /** Há lembrete escolhido em Horários. */
  remindersOn: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const toggle = (channel: StaffChannel, on: boolean) =>
    setValues({
      ...values,
      channels: STAFF_CHANNELS.filter((c) =>
        c === channel ? on : values.channels.includes(c),
      ),
    });

  const save = () =>
    startTransition(async () => {
      const result = await saveNotificationSettings(values);
      if (!result.ok) toast.error(result.error);
      else toast.success("Salvo.");
    });

  return (
    <form
      className="grid gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className="grid gap-4">
        <div>
          <h3 className="text-sm font-semibold">Avisos para a equipe</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quando um paciente pede para falar com uma pessoa (ou a assistente
            não consegue ajudar) e quando o limite de mensagens do plano acaba.
            O aviso também aparece no painel, em Conversas.
          </p>
        </div>
        <div className="divide-y rounded-xl border px-4 py-3">
          {STAFF_CHANNELS.map((channel) => (
            <Row
              key={channel}
              id={`staff-${channel}`}
              label={CHANNEL_LABELS[channel]}
              hint={
                channel === "email" && !emailReady
                  ? "Ainda não disponível: a LumenzIA está configurando o envio de e-mails."
                  : CHANNEL_HINTS[channel]
              }
              checked={values.channels.includes(channel)}
              disabled={channel === "email" && !emailReady}
              onChange={(on) => toggle(channel, on)}
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="staff-phone">WhatsApp da equipe</Label>
            <Input
              id="staff-phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 99999-0000"
              maxLength={40}
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Um número diferente do que a assistente usa.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="staff-email">E-mail da equipe</Label>
            <Input
              id="staff-email"
              type="email"
              autoComplete="email"
              placeholder="recepcao@clinica.com.br"
              maxLength={254}
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div>
          <h3 className="text-sm font-semibold">Lembretes para pacientes</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {remindersOn ? (
              <>
                Enviados antes do horário marcado, no prazo escolhido em{" "}
                <Link href="/painel/horarios" className="underline">
                  Horários
                </Link>
                .
              </>
            ) : (
              <>
                Os lembretes estão desligados. Escolha quando enviar em{" "}
                <Link href="/painel/horarios" className="underline">
                  Horários
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <div className="divide-y rounded-xl border px-4 py-3">
          <Row
            id="reminder-whatsapp"
            label="WhatsApp"
            hint="Sempre enviado, pela mensagem pronta de lembrete."
            checked
            disabled
            onChange={() => {}}
          />
          <Row
            id="reminder-email"
            label="E-mail"
            hint={
              !emailReady ? (
                "Ainda não disponível: a LumenzIA está configurando o envio de e-mails."
              ) : !bookingAsksEmail ? (
                <>
                  Para usar, peça o e-mail no agendamento em{" "}
                  <Link href="/painel/agenda" className="underline">
                    Agenda
                  </Link>
                  . Só recebe quem informou o e-mail.
                </>
              ) : (
                "Vai também para o e-mail informado no agendamento, com o nome da clínica como remetente."
              )
            }
            checked={values.reminderByEmail}
            disabled={
              !emailReady || (!bookingAsksEmail && !values.reminderByEmail)
            }
            onChange={(on) => setValues({ ...values, reminderByEmail: on })}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !dirty}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}
