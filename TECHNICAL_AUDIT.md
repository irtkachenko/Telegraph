# Технічний аудит проєкту Trace

Дата аудиту: 2026-03-16

## 1) Короткий висновок
Проєкт має добре структуровану фронтенд‑архітектуру (Next.js App Router + Supabase + React Query + Zustand) і охайні практики обробки помилок. Водночас є кілька критичних/високих ризиків у безпеці та даних (SQL‑RPC з `security definer`, міграції для `storage.objects`, можливі секрети у `.env.local`), а також суттєві проблеми якості текстових ресурсів (помітні артефакти кодування у багатьох файлах). Також відсутні тести та CI, є неузгодженості у версіях/документації, і потенційні перформанс‑тривоги в real‑time/Presence частині.

## 2) Область і методологія
Огляд виконаний як статичний аудит:
- Аналіз структури репозиторію та конфігурацій.
- Ручний перегляд ключових модулів (auth, realtime, storage, middleware, API routes, DB міграції).
- Без запуску тестів/лінтування/збірки.

## 3) Архітектура та стек
**Фронтенд**
- Next.js (App Router), React 19, TypeScript.
- React Query для серверного стану.
- Zustand для Presence.
- Tailwind CSS 4, Radix UI, Framer Motion.

**Бекенд/дані**
- Supabase (PostgreSQL, Auth, Storage, Realtime).
- Використання `@supabase/ssr` для клієнта/сервера.

**Інфраструктура**
- Docker dev‑контейнер.
- Supabase CLI (міграції/типи).

## 4) Ключові знахідки (за пріоритетом)

### Критичні
1. **Можливе обходження RLS у RPC‑функціях (security definer)**
   - Функції `rpc_send_message`, `rpc_create_chat` і частково `rpc_edit_message`/`rpc_delete_message` створені як `security definer`.
   - Якщо власник функцій має `bypassrls`, RLS може не застосовуватись. У такому разі доступ контролюється лише логікою всередині функції.
   - У `rpc_send_message` і `rpc_create_chat` **немає явної перевірки** членства користувача у чаті/існування recipient у `users`.
   - Ризик: користувач може створювати чати/повідомлення у сторонніх чатах при некоректній конфігурації ролей.
   - Рекомендація: або перейти на `SECURITY INVOKER`, або додати явні перевірки членства в кожну RPC (і/або примусово `set row_security = on`).
   - Файли: `supabase/migrations/20260316090000_rate_limits_and_client_id.sql`.

2. **Міграції для `storage.objects` можуть падати на hosted Supabase**
   - У міграції `20260315000000_rls_policies.sql` створення політик на `storage.objects` без захисту `DO $$ ... EXCEPTION ...`.
   - На hosted Supabase це часто завершується помилкою “must be owner of table objects”.
   - Результат: міграція може зупинити весь пайплайн.
   - Рекомендація: винести створення цих політик у окремий скрипт для ручного застосування або обгорнути у `DO $$` з `EXCEPTION` як у пізнішій міграції.

### Високі
3. **Секрети/ключі у `.env.local` присутні у робочій копії**
   - Файл `.env.local` містить реальні значення Supabase URL та anon‑key.
   - Anon‑key формально публічний, але на практиці все одно небажано комітити `.env.local`.
   - Коментарі про Google OAuth ключі також можуть випадково потрапити в репозиторій.
   - Рекомендація: переконатися, що `.env.local` не відслідковується git, прибрати з історії при потребі, зберігати лише `.env.example`.

4. **Артефакти кодування (UTF‑8/CP1251) по всьому репозиторію**
   - README, Dockerfile, UI‑рядки, коментарі, `.env.example` містять “ламані” символи.
   - Це може впливати на UX, документацію і підтримку.
   - Рекомендація: уніфікувати кодування до UTF‑8 і прогнати перекодування файлів.
   - Файли: `README.md`, `Dockerfile`, `src/components/GlobalErrorBoundary.tsx`, `src/components/Providers.tsx`, `src/app/chat/[id]/page.tsx`, `.env.example`, `scripts/*.mjs`, інші.

### Середні
5. **Можлива проблема порядку міграцій для `updated_at`**
   - `messages_updated_at_trigger` створюється раніше, ніж додається `chats.updated_at`.
   - Якщо колонка не існувала раніше, створення функції/тригера може зламатися.
   - Рекомендація: або переставити міграції, або додати `add column if not exists` перед створенням функції.

6. **Накопичення таблиці `rate_limits` без GC**
   - Таблиця росте без очищення. Це може повільнити `check_action_limit`.
   - Рекомендація: додати scheduled job (Supabase cron/edge function) для видалення старих вікон.

7. **Неповна узгодженість версій у документації**
   - README говорить про Next.js 15, але `package.json` містить Next 16.1.6.
   - Рекомендація: синхронізувати документацію з фактичними версіями.

8. **Відсутні автоматичні тести та CI**
   - У репозиторії немає тестової інфраструктури або CI‑конфігурації.
   - Рекомендація: додати базові e2e/інтеграційні тести та pipeline (GitHub Actions).

### Низькі
9. **Неприбрані/неоднозначні lint‑disable**
   - Є `eslint-disable` для React Compiler або set‑state‑in‑effect.
   - Це може приховувати регресії.
   - Рекомендація: ізолювати ці випадки, задокументувати причини, по можливості рефакторити.

10. **Мінорні дублікати/неточності**
   - Подвійний коментар у `storage.config.ts`.
   - Невикористаний імпорт `toast` у `lib/supabase/client.ts`.

## 5) Безпека
- **Auth‑шар:** Next middleware коректно захищає приватні маршрути (`/chat`) та публічні (`/auth`), але ці перевірки — це UI‑рівень, не заміна RLS.
- **RLS:** політики сформовані грамотно, але важливо перевірити, чи `security definer` RPC не обходить їх.
- **Storage:** правила `storage.objects` — сильні, але застосування в hosted середовищі проблемне (див. критичні знахідки).
- **Secrets:** `.env.local` має не потрапляти у git.

## 6) Продуктивність і real‑time
- Presence менеджер продуманий (debounce + heartbeat + cleanup), але:
  - “last seen” викликається у `beforeunload`/`visibilitychange`; браузер може не завершити запит. Для підвищення надійності можна додати `navigator.sendBeacon`.
  - Реконект з експоненційним backoff є, але немає випадкового jitter (можливий «thundering herd» при масових reconnect).
- `React.Profiler` у dev‑режимі — хороший інструмент, але вимагає перевірки на “зайвий шум” у dev UX.

## 7) Дані та БД
- Політики RLS на `users/chats/messages` покривають основні сценарії.
- RPC‑функції реалізують rate‑limit та логику критичних операцій.
- Ризик: `security definer` + відсутність явної перевірки членства в RPC (див. критичні).
- Рекомендується також додати індекси на `messages.chat_id`, `messages.created_at`, `chats.user_id/recipient_id`, якщо їх ще немає у схемі.

## 8) DX та підтримка
- Відсутній `engines` у `package.json`, але `engine-strict=true` у `.npmrc`. Це може викликати неочікувані відмови встановлення.
- Рекомендація: додати `engines` (Node + pnpm), або вимкнути strict‑режим.
- Документація має кодування з проблемами, потрібна чистка.

## 9) Ризики релізу
Перед production‑запуском необхідно:
- Переконатися, що RLS не обходиться `security definer`.
- Прибрати `.env.local` з історії репозиторію.
- Виправити encoding, щоб не мати “битих” рядків у UI.
- Додати мінімальні тести.

## 10) Рекомендований план робіт (перші 7–14 днів)
1. **Безпека**: Переписати RPC на `SECURITY INVOKER` або додати явні перевірки членства + `set row_security = on`.
2. **Міграції**: Виправити `storage.objects` політики і порядок `updated_at` міграцій.
3. **Секрети**: Очистити git‑історію від `.env.local`, підтвердити `.gitignore`.
4. **Кодування**: Конвертувати усі тексти в UTF‑8.
5. **Тести/CI**: мінімальний pipeline + smoke тест для auth/chat flow.
6. **Документація**: синхронізувати README з фактичними версіями.

## 11) Перелік переглянутих файлів (неповний)
- `package.json`, `tsconfig.json`, `eslint.config.mjs`, `biome.json`, `next.config.ts`
- `src/middleware.ts`, `src/lib/supabase/*.ts`, `src/components/auth/AuthProvider.tsx`
- `src/app/auth/callback/route.ts`, `src/app/api/storage/config/route.ts`
- `src/store/usePresenceStore.ts`, `src/hooks/useGlobalRealtime.ts`
- `src/services/chat/*.ts`, `src/services/storage/storage.service.ts`
- `supabase/migrations/*.sql`, `supabase/config.toml`
- `Dockerfile`, `docker-compose.yml`, `.env.example`, `.env.local`

---

Якщо потрібно, можу доповнити аудит конкретним планом виправлень із оцінками часу або перейти до виправлення найкритичніших пунктів прямо в коді.
