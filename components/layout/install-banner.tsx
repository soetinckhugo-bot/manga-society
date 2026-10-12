'use client';

import Image from 'next/image';
import { Share, Smartphone, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { usePwa } from '@/lib/hooks/use-pwa';

/**
 * Bannière d'installation PWA, affichée sous le header.
 * - Masquée si l'app est installée ou si l'utilisateur a dismiss il y a < 7 jours.
 * - Android/desktop (beforeinstallprompt) : bouton "Installer" natif.
 * - iOS (pas d'API) : bouton ouvrant les instructions add-to-homescreen.
 */

export function InstallBanner() {
  const t = useTranslations('pwa.installBanner');
  const tCommon = useTranslations('common');
  const { isInstalled, isIos, canInstall, dismissed, promptInstall, dismiss } =
    usePwa();

  if (isInstalled || dismissed) return null;
  if (!canInstall && !isIos) return null;

  return (
    <div className="border-b border-border bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-md"
        />
        <p className="min-w-0 flex-1 truncate text-sm text-foreground">
          {t('title')}
        </p>

        {canInstall ? (
          <Button size="sm" onClick={() => void promptInstall()}>
            <Smartphone className="size-4" />
            {t('install')}
          </Button>
        ) : (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">
                <Share className="size-4" />
                {t('ios.open')}
              </Button>
            </DialogTrigger>
            <DialogContent closeLabel={tCommon('close')}>
              <DialogHeader>
                <DialogTitle>{t('ios.title')}</DialogTitle>
                <DialogDescription asChild>
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                    <li>{t('ios.step1')}</li>
                    <li>{t('ios.step2')}</li>
                    <li>{t('ios.step3')}</li>
                  </ol>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label={tCommon('close')}
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
