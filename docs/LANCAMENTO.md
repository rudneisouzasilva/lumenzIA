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
- [ ] Preencher o WhatsApp da equipe (aba **WhatsApp**) para os avisos de atendimento humano.

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

## 5c. Análise da IA

- [ ] Opcional: `GEMINI_INSIGHTS_MODEL` na Vercel para usar outro modelo na análise mensal (padrão
      `gemini-2.5-flash`). Usa a mesma `GEMINI_API_KEY`.

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
