'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

import { isAppErrorCode, type AppErrorCode } from '@/lib/errors';
import { useRouter } from '@/lib/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * /onboarding — choix du username (1ère session).
 *
 * - Validation locale du format (3-20, alphanumérique + tiret/underscore),
 *   messages traduits.
 * - Vérif de disponibilité en temps réel, debounce 400 ms :
 *   GET /api/profiles/check-username?username=… → { available: boolean }
 *   [ENDPOINT PROVISOIRE — à implémenter par l'Agent A, cf. HANDOFF.md]
 * - Soumission : POST /api/profiles/username { username } → 200 ou
 *   { error: 'USERNAME_TAKEN' | 'INVALID_USERNAME' }.
 * - Succès → /boosters (le proxy protège déjà cette route).
 */

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const DEBOUNCE_MS = 400;

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function OnboardingPage() {
  const t = useTranslations('auth.onboarding');
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);

  // Déjà un username → la page n'a pas de raison d'exister.
  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.username) router.replace('/boosters');
    })();
  }, [router]);

  // Vérif de disponibilité pilotée par le handler (debounce 400 ms) :
  // aucun setState synchrone dans un effet (règle react-hooks).
  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value) {
      setAvailability('idle');
      return;
    }
    if (!USERNAME_PATTERN.test(value)) {
      setAvailability('invalid');
      return;
    }

    setAvailability('checking');
    const seq = ++checkSeq.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/profiles/check-username?username=${encodeURIComponent(value)}`,
        );
        if (seq !== checkSeq.current) return;
        if (!response.ok) {
          // Endpoint indisponible : la soumission reste la source de vérité.
          setAvailability('idle');
          return;
        }
        const body = (await response.json()) as { available?: boolean };
        setAvailability(body.available === true ? 'available' : 'taken');
      } catch {
        if (seq === checkSeq.current) setAvailability('idle');
      }
    }, DEBOUNCE_MS);
  };

  // Nettoyage du timer au démontage.
  useEffect(() => {
    const ref = debounceRef;
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);

  const canSubmit =
    USERNAME_PATTERN.test(username) &&
    availability !== 'taken' &&
    !pending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setErrorCode(null);
    try {
      const response = await fetch('/api/profiles/username', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        const candidate =
          typeof body?.error === 'string' ? body.error : '';
        if (isAppErrorCode(candidate)) {
          setErrorCode(candidate);
          if (candidate === 'USERNAME_TAKEN') setAvailability('taken');
        } else {
          setErrorCode('INTERNAL_ERROR');
        }
        return;
      }
      router.push('/boosters');
      router.refresh();
    } catch {
      setErrorCode('INTERNAL_ERROR');
    } finally {
      setPending(false);
    }
  };

  const statusMessage = (() => {
    switch (availability) {
      case 'checking':
        return t('checking');
      case 'available':
        return t('available');
      case 'taken':
        return t('taken');
      case 'invalid':
        return t('invalidFormat');
      default:
        return null;
    }
  })();

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="username"
            className="text-sm font-medium text-foreground"
          >
            {t('usernameLabel')}
          </label>
          <Input
            id="username"
            type="text"
            required
            minLength={3}
            maxLength={20}
            autoComplete="username"
            placeholder={t('usernamePlaceholder')}
            value={username}
            onChange={(event) => handleUsernameChange(event.target.value)}
            aria-invalid={availability === 'invalid' || availability === 'taken'}
          />
          <p className="text-xs text-muted-foreground">{t('rules')}</p>
          {statusMessage ? (
            <p
              role="status"
              className={
                availability === 'available'
                  ? 'text-xs text-emerald-400'
                  : 'text-xs text-red-400'
              }
            >
              {statusMessage}
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={!canSubmit}>
          {pending ? t('pending') : t('validate')}
        </Button>
      </form>

      {errorCode ? (
        <p role="alert" className="text-center text-sm text-red-400">
          <ErrorMessage code={errorCode} />
        </p>
      ) : null}
    </div>
  );
}

function ErrorMessage({ code }: { code: AppErrorCode }) {
  const t = useTranslations('errors');
  return t(code);
}
