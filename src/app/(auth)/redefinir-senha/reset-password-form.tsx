"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";

import { Field, FormAlert, PasswordStrength } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/auth/validation";
import { zodResolver } from "@/lib/auth/zod-resolver";

import { updatePassword } from "../actions";

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onTouched",
    defaultValues: { password: "", confirm: "" },
  });

  const password = useWatch({ control, name: "password" });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (result && !result.ok) setError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormAlert message={error} />
      <Field
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        hint={<PasswordStrength value={password} />}
        {...register("password")}
      />
      <Field
        label="Repita a nova senha"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register("confirm")}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Salvar nova senha
      </Button>
    </form>
  );
}
