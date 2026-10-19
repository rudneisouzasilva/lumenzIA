"use client";

import { useRef, useState, useTransition } from "react";
import { useForm, useWatch, type FieldValues } from "react-hook-form";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
} from "motion/react";
import { toast } from "sonner";
import type { z } from "zod";

import {
  deleteListItem,
  reorderList,
  saveListItem,
} from "@/app/(painel)/painel/actions";
import { Field } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { zodResolver } from "@/lib/auth/zod-resolver";
import {
  LIST_LIMITS,
  listSchemas,
  type ListItem,
  type ListKind,
} from "@/lib/painel/validation";
import { cn } from "@/lib/utils";

import { TextareaField } from "./form-parts";

type Values = Record<string, string | number>;

type FieldDef = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number";
  placeholder?: string;
  maxLength?: number;
};

type ListConfig = {
  addLabel: string;
  fields: FieldDef[];
  defaults: Values;
  empty: string;
  title: (item: Values) => string;
  subtitle?: (item: Values) => string;
  suggestions?: Values[];
};

const LIST_CONFIG: Record<ListKind, ListConfig> = {
  faqs: {
    addLabel: "Adicionar pergunta",
    fields: [
      {
        name: "question",
        label: "Pergunta",
        type: "text",
        placeholder: "Ex.: Quais as formas de pagamento?",
      },
      {
        name: "answer",
        label: "Resposta",
        type: "textarea",
        maxLength: 2000,
        placeholder:
          "Ex.: Aceitamos Pix, débito e crédito em até 10x sem juros.",
      },
    ],
    defaults: { question: "", answer: "" },
    empty:
      "Cadastre as dúvidas que os pacientes mais mandam. A assistente responde com as suas palavras.",
    title: (i) => String(i.question),
    subtitle: (i) => String(i.answer),
    suggestions: [
      { question: "Quais as formas de pagamento?", answer: "" },
      { question: "Onde fica a clínica?", answer: "" },
      { question: "A avaliação é gratuita?", answer: "" },
      { question: "Qual o horário de atendimento?", answer: "" },
      { question: "Vocês têm estacionamento?", answer: "" },
    ],
  },
  ai_questions: {
    addLabel: "Adicionar pergunta",
    fields: [
      {
        name: "question",
        label: "O que a assistente deve perguntar",
        type: "text",
        placeholder: "Ex.: Você já fez esse procedimento antes?",
      },
    ],
    defaults: { question: "" },
    empty:
      "Perguntas que a assistente faz ao paciente durante a conversa, para entender o que ele procura antes de agendar.",
    title: (i) => String(i.question),
    suggestions: [
      { question: "Qual o seu nome?" },
      { question: "Qual procedimento você tem interesse?" },
      { question: "Você já fez esse procedimento antes?" },
      { question: "Como você conheceu a clínica?" },
    ],
  },
  contact_reasons: {
    addLabel: "Adicionar motivo",
    fields: [
      {
        name: "name",
        label: "Motivo",
        type: "text",
        placeholder: "Ex.: Agendamento",
      },
      {
        name: "description",
        label: "Quando usar (opcional)",
        type: "textarea",
        maxLength: 500,
        placeholder:
          "Ex.: A pessoa quis marcar, remarcar ou cancelar um horário.",
      },
    ],
    defaults: { name: "", description: "" },
    empty:
      "Ao fim de cada conversa, a IA escolhe um destes motivos. É assim que o painel mostra por que as pessoas chamam a clínica.",
    title: (i) => String(i.name),
    subtitle: (i) => String(i.description ?? ""),
    suggestions: [
      { name: "Agendamento", description: "" },
      { name: "Dúvida sobre procedimento", description: "" },
      { name: "Valores", description: "" },
      { name: "Pós-procedimento", description: "" },
    ],
  },
  services: {
    addLabel: "Adicionar procedimento",
    fields: [
      {
        name: "name",
        label: "Procedimento",
        type: "text",
        placeholder: "Ex.: Limpeza de pele",
      },
      {
        name: "duration_minutes",
        label: "Duração (minutos)",
        type: "number",
        placeholder: "60",
      },
    ],
    defaults: { name: "", duration_minutes: 60 },
    empty:
      "Os procedimentos que a assistente pode agendar. A duração define quanto tempo ela reserva na agenda.",
    title: (i) => String(i.name),
    subtitle: (i) => formatDuration(Number(i.duration_minutes)),
    suggestions: [
      { name: "Avaliação", duration_minutes: 30 },
      { name: "Limpeza de pele", duration_minutes: 90 },
      { name: "Botox", duration_minutes: 45 },
      { name: "Preenchimento labial", duration_minutes: 60 },
    ],
  },
  professionals: {
    addLabel: "Adicionar profissional",
    fields: [
      {
        name: "name",
        label: "Nome",
        type: "text",
        placeholder: "Ex.: Dra. Mariana Souza",
      },
    ],
    defaults: { name: "" },
    empty:
      "Quem atende na clínica. A assistente pergunta com quem o paciente prefere e passa o nome para a agenda.",
    title: (i) => String(i.name),
  },
};

function formatDuration(minutes: number) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Lista com adicionar, editar, apagar e arrastar para reordenar. */
export function ListEditor({
  kind,
  initialItems,
}: {
  kind: ListKind;
  initialItems: ListItem[];
}) {
  const config = LIST_CONFIG[kind];
  const limit = LIST_LIMITS[kind];
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Values>(config.defaults);
  const [, startTransition] = useTransition();
  const itemsRef = useRef(initialItems);
  const savedOrder = useRef(initialItems.map((i) => i.id).join());

  const update = (next: ListItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  const persistOrder = () => {
    const ids = itemsRef.current.map((i) => i.id);
    const key = ids.join();
    if (key === savedOrder.current) return;
    savedOrder.current = key;
    startTransition(async () => {
      const result = await reorderList(kind, ids);
      if (!result.ok) toast.error(result.error);
    });
  };

  const move = (index: number, delta: number) => {
    const next = [...itemsRef.current];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    update(next);
    persistOrder();
  };

  const startNew = (values: Values = config.defaults) => {
    setDraft(values);
    setEditing("new");
  };

  const remove = (id: string) => {
    const before = itemsRef.current;
    update(before.filter((i) => i.id !== id));
    savedOrder.current = itemsRef.current.map((i) => i.id).join();
    startTransition(async () => {
      const result = await deleteListItem(kind, id);
      if (!result.ok) {
        toast.error(result.error);
        update(before);
        savedOrder.current = before.map((i) => i.id).join();
      }
    });
  };

  const usedTitles = new Set(items.map((i) => config.title(i)));
  const suggestions = (config.suggestions ?? []).filter(
    (s) => !usedTitles.has(config.title(s)),
  );
  const full = items.length >= limit;

  return (
    <div className="space-y-4">
      {items.length === 0 && editing !== "new" && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-6" />
          </span>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            {config.empty}
          </p>
          <Button className="mt-6" onClick={() => startNew()}>
            <Plus />
            {config.addLabel}
          </Button>
        </div>
      )}

      <Reorder.Group
        axis="y"
        values={items}
        onReorder={update}
        className="space-y-3"
      >
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <Row
              key={item.id}
              kind={kind}
              item={item}
              config={config}
              editing={editing === item.id}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onEdit={() => setEditing(item.id)}
              onCancel={() => setEditing(null)}
              onSave={async (values) => {
                const result = await saveListItem(kind, item.id, values);
                if (!result.ok) return result.error;
                update(
                  itemsRef.current.map((i) =>
                    i.id === item.id ? result.item : i,
                  ),
                );
                setEditing(null);
              }}
              onDelete={() => remove(item.id)}
              onDragEnd={persistOrder}
              onMove={(delta) => move(index, delta)}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>

      <AnimatePresence initial={false}>
        {editing === "new" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-primary/40 bg-card p-4 shadow-sm"
          >
            <ItemForm
              kind={kind}
              config={config}
              initial={draft}
              submitLabel="Adicionar"
              onCancel={() => setEditing(null)}
              onSave={async (values) => {
                const result = await saveListItem(kind, null, values);
                if (!result.ok) return result.error;
                update([...itemsRef.current, result.item]);
                savedOrder.current = itemsRef.current.map((i) => i.id).join();
                setEditing(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {items.length > 0 && editing !== "new" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => startNew()} disabled={full}>
            <Plus />
            {config.addLabel}
          </Button>
          <span className="text-xs text-muted-foreground">
            {items.length} de {limit}
            {items.length > 1 && " · arraste pelo ⠿ para mudar a ordem"}
          </span>
        </div>
      )}

      {suggestions.length > 0 && items.length < 4 && editing !== "new" && (
        <div className="rounded-xl bg-muted/50 p-4">
          <p className="mb-3 text-sm font-medium">Sugestões para começar</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={config.title(s)}
                type="button"
                onClick={() => startNew({ ...config.defaults, ...s })}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                <Plus className="size-3.5" />
                {config.title(s)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  kind,
  item,
  config,
  editing,
  isFirst,
  isLast,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onDragEnd,
  onMove,
}: {
  kind: ListKind;
  item: ListItem;
  config: ListConfig;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: Values) => Promise<string | void>;
  onDelete: () => void;
  onDragEnd: () => void;
  onMove: (delta: number) => void;
}) {
  const controls = useDragControls();
  const [confirming, setConfirming] = useState(false);
  const subtitle = config.subtitle?.(item);

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      whileDrag={{ scale: 1.02, zIndex: 10 }}
      className={cn(
        "group relative rounded-xl border bg-card shadow-xs",
        editing && "border-primary/40",
      )}
    >
      {editing ? (
        <div className="p-4">
          <ItemForm
            kind={kind}
            config={config}
            initial={item}
            submitLabel="Salvar"
            onCancel={onCancel}
            onSave={onSave}
          />
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 sm:p-4">
          <button
            type="button"
            aria-label="Arrastar para mudar a ordem"
            onPointerDown={(e) => controls.start(e)}
            className="mt-0.5 cursor-grab touch-none rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="min-w-0 flex-1 text-left"
          >
            <p className="font-medium">{config.title(item)}</p>
            {subtitle && (
              <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">
                {subtitle}
              </p>
            )}
          </button>
          {confirming ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Manter
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Excluir
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Mover para cima"
                disabled={isFirst}
                onClick={() => onMove(-1)}
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Mover para baixo"
                disabled={isLast}
                onClick={() => onMove(1)}
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Editar"
                onClick={onEdit}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 hover:text-destructive"
                aria-label="Excluir"
                onClick={() => setConfirming(true)}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
      )}
    </Reorder.Item>
  );
}

function ItemForm({
  config,
  initial,
  submitLabel,
  onCancel,
  onSave,
  kind,
}: {
  kind: ListKind;
  config: ListConfig;
  initial: Values;
  submitLabel: string;
  onCancel: () => void;
  onSave: (values: Values) => Promise<string | void>;
}) {
  const schema = listSchemas[kind] as unknown as z.ZodType<Values, FieldValues>;
  const defaults = Object.fromEntries(
    config.fields.map((f) => [
      f.name,
      initial[f.name] ?? config.defaults[f.name],
    ]),
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const [pending, startTransition] = useTransition();
  const errors = form.formState.errors;
  const current = useWatch({ control: form.control });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          const error = await onSave(values);
          if (error) toast.error(error);
        }),
      )}
      className="grid gap-4"
    >
      <div
        className={cn(
          "grid gap-4",
          config.fields.some((f) => f.type === "number") &&
            "sm:grid-cols-[1fr_12rem]",
        )}
      >
        {config.fields.map((f, i) =>
          f.type === "textarea" ? (
            <TextareaField
              key={f.name}
              label={f.label}
              placeholder={f.placeholder}
              maxLength={f.maxLength ?? 500}
              value={String(current[f.name] ?? "")}
              error={errors[f.name]?.message as string | undefined}
              {...form.register(f.name)}
            />
          ) : (
            <Field
              key={f.name}
              label={f.label}
              placeholder={f.placeholder}
              autoFocus={i === 0}
              autoComplete="off"
              type={f.type}
              inputMode={f.type === "number" ? "numeric" : undefined}
              error={errors[f.name]?.message as string | undefined}
              {...form.register(f.name, {
                valueAsNumber: f.type === "number",
              })}
            />
          ),
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
