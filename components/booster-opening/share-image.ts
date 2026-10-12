import type { Rarity } from '@/lib/config';
import type { OpenedCardDto } from '@/types/api';

/**
 * components/booster-opening/share-image.ts — PNG partageable du pull.
 *
 * Dessin Canvas 2D (1200×630, format paysage og-ready) : zéro dépendance
 * (ni satori/resvg ni html-to-image), fonctionne offline. Les images
 * personnages sont chargées en crossOrigin='anonymous' (CORS AniList) ;
 * en cas d'échec/tain, une silhouette numérotée est dessinée à la place —
 * le PNG est toujours généré.
 */

const W = 1200;
const H = 630;

/** Couleurs rareté (miroir des tokens --rarity-* de globals.css). */
const RARITY_COLOR: Record<Rarity, string> = {
  common: '#71717a',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#a78bfa',
  legendary: '#d4a94e',
  mythic: '#dc2626',
};

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Dessine une carte (portrait TCG) ; silhouette si image indisponible. */
function drawCard(
  ctx: CanvasRenderingContext2D,
  card: OpenedCardDto,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const color = RARITY_COLOR[card.character.base_rarity];

  // Halo + cadre rareté.
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#121218';
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.restore();

  // Illustration (object-cover simplifié : recadrage centré haut).
  ctx.save();
  roundRectPath(ctx, x + 4, y + 4, w - 8, h - 8, 11);
  ctx.clip();
  if (img) {
    const scale = Math.max((w - 8) / img.width, (h - 8) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + 4 + (w - 8 - dw) / 2, y + 4 - (dh - (h - 8)) * 0.15, dw, dh);
  } else {
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.round(h / 4)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      card.character.name_romaji.charAt(0).toUpperCase(),
      x + w / 2,
      y + h / 2,
    );
  }

  // Scrim bas + nom + print.
  const bandH = Math.max(34, h * 0.2);
  const gradient = ctx.createLinearGradient(0, y + h - bandH, 0, y + h);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x + 4, y + h - bandH - 4, w - 8, bandH);
  ctx.fillStyle = '#f4f4f5';
  ctx.font = `600 ${Math.max(11, w * 0.075)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const name = card.character.name_romaji;
  ctx.fillText(
    name.length > 18 ? `${name.slice(0, 17)}…` : name,
    x + 10,
    y + h - 14,
    w - 20,
  );
  ctx.fillStyle = '#d4a94e';
  ctx.font = `700 ${Math.max(10, w * 0.065)}px ui-monospace, monospace`;
  ctx.fillText(`#${card.print_number}`, x + 10, y + h - bandH + 18);
  ctx.restore();

  // Bord rareté.
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  roundRectPath(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 13);
  ctx.stroke();
}

export interface PullImageResult {
  blob: Blob;
}

/**
 * Génère le PNG du pull (paysage 1200×630). Ne lève JAMAIS : en cas
 * d'erreur de dessin, renvoie quand même un PNG (sans les images KO).
 */
export async function renderPullImage(
  cards: OpenedCardDto[],
  bestIndex: number,
  labels: { best: string; newBadge: string },
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    // Fond sombre + halo doré.
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(930, 300, 40, 930, 300, 480);
    glow.addColorStop(0, 'rgba(212,169,78,0.22)');
    glow.addColorStop(1, 'rgba(212,169,78,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Marque.
    const logo = await loadImage('/brand/logo.png', false);
    if (logo) ctx.drawImage(logo, 48, 36, 44, 44);
    ctx.fillStyle = '#cbb26a';
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('M A N G A   S O C I E T Y', logo ? 106 : 48, 66);

    const best = cards[bestIndex];
    if (!best) return null;

    // Meilleure carte (droite, grande).
    const bestImg = await loadImage(best.character.image_url, true);
    const bw = 268;
    const bh = Math.round((bw * 7) / 5);
    drawCard(ctx, best, bestImg, W - bw - 64, 128, bw, bh);

    // Bloc texte (gauche).
    ctx.fillStyle = '#d4a94e';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText(labels.best.toUpperCase().split('').join(' '), 64, 170);

    ctx.fillStyle = '#fafafa';
    ctx.font = '800 44px system-ui, sans-serif';
    const bestName = best.character.name_romaji;
    ctx.fillText(bestName.length > 16 ? `${bestName.slice(0, 15)}…` : bestName, 64, 222, 620);

    ctx.fillStyle = RARITY_COLOR[best.character.base_rarity];
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(`#${best.print_number}`, 64, 262);

    if (best.character.anime_title) {
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '500 19px system-ui, sans-serif';
      const title = best.character.anime_title;
      ctx.fillText(title.length > 38 ? `${title.slice(0, 37)}…` : title, 64, 300, 620);
    }

    // Éventail des autres cartes (bas gauche).
    const others = cards.filter((_, i) => i !== bestIndex).slice(0, 4);
    const mw = 118;
    const mh = Math.round((mw * 7) / 5);
    const gap = 22;
    const y0 = H - mh - 48;
    for (let i = 0; i < others.length; i++) {
      const card = others[i];
      if (!card) continue;
      const img = await loadImage(card.character.image_url, true);
      const x = 64 + i * (mw + gap);
      drawCard(ctx, card, img, x, y0, mw, mh);
      if (card.is_new_character) {
        ctx.fillStyle = '#d4a94e';
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.fillText(labels.newBadge, x + 2, y0 - 8);
      }
    }

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  }
}
