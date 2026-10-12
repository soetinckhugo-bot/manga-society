/**
 * scripts/generate-assets.mjs — Génération procédurale des assets Agent D.
 *
 * Packs ×7 (3:4), verso carte (2.5:3.5) : SVG artisanal rastérisé en PNG via
 * sharp (dépendance déjà présente dans node_modules). Sons CC0 ×8 :
 * synthèse PCM maison (mono 22050 Hz, 16 bits → WAV), 100 % locaux et
 * libres de droits par construction. Aucun asset externe au runtime.
 *
 * Usage : node scripts/generate-assets.mjs
 * Les prompts "IA de remplacement" correspondants vivent dans
 * assets/prompts.md (livraison prévue par la spec si génération impossible).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = path.join(ROOT, 'public', 'packs');
const SOUNDS_DIR = path.join(ROOT, 'public', 'sounds');
mkdirSync(PACKS_DIR, { recursive: true });
mkdirSync(SOUNDS_DIR, { recursive: true });

/* ---------------------------------------------------------------------------
 * 1. PACK ARTS — SVG → PNG 3:4
 * ------------------------------------------------------------------------- */

/** @type {Array<{slug: string, kanji: string, accent: string}>} */
const PACKS = [
  { slug: 'shonen', kanji: '少', accent: '#ff6b35' },
  { slug: 'shojo', kanji: '花', accent: '#f472b6' },
  { slug: 'webtoon', kanji: '文', accent: '#a78bfa' },
  { slug: 'big3', kanji: '王', accent: '#d4a94e' },
  { slug: 'seinen', kanji: '青', accent: '#818cf8' },
  { slug: 'isekai', kanji: '異', accent: '#2dd4bf' },
  // Thème "mix" (Tous les persos) + pack générique par défaut de la séquence.
  { slug: 'mix', kanji: '混', accent: '#e4e4e7' },
];

const KANJI_FONT = `'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP','Source Han Serif',serif`;

function packSvg({ kanji, accent }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 900 1200">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="85%">
      <stop offset="0%" stop-color="#17171f"/>
      <stop offset="55%" stop-color="#101017"/>
      <stop offset="100%" stop-color="#0a0a0f"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8a6a2f"/>
      <stop offset="28%" stop-color="#d4a94e"/>
      <stop offset="50%" stop-color="#f5d67b"/>
      <stop offset="72%" stop-color="#d4a94e"/>
      <stop offset="100%" stop-color="#8a6a2f"/>
    </linearGradient>
    <linearGradient id="accentFade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${accent}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.83  0 0 0 0 0.66  0 0 0 0 0.3  0 0 0 0.10 0"/>
    </filter>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>

  <!-- Fond sombre + texture foil -->
  <rect width="900" height="1200" rx="48" fill="url(#bg)"/>
  <rect width="900" height="1200" rx="48" filter="url(#grain)"/>

  <!-- Halo accent derrière le médaillon -->
  <circle cx="450" cy="500" r="300" fill="${accent}" opacity="0.26" filter="url(#soft)"/>
  <circle cx="450" cy="500" r="248" fill="none" stroke="${accent}" stroke-width="3" opacity="0.55"/>
  <circle cx="450" cy="500" r="240" fill="none" stroke="${accent}" stroke-width="10" opacity="0.22" filter="url(#soft)"/>

  <!-- Double liseré intérieur -->
  <rect x="34" y="34" width="832" height="1132" rx="34" fill="none" stroke="url(#gold)" stroke-width="3"/>
  <rect x="48" y="48" width="804" height="1104" rx="26" fill="none" stroke="url(#gold)" stroke-width="1" opacity="0.55"/>

  <!-- Coins ornés -->
  <g stroke="url(#gold)" stroke-width="4" fill="none" opacity="0.9">
    <path d="M34 110 V66 Q34 34 66 34 H110"/>
    <path d="M866 110 V66 Q866 34 834 34 H790"/>
    <path d="M34 1090 V1134 Q34 1166 66 1166 H110"/>
    <path d="M866 1090 V1134 Q866 1166 834 1166 H790"/>
  </g>

  <!-- Marque -->
  <text x="450" y="150" text-anchor="middle" font-family="${KANJI_FONT}" font-size="34"
    letter-spacing="14" fill="#cbb26a" opacity="0.9">MANGA SOCIETY</text>
  <path d="M450 172 l14 14 l-14 14 l-14 -14 Z" fill="url(#gold)"/>

  <!-- Médaillon -->
  <circle cx="450" cy="500" r="218" fill="none" stroke="url(#gold)" stroke-width="10"/>
  <circle cx="450" cy="500" r="196" fill="#15151c"/>
  <circle cx="450" cy="500" r="196" fill="none" stroke="url(#gold)" stroke-width="3" opacity="0.8"/>
  <circle cx="450" cy="448" r="150" fill="#ffffff" opacity="0.03"/>
  <text x="450" y="592" text-anchor="middle" font-family="${KANJI_FONT}"
    font-size="250" fill="url(#gold)">${kanji}</text>

  <!-- Bande accent -->
  <rect x="120" y="800" width="660" height="5" fill="url(#accentFade)" opacity="0.9"/>
  <path d="M450 786 l12 12 l-12 12 l-12 -12 Z" fill="${accent}"/>

  <!-- Rangée de losanges basse -->
  <g fill="url(#gold)" opacity="0.75">
    <path d="M330 1060 l10 10 l-10 10 l-10 -10 Z"/>
    <path d="M390 1060 l10 10 l-10 10 l-10 -10 Z"/>
    <path d="M450 1060 l12 12 l-12 12 l-12 -12 Z"/>
    <path d="M510 1060 l10 10 l-10 10 l-10 -10 Z"/>
    <path d="M570 1060 l10 10 l-10 10 l-10 -10 Z"/>
  </g>
</svg>`;
}

/* ---------------------------------------------------------------------------
 * 2. VERSO CARTE — SVG → PNG 2.5:3.5
 * ------------------------------------------------------------------------- */

function cardBackSvg() {
  // Seigaiha (vagues en écailles) : motif de cercles concentriques décalés.
  let pattern = '';
  const w = 150;
  const h = 75;
  for (const [cx, cy] of [
    [0, 0],
    [w / 2, h / 2],
    [-w / 2, h / 2],
    [w / 2, -h / 2],
    [-w / 2, -h / 2],
  ]) {
    for (const r of [70, 48, 26]) {
      pattern += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(212,169,78,0.20)" stroke-width="2.5"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840" viewBox="0 0 750 1050">
  <defs>
    <pattern id="seigaiha" width="${w}" height="${h}" patternUnits="userSpaceOnUse">
      ${pattern}
    </pattern>
    <radialGradient id="bgBack" cx="50%" cy="42%" r="90%">
      <stop offset="0%" stop-color="#14141c"/>
      <stop offset="60%" stop-color="#0e0e14"/>
      <stop offset="100%" stop-color="#09090d"/>
    </radialGradient>
    <linearGradient id="goldB" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8a6a2f"/>
      <stop offset="30%" stop-color="#d4a94e"/>
      <stop offset="50%" stop-color="#f5d67b"/>
      <stop offset="70%" stop-color="#d4a94e"/>
      <stop offset="100%" stop-color="#8a6a2f"/>
    </linearGradient>
    <filter id="grainB">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.83  0 0 0 0 0.66  0 0 0 0 0.3  0 0 0 0.08 0"/>
    </filter>
  </defs>

  <rect width="750" height="1050" rx="36" fill="url(#bgBack)"/>
  <rect width="750" height="1050" rx="36" fill="url(#seigaiha)"/>
  <rect width="750" height="1050" rx="36" filter="url(#grainB)"/>

  <rect x="26" y="26" width="698" height="998" rx="26" fill="none" stroke="url(#goldB)" stroke-width="3"/>
  <rect x="38" y="38" width="674" height="974" rx="20" fill="none" stroke="url(#goldB)" stroke-width="1" opacity="0.5"/>

  <!-- Coins -->
  <g fill="url(#goldB)">
    <path d="M26 96 V58 Q26 26 58 26 H96" fill="none" stroke="url(#goldB)" stroke-width="3"/>
    <path d="M724 96 V58 Q724 26 692 26 H654" fill="none" stroke="url(#goldB)" stroke-width="3"/>
    <path d="M26 954 V992 Q26 1024 58 1024 H96" fill="none" stroke="url(#goldB)" stroke-width="3"/>
    <path d="M724 954 V992 Q724 1024 692 1024 H654" fill="none" stroke="url(#goldB)" stroke-width="3"/>
  </g>
  <g fill="url(#goldB)">
    <path d="M40 76 l9 9 l-9 9 l-9 -9 Z"/>
    <path d="M710 76 l9 9 l-9 9 l-9 -9 Z"/>
    <path d="M40 966 l9 9 l-9 9 l-9 -9 Z"/>
    <path d="M710 966 l9 9 l-9 9 l-9 -9 Z"/>
  </g>

  <!-- Médaillon central -->
  <circle cx="375" cy="455" r="150" fill="#0c0c12"/>
  <circle cx="375" cy="455" r="150" fill="none" stroke="url(#goldB)" stroke-width="6"/>
  <circle cx="375" cy="455" r="134" fill="none" stroke="url(#goldB)" stroke-width="2" opacity="0.7"/>
  <text x="375" y="532" text-anchor="middle" font-family="${KANJI_FONT}"
    font-size="168" fill="url(#goldB)">漫</text>

  <text x="375" y="700" text-anchor="middle" font-family="${KANJI_FONT}" font-size="30"
    letter-spacing="12" fill="#cbb26a">MANGA SOCIETY</text>
  <path d="M375 726 l10 10 l-10 10 l-10 -10 Z" fill="url(#goldB)" opacity="0.8"/>
</svg>`;
}

/* ---------------------------------------------------------------------------
 * 3. SONS — synthèse PCM (mono, 22050 Hz, 16 bits, WAV)
 * ------------------------------------------------------------------------- */

const RATE = 22050;

/** Générateur déterministe (reproductible) — mulberry32. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rend un WAV 16 bits mono à partir d'une fonction sample(t) → [-1, 1]. */
function renderWav(sample, seconds) {
  const n = Math.floor(seconds * RATE);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, sample(i / RATE)));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const TAU = Math.PI * 2;

/** Note sinusoïdale avec attaque/decay exponentiel. */
function tone(freq, start, dur, { attack = 0.005, gain = 0.5, type = 'sine' } = {}) {
  return (t) => {
    const dt = t - start;
    if (dt < 0 || dt > dur) return 0;
    const env =
      dt < attack ? dt / attack : Math.exp(-3.5 * ((dt - attack) / (dur - attack)));
    const phase = TAU * freq * dt;
    const wave =
      type === 'saw'
        ? 2 * ((freq * dt) % 1) - 1
        : type === 'square'
          ? Math.sign(Math.sin(phase))
          : Math.sin(phase);
    // Léger amortissement des harmoniques pour les ondes riches.
    return wave * env * gain;
  };
}

/** Bruit filtré (passe-bas 1er ordre), enveloppe optionnelle. */
function noise(start, dur, { gain = 0.4, cutoff = 0.2, seed = 1, env } = {}) {
  const rand = rng(seed);
  let y = 0;
  let last = 0;
  return (t) => {
    const dt = t - start;
    if (dt < 0 || dt > dur) return 0;
    const x = rand() * 2 - 1;
    y += cutoff * (x - y); // lowpass
    const diff = Math.abs(y - last);
    last = y;
    // Légère accentuation des transitoires (crépitement de déchirure).
    const e = env ? env(dt / dur) : 1 - dt / dur;
    return (y + diff * 2.5) * e * gain;
  };
}

function mix(...parts) {
  return (t) => parts.reduce((sum, p) => sum + p(t), 0);
}

/** @type {Record<string, { seconds: number, build: () => (t: number) => number }>} */
const SOUNDS = {
  click: {
    seconds: 0.09,
    build: () => mix(tone(1900, 0, 0.06, { gain: 0.35 }), noise(0, 0.03, { gain: 0.15, cutoff: 0.4, seed: 7 })),
  },
  tear: {
    seconds: 0.6,
    build: () => {
      const rip = (ripple) => (u) => (1 - u) * (0.65 + 0.35 * Math.sin(TAU * ripple * u));
      return mix(
        // Première déchirure courte et crépitante.
        noise(0, 0.22, { gain: 0.7, cutoff: 0.32, seed: 11, env: rip(9) }),
        // Seconde lame plus longue qui s'ouvre.
        noise(0.16, 0.42, { gain: 0.55, cutoff: 0.22, seed: 23, env: rip(5) }),
      );
    },
  },
  flip: {
    seconds: 0.24,
    build: () => {
      const rand = rng(42);
      let y = 0;
      return (t) => {
        const u = t / 0.24;
        if (u >= 1) return 0;
        const cutoff = 0.08 + 0.3 * u; // balayage vers les aigus
        const x = rand() * 2 - 1;
        y += cutoff * (x - y);
        return y * Math.sin(Math.PI * u) * 0.5;
      };
    },
  },
  rare: {
    seconds: 0.7,
    build: () =>
      mix(
        tone(880, 0, 0.5, { gain: 0.4 }),
        tone(1318.5, 0.09, 0.55, { gain: 0.35 }),
      ),
  },
  epic: {
    seconds: 1.0,
    build: () =>
      mix(
        tone(659.3, 0, 0.5, { gain: 0.34 }),
        tone(830.6, 0.08, 0.55, { gain: 0.32 }),
        tone(987.8, 0.16, 0.7, { gain: 0.36 }),
        tone(1975.5, 0.16, 0.8, { gain: 0.08 }),
      ),
  },
  legendary: {
    seconds: 1.4,
    build: () =>
      mix(
        tone(392, 0, 0.5, { gain: 0.22, type: 'saw' }),
        tone(523.3, 0.1, 0.55, { gain: 0.2, type: 'saw' }),
        tone(659.3, 0.2, 0.65, { gain: 0.22, type: 'saw' }),
        tone(784, 0.3, 0.95, { gain: 0.24, type: 'saw' }),
        tone(1568, 0.3, 1.0, { gain: 0.06 }),
        noise(0, 0.5, { gain: 0.06, cutoff: 0.1, seed: 5 }),
      ),
  },
  mythic: {
    seconds: 1.8,
    build: () =>
      mix(
        tone(146.8, 0, 1.7, { gain: 0.22, type: 'saw' }), // drone grave
        tone(587.3, 0.15, 0.45, { gain: 0.24 }),
        tone(698.5, 0.27, 0.45, { gain: 0.24 }),
        tone(880, 0.39, 0.5, { gain: 0.26 }),
        tone(1174.7, 0.51, 0.9, { gain: 0.3 }),
        tone(2349.3, 0.51, 1.1, { gain: 0.07 }),
        noise(0.5, 0.8, { gain: 0.08, cutoff: 0.14, seed: 17 }),
      ),
  },
  coin: {
    seconds: 0.45,
    build: () =>
      mix(
        tone(987.77, 0, 0.16, { gain: 0.32, type: 'square' }),
        tone(1318.5, 0.09, 0.32, { gain: 0.3, type: 'square' }),
      ),
  },
};

/* ---------------------------------------------------------------------------
 * Exécution
 * ------------------------------------------------------------------------- */

let wrote = 0;
for (const pack of PACKS) {
  const out = path.join(PACKS_DIR, `${pack.slug}.png`);
  // Palette quantifiée : le grain foil reste visible mais le poids chute
  // drastiquement (critère 4G + precache PWA, SPEC §6 ; < 200 Ko/pack).
  await sharp(Buffer.from(packSvg(pack)))
    .png({ palette: true, quality: 70, compressionLevel: 9 })
    .toFile(out);
  wrote++;
  console.log(`pack  → ${path.relative(ROOT, out)}`);
}

{
  const out = path.join(ROOT, 'public', 'card-back.png');
  await sharp(Buffer.from(cardBackSvg()))
    .png({ palette: true, quality: 82, compressionLevel: 9 })
    .toFile(out);
  wrote++;
  console.log(`back  → ${path.relative(ROOT, out)}`);
}

for (const [name, def] of Object.entries(SOUNDS)) {
  const wav = renderWav(def.build(), def.seconds);
  const out = path.join(SOUNDS_DIR, `${name}.wav`);
  writeFileSync(out, wav);
  wrote++;
  console.log(`sound → ${path.relative(ROOT, out)} (${(wav.length / 1024).toFixed(1)} KB)`);
}

console.log(`\n${wrote} assets générés.`);
