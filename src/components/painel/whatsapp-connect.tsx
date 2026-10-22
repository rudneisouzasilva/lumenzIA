"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  BadgeCheck,
  ExternalLink,
  Loader2,
  PlugZap,
  Smartphone,
  Unplug,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import {
  connectWhatsappAction,
  disconnectWhatsappAction,
  retryHistorySyncAction,
} from "@/app/(painel)/painel/whatsapp/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export type SignupConfig = {
  appId: string;
  configId: string;
  graphVersion: string;
};

export type WhatsappConnection = {
  displayPhone: string | null;
  verifiedName: string | null;
  connectedAt: string | null;
  coexistence: boolean;
  history: {
    status: string;
    progress: number;
    messages: number;
    canRetry: boolean;
  };
};

type Session = {
  wabaId: string;
  phoneNumberId: string;
  coexistence: boolean;
};

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } | null }) => void,
    options: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const SDK_ID = "facebook-jssdk";

// O SDK é carregado uma vez por página; quem usa o botão só quer saber se já está pronto.
const sdkListeners = new Set<() => void>();
const subscribeSdk = (listener: () => void) => {
  sdkListeners.add(listener);
  return () => sdkListeners.delete(listener);
};
const sdkReady = () => Boolean(window.FB);

/** Carrega o SDK do Facebook uma vez só e avisa quando ele está pronto. */
function useFacebookSdk(config: SignupConfig | null) {
  useEffect(() => {
    if (!config || window.FB || document.getElementById(SDK_ID)) return;
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId: config.appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: config.graphVersion,
      });
      sdkListeners.forEach((l) => l());
    };
    const script = document.createElement("script");
    script.id = SDK_ID;
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
  }, [config]);

  return useSyncExternalStore(subscribeSdk, sdkReady, () => false);
}

/**
 * Botão "Conectar WhatsApp": abre o Cadastro Incorporado da Meta, onde a clínica entra com o
 * Facebook dela e escolhe o número. A janela devolve o número por postMessage e um código de uso
 * único pelo FB.login; o servidor troca o código pelo token e guarda tudo.
 */
export function WhatsappConnect({
  config,
  connection,
  isOwner,
}: {
  config: SignupConfig | null;
  connection: WhatsappConnection | null;
  isOwner: boolean;
}) {
  const ready = useFacebookSdk(connection ? null : config);
  const session = useRef<Session | null>(null);
  const [opening, setOpening] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let host = "";
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      let data: {
        type?: string;
        event?: string;
        data?: {
          waba_id?: string;
          phone_number_id?: string;
          error_message?: string;
        };
      };
      try {
        data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (
        (data.event === "FINISH" ||
          data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") &&
        data.data?.waba_id &&
        data.data.phone_number_id
      ) {
        session.current = {
          wabaId: data.data.waba_id,
          phoneNumberId: data.data.phone_number_id,
          coexistence: data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        };
      } else if (data.event === "FINISH_ONLY_WABA") {
        toast.error(
          "A conta foi criada, mas nenhum número foi escolhido. Conecte de novo e adicione o número.",
        );
      } else if (data.event === "ERROR") {
        toast.error(
          data.data?.error_message ?? "A Meta informou um erro na conexão.",
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /** O número chega por postMessage, às vezes um pouco depois do código. */
  const waitForSession = async () => {
    for (let i = 0; i < 30 && !session.current; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return session.current;
  };

  const finish = (code: string) =>
    startTransition(async () => {
      const info = await waitForSession();
      if (!info) {
        toast.error(
          "Não recebemos o número escolhido. Conecte de novo e vá até o fim da janela da Meta.",
        );
        return;
      }
      const result = await connectWhatsappAction({ code, ...info });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success("WhatsApp conectado! Agora é só ligar a assistente.");
    });

  /** `existingApp`: o número continua no app WhatsApp Business do celular (coexistência). */
  const connect = (existingApp: boolean) => {
    if (!config || !window.FB) return;
    session.current = null;
    setOpening(true);
    window.FB.login(
      (response) => {
        setOpening(false);
        const code = response.authResponse?.code;
        if (code) finish(code);
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: existingApp ? "whatsapp_business_app_onboarding" : "",
          sessionInfoVersion: "3",
        },
      },
    );
  };

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectWhatsappAction();
      setConfirmOpen(false);
      if (!result.ok) toast.error(result.error);
      else toast.success("WhatsApp desconectado e assistente pausada.");
    });

  if (connection) {
    return (
      <div className="space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <BadgeCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold">
              {connection.displayPhone ?? "Número conectado"}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {connection.verifiedName
                ? `Aparece para os pacientes como “${connection.verifiedName}”`
                : "Conectado à LumenzIA"}
              {connection.connectedAt &&
                ` · desde ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(connection.connectedAt))}`}
            </p>
          </div>
        </motion.div>

        {connection.coexistence && (
          <HistoryStatus history={connection.history} isOwner={isOwner} />
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a
              href="https://business.facebook.com/wa/manage/home/"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink />
              Gerenciar no WhatsApp Manager
            </a>
          </Button>
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
            <DialogTitle>Desconectar o WhatsApp?</DialogTitle>
            <DialogDescription>
              A assistente para de responder neste número na hora e a LumenzIA
              deixa de receber as mensagens. O número continua sendo da clínica,
              e dá para conectar de novo quando quiser.
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

  return (
    <div className="space-y-6">
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "Entre com o Facebook",
            text: "Use a conta que administra a empresa da clínica no Facebook.",
          },
          {
            title: "Escolha o número",
            text: "Um número novo ou o que a clínica já usa no app WhatsApp Business.",
          },
          {
            title: "Pronto",
            text: "Volte aqui e ligue a assistente no Início.",
          },
        ].map((step, i) => (
          <li key={step.title} className="rounded-xl border p-4">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {i + 1}
            </span>
            <p className="mt-3 text-sm font-medium">{step.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>

      {!config ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          A conexão com o WhatsApp está sendo preparada pela equipe LumenzIA e
          fica disponível aqui em breve.
        </p>
      ) : !isOwner ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Só a dona da conta da clínica pode conectar o número.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            existingApp: true,
            title: "Já uso o WhatsApp Business no celular",
            text: "O número continua no app. As conversas dos últimos 6 meses e o que a equipe responder pelo celular aparecem aqui.",
          },
          {
            existingApp: false,
            title: "Usar um número novo",
            text: "Um número que ainda não está em nenhum app do WhatsApp, só para a assistente e o painel.",
          },
        ].map((option) => (
          <button
            key={option.title}
            type="button"
            onClick={() => connect(option.existingApp)}
            disabled={!config || !isOwner || !ready || opening || pending}
            className="group flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors hover:border-[#25D366]/60 hover:bg-[#25D366]/5 disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="flex items-center gap-2 font-medium">
              {pending || opening || (config && !ready) ? (
                <Loader2 className="size-4 animate-spin text-[#25D366]" />
              ) : (
                <PlugZap className="size-4 text-[#25D366]" />
              )}
              {option.title}
            </span>
            <span className="text-sm text-muted-foreground">{option.text}</span>
          </button>
        ))}
      </div>
      {pending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Conectando…
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Smartphone className="mt-0.5 size-3.5 shrink-0" />
        Quem conecta é a própria clínica, pela janela oficial da Meta. A
        LumenzIA nunca vê a senha do Facebook, e o acesso pode ser removido a
        qualquer momento nas configurações da empresa no Facebook.
      </p>
    </div>
  );
}

const HISTORY_LABEL: Record<string, string> = {
  aguardando: "Esperando a Meta enviar o histórico do celular…",
  importando: "Importando as conversas do celular…",
  concluido: "Histórico do celular importado.",
  recusado:
    "O compartilhamento do histórico foi recusado no celular. As conversas novas aparecem normalmente.",
  erro: "Não foi possível pedir o histórico do celular.",
};

/** Andamento da importação das conversas antigas do app (coexistência). */
function HistoryStatus({
  history,
  isOwner,
}: {
  history: WhatsappConnection["history"];
  isOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const label = HISTORY_LABEL[history.status];
  if (!label) return null;
  const running =
    history.status === "aguardando" || history.status === "importando";

  const retry = () =>
    startTransition(async () => {
      const result = await retryHistorySyncAction();
      if (!result.ok) toast.error(result.error);
      else
        toast.success("Pedido enviado. O histórico chega em alguns minutos.");
    });

  return (
    <div className="space-y-3 rounded-2xl border p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        {running ? (
          <Loader2 className="size-4 animate-spin text-primary" />
        ) : (
          <Smartphone className="size-4 text-primary" />
        )}
        {label}
      </p>
      {history.status === "importando" && (
        <div className="h-2 rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.max(4, history.progress)}%` }}
          />
        </div>
      )}
      {history.messages > 0 && (
        <p className="text-muted-foreground">
          {history.messages.toLocaleString("pt-BR")} mensagens importadas. Elas
          ficam em Conversas, na aba Encerradas.
        </p>
      )}
      <p className="text-muted-foreground">
        O que a equipe responder pelo celular aparece no painel na hora, e a
        assistente deixa aquela conversa com vocês.
      </p>
      {history.canRetry && isOwner && (
        <Button size="sm" variant="outline" disabled={pending} onClick={retry}>
          {pending && <Loader2 className="animate-spin" />}
          Pedir o histórico de novo
        </Button>
      )}
    </div>
  );
}
