"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveEvaluationSettings } from "@/app/(painel)/painel/procedimentos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MAX_EVALUATION_VALIDITY_DAYS } from "@/lib/painel/validation";

export type EvaluationSettings = {
  required: boolean;
  validityDays: number | null;
};

const DEFAULT_VALIDITY_DAYS = 60;

/** Exigir avaliação antes dos procedimentos, com um prazo opcional depois dela. */
export function EvaluationSettingsForm({
  initial,
  hasEvaluation,
}: {
  initial: EvaluationSettings;
  /** Se há algum item do tipo "Avaliação" na lista. */
  hasEvaluation: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [days, setDays] = useState(
    String(initial.validityDays ?? DEFAULT_VALIDITY_DAYS),
  );
  const [pending, startTransition] = useTransition();
  const validityDays = values.validityDays === null ? null : Number(days);
  const dirty =
    values.required !== initial.required ||
    validityDays !== initial.validityDays;

  const save = () =>
    startTransition(async () => {
      const result = await saveEvaluationSettings({
        required: values.required,
        validityDays,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Salvo.");
    });

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
        <div className="min-w-0 flex-1">
          <Label htmlFor="ev-required">
            Exigir avaliação antes de procedimentos
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            A assistente só agenda os itens do tipo &quot;Procedimento&quot;
            para quem já fez uma avaliação. Os do tipo &quot;Livre&quot; nunca
            exigem.
          </p>
        </div>
        <Switch
          id="ev-required"
          checked={values.required}
          onCheckedChange={(on) => setValues({ ...values, required: on })}
        />
      </div>

      {values.required && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
          <div className="min-w-0 flex-1">
            <Label htmlFor="ev-validity">Prazo máximo após a avaliação</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              O procedimento precisa acontecer até quantos dias depois da
              avaliação. Sem prazo, qualquer avaliação dos últimos 12 meses
              vale.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {values.validityDays !== null && (
              <div className="flex items-center gap-2">
                <Input
                  id="ev-validity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_EVALUATION_VALIDITY_DAYS}
                  className="w-24"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
            )}
            <Switch
              aria-label="Usar prazo máximo"
              checked={values.validityDays !== null}
              onCheckedChange={(on) =>
                setValues({
                  ...values,
                  validityDays: on
                    ? Number(days) || DEFAULT_VALIDITY_DAYS
                    : null,
                })
              }
            />
          </div>
        </div>
      )}

      {values.required && !hasEvaluation && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Cadastre abaixo um item do tipo &quot;Avaliação&quot;, para a
          assistente saber o que agendar primeiro.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !dirty}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}
