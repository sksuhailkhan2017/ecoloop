"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ScanResultCard } from "@/components/ScanResultCard";
import { StreamPill } from "@/components/StreamPill";
import { ArrowRightIcon, CheckIcon, GiftIcon, ScanIcon, SearchIcon } from "@/components/icons";
import { Button, ButtonLink } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { pointsForLog } from "@/lib/points";
import { buildScanResult, searchRules } from "@/lib/scan-mock";
import { clearScan, getScan, setPrefill, setScan, type StoredScan } from "@/lib/session";
import { useStore } from "@/lib/store";
import type { Category, ScanItem, ScanResult } from "@/lib/types";

function inferCategory(item: ScanItem): Category {
  const n = item.name.toLowerCase();
  if (item.stream === "textile_bin" || /jacket|coat|shirt|jeans|shoe|sneaker|hat|dress|sock/.test(n)) return "clothing";
  if (/phone|laptop|tv|television|monitor|computer|printer|console|camera|headphone|tablet|speaker/.test(n)) return "electronics";
  if (item.stream === "bulky_pickup" || /chair|table|sofa|couch|lamp|desk|dresser|shelf|stool|mattress/.test(n)) return "furniture";
  if (/pot|pan|mug|plate|kettle|toaster|blender|cutlery|dish/.test(n)) return "kitchen";
  if (/book|magazine|novel/.test(n)) return "books";
  if (/toy|stroller|crib|lego|puzzle|game/.test(n)) return "kids";
  return "other";
}

export default function ScanResultPage() {
  const router = useRouter();
  const toast = useToast();
  const { logItems } = useStore();

  const [scan, setScanState] = useState<StoredScan | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [logged, setLogged] = useState<{ delta: number; streakCount: number; bonus: boolean; count: number } | null>(null);

  useEffect(() => {
    const s = getScan();
    setScanState(s);
    setQuery(s?.hint ?? "");
  }, []);

  const suggestions = useMemo(() => searchRules(query, 8), [query]);
  const result: ScanResult | null = scan?.result ?? null;

  const pick = (item: string) => {
    if (!scan) return;
    const rule = suggestions.find((s) => s.rule.item === item)?.rule;
    if (!rule) return;
    const next: StoredScan = { ...scan, result: buildScanResult([rule], 0.99) };
    setScan(next);
    setScanState(next);
  };

  const onLog = () => {
    if (!scan || !result) return;
    const r = logItems(result.items, scan.id);
    setLogged(r);
    toast.points(r.delta, r.bonus ? `7-day streak bonus! 🔥 ${r.streakCount}-day streak` : `${r.streakCount}-day streak 🔥`);
    clearScan();
  };

  const onPost = () => {
    if (!scan || !result) return;
    const main = result.items.find((i) => i.reusable) ?? result.items[0];
    setPrefill({
      title: main.name,
      category: inferCategory(main),
      photoURL: scan.photoURL,
      fromScanId: scan.id,
      description: main.reuseSuggestion ? `${main.reuseSuggestion}` : "",
    });
    router.push("/posts/new");
  };

  if (scan === undefined) return null;

  if (scan === null) {
    return (
      <EmptyState
        emoji="📷"
        title="No scan yet"
        description="Scan an item first and the result will show up here."
        action={<ButtonLink href="/scan">Go to Scan</ButtonLink>}
      />
    );
  }

  if (logged) {
    const diverted = result?.items.filter((i) => pointsForLog(i.stream).reason === "log_diverted").length ?? 0;
    return (
      <div className="mx-auto max-w-md py-10 text-center animate-pop">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-5xl">♻️</div>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-stone-900">Logged!</h1>
        <p className="mt-2 text-lg text-stone-600">
          <span className="font-bold text-emerald-700">+{logged.delta} points</span> · {logged.streakCount}-day streak 🔥
        </p>
        <p className="mt-1 text-sm text-stone-500">
          {logged.count === 1 ? "1 item" : `${logged.count} items`} logged, {diverted} diverted from landfill.
          {logged.bonus ? " 7-day streak bonus unlocked!" : ""}
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <ButtonLink href="/scan" variant="primary" size="lg" leftIcon={<ScanIcon />}>
            Scan another
          </ButtonLink>
          <ButtonLink href="/profile" variant="outline" size="lg" rightIcon={<ArrowRightIcon />}>
            See my impact
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Scan result" back={{ href: "/scan", label: "Scan" }} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-3xl border border-stone-200 bg-white p-4">
            {scan.photoURL ? (
              <img src={scan.photoURL} alt="Scanned item" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-3xl">🔍</div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{result ? "Identified" : "Needs a hand"}</p>
              <p className="text-lg font-bold leading-snug text-stone-900">
                {result ? result.summary : "We couldn’t identify this one confidently."}
              </p>
              {scan.hint && <p className="mt-0.5 truncate text-sm text-stone-500">Your hint: “{scan.hint}”</p>}
            </div>
          </div>

          {result ? (
            result.items.map((item, i) => <ScanResultCard key={`${item.name}-${i}`} item={item} index={result.items.length > 1 ? i : undefined} />)
          ) : (
            <section className="rounded-3xl border border-stone-200 bg-white p-5">
              <h2 className="font-bold text-stone-900">Help us identify it</h2>
              <p className="mt-1 text-sm text-stone-500">Search Markham&apos;s What Goes Where list and pick the closest match.</p>
              <label className="relative mt-4 block">
                <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. foam tray, lamp, batteries"
                  className={`${inputClass} pl-11`}
                />
              </label>
              <ul className="mt-3 divide-y divide-stone-100">
                {suggestions.length === 0 && <li className="py-6 text-center text-sm text-stone-400">Keep typing — try the material, like “plastic” or “metal”.</li>}
                {suggestions.map(({ rule }) => (
                  <li key={rule.item}>
                    <button
                      type="button"
                      onClick={() => pick(rule.item)}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:bg-stone-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-stone-900">{rule.item}</span>
                        {rule.aliases.length > 0 && <span className="block truncate text-xs text-stone-400">{rule.aliases.slice(0, 3).join(" · ")}</span>}
                      </span>
                      <StreamPill stream={rule.stream} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {result && result.kind === "receipt" && (
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-3xl border border-stone-200 bg-white p-5">
              <p className="font-semibold text-stone-900">Your sorting guide</p>
              <p className="mt-1 text-sm text-stone-500">
                Receipts are guidance only. Scan each item as you throw it out to log it and earn points.
              </p>
              <ButtonLink href="/scan" size="lg" fullWidth className="mt-4" leftIcon={<ScanIcon />}>
                Scan an item
              </ButtonLink>
            </div>
          </aside>
        )}

        {result && result.kind !== "receipt" && (
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="fixed inset-x-0 bottom-16 z-20 border-t border-stone-200 bg-white/95 p-3 backdrop-blur safe-bottom lg:static lg:rounded-3xl lg:border lg:p-5">
              <div className="mx-auto flex max-w-5xl flex-col gap-2 lg:gap-3">
                <p className="hidden text-sm text-stone-500 lg:block">
                  {result.overallReusable
                    ? "Still usable — someone nearby would probably love it."
                    : "Log it to track your diversion and earn points."}
                </p>
                {result.overallReusable ? (
                  <>
                    <Button size="lg" fullWidth onClick={onPost} leftIcon={<GiftIcon />}>
                      Post to Marketplace
                    </Button>
                    <Button size="lg" fullWidth variant="secondary" onClick={onLog} leftIcon={<CheckIcon />}>
                      Log it — I&apos;m disposing of this
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="lg" fullWidth onClick={onLog} leftIcon={<CheckIcon />}>
                      Log it — I&apos;m disposing of this
                    </Button>
                    <Button size="lg" fullWidth variant="outline" onClick={onPost} leftIcon={<GiftIcon />}>
                      Post to Marketplace instead
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="h-32 lg:hidden" aria-hidden="true" />
          </aside>
        )}
      </div>
    </>
  );
}
