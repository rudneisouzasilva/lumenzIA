import { Suspense } from "react";
import type { Metadata } from "next";
import { Camera } from "lucide-react";

import {
  InstagramConnect,
  type InstagramNotice,
} from "@/components/painel/instagram-connect";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { instagramCredentials } from "@/lib/instagram/oauth";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = { title: "Instagram" };

const NOTICES: Record<string, InstagramNotice> = {
  conectado: {
    ok: true,
    text: "Instagram conectado. As mensagens do Direct já chegam na caixa de entrada.",
  },
  cancelado: { ok: false, text: "A conexão foi cancelada no Instagram." },
  "sem-permissao": {
    ok: false,
    text: "Para a assistente responder, é preciso permitir o acesso às mensagens. Conecte de novo e aceite todas as permissões.",
  },
  "sem-avisos": {
    ok: false,
    text: "A conta foi conectada, mas o Instagram não liberou o envio das mensagens para a LumenzIA. Tente conectar de novo em alguns minutos.",
  },
  "em-uso": {
    ok: false,
    text: "Esta conta do Instagram já está conectada a outra clínica na LumenzIA.",
  },
  "so-dona": {
    ok: false,
    text: "Só a dona da conta da clínica pode conectar o Instagram.",
  },
  indisponivel: {
    ok: false,
    text: "A conexão com o Instagram ainda não está disponível. Fale com a equipe LumenzIA.",
  },
  erro: {
    ok: false,
    text: "Não foi possível conectar agora. Tente de novo em instantes.",
  },
};

export default function InstagramPage({
  searchParams,
}: PageProps<"/painel/instagram">) {
  return (
    <>
      <PageHeader
        icon={Camera}
        title="Instagram"
        description="Conecte o Instagram da clínica para a assistente responder as mensagens do Direct."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Connection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Connection({
  searchParams,
}: Pick<PageProps<"/painel/instagram">, "searchParams">) {
  const [{ supabase, clinic }, params] = await Promise.all([
    getPanelContext(),
    searchParams,
  ]);
  const { data: account, error } = await supabase
    .from("instagram_accounts")
    .select(
      "username, name, status, reply_comments, last_error, connected_at, token_expires_at",
    )
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const notice =
    typeof params.instagram === "string" ? NOTICES[params.instagram] : null;

  return (
    <PanelCard
      title={account ? "Conta conectada" : "Conectar Instagram"}
      description={
        account
          ? "As mensagens que chegam no Direct desta conta são respondidas pela assistente quando ela está ligada."
          : "Leva 1 minuto. A conta precisa ser profissional (comercial ou criador de conteúdo)."
      }
    >
      <InstagramConnect
        ready={Boolean(instagramCredentials())}
        isOwner={clinic.role === "owner"}
        notice={notice ?? null}
        account={
          account
            ? {
                username: account.username,
                name: account.name,
                active: account.status === "ativo",
                replyComments: account.reply_comments,
                error: account.last_error,
                connectedAt: account.connected_at,
              }
            : null
        }
      />
    </PanelCard>
  );
}
