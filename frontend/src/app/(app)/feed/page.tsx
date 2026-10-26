"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LiveStatus, PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PostCard } from "@/components/PostCard";
import { MapPinIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/Button";
import { FilterChip } from "@/components/ui/Chip";
import { PostCardSkeleton } from "@/components/ui/Skeleton";
import { useSession } from "@/lib/auth";
import { useFeed, useUsers } from "@/lib/data/hooks";
import { NeighbourhoodPicker } from "@/components/NeighbourhoodPicker";
import { DEFAULT_LOCATION, haversineKm } from "@/lib/geo";
import { SAMPLE_POSTS } from "@/lib/sample-posts";
import { CATEGORIES, CATEGORY_META, type Category } from "@/lib/types";

export default function FeedPage() {
  const { user, mode } = useSession();
  const feed = useFeed();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [showGone, setShowGone] = useState(false);
  const [picker, setPicker] = useState(false);

  const here = user?.location ?? DEFAULT_LOCATION;

  // Firestore mode shows two badged sample listings so a brand-new deployment isn't empty.
  const posts = useMemo(() => {
    const live = feed.data ?? [];
    return mode === "firebase" ? [...live, ...SAMPLE_POSTS] : live;
  }, [feed.data, mode]);

  const owners = useUsers(posts.map((p) => p.ownerId));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter((p) => showGone || p.status === "open")
      .filter((p) => category === "all" || p.category === category)
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.neighbourhood.toLowerCase().includes(q))
      .map((post) => ({ post, distanceKm: haversineKm(here, post.location) }))
      .sort((a, b) => {
        if (a.post.status !== b.post.status) return a.post.status === "open" ? -1 : 1;
        if (!!a.post.isSample !== !!b.post.isSample) return a.post.isSample ? 1 : -1; // real items first
        return a.distanceKm - b.distanceKm;
      });
  }, [posts, query, category, showGone, here]);

  const real = posts.filter((p) => !p.isSample);
  const openCount = real.filter((p) => p.status === "open").length;
  const givenCount = real.filter((p) => p.status === "picked_up").length;
  const wantedCount = real.reduce((n, p) => n + (p.claimCount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Near you"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <MapPinIcon size={16} className="text-emerald-600" />
            <span className="font-medium text-stone-700">{user?.neighbourhood ?? "Markham"}</span>
            <span aria-hidden="true">·</span>
            <span>Markham, ON</span>
            <button type="button" onClick={() => setPicker(true)} className="ml-1 font-semibold text-emerald-700 hover:underline">
              Change area
            </button>
          </span>
        }
        action={
          <ButtonLink href="/posts/new" leftIcon={<PlusIcon />} className="hidden md:inline-flex">
            Give something away
          </ButtonLink>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "Free nearby", value: openCount, emoji: "📦" },
          { label: "Given away", value: givenCount, emoji: "🤝" },
          { label: "Requests", value: wantedCount, emoji: "💚" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 sm:px-4">
            <span className="text-xl" aria-hidden="true">
              {s.emoji}
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-extrabold text-stone-900">{feed.loading ? "–" : s.value}</span>
              <span className="block text-[11px] font-medium text-stone-500 sm:text-xs">{s.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mb-4 space-y-3">
        <label className="relative block">
          <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chairs, jackets, Unionville…"
            className="block w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-4 text-base shadow-sm placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 sm:text-sm"
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterChip selected={category === "all"} onClick={() => setCategory("all")}>
            All
          </FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip key={c} selected={category === c} onClick={() => setCategory(c)}>
              <span aria-hidden="true">{CATEGORY_META[c].emoji}</span> {CATEGORY_META[c].label}
            </FilterChip>
          ))}
          <FilterChip selected={showGone} onClick={() => setShowGone((v) => !v)}>
            ✓ Given away
          </FilterChip>
        </div>
      </div>

      <LiveStatus error={feed.error} slow={feed.slow} onRetry={feed.retry} />

      {feed.loading && !feed.error ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4" aria-busy="true" aria-label="Loading nearby items">
          {Array.from({ length: 8 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          emoji="🌱"
          title={query || category !== "all" ? "Nothing matches" : "Nothing nearby yet"}
          description={query || category !== "all" ? "Try a different search or category." : "Scan something to get started, or be the first to give an item away."}
          action={
            <ButtonLink href="/scan" variant="primary">
              Scan an item
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {rows.map(({ post, distanceKm }, i) => (
            <PostCard
              key={post.id}
              index={i}
              post={post}
              owner={owners.get(post.ownerId)}
              distanceKm={distanceKm}
              claimCount={post.claimCount ?? 0}
              mine={post.ownerId === user?.id}
            />
          ))}
        </div>
      )}

      <NeighbourhoodPicker open={picker} reason="change" current={user?.neighbourhood} onClose={() => setPicker(false)} onDone={() => setPicker(false)} />

      <Link
        href="/posts/new"
        aria-label="Give something away"
        className="fixed bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 transition hover:bg-emerald-700 active:scale-95 md:hidden"
      >
        <PlusIcon size={26} />
      </Link>
    </>
  );
}
