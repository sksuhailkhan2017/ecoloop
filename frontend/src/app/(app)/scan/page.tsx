"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/AppShell";
import { CameraCapture } from "@/components/CameraCapture";
import { SearchIcon, SparklesIcon, Spinner } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { nowIso, uid } from "@/lib/format";
import { BACKEND_SCAN_ENABLED, scanWithBackend } from "@/lib/scan-api";
import { SCAN_MESSAGES, mockScan } from "@/lib/scan-mock";
import { setScan } from "@/lib/session";
import type { ScanResult } from "@/lib/types";

const QUICK_HINTS = ["Styrofoam tray", "Coffee cup", "Jacket", "Dead phone", "Battery", "Pizza box", "Banana peel", "Old chair"];

export default function ScanPage() {
  const router = useRouter();
  const toast = useToast();
  const [photo, setPhoto] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    if (!scanning) return;
    const t = window.setInterval(() => setMsg((i) => (i + 1) % SCAN_MESSAGES.length), 850);
    return () => window.clearInterval(t);
  }, [scanning]);

  const canIdentify = !!photo || hint.trim().length > 1;

  const identify = async () => {
    if (!canIdentify || scanning) return;

    setScanning(true);
    setMsg(0);

    let id = uid();
    let result: ScanResult | null = null;

    if (BACKEND_SCAN_ENABLED && photo) {
      try {
        const r = await scanWithBackend(photo, hint, "auto"); // the AI decides: item or receipt
        id = r.scanId;
        result = r.result;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Something went wrong.";
        // Fall back to the built-in matcher so a backend hiccup never kills the demo.
        toast.show({ title: "Using offline sorting", description: message, tone: "info" });
        result = mockScan(hint);
      }
    } else {
      await new Promise((r) => setTimeout(r, 2300));
      result = mockScan(hint);
    }

    setScan({ id, photoURL: photo ?? undefined, hint: hint.trim(), result, mode: result?.kind, createdAt: nowIso() });
    router.push("/scan/result");
  };

  return (
    <>
      <PageHeader title="Scan an item" subtitle="Find out which Markham bin or depot it belongs in — then log it or give it away." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
        <div className="relative">
          {photo ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-stone-900">
                <img src={photo} alt="Item to identify" className="aspect-[4/3] w-full object-cover" />
                {scanning && <ScanningOverlay message={SCAN_MESSAGES[msg]} />}
              </div>
              {!scanning && (
                <Button variant="outline" fullWidth onClick={() => setPhoto(null)}>
                  Retake photo
                </Button>
              )}
            </div>
          ) : (
            <div className="relative">
              <CameraCapture onCapture={setPhoto} helper="Point at the item. Your browser will ask for camera access." />
              {scanning && (
                <div className="absolute inset-0 overflow-hidden rounded-3xl">
                  <ScanningOverlay message={SCAN_MESSAGES[msg]} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <>
              <Field label="What is it?" htmlFor="hint" optional hint="A few words help a lot — e.g. “foam meat tray” or “winter coat”.">
                <div className="relative">
                  <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    id="hint"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void identify()}
                    placeholder="Describe the item"
                    className={`${inputClass} pl-11`}
                    maxLength={80}
                    disabled={scanning}
                  />
                </div>
              </Field>

              <div className="flex flex-wrap gap-2">
                {QUICK_HINTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setHint(q)}
                    disabled={scanning}
                    className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
          </>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
            <p className="flex items-center gap-2 font-semibold text-stone-900">
              <SparklesIcon size={18} className="text-emerald-600" /> Tips for a good scan
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>One item at a time, on a plain background. Receipts work too.</li>
              <li>Multi-part items (coffee cup, pizza box) get sorted part by part.</li>
              <li>If it still works, you&apos;ll get a one-tap “Post to Marketplace”.</li>
            </ul>
          </div>

          <div className="sticky bottom-20 z-10 md:static">
            <Button size="xl" fullWidth onClick={() => void identify()} disabled={!canIdentify} loading={scanning} leftIcon={<SparklesIcon />}>
              {scanning ? "Identifying…" : "Identify"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function ScanningOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-900/70 text-white backdrop-blur-sm animate-fade-in">
      <div aria-hidden="true" className="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400/80 shadow-[0_0_24px_4px_rgba(52,211,153,0.6)] animate-pulse" />
      <Spinner className="h-8 w-8" />
      <p className="text-sm font-semibold" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
