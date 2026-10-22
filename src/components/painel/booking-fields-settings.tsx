"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { saveBookingFields } from "@/app/(painel)/painel/dados-agendamento/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  FIELD_MODE_LABELS,
  FIELD_MODES,
  FIXED_FIELD_LABELS,
  FIXED_FIELDS,
  MAX_CUSTOM_FIELD_NAME,
  MAX_CUSTOM_FIELDS,
  type BookingFields,
  type FieldMode,
  type FixedField,
} from "@/lib/booking-fields";

import { selectClassName } from "./template-send-dialog";

const HINTS: Record<FixedField, string> = {
  email: "A assistente confere se o endereço é válido.",
  cpf: "A assistente confere os dígitos do CPF. É um dado pessoal: peça só se a clínica usa.",
  data_nascimento:
    "Aceita qualquer formato que a pessoa escrever, como 15/03/1990.",
};

function FixedRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="w-full sm:w-44">{children}</div>
    </div>
  );
}

/** Quais dados a assistente pede antes de agendar: os fixos e até 3 campos da clínica. */
export function BookingFieldsForm({ initial }: { initial: BookingFields }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const setCustom = (
    index: number,
    patch: Partial<BookingFields["personalizados"][number]>,
  ) =>
    setValues({
      ...values,
      personalizados: values.personalizados.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    });

  const save = () =>
    startTransition(async () => {
      const result = await saveBookingFields({
        ...values,
        personalizados: values.personalizados
          .map((c) => ({ ...c, nome: c.nome.trim() }))
          .filter((c) => c.nome),
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Salvo.");
    });

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="divide-y rounded-xl border px-4 py-3">
        <FixedRow
          label="Nome completo"
          hint="Sempre pedido, para identificar o agendamento."
        >
          <p className="text-sm text-muted-foreground sm:text-right">
            Obrigatório
          </p>
        </FixedRow>
        <FixedRow
          label="Telefone"
          hint="Vem do próprio WhatsApp. A assistente só pergunta quando o agendamento é para outra pessoa."
        >
          <p className="text-sm text-muted-foreground sm:text-right">
            Automático
          </p>
        </FixedRow>
        {FIXED_FIELDS.map((key) => (
          <FixedRow key={key} label={FIXED_FIELD_LABELS[key]} hint={HINTS[key]}>
            <select
              aria-label={FIXED_FIELD_LABELS[key]}
              className={selectClassName}
              value={values[key]}
              onChange={(e) =>
                setValues({ ...values, [key]: e.target.value as FieldMode })
              }
            >
              {FIELD_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {FIELD_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </FixedRow>
        ))}
      </div>

      <div className="grid gap-3">
        <div>
          <p className="text-sm font-medium">Campos da clínica</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Até {MAX_CUSTOM_FIELDS} perguntas curtas a mais, como
            &quot;Alergias&quot;, &quot;Convênio&quot; ou &quot;Como conheceu a
            clínica&quot;.
          </p>
        </div>
        {values.personalizados.map((c, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
          >
            <Input
              aria-label={`Nome do campo ${i + 1}`}
              className="min-w-40 flex-1"
              maxLength={MAX_CUSTOM_FIELD_NAME}
              placeholder="Ex.: Alergias"
              value={c.nome}
              onChange={(e) => setCustom(i, { nome: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <Switch
                id={`bf-required-${i}`}
                checked={c.obrigatorio}
                onCheckedChange={(on) => setCustom(i, { obrigatorio: on })}
              />
              <Label htmlFor={`bf-required-${i}`} className="font-normal">
                Obrigatório
              </Label>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover campo"
              onClick={() =>
                setValues({
                  ...values,
                  personalizados: values.personalizados.filter(
                    (_, j) => j !== i,
                  ),
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {values.personalizados.length < MAX_CUSTOM_FIELDS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              setValues({
                ...values,
                personalizados: [
                  ...values.personalizados,
                  { nome: "", obrigatorio: false },
                ],
              })
            }
          >
            <Plus />
            Adicionar campo
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Quem já agendou antes não precisa responder de novo: a assistente
        reaproveita o que a pessoa informou. Os dados vão junto para a agenda da
        clínica e aparecem no Funil, no cartão de cada contato.
      </p>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !dirty}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}
