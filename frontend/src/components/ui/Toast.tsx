"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { CheckIcon, SparklesIcon, XIcon } from "@/components/icons";
import { useCountUp } from "@/components/motion";

type Tone = "success" | "info" | "error" | "points";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: Tone;
  durationMs?: number;
  /** Points toasts count up to this number instead of showing the title. */
  countTo?: number;
};

type Toast = ToastInput & { id: number };

type ToastApi = {
  show: (t: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  points: (delta: number, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<Tone, { wrap: string; icon: ReactNode }> = {
  success: { wrap: "border-emerald-200 bg-white", icon: <CheckIcon className="text-emerald-600" /> },
  info: { wrap: "border-stone-200 bg-white", icon: <SparklesIcon className="text-stone-500" /> },
  error: { wrap: "border-rose-200 bg-white", icon: <XIcon className="text-rose-600" /> },
  points: { wrap: "border-emerald-300 bg-emerald-600 text-white", icon: <span className="text-lg leading-none">🌱</span> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = ++counter.current;
      setToasts((t) => [...t.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), input.durationMs ?? 3800);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ title, description, tone: "success" }),
      error: (title, description) => show({ title, description, tone: "error" }),
      points: (delta, description) =>
        show({ title: `${delta > 0 ? "+" : ""}${delta} points`, description, tone: "points", countTo: delta }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6"
      >
        {toasts.map((t) => {
          const style = TONE_STYLES[t.tone ?? "info"];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg animate-slide-up ${style.wrap}`}
            >
              <span className="mt-0.5 shrink-0">{style.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-5">{t.countTo !== undefined ? <CountUpTitle to={t.countTo} /> : t.title}</p>
                {t.description && (
                  <p className={`mt-0.5 text-sm leading-5 ${t.tone === "points" ? "text-emerald-50" : "text-stone-500"}`}>
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className={`-mr-1 rounded-full p-1 ${t.tone === "points" ? "hover:bg-white/15" : "text-stone-400 hover:bg-stone-100"}`}
              >
                <XIcon size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

function CountUpTitle({ to }: { to: number }) {
  const n = useCountUp(Math.abs(to));
  return (
    <>
      {to < 0 ? "−" : "+"}
      {n} points
    </>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
