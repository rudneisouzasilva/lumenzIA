import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Crie uma nova senha"
        description="Escolha uma senha que você não use em outros sites."
      />
      <ResetPasswordForm />
    </>
  );
}
