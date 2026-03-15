# Технічний аудит проєкту Trace

Дата аудиту: 15.03.2026

## 1. Обсяг та методологія
Аудит виконано як статичний code review без запуску застосунку, без виконання тестів і без доступу до продакшн-інфраструктури. Перевірено структуру проєкту, конфігурації Next.js, клієнтські та серверні інтеграції Supabase, бізнес-логіку чату, realtime/presence, storage, валідації, обробку помилок та DX-інструменти.

## 2. Короткий огляд архітектури
- Фреймворк: Next.js (App Router), React 19, TypeScript.
- Data layer: Supabase (PostgreSQL + Realtime + Storage), доступ без власного бекенду (клієнтський SDK).
- State & cache: TanStack Query + Zustand (presence).
- UI: Tailwind CSS + Radix UI, virtualized lists через `react-virtuoso`.

Ключові контури:
- `src/app` — сторінки, API-роути, layout.
- `src/services` — Supabase API / Storage / Realtime.
- `src/hooks` — логіка чату, realtime, storage, UX-логіка (scroll, read-receipts).
- `src/lib` + `src/shared/lib` — валідації, rate limit, error handling.
- `supabase/` + `docs/` — конфіг Supabase і RLS-гайди.

## 3. Сильні сторони
1. Добре структуровані шари (services/hooks/components) з чітким розподілом відповідальностей.
2. Централізована обробка помилок та retry-логіка для React Query. (`src/shared/lib/error-handler.ts`, `src/lib/query-client.ts`)
3. Продумана UX-логіка для чату: virtualization, optimistic UI, reply/edit, typing/presence.
4. Спроби контролю rate limiting на клієнті для ключових операцій. (`src/lib/rate-limit-decorator.ts`)

## 4. Знахідки та ризики (за пріоритетом)

### Низькі
1. **Невикористані/застарілі модулі та дублювання логіки.**
Вплив: складніше підтримувати, більше ризику розходження логіки.
Доказ: `src/hooks/chat/useChatTyping.ts`, `src/hooks/useOptimisticAttachment.ts`, `src/hooks/useLocalFileSelection.ts`, `src/services/chat/messages.service.ts` (метод `markAsRead` не використовується).
Рекомендація: видалити або уніфікувати, залишивши один шлях для upload/typing/read.

2. **Скрипт перевірки rate limit посилається на неіснуючий API.**
Вплив: тест не працює та вводить в оману.
Доказ: `scripts/test-rate-limit.ts`.
Рекомендація: або реалізувати `/api/upload`, або прибрати/оновити скрипт.

3. **`supabase/config.toml` посилається на seed-файл, якого немає.**
Вплив: локальний reset/seed не працюватиме.
Доказ: `supabase/config.toml`.
Рекомендація: додати `supabase/seed.sql` або прибрати запис з конфігу.

4. **Відсутня явна валідація env-конфігів.**
Вплив: у разі відсутніх env змінних — runtime-краш без зрозумілого повідомлення.
Доказ: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`.
Рекомендація: додати централізовану перевірку env із `ConfigError`.


