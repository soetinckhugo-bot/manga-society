'use client';

import { useEffect, useState } from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { User } from '@supabase/supabase-js';

import { Link, useRouter } from '@/lib/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * Header : wordmark, navigation traduite, état de session.
 * L'état auth est lu côté client (useEffect + onAuthStateChange) : le shell
 * reste statique, la session hydrate après montage.
 */

interface AuthState {
  user: User | null;
  username: string | null;
}

export function Header() {
  const t = useTranslations('nav');
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState>({ user: null, username: null });

  useEffect(() => {
    const supabase = createClient();

    const load = async (user: User | null) => {
      if (!user) {
        setAuth({ user: null, username: null });
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();
      setAuth({ user, username: data?.username ?? null });
    };

    supabase.auth.getUser().then(({ data }) => load(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      load(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navLinks = [
    { href: '/boosters' as const, label: t('boosters') },
    { href: '/collection' as const, label: t('collection') },
    { href: '/shop' as const, label: t('shop') },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link
          href="/"
          className="shrink-0 text-base font-semibold tracking-tight text-foreground"
        >
          Manga <span className="text-primary">Society</span>
        </Link>

        {auth.user ? (
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : (
          <div className="flex-1" />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {auth.user ? (
            <>
              {auth.username ? (
                <Link
                  href={`/u/${auth.username}`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <UserIcon className="size-4" />
                  <span className="max-w-28 truncate">{auth.username}</span>
                </Link>
              ) : null}
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="size-4" />
                <span className="hidden sm:inline">{t('logout')}</span>
              </Button>
            </>
          ) : (
            <Button variant="default" size="sm" asChild>
              <Link href="/login">{t('login')}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
