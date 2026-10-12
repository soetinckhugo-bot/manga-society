'use client';

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';

import { cn } from '@/lib/utils';

import { useReducedMotion } from './use-reduced-motion';

/** Pointeurs fins + survol disponible (desktop, pas tactile). */
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

function subscribeFinePointer(callback: () => void): () => void {
  const mql = window.matchMedia(FINE_POINTER);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFinePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  );
}

export interface TiltProps {
  children: ReactNode;
  className?: string;
  /** Intensité max des rotations en degrés (défaut 8). */
  intensity?: number;
  /** Désactive le tilt (ex. pendant une animation de reveal). */
  disabled?: boolean;
}

/**
 * Tilt 3D au survol — desktop uniquement, transform rotateX/rotateY
 * uniquement, mutations DOM directes sous rAF (zéro re-render React
 * pendant le mouvement), will-change parcimonieux (activé au survol,
 * retiré à la sortie). Respecte prefers-reduced-motion.
 */
export function Tilt({ children, className, intensity = 8, disabled = false }: TiltProps) {
  const reduced = useReducedMotion();
  const finePointer = useFinePointer();
  const frameRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const active = !disabled && !reduced && finePointer;

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!active) return;
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      frame.style.transform = `rotateX(${(-py * intensity).toFixed(2)}deg) rotateY(${(px * intensity).toFixed(2)}deg)`;
    });
  }

  function handleEnter(event: React.PointerEvent<HTMLDivElement>) {
    if (!active) return;
    event.currentTarget.style.willChange = 'transform';
    handleMove(event);
  }

  function handleLeave(event: React.PointerEvent<HTMLDivElement>) {
    cancelAnimationFrame(rafRef.current);
    event.currentTarget.style.willChange = 'auto';
    const frame = frameRef.current;
    if (frame) frame.style.transform = 'rotateX(0deg) rotateY(0deg)';
  }

  return (
    <div
      className={cn('[perspective:800px]', className)}
      onPointerEnter={handleEnter}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div
        ref={frameRef as RefObject<HTMLDivElement | null>}
        className="relative h-full w-full transition-transform duration-200 ease-out [transform-style:preserve-3d]"
      >
        {children}
      </div>
    </div>
  );
}
