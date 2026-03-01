# 🚀 Trace Project Template

Стабільний, високопродуктивний шаблон для сучасних веб-додатків на базі **Next.js 15** та **React 19**. Побудований з акцентом на "залізобетонну" архітектуру, швидкість розробки (DX) та повну ізоляцію середовища.

## 🛠 Технологічний стек
- **Framework:** Next.js 15 (App Router)
- **Runtime:** React 19 (з увімкненим **React Compiler**)
- **Language:** TypeScript (Strict mode)
- **Package Manager:** PNPM (Strict & Deterministic)
- **Linter/Formatter:** Biome (Rust-based speed) + Next Lint
- **Containerization:** Docker (Alpine Linux)
- **Backend:** Supabase (PostgreSQL + Realtime)

## 🏗 Архітектурні особливості

### 1. Ізоляція середовища (Docker)
Для забезпечення **Cross-Platform Stability** проект запускається в Docker. Це гарантує ідентичність версій Node.js та PNPM незалежно від ОС хоста, запобігаючи помилкам файлової системи Windows.

* **Запуск проекту:** ```bash
  docker-compose up -d --build

* **Зупинка проекту:** ```bash
  docker-compose down

* **Встановлення залежностей:** ```bash
  docker exec -it trace-app pnpm install

### 2. Стабільність пакетів (Strict PNPM)
Проект налаштований через `.npmrc` для запобігання "фантомним залежностям":
- `shamefully-hoist=false`: Забороняє імпорт бібліотек, які не прописані в `package.json`.
- `strict-peer-dependencies=true`: Блокує встановлення при конфліктах версій.
- `engine-strict=true`: Гарантує роботу лише на сумісних версіях Node.js (>=20).
- `frozen-lockfile=true`: Забезпечує детермінованість — інсталяція пакетів відбувається строго за лок-файлом без його випадкової зміни.

### 3. React Compiler
Використовується експериментальна фіча `reactCompiler: true`. Більше не потрібно вручну використовувати `useMemo` та `useCallback`. Компілятор автоматично оптимізує рендеринг компонентів.

### 4. Подвійний контроль якості
Ми об'єднали **Biome** (швидкість) та **Next Lint** (глибина):
- Biome миттєво виправляє форматування та базові помилки.
- Next Lint перевіряє специфічні правила фреймворку перед деплоєм.

## 🚀 Команди розробки

| Команда | Опис |
| :--- | :--- |
| `pnpm setup` | **Безпечне встановлення.** Використовує `--frozen-lockfile`, гарантуючи ідентичність версій. |
| `pnpm dev` | Запуск сервера розробки з двигуном **Turbopack** (максимальна швидкість). |
| `pnpm format` | Швидке виправлення стилю коду через Biome. |
| `pnpm check` | **Повна перевірка:** Biome + Next Lint. Виконувати перед кожним commit-ом. |
| `pnpm build` | Збірка проекту для продакшну. |
| `pnpm add-pkg` | Аліас для `pnpm add`. Використовувати для додавання нових залежностей. |

## ⚙️ Налаштування оточення

Створіть файл `.env.local` у корені проекту:

```ini
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key


## 🔐 Налаштування авторизації (Google OAuth)

Для роботи входу через Google необхідно налаштувати проект у [Google Cloud Console](https://console.cloud.google.com/).

### 1. Google Cloud Platform
- Створіть новий проект з назвою **Trace**.
- Перейдіть у **APIs & Services > OAuth consent screen**:
  - Тип: **External**.
  - Додайте свою пошту в **Test Users** (обов'язково для режиму розробки).
- Перейдіть у **Credentials**:
  - Натисніть **Create Credentials > OAuth client ID**.
  - Тип додатку: **Web application**.
  - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`

### 2. Змінні оточення (.env.local)
Створіть файл `.env.local` у корені проекту та додайте наступні ключі:

```env
# Google OAuth Keys
AUTH_GOOGLE_ID=ваш_client_id_з_google_console
AUTH_GOOGLE_SECRET=ваш_client_secret_з_google_console

# Auth.js Config
# Згенеруйте секрет командою: npx auth secret
AUTH_SECRET=ваш_згенерований_секрет
NEXTAUTH_URL=http://localhost:3000
```
