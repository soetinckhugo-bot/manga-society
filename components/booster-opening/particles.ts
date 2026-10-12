/**
 * components/booster-opening/particles.ts — canvas maison (Agent D).
 *
 * Confettis/particules en canvas 2D (aucun nœud DOM, aucune lib).
 * Budget < 300 particules par burst, DPR capé à 2, transform/opacity
 * uniquement (position + rotation écrites en une passe), boucle rAF
 * unique auto-arrêtée quand la dernière particule meurt.
 */

export type ParticleShape = 'rect' | 'circle' | 'shard';

export interface BurstOptions {
  count: number;
  colors: string[];
  /** Origine en fractions du canvas (0..1). Défaut : centre-haut. */
  originX?: number;
  originY?: number;
  /** Dispersion horizontale autour de l'origine (fraction du canvas). */
  spreadX?: number;
  /** Vitesse initiale (px/s). */
  speed?: number;
  gravity?: number;
  drag?: number;
  sizeMin?: number;
  sizeMax?: number;
  shapes?: ParticleShape[];
  /** Durée de vie (s). */
  life?: number;
  /** -1 = infinie (particules persistantes, à arrêter via stop()). */
  persistent?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  shape: ParticleShape;
  color: string;
  age: number;
  life: number;
  wobble: number;
}

const MAX_PARTICLES = 280;

export class ParticleBurst {
  private readonly canvas: HTMLCanvasElement;
  private readonly gtx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private raf = 0;
  private running = false;
  private last = 0;
  private persistent = false;
  private opts: BurstOptions | null = null;
  /** Nombre de bursts lancés (graine de variété déterministe). */
  private bursts = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gtx = canvas.getContext('2d');
    if (!gtx) throw new Error('Canvas 2D indisponible');
    this.gtx = gtx;
  }

  /** Dimensionne le canvas à sa taille d'affichage × DPR (capé à 2). */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.gtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  burst(opts: BurstOptions): void {
    this.opts = opts;
    this.persistent = opts.persistent === true;
    this.spawn(opts, opts.count);
    this.start();
  }

  /** Injecte `count` particules selon les options (budget global respecté). */
  private spawn(opts: BurstOptions, count: number): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const ox = (opts.originX ?? 0.5) * w;
    const oy = (opts.originY ?? 0.35) * h;
    const spread = (opts.spreadX ?? 0.35) * w;
    const speed = opts.speed ?? 520;
    const life = opts.life ?? 1.4;
    const sizeMin = opts.sizeMin ?? 4;
    const sizeMax = opts.sizeMax ?? 9;
    const shapes = opts.shapes ?? ['rect', 'shard'];

    const room = MAX_PARTICLES - this.particles.length;
    const n = Math.min(count, room);
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const v = speed * (0.45 + Math.random() * 0.75);
      this.particles.push({
        x: ox + (Math.random() - 0.5) * spread,
        y: oy + (Math.random() - 0.5) * spread * 0.2,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 14,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        shape: shapes[Math.floor(Math.random() * shapes.length)] ?? 'rect',
        color: opts.colors[Math.floor(Math.random() * opts.colors.length)] ?? '#d4a94e',
        age: 0,
        life: opts.persistent ? Number.POSITIVE_INFINITY : life * (0.7 + Math.random() * 0.6),
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const { gtx } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    gtx.clearRect(0, 0, w, h);

    const gravity = this.opts?.gravity ?? 900;
    const drag = this.opts?.drag ?? 0.985;

    this.particles = this.particles.filter((p) => {
      p.age += dt;
      if (p.age > p.life) return false;
      p.vy += gravity * dt * (this.persistent ? -0.06 : 1);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt + Math.sin(p.age * 3 + p.wobble) * (this.persistent ? 0.4 : 0.15);
      p.y += p.vy * dt;
      p.rot += p.vr * dt;

      const fade =
        p.life === Number.POSITIVE_INFINITY
          ? 1
          : Math.min(1, (p.life - p.age) / 0.35) * Math.min(1, p.age / 0.08 + 0.2);
      gtx.globalAlpha = Math.max(0, fade);
      gtx.fillStyle = p.color;
      gtx.save();
      gtx.translate(p.x, p.y);
      gtx.rotate(p.rot);
      if (p.shape === 'circle') {
        gtx.beginPath();
        gtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        gtx.fill();
      } else if (p.shape === 'shard') {
        // Éclat triangulaire (déchirure de papier/foil).
        gtx.beginPath();
        gtx.moveTo(-p.size / 2, p.size / 2);
        gtx.lineTo(p.size / 2, p.size / 3);
        gtx.lineTo(0, -p.size / 2);
        gtx.closePath();
        gtx.fill();
      } else {
        gtx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      }
      gtx.restore();
      return true;
    });

    // Mode persistant (Mythique) : maintient un flux tant que actif.
    if (this.persistent && this.opts && this.particles.length < 90 && this.bursts < 12) {
      this.bursts += 1;
      this.spawn(this.opts, 40);
    }

    if (this.particles.length > 0) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
      gtx.clearRect(0, 0, w, h);
    }
  };

  stop(): void {
    this.persistent = false;
    this.bursts = 0;
    for (const p of this.particles) p.life = Math.min(p.life, p.age + 0.4);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.particles = [];
    this.running = false;
    this.gtx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
  }
}
