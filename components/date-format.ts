'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';

/**
 * date-format.ts — Formatage des dates selon la locale next-intl courante
 * (Intl.DateTimeFormat, jamais de toLocaleString implicite).
 */
export function useFormatDateTime(): (isoDate: string) => string {
  const locale = useLocale();
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return (isoDate: string) => formatter.format(new Date(isoDate));
  }, [locale]);
}
