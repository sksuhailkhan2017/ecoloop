"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LiveStatus, PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PostCard } from "@/components/PostCard";
import { StatCard } from "@/components/StatCard";
import { StreamChart } from "@/components/StreamChart";
import { StreamPill } from "@/components/StreamPill";
import { FlameIcon, GiftIcon, LogOutIcon, MapPinIcon, RefreshIcon, ScanIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Field";
import { PostCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SignInCancelled, useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/async";
import { useStats } from "@/lib/data/hooks";
import { formatKg, formatMonthYear, formatPoints, timeAgo } from "@/lib/format";
import { DEFAULT_LOCATION, haversineKm } from "@/lib/geo";
import { pointsForLog } from "@/lib/points";

type Tab = "listings" | "log";

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const user = session.user;
  const { stats, logs, myPosts } = useStats(user);
  const [tab, setTab] = useState<Tab>("listings");
  const [signingOut, setSigningOut] = useState(false);
  const [linking, setLinking] = useState(false);

  if (!user) return null;
  const ratePct = Math.round(stats.diversionRate * 100);
  const targetPct = Math.round(stats.target * 100);
  const here = user.location ?? DEFAULT_LOCATION;

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await session.signOut();
      router.replace("/login");
    } catch (err) {
      setSigningOut(false);
      toast.error("Couldn't sign out", errorMessage(err));
    }
  };

  const onLink = async () => {
    setLinking(true);
    try {
      const r = await session.linkWithGoogle();
      if (r === "linked") toast.success("Account saved", "Your points and listings now follow your Google account.");
      else toast.show({ title: "Signed into your existing account", description: "That Google account already had an EcoLoop profile, so we switched to it.", tone: "info" });
    } catch (err) {
      if (!(err instanceof SignInCancelled)) toast.error("Couldn't link Google", errorMessage(err));
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Profile"
        action={
          <div className="hidden gap-2 md:flex">
            <ButtonLink href="/rewards" leftIcon={<GiftIcon />}>
              Redeem points
            </ButtonLink>
          </div>
        }
      />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-emerald-700 p-5 text-white shadow-lg shadow-emerald-700/20 sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-teal-300/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar user={user} size="2xl" ring />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{user.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-emerald-100">
              <span>@{user.handle}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPinIcon size={14} /> {user.neighbourhood}
              </span>
              <span aria-hidden="true">·</span>
              <span>Member since {formatMonthYear(user.joinedAt)}</span>
            </p>
            {user.bio && <p className="mt-2 max-w-md text-sm text-emerald-50">{user.bio}</p>}
          </div>
          <div className="flex gap-3 sm:flex-col sm:items-end">
            <div className="rounded-2xl bg-white/15 px-4 py-2.5 ring-1 ring-white/20 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100">Points</p>
              <p className="text-3xl font-extrabold leading-none">{formatPoints(user.points)}</p>
            </div>
            <div className="rounded-2xl bg-white/15 px-4 py-2.5 ring-1 ring-white/20 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100">Streak</p>
              <p className="flex items-center gap-1 text-3xl font-extrabold leading-none">
                <FlameIcon size={24} className="text-amber-300" /> {user.streakCount}
                <span className="text-base font-semibold text-emerald-100">d</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {user.isGuest && session.mode === "firebase" && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <div className="flex-1 text-sm text-amber-900">
            <p className="font-semibold">You&apos;re browsing as a guest.</p>
            <p>Your points and listings live on this device only. Link a Google account to keep them anywhere — nothing is lost.</p>
          </div>
          <Button onClick={() => void onLink()} loading={linking}>
            Sign in with Google
          </Button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 md:hidden">
        <ButtonLink href="/rewards" leftIcon={<GiftIcon />}>
          Redeem points
        </ButtonLink>
        <ButtonLink href="/scan" variant="secondary" leftIcon={<ScanIcon />}>
          Scan an item
        </ButtonLink>
      </div>

      {/* Dashboard */}
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-bold text-stone-900">Your impact</h2>
          <p className="text-xs text-stone-400">Estimated — based on your logged items</p>
        </div>
        <LiveStatus error={logs.error} slow={logs.slow} onRetry={logs.retry} />
        {logs.loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Items diverted" value={stats.itemsDiverted} sub={`of ${stats.itemsLogged} logged`} icon={<span aria-hidden="true">♻️</span>} />
            <StatCard label="Kept out of landfill" value={formatKg(stats.kgDiverted)} sub="estimated weight" icon={<span aria-hidden="true">⚖️</span>} />
            <StatCard
              label="Diversion rate"
              value={`${ratePct}%`}
              sub={
                stats.itemsLogged === 0
                  ? `Markham's target is ${targetPct}%`
                  : ratePct >= targetPct
                    ? `Above Markham's ${targetPct}% target`
                    : `${targetPct - ratePct} pts below Markham's ${targetPct}% target`
              }
              progress={{ value: stats.diversionRate, target: stats.target }}
              accent={ratePct >= targetPct && stats.itemsLogged > 0}
            />
            <StatCard label="Given away" value={stats.itemsGiven} sub={`${stats.itemsReceived} received`} icon={<span aria-hidden="true">🤝</span>} />
          </div>
        )}

        <div className="mt-3 rounded-3xl border border-stone-200 bg-white p-4 sm:p-5">
          <h3 className="font-bold text-stone-900">Where your items went</h3>
          <p className="text-xs text-stone-500">Items logged per stream</p>
          {stats.byStream.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">Log a scan to see your breakdown.</p>
          ) : (
            <div className="mt-3">
              <StreamChart data={stats.byStream} />
            </div>
          )}
        </div>
      </section>

      {/* Tabs */}
      <section className="mt-8">
        <div className="mb-4 max-w-sm">
          <Segmented<Tab>
            ariaLabel="Profile sections"
            value={tab}
            onChange={setTab}
            options={[
              { value: "listings", label: `My listings (${myPosts.data?.length ?? 0})` },
              { value: "log", label: `My log (${logs.data?.length ?? 0})` },
            ]}
          />
        </div>

        {tab === "listings" ? (
          <>
            <LiveStatus error={myPosts.error} slow={myPosts.slow} onRetry={myPosts.retry} />
            {myPosts.loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PostCardSkeleton key={i} />
                ))}
              </div>
            ) : (myPosts.data ?? []).length === 0 ? (
              <EmptyState emoji="📦" title="No listings yet" description="Give something away and it'll show up here." action={<ButtonLink href="/posts/new">Give something away</ButtonLink>} />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
                {(myPosts.data ?? []).map((post) => (
                  <PostCard key={post.id} post={post} owner={user} distanceKm={haversineKm(here, post.location)} claimCount={post.claimCount ?? 0} />
                ))}
              </div>
            )}
          </>
        ) : logs.loading ? (
          <Skeleton className="h-40 w-full rounded-3xl" />
        ) : (logs.data ?? []).length === 0 ? (
          <EmptyState emoji="📷" title="Nothing logged yet" description="Scan an item and tap “Log it” to start tracking." action={<ButtonLink href="/scan">Scan an item</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-3xl border border-stone-200 bg-white">
            {(logs.data ?? []).slice(0, 50).map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-stone-900">{l.itemName}</p>
                  <p className="text-xs text-stone-500">
                    {timeAgo(l.createdAt)} · ≈ {l.estWeightG >= 1000 ? `${(l.estWeightG / 1000).toFixed(1)} kg` : `${l.estWeightG} g`}
                  </p>
                </div>
                <StreamPill stream={l.stream} size="sm" />
                <span className="w-10 text-right text-sm font-bold text-emerald-700">+{pointsForLog(l.stream).delta}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-6">
        <Button variant="ghost" leftIcon={<LogOutIcon />} onClick={() => void onSignOut()} loading={signingOut}>
          Sign out
        </Button>
        {session.mode === "demo" && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Reset all demo data in this browser? Your posts, logs and points go back to the seed.")) {
                session.resetDemo();
                router.replace("/login");
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700"
          >
            <RefreshIcon size={14} /> Reset demo data
          </button>
        )}
      </div>
    </>
  );
}
