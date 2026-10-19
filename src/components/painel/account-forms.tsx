"use client";

import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import {
  changePassword,
  saveClinicName,
  saveProfile,
} from "@/app/(painel)/painel/actions";
import { Field, PasswordStrength } from "@/components/auth/field";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/auth/validation";
import { zodResolver } from "@/lib/auth/zod-resolver";
import { clinicNameSchema, profileSchema } from "@/lib/painel/validation";

import { SaveButton, useSave } from "./form-parts";

type Profile = z.infer<typeof profileSchema>;

export function ProfileForm({
  initial,
  email,
}: {
  initial: Profile;
  email: string;
}) {
  const form = useForm<Profile>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave(saveProfile);
  const errors = form.formState.errors;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => form.reset(values)),
      )}
      className="grid gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Seu nome"
          autoComplete="name"
          error={errors.fullName?.message}
          {...form.register("fullName")}
        />
        <Field
          label="WhatsApp"
          type="tel"
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          error={errors.phone?.message}
          {...form.register("phone")}
        />
      </div>
      <Field
        label="E-mail de acesso"
        value={email}
        readOnly
        disabled
        hint={
          <p className="text-xs text-muted-foreground">
            Para trocar o e-mail, fale com a equipe LumenzIA.
          </p>
        }
      />
      <SaveButton
        pending={pending}
        saved={saved}
        dirty={form.formState.isDirty}
      />
    </form>
  );
}

type ClinicName = z.infer<typeof clinicNameSchema>;

export function ClinicNameForm({
  initial,
  canEdit,
}: {
  initial: ClinicName;
  canEdit: boolean;
}) {
  const form = useForm<ClinicName>({
    resolver: zodResolver(clinicNameSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave(saveClinicName);

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => form.reset(values)),
      )}
      className="grid gap-5"
    >
      <Field
        label="Nome da clínica"
        disabled={!canEdit}
        error={form.formState.errors.name?.message}
        hint={
          !canEdit && (
            <p className="text-xs text-muted-foreground">
              Só a dona da conta pode mudar o nome.
            </p>
          )
        }
        {...form.register("name")}
      />
      {canEdit && (
        <SaveButton
          pending={pending}
          saved={saved}
          dirty={form.formState.isDirty}
        />
      )}
    </form>
  );
}

export function PasswordForm() {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { pending, save } = useSave(changePassword);
  const password = useWatch({ control: form.control, name: "password" });
  const errors = form.formState.errors;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => {
          form.reset({ password: "", confirm: "" });
          toast.success("Senha alterada.");
        }),
      )}
      className="grid gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          hint={<PasswordStrength value={password} />}
          {...form.register("password")}
        />
        <Field
          label="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...form.register("confirm")}
        />
      </div>
      <SaveButton
        pending={pending}
        saved={false}
        dirty={form.formState.isDirty}
      >
        Trocar senha
      </SaveButton>
    </form>
  );
}
