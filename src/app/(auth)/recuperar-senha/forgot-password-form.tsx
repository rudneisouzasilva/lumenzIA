"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Loader2, MailCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Field, FormAlert } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/auth/validation";
import { zodResolver } from "@/lib/auth/zod-resolver";

import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onTouched",
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result.ok) setSentTo(values.email);
      else setError(result.error);
    });
  });

  return (
    <AnimatePresence mode="wait" initial={false}>
      {sentTo ? (
        <motion.div
          key="sent"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex gap-4 rounded-2xl border bg-card p-6 shadow-sm"
        >
          <MailCheck className="size-6 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Se houver uma conta com{" "}
            <strong className="text-foreground">{sentTo}</strong>, você vai
            receber em instantes um link para criar uma nova senha. Veja também
            a caixa de spam.
          </p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          exit={{ opacity: 0 }}
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5"
        >
          <FormAlert message={error} />
          <Field
            label="E-mail"
            type="email"
            autoComplete="email"
            placeholder="voce@suaclinica.com.br"
            error={errors.email?.message}
            {...register("email")}
          />
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Enviar link
          </Button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
