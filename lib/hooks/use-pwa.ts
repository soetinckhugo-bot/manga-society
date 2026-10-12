'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * lib/hooks/use-pwa.ts — état d'installation PWA de l'app.
 *
 * - isInstalled : display-mode standalone (Android/desktop) ou
 *   navigator.standalone (iOS Safari). Snapshot navigateur via
 *   useSyncExternalStore (SSR-safe, pas de mismatch d'hydratation).
 * - isIos : plateforme Apple (pas d'API beforeinstallprompt → instructions
 *   add-to-homescreen dans la bannière).
 * - canInstall : un événement `beforeinstallprompt` a été intercepté
 *   (Chromium uniquement).
 * - promptInstall() : relance le flow natif d'installation (no-op sans event).
 * - dismissed : la bannière a été fermée il y a moins de 7 jours
 *   (localStorage `pwa-install-dismissed`, propagé via événement maison).
 */

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_EVENT = 'pwa-install-dismissed';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

interface UsePwaResult {
  isInstalled: boolean;
  isIos: boolean;
  canInstall: boolean;
  dismissed: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
}

let dismissedCache: { value: boolean; at: number } | null = null;

function computeDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const timestamp = Number.parseInt(raw, 10);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < DISMISS_TTL_MS;
}

/**
 * getSnapshot de useSyncExternalStore : le résultat est CACHÉ ~1 s
 * (React exige un snapshot stable entre deux notifications du store).
 */
function readDismissed(): boolean {
  if (dismissedCache && Date.now() - dismissedCache.at < 1000) {
    return dismissedCache.value;
  }
  const value = computeDismissed();
  dismissedCache = { value, at: Date.now() };
  return value;
}

function detectInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari : propriété propriétaire hors des types standards.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iphone|ipod/i.test(ua) ||
    /ipad/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/** Abonnement display-mode (re-détecte si l'app est désinstallée). */
function subscribeDisplayMode(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** Abonnement au dismiss maison (localStorage n'émet pas d'événement). */
function subscribeDismissed(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => onChange();
  window.addEventListener(DISMISS_EVENT, handler);
  return () => window.removeEventListener(DISMISS_EVENT, handler);
}

export function usePwa(): UsePwaResult {
  // Snapshots SSR-safe : false côté serveur, valeur réelle côté client
  // (React re-render automatiquement après hydratation si différent).
  const isInstalled = useSyncExternalStore(
    subscribeDisplayMode,
    detectInstalled,
    () => false,
  );
  const isIos = useSyncExternalStore(
    () => () => undefined,
    isAppleMobile,
    () => false,
  );
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    readDismissed,
    () => false,
  );

  const [canInstall, setCanInstall] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
    setCanInstall(false);
  }, [installEvent]);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    // Met à jour le cache AVANT de notifier : le re-render lit `true`.
    dismissedCache = { value: true, at: Date.now() };
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }, []);

  return {
    isInstalled,
    isIos,
    canInstall: canInstall && !isInstalled,
    dismissed,
    promptInstall,
    dismiss,
  };
}
