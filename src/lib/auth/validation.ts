import { z } from "zod";

/** Regras dos formulários de conta, usadas no navegador (erros na hora) e no servidor. */
const email = z
  .string()
  .trim()
  .min(1, "Informe seu e-mail.")
  .pipe(z.email("E-mail inválido."));

const password = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Informe sua senha."),
});

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(120, "Nome muito longo."),
  clinicName: z
    .string()
    .trim()
    .min(2, "Informe o nome da clínica.")
    .max(120, "Nome muito longo."),
  phone: z
    .string()
    .trim()
    .refine((v) => {
      const digits = v.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 13;
    }, "Informe um WhatsApp com DDD."),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "As senhas não conferem.",
  });

/** Conta criada pelo link de convite da equipe (o e-mail vem do convite). */
export const inviteSignUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Informe seu nome.")
      .max(120, "Nome muito longo."),
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "As senhas não conferem.",
  });

export type InviteSignUpInput = z.infer<typeof inviteSignUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Resultado de uma Server Action de formulário. */
export type FormResult =
  { ok: true; message?: string } | { ok: false; error: string };
