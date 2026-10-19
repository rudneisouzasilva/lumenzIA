"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  labelAside?: React.ReactNode;
};

/** Campo de formulário com rótulo e erro animado (para usar com o register do React Hook Form). */
export function Field({
  label,
  error,
  hint,
  labelAside,
  className,
  type,
  ...props
}: FieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(isPassword && "pr-10")}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Esconder senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {visible ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        )}
      </div>
      {hint}
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="text-sm text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Barrinha que mostra se a senha está fraca, boa ou forte, conforme a pessoa digita. */
export function PasswordStrength({ value }: { value: string }) {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  const level = value ? Math.min(3, Math.ceil((score / 5) * 3)) : 0;
  const labels = ["", "Fraca", "Boa", "Forte"];
  const colors = ["", "bg-destructive", "bg-glow", "bg-emerald-500"];

  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="grid flex-1 grid-cols-3 gap-1.5">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <motion.div
              className={cn("h-full rounded-full", colors[level])}
              initial={false}
              animate={{ width: level >= step ? "100%" : "0%" }}
              transition={{ duration: 0.3 }}
            />
          </div>
        ))}
      </div>
      <span className="w-12 text-right text-xs text-muted-foreground">
        {labels[level]}
      </span>
    </div>
  );
}

/** Mensagem de erro geral do formulário (ex.: senha incorreta). */
export function FormAlert({ message }: { message?: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
