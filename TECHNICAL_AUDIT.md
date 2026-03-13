# 🔬 Технічний Аудит: Trace Messenger

> **Дата:** 12.03.2026  
> **Аудитор:** Senior Tech Lead / Frontend Architect (20+ років досвіду)  
> **Проект:** Trace — real-time месенджер  
> **Стек:** Next.js 15.1.6 · React 19 · Supabase · Drizzle ORM · TanStack Query · Zustand · Tailwind CSS v4

---

## 📋 Зміст

1. [Загальна оцінка](#1-загальна-оцінка)
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

