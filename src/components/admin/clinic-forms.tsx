"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  CalendarCog,
  FileText,
  LayoutDashboard,
  Loader2,
  ScrollText,
  Smartphone,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";

import {
  adminDisconnectWhatsapp,
  saveClinicAgenda,
  saveClinicTemplates,
  saveClinicWhatsapp,
  setClinicAssistant,
} from "@/app/(admin)/admin/actions";
import { Field } from "@/components/auth/field";
import {
  SaveButton,
  TextareaField,
  useSave,
} from "@/components/painel/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@/lib/auth/zod-resolver";
import {
  agendaSchema,
  templatesSchema,
  whatsappTechSchema,
  type Agenda,
  type Templates,
  type WhatsappTech,
} from "@/lib/admin/validation";
import { cn } from "@/lib/utils";

/** Abas da ficha da clínica. Visão geral e auditoria chegam prontas do servidor. */
export function ClinicTabs({
  overview,
  whatsapp,
  templates,
  agenda,
  audit,
}: Record<
  "overview" | "whatsapp" | "templates" | "agenda" | "audit",
  React.ReactNode
>) {
  return (
    <Tabs defaultValue="geral">
      <TabsList>
        <TabsTrigger value="geral">
          <LayoutDashboard />
          Visão geral
        </TabsTrigger>
        <TabsTrigger value="whatsapp">
          <Smartphone />
          WhatsApp
        </TabsTrigger>
        <TabsTrigger value="templates">
          <FileText />
          Templates
        </TabsTrigger>
        <TabsTrigger value="agenda">
          <CalendarCog />
          Agenda
        </TabsTrigger>
        <TabsTrigger value="auditoria">
          <ScrollText />
          Auditoria
        </TabsTrigger>
      </TabsList>
      <TabsContent value="geral">{overview}</TabsContent>
      <TabsContent value="whatsapp">{whatsapp}</TabsContent>
      <TabsContent value="templates">{templates}</TabsContent>
      <TabsContent value="agenda">{agenda}</TabsContent>
      <TabsContent value="auditoria">{audit}</TabsContent>
    </Tabs>
  );
}

function SecretHint({ stored }: { stored: boolean }) {
  return stored ? (
    <span className="text-emerald-600 dark:text-emerald-400">
      Guardado no Vault. Deixe em branco para manter.
    </span>
  ) : (
    <span>Nada guardado ainda.</span>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function WhatsappTechForm({
  clinicId,
  initial,
  tokenStored,
}: {
  clinicId: string;
  initial: WhatsappTech;
  tokenStored: boolean;
}) {
  const form = useForm<WhatsappTech>({
    resolver: zodResolver(whatsappTechSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave((v: WhatsappTech) =>
    saveClinicWhatsapp(clinicId, v),
  );
  const removeToken = useWatch({ control: form.control, name: "removeToken" });
  const errors = form.formState.errors;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () =>
          form.reset({ ...values, token: "", removeToken: false }),
        ),
      )}
      className="grid gap-5"
    >
      <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        O normal é a própria clínica conectar pelo botão “Conectar WhatsApp”.
        Use estes campos só para corrigir uma conexão ou ligar um número
        manualmente. Trocar o Phone Number ID pausa a assistente.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone Number ID"
          inputMode="numeric"
          error={errors.phoneNumberId?.message}
          {...form.register("phoneNumberId")}
        />
        <Field
          label="WABA ID (conta do WhatsApp Business)"
          inputMode="numeric"
          error={errors.wabaId?.message}
          {...form.register("wabaId")}
        />
        <Field
          label="Número exibido"
          placeholder="+55 11 99999-0000"
          error={errors.displayPhone?.message}
          {...form.register("displayPhone")}
        />
        <Field
          label="WhatsApp da equipe (avisos)"
          placeholder="5511999990000"
          hint="Recebe o aviso de “precisa de atendimento humano”."
          error={errors.staffPhone?.message}
          {...form.register("staffPhone")}
        />
      </div>
      <Field
        label="Token de acesso"
        type="password"
        autoComplete="off"
        disabled={removeToken}
        placeholder={tokenStored ? "••••••••" : "EAAG…"}
        hint={<SecretHint stored={tokenStored} />}
        error={errors.token?.message}
        {...form.register("token")}
      />
      {tokenStored && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register("removeToken")} />
          Apagar o token guardado
        </label>
      )}
      <SaveButton
        pending={pending}
        saved={saved}
        dirty={form.formState.isDirty}
      />
    </form>
  );
}

export function TemplatesForm({
  clinicId,
  initial,
}: {
  clinicId: string;
  initial: Templates;
}) {
  const form = useForm<Templates>({
    resolver: zodResolver(templatesSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave((v: Templates) =>
    saveClinicTemplates(clinicId, v),
  );
  const errors = form.formState.errors;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () => form.reset(values)),
      )}
      className="grid gap-5"
    >
      <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        Templates aprovados na conta do WhatsApp Business da clínica, usados
        fora da janela de 24 horas. O nome e a quantidade de variáveis precisam
        bater com o aprovado na Meta.
      </p>
      <Field
        label="Lembrete de agendamento"
        placeholder="lembrete_agendamento"
        hint="Variáveis: {{1}} primeiro nome do paciente, {{2}} data e hora."
        error={errors.reminderTemplate?.message}
        {...form.register("reminderTemplate")}
      />
      <Field
        label="Aviso à equipe"
        placeholder="aviso_atendimento"
        hint="Variáveis: {{1}} contato (ou assunto do aviso), {{2}} mensagem do paciente."
        error={errors.staffAlertTemplate?.message}
        {...form.register("staffAlertTemplate")}
      />
      <Field
        label="Idioma dos templates"
        className="sm:max-w-48"
        error={errors.language?.message}
        {...form.register("language")}
      />
      <SaveButton
        pending={pending}
        saved={saved}
        dirty={form.formState.isDirty}
      />
    </form>
  );
}

export function AgendaForm({
  clinicId,
  initial,
  apiKeyStored,
}: {
  clinicId: string;
  initial: Agenda;
  apiKeyStored: boolean;
}) {
  const form = useForm<Agenda>({
    resolver: zodResolver(agendaSchema),
    defaultValues: initial,
  });
  const { pending, saved, save } = useSave((v: Agenda) =>
    saveClinicAgenda(clinicId, v),
  );
  const [mode, enabled, actionsConfig, removeApiKey] = useWatch({
    control: form.control,
    name: ["mode", "enabled", "actionsConfig", "removeApiKey"],
  });
  const errors = form.formState.errors;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        save(values, () =>
          form.reset({ ...values, apiKey: "", removeApiKey: false }),
        ),
      )}
      className="grid gap-5"
    >
      <SwitchRow
        id="agenda-enabled"
        label="Agenda conectada"
        hint="Ligada, a assistente consulta e marca horários, e os lembretes passam a sair."
        checked={enabled}
        onChange={(v) => form.setValue("enabled", v, { shouldDirty: true })}
      />
      <Field
        label="Sistema da clínica"
        placeholder="Google Agenda, Clínica Experts…"
        error={errors.providerName?.message}
        {...form.register("providerName")}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Modo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                value: "webhook",
                title: "Webhook",
                text: "Um POST com { action, ... } para o Zapier, Make ou n8n.",
              },
              {
                value: "custom",
                title: "API própria",
                text: "Método, URL, cabeçalhos e corpo por ação, com {{variáveis}}.",
              },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              onClick={() =>
                form.setValue("mode", option.value, { shouldDirty: true })
              }
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                mode === option.value
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent/50",
              )}
            >
              <p className="text-sm font-medium">{option.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {option.text}
              </p>
            </button>
          ))}
        </div>
      </fieldset>
      {mode === "webhook" ? (
        <Field
          label="Endereço do webhook"
          placeholder="https://hook.us1.make.com/…"
          error={errors.webhookUrl?.message}
          {...form.register("webhookUrl")}
        />
      ) : (
        <TextareaField
          label="Ações (JSON)"
          hint={
            <>
              Uma chave por ação (consultar_disponibilidade, criar_agendamento,
              consultar_agendamentos, cancelar_agendamento, listar_agendamentos)
              com method, url, headers e body. Use <code>{"{{apiKey}}"}</code> e{" "}
              <code>{"{{calendarId}}"}</code>.
            </>
          }
          className="[&_textarea]:min-h-64 [&_textarea]:font-mono [&_textarea]:text-xs"
          maxLength={20000}
          value={actionsConfig}
          error={errors.actionsConfig?.message}
          spellCheck={false}
          {...form.register("actionsConfig")}
        />
      )}
      <Field
        label="Chave da API"
        type="password"
        autoComplete="off"
        disabled={removeApiKey}
        placeholder={
          apiKeyStored
            ? "••••••••"
            : "Token, ou o JSON da conta de serviço do Google"
        }
        hint={<SecretHint stored={apiKeyStored} />}
        error={errors.apiKey?.message}
        {...form.register("apiKey")}
      />
      {apiKeyStored && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register("removeApiKey")} />
          Apagar a chave guardada
        </label>
      )}
      <SaveButton
        pending={pending}
        saved={saved}
        dirty={form.formState.isDirty}
      />
    </form>
  );
}

/** Liga/pausa a assistente pela equipe (registrado na auditoria). */
export function AdminAssistantToggle({
  clinicId,
  active,
  connected,
}: {
  clinicId: string;
  active: boolean;
  connected: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(active);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={optimistic}
      disabled={!connected || pending}
      aria-label="Assistente respondendo no WhatsApp"
      onCheckedChange={(value) =>
        startTransition(async () => {
          setOptimistic(value);
          const result = await setClinicAssistant(clinicId, value);
          if (!result.ok) toast.error(result.error);
          else
            toast.success(value ? "Assistente ligada." : "Assistente pausada.");
        })
      }
    />
  );
}

export function AdminDisconnectButton({ clinicId }: { clinicId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Unplug />
        Desconectar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Desconectar o WhatsApp desta clínica?</DialogTitle>
          <DialogDescription>
            Cancela a inscrição nos avisos da conta, apaga o token e o PIN do
            Vault e pausa a assistente. A clínica pode conectar de novo pelo
            painel dela.
          </DialogDescription>
          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await adminDisconnectWhatsapp(clinicId);
                  setOpen(false);
                  if (!result.ok) toast.error(result.error);
                  else toast.success("WhatsApp desconectado.");
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Desconectar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
