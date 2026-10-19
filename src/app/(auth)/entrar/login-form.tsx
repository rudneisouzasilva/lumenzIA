"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

import { Field, FormAlert } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { signInSchema, type SignInInput } from "@/lib/auth/validation";
import { zodResolver } from "@/lib/auth/zod-resolver";

import { signIn } from "../actions";

const linkErrors: Record<string, string> = {
  link: "Esse link de confirmação é inválido ou já foi usado. Tente entrar; se não conseguir, cadastre-se de novo.",
  "link-senha":
    "Esse link de redefinição expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? undefined;
  const [error, setError] = useState<string | null>(
    linkErrors[searchParams.get("erro") ?? ""] ?? null,
  );
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: "onTouched",
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await signIn(values, next);
      if (result && !result.ok) setError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormAlert message={error} />
      <Field
        label="E-mail"
        type="email"
        autoComplete="email"
        placeholder="voce@suaclinica.com.br"
        error={errors.email?.message}
        {...register("email")}
      />
      <Field
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        labelAside={
          <Link
            href="/recuperar-senha"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Esqueci minha senha
          </Link>
        }
        {...register("password")}
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending && <Loader2 className="animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
