"use client";

import { useForm, useWatch } from "react-hook-form";
import { motion } from "motion/react";
import type { z } from "zod";

import { saveHours } from "@/app/(painel)/painel/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { zodResolver } from "@/lib/auth/zod-resolver";
import { hoursSchema } from "@/lib/painel/validation";
import { cn } from "@/lib/utils";

import { FieldError, SaveButton, TextareaField, useSave } from "./form-parts";

export type Hours = z.infer<typeof hoursSchema>;

const DAYS = [
  { value: 1, short: "Seg", long: "segunda" },
  { value: 2, short: "Ter", long: "terça" },
  { value: 3, short: "Qua", long: "quarta" },
  { value: 4, short: "Qui", long: "quinta" },
  { value: 5, short: "Sex", long: "sexta" },
  { value: 6, short: "Sáb", long: "sábado" },
  { value: 7, short: "Dom", long: "domingo" },
];

export function HoursForm({
  initial,
  submitLabel,
  onSaved,
}: {
  initial: Hours;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const form = useForm<Hours>({
    resolver: zodResolver(hoursSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave(saveHours);
  const [days, worksOnHolidays, extraClosedDates] = useWatch({
    control: form.control,
    name: ["workDays", "worksOnHolidays", "extraClosedDates"],
  });
  const errors = form.formState.errors;

  const toggleDay = (day: number) => {
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort();
    form.setValue("workDays", next, { shouldDirty: true });
  };

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => {
          form.reset(values);
          onSaved?.();
        }),
      )}
      className="grid gap-7"
    >
      <fieldset>
        <legend className="mb-3 text-sm font-medium">
          Dias de atendimento
        </legend>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {DAYS.map((d) => {
            const on = days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={on}
                aria-label={d.long}
                onClick={() => toggleDay(d.value)}
                className={cn(
                  "relative h-12 overflow-hidden rounded-xl border text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  on
                    ? "border-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                {on && (
                  <motion.span
                    aria-hidden
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute inset-0 bg-primary"
                  />
                )}
                <span className="relative">{d.short}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="start">Abre às</Label>
          <Input id="start" type="time" {...form.register("start")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="end">Fecha às</Label>
          <Input
            id="end"
            type="time"
            aria-invalid={errors.end ? true : undefined}
            {...form.register("end")}
          />
          <FieldError message={errors.end?.message} />
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div>
          <Label htmlFor="holidays">Abre nos feriados nacionais</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Os feriados nacionais são calculados sozinhos, inclusive Carnaval e
            Corpus Christi.
          </p>
        </div>
        <Switch
          id="holidays"
          checked={worksOnHolidays}
          onCheckedChange={(v) =>
            form.setValue("worksOnHolidays", v, { shouldDirty: true })
          }
        />
      </div>

      <TextareaField
        label="Outros dias fechados"
        hint="Feriados da cidade, recesso, férias coletivas… Escreva do seu jeito."
        placeholder="Ex.: 20/01 (padroeiro da cidade); recesso de 24/12 a 02/01."
        className="[&_textarea]:min-h-20"
        maxLength={2000}
        value={extraClosedDates}
        error={errors.extraClosedDates?.message}
        {...form.register("extraClosedDates")}
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
