# LumenzIA

Assistente de IA no WhatsApp para clínicas de estética: site, assinatura, painel da clínica, atendimento
humano e o motor da IA (Google Gemini). É a reconstrução do Lumia com uma stack mais moderna.

## Stack

- **Next.js 16** (App Router, Cache Components) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (Radix) + **Lucide** + **Motion** (animações) + **next-themes** (claro/escuro)
- **Supabase**: Postgres com RLS, Auth, Storage, Realtime, Vault e pg_cron
- Hospedagem na **Vercel**

## Rodando localmente

Requer Node.js 22 (veja `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # preencha conforme as etapas forem ligando cada serviço
npm run dev
```

Acesse http://localhost:3000.

## Banco de dados (Supabase)

O schema fica versionado em `supabase/migrations/` (tabelas, regras de acesso RLS, bucket de
fotos, segredos no Vault, Realtime e os planos iniciais). Para criar o banco num projeto novo:

1. Crie um projeto em https://supabase.com (o plano gratuito serve para começar).
2. Em **Project Settings → API Keys**, copie a URL, a chave _publishable_ e a chave _secret_ para o
   `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`).
3. Ligue o repositório ao projeto e aplique as migrações:

   ```bash
   npx supabase login
   npm run db:link -- --project-ref <id-do-projeto>
   npm run db:push
   ```

4. Depois de mudar o schema, regenere os tipos TypeScript com `npm run db:types`.

### Como os dados se organizam

- Tudo pertence a uma **clínica** (`clinics`). Quem entra pelo Supabase Auth ganha um perfil
  (`profiles`) e é ligado à clínica por `clinic_members` (dona ou equipe). O cadastro com
  `options.data.clinic_name` cria a clínica automaticamente, com a pessoa como dona.
- **RLS:** cada pessoa só lê e altera dados das próprias clínicas; `profiles.is_admin` (equipe
  LumenzIA) lê todas. O navegador só pode escrever nas colunas de conteúdo; o que é técnico
  (WhatsApp, agenda, assinatura, mensagens enviadas) é gravado pelo servidor com a chave secreta.
- **Segredos** (token do WhatsApp, chave da agenda) ficam no Supabase Vault e só o servidor os lê,
  pelas funções `set_clinic_secret` e `get_clinic_secret`.
- **Fotos** ficam no bucket público `clinic-images`, na pasta `{clinic_id}/`.
- `conversations` e `messages` estão no **Realtime**, para a fila de atendimento atualizar sozinha.

Para tornar alguém da equipe LumenzIA administrador, rode no SQL Editor do Supabase:
`update public.profiles set is_admin = true where id = (select id from auth.users where email = 'pessoa@exemplo.com');`

## Contas e assinatura

### Login (Supabase Auth)

Telas: `/entrar`, `/cadastro`, `/recuperar-senha` e `/redefinir-senha`. O cadastro envia
`full_name`, `clinic_name` e `phone` em `options.data`, e o gatilho `handle_new_user` cria o perfil e
a clínica. Os links dos e-mails voltam para `/auth/confirm`, que aceita `?code=` (padrão do Supabase)
e `?token_hash=&type=`.

No painel do Supabase, em **Authentication → URL Configuration**:

- **Site URL**: o endereço do site (em produção, o domínio com `https://`).
- **Redirect URLs**: adicione `http://localhost:3000/**` e `https://<seu-dominio>/**` (e o domínio de
  prévia da Vercel, se usar).

Se a confirmação de e-mail estiver desligada (**Authentication → Sign In / Providers → Confirm
email**), o cadastro já entra direto. O e-mail padrão do Supabase tem limite de poucos envios por
hora: para produção, configure um SMTP próprio (etapa 8).

### Cobrança (Mercado Pago)

`/assinatura` mostra os planos e o estado da assinatura; `/pagamento` é para onde a pessoa volta
depois de pagar. Com `PAYMENT_MODE=mock` (padrão), nada é cobrado: a página de pagamento tem um botão
que simula a primeira cobrança aprovada. Para cobrar de verdade:

1. `PAYMENT_MODE=mercadopago` e `MP_ACCESS_TOKEN` (Access Token de produção).
2. Em **Suas integrações → Webhooks**, cadastre `https://<seu-dominio>/api/webhooks/mercadopago` com
   o evento **Planos e assinaturas** e copie a assinatura secreta para `MP_WEBHOOK_SECRET`.

Quem libera o acesso é a cobrança aprovada (`subscription_authorized_payment`), aplicada pela função
`apply_subscription_payment` (migração `20261019000005_billing.sql`): 30 dias a cada cobrança e 3
dias de tolerância depois de uma recusa. Cancelar a renovação mantém o acesso até o fim do período
pago.

## Painel da clínica

Fica em `/painel` e só abre com a assinatura ativa (sem ela, a pessoa vai para `/assinatura`). Depois
do primeiro pagamento, o botão "Configurar a assistente" leva ao passo a passo (`/painel/comecar`).

| Tela                                  | O que a clínica configura                                        |
| ------------------------------------- | ---------------------------------------------------------------- |
| Visão geral                           | Progresso da configuração e liga/desliga a assistente            |
| Conversas                             | Caixa de entrada ao vivo: assumir, responder, devolver, encerrar |
| Relatórios                            | Indicadores, conversas por dia, motivos, agendamentos e CSV      |
| Assistente                            | Nome, tom de voz, informações da clínica, regras e encerramento  |
| Perguntas frequentes, Perguntas da IA | Listas com arrastar para reordenar                               |
| Fotos                                 | Envio para o Storage (reduzidas para JPEG de até 1600 px)        |
| Procedimentos, Profissionais, Motivos | Listas com arrastar para reordenar                               |
| Horários                              | Dias, horário, feriados, outros fechamentos e lembrete           |
| Conversas anteriores                  | Exemplos reais de atendimento                                    |
| Testar assistente                     | Conversa de teste com a IA (nada é salvo nem enviado)            |
| WhatsApp                              | Botão “Conectar WhatsApp” (Cadastro Incorporado da Meta)         |
| Minha conta                           | Nome, WhatsApp, nome da clínica, equipe e troca de senha         |

Tudo é gravado por Server Actions (`src/app/(painel)/painel/actions.ts`) com o cliente do usuário,
então o RLS confere a clínica de novo; a clínica vem sempre do login, nunca do navegador. A
assistente só pode ser ligada depois que o número do WhatsApp for conectado. Ctrl+K
abre a busca rápida.

## Motor da IA (WhatsApp + Gemini)

- `src/lib/ai/prompt.ts` monta as instruções da assistente com o que a clínica salvou no painel
  (o feriado nacional do dia vem de `holidays.ts`, calculado no servidor). As fotos aparecem para
  o modelo como `FOTO 1`, `FOTO 2`...; a resposta marca `[[FOTO:N]]` para enviar uma e
  `[[ESCALAR]]` para chamar a equipe.
- `src/lib/ai/engine.ts` chama o Gemini (`@google/genai`, modelo em `GEMINI_MODEL`) e resolve as
  ferramentas de agenda em até 4 rodadas.
- `src/lib/ai/agenda.ts` fala com a agenda da clínica: modo `webhook` (um POST para Zapier, Make
  ou n8n) ou `custom` (molde por ação, com conta de serviço do Google opcional), e guarda uma cópia
  local em `appointments`.
- `/api/webhooks/whatsapp` confere a assinatura da Meta (`META_APP_SECRET`), responde 200 na hora
  e processa depois com `after()`: guarda a mensagem (o id da Meta evita responder duas vezes),
  respeita "a equipe assumiu", a assinatura e a cota do plano, responde, envia a foto e escala para
  a equipe quando preciso.

Para ligar no WhatsApp: crie o app na Meta, cadastre o webhook
`https://<domínio>/api/webhooks/whatsapp` com o mesmo `WHATSAPP_VERIFY_TOKEN` e assine os campos
`messages` e `account_update`. O passo a passo completo está em
[docs/LANCAMENTO.md](docs/LANCAMENTO.md#5-whatsapp-app-da-lumenzia-na-meta-tech-provider).

### Conectar WhatsApp (Cadastro Incorporado)

A LumenzIA é Tech Provider: um app na Meta, um webhook, e cada clínica conecta o próprio número em
`/painel/whatsapp` (só a dona da conta). O botão abre o Embedded Signup da Meta pelo SDK do
Facebook (`META_APP_ID` e `META_EMBEDDED_SIGNUP_CONFIG_ID`). A janela devolve ao navegador o
número e a conta escolhidos (postMessage) e um `code` de uso único; o servidor
(`src/lib/whatsapp/embedded-signup.ts`):

1. troca o `code` pelo token com o `META_APP_SECRET`;
2. confere com esse token que o número pertence à conta (WABA) escolhida;
3. inscreve o app nos avisos da conta (`subscribed_apps`), o que faz as mensagens chegarem ao
   webhook;
4. registra o número na Cloud API com um PIN aleatório de verificação em duas etapas (pulado em
   coexistência com o app WhatsApp Business);
5. guarda token e PIN no Vault (`set_clinic_secret`) e o número em `clinics`.

“Desconectar” cancela a inscrição, apaga token e PIN e pausa a assistente. Se a clínica remover a
LumenzIA pela Meta, o aviso `account_update`/`PARTNER_REMOVED` desliga a conexão sozinho.

## Atendimento ao vivo e relatórios

- `/painel/atendimento` mostra as conversas em andamento pelo Supabase Realtime (`conversations` e
  `messages` estão na publicação; o RLS entrega só as da clínica). As que a IA passou para a
  equipe aparecem primeiro e ganham um selo no menu e um aviso em qualquer tela do painel.
- "Assumir" põe a conversa em `equipe` e a IA para de responder; responder pelo painel também
  assume. "Devolver para a IA" volta para `ia`. A resposta sai pelo número da clínica e grava
  quem enviou (`messages.sent_by`). Fora da janela de 24 horas do WhatsApp o envio é bloqueado.
- "Encerrar" fecha na hora e a IA classifica motivo, desfecho e resumo (o mesmo do job).
- `/painel/relatorios` lê `conversation_stats` (dias no horário de Brasília) e exporta CSV com
  ponto e vírgula em `/painel/relatorios/exportar`.

## Jobs automáticos (pg_cron)

A migração `20261019000007_attendance_reports_jobs.sql` agenda tudo no próprio Supabase:

| Job                     | Quando           | O que faz                                                                          |
| ----------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `lumenzia-lembretes`    | a cada 5 min     | `/api/cron/lembretes`: lembrete por template antes do horário                      |
| `lumenzia-classificar`  | a cada 15 min    | `/api/cron/classificar`: encerra e classifica conversas paradas                    |
| `lumenzia-agenda`       | 06:00 (Brasília) | `/api/cron/agenda`: traz os agendamentos da agenda da clínica                      |
| `lumenzia-limpeza`      | 06:30 (Brasília) | `run_daily_cleanup()`: conclui e apaga agendamentos antigos, auditoria de 12 meses |
| `lumenzia-limpeza-cron` | 06:45 (Brasília) | apaga o histórico de execuções do pg_cron com mais de 7 dias                       |

Os três primeiros chamam o site pelo `pg_net` com `Authorization: Bearer <senha>`. O endereço
(`lumenzia_app_url`) e a senha (`lumenzia_cron_secret`, gerada pela migração) ficam no Vault, e
a mesma senha vai na variável `CRON_SECRET` da Vercel. Para ver a senha, rode no SQL Editor:

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'lumenzia_cron_secret';
```

As rotas respondem na hora e trabalham depois com `after()`. O histórico fica em
`cron.job_run_details` (execução do pg_cron) e `net._http_response` (resposta do site).

## Painel da equipe LumenzIA (`/admin`)

Só abre para quem tem `profiles.is_admin` (o proxy manda os demais para `/painel`, e cada página
confere de novo). Para virar admin, veja o SQL em “Como os dados se organizam”.

- **Clientes**: todas as clínicas (`admin_clinics()`, que traz o e-mail da dona de `auth.users`)
  com busca, filtros (em dia, sem WhatsApp, pausada, cota acabando, vencidas) e totais.
- **Ficha da clínica** (`/admin/clinicas/<id>`), em abas: visão geral (assinatura, uso, pessoas,
  ligar/pausar a assistente, desconectar o WhatsApp), **WhatsApp** (IDs, número, WhatsApp da
  equipe e token), **Templates** (lembrete e aviso à equipe), **Agenda** (modo webhook ou API
  própria, JSON das ações e chave) e **Auditoria**.
- **Auditoria**: tudo o que a equipe muda, e as conexões de WhatsApp, vai para `admin_audit_log`
  com o que mudou (nunca o valor de um segredo). Fica 12 meses (job de limpeza diária).
- **Lançamento** (`/admin/lancamento`): confere variáveis, “Confirm email” do Supabase, senha e
  endereço dos jobs (`launch_status`) e as últimas execuções do pg_cron. O checklist completo
  está em [docs/LANCAMENTO.md](docs/LANCAMENTO.md).

Segredos são só de escrita no painel: o formulário mostra se existe (`clinic_secret_status`) e
campo vazio mantém o valor guardado. As gravações usam a chave secreta no servidor, depois de
conferir que quem pede é admin.

## Scripts

| Comando                           | O que faz                                         |
| --------------------------------- | ------------------------------------------------- |
| `npm run dev`                     | Servidor de desenvolvimento                       |
| `npm run build`                   | Build de produção                                 |
| `npm run lint`                    | ESLint                                            |
| `npm run typecheck`               | Gera os tipos de rota do Next e roda o TypeScript |
| `npm run format` / `format:check` | Prettier (com ordenação de classes do Tailwind)   |

O CI (`.github/workflows/ci.yml`) roda formatação, lint, tipos e build em todo PR.

## Componentes de interface

Os componentes do shadcn/ui ficam em `src/components/ui` e seguem o `components.json`. Para adicionar
outros: `npx shadcn@latest add <componente>`.

## Roteiro

1. Fundação: Next.js, design system, lint, CI
2. Banco e segurança: Supabase, migrações, RLS, Storage, Vault
3. Site público: home animada, planos, privacidade
4. Contas e assinatura: Supabase Auth + Mercado Pago
5. Painel de configuração da assistente
6. Motor da IA: Gemini, agenda, webhook do WhatsApp
7. Atendimento em tempo real e analytics
8. Admin e produção: painel da equipe, Conectar WhatsApp e [checklist de lançamento](docs/LANCAMENTO.md)
