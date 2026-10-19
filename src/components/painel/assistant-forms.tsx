"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Check, PenLine } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  saveIdentity,
  saveKnowledge,
  savePastConversations,
  saveRules,
} from "@/app/(painel)/painel/actions";
import { Field } from "@/components/auth/field";
import { Label } from "@/components/ui/label";
import { zodResolver } from "@/lib/auth/zod-resolver";
import {
  identitySchema,
  knowledgeSchema,
  pastConversationsSchema,
  rulesSchema,
  TIMEOUT_OPTIONS,
  TONES,
} from "@/lib/painel/validation";
import { cn } from "@/lib/utils";
import type { z } from "zod";

import { SaveButton, TextareaField, useSave } from "./form-parts";

type FormProps<T> = {
  initial: T;
  /** No passo a passo: o texto do botão e o que fazer depois de salvar. */
  submitLabel?: string;
  onSaved?: () => void;
};

// ---------------------------------------------------------------------------------------------

type Identity = z.infer<typeof identitySchema>;

export function IdentityForm({
  initial,
  submitLabel,
  onSaved,
}: FormProps<Identity>) {
  const form = useForm<Identity>({
    resolver: zodResolver(identitySchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave(saveIdentity);
  const tone = useWatch({ control: form.control, name: "tone" });
  const name = useWatch({ control: form.control, name: "assistantName" });
  const preset = TONES.find((t) => t.value === tone);
  const [custom, setCustom] = useState(!preset && Boolean(initial.tone));

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => {
          form.reset(values);
          onSaved?.();
        }),
      )}
      className="grid gap-6"
    >
      <Field
        label="Nome da assistente"
        placeholder="Ex.: Lia"
        autoComplete="off"
        error={form.formState.errors.assistantName?.message}
        hint={
          <p className="-mt-1 text-sm text-muted-foreground">
            É como ela se apresenta para os pacientes no WhatsApp.
          </p>
        }
        {...form.register("assistantName")}
      />

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">Tom de voz</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TONES.map((t) => {
            const selected = !custom && tone === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setCustom(false);
                  form.setValue("tone", t.value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
                className={cn(
                  "relative rounded-xl border p-4 text-left transition-all outline-none hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected && "border-primary bg-primary/5",
                )}
              >
                <span className="flex items-center justify-between font-medium">
                  {t.label}
                  {selected && <Check className="size-4 text-primary" />}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t.description}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          onClick={() => {
            setCustom(true);
            if (preset) form.setValue("tone", "", { shouldDirty: true });
          }}
          className={cn(
            "flex items-center gap-2 rounded-xl border border-dashed p-3 text-left text-sm transition-colors hover:bg-accent/40",
            custom && "border-primary bg-primary/5 text-primary",
          )}
        >
          <PenLine className="size-4" />
          Descrever outro tom
        </button>
        <AnimatePresence initial={false}>
          {custom && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Field
                label="Como ela deve falar?"
                placeholder="Ex.: carinhosa, usa o nome da paciente e poucos emojis"
                className="pt-1"
                error={form.formState.errors.tone?.message}
                {...form.register("tone")}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {!custom && form.formState.errors.tone && (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.tone.message}
          </p>
        )}
      </fieldset>

      <TonePreview
        name={name || "Assistente"}
        text={
          preset && !custom
            ? preset.sample
            : "Olá! Vou responder no tom que você descreveu acima. 😊"
        }
      />

      <SaveButton
        pending={pending}
        saved={saved}
        dirty={form.formState.isDirty || Boolean(onSaved)}
      >
        {submitLabel}
      </SaveButton>
    </form>
  );
}

/** Prévia de como a primeira mensagem soaria no WhatsApp. */
function TonePreview({ name, text }: { name: string; text: string }) {
  return (
    <div className="rounded-2xl border bg-[#efeae2] p-4 dark:bg-[#0b141a]">
      <p className="mb-3 text-center text-xs text-[#54656f] dark:text-[#8696a0]">
        Prévia no WhatsApp
      </p>
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
          Oi, queria saber sobre limpeza de pele
        </p>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={text + name}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="mt-2 flex"
        >
          <p className="max-w-[80%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
            <span className="mb-0.5 block text-xs font-medium text-primary">
              {name}
            </span>
            {text}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

type Knowledge = z.infer<typeof knowledgeSchema>;

export function KnowledgeForm({
  initial,
  submitLabel,
  onSaved,
}: FormProps<Knowledge>) {
  const form = useForm<Knowledge>({
    resolver: zodResolver(knowledgeSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave(saveKnowledge);
  const businessInfo = useWatch({
    control: form.control,
    name: "businessInfo",
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => {
          form.reset(values);
          onSaved?.();
        }),
      )}
      className="grid gap-4"
    >
      <TextareaField
        label="Informações da clínica"
        hint="Endereço, como chegar, estacionamento, formas de pagamento, valores, promoções e o que mais a assistente deve saber."
        placeholder={
          "Endereço: Rua das Flores, 123, Centro.\nPagamento: Pix, cartão em até 10x.\nLimpeza de pele: R$ 180, dura 1h30."
        }
        className="[&_textarea]:min-h-56"
        maxLength={20000}
        value={businessInfo}
        error={form.formState.errors.businessInfo?.message}
        {...form.register("businessInfo")}
      />
      <SaveButton
        pending={pending}
        saved={saved}
        dirty={form.formState.isDirty || Boolean(onSaved)}
      >
        {submitLabel}
      </SaveButton>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

type Rules = z.infer<typeof rulesSchema>;

const timeoutLabel = (value: string) =>
  value ? `${value} horas sem resposta` : "Tempo padrão da LumenzIA";

export function RulesForm({ initial }: FormProps<Rules>) {
  const form = useForm<Rules>({
    resolver: zodResolver(rulesSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave(saveRules);
  const behaviorRules = useWatch({
    control: form.control,
    name: "behaviorRules",
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => form.reset(values)),
      )}
      className="grid gap-5"
    >
      <TextareaField
        label="Regras de comportamento"
        hint="O que a assistente sempre ou nunca deve fazer. Uma regra por linha funciona bem."
        placeholder={
          "Nunca dar diagnóstico.\nSempre oferecer a avaliação gratuita.\nNão passar valores de botox: convidar para avaliação."
        }
        maxLength={5000}
        value={behaviorRules}
        error={form.formState.errors.behaviorRules?.message}
        {...form.register("behaviorRules")}
      />
      <div className="grid gap-2">
        <Label htmlFor="timeout">Encerrar a conversa depois de</Label>
        <select
          id="timeout"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          {...form.register("timeoutHours")}
        >
          {TIMEOUT_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {timeoutLabel(v)}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          Depois desse tempo parada, a conversa é encerrada e classificada pelo
          motivo de contato.
        </p>
      </div>
      <SaveButton
        pending={pending}
        saved={saved}
        dirty={form.formState.isDirty}
      />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

type PastConversations = z.infer<typeof pastConversationsSchema>;

export function PastConversationsForm({
  initial,
}: FormProps<PastConversations>) {
  const form = useForm<PastConversations>({
    resolver: zodResolver(pastConversationsSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave(savePastConversations);
  const pastConversations = useWatch({
    control: form.control,
    name: "pastConversations",
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => form.reset(values)),
      )}
      className="grid gap-4"
    >
      <TextareaField
        label="Conversas reais da clínica"
        hint="Cole trechos de conversas do WhatsApp que deram certo. Apague nomes e telefones dos pacientes antes."
        placeholder={
          "Paciente: Vocês fazem harmonização?\nClínica: Fazemos sim! A avaliação é gratuita e dura uns 30 minutos. Quer que eu veja um horário para você?"
        }
        className="[&_textarea]:min-h-80 [&_textarea]:font-mono [&_textarea]:text-xs"
        maxLength={50000}
        value={pastConversations}
        error={form.formState.errors.pastConversations?.message}
        {...form.register("pastConversations")}
      />
      <SaveButton
        pending={pending}
        saved={saved}
        dirty={form.formState.isDirty}
      />
    </form>
  );
}
