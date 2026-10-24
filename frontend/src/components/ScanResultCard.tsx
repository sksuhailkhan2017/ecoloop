"use client";

import { ExternalLinkIcon, SparklesIcon } from "@/components/icons";
import { StreamPill } from "@/components/StreamPill";
import { Chip } from "@/components/ui/Chip";
import { DEFAULT_LOCATION } from "@/lib/geo";
import { nearestDropOffUrl } from "@/lib/maps";
import { useStore } from "@/lib/store";
import type { ScanItem } from "@/lib/types";

function scoreTone(score: number): "emerald" | "amber" | "rose" {
  if (score >= 70) return "emerald";
  if (score >= 40) return "amber";
  return "rose";
}

function confidenceLabel(c: number): { text: string; tone: "emerald" | "amber" | "rose" } {
  if (c >= 0.8) return { text: "High confidence", tone: "emerald" };
  if (c >= 0.5) return { text: "Medium confidence", tone: "amber" };
  return { text: "Low confidence — double-check", tone: "rose" };
}

export function ScanResultCard({ item, index }: { item: ScanItem; index?: number }) {
  const conf = confidenceLabel(item.confidence);
  const { currentUser } = useStore();
  const dropOffUrl = nearestDropOffUrl(item.stream, currentUser?.location ?? DEFAULT_LOCATION);

  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {index !== undefined && <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Part {index + 1}</p>}
          <h3 className="text-lg font-bold text-stone-900">{item.productName && item.productName !== item.name ? item.productName : item.name}</h3>
          <p className="text-sm text-stone-500">
            {item.productName && item.productName !== item.name ? `${item.name} · ` : ""}
            {item.material}
          </p>
        </div>
        <StreamPill stream={item.stream} size="lg" />
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-stone-800">{item.instructions}</p>

      {item.reusable && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-emerald-50 p-3.5 text-sm text-emerald-900">
          <SparklesIcon className="mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">Someone nearby could use this</p>
            {item.reuseSuggestion && <p className="mt-0.5 text-emerald-800">{item.reuseSuggestion}</p>}
          </div>
        </div>
      )}

      {!item.reusable && item.reuseSuggestion && (
        <p className="mt-3 rounded-2xl bg-stone-50 p-3 text-sm text-stone-700">
          <span className="font-semibold">Lower-waste idea: </span>
          {item.reuseSuggestion}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.sustainabilityScore !== undefined && (
          <Chip tone={scoreTone(item.sustainabilityScore)}>Sustainability {item.sustainabilityScore}/100</Chip>
        )}
        <Chip tone={conf.tone}>{conf.text}</Chip>
        <Chip tone="stone">≈ {item.estWeightG >= 1000 ? `${(item.estWeightG / 1000).toFixed(1)} kg` : `${item.estWeightG} g`}</Chip>
        {dropOffUrl && (
          <a
            href={dropOffUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 items-center gap-1 rounded-full bg-orange-600 px-2.5 text-xs font-semibold text-white hover:bg-orange-700"
          >
            Find nearest drop-off <ExternalLinkIcon size={12} />
          </a>
        )}
      </div>
    </article>
  );
}
