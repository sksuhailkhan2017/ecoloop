"use client";

import type { ReactNode } from "react";

import { MotionProvider } from "@/components/motion";
import { ToastProvider } from "@/components/ui/Toast";
import { SessionProvider } from "@/lib/auth";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <SessionProvider>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </MotionProvider>
  );
}
