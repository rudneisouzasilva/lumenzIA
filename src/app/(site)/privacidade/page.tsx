import type { Metadata } from "next";

import { aiProviderLabel } from "@/lib/ai/provider";
import { site, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como a LumenzIA trata dados pessoais, em conformidade com a LGPD.",
};

// Os trechos [ENTRE COLCHETES] precisam ser preenchidos com os dados da empresa e o texto deve ser
// revisado por um advogado antes de ir ao ar.
export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24 [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_li]:mt-2 [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:text-muted-foreground">
      <h1 className="font-display text-4xl font-semibold tracking-tight">
        Política de Privacidade
      </h1>
      <p className="!mt-3 text-sm">Última atualização: 19 de outubro de 2026</p>

      <p>
        Esta política explica como a {site.name} (&quot;nós&quot;) trata dados
        pessoais ao oferecer uma assistente de inteligência artificial para
        WhatsApp voltada a clínicas de estética, em conformidade com a Lei Geral
        de Proteção de Dados (Lei nº 13.709/2018, a LGPD).
      </p>

      <h2>1. Quem somos</h2>
      <p>
        [RAZÃO SOCIAL], CNPJ [00.000.000/0000-00], com sede em [ENDEREÇO
        COMPLETO]. Contato para assuntos de privacidade: [E-MAIL DE CONTATO] ou
        WhatsApp {site.whatsappLabel}.
      </p>

      <h2>2. Papéis: quem decide sobre os dados</h2>
      <ul>
        <li>
          <strong>Dados da clínica (cliente):</strong> nome, e-mail, telefone,
          nome da clínica e dados de pagamento. Aqui a {site.name} é a{" "}
          <strong>controladora</strong>.
        </li>
        <li>
          <strong>Dados dos pacientes da clínica:</strong> mensagens e telefones
          de quem conversa com a assistente. Aqui a clínica é a{" "}
          <strong>controladora</strong> e a {site.name} atua como{" "}
          <strong>operadora</strong>, tratando os dados somente para prestar o
          serviço contratado e conforme as instruções da clínica.
        </li>
      </ul>

      <h2>3. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, nome da clínica, e-mail, telefone
          (opcional) e senha (armazenada apenas de forma criptografada, com
          hash).
        </li>
        <li>
          <strong>Configuração da assistente:</strong> textos, perguntas e
          respostas, conversas anteriores coladas em texto, fotos enviadas e
          suas descrições, e dados de conexão do WhatsApp e da agenda da clínica
          (tokens e chaves de acesso ficam em um cofre criptografado).
        </li>
        <li>
          <strong>Conversas e agendamentos:</strong> número de telefone e nome
          do perfil do WhatsApp, mensagens trocadas entre pacientes, a
          assistente e a equipe, e os agendamentos feitos por ela. Quando a
          clínica conecta um número que já usa o app WhatsApp Business e
          autoriza, também os contatos, até 6 meses de histórico e as mensagens
          que a equipe envia pelo celular.
        </li>
        <li>
          <strong>Dados comerciais da clínica:</strong> etapa de cada contato no
          funil, anotações, responsável, valor estimado e retomadas marcadas.
        </li>
        <li>
          <strong>Pagamento:</strong> status, valor e identificador da
          transação. Os dados de cartão ou Pix são tratados diretamente pelo
          Mercado Pago; não os armazenamos.
        </li>
        <li>
          <strong>Técnicos:</strong> endereço IP e registros de acesso, para
          segurança e prevenção de abuso.
        </li>
      </ul>
      <p>
        As conversas de pacientes podem conter dados sensíveis, como informações
        sobre saúde e estética (art. 11 da LGPD). A clínica é responsável por
        ter base legal adequada, como o consentimento do paciente ou a tutela da
        saúde, e por informá-lo de que o atendimento é feito com apoio de
        inteligência artificial.
      </p>

      <h2>4. Para que usamos os dados</h2>
      <ul>
        <li>
          Criar e manter a conta e liberar o acesso ao painel (execução de
          contrato).
        </li>
        <li>
          Processar pagamentos e emitir comprovantes (execução de contrato e
          obrigação legal).
        </li>
        <li>
          Gerar as respostas da assistente, fazer agendamentos e registrar as
          conversas no painel da clínica (execução de contrato).
        </li>
        <li>
          Enviar, em nome da clínica, mensagens de retomada a quem conversou com
          ela, na data que a pessoa pediu ou no prazo escolhido pela clínica.
          Quem responder SAIR deixa de recebê-las.
        </li>
        <li>
          Gerar indicadores e uma análise mensal para a clínica, com números
          agregados e resumos das conversas, sem nome nem telefone.
        </li>
        <li>
          Garantir a segurança do serviço e prevenir fraudes (legítimo
          interesse).
        </li>
        <li>
          Responder a contatos e solicitações (execução de contrato e legítimo
          interesse).
        </li>
      </ul>
      <p>
        Não vendemos dados pessoais e não usamos as conversas dos pacientes para
        publicidade.
      </p>

      <h2>5. Com quem compartilhamos</h2>
      <p>
        Compartilhamos dados apenas com prestadores necessários ao funcionamento
        do serviço:
      </p>
      <ul>
        <li>
          <strong>{aiProviderLabel()} (inteligência artificial):</strong> o
          texto das conversas e as configurações da assistente são enviados para
          gerar as respostas.
        </li>
        <li>
          <strong>Meta (WhatsApp Business Platform):</strong> envio e
          recebimento das mensagens.
        </li>
        <li>
          <strong>Mercado Pago:</strong> processamento dos pagamentos.
        </li>
        <li>
          <strong>Supabase e Vercel:</strong> banco de dados, autenticação,
          armazenamento de arquivos e hospedagem do site.
        </li>
        <li>
          <strong>Sistema de agenda da clínica</strong> (quando conectado, por
          exemplo Google Calendar): nome, telefone e horário dos agendamentos.
        </li>
      </ul>
      <p>
        <strong>Google Agenda:</strong> quando a clínica conecta uma conta do
        Google, a LumenzIA acessa apenas a lista de agendas, os horários
        ocupados e os eventos que a assistente cria, consulta ou cancela, só
        para agendar os pacientes da clínica. Esses dados não são usados para
        publicidade, não são vendidos e não são usados para treinar modelos de
        IA. O uso e a transferência de informações recebidas das APIs do Google
        seguem a{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Política de Dados do Usuário dos Serviços de API do Google
        </a>
        , incluindo os requisitos de Uso Limitado. A clínica pode desconectar a
        conta a qualquer momento no painel ou nas configurações da conta do
        Google.
      </p>
      <p>
        Alguns desses prestadores podem tratar dados fora do Brasil. Nesses
        casos, adotamos as salvaguardas previstas nos artigos 33 a 36 da LGPD.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <p>
        Mantemos os dados da conta enquanto ela estiver ativa. Conversas e
        configurações são guardadas enquanto a clínica utilizar o serviço e
        podem ser excluídas a pedido. Dados de pagamento podem ser guardados
        pelo prazo exigido por lei fiscal e contábil. O registro de agendamentos
        usado nos indicadores, sem nome nem telefone, é apagado depois de 13
        meses.
      </p>

      <h2>7. Seus direitos</h2>
      <p>
        Nos termos do art. 18 da LGPD, você pode solicitar confirmação de
        tratamento, acesso, correção, anonimização, portabilidade, eliminação de
        dados tratados com base em consentimento, informações sobre
        compartilhamento e revogação do consentimento. Pacientes que quiserem
        exercer esses direitos em relação às suas conversas devem procurar
        primeiro a clínica, que é a controladora; nós auxiliamos a clínica no
        atendimento a essas solicitações.
      </p>
      <p>Para exercer seus direitos, escreva para [E-MAIL DE CONTATO].</p>

      <h2>8. Segurança</h2>
      <p>
        Adotamos medidas técnicas como conexão criptografada (HTTPS), senhas com
        hash, tokens de acesso guardados em cofre criptografado, isolamento dos
        dados de cada clínica no próprio banco de dados e registro das ações
        técnicas da nossa equipe. Nenhum sistema é totalmente imune a
        incidentes; em caso de incidente relevante, comunicaremos os afetados e
        a ANPD conforme a lei.
      </p>

      <h2>9. Cookies</h2>
      <p>
        Usamos apenas cookies essenciais de sessão, necessários para manter você
        conectado, e guardamos no seu navegador a preferência de tema claro ou
        escuro. Não usamos cookies de publicidade.
      </p>

      <h2>10. Crianças e adolescentes</h2>
      <p>
        O serviço é destinado a empresas e profissionais maiores de 18 anos e
        não é direcionado a menores.
      </p>

      <h2>11. Alterações</h2>
      <p>
        Podemos atualizar esta política. A data da última atualização aparece no
        topo desta página.
      </p>

      <h2>12. Contato</h2>
      <p>
        Dúvidas sobre privacidade: [E-MAIL DE CONTATO] ou WhatsApp{" "}
        <a
          href={whatsappLink()}
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
