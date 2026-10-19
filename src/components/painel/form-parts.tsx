"use client";

import { useId, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormResult } from "@/lib/auth/validation";
import { cn } from "@/lib/utils";

/**
 * Chama a Server Action de salvar, mostra o erro num aviso e marca "Salvo" quando dá certo.
 * `onSaved` costuma ser o reset do formulário, para ele deixar de estar "alterado".
 */
export function useSave<T>(action: (values: T) => Promise<FormResult>) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = (values: T, onSaved?: () => void) =>
    startTransition(async () => {
      const result = await action(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved(true);
      onSaved?.();
    });

  return { pending, saved, save };
}

/** Texto longo com rótulo, contador de caracteres e erro animado. */
export function TextareaField({
  label,
  hint,
  error,
  maxLength,
  value,
  className,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  maxLength: number;
  value?: string;
}) {
  const id = useId();
  const length = value?.length ?? 0;

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-end justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        <span
          className={cn(
            "text-xs text-muted-foreground tabular-nums",
            length > maxLength && "text-destructive",
          )}
        >
          {length.toLocaleString("pt-BR")}/{maxLength.toLocaleString("pt-BR")}
        </span>
      </div>
      {hint && <p className="-mt-1 text-sm text-muted-foreground">{hint}</p>}
      <Textarea
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          id={id}
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="text-sm text-destructive"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** Botão de salvar que mostra "Salvando…" e um check quando termina. */
export function SaveButton({
  pending,
  saved,
  dirty = true,
  children = "Salvar",
  className,
}: {
  pending: boolean;
  saved: boolean;
  dirty?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-end gap-3", className)}>
      <AnimatePresence>
        {saved && !dirty && (
          <motion.span
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
          >
            <Check className="size-4" />
            Salvo
          </motion.span>
        )}
      </AnimatePresence>
      <Button type="submit" disabled={pending || !dirty}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Salvando…" : children}
      </Button>
    </div>
  );
}
