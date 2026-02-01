'use client';

import { Loader2, MessageSquarePlus, User as UserIcon } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { memo, useTransition } from 'react';
import { getOrCreateChatAction } from '@/actions/chat-actions';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { formatRelativeTime } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

import { PresenceIndicator } from './PresenceIndicator';

interface ContactItemProps {
  user: User;
  disabled: boolean;
  onActionStart?: (id: string) => void;
  onActionEnd?: () => void;
}

function ContactItemBase({ user, disabled, onActionStart, onActionEnd }: ContactItemProps) {
  const [isPending, startTransition] = useTransition();
  const { user: currentUser } = useSupabaseAuth();
  const router = useRouter();

  const handleStartChat = () => {
    if (disabled || isPending || !currentUser?.id) return;

    onActionStart?.(user.id);
    startTransition(async () => {
      try {
        const result = await getOrCreateChatAction(user.id);

        // Handle null result (unauthorized or error)
        if (!result) {
          // Redirect to login or show auth modal
          router.push('/login');
          return;
        }

        // If successful, the redirect will happen in the server action
      } catch (error) {
        console.error('Unexpected error:', error);
      } finally {
        onActionEnd?.();
      }
    });
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-3 rounded-xl transition-all border border-transparent group',
        isPending ? 'bg-white/10' : 'hover:bg-white/5 hover:border-white/5',
      )}
    >
      <div className="relative w-10 h-10 rounded-full shrink-0">
        <div className="w-full h-full rounded-full overflow-hidden border border-white/10 bg-white/5 relative">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name || 'User'}
              fill
              className="object-cover"
              sizes="40px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-gray-500" />
            </div>
          )}
        </div>
        <PresenceIndicator userId={user.id} className="absolute bottom-0 right-0 w-3 h-3" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
          {user.name || 'Anonymous'}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-gray-500 truncate lowercase">{user.email}</p>
          <PresenceIndicator userId={user.id} showOffline={false} className="hidden" />
          {user.last_seen && (
            <>
              <span className="text-[10px] text-gray-600">•</span>
              <p className="text-[10px] text-gray-500">{formatRelativeTime(user.last_seen)}</p>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled || isPending}
        onClick={handleStartChat}
        className={cn(
          'p-2 rounded-lg transition-all shrink-0',
          isPending
            ? 'bg-white text-black'
            : 'bg-white/5 text-gray-400 hover:bg-white hover:text-black lg:opacity-0 lg:group-hover:opacity-100',
          disabled && !isPending && 'opacity-50 cursor-not-allowed pointer-events-none',
        )}
        title="Send Message"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <MessageSquarePlus className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

export const ContactItem = memo(ContactItemBase);
