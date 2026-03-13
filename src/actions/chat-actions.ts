'use server';

import { and, eq, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { chats, users } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';

// --- Zod-схеми валідації (CRIT-07) ---
const targetUserIdSchema = z.string().uuid('targetUserId must be a valid UUID');

const markAsReadInputSchema = z.object({
  chatId: z.string().uuid('chatId must be a valid UUID'),
  messageId: z.string().uuid('messageId must be a valid UUID'),
});

/**
 * Отримує поточного користувача із Supabase SSR та синхронізує його з нашою БД Drizzle.
 */
async function getCurrentUser() {
  try {
    const supabase = await createClient();

    // 1. Отримуємо юзера (getUser надійніший для безпеки на сервері)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    // Безпечне отримання метаданих (додав додаткові перевірки)
    const userName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Користувач';

    const userImage = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

    // 3. Синхронізація з Drizzle
    const [dbUser] = await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email ?? '',
        name: userName,
        image: userImage,
        last_seen: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: userName,
          image: userImage,
          last_seen: new Date(),
        },
      })
      .returning();

    return dbUser;
  } catch (err) {
    // Якщо прилетить той самий TypeError про "string", ми його зловимо тут
    // і не дамо всьому серверу "впасти"
    console.error('Critical error in getCurrentUser:', err);
    return null;
  }
}

export async function getOrCreateChatAction(targetUserId: string) {
  // CRIT-07: Валідація вхідного параметра
  const parsed = targetUserIdSchema.safeParse(targetUserId);
  if (!parsed.success) {
    console.error('Invalid targetUserId:', parsed.error.flatten());
    return null;
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return null;
  }

  // Захист від створення чату з самим собою
  if (user.id === parsed.data) {
    return null;
  }

  const myId = user.id;
  let targetChatId: string | null = null;

  try {
    const existingChat = await db.query.chats.findFirst({
      where: or(
        and(eq(chats.user_id, myId), eq(chats.recipient_id, targetUserId)),
        and(eq(chats.user_id, targetUserId), eq(chats.recipient_id, myId)),
      ),
    });

    if (existingChat) {
      targetChatId = existingChat.id;
    } else {
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
      });

      const [newChat] = await db
        .insert(chats)
        .values({
          user_id: myId,
          recipient_id: targetUserId,
          title: targetUser?.name || 'Приватний чат',
        })
        .returning();

      targetChatId = newChat.id;
    }
  } catch (error) {
    console.error('Error in getOrCreateChatAction:', error);
    return null;
  }

  // Редирект має бути в самому кінці, поза try/catch
  if (targetChatId) {
    revalidatePath('/chat');
    redirect(`/chat/${targetChatId}`);
  }

  return null;
}

export async function markAsReadAction(chatId: string, messageId: string) {
  // CRIT-07: Валідація вхідних параметрів
  const parsed = markAsReadInputSchema.safeParse({ chatId, messageId });
  if (!parsed.success) {
    return { success: false, error: 'validation_error' };
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return { success: false, error: 'unauthorized' };
  }

  try {
    // First, get the chat to determine which field to update
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!chat) {
      return { success: false, error: 'chat_not_found' };
    }

    // Determine which read field to update based on who the user is
    const updateData: { user_last_read_id?: string; recipient_last_read_id?: string } = {};

    if (chat.user_id === user.id) {
      updateData.user_last_read_id = messageId;
    } else if (chat.recipient_id === user.id) {
      updateData.recipient_last_read_id = messageId;
    } else {
      return { success: false, error: 'not_participant' };
    }

    // Update the chat with the new read status
    await db.update(chats).set(updateData).where(eq(chats.id, chatId));

    return { success: true };
  } catch (error) {
    console.error('Error in markAsReadAction:', error);
    return { success: false, error: 'failed_to_mark_as_read' };
  }
}

// All other actions have been removed as part of the Client-First Supabase Architecture refactor.
