"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { Loader2, MailCheck, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Field, FormAlert, PasswordStrength } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { signUpSchema, type SignUpInput } from "@/lib/auth/validation";
import { zodResolver } from "@/lib/auth/zod-resolver";

import { signUp } from "../actions";

type PlanOption = { code: string; name: string; priceCents: number };

/** (13) 99737-9065 enquanto a pessoa digita. */
function maskPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function SignUpForm({ plans }: { plans: PlanOption[] }) {
  const planCode = useSearchParams().get("plano") ?? undefined;
  const plan = plans.find((p) => p.code === planCode);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      clinicName: "",
      phone: "",
      email: "",
      password: "",
    },
  });
  const phone = register("phone");

  const password = useWatch({ control, name: "password" });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await signUp(values, plan?.code);
      if (!result) return;
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
          className="rounded-2xl border bg-card p-8 text-center shadow-sm"
        >
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <MailCheck className="size-7" />
          </motion.span>
          <h2 className="mt-5 font-display text-xl font-semibold">
            Confira seu e-mail
          </h2>
          <p className="mt-2 text-muted-foreground">
            Enviamos um link de confirmação para{" "}
            <strong className="text-foreground">{sentTo}</strong>. Clique nele
            para ativar a conta e escolher o plano.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Não chegou? Veja a caixa de spam ou{" "}
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              corrija o e-mail
            </button>
            .
          </p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          exit={{ opacity: 0, scale: 0.98 }}
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5"
        >
          {plan && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Plano escolhido: <strong>{plan.name}</strong>
              </span>
              <span className="text-muted-foreground">
                {formatPrice(plan.priceCents)}/mês
              </span>
            </div>
          )}
          <FormAlert message={error} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Seu nome"
              autoComplete="name"
              error={errors.fullName?.message}
              {...register("fullName")}
            />
            <Field
              label="Nome da clínica"
              autoComplete="organization"
              error={errors.clinicName?.message}
              {...register("clinicName")}
            />
          </div>
          <Field
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(11) 99999-9999"
            error={errors.phone?.message}
            {...phone}
            onChange={(e) => {
              e.target.value = maskPhone(e.target.value);
              return phone.onChange(e);
            }}
          />
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
            autoComplete="new-password"
            error={errors.password?.message}
            hint={<PasswordStrength value={password} />}
            {...register("password")}
          />
          <Button type="submit" size="lg" disabled={pending} className="mt-1">
            {pending && <Loader2 className="animate-spin" />}
            Criar conta
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Ao criar a conta você concorda com a{" "}
            <Link href="/privacidade" className="underline underline-offset-4">
              política de privacidade
            </Link>
            .
          </p>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
