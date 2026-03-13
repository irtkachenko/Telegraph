# 🔬 Технічний Аудит: Trace Messenger

> **Дата:** 12.03.2026  
> **Аудитор:** Senior Tech Lead / Frontend Architect (20+ років досвіду)  
> **Проект:** Trace — real-time месенджер  
> **Стек:** Next.js 15.1.6 · React 19 · Supabase · Drizzle ORM · TanStack Query · Zustand · Tailwind CSS v4

---

## 📋 Зміст

1. [Загальна оцінка](#1-загальна-оцінка)
2. [🔴 КРИТИЧНІ проблеми](#2--критичні-проблеми)
3. [🟠 СЕРЙОЗНІ проблеми](#3--серйозні-проблеми)
4. [🟡 СЕРЕДНІ проблеми](#4--середні-проблеми)
5. [🔵 РЕКОМЕНДАЦІЇ з масштабування](#5--рекомендації-з-масштабування)
6. [📐 Архітектурні зауваження](#6--архітектурні-зауваження)
7. [🗺️ План дій (Roadmap)](#7-%EF%B8%8F-план-дій-roadmap)

---

## 1. Загальна оцінка

| Категорія | Оцінка | Коментар |
|---|---|---|
| **Архітектура** | 5/10 | God-file антипатерн, відсутність чіткого шару абстракцій |
| **Безпека** | 4/10 | SQL-ін'єкція, витік сервіс-ключів, відсутність санітизації |
| **Перформанс** | 5/10 | Нескінченні ре-рендери, витоки пам'яті, зайві підписки |
| **Масштабованість** | 3/10 | Монолітні хуки, високий coupling, відсутність lazy loading |
| **Типізація** | 6/10 | `any` у критичних місцях, відсутність branded types |
| **Тестування** | 1/10 | Повна відсутність тестів |
| **DevOps / CI/CD** | 3/10 | Docker для dev, без production-ready конфігу |
| **DX (Developer Experience)** | 6/10 | Є лінтери, але конфлікти ESLint vs Biome |

**Загальна оцінка: 4.1 / 10** — проект потребує серйозного рефакторингу перед виходом у production.

---

## 2. 🔴 КРИТИЧНІ проблеми

### CRIT-01: SQL-ін'єкція через ilike без ескейпінгу

**Файл:** `src/hooks/useChatHooks.ts` (рядок ~254)

```typescript
// ❌ КРИТИЧНО: queryText підставляється безпосередньо у SQL
query = query.or(`name.ilike.%${queryText}%,email.ilike.%${queryText}%`).limit(10);
```

Якщо користувач введе `%` або `_` або `'`, злам ilike-патерну може дозволити витягнути дані, які не мали бути доступними. Supabase PostgREST передає ці значення напряму.

**Виправлення:**
```typescript
const sanitized = queryText.replace(/[%_\\]/g, '\\$&');
query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
```

---

### CRIT-02: Service Role Key потенційно доступний на клієнті

**Файл:** `src/lib/supabase.ts`

```typescript
// ❌ Цей файл не має 'use server' директиви і може потрапити в клієнтський бандл
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const supabaseService = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;
```

`SUPABASE_SERVICE_ROLE_KEY` **обходить Row Level Security (RLS)** і має повний доступ до БД. Якщо цей файл імпортується клієнтським компонентом навіть непрямо — ключ потрапить у бандл.

**Виправлення:**
- Видалити `src/lib/supabase.ts` повністю — у вас вже є правильна архітектура в `src/lib/supabase/server.ts`
- Service client створювати ТІЛЬКИ в server actions з явною директивою `'use server'`

---

### CRIT-03: `getSession()` замість `getUser()` у middleware — обхід автентифікації

**Файл:** `src/middleware.ts` (рядок 45)

```typescript
// ❌ Офіційна документація Supabase чітко говорить:
// "getSession reads from cookies. It's not guaranteed to be authenticated."
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user ?? null;
```

> ⛔ **УВАГА:** `getSession()` читає дані з cookie **без серверної валідації JWT**. Зловмисник може підробити cookie з довільним `user_id`. Використовуйте `getUser()` для серверної верифікації маркера.

**Виправлення:** Замінити на `getUser()` або використати `updateSession()` з `src/lib/supabase/middleware.ts`, який вже правильно реалізований, але **не використовується!**

---

### CRIT-04: Дублювання Supabase-клієнтів — хаотична архітектура авторизації

У проекті існує **4 різних способи** створення Supabase-клієнта:

| Файл | Тип | Використовується |
|---|---|---|
| `src/lib/supabase.ts` | Client (анонімний, без сесії) | Так (через хуки) |
| `src/lib/supabase/client.ts` | Browser Client (з SSR) — **правильний** | Частково |
| `src/lib/supabase/server.ts` | Server Client | Server Actions |
| `AuthProvider.tsx` | Ще один Browser Client | Контекст |

> ⚠️ Це означає, що у одному додатку одночасно існують клієнти з **різними конфігураціями авторизації** (один з `persistSession: false`, інший — з автоматичною). Це призводить до "фантомних" логаутів.

**Виправлення:** Залишити рівно **2 клієнти**: `client.ts` (browser) і `server.ts` (server). Видалити `src/lib/supabase.ts`.

---

### CRIT-05: `console.log` з дебаг-інформацією в production коді

**Файл:** `drizzle.config.ts` (рядок 8)

```typescript
console.log("--- DEBUG: Чи знайдено файл? ---", process.env.DATABASE_URL ? "ТАК" : "НІ");
```

**Файл:** `src/hooks/useChatHooks.ts` (рядок ~555)

```typescript
console.log('Deleting message:', messageId, 'Current user:', user?.id, 'Chat ID:', chatId);
console.log('Message ownership check:', { messageCheck, checkError });
console.log('Delete response:', { data, error });
```

> ⛔ `console.log` з ID користувачів, повідомлень, і даних запитів у production коді — пряме порушення GDPR та витік технічних деталей.

---

### CRIT-06: `ignoreDuringBuilds: true` для ESLint

**Файл:** `next.config.ts` (рядок 3-5)

```typescript
eslint: {
  ignoreDuringBuilds: true,  // ❌ Всі помилки проходять у продакшн
},
```

Це означає, що зламаний код потрапить у build **без жодної перевірки**.

---

### CRIT-07: Відсутня валідація `chatId` та `targetUserId` на сервері

**Файл:** `src/actions/chat-actions.ts` (рядок 68)

```typescript
export async function getOrCreateChatAction(targetUserId: string) {
  // ❌ Немає валідації, що targetUserId — це валідний UUID
  // ❌ Немає перевірки, що targetUserId ≠ myId (чат з самим собою)
}
```

```typescript
export async function markAsReadAction(chatId: string, messageId: string) {
  // ❌ Немає Zod-валідації вхідних параметрів
}
```

**Виправлення:** Використати Zod для валідації **кожного** server action:
```typescript
import { z } from 'zod';
const schema = z.object({
  targetUserId: z.string().uuid(),
});
```

---

## 3. 🟠 СЕРЙОЗНІ проблеми

### HIGH-01: God-файл `useChatHooks.ts` — 850 рядків

**Файл:** `src/hooks/useChatHooks.ts`

Один файл містить **850 рядків** і **12 різних хуків** (useChats, useMarkAsRead, useChatDetails, useMessages, useSearchUsers, usePresence, useChatTyping, useEditMessage, useSendMessage, useDeleteMessage, useDeleteChat, useUpdateLastSeen, useScrollToMessage).

> ⚠️ Це класичний God Object антипатерн. Будь-яка зміна в одному хуку призводить до ревалідації кешу усіх хуків у пам'яті. До того ж це унеможливлює code-splitting.

**Виправлення:** Розбити на окремі файли:
```
hooks/
├── chat/
│   ├── useChats.ts
│   ├── useChatDetails.ts
│   ├── useSendMessage.ts
│   ├── useDeleteMessage.ts
│   ├── useEditMessage.ts
│   ├── useDeleteChat.ts
│   └── useMarkAsRead.ts
├── messages/
│   ├── useMessages.ts
│   ├── useScrollToMessage.ts
│   └── useChatTyping.ts
├── contacts/
│   └── useSearchUsers.ts
└── user/
    ├── usePresence.ts
    └── useUpdateLastSeen.ts
```

---

### HIGH-02: Дублювання хуків `useAttachment` / `useOptimisticAttachment`

**Файли:**
- `src/hooks/useAttachment.ts` (130 рядків)
- `src/hooks/useOptimisticAttachment.ts` (195 рядків)

Обидва хуки виконують **ідентичну логіку**: завантаження файлу, стиснення зображення, створення preview URL, обробка помилок. `useOptimisticAttachment` — розширена версія `useAttachment` з прогрес-баром.

> ℹ️ `ChatInput.tsx` використовує `useAttachment`, не `useOptimisticAttachment` — тобто більш просунута версія з прогрес-баром **взагалі не використовується**!

**Виправлення:** Видалити `useAttachment.ts`, використовувати лише `useOptimisticAttachment.ts`.

---

### HIGH-03: Мертвий код — `src/components/layout/Sidebar.tsx`

**Файли:**
- `components/layout/Sidebar.tsx` — мертвий код з посиланнями на `/contacts`, `/profile`, `/settings` (ці маршрути **не існують**)
- `components/sidebar/Sidebar.tsx` — використовується

---

### HIGH-04: Витік пам'яті у `useEffect` без масиву залежностей

**Файл:** `src/components/Providers.tsx` (рядок 18-48)

```typescript
useEffect(() => {
  renderCount.current += 1;
  // ...
}); // ← Без масиву залежностей — спрацьовує КОЖЕН рендер
```

`RenderGuard` запускає `useEffect` на **кожен рендер** — в поєднанні з `toast` та `setTimeout`, це саме по собі може **спричинити** проблему, яку він покликаний вирішити.

---

### HIGH-05: `(window as any).__NEXT_ROUTER_STATE__` — undocumented API

**Файл:** `src/hooks/useGlobalRealtime.ts` (рядок 83)

```typescript
const routerState = (window as any).__NEXT_ROUTER_STATE__;
```

Це **внутрішній implementation detail** Next.js, який може зникнути в будь-якому оновленні. Використовується для визначення "активного чату".

**Виправлення:** Використати `useChatStore` (Zustand), який уже є в проекті, але **не з'єднаний** з цією логікою.

---

### HIGH-06: `actions/auth.ts` має `'use client'` замість `'use server'`

**Файл:** `src/actions/auth.ts` (рядок 1)

```typescript
'use client'; // ❌ Файл у папці actions з директивою CLIENT

export async function handleSignIn() { ... }
export async function handleSignOut() { ... }
```

Файл знаходиться в `actions/` (серверна конвенція), але має `'use client'` директиву. Це **не** server actions — це клієнтські функції, які помилково лежать в папці для серверних дій.

**Виправлення:** Перенести в `src/lib/auth.ts` або `src/utils/auth.ts`.

---

### HIGH-07: `any` типи у критичних місцях

**Файли з `any`:**

| Файл | Рядок | Контекст |
|---|---|---|
| `useGlobalRealtime.ts` | 174 | `channelRef = useRef<any>(null)` — Realtime channel |
| `chat-actions.ts` | 134 | `const updateData: any = {}` — Server Action DB update |
| `chat/[id]/page.tsx` | 101 | `const authUser = user as any` — Auth user casting |
| `OptimisticMessage.tsx` | 94 | `(att: any) => att.uploading` — Attachment type assertion |
| `useGlobalRealtime.ts` | 126 | `T extends (...args: any[])` — Throttle utility |

---

### HIGH-08: Неконтрольоване розповсюдження `queryClient.invalidateQueries`

Багато мутацій роблять `invalidateQueries` **після** оптимістичного оновлення, що спричиняє подвійне оновлення UI та "мигання" даних:

```typescript
// useSendMessage → onSuccess:
// Оптимістичне оновлення вже зроблено в onMutate
// А потім ще й invalidate який скасує оптимістичне оновлення

// useMarkAsRead:
onSuccess: (_, { chatId }) => {
  queryClient.invalidateQueries({ queryKey: ['chats'] });  // ← Перезапитує ВСІ чати
  queryClient.invalidateQueries({ queryKey: ['chat', chatId] }); // ← І конкретний
};
```

---

### HIGH-09: `wdyr.ts` в продакшн-лейауті

**Файл:** `src/app/layout.tsx` (рядок 1)

```typescript
import '@/wdyr'; // why-did-you-render — дев-інструмент імпортується ПЕРШИМ у ROOT layout
```

Хоч `wdyr.ts` має перевірку `process.env.NODE_ENV === 'development'`, сам **модуль** (`@welldone-software/why-did-you-render`) все одно потрапляє в production bundle, збільшуючи його розмір.

---

### HIGH-10: Конфлікт `visibilitychange` — подвійний cleanup

У проекті **два окремі компоненти** слухають `visibilitychange` і обидва викликають `cleanupPresence()`:

1. `GlobalCleanup.tsx` (рядок 18-21) — викликає `cleanupPresence()` при hidden
2. `usePresenceStore.ts` (рядок 219) — реєструє `handleVisibilityChange` який робить `updateLastSeen()`

Переключення вкладки вбиває **всі** realtime-підключення через `cleanupPresence()`, а потім їх треба заново створити коли вкладка стає активною (чого немає в коді).

---

## 4. 🟡 СЕРЕДНІ проблеми

### MED-01: Версія React розсинхронізована

**Файл:** `package.json`

```json
"dependencies": {
  "react": "19.0.0",        // Заявлена версія
  "react-dom": "19.0.0",
},
"pnpm": {
  "overrides": {
    "react": "19.2.3",      // ← Реальна! Різниця в 2 мінорні версії
    "react-dom": "19.2.3",
  }
}
```

Фактично використовується React 19.2.3, але `package.json` вказує 19.0.0. Це може створити проблеми при аудиті залежностей.

---

### MED-02: Ім'я проекту `"my-messenger"` замість `"trace"`

**Файл:** `package.json` (рядок 2)

```json
"name": "my-messenger",
```

---

### MED-03: Назва таблиці `'user'` — зарезервоване слово PostgreSQL

**Файл:** `src/db/schema.ts` (рядок 15)

```typescript
export const users = pgTable('user', { ... });
//                            ^^^^^ "user" — зарезервоване слово в PostgreSQL
```

Це працює в Supabase (бо він екранує), але може спричинити проблеми при raw SQL-запитах або міграціях.

---

### MED-04: Відсутній `Suspense` для `useSearchParams()`

**Файл:** `src/components/sidebar/SidebarShell.tsx` (рядок 13)

```typescript
const searchParams = useSearchParams();
```

Починаючи з Next.js 14+, `useSearchParams()` має бути обгорнутий в `<Suspense>`, інакше вся сторінка деоптимізується до client-side rendering.

---

### MED-05: `accept` у file input не відповідає `storage.config`

**Файл:** `src/components/chat/ChatInput.tsx` (рядок 168)

```html
<input accept="image/*,.pdf,.docx" />
```

Але `storage.config.ts` дозволяє `.zip`, `.rar`, `.7z`, `.txt`, `.doc`, `.mp4`, `.mov` тощо — вони тут відсутні.

---

### MED-06: `postcss` у `dependencies` замість `devDependencies`

**Файл:** `package.json` (рядок 39)

```json
"dependencies": {
  "postcss": "^8.5.6",  // ← Має бути в devDependencies
  "dotenv": "^17.2.3",  // ← Те саме — використовується лише в drizzle.config
}
```

---

### MED-07: `isRead` логіка в `ChatPage` — O(n) на кожне повідомлення

**Файл:** `src/app/chat/[id]/page.tsx` (рядок 239-253)

```typescript
isRead={
  message.sender_id === user?.id &&
  !!chat?.recipient_last_read_id &&
  (() => {
    const readMessage = messages.find(m => m.id === chat.recipient_last_read_id);
    // ↑ O(n) пошук для КОЖНОГО повідомлення = O(n²) загальна складність
    return readMessage ? ... : false;
  })()
}
```

При 1000 повідомлень це виконує **1,000,000 порівнянь**. Обчисліть `readMessageCreatedAt` один раз перед рендером.

---

### MED-08: Dockerfile для dev-режиму, не для production

**Файл:** `Dockerfile`

```dockerfile
CMD ["pnpm", "dev"]  # ← Production Dockerfile запускає dev-сервер!
```

Відсутні:
- Multi-stage build
- `next build` + `next start`
- `NODE_ENV=production`
- Оптимізація розміру образу (`standalone` output)

---

### MED-09: `docker-compose.yml` не передає env-змінні

**Файл:** `docker-compose.yml`

```yaml
environment:
  - NODE_ENV=development
  # ❌ Де Supabase URL/Key? Де DATABASE_URL?
```

---

### MED-10: Відсутній `ErrorBoundary` для сторінки чату

При помилці завантаження повідомлень або чату — весь додаток "лягає" через глобальний `GlobalErrorBoundary`. Потрібен **локальний** error boundary для окремих маршрутів.

---

### MED-11: `useChatStore.ts` — невикористаний store

**Файл:** `src/store/useChatStore.ts`

Файл експортує `useUIStore` з `activeChatId` та `isSidebarOpen`, але:
- `activeChatId` **не використовується** ніде в коді
- `isSidebarOpen` **не використовується** — замість нього `ChatLayoutWrapper` має свій локальний `useState`

---

### MED-12: `uniqueParticipants` обчислюється на кожен рендер

**Файл:** `src/app/chat/[id]/page.tsx` (рядок 94-145)

Складна IIFE для обчислення `uniqueParticipants` виконується **на кожен рендер** (кожне нове повідомлення, кожне натискання клавіші). Результат ніде не мемоїзується.

---

### MED-13: Дублювання інтерфейсу для `OptimisticMessageProps`

**Файл:** `src/components/chat/OptimisticMessage.tsx`

```typescript
// Оголошується ДВІЧІ (рядок 16 і рядок 88):
interface OptimisticMessageProps {
  message: Message & { is_optimistic?: boolean };
}
```

---

## 5. 🔵 РЕКОМЕНДАЦІЇ з масштабування

### SCALE-01: Feature-based структура проекту

Поточна структура — "за типом файлу" (components/, hooks/, store/). Для масштабування перейти на **feature-based**:

```
src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── actions/
│   │   └── types.ts
│   ├── chat/
│   │   ├── components/
│   │   │   ├── MessageBubble/
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   ├── MessageBubble.test.tsx
│   │   │   │   └── index.ts
│   │   │   ├── ChatInput/
│   │   │   └── MessageMediaGrid/
│   │   ├── hooks/
│   │   │   ├── useMessages.ts
│   │   │   ├── useSendMessage.ts
│   │   │   ├── useEditMessage.ts
│   │   │   └── useDeleteMessage.ts
│   │   ├── actions/
│   │   ├── store/
│   │   └── types.ts
│   ├── contacts/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── types.ts
│   ├── presence/
│   │   ├── hooks/
│   │   ├── store/
│   │   └── components/
│   └── storage/
│       ├── hooks/
│       ├── config/
│       └── types.ts
├── shared/
│   ├── ui/          # Загальні UI-компоненти (Button, Dialog тощо)
│   ├── lib/         # Утиліти (cn, date-utils)
│   ├── config/
│   └── types/
└── app/             # Next.js App Router
```

---

### SCALE-02: Абстрактний data-access шар

Зараз хуки напряму звертаються до `supabase.from('messages')`. При зміні провайдера (або додаванні кешування) — треба переписати **кожен** хук.

```typescript
// ❌ Зараз (тісна зв'язаність):
const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId);

// ✅ Після рефакторингу (loose coupling):
// src/features/chat/api/messages.api.ts
export const messagesApi = {
  getMessages: (chatId: string, cursor?: string) => { ... },
  sendMessage: (chatId: string, payload: SendMessagePayload) => { ... },
  deleteMessage: (messageId: string) => { ... },
};
```

---

### SCALE-03: Lazy loading для важких компонентів

```typescript
// ❌ Зараз — ImageModal, framer-motion завантажуються ОДРАЗУ
import ImageModal from './ImageModal';

// ✅ Lazy loading
const ImageModal = lazy(() => import('./ImageModal'));
```

Компоненти для lazy loading:
- `ImageModal.tsx` (8.5KB, framer-motion)
- `OptimisticMessage.tsx` (6.5KB)
- `ReactQueryDevtools` (вже lazy, ✅)
- `@welldone-software/why-did-you-render` — видалити з prod

---

### SCALE-04: Централізована обробка помилок

```typescript
// src/shared/lib/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
    public isOperational = true
  ) {
    super(message);
  }
}

export class AuthError extends AppError { ... }
export class ValidationError extends AppError { ... }
export class NetworkError extends AppError { ... }
```

---

### SCALE-05: Стратегія тестування

| Тип | Інструмент | Покриття |
|---|---|---|
| Unit | Vitest | Utils, date-utils, storage.config |
| Integration | Testing Library | Hooks (useSendMessage, useMessages) |
| Component | Storybook | UI компоненти (Button, Dialog, MessageBubble) |
| E2E | Playwright | Auth flow, Chat flow (відправка, видалення, реплай) |

Мінімум:
```
npm install -D vitest @testing-library/react @testing-library/jest-dom happy-dom
```

---

### SCALE-06: Proper env validation

```typescript
// src/shared/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

---

### SCALE-07: Rate limiting на Server Actions

`markAsReadAction` та `getOrCreateChatAction` не мають rate limiting. Зловмисник може DDoS-ити базу даних безпосередньо через виклик server actions.

---

### SCALE-08: Оптимізація бандлу

```
- dotenv: використовується лише в drizzle.config → видалити з dependencies
- @welldone-software/why-did-you-render: → видалити з dependencies, лише devDependencies
- lru-cache: імпортований але не використовується у клієнтському коді → перевірити використання
```

---

## 6. 📐 Архітектурні зауваження

### ARCH-01: Middleware — два варіанти, один мертвий

Існує два файли middleware:
1. `src/middleware.ts` — **використовується** (з помилкою `getSession`)
2. `src/lib/supabase/middleware.ts` — **НЕ використовується** (але реалізований правильно з `getUser()`)

---

### ARCH-02: Відсутній шар авторизаційних перевірок на клієнті

`useDeleteMessage` не перевіряє, чи `sender_id === user.id` перед відправкою запиту. RLS на сервері може це блокувати, але краще мати перевірку на клієнті для кращого UX.

---

### ARCH-03: Realtime-підписки без backoff стратегії

При втраті з'єднання `useChatRealtime` не має exponential backoff. `usePresenceStore` має reconnect, але з фіксованим множником `RECONNECT_DELAY * attempts` (лінійний, а не експоненційний).

---

### ARCH-04: Відсутня пагінація для чатів

`useChats()` завантажує **всі** чати користувача одним запитом. При 500+ чатах це стане критичною проблемою перфомансу.

---

### ARCH-05: XSS через `Linkify`

**Файл:** `src/components/chat/MessageBubble.tsx` (рядок 138-148)

`Linkify` конвертує URL у `<a>` теги автоматично. Якщо `message.content` містить `javascript:` URI або інші вектори атаки, це може стати XSS-уразливістю. Необхідна валідація `validate` опції для Linkify:

```typescript
<Linkify options={{
  validate: {
    url: (value) => /^https?:\/\//.test(value), // лише http(s) URL
  }
}}>
```

---

## 7. 🗺️ План дій (Roadmap)

### Фаза 1: 🔴 Критичні виправлення (1-2 дні)

- [ ] **CRIT-01**: Санітизація `queryText` в `useSearchUsers`
- [ ] **CRIT-02**: Видалити `src/lib/supabase.ts`, залишити лише `client.ts` + `server.ts`
- [ ] **CRIT-03**: Замінити `getSession()` на `getUser()` в middleware або використати `updateSession()` з `lib/supabase/middleware.ts`
- [ ] **CRIT-04**: Уніфікувати Supabase-клієнти (2 точки входу)
- [ ] **CRIT-05**: Видалити всі `console.log` — замінити на structured logging
- [ ] **CRIT-06**: Увімкнути ESLint при build (`ignoreDuringBuilds: false`)
- [ ] **CRIT-07**: Zod-валідація у server actions

### Фаза 2: 🟠 Серйозні виправлення (3-5 днів)

- [ ] **HIGH-01**: Розбити `useChatHooks.ts` на окремі файли
- [ ] **HIGH-02**: Видалити `useAttachment.ts`, використовувати `useOptimisticAttachment`
- [ ] **HIGH-03**: Видалити `components/layout/Sidebar.tsx` (мертвий код)
- [ ] **HIGH-04**: Виправити `RenderGuard` (або видалити)
- [ ] **HIGH-05**: Замінити `__NEXT_ROUTER_STATE__` на Zustand store
- [ ] **HIGH-06**: Перенести `actions/auth.ts` → `lib/auth.ts`
- [ ] **HIGH-09**: Видалити `wdyr.ts` з production layout імпортів
- [ ] **HIGH-10**: Уніфікувати `visibilitychange` — один handler

### Фаза 3: 🟡 Оптимізація (1-2 тижні)

- [ ] **MED-01**: Синхронізувати версії React
- [ ] **MED-05**: Синхронізувати `accept` з `storage.config`
- [ ] **MED-07**: Мемоїзувати `isRead` обчислення
- [ ] **MED-08**: Production Dockerfile з multi-stage build
- [ ] **MED-10**: Error boundaries по маршрутах (`error.tsx`)
- [ ] **MED-11**: Видалити невикористаний `useChatStore`
- [ ] **MED-12**: Мемоїзувати `uniqueParticipants` через `useMemo`

### Фаза 4: 🔵 Масштабування (2-4 тижні)

- [ ] **SCALE-01**: Feature-based структура
- [ ] **SCALE-02**: Data-access шар
- [ ] **SCALE-03**: Lazy loading важких компонентів
- [ ] **SCALE-05**: Налаштувати Vitest + компонентні тести
- [ ] **SCALE-06**: Env validation через Zod
- [ ] **SCALE-07**: Rate limiting на Server Actions

---

> ℹ️ Цей аудит зроблено на основі статичного аналізу коду. Для повної картини рекомендується також провести **runtime профілювання** (React DevTools Profiler), **bundle analysis** (`@next/bundle-analyzer`), та **penetration testing**.
