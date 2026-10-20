"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";

import { sendTemplateToContact } from "@/app/(painel)/painel/atendimento/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  paramLabels,
  PURPOSE_LABEL,
  type TemplatePurpose,
} from "@/lib/whatsapp/template-pack";
import { cn } from "@/lib/utils";

export type ApprovedTemplate = {
  id: string;
  purpose: TemplatePurpose;
  name: string;
  body: string;
};

export type ClinicInfo = { name: string; assistantName: string };

/** Valores já sugeridos para cada variável das mensagens do pacote. */
function suggestions(
  template: ApprovedTemplate,
  clinic: ClinicInfo,
  contactName: string | null,
) {
  const first = contactName?.trim().split(/\s+/)[0] ?? "";
  switch (template.purpose) {
    case "retomada_pedido":
    case "retomada_sem_resposta":
      return [clinic.assistantName, clinic.name, ""];
    case "reabrir":
      return [first, clinic.name];
    case "lembrete":
      return [first, ""];
    default:
      return [];
  }
}

export const selectClassName =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Escolher uma mensagem pronta aprovada, completar as variáveis e enviar. Sem `conversationId`
 * nem `phone`, pede o número (nova conversa).
 */
export function TemplateSendDialog({
  open,
  onOpenChange,
  templates,
  clinic,
  conversationId = null,
  phone = null,
  contactName = null,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ApprovedTemplate[];
  clinic: ClinicInfo;
  conversationId?: number | null;
  phone?: string | null;
  contactName?: string | null;
  onSent: (conversationId: number) => void;
}) {
  const [templateId, setTemplateId] = useState(
    () =>
      (templates.find((t) => t.purpose === "reabrir") ?? templates[0])?.id ??
      "",
  );
  const template = templates.find((t) => t.id === templateId) ?? null;
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [number, setNumber] = useState("");
  const [pending, startTransition] = useTransition();
  const askNumber = conversationId === null && !phone;

  const labels = template ? paramLabels(template.purpose, template.body) : [];
  const current = template
    ? (values[template.id] ??
      labels.map((_, i) => suggestions(template, clinic, contactName)[i] ?? ""))
    : [];
  const preview = template
    ? template.body.replace(
        /\{\{\s*(\d+)\s*\}\}/g,
        (_, n: string) =>
          current[Number(n) - 1] || `[${labels[Number(n) - 1]}]`,
      )
    : "";
  const ready =
    template &&
    current.every((v) => v.trim()) &&
    (!askNumber || number.replace(/\D/g, "").length >= 10);

  const send = () => {
    if (!template || !ready) return;
    startTransition(async () => {
      const result = await sendTemplateToContact({
        conversationId,
        phone: askNumber ? number : phone,
        templateId: template.id,
        params: current,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Mensagem enviada. A conversa fica com a equipe.");
      onOpenChange(false);
      onSent(result.conversationId);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>
          {askNumber ? "Nova conversa" : "Enviar mensagem pronta"}
        </DialogTitle>
        <DialogDescription>
          Depois de 24 horas sem resposta do paciente, o WhatsApp só deixa a
          clínica escrever com uma mensagem aprovada pela Meta. Quando ele
          responder, a conversa volta ao normal.
        </DialogDescription>

        {!templates.length ? (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            Nenhuma mensagem pronta aprovada ainda.{" "}
            <Link
              href="/painel/mensagens"
              className="text-primary underline-offset-4 hover:underline"
            >
              Veja em Mensagens prontas
            </Link>
            .
          </p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {askNumber && (
              <div className="grid gap-2">
                <Label htmlFor="template-phone">WhatsApp do paciente</Label>
                <Input
                  id="template-phone"
                  inputMode="tel"
                  placeholder="(41) 99999-0000"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="template-choice">Mensagem</Label>
              <select
                id="template-choice"
                className={selectClassName}
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {PURPOSE_LABEL[t.purpose]} · {t.name}
                  </option>
                ))}
              </select>
            </div>
            {template &&
              labels.map((label, i) => (
                <div key={`${template.id}-${i}`} className="grid gap-2">
                  <Label htmlFor={`param-${i}`}>{label}</Label>
                  <Input
                    id={`param-${i}`}
                    value={current[i] ?? ""}
                    maxLength={500}
                    onChange={(e) =>
                      setValues((prev) => {
                        const next = [...current];
                        next[i] = e.target.value;
                        return { ...prev, [template.id]: next };
                      })
                    }
                  />
                </div>
              ))}
            {template && (
              <div className="rounded-xl bg-[#d9fdd3] px-3 py-2 text-sm whitespace-pre-wrap text-neutral-800 dark:bg-[#005c4b] dark:text-neutral-100">
                {preview}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!ready || pending}>
                {pending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <SendHorizontal />
                )}
                Enviar
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Selo de status de um template na Meta. */
export function TemplateStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    APPROVED: {
      label: "Aprovada",
      className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    },
    PENDING: {
      label: "Em análise na Meta",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    IN_APPEAL: {
      label: "Em recurso",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    REJECTED: {
      label: "Recusada",
      className: "bg-destructive/10 text-destructive",
    },
    ERRO: {
      label: "Não enviada",
      className: "bg-destructive/10 text-destructive",
    },
    RASCUNHO: {
      label: "Rascunho",
      className: "bg-muted text-muted-foreground",
    },
    PAUSED: {
      label: "Pausada pela Meta",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    DISABLED: {
      label: "Desativada pela Meta",
      className: "bg-destructive/10 text-destructive",
    },
  };
  const item = map[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        item.className,
      )}
    >
      {item.label}
    </span>
  );
}
