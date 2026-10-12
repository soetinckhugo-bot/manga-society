import { notFound } from 'next/navigation';

/**
 * Catch-all sous [locale] : déclenche notFound() DANS le segment localisé,
 * pour que la 404 affichée soit app/[locale]/not-found.tsx (traduite fr/en)
 * et non la 404 par défaut de Next (unmatched URLs retombent sinon sur la
 * racine, hors layout [locale]).
 */
export default function CatchAllPage() {
  notFound();
}
