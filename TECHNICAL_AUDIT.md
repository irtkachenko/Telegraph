# 🔬 Технічний Аудит: Trace Messenger

> **Дата:** 12.03.2026  
> **Аудитор:** Senior Tech Lead / Frontend Architect (20+ років досвіду)  
> **Проект:** Trace — real-time месенджер  
> **Стек:** Next.js 15.1.6 · React 19 · Supabase · Drizzle ORM · TanStack Query · Zustand · Tailwind CSS v4

---

## 📋 Зміст

1. [Загальна оцінка](#1-загальна-оцінка)
2. [� СЕРЙОЗНІ проблеми](#3--серйозні-проблеми)
3. [🟡 СЕРЕДНІ проблеми](#4--середні-проблеми)
4. [🔵 РЕКОМЕНДАЦІЇ з масштабування](#5--рекомендації-з-масштабування)
5. [📐 Архітектурні зауваження](#6--архітектурні-зауваження)
6. [🗺️ План дій (Roadmap)](#7-%EF%B8%8F-план-дій-roadmap)

---

## 1. Загальна оцінка

| Категорія | Оцінка | Коментар |
|---|---|---|
| **Архітектура** | 8/10 | God-file видалено, правильна структура клієнтів |
| **Безпека** | 9/10 | Всі критичні вразливості виправлені |
| **Перформанс** | 5/10 | Нескінченні ре-рендери, витоки пам'яті, зайві підписки |
| **Масштабованість** | 6/10 | Хуки розбиті, але високий coupling залишається |
| **Типізація** | 9/10 | Всі `any` замінені на правильні типи |
| **Тестування** | 1/10 | Повна відсутність тестів |
| **DevOps / CI/CD** | 3/10 | Docker для dev, без production-ready конфігу |
| **DX (Developer Experience)** | 8/10 | Лінтери працюють, конфлікти вирішені |

**Загальна оцінка: 6.1 / 10** — критичні проблеми виправлені, проект готовий до development.



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
