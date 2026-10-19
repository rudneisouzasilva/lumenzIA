import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AuthHeading } from "@/components/auth/auth-heading";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Esqueceu a senha?"
        description="Informe o e-mail da conta e enviamos um link para criar uma nova."
      />
      <ForgotPasswordForm />
      <Link
        href="/entrar"
        className="mt-8 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para o login
      </Link>
    </>
  );
}
