"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  ExternalLink,
  Feather,
  KeyRound,
  Loader2,
  Settings2,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";

import {
  connectClinicaExperts,
  disconnectClinicaExperts,
  saveClinicaExpertsProfessionals,
  setClinicaExpertsAgenda,
} from "@/app/(painel)/painel/agenda/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CeProfessional } from "@/lib/clinica-experts/client";
import { cn } from "@/lib/utils";

import { PanelCard } from "./page";
import { selectClassName } from "./template-send-dialog";

type Status = "em-uso" | "conectado" | "atencao" | "disponivel" | "em-breve";

const STATUS: Record<Status, { label: string; className: string }> = {
  "em-uso": {
    label: "Em uso",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  conectado: {
    label: "Conectado",
    className: "bg-primary/10 text-primary",
  },
  atencao: {
    label: "Conectar de novo",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  disponivel: {
    label: "Disponível",
    className: "bg-muted text-muted-foreground",
  },
  "em-breve": {
    label: "Em breve",
    className: "bg-muted text-muted-foreground",
  },
};

function SystemCard({
  logo,
  name,
  description,
  status,
  children,
}: {
  logo: React.ReactNode;
  name: string;
  description: string;
  status: Status;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-5 shadow-sm",
        status === "em-uso" && "border-emerald-500/40",
        status === "em-breve" && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {logo}
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase",
            STATUS[status].className,
          )}
        >
          {STATUS[status].label}
        </span>
      </div>
      <h3 className="mt-4 font-display font-semibold">{name}</h3>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const Logo = ({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) => (
  <span
    className={cn(
      "flex size-12 shrink-0 items-center justify-center rounded-xl font-display text-lg font-bold text-white",
      className,
    )}
  >
    {children}
  </span>
);

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

/** Os sistemas que a clínica pode conectar, em cartões: um botão para cada. */
export function AgendaSystems({
  google,
  clinicaExperts,
}: {
  google: { ready: boolean; connected: boolean; inUse: boolean };
  clinicaExperts: { connected: boolean; broken: boolean; inUse: boolean };
}) {
  const [connectOpen, setConnectOpen] = useState(false);
  const googleStatus: Status = google.inUse
    ? "em-uso"
    : google.connected
      ? "conectado"
      : "disponivel";
  const ceStatus: Status = clinicaExperts.broken
    ? "atencao"
    : clinicaExperts.inUse
      ? "em-uso"
      : clinicaExperts.connected
        ? "conectado"
        : "disponivel";

  return (
    <div className="space-y-8">
      <Section title="Calendário">
        <SystemCard
          logo={
            <Logo className="bg-[#1a73e8]">
              <CalendarDays className="size-6" />
            </Logo>
          }
          name="Google Agenda"
          description="A assistente vê os horários livres e marca no calendário de cada profissional."
          status={googleStatus}
        >
          {google.connected ? (
            <Button asChild variant="outline" className="flex-1">
              <a href="#google">
                <Settings2 />
                Configurar
              </a>
            </Button>
          ) : google.ready ? (
            <Button asChild className="flex-1">
              {/* Rota de servidor: sai para o Google e volta. */}
              <a href="/api/google/conectar">
                Conectar
                <ArrowRight />
              </a>
            </Button>
          ) : (
            <Button disabled className="flex-1">
              Indisponível no momento
            </Button>
          )}
        </SystemCard>
      </Section>

      <Section title="Gestão da clínica">
        <SystemCard
          logo={<Logo className="bg-[#7c3aed]">CE</Logo>}
          name="Clínica Experts"
          description="A assistente consulta os horários, marca e cancela direto na agenda do Clínica Experts."
          status={ceStatus}
        >
          {clinicaExperts.connected && !clinicaExperts.broken ? (
            <Button asChild variant="outline" className="flex-1">
              <a href="#clinica-experts">
                <Settings2 />
                Configurar
              </a>
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => setConnectOpen(true)}>
              {clinicaExperts.broken ? "Conectar de novo" : "Conectar"}
              <ArrowRight />
            </Button>
          )}
        </SystemCard>
        <SystemCard
          logo={<Logo className="bg-[#f05a28]">C</Logo>}
          name="Clinicorp"
          description="Sincronize a agenda com o Clinicorp."
          status="em-breve"
        >
          <Button disabled variant="outline" className="flex-1">
            Em breve
          </Button>
        </SystemCard>
        <SystemCard
          logo={
            <Logo className="bg-[#c9a227]">
              <Feather className="size-6" />
            </Logo>
          }
          name="Clínica Ryka"
          description="Sincronize pacientes e agendamentos com a Clínica Ryka."
          status="em-breve"
        >
          <Button disabled variant="outline" className="flex-1">
            Em breve
          </Button>
        </SystemCard>
      </Section>

      <ClinicaExpertsConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
      />
    </div>
  );
}

/** O modal da chave: passo a passo, campo para colar e o teste na hora de salvar. */
function ClinicaExpertsConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await connectClinicaExperts(key);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível conectar.");
        return;
      }
      toast.success(
        "Clínica Experts conectado ✅ Agora ligue os profissionais.",
      );
      setKey("");
      onOpenChange(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setError(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Conectar com o Clínica Experts</DialogTitle>
        <DialogDescription>
          A LumenzIA usa a chave de API da sua conta para ver os horários livres
          e marcar os agendamentos.
        </DialogDescription>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Entre no seu painel do Clínica Experts.</li>
          <li>
            Vá em <strong className="text-foreground">Configurações</strong> e
            abra a aba <strong className="text-foreground">Integrações</strong>.
          </li>
          <li>Crie uma chave de API (ou copie a que já existe).</li>
          <li>Cole a chave abaixo e clique em Testar e salvar.</li>
        </ol>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="ce-key">Chave de API</Label>
            <Input
              id="ce-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Cole aqui a chave do Clínica Experts"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(error)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="size-3.5" />A chave fica guardada
              criptografada e nunca aparece de novo no painel.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a
              href="https://clinicaexperts.readme.io/reference/introduction"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Ajuda do Clínica Experts
              <ExternalLink className="size-3" />
            </a>
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={pending || key.trim().length < 10}
              >
                {pending && <Loader2 className="animate-spin" />}
                Testar e salvar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ProfessionalItem = {
  id: string;
  name: string;
  value: string | null;
  ceName: string;
};

/** Depois de conectado: ligar os profissionais, usar ou não, desconectar. */
export function ClinicaExpertsSettings({
  inUse,
  error,
  ceProfessionals,
  main,
  professionals,
}: {
  inUse: boolean;
  error: string | null;
  ceProfessionals: CeProfessional[];
  main: { value: string | null; name: string };
  professionals: ProfessionalItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mainValue, setMainValue] = useState(main.value ?? "");
  const [byProfessional, setByProfessional] = useState<Record<string, string>>(
    () => Object.fromEntries(professionals.map((p) => [p.id, p.value ?? ""])),
  );
  const dirty =
    mainValue !== (main.value ?? "") ||
    professionals.some((p) => (byProfessional[p.id] ?? "") !== (p.value ?? ""));
  const anyChosen =
    Boolean(main.value) || professionals.some((p) => Boolean(p.value));

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    success?: string,
    after?: () => void,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
      else {
        if (success) toast.success(success);
        after?.();
      }
    });

  const select = (
    id: string,
    value: string,
    onChange: (v: string) => void,
    saved: string | null,
    savedName: string,
  ) => (
    <select
      id={id}
      className={selectClassName}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Nenhum</option>
      {saved && !ceProfessionals.some((p) => p.uuid === saved) && (
        <option value={saved}>
          {savedName || "Profissional salvo"} (indisponível)
        </option>
      )}
      {ceProfessionals.map((p) => (
        <option key={p.uuid} value={p.uuid}>
          {p.name}
        </option>
      ))}
    </select>
  );

  // Sugestão pelo nome: o profissional daqui com o mesmo nome de lá.
  const suggest = () => {
    const fold = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    setByProfessional((current) =>
      Object.fromEntries(
        professionals.map((p) => [
          p.id,
          current[p.id] ||
            ceProfessionals.find((c) => fold(c.name) === fold(p.name))?.uuid ||
            "",
        ]),
      ),
    );
  };

  return (
    <div id="clinica-experts" className="scroll-mt-24 space-y-6">
      <PanelCard
        title="Clínica Experts"
        description="Ligue cada profissional da LumenzIA ao mesmo profissional no Clínica Experts. O principal vale para quando a pessoa não escolhe um profissional."
      >
        {error ? (
          <p className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            {error}
          </p>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            Conectado. {ceProfessionals.length}{" "}
            {ceProfessionals.length === 1
              ? "profissional encontrado"
              : "profissionais encontrados"}{" "}
            no Clínica Experts.
          </p>
        )}
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                saveClinicaExpertsProfessionals({
                  main: mainValue || null,
                  professionals: Object.fromEntries(
                    professionals.map((p) => [
                      p.id,
                      byProfessional[p.id] || null,
                    ]),
                  ),
                }),
              "Profissionais salvos.",
            );
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="ce-main">Profissional principal</Label>
            {select("ce-main", mainValue, setMainValue, main.value, main.name)}
          </div>
          {professionals.map((p) => (
            <div key={p.id} className="grid gap-2">
              <Label htmlFor={`ce-${p.id}`}>{p.name}</Label>
              {select(
                `ce-${p.id}`,
                byProfessional[p.id] ?? "",
                (v) => setByProfessional({ ...byProfessional, [p.id]: v }),
                p.value,
                p.ceName,
              )}
            </div>
          ))}
          {!professionals.length && (
            <p className="text-sm text-muted-foreground">
              Para escolher por profissional, cadastre os profissionais em{" "}
              <Link
                href="/painel/profissionais"
                className="text-primary underline-offset-4 hover:underline"
              >
                Profissionais
              </Link>
              .
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              {professionals.length > 0 && (
                <Button type="button" variant="ghost" onClick={suggest}>
                  Ligar pelo nome
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Unplug />
                Desconectar
              </Button>
            </div>
            <Button type="submit" disabled={pending || !dirty}>
              {pending && <Loader2 className="animate-spin" />}
              Salvar profissionais
            </Button>
          </div>
        </form>
      </PanelCard>

      <PanelCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="use-ce" className="flex items-center gap-2">
              <CalendarCheck className="size-4 text-primary" />A assistente usa
              o Clínica Experts
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Ligado, ela consulta os horários livres, marca e cancela no
              Clínica Experts, e os lembretes passam a sair. Se o Google Agenda
              estiver ligado, ele é desligado.
            </p>
          </div>
          <Switch
            id="use-ce"
            checked={inUse}
            disabled={pending || (!inUse && (!anyChosen || dirty))}
            onCheckedChange={(on) =>
              run(
                () => setClinicaExpertsAgenda(on),
                on ? "Clínica Experts ligado." : "Clínica Experts desligado.",
              )
            }
          />
        </div>
      </PanelCard>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Desconectar o Clínica Experts?</DialogTitle>
          <DialogDescription>
            A chave é apagada da LumenzIA e a assistente para de marcar no
            Clínica Experts. Os agendamentos já feitos continuam lá.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => disconnectClinicaExperts(),
                  "Clínica Experts desconectado.",
                  () => setConfirmOpen(false),
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Desconectar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
