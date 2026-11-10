# Modelos de e-mail do Supabase Auth

E-mails de autenticação com a identidade da LumenzIA, em português, feitos com tabelas e CSS
inline para funcionar no Gmail, Outlook, Apple Mail e celular. A logo vem de
`https://lumenzia.com.br/email/lumenzia-icone.png` (arquivo `public/email/lumenzia-icone.png`).

## Como aplicar em produção

Supabase → **Authentication → Emails → Templates**. Em cada aba, cole o assunto e o HTML
inteiro do arquivo (troque para a visão de código, apague o que estiver lá e cole):

| Aba no painel        | Assunto                                                  | Arquivo                |
| -------------------- | -------------------------------------------------------- | ---------------------- |
| Confirm signup       | Confirme seu e-mail para ativar sua conta na LumenzIA    | `confirmacao.html`     |
| Reset password       | Redefina sua senha da LumenzIA                           | `redefinir-senha.html` |
| Change email address | Confirme a troca do seu e-mail na LumenzIA               | `troca-email.html`     |
| Magic link           | Seu link de acesso à LumenzIA                            | `link-de-acesso.html`  |
| Invite user          | Você recebeu um convite para a LumenzIA                  | `convite.html`         |
| Reauthentication     | Seu código de confirmação da LumenzIA: {{ .Token }}      | `reautenticacao.html`  |

Hoje o app usa de fato **Confirm signup** e **Reset password**. Os outros estão prontos para
quando forem usados (o convite da equipe do painel tem link próprio e não passa pelo Supabase).

## Links

Os botões não usam `{{ .ConfirmationURL }}`. Eles apontam para
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...&next=...`, que a rota
`src/app/auth/confirm/route.ts` já aceita. Assim o link funciona mesmo se a pessoa abrir o e-mail
em outro aparelho ou navegador (o link padrão, com `?code=`, só funciona no navegador onde a conta
foi criada). Para isso, em **Authentication → URL Configuration**, o **Site URL** precisa ser
`https://lumenzia.com.br`.

Depois de confirmar o cadastro a pessoa vai para `/assinatura`; depois de redefinir a senha, para
`/redefinir-senha`; nos demais casos, para `/painel`. Os links valem por 1 hora (`otp_expiry`).

Localmente, o `supabase/config.toml` já aponta para estes arquivos.
