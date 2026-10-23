"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Loader2, UserPlus } from "lucide-react";

import { Field, FormAlert, PasswordStrength } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import {
  inviteSignUpSchema,
  type InviteSignUpInput,
} from "@/lib/auth/validation";
import { zodResolver } from "@/lib/auth/zod-resolver";

import { acceptWithCurrentAccount, acceptWithNewAccount } from "./actions";

/** Cria a conta com o e-mail do convite e já entra no painel. */
export function InviteSignUpForm({
  token,
  email,
  fullName,
}: {
  token: string;
  email: string;
  fullName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InviteSignUpInput>({
    resolver: zodResolver(inviteSignUpSchema),
    mode: "onTouched",
    defaultValues: { fullName, password: "", confirm: "" },
  });
  const password = useWatch({ control, name: "password" });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await acceptWithNewAccount(token, values);
      if (result && !result.ok) setError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormAlert message={error} />
      <Field label="E-mail" value={email} readOnly disabled />
      <Field
        label="Seu nome"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <Field
        label="Crie uma senha"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        hint={<PasswordStrength value={password} />}
        {...register("password")}
      />
      <Field
        label="Repita a senha"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register("confirm")}
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        Criar conta e entrar
      </Button>
    </form>
  );
}

/** Já logada com o e-mail certo: um clique para entrar na equipe. */
export function AcceptButton({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-4">
      <FormAlert message={error} />
      <p className="text-sm text-muted-foreground">
        Você está usando a conta <strong>{email}</strong>.
      </p>
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptWithCurrentAccount(token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        Aceitar e abrir o painel
      </Button>
    </div>
  );
}
