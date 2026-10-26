"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PostCard } from "@/components/PostCard";
import { StatCard } from "@/components/StatCard";
import { StreamChart } from "@/components/StreamChart";
import { StreamPill } from "@/components/StreamPill";
import { FlameIcon, GiftIcon, LogOutIcon, MapPinIcon, RefreshIcon, ScanIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Field";
import { useSession } from "@/lib/auth";
import { formatKg, formatMonthYear, formatPoints, timeAgo } from "@/lib/format";
import { pointsForLog } from "@/lib/points";
import { useStore } from "@/lib/store";

type Tab = "listings" | "log";

export default function ProfilePage() {
  const router = useRouter();
  const session = useSession();
  const { state, currentUser, stats, userById, distanceTo, resetDemo } = useStore();
  const [tab, setTab] = useState<Tab>("listings");
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await session.signOut();
      router.replace("/login");
    } catch {
      setSigningOut(false);
    }
  };

  const myPosts = useMemo(
    () => (currentUser ? state.posts.filter((p) => p.ownerId === currentUser.id) : []),
    [state.posts, currentUser],
  );
  const myLogs = useMemo(
    () => (currentUser ? state.logs.filter((l) => l.userId === currentUser.id).slice(0, 50) : []),
    [state.logs, currentUser],
  );
  const claimCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of state.claims) m.set(c.postId, (m.get(c.postId) ?? 0) + 1);
    return m;
  }, [state.claims]);

  if (!currentUser) return null;
  const user = currentUser;
  const ratePct = Math.round(stats.diversionRate * 100);
  const targetPct = Math.round(stats.target * 100);

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
            {user.isGuest && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-emerald-50 ring-1 ring-white/20">
                Guest account · lives on this device
              </p>
            )}
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
              { value: "listings", label: `My listings (${myPosts.length})` },
              { value: "log", label: `My log (${myLogs.length})` },
            ]}
          />
        </div>

        {tab === "listings" ? (
          myPosts.length === 0 ? (
            <EmptyState
              emoji="📦"
              title="No listings yet"
              description="Give something away and it'll show up here."
              action={<ButtonLink href="/posts/new">Give something away</ButtonLink>}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
              {myPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  owner={userById(post.ownerId)}
                  distanceKm={distanceTo(post.location)}
                  claimCount={claimCounts.get(post.id) ?? 0}
                />
              ))}
            </div>
          )
        ) : myLogs.length === 0 ? (
          <EmptyState emoji="📷" title="Nothing logged yet" description="Scan an item and tap “Log it” to start tracking." action={<ButtonLink href="/scan">Scan an item</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-3xl border border-stone-200 bg-white">
            {myLogs.map((l) => (
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
                resetDemo();
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
