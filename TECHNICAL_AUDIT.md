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

### Критичні
1. **RLS-політики не зафіксовані в міграціях, при цьому весь доступ до даних іде напряму з клієнта.**
Вплив: якщо RLS не увімкнено або налаштовано неповно, будь-який автентифікований користувач може читати/змінювати чужі чати, повідомлення або файли. Це повний витік даних та порушення авторизації.
Доказ: прямий доступ через Supabase client (`src/services/chat/messages.service.ts`, `src/services/chat/chats.service.ts`), наявні лише гайди (`docs/supabase-rls-policies.md`, `docs/rls-setup-guide.md`), відсутні міграції в `supabase/`.
Рекомендація: перенести RLS-налаштування у SQL-міграції Supabase (файли в `supabase/migrations/`), додати перевірки в CI та smoke-тести з різними користувачами.

### Високі
1. **Авто-читання повідомлень логічно недосяжне.**
Вплив: read-receipts фактично не відпрацьовують. Умова вибору unread містить `!isMessageVisible`, а далі в критерії вимагається `isMessageVisible` — отже умова ніколи не стає істинною.
Доказ: `src/hooks/chat/useMessages.ts`.
Рекомендація: виправити фільтрацію на видимі повідомлення та повернути коректний cleanup (таймери не очищаються). Оптимально зробити один керований таймер для read-events або використати `IntersectionObserver` + debounce.

2. **Кешування signed URL у медіа-сітці не оновлює UI та не перевіряє TTL.**
Вплив: частина медіа може ніколи не перейти на валідний signed URL, а після TTL (1 год) — з’являються «биті» медіа. В `useMemo` залежності не змінюються, тому асинхронно отримані URL не потрапляють у рендер.
Доказ: `src/components/chat/MessageMediaGrid.tsx`.
Рекомендація: зберігати `processedUrls` у state, а не лише в `useRef`, або використовувати `useEffect` для оновлення. Додати refresh-перевірку за `expiresAt` і перезапитувати URL.

### Середні
1. **`useMessageViewTimer` створює interval поза `useEffect` і не очищає його.**
Вплив: витік таймерів при unmount, додаткові інтервали у Strict Mode, потенційне падіння продуктивності.
Доказ: `src/hooks/ui/useMessageViewTimer.ts`.
Рекомендація: ініціалізація та cleanup інтервалу через `useEffect`, з clearInterval у cleanup.

2. **`useScrollPosition` повертає статичні значення, що може зламати логику автопрочитування.**
Вплив: при виправленні авто-read, користувач буде вважатися «внизу» завжди, що призведе до хибного read-статусу.
Доказ: `src/hooks/ui/useScrollPosition.ts`.
Рекомендація: реалізувати реальне відстеження scroll стану Virtuoso (callbacks або ref).

3. **`beforeunload`-listener додається без коректного remove, можливі витоки.**
Вплив: при повторних ініціалізаціях presence може накопичуватися кілька listener-ів.
Доказ: `src/store/usePresenceStore.ts`.
Рекомендація: зберігати посилання на handler і видаляти його у cleanup.

4. **React Query Devtools підключено в продакшн-бандл.**
Вплив: зайва вага та потенційні витоки внутрішнього стану у продакшн-збірці.
Доказ: `src/components/Providers.tsx`.
Рекомендація: вмикати Devtools тільки у dev-режимі через `process.env.NODE_ENV` або dynamic import.

5. **Пагінація чатів неконсистентна через клієнтське сортування після `range()`.**
Вплив: на наступних сторінках можуть з’являтись чати, які логічно мають бути вище; можливі «дірки» в списку.
Доказ: `src/services/chat/chats.service.ts` + `src/hooks/chat/useChats.ts`.
Рекомендація: перенести сортування на сервер (наприклад, `updated_at` або computed `last_message_at`) і використовувати його для пагінації.

6. **Fallback для дозволених типів файлів включає статичні asset-розширення (css/js/fonts).**
Вплив: при помилці отримання bucket-конфіга клієнт може дозволити завантаження неочікуваних типів файлів.
Доказ: `src/app/api/storage/config/route.ts`, `src/config/storage.config.ts`.
Рекомендація: розділити списки для assets і attachments; для uploads мати окремий whitelist.

7. **Динамічний storage-конфіг читається через anon key, що може завжди падати у продакшні.**
Вплив: у продакшн-середовищі можна отримувати лише fallback-конфіг та некоректні ліміти.
Доказ: `src/app/api/storage/config/route.ts`, `src/lib/supabase/server.ts`.
Рекомендація: використовувати service role на сервері (лише в API-роуті), або кешувати валідний конфіг у env/DB.

8. **Немає атомарності між upload і записом повідомлення.**
Вплив: при помилці створення повідомлення файл залишається в storage як «сирота».
Доказ: `src/hooks/chat/useSendMessageWithFiles.ts`, `src/services/storage/storage.service.ts`.
Рекомендація: обгорнути upload+insert у серверну функцію, або реалізувати cleanup при помилці.

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

## 5. Тестування та CI
- Тестів у репозиторії немає (unit/e2e), CI-пайплайнів теж. Це створює високий ризик регресій при змінах.
- Рекомендація: мінімум smoke e2e (login, send message, upload), а також unit-тести для критичних hooks.

## 6. Пріоритетний план дій
1. Зафіксувати RLS у міграціях Supabase та додати базові security-тести.
2. Виправити read-receipts (логіка `useMessages`) + переписати `useMessageViewTimer` з cleanup.
3. Переробити кешування signed URL у `MessageMediaGrid` (state + TTL refresh).
4. Перенести сортування чатів на серверну сторону для стабільної пагінації.
5. Винести storage-конфіг у окремий whitelist для uploads та додати server-side джерело truth.
6. Прибрати devtools з production та чистити невикористані модулі/скрипти.

## 7. Додаткові покращення (опційно)
1. Додати аудит-лог для важливих дій (видалення повідомлень, файлові операції).
2. Впровадити серверні edge-функції для критичних транзакцій (upload + insert).
3. Уніфікувати всі сценарії upload у один pipeline (зменшить дублювання).

---

Якщо хочеш, можу одразу запропонувати конкретні патчі для найкритичніших пунктів і зібрати task-list для команди.

