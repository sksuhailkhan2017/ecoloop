"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect } from "react";

import { useStore } from "@/lib/store";

export default function Home() {
  const { hydrated, currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(currentUser ? "/feed" : "/login");
  }, [hydrated, currentUser, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50">
      <div className="flex items-center gap-3 animate-fade-in">
        <Image src="/ecoloop-mark.png" alt="" width={48} height={48} className="h-12 w-12" />
        <span className="text-2xl font-extrabold tracking-tight text-stone-900">EcoLoop</span>
      </div>
    </div>
  );
}
