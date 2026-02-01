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
    name: text('name'),
    email: text('email').notNull().unique(),
    email_verified: timestamp('emailVerified', { mode: 'date' }),
    image: text('image'),
    last_seen: timestamp('last_seen', { mode: 'date' }).defaultNow(),
  },
  (table) => ({
    emailIdx: index('idx_user_email').on(table.email), // Для швидкого пошуку контактів
  }),
);

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
