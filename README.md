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
8. Admin e produção
