'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { usePresenceStore } from '@/store/usePresenceStore';

interface ConnectionIndicatorProps {
  className?: string;
  showText?: boolean;
}

function ConnectionIndicatorBase({ className, showText = false }: ConnectionIndicatorProps) {
  const connectionState = usePresenceStore((state) => state.connectionState);

  const getStateInfo = () => {
    switch (connectionState) {
      case 'CONNECTED':
        return {
          color: 'bg-green-500',
          textColor: 'text-green-700',
          text: 'Connected',
          shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]',
        };
      case 'RECONNECTING':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-700',
          text: 'Reconnecting...',
          shadow: 'shadow-[0_0_8px_rgba(234,179,8,0.5)]',
        };
      case 'DISCONNECTED':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-700',
          text: 'Disconnected',
          shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]',
        };
      default:
        return {
          color: 'bg-gray-500',
          textColor: 'text-gray-700',
          text: 'Unknown',
          shadow: '',
        };
    }
  };

  const stateInfo = getStateInfo();

  if (!showText) {
    return (
      <div
        className={cn(
          'rounded-full border-2 border-black',
          stateInfo.color,
          stateInfo.shadow,
          className,
        )}
        title={stateInfo.text}
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'w-2 h-2 rounded-full border border-black',
          stateInfo.color,
          stateInfo.shadow,
        )}
      />
      <span className={cn('text-xs font-medium', stateInfo.textColor)}>{stateInfo.text}</span>
    </div>
  );
}

export const ConnectionIndicator = memo(ConnectionIndicatorBase);
