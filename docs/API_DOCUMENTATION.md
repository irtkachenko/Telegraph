# Trace API Documentation

## Server APIs

### `/api/storage/config` (GET)
Отримує конфігурацію сховища - ліміти файлів, дозволені формати, налаштування бакетів

### `/auth/callback` (GET) 
Обробляє OAuth callback після входу в систему

---

## Client Services

### Chat API
- `getChats()` - отримати список чатів користувача
- `createChat()` - створити новий чат
- `deleteChat()` - видалити чат
- `updateChat()` - оновити назву чату

### Messages API  
- `getMessages()` - отримати повідомлення в чаті
- `sendMessage()` - відправити повідомлення
- `editMessage()` - редагувати повідомлення
- `deleteMessage()` - видалити повідомлення

### Contacts API
- `searchUsers()` - пошук користувачів за іменем/email

### Storage API
- `uploadFile()` - завантажити файл
- `getPublicUrl()` - отримати публічне посилання
- `getSignedUrl()` - отримати тимчасове посилання
- `deleteFiles()` - видалити файли

### User API
- `updateLastSeen()` - оновити час останньої активності

---

## Database Functions

- `update_last_seen()` - оновити last_seen користувача
- `touch_chat_updated_at()` - оновити час чату при новому повідомленні
- `check_action_limit()` - перевірити ліміти дій
- `mark_chat_as_read()` - позначити чат прочитаним

---

## Realtime

### Channels
- `messages:global` - всі повідомлення
- `chat:{id}` - конкретний чат
- `presence` - статус користувачів онлайн

### Events
- `postgres_changes` - зміни в базі даних
- `broadcast/typing` - індикатори набору тексту
