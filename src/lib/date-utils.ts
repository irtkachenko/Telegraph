// src/lib/date-utils.ts
import { format, isToday, isYesterday } from 'date-fns';
import { uk } from 'date-fns/locale';

type DateInput = string | number | Date | null | undefined;

/**
 * Converts any date from Supabase to valid timestamp (ms)
 */
export function getSafeTimestamp(date: DateInput): number {
  if (!date) return 0;
  try {
    const dateString = (() => {
      if (typeof date !== 'string') return date;

      const normalized = date.replace(' ', 'T');
      const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
      return hasTimezone ? normalized : `${normalized}Z`;
    })();

    const d = new Date(dateString);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

export function formatMessageDate(date: DateInput) {
  const ts = getSafeTimestamp(date);
  if (!ts) return '';
  const d = new Date(ts);

  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday, ${format(d, 'HH:mm')}`;

  return format(d, 'd MMM, HH:mm', { locale: uk });
}

export function formatRelativeTime(date: DateInput) {
  const ts = getSafeTimestamp(date);
  if (!ts) return '';
  const d = new Date(ts);

  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';

  return format(d, 'dd.MM.yy');
}
