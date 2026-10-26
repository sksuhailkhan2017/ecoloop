"use client";

// Next.js re-mounts a template on every navigation, which is exactly what a page/tab transition
// needs: a 180 ms fade + 6 px rise of the page content while the shell (nav, header) stays put.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { EASE, m } from "@/components/motion";

export default function AppTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <m.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE }}>
      {children}
    </m.div>
  );
}
