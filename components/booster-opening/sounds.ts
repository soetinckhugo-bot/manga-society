/**
 * components/booster-opening/sounds.ts — lecture des sons CC0 (Agent D).
 *
 * Fichiers locaux 100 % (`/sounds/*.wav`, synthèse maison < 80 Ko chacun,
 * budget spec < 200 KB). WebAudio : contexte créé au premier geste
 * utilisateur (politique d'autoplay), décodage paresseux + cache,
 * PRÉCHARGEMENT des 2-3 premiers uniquement (`tear`, `flip`) dès l'écran
 * pack, le reste en lazy au moment du reveal. Jamais de rejet non géré.
 */

export type SoundName =
  | 'tear'
  | 'flip'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic'
  | 'coin'
  | 'click';

const FILES: Record<SoundName, string> = {
  tear: '/sounds/tear.wav',
  flip: '/sounds/flip.wav',
  rare: '/sounds/rare.wav',
  epic: '/sounds/epic.wav',
  legendary: '/sounds/legendary.wav',
  mythic: '/sounds/mythic.wav',
  coin: '/sounds/coin.wav',
  click: '/sounds/click.wav',
};

const VOLUME: Record<SoundName, number> = {
  tear: 0.9,
  flip: 0.5,
  rare: 0.6,
  epic: 0.7,
  legendary: 0.8,
  mythic: 0.9,
  coin: 0.6,
  click: 0.35,
};

/** Sons décodés au premier appel (le reste reste des promesses en vol). */
const buffers = new Map<SoundName, Promise<AudioBuffer>>();

let ctx: AudioContext | null = null;
let unlocked = false;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function load(name: SoundName): Promise<AudioBuffer> {
  const cached = buffers.get(name);
  if (cached) return cached;
  const promise = (async () => {
    const audio = ensureContext();
    if (!audio) throw new Error('WebAudio indisponible');
    const response = await fetch(FILES[name]);
    if (!response.ok) throw new Error(`son introuvable: ${FILES[name]}`);
    return audio.decodeAudioData(await response.arrayBuffer());
  })();
  buffers.set(name, promise);
  // Un échec ne doit pas empoisonner le cache : on permet un retry.
  promise.catch(() => buffers.delete(name));
  return promise;
}

/** Débloque le contexte audio au premier geste utilisateur (autoplay policy). */
export function unlockSounds(): void {
  if (unlocked) return;
  unlocked = true;
  ensureContext();
  // Préchargement intelligent : les 2 premiers de la séquence uniquement.
  void load('tear');
  void load('flip');
}

export function preloadSound(name: SoundName): void {
  void load(name);
}

/** Joue un son (no-op silencieux si WebAudio indisponible ou fichier en échec). */
export function playSound(name: SoundName): void {
  if (!unlocked) return;
  const audio = ensureContext();
  if (!audio) return;
  load(name)
    .then((buffer) => {
      if (!ctx) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = VOLUME[name];
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    })
    .catch(() => {
      // Son indisponible : la séquence reste jouable en silence.
    });
}

/** Libère le contexte en fin de séquence (économie batterie). */
export function releaseSounds(): void {
  buffers.clear();
  if (ctx) {
    void ctx.close().catch(() => undefined);
    ctx = null;
  }
  unlocked = false;
}
