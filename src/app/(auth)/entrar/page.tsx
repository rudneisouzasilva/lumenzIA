import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading, FormSkeleton } from "@/components/auth/auth-heading";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <>
      <AuthHeading
        title="Que bom te ver de novo"
        description="Entre para acompanhar sua assistente e sua assinatura."
      />
      <Suspense fallback={<FormSkeleton />}>
        <LoginForm />
      </Suspense>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          href="/cadastro"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </>
  );
}
