import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Attachment } from '@/types';

// --- ТАБЛИЦЯ КОРИСТУВАЧІВ ---
export const users = pgTable(
  'user',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    image: text('image'),
    last_seen: timestamp('last_seen', { mode: 'date' }).defaultNow(),
    email_verified: timestamp('emailVerified', { mode: 'date' }),
    
    // Додаткові поля для кращого UX
    is_online: boolean('is_online').default(false),
    status: text('status').default('offline'), // 'online', 'away', 'offline'
    status_message: text('status_message'),
    
    // OAuth дані для кешування
    provider: text('provider'), // 'google', 'github', 'email'
    provider_id: text('provider_id'),
    
    // Налаштування
    preferences: jsonb('preferences').$type<UserPreferences>(),
    theme: text('theme').default('system'), // 'light', 'dark', 'system'
    
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    emailIdx: index('idx_user_email').on(table.email),
    providerIdx: index('idx_user_provider').on(table.provider, table.provider_id),
    lastSeenIdx: index('idx_user_last_seen').on(table.last_seen),
  }),
);

interface UserPreferences {
  notifications: {
    email: boolean;
    push: boolean;
    sound: boolean;
  };
  privacy: {
    show_online_status: boolean;
    show_last_seen: boolean;
  };
  chat: {
    enter_to_send: boolean;
    show_timestamps: boolean;
  };
}

// --- ТАБЛИЦЯ ЧАТІВ ---
export const chats = pgTable(
  'chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipient_id: uuid('recipient_id').references(() => users.id, { onDelete: 'cascade' }),

    user_last_read_id: uuid('user_last_read_id').references((): AnyPgColumn => messages.id, {
      onDelete: 'set null',
    }),
    recipient_last_read_id: uuid('recipient_last_read_id').references(
      (): AnyPgColumn => messages.id,
      { onDelete: 'set null' },
    ),

    title: text('title').notNull().default('New Chat'),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    // Для швидкого виведення списку чатів конкретного юзера
    userRecipientIdx: index('idx_chats_users').on(table.user_id, table.recipient_id),
  }),
);

// --- ТАБЛИЦЯ ПОВІДОМЛЕНЬ ---
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chat_id: uuid('chat_id')
      .notNull()
      .references((): AnyPgColumn => chats.id, { onDelete: 'cascade' }),
    sender_id: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content'),
    attachments: jsonb('attachments').$type<Attachment[]>().notNull().default([]),
    reply_to_id: uuid('reply_to_id').references((): AnyPgColumn => messages.id, {
      onDelete: 'set null',
    }),

    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at'),
  },
  (table) => ({
    // КРИТИЧНО: Пришвидшує рендер чату та сортування за часом
    chatCreatedIdx: index('idx_messages_chat_created').on(table.chat_id, table.created_at),
    // Пришвидшує пошук повідомлень від конкретного відправника
    senderIdx: index('idx_messages_sender').on(table.sender_id),
  }),
);

// --- ВІДНОСИНИ (RELATIONS) ---
export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats, { relationName: 'creator' }),
  messages: many(messages),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.user_id],
    references: [users.id],
    relationName: 'creator',
  }),
  recipient: one(users, {
    fields: [chats.recipient_id],
    references: [users.id],
    relationName: 'recipient',
  }),
  user_last_read_message: one(messages, {
    fields: [chats.user_last_read_id],
    references: [messages.id],
  }),
  recipient_last_read_message: one(messages, {
    fields: [chats.recipient_last_read_id],
    references: [messages.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chat_id],
    references: [chats.id],
  }),
  sender: one(users, {
    fields: [messages.sender_id],
    references: [users.id],
  }),
  reply_to: one(messages, {
    fields: [messages.reply_to_id],
    references: [messages.id],
    relationName: 'replyingTo',
  }),
}));

export const uploadAudit = pgTable(
  'upload_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userTimeIdx: index('idx_upload_audit_user_time').on(table.user_id, table.created_at),
  }),
);
