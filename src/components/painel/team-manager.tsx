"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Copy,
  Crown,
  Loader2,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";

import {
  cancelInvite,
  inviteMember,
  removeMember,
  saveMemberAreas,
} from "@/app/(painel)/painel/equipe/actions";
import { Field } from "@/components/auth/field";
import { FieldError } from "@/components/painel/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AREA_KEYS, AREAS, areaForPath, type Area } from "@/lib/painel/areas";
import { inviteSchema } from "@/lib/painel/team";
import { cn } from "@/lib/utils";

import { NAV_SECTIONS } from "./nav";

/** As áreas agrupadas como no menu, com o ícone de cada item. */
const GROUPS = NAV_SECTIONS.map((section) => ({
  title: section.title,
  items: section.items.flatMap((item) => {
    const area = areaForPath(item.href);
    return area ? [{ area, icon: item.icon }] : [];
  }),
})).filter((g) => g.items.length > 0);

const date = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const summary = (areas: Area[] | null) =>
  areas === null
    ? "Todas as telas"
    : areas.length === 0
      ? "Nenhuma tela"
      : areas.map((a) => AREAS[a].label).join(", ");

/** Caixas de seleção das telas, agrupadas como no menu. */
function AreaPicker({
  value,
  onChange,
}: {
  value: Area[];
  onChange: (areas: Area[]) => void;
}) {
  const all = value.length === AREA_KEYS.length;
  const toggle = (area: Area) =>
    onChange(
      value.includes(area) ? value.filter((a) => a !== area) : [...value, area],
    );
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Telas que a pessoa pode abrir</p>
        <button
          type="button"
          onClick={() => onChange(all ? [] : [...AREA_KEYS])}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {all ? "Desmarcar todas" : "Marcar todas"}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <fieldset key={group.title} className="grid gap-1.5">
            <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group.title}
            </legend>
            {group.items.map(({ area, icon: Icon }) => {
              const checked = value.includes(area);
              return (
                <label
                  key={area}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "hover:bg-accent/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(area)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <Icon className="size-4 text-muted-foreground" />
                  {AREAS[area].label}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Início e “Minha conta” são de todo mundo. Equipe e assinatura ficam só
        com você.
      </p>
    </div>
  );
}

/** Link pronto: copiar ou mandar pelo WhatsApp. */
function InviteLink({ link, emailed }: { link: string; emailed: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não deu para copiar. Selecione o link e copie.");
    }
  };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Oi! Este é o seu convite para a equipe na LumenzIA. Crie sua conta por aqui: ${link}`,
  )}`;
  return (
    <div className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
        {emailed
          ? "Convite criado e enviado por e-mail. Se preferir, mande o link também:"
          : "Convite criado. Mande este link para a pessoa:"}
      </p>
      <Input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Link do convite"
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copiado" : "Copiar link"}
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={whatsapp} target="_blank" rel="noopener">
            <MessageCircle />
            Enviar pelo WhatsApp
          </a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        O link vale 7 dias e só funciona com o e-mail convidado.
      </p>
    </div>
  );
}

export function InviteForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [areas, setAreas] = useState<Area[]>(["conversas"]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    link: string;
    emailed: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const input = { fullName, email, areas };
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    startTransition(async () => {
      const r = await inviteMember(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult({ link: r.link, emailed: r.emailed });
      setFullName("");
      setEmail("");
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nome"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ex.: Ana Souza"
          autoComplete="off"
        />
        <Field
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ana@exemplo.com"
          autoComplete="off"
        />
      </div>
      <AreaPicker value={areas} onChange={setAreas} />
      <FieldError message={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Criar convite
        </Button>
      </div>
      {result && <InviteLink {...result} />}
    </form>
  );
}

type PendingInvite = {
  id: string;
  fullName: string;
  email: string;
  areas: Area[];
  expiresAt: string;
};

export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  return (
    <ul className="divide-y rounded-xl border">
      {invites.map((invite) => (
        <PendingInviteRow key={invite.id} invite={invite} />
      ))}
    </ul>
  );
}

function PendingInviteRow({ invite }: { invite: PendingInvite }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    link: string;
    emailed: boolean;
  } | null>(null);
  const expired = Date.parse(invite.expiresAt) < new Date().getTime();

  const resend = () =>
    startTransition(async () => {
      const r = await inviteMember({
        fullName: invite.fullName,
        email: invite.email,
        areas: invite.areas,
      });
      if (r.ok) setResult({ link: r.link, emailed: r.emailed });
      else toast.error(r.error);
    });
  const cancel = () =>
    startTransition(async () => {
      const r = await cancelInvite(invite.id);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <li className="grid gap-3 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {invite.fullName}{" "}
            <span className="font-normal text-muted-foreground">
              · {invite.email}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {summary(invite.areas)} · {expired ? "venceu" : "vale até"}{" "}
            {date(invite.expiresAt)}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={resend}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            Novo link
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={cancel}
            aria-label="Cancelar convite"
            title="Cancelar convite"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {result && <InviteLink {...result} />}
    </li>
  );
}

type Member = {
  userId: string;
  fullName: string;
  email: string;
  owner: boolean;
  areas: Area[] | null;
  lastSignInAt: string | null;
};

export function MembersList({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  return (
    <ul className="divide-y rounded-xl border">
      {members.map((m) => (
        <MemberRow key={m.userId} member={m} me={m.userId === currentUserId} />
      ))}
    </ul>
  );
}

function MemberRow({ member, me }: { member: Member; me: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [areas, setAreas] = useState<Area[]>(member.areas ?? [...AREA_KEYS]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const r = await saveMemberAreas({ userId: member.userId, areas });
      if (!r.ok) setError(r.error);
      else {
        setEditing(false);
        toast.success("Telas atualizadas.");
      }
    });
  };
  const remove = () =>
    startTransition(async () => {
      const r = await removeMember(member.userId);
      if (!r.ok) toast.error(r.error);
      setConfirming(false);
    });

  return (
    <li className="grid gap-4 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
            {(member.fullName || "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-medium">
              {member.fullName || "Sem nome"}
              {me && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  (você)
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {member.email}
              {member.lastSignInAt &&
                ` · último acesso em ${date(member.lastSignInAt)}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {member.owner ? (
                <span className="inline-flex items-center gap-1">
                  <Crown className="size-3.5 text-glow" />
                  Dona da conta · todas as telas
                </span>
              ) : (
                summary(member.areas)
              )}
            </p>
          </div>
        </div>
        {!member.owner && !editing && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              <Pencil />
              Telas
            </Button>
            {confirming ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={remove}
                >
                  {pending && <Loader2 className="animate-spin" />}
                  Remover
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  Voltar
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(true)}
                aria-label="Remover da equipe"
                title="Remover da equipe"
              >
                <UserMinus />
              </Button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="grid gap-4 rounded-xl bg-muted/40 p-4">
          <AreaPicker value={areas} onChange={setAreas} />
          <FieldError message={error ?? undefined} />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setAreas(member.areas ?? [...AREA_KEYS]);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" disabled={pending} onClick={save}>
              {pending && <Loader2 className="animate-spin" />}
              Salvar telas
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
