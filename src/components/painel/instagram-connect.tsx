"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  Loader2,
  MessageCircle,
  PlugZap,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import {
  disconnectInstagram,
  setReplyComments,
} from "@/app/(painel)/painel/instagram/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type InstagramNotice = { ok: boolean; text: string };

export type InstagramAccount = {
  username: string;
  name: string;
  active: boolean;
  replyComments: boolean;
  error: string | null;
  connectedAt: string;
};

export function InstagramConnect({
  ready,
  isOwner,
  notice,
  account,
}: {
  /** O app da LumenzIA já tem o Instagram configurado. */
  ready: boolean;
  isOwner: boolean;
  notice: InstagramNotice | null;
  account: InstagramAccount | null;
}) {
  return (
    <div className="space-y-5">
      {notice && (
        <p
          role="status"
          className={cn(
            "rounded-xl px-4 py-3 text-sm",
            notice.ok
              ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "bg-amber-500/10 text-amber-800 dark:text-amber-200",
          )}
        >
          {notice.text}
        </p>
      )}
      {account ? (
        <Connected account={account} isOwner={isOwner} />
      ) : (
        <NotConnected ready={ready} isOwner={isOwner} />
      )}
    </div>
  );
}

function Connected({
  account,
  isOwner,
}: {
  account: InstagramAccount;
  isOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [replyComments, setOptimistic] = useOptimistic(account.replyComments);

  const toggleComments = (value: boolean) =>
    startTransition(async () => {
      setOptimistic(value);
      const result = await setReplyComments(value);
      if (!result.ok) toast.error(result.error);
      else
        toast.success(
          value
            ? "Pronto: quem comentar com uma dúvida recebe a resposta no Direct."
            : "A assistente não responde mais os comentários.",
        );
    });

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectInstagram();
      setConfirmOpen(false);
      if (!result.ok) toast.error(result.error);
      else toast.success("Instagram desconectado.");
    });

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex items-center gap-4 rounded-2xl border p-4",
          account.active
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-amber-500/30 bg-amber-500/10",
        )}
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full text-white",
            account.active
              ? "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]"
              : "bg-amber-500",
          )}
        >
          {account.active ? (
            <BadgeCheck className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold">
            {account.username ? `@${account.username}` : "Conta conectada"}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {account.active
              ? (account.name || "Conectado à LumenzIA") +
                ` · desde ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(account.connectedAt))}`
              : "A conexão expirou. Conecte de novo para a assistente voltar a responder."}
          </p>
        </div>
      </motion.div>

      {account.error && account.active && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Último aviso do Instagram: {account.error}
        </p>
      )}

      <div className="flex items-start justify-between gap-4 rounded-2xl border p-4">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <MessageCircle className="size-4 text-[#dd2a7b]" />
            Responder comentários no privado
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando alguém comenta num post com uma dúvida (“qual o valor?”), a
            assistente responde no Direct da pessoa. Elogios e marcações de
            amigos ficam sem resposta.
          </p>
        </div>
        <Switch
          checked={replyComments}
          disabled={!isOwner || !account.active || pending}
          aria-label="Responder comentários no privado"
          onCheckedChange={toggleComments}
        />
      </div>

      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>
          • As conversas do Instagram aparecem em Conversas, com o selo do
          Instagram, e entram no funil como as do WhatsApp.
        </li>
        <li>
          • Para agendar, a assistente pede o WhatsApp da pessoa: é por lá que
          vão a confirmação e o lembrete.
        </li>
        <li>
          • O Instagram só deixa a clínica responder até 24 horas depois da
          última mensagem da pessoa, e não tem mensagens prontas para puxar
          conversa.
        </li>
      </ul>

      <div className="flex flex-wrap gap-2">
        {isOwner && !account.active && (
          <Button asChild>
            <a href="/api/instagram/conectar">
              <PlugZap />
              Conectar de novo
            </a>
          </Button>
        )}
        {isOwner && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Unplug />
            Desconectar
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>Desconectar o Instagram?</DialogTitle>
          <DialogDescription>
            A assistente para de responder o Direct na hora. As conversas que já
            aconteceram continuam no painel, e dá para conectar de novo quando
            quiser.
          </DialogDescription>
          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={disconnect}
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

function NotConnected({
  ready,
  isOwner,
}: {
  ready: boolean;
  isOwner: boolean;
}) {
  return (
    <div className="space-y-6">
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "Conta profissional",
            text: "No app do Instagram: Configurações → Tipo de conta → mude para conta profissional, se ainda não for.",
          },
          {
            title: "Entre com o Instagram",
            text: "Use o login da conta da clínica e aceite as permissões de mensagens e comentários.",
          },
          {
            title: "Pronto",
            text: "As mensagens do Direct passam a chegar em Conversas, e a assistente responde quando está ligada.",
          },
        ].map((step, i) => (
          <li key={step.title} className="rounded-xl border p-4">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#dd2a7b]/10 text-sm font-semibold text-[#dd2a7b]">
              {i + 1}
            </span>
            <p className="mt-3 text-sm font-medium">{step.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>

      {!ready ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          A conexão com o Instagram está sendo preparada pela equipe LumenzIA e
          fica disponível aqui em breve.
        </p>
      ) : !isOwner ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Só a dona da conta da clínica pode conectar o Instagram.
        </p>
      ) : null}

      {ready && isOwner ? (
        <Button
          asChild
          size="lg"
          className="bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white hover:opacity-90"
        >
          <a href="/api/instagram/conectar">
            <Camera />
            Conectar com o Instagram
          </a>
        </Button>
      ) : (
        <Button size="lg" disabled>
          <Camera />
          Conectar com o Instagram
        </Button>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Quem conecta é a própria clínica, pela tela oficial do Instagram. A
        LumenzIA nunca vê a senha, e o acesso pode ser removido a qualquer
        momento em Configurações → Apps e sites, no Instagram.
      </p>
    </div>
  );
}
