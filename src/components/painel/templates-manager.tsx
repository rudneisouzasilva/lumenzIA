"use client";

import { useState, useTransition } from "react";
import { Loader2, PackagePlus, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  createTemplatePackAction,
  saveTemplateAction,
  syncTemplatesAction,
} from "@/app/(painel)/painel/mensagens/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  paramLabels,
  placeholderCount,
  PURPOSE_LABEL,
  TEMPLATE_PACK,
  templateBodyProblem,
  type TemplatePurpose,
} from "@/lib/whatsapp/template-pack";

import { selectClassName, TemplateStatusBadge } from "./template-send-dialog";

export type TemplateItem = {
  id: string;
  purpose: TemplatePurpose;
  name: string;
  category: string;
  body: string;
  footer: string;
  example: string[];
  status: string;
  rejectedReason: string | null;
  lastError: string | null;
};

type Draft = {
  id: string | null;
  title: string;
  category: "MARKETING" | "UTILITY";
  body: string;
  footer: string;
  example: string[];
  purpose: TemplatePurpose;
};

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

export function TemplatesManager({
  items,
  whatsappConnected,
}: {
  items: TemplateItem[];
  whatsappConnected: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"pack" | "sync" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const missingPack = TEMPLATE_PACK.some(
    (p) => !items.some((t) => t.purpose === p.purpose),
  );
  const ordered = [...items].sort(
    (a, b) =>
      order(a.purpose) - order(b.purpose) || a.name.localeCompare(b.name),
  );

  const run = (
    kind: "pack" | "sync",
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setBusy(kind);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (!result.ok) toast.error(result.error);
      else toast.success(success);
    });
  };

  return (
    <div className="space-y-6">
      {!whatsappConnected && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Conecte o WhatsApp da clínica para a LumenzIA criar as mensagens
          prontas na sua conta da Meta.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {missingPack && (
          <Button
            disabled={!whatsappConnected || pending}
            onClick={() =>
              run(
                "pack",
                createTemplatePackAction,
                "Mensagens enviadas para a aprovação da Meta.",
              )
            }
          >
            {busy === "pack" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <PackagePlus />
            )}
            Criar as mensagens da LumenzIA
          </Button>
        )}
        <Button
          variant="outline"
          disabled={!whatsappConnected || pending}
          onClick={() =>
            run("sync", syncTemplatesAction, "Status atualizado com a Meta.")
          }
        >
          {busy === "sync" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
          Sincronizar com a Meta
        </Button>
        <Button
          variant="outline"
          disabled={!whatsappConnected}
          onClick={() =>
            setDraft({
              id: null,
              title: "",
              category: "MARKETING",
              body: "",
              footer: "",
              example: [],
              purpose: "outro",
            })
          }
        >
          <Plus />
          Nova mensagem
        </Button>
      </div>

      {ordered.length ? (
        <ul className="grid gap-3">
          {ordered.map((t) => {
            const pack = TEMPLATE_PACK.find((p) => p.purpose === t.purpose);
            return (
              <li
                key={t.id}
                className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{pack?.title ?? t.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {PURPOSE_LABEL[t.purpose]} ·{" "}
                      {CATEGORY_LABEL[t.category] ?? t.category} ·{" "}
                      <span className="font-mono">{t.name}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TemplateStatusBadge status={t.status} />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        !whatsappConnected || t.category === "AUTHENTICATION"
                      }
                      onClick={() =>
                        setDraft({
                          id: t.id,
                          title: pack?.title ?? t.name,
                          category:
                            t.category === "UTILITY" ? "UTILITY" : "MARKETING",
                          body: t.body,
                          footer: t.footer,
                          example: t.example,
                          purpose: t.purpose,
                        })
                      }
                    >
                      <Pencil />
                      Editar
                    </Button>
                  </div>
                </div>
                {pack && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {pack.description}
                  </p>
                )}
                <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap">
                  {t.body}
                  {t.footer && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t.footer}
                    </span>
                  )}
                </p>
                {(t.rejectedReason || t.lastError) && (
                  <p className="mt-2 text-sm text-destructive">
                    {t.lastError ?? `Motivo da Meta: ${t.rejectedReason}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma mensagem pronta ainda.
        </p>
      )}

      {draft && (
        <TemplateEditor
          key={draft.id ?? "new"}
          draft={draft}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}

function order(purpose: TemplatePurpose) {
  const i = TEMPLATE_PACK.findIndex((p) => p.purpose === purpose);
  return i === -1 ? 99 : i;
}

function TemplateEditor({
  draft: initial,
  onClose,
}: {
  draft: Draft;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();
  const labels = paramLabels(draft.purpose, draft.body);
  const problem = draft.body.trim() ? templateBodyProblem(draft.body) : null;
  const isNew = draft.id === null;

  const save = () =>
    startTransition(async () => {
      const result = await saveTemplateAction({
        id: draft.id,
        title: draft.title,
        category: draft.category,
        body: draft.body,
        footer: draft.footer,
        example: draft.example.slice(0, placeholderCount(draft.body)),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "Enviada para a aprovação da Meta. Costuma levar de minutos a algumas horas.",
      );
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>
          {isNew ? "Nova mensagem pronta" : `Editar: ${draft.title}`}
        </DialogTitle>
        <DialogDescription>
          Use {"{{1}}"}, {"{{2}}"}… onde entram as informações de cada envio. A
          Meta analisa de novo cada alteração; até aprovar, a versão anterior
          deixa de ser enviada.
        </DialogDescription>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {isNew && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tpl-title">Nome</Label>
                <Input
                  id="tpl-title"
                  maxLength={60}
                  placeholder="Promoção de aniversário"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-category">Tipo</Label>
                <select
                  id="tpl-category"
                  className={selectClassName}
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as Draft["category"],
                    })
                  }
                >
                  <option value="MARKETING">
                    Marketing (ofertas, retomadas)
                  </option>
                  <option value="UTILITY">
                    Utilidade (avisos sobre um atendimento)
                  </option>
                </select>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="tpl-body">Texto</Label>
            <Textarea
              id="tpl-body"
              rows={5}
              maxLength={1024}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            {problem && <p className="text-sm text-destructive">{problem}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tpl-footer">Rodapé (opcional)</Label>
            <Input
              id="tpl-footer"
              maxLength={60}
              value={draft.footer}
              onChange={(e) => setDraft({ ...draft, footer: e.target.value })}
            />
          </div>
          {labels.length > 0 && (
            <fieldset className="grid gap-3 rounded-xl border p-3">
              <legend className="px-1 text-sm font-medium">
                Exemplos para a Meta
              </legend>
              {labels.map((label, i) => (
                <div key={i} className="grid gap-1.5">
                  <Label
                    htmlFor={`tpl-ex-${i}`}
                    className="text-xs text-muted-foreground"
                  >
                    {`{{${i + 1}}}`} · {label}
                  </Label>
                  <Input
                    id={`tpl-ex-${i}`}
                    maxLength={200}
                    value={draft.example[i] ?? ""}
                    onChange={(e) => {
                      const example = [...draft.example];
                      example[i] = e.target.value;
                      setDraft({ ...draft, example });
                    }}
                  />
                </div>
              ))}
            </fieldset>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending || Boolean(problem) || !draft.body.trim()}
            >
              {pending && <Loader2 className="animate-spin" />}
              Salvar e enviar para aprovação
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
