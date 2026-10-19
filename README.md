# LumenzIA

Assistente de IA no WhatsApp para clínicas de estética: site, assinatura, painel da clínica, atendimento
humano e o motor da IA (Google Gemini). É a reconstrução do Lumia com uma stack mais moderna.

## Stack

- **Next.js 16** (App Router, Cache Components) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (Radix) + **Lucide** + **Motion** (animações) + **next-themes** (claro/escuro)
- **Supabase**: Postgres com RLS, Auth, Storage, Realtime, Vault e pg_cron (entra na etapa 2)
- Hospedagem na **Vercel**

## Rodando localmente

Requer Node.js 22 (veja `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # preencha conforme as etapas forem ligando cada serviço
npm run dev
```

Acesse http://localhost:3000.

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

1. Fundação (este passo): Next.js, design system, lint, CI
2. Banco e segurança: Supabase, migrações, RLS, Storage, Vault
3. Site público: home animada, planos, privacidade
4. Contas e assinatura: Supabase Auth + Mercado Pago
5. Painel de configuração da assistente
6. Motor da IA: Gemini, agenda, webhook do WhatsApp
7. Atendimento em tempo real e analytics
8. Admin e produção
