"use client";

// First-login walkthrough: three short slides on how EcoLoop works. Shown once per profile
// (users/{uid}.onboardedAt), with a localStorage backstop so a failed write never re-shows it.
import { useEffect, useState } from "react";

import { ArrowRightIcon, GiftIcon, HeartIcon, ScanIcon } from "@/components/icons";
import { AnimatePresence, EASE, m, useReducedMotion } from "@/components/motion";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/auth";
import { nowIso } from "@/lib/format";
import type { User } from "@/lib/types";

const SLIDES = [
  {
    icon: ScanIcon,
    accent: "bg-emerald-600",
    title: "Scan anything",
    text: "Point your camera at an item. EcoLoop tells you the exact Markham bin or depot — part by part, so a coffee cup, lid and sleeve each go to the right place.",
  },
  {
    icon: HeartIcon,
    accent: "bg-rose-500",
    title: "Give it away instead",
    text: "Still usable? Post it free in a few taps. Neighbours nearby see it first, tap “I want this”, and you confirm the handover with a photo.",
  },
  {
    icon: GiftIcon,
    accent: "bg-amber-500",
    title: "Earn and redeem",
    text: "Logging items and real handovers earn points you can spend at local Markham shops. Sign in with Google from Profile to keep them on every device.",
  },
];

const SKIP_KEY = "ecoloop.onboarded";

function readSkip(uid: string): boolean {
  try {
    return window.localStorage.getItem(SKIP_KEY) === uid;
  } catch {
    return false;
  }
}

function writeSkip(uid: string) {
  try {
    window.localStorage.setItem(SKIP_KEY, uid);
  } catch {
    /* ignore */
  }
}

export function Onboarding({ user }: { user: User }) {
  const { updateUser } = useSession();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    setOpen(!user.onboardedAt && !readSkip(user.id));
  }, [user.id, user.onboardedAt]);

  if (!open) return null;

  const finish = () => {
    setOpen(false);
    writeSkip(user.id);
    updateUser({ onboardedAt: nowIso() }).catch(() => undefined);
  };

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const last = step === SLIDES.length - 1;
  const slide = SLIDES[step];
  const Icon = slide.icon;
  const offset = reduced ? 0 : 24;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <m.div className="absolute inset-0 bg-stone-900/60 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} />
      <m.div
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        initial={{ opacity: 0, y: reduced ? 0 : 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">Welcome to EcoLoop</span>
            <button type="button" onClick={finish} className="rounded-lg px-2 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800">
              Skip
            </button>
          </div>
        </div>

        <div className="relative min-h-[260px] px-6 py-5">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={step}
              initial={{ opacity: 0, x: dir * offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -dir * offset }}
              transition={{ duration: 0.18, ease: EASE }}
            >
              <span className={`flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg ${slide.accent}`}>
                <Icon size={32} />
              </span>
              <h2 id="onboarding-title" className="mt-5 text-2xl font-extrabold tracking-tight text-stone-900">
                {slide.title}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-stone-600">{slide.text}</p>
            </m.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-6 py-4 safe-bottom">
          <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${SLIDES.length}`}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all ${i === step ? "w-6 bg-emerald-600" : "w-2 bg-stone-300 hover:bg-stone-400"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => go(step - 1)}>
                Back
              </Button>
            )}
            <Button onClick={() => (last ? finish() : go(step + 1))} rightIcon={last ? undefined : <ArrowRightIcon size={18} />}>
              {last ? "Start scanning" : "Next"}
            </Button>
          </div>
        </div>
      </m.div>
    </div>
  );
}
