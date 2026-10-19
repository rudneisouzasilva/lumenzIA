import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading, FormSkeleton } from "@/components/auth/auth-heading";
import { getPlans } from "@/lib/data/plans";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  const plans = await getPlans();

  return (
    <>
      <AuthHeading
        title="Crie a conta da sua clínica"
        description="Leva menos de um minuto. Depois é só escolher o plano."
      />
      <Suspense fallback={<FormSkeleton fields={5} />}>
        <SignUpForm
          plans={plans.map(({ code, name, priceCents }) => ({
            code,
            name,
            priceCents,
          }))}
        />
      </Suspense>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link
          href="/entrar"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </>
  );
}
