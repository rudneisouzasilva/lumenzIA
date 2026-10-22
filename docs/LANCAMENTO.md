# Checklist de lançamento

O que falta fazer, fora do código, para a LumenzIA receber clínicas de verdade. A tela
**/admin/lancamento** confere sozinha boa parte destes itens (variáveis, confirmação de e-mail,
senha e endereço dos jobs) a cada visita.

> Segredos (chaves, tokens, senhas) vão só nas variáveis de ambiente da Vercel ou no painel de
> cada serviço. Nunca no código, no chat ou em print.

## 1. Banco (Supabase)

- [ ] Rodar a migração `supabase/migrations/20261019000008_admin_whatsapp_launch.sql` no **SQL
      Editor** (cole o arquivo inteiro e clique em Run).
- [ ] Fase 2: rodar, **nesta ordem e uma de cada vez**, as migrações:
  1. `20261020000009_contacts_analytics_log.sql` (contatos e registro de 13 meses)
  2. `20261020000010_whatsapp_coexistence.sql` (WhatsApp Business já existente)
  3. `20261020000011_message_templates.sql` (mensagens prontas)
  4. `20261020000012_follow_ups.sql` (retomadas; cria o job `lumenzia-retomadas`)
  5. `20261020000013_pipeline.sql` (funil; cria o funil padrão de cada clínica)
  6. `20261020000014_insights.sql` (indicadores e análise da IA)
  7. `20261020000015_google_calendar.sql` (Google Agenda)
  8. `20261020000016_evaluation_required.sql` (avaliação obrigatória antes de procedimentos)
  9. `20261020000017_booking_fields.sql` (dados pedidos no agendamento)
  10. `20261021000018_notification_channels.sql` (avisos à equipe e lembretes por e-mail)
  11. `20261021000019_instagram.sql` (Instagram: Direct e comentários)
  12. `20261022000020_clinica_experts.sql` (Clínica Experts conectado pela clínica)
  13. `20261022000021_clinica_experts_webhook.sql` (avisos em tempo real do Clínica Experts)
- [ ] Criar a sua conta da equipe LumenzIA, sem clínica: Supabase → **Authentication → Users →
      Add user → Create new user**, com o seu e-mail, uma senha escolhida por você e **Auto
      Confirm User** marcado. Depois, no SQL Editor (troque o e-mail):

  ```sql
  update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'voce@exemplo.com');
  ```

  Entrando em **/entrar** com esse e-mail e senha, você cai direto em **/admin**. Faça o mesmo para
  cada pessoa da equipe.

- [ ] Passar o projeto para o plano **Pro**: o gratuito pausa o banco depois de 7 dias sem uso e
      não tem backup diário.
- [ ] Em **Authentication → Attack Protection**, ligar a proteção contra senhas vazadas.

## 2. Domínio próprio

- [ ] Vercel → projeto → **Settings → Domains**: adicionar o domínio (ex.: `lumenzia.com.br`) e o
      `www` redirecionando para ele. Criar no registro.br os registros DNS que a Vercel mostrar.
- [ ] Vercel → **Settings → Environment Variables**: `NEXT_PUBLIC_APP_URL=https://lumenzia.com.br`
      (sem barra no fim) e fazer um novo deploy.
- [ ] Supabase → **Authentication → URL Configuration**: Site URL = o domínio; em Redirect URLs,
      adicionar `https://lumenzia.com.br/**`.
- [ ] Jobs: em **/admin/lancamento**, clicar em “Fazer os jobs chamarem …” (ou rodar
      `select public.set_cron_app_url('https://lumenzia.com.br');` no SQL Editor).
- [ ] Vercel no plano **Pro**: o Hobby não permite uso comercial.

## 3. E-mails reais (SMTP próprio) e confirmação de e-mail

O e-mail padrão do Supabase manda poucos e-mails por hora e só serve para testes; por isso a
confirmação de e-mail foi desligada na etapa 4. Para religar:

- [ ] Criar conta no [Resend](https://resend.com) (ou outro SMTP), adicionar o domínio e criar os
      registros DNS (SPF/DKIM) que ele pedir até o domínio ficar **Verified**.
- [ ] Supabase → **Authentication → Emails → SMTP Settings** → Enable custom SMTP:
      host `smtp.resend.com`, porta `465`, usuário `resend`, senha = uma API key do Resend,
      remetente `nao-responda@lumenzia.com.br`, nome `LumenzIA`.
- [ ] Avisos e lembretes por e-mail (tela **Avisos e lembretes** do painel): na Vercel,
      `RESEND_API_KEY` (uma API key do Resend com permissão de envio) e `NOTIFY_EMAIL_FROM`, ex.:
      `LumenzIA <avisos@lumenzia.com.br>`. Nos lembretes, o nome que aparece é o da clínica.
      Plano grátis do Resend: 3.000 e-mails por mês, 100 por dia.
- [ ] **Authentication → Rate Limits**: subir o limite de e-mails por hora (ex.: 100).
- [ ] **Authentication → Emails → Templates**: traduzir para português “Confirm signup”, “Reset
      password” e “Change email address” (os links `{{ .ConfirmationURL }}` continuam iguais).
- [ ] **Authentication → Sign In / Providers → Email**: ligar **Confirm email**.
- [ ] Testar: criar uma conta nova, receber o e-mail, confirmar e cair na assinatura; testar
      também “Esqueci a senha”.

## 4. Cobrança real (Mercado Pago)

- [ ] Vercel: `PAYMENT_MODE=mercadopago` e `MP_ACCESS_TOKEN` com o Access Token **de produção**.
- [ ] Mercado Pago → Suas integrações → **Webhooks**: URL
      `https://lumenzia.com.br/api/webhooks/mercadopago`, evento “Planos e assinaturas”; copiar a
      assinatura secreta para `MP_WEBHOOK_SECRET`.
- [ ] Fazer uma assinatura real com um cartão próprio e cancelar a renovação depois.

## 5. WhatsApp: app da LumenzIA na Meta (Tech Provider)

A LumenzIA tem **um** app na Meta e **um** webhook; cada clínica conecta o próprio número pelo
botão **Conectar WhatsApp** (menu WhatsApp do painel), que usa o Cadastro Incorporado (Embedded
Signup) da Meta. O token de cada clínica fica no Vault.

1. **Portfólio empresarial**: em [business.facebook.com](https://business.facebook.com), criar (ou
   usar) o portfólio da LumenzIA e iniciar a **verificação da empresa** (CNPJ e documentos).
2. **App**: em [developers.facebook.com](https://developers.facebook.com/apps), criar um app do
   tipo **Business**, ligado a esse portfólio, e adicionar o produto **WhatsApp**.
3. **Variáveis** (Vercel):
   - [ ] `META_APP_ID`: App ID (App settings → Basic).
   - [ ] `META_APP_SECRET`: App Secret (mesma tela).
   - [ ] `WHATSAPP_VERIFY_TOKEN`: uma senha longa inventada por você (só serve para a Meta
         confirmar o webhook).
4. **App settings → Basic**: App domains com o domínio, Privacy Policy URL
   `https://lumenzia.com.br/privacidade`, ícone e categoria.
5. **WhatsApp → Configuration → Webhook**: Callback URL
   `https://lumenzia.com.br/api/webhooks/whatsapp` e o mesmo `WHATSAPP_VERIFY_TOKEN`. Assinar os
   campos:
   - **messages**;
   - **account_update** (avisa quando uma clínica remove a LumenzIA da conta dela, e a conexão é
     desligada sozinha);
   - **message_template_status_update** (aprovação e recusa das mensagens prontas);
   - **history**, **smb_app_state_sync** e **smb_message_echoes** (número que já usa o app
     WhatsApp Business: histórico de 6 meses, contatos e mensagens que a equipe manda pelo
     celular).
6. **Facebook Login for Business → Configurations**: criar uma configuração do tipo
   **WhatsApp Embedded Signup**, com os ativos “WhatsApp accounts” e as permissões
   `whatsapp_business_management` e `whatsapp_business_messaging`.
   - [ ] Copiar o **Configuration ID** para `META_EMBEDDED_SIGNUP_CONFIG_ID` na Vercel.
   - [ ] Em **Facebook Login for Business → Settings**: “Login with the JavaScript SDK” = Sim e,
         em “Allowed domains for the JavaScript SDK”, o domínio próprio e
         `https://lumenz-ia.vercel.app`.
7. **Testar antes da aprovação**: com o app em modo de desenvolvimento, só administradores e
   testadores do app conseguem concluir o Cadastro Incorporado. Conecte o número de teste da sua
   própria clínica pelo painel, ligue a assistente e mande uma mensagem.
8. **App Review**: pedir **Advanced Access** para `whatsapp_business_messaging` e
   `whatsapp_business_management`, com um vídeo mostrando o botão Conectar WhatsApp e uma
   mensagem sendo respondida. Concluir também a verificação de acesso de Tech Provider quando a
   Meta pedir.
9. **Publicar o app** (App Mode → Live).

Para cada clínica, depois que ela conectar:

- [ ] A clínica cadastra uma forma de pagamento da Meta na conta do WhatsApp Business dela
      (WhatsApp Manager → Configurações de pagamento); as conversas são cobradas pela Meta direto
      dela.
- [ ] Conferir em **Mensagens prontas** (painel da clínica) que o pacote da LumenzIA foi enviado e
      aprovado pela Meta. Ele é criado sozinho ao conectar; se algum ficar “Não enviada”, use
      **Criar as mensagens da LumenzIA** de novo. Os nomes digitados na aba **Templates** em
      /admin continuam valendo para quem já tinha.
- [ ] A clínica escolhe por onde a equipe é avisada (WhatsApp e/ou e-mail) e cadastra o contato em
      **Avisos e lembretes** no painel. O campo da aba **WhatsApp** em /admin continua valendo.

## 5b. Google Agenda (cada clínica conecta a própria conta)

1. Em [console.cloud.google.com](https://console.cloud.google.com), criar um projeto da LumenzIA
   e ativar a **Google Calendar API** (APIs e serviços → Biblioteca).
2. **Tela de consentimento OAuth** (Google Auth Platform): tipo **Externo**, nome LumenzIA, e-mail
   de suporte, logotipo, domínio `lumenzia.com.br`, links da página inicial e da política de
   privacidade. Escopos: `openid`, `email`, `.../auth/calendar.events`,
   `.../auth/calendar.freebusy` e `.../auth/calendar.calendarlist.readonly`.
3. **Clientes** → Criar cliente OAuth do tipo **Aplicativo da Web**, com o URI de
   redirecionamento `https://lumenzia.com.br/api/google/callback` (e o da Vercel, se for testar
   por lá).
   - [ ] `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel.
4. **Verificação do Google**: os escopos da agenda são “sensíveis”. Enquanto o app não for
   verificado, só os usuários de teste cadastrados na tela de consentimento conseguem conectar (até 100) e aparece um aviso de app não verificado. Pedir a verificação com um vídeo mostrando o
   botão **Conectar com o Google** em /painel/agenda e o uso da agenda; costuma levar alguns dias.

## 5b1. Clínica Experts (cada clínica conecta a própria chave)

Não precisa configurar nada na Vercel nem criar app: a clínica gera a chave de API no Clínica
Experts (**Configurações → Integrações**), clica em **Conectar** no cartão do Clínica Experts em
/painel/agenda e cola a chave. A LumenzIA testa a chave na hora (lista os profissionais), guarda no
Vault e mostra a escolha de profissionais. Com os profissionais ligados, a clínica liga a opção
**A assistente usa o Clínica Experts** (isso desliga o Google Agenda, se estava em uso).

Avisos em tempo real: depois da chave, o modal (e o cartão **Avisos em tempo real** na Agenda)
mostra um endereço exclusivo da clínica, `.../api/webhooks/clinica-experts/<código>`. A clínica
cadastra esse endereço nos webhooks do Clínica Experts com os eventos `booking.*`. A cada aviso, a
LumenzIA relê a agenda dos próximos dias pela API e atualiza a cópia local dos lembretes; o painel
mostra a hora do último aviso recebido.

- [ ] Testar com uma conta real: conectar, ligar os profissionais e, na conversa de teste do
      WhatsApp, pedir horários, marcar e cancelar. Se algo falhar, a mensagem completa da API fica
      nos logs da Vercel com o prefixo `[clinica experts]`.

## 5b2. Instagram (cada clínica conecta a própria conta)

Usa o **mesmo app** da Meta do WhatsApp, com o login do Instagram (a clínica não precisa de Página
do Facebook, só de uma conta **profissional**). As mensagens do Instagram não são cobradas pela
Meta.

1. No app da Meta: **Add product → Instagram → API setup with Instagram login**.
2. Em **Instagram → API setup with Instagram login**:
   - [ ] Copiar o **Instagram app ID** e o **Instagram app secret** (são diferentes do App ID e do
         App Secret do app) para `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` na Vercel.
   - [ ] **Set up Instagram business login → Business login settings**: em OAuth redirect URIs,
         `https://lumenz-ia.vercel.app/api/instagram/callback` (e, depois, o do domínio próprio).
   - [ ] **Configure webhooks**: Callback URL `https://lumenz-ia.vercel.app/api/webhooks/instagram`
         e verify token igual ao `INSTAGRAM_VERIFY_TOKEN` (se ficar vazio, vale o
         `WHATSAPP_VERIFY_TOKEN`). Assinar os campos **messages** e **comments**.
3. **Testar antes da aprovação**: com o app em modo de desenvolvimento, adicione a conta do
   Instagram de teste em **App roles → Roles → Instagram Testers** e aceite o convite no Instagram
   (Configurações → Apps e sites → Convites de testador). Depois conecte em **/painel/instagram**,
   ligue a assistente e mande uma mensagem no Direct de outra conta.
4. **App Review**: pedir **Advanced Access** para `instagram_business_basic`,
   `instagram_business_manage_messages` e `instagram_business_manage_comments`, com um vídeo
   mostrando o botão **Conectar com o Instagram**, uma mensagem do Direct sendo respondida e um
   comentário recebendo a resposta no privado. A Meta exige a verificação da empresa (a mesma do
   WhatsApp) e as URLs de política de privacidade e de exclusão de dados (a Vercel serve, não
   precisa de domínio próprio).

O token de cada clínica vale 60 dias e é renovado sozinho pelo job diário da agenda. Se vencer
(por exemplo, a clínica trocou a senha), a tela do Instagram pede para conectar de novo.

## 5c. Análise da IA

- [ ] Opcional: `GEMINI_INSIGHTS_MODEL` na Vercel para usar outro modelo na análise mensal (padrão
      `gemini-3.8-flash`). Usa a mesma `GEMINI_API_KEY`.

## 5d. Trocar de IA

`AI_PROVIDER` na Vercel escolhe quem responde no atendimento, na classificação e na análise:
`gemini` (padrão), `groq`, `deepseek`, `openrouter`, `openai` ou `custom` (com `AI_BASE_URL`). Os
que não são o Gemini usam `AI_API_KEY` e, se preciso, `AI_MODEL` / `AI_INSIGHTS_MODEL`. Depois de
trocar, faça **Redeploy** na Vercel. A `GEMINI_API_KEY` pode continuar salva para voltar quando
quiser. O provedor escolhido aparece em /admin/lancamento e no nome citado na política de
privacidade.

## 6. Conteúdo e jurídico

- [ ] Política de privacidade (`src/app/(site)/privacidade/page.tsx`): preencher os textos
      `[ENTRE COLCHETES]` com os dados da empresa e passar por revisão jurídica.
- [ ] Conferir preços e textos dos planos (`supabase/migrations/20261019000004_plans.sql` ou a
      tabela `plans` no Supabase).
- [ ] Dados do Lumia: decidido começar com o banco vazio, então não há migração do SQL Server.

## 7. Teste final (no domínio próprio)

- [ ] **/admin/lancamento** todo verde.
- [ ] Cadastro com confirmação de e-mail → assinatura real → passo a passo do painel.
- [ ] Conectar WhatsApp → ligar a assistente → mandar mensagem do celular → resposta da IA.
- [ ] Pedir atendimento humano → a conversa aparece em Conversas → assumir, responder, devolver.
- [ ] Marcar um horário pela IA (com a agenda configurada na aba **Agenda** em /admin) e receber
      o lembrete.
- [ ] Relatórios mostrando a conversa no dia seguinte (o job de classificação roda a cada 15 min).
