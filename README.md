# Telegraf

## 1. What This Project Is

Telegraph is a realtime 1:1 messaging web application built on Next.js App Router and Supabase.

Core capabilities:
- Google OAuth login via Supabase Auth
- Chat list + chat detail with realtime message updates
- Message create/edit/delete + read markers
- Typing indicator + online presence
- File attachments via Supabase Storage (private bucket + signed URLs)

## 2. Tech Stack

- Runtime: Node.js `>=22`
- Package manager: `pnpm >=10`
- Frontend: Next.js `16`, React `19`, TypeScript `5`
- State/query: TanStack Query, Zustand
- UI: Tailwind CSS v4, Radix UI, Framer Motion
- Backend services: Supabase (Postgres, Auth, Storage, Realtime)

## 3. High-Level Architecture

Client layers:
1. `components/` -> view/UI and user interaction
2. `hooks/` -> app workflows (queries, mutations, realtime orchestration)
3. `services/` -> thin API access layer over Supabase client
4. `store/` -> global client state (presence/storage caches)

Server/infra layers:
1. Next.js route handlers (`src/app/api/...`) for server-side config endpoints
2. Supabase SQL migrations in `supabase/migrations/`
3. Supabase RPC + RLS policies enforcing DB-side access logic

Routing model:
- `src/proxy.ts` acts as middleware/proxy gate for auth-based redirects
- Public routes: `/`, `/auth/*`
- Protected routes: `/chat`, `/chat/[id]`

## 4. Request/State Flows

Auth flow:
1. User clicks sign-in (`handleSignIn`)
2. Supabase OAuth redirect
3. `/auth/callback` exchanges auth code for session
4. Proxy redirects authenticated users to `/chat`

Chat/messages flow:
1. Hooks read via `services/chat/*`
2. Data cached by React Query (`['chats']`, `['chat', id]`, `['messages', id]`)
3. Realtime channel (`useChatsRealtime`) patches caches on INSERT/UPDATE/DELETE

Presence flow:
1. `useGlobalRealtime` subscribes once user is authenticated
2. `usePresenceStore` maintains singleton realtime presence channel
3. Heartbeat and reconnect strategy handle transient disconnects

Attachment flow:
1. Client validates files (`useStorageLimits`)
2. Files uploaded to private `attachments` bucket
3. Signed URLs are generated and cached in Zustand store
4. Message stores attachment metadata in `messages.attachments`

## 5. Directory Guide

- `src/app/` -> App Router pages and route handlers
- `src/components/` -> UI components by feature
- `src/hooks/` -> data/realtime/business hooks
- `src/services/` -> Supabase calls grouped by domain
- `src/lib/` -> shared utilities and adapters
- `src/store/` -> Zustand stores
- `src/types/` -> app and generated DB types
- `supabase/migrations/` -> schema, policies, RPCs, rate limits
- `scripts/` -> helper scripts for DB migrations and type generation
- `docs/` -> additional design/implementation notes

## 6. Environment Variables

Copy `.env.example` to `.env.local` and set at minimum:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Optional (server-only):

```env
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Notes:
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
- `NEXT_PUBLIC_*` variables are bundled for browser runtime.

## 7. Local Development

Install dependencies:

```bash
pnpm setup
```

Run dev server:

```bash
pnpm dev
```

Build production bundle:

```bash
pnpm build
pnpm start
```

## 8. Package Scripts

- `pnpm dev` -> Next dev server
- `pnpm build` -> production build
- `pnpm start` -> run production server
- `pnpm lint` -> ESLint for `src`
- `pnpm format` -> format `src` via Biome
- `pnpm check` -> Biome check (with write) + ESLint
- `pnpm setup` -> install dependencies (non-frozen, rolling mode)
- `pnpm bootstrap` -> install + regenerate Supabase TS types
- `pnpm deps:update` -> bump dependencies to latest allowed versions
- `pnpm verify` -> lint + typecheck + production build
- `pnpm generate-types` -> regenerate `src/types/supabase.ts`
- `pnpm push-migrations` -> link Supabase project + push migrations

## 9. Database and Type Workflow

Migrations:
- SQL files are in `supabase/migrations/`.
- Apply with `pnpm push-migrations`.

Type generation:
- `pnpm generate-types` writes generated schema types to `src/types/supabase.ts`.
- Run this after schema/RPC changes.

## 10. Quality and Validation Commands

Recommended before merge:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm audit --prod
```

## 11. Docker

Development (hot reload):

```bash
docker-compose up -d --build
```

Stop dev stack:

```bash
docker-compose down
```

Production-like local run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Stop prod stack:

```bash
docker compose -f docker-compose.prod.yml down
```

## 12. Live Demo

The project is deployed on Vercel and accessible at:
https://telegraph-five-zeta.vercel.app/

