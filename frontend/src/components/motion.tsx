"use client";

// One place for animation primitives. LazyMotion + `m` keeps the motion bundle small (domAnimation
// only, no layout/drag features) and `strict` throws if anyone imports the full `motion` component.
// MotionConfig reducedMotion="user" turns transforms off when the OS asks for reduced motion.
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

export { AnimatePresence, m, useReducedMotion };

export const EASE = [0.2, 0.8, 0.2, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/**
 * Fade + 10 px rise on mount. `index` staggers the first `maxStagger` siblings by `stepMs`;
 * later ones appear without delay so long lists never feel slow. Opacity/transform only — no layout.
 */
export function Reveal({
  children,
  index = 0,
  className,
  stepMs = 40,
  maxStagger = 8,
  durationMs = 200,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  stepMs?: number;
  maxStagger?: number;
  durationMs?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durationMs / 1000, ease: EASE, delay: index < maxStagger ? (index * stepMs) / 1000 : 0 }}
    >
      {children}
    </m.div>
  );
}

/** Counts from 0 to `to` over `durationMs` (instant when reduced motion is requested). */
export function useCountUp(to: number, durationMs = 650): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, durationMs, reduced]);
  return value;
}
