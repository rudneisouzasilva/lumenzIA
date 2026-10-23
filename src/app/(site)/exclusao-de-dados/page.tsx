import type { Metadata } from "next";
import Link from "next/link";

import { site, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Exclusão de dados",
  description:
    "Como pedir a exclusão dos seus dados da LumenzIA, para clínicas e pacientes.",
};

// Endereço informado à Meta (WhatsApp e Instagram) e ao Google como "instruções de exclusão de
// dados". Segue o mesmo visual da política de privacidade.
export default function DataDeletionPage() {
  const mail = (subject: string) =>
    `mailto:${site.privacyEmail}?subject=${encodeURIComponent(subject)}`;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24 [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_li]:mt-2 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_ol]:text-muted-foreground [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:text-muted-foreground">
      <h1 className="font-display text-4xl font-semibold tracking-tight">
        Exclusão de dados
      </h1>
      <p className="!mt-3 text-sm">Última atualização: 22 de outubro de 2026</p>

      <p>
        Esta página explica como pedir a exclusão dos dados tratados pela{" "}
        {site.name}, inclusive os recebidos pelo WhatsApp, pelo Instagram e pelo
        Google Agenda. Os detalhes sobre quais dados tratamos estão na{" "}
        <Link
          href="/privacidade"
          className="text-primary underline underline-offset-4"
        >
          Política de Privacidade
        </Link>
        .
      </p>

      <h2>1. Clínicas que usam a {site.name}</h2>
      <p>Para apagar a conta da clínica e tudo o que está nela:</p>
      <ol>
        <li>
          Se houver assinatura ativa, cancele a renovação em{" "}
          <strong>Assinatura</strong>, no painel.
        </li>
        <li>
          Envie um e-mail para{" "}
          <a
            href={mail("Exclusão da conta da clínica")}
            className="text-primary underline underline-offset-4"
          >
            {site.privacyEmail}
          </a>{" "}
          a partir do e-mail da conta, com o assunto “Exclusão da conta da
          clínica” e o nome da clínica.
        </li>
        <li>
          Confirmamos o pedido por e-mail e concluímos a exclusão em até 15
          dias.
        </li>
      </ol>
      <p>São apagados:</p>
      <ul>
        <li>a conta de acesso de todas as pessoas da equipe;</li>
        <li>
          a configuração da assistente, os contatos, as conversas, o funil e os
          agendamentos;
        </li>
        <li>
          as conexões com WhatsApp, Instagram, Google Agenda e sistemas de
          agenda, com os tokens e chaves de acesso guardados no cofre;
        </li>
        <li>o registro de indicadores da clínica.</li>
      </ul>
      <p>
        Os registros de pagamento ficam guardados pelo prazo exigido pela lei
        fiscal e contábil.
      </p>
      <p>
        Para desligar só uma conexão, sem apagar a conta, use o botão{" "}
        <strong>Desconectar</strong> nas telas WhatsApp, Instagram ou Agenda do
        painel: o token de acesso é apagado na hora.
      </p>

      <h2>2. Pacientes e pessoas que conversaram com uma clínica</h2>
      <p>
        As conversas com a assistente pertencem à clínica com quem você falou:
        ela é a controladora dos dados e nós tratamos os dados em nome dela.
        Para pedir a exclusão:
      </p>
      <ol>
        <li>
          Peça diretamente à clínica, pelo mesmo WhatsApp ou Instagram em que
          você conversou.
        </li>
        <li>
          Se preferir, ou se a clínica não responder, escreva para{" "}
          <a
            href={mail("Exclusão de dados de paciente")}
            className="text-primary underline underline-offset-4"
          >
            {site.privacyEmail}
          </a>{" "}
          informando o nome da clínica e o telefone ou o usuário do Instagram
          usado na conversa. Encaminhamos o pedido à clínica e, com a
          confirmação dela, apagamos o contato, as conversas e os agendamentos
          ligados a esse telefone ou usuário em até 15 dias.
        </li>
      </ol>
      <p>
        As mensagens que já foram entregues no seu celular ou no Instagram
        continuam no seu aplicativo; para apagá-las, use as opções do próprio
        WhatsApp ou Instagram.
      </p>

      <h2>3. Contas do Instagram, do Facebook e do Google conectadas</h2>
      <p>
        Uma clínica também pode remover o acesso da {site.name} direto na
        plataforma, a qualquer momento:
      </p>
      <ul>
        <li>
          <strong>Instagram:</strong> Configurações → Apps e sites → remover a{" "}
          {site.name}.
        </li>
        <li>
          <strong>WhatsApp Business:</strong> Gerenciador do WhatsApp (Meta
          Business Suite) → Configurações → Parceiros → remover a {site.name}. A
          conexão é desligada sozinha no painel.
        </li>
        <li>
          <strong>Google:</strong>{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener"
            className="text-primary underline underline-offset-4"
          >
            myaccount.google.com/permissions
          </a>{" "}
          → {site.name} → Remover acesso.
        </li>
      </ul>
      <p>
        Remover o acesso impede novas leituras, mas não apaga o que já está na{" "}
        {site.name}. Para isso, faça também o pedido do item 1 ou 2.
      </p>

      <h2>4. Dúvidas</h2>
      <p>
        Escreva para{" "}
        <a
          href={`mailto:${site.privacyEmail}`}
          className="text-primary underline underline-offset-4"
        >
          {site.privacyEmail}
        </a>{" "}
        ou chame no WhatsApp{" "}
        <a
          href={whatsappLink("Olá! Tenho uma dúvida sobre exclusão de dados.")}
          target="_blank"
          rel="noopener"
          className="text-primary underline underline-offset-4"
        >
          {site.whatsappLabel}
        </a>
        .
      </p>
    </article>
  );
}
