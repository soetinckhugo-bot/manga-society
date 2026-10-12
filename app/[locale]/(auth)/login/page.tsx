'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { isAppErrorCode } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * /login — magic link email + Discord OAuth.
 * AUCUNE logique d'économie ici : simple délégation à Supabase Auth.
 * Le callback vit sous le préfixe de locale : `/{locale}/auth/callback`
 * (le proxy i18n rebascule toute URL non préfixée vers cette forme).
 */

function ErrorMessage({ code }: { code: string }) {
  const t = useTranslations('errors');
  if (isAppErrorCode(code)) return t(code);
  return t('INTERNAL_ERROR');
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const locale = useLocale();

  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<'magic' | 'discord' | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Calculé dans les handlers : `window` n'existe pas au prerender statique.
  const getCallbackUrl = () =>
    `${window.location.origin}/${locale}/auth/callback`;

  const handleMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorCode(null);
    setPending('magic');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: getCallbackUrl() },
      });
      if (error) throw error;
      setEmailSent(true);
    } catch {
      setErrorCode('INTERNAL_ERROR');
    } finally {
      setPending(null);
    }
  };

  const handleDiscord = async () => {
    setErrorCode(null);
    setPending('discord');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: getCallbackUrl() },
      });
      if (error) throw error;
      // Redirection navigateur vers Discord en cours — l'état pending reste.
    } catch {
      setErrorCode('INTERNAL_ERROR');
      setPending(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {emailSent ? (
        <p className="rounded-lg border border-border bg-card p-4 text-center text-sm text-foreground">
          {t('emailSent')}
        </p>
      ) : (
        <>
          <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                {t('emailLabel')}
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending !== null}>
              {pending === 'magic' ? t('magicLinkPending') : t('magicLink')}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">{t('or')}</p>
          <Button
            variant="secondary"
            onClick={handleDiscord}
            disabled={pending !== null}
          >
            {t('discord')}
          </Button>
        </>
      )}

      {errorCode ? (
        <p role="alert" className="text-center text-sm text-red-400">
          <ErrorMessage code={errorCode} />
        </p>
      ) : null}
    </div>
  );
}
