"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarPlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  cancelFollowUp,
  createFollowUp,
  rescheduleFollowUp,
  saveFollowUpSettings,
} from "@/app/(painel)/painel/retomadas/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDate, formatPhone, isoDateInBrasilia } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PanelCard } from "./page";
import { selectClassName } from "./template-send-dialog";

export type FollowUpItem = {
  id: number;
  dueAt: string;
  source: "cliente" | "padrao" | "manual";
  reason: string;
  note: string;
  attempt: number;
  status: "pendente" | "enviado" | "respondido" | "cancelado" | "falhou";
  sentAt: string | null;
  cancelReason: string | null;
  lastError: string | null;
  phone: string;
  name: string | null;
};

type Settings = {
  abandonedDays: number | null;
  concludedDays: number | null;
  maxAttempts: number;
};

const DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90];

const SOURCE_LABEL: Record<FollowUpItem["source"], string> = {
  cliente: "Pedido da pessoa",
  padrao: "Prazo da clínica",
  manual: "Marcada pela equipe",
};

const STATUS: Record<FollowUpItem["status"], { label: string; css: string }> = {
  pendente: { label: "Marcada", css: "bg-primary/10 text-primary" },
  enviado: {
    label: "Enviada, sem resposta",
    css: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  respondido: {
    label: "Respondida",
    css: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  },
  cancelado: { label: "Cancelada", css: "bg-muted text-muted-foreground" },
  falhou: {
    label: "Não enviada",
    css: "bg-destructive/10 text-destructive",
  },
};

const CANCEL_LABEL: Record<string, string> = {
  contato_voltou: "a pessoa escreveu antes",
  agendou: "a pessoa agendou",
  descadastro: "a pessoa pediu para não receber mensagens",
  equipe: "cancelada pela equipe",
};

const daysLabel = (d: number) => (d === 1 ? "1 dia" : `${d} dias`);

/** Amanhã em Brasília: a primeira data aceita para uma retomada. */
function tomorrow() {
  return isoDateInBrasilia(new Date(Date.now() + 24 * 3600_000));
}

export function FollowUpsManager({
  settings,
  templatesApproved,
  pending,
  recent,
}: {
  settings: Settings;
  templatesApproved: boolean;
  pending: FollowUpItem[];
  recent: FollowUpItem[];
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      {!templatesApproved && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          As retomadas só saem depois que a Meta aprovar as mensagens de
          retomada.{" "}
          <Link
            href="/painel/mensagens"
            className="font-medium underline-offset-4 hover:underline"
          >
            Veja em Mensagens prontas
          </Link>
          .
        </p>
      )}

      <PanelCard
        title="Quando retomar"
        description="A data que a própria pessoa pede na conversa sempre vale primeiro. Para quem não pediu nada e não agendou, escolha se a LumenzIA deve chamar de novo e depois de quantos dias. As mensagens saem no horário de atendimento da clínica."
      >
        <SettingsForm initial={settings} />
      </PanelCard>

      <PanelCard
        title="Próximas retomadas"
        description="Canceladas sozinhas se a pessoa escrever antes, agendar ou pedir para não receber mensagens."
      >
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={() => setCreating(true)}>
            <CalendarPlus />
            Marcar retomada
          </Button>
        </div>
        {pending.length ? (
          <ul className="divide-y">
            {pending.map((f) => (
              <PendingRow key={f.id} item={f} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma retomada marcada.
          </p>
        )}
      </PanelCard>

      {recent.length > 0 && (
        <PanelCard title="Últimos 60 dias">
          <ul className="divide-y">
            {recent.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <Who item={f} />
                <div className="text-right text-sm">
                  <StatusBadge status={f.status} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.sentAt
                      ? `Enviada em ${formatDate(f.sentAt)}`
                      : f.status === "cancelado"
                        ? (CANCEL_LABEL[f.cancelReason ?? ""] ?? "Cancelada")
                        : (f.lastError ?? formatDate(f.dueAt))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {creating && <FollowUpDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function StatusBadge({ status }: { status: FollowUpItem["status"] }) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        s.css,
      )}
    >
      {s.label}
    </span>
  );
}

function Who({ item }: { item: FollowUpItem }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">
        {item.name ?? formatPhone(item.phone)}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {item.name ? `${formatPhone(item.phone)} · ` : ""}
        {SOURCE_LABEL[item.source]}
        {item.attempt > 1 ? ` · ${item.attempt}ª tentativa` : ""}
        {item.reason ? ` · ${item.reason}` : ""}
      </p>
      {item.note && (
        <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
      )}
    </div>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty =
    values.abandonedDays !== initial.abandonedDays ||
    values.concludedDays !== initial.concludedDays ||
    values.maxAttempts !== initial.maxAttempts;

  const save = () =>
    startTransition(async () => {
      const result = await saveFollowUpSettings(values);
      if (!result.ok) toast.error(result.error);
      else toast.success("Salvo.");
    });

  const rows: {
    key: "abandonedDays" | "concludedDays";
    title: string;
    hint: string;
  }[] = [
    {
      key: "abandonedDays",
      title: "Conversas abandonadas",
      hint: "A pessoa parou de responder no meio da conversa.",
    },
    {
      key: "concludedDays",
      title: "Concluídas sem agendamento",
      hint: "A dúvida foi respondida, mas a pessoa não marcou horário.",
    },
  ];

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {rows.map((row) => {
        const value = values[row.key];
        return (
          <div
            key={row.key}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
          >
            <div className="min-w-0 flex-1">
              <Label htmlFor={`fu-${row.key}`}>{row.title}</Label>
              <p className="mt-1 text-sm text-muted-foreground">{row.hint}</p>
            </div>
            <div className="flex items-center gap-3">
              {value !== null && (
                <select
                  aria-label={`Dias para retomar: ${row.title}`}
                  className={cn(selectClassName, "w-32")}
                  value={value}
                  onChange={(e) =>
                    setValues({ ...values, [row.key]: Number(e.target.value) })
                  }
                >
                  {DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {daysLabel(d)}
                    </option>
                  ))}
                </select>
              )}
              <Switch
                id={`fu-${row.key}`}
                checked={value !== null}
                onCheckedChange={(on) =>
                  setValues({ ...values, [row.key]: on ? 7 : null })
                }
              />
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
        <div className="min-w-0 flex-1">
          <Label htmlFor="fu-attempts">Tentativas sem resposta</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Quantas vezes chamar a mesma pessoa se ela não responder.
          </p>
        </div>
        <select
          id="fu-attempts"
          className={cn(selectClassName, "w-32")}
          value={values.maxAttempts}
          onChange={(e) =>
            setValues({ ...values, maxAttempts: Number(e.target.value) })
          }
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 vez" : `${n} vezes`}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !dirty}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}

function PendingRow({ item }: { item: FollowUpItem }) {
  const [date, setDate] = useState(isoDateInBrasilia(new Date(item.dueAt)));
  const [pending, startTransition] = useTransition();
  const original = isoDateInBrasilia(new Date(item.dueAt));

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
    });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <Who item={item} />
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="Dia da retomada"
          className="w-40"
          min={tomorrow()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {date !== original && (
          <Button
            size="sm"
            disabled={pending || !date}
            onClick={() => run(() => rescheduleFollowUp(item.id, date))}
          >
            Salvar
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          aria-label="Cancelar retomada"
          disabled={pending}
          onClick={() => run(() => cancelFollowUp(item.id))}
        >
          {pending ? <Loader2 className="animate-spin" /> : <X />}
        </Button>
      </div>
    </li>
  );
}

/** Marcar uma retomada para um número (vazio: a equipe digita). */
export function FollowUpDialog({
  initialPhone = "",
  title = "Marcar retomada",
  onClose,
}: {
  initialPhone?: string;
  title?: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    phone: initialPhone,
    date: "",
    reason: "",
    note: "",
  });
  const [pending, startTransition] = useTransition();
  const ready = form.phone.replace(/\D/g, "").length >= 10 && form.date;

  const save = () =>
    startTransition(async () => {
      const result = await createFollowUp(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Retomada marcada.");
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          No dia escolhido, a LumenzIA manda a mensagem pronta de retomada e a
          assistente continua a conversa quando a pessoa responder.
        </DialogDescription>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) save();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="fu-phone">WhatsApp</Label>
            <Input
              id="fu-phone"
              inputMode="tel"
              placeholder="(41) 99999-0000"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fu-date">Dia</Label>
            <Input
              id="fu-date"
              type="date"
              min={tomorrow()}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fu-reason">Assunto</Label>
            <Input
              id="fu-reason"
              maxLength={120}
              placeholder="avaliação de botox"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Entra na mensagem: &quot;…conversarmos de novo sobre
              [assunto]&quot;.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fu-note">Anotação da equipe (opcional)</Label>
            <Input
              id="fu-note"
              maxLength={500}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!ready || pending}>
              {pending && <Loader2 className="animate-spin" />}
              Marcar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
