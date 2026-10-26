"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  FlameIcon,
  GiftIcon,
  HomeIcon,
  LogOutIcon,
  PlusIcon,
  ScanIcon,
  UserIcon,
} from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useSession } from "@/lib/auth";
import { formatPoints } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

const NAV = [
  { href: "/feed", label: "Home", icon: HomeIcon },
  { href: "/scan", label: "Scan", icon: ScanIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
  { href: "/rewards", label: "Rewards", icon: GiftIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/feed") return pathname === "/feed" || pathname.startsWith("/posts");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/feed" className="flex items-center gap-2.5">
      <Image src="/ecoloop-mark.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-base font-extrabold tracking-tight text-stone-900">EcoLoop</span>
          <span className="block text-[11px] font-medium text-stone-500">Markham, Ontario</span>
        </span>
      )}
    </Link>
  );
}

export function PointsPill({ points, streak, size = "md" }: { points: number; streak?: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-emerald-100 font-bold text-emerald-800 ${cls}`}>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true">🌱</span>
        {formatPoints(points)}
      </span>
      {streak !== undefined && streak > 0 && (
        <span className="inline-flex items-center gap-0.5 border-l border-emerald-300 pl-2 text-amber-700">
          <FlameIcon size={14} /> {streak}
        </span>
      )}
    </span>
  );
}

function Sidebar({ user, pathname, onLogout }: { user: User; pathname: string; onLogout: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-stone-200 bg-white md:flex">
      <div className="px-5 pb-4 pt-6">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Primary">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                active ? "bg-emerald-50 text-emerald-800" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              <Icon size={20} className={active ? "text-emerald-700" : "text-stone-400"} />
              {label}
            </Link>
          );
        })}

        <div className="pt-4">
          <ButtonLink href="/posts/new" fullWidth leftIcon={<PlusIcon />}>
            Give something away
          </ButtonLink>
        </div>
      </nav>

      <div className="border-t border-stone-200 p-4">
        <Link href="/profile" className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-stone-100">
          <Avatar user={user} size="md" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-bold text-stone-900">{user.name}</span>
            <span className="block truncate text-xs text-stone-500">{user.neighbourhood}</span>
          </span>
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2 px-2">
          <PointsPill points={user.points} streak={user.streakCount} size="sm" />
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            <LogOutIcon size={16} /> Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-2.5 backdrop-blur md:hidden">
      <Logo />
      <div className="flex items-center gap-2">
        <PointsPill points={user.points} streak={user.streakCount} size="sm" />
        <Link href="/profile" aria-label="Profile">
          <Avatar user={user} size="sm" />
        </Link>
      </div>
    </header>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  const tabs = [NAV[0], NAV[1], NAV[2]];
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur safe-bottom md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          const isScan = href === "/scan";
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  active ? "text-emerald-700" : "text-stone-500"
                }`}
              >
                {isScan ? (
                  <span
                    className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-emerald-600/30 ring-4 ring-white ${
                      active ? "bg-emerald-700" : "bg-emerald-600"
                    }`}
                  >
                    <Icon size={26} />
                  </span>
                ) : (
                  <Icon size={24} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Auth guard for the (app) route group: skeleton while the session loads, /login when signed out. */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const store = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/login");
  }, [session.status, router]);

  // Phase 1 bridge: points/streak are still awarded locally, so prefer the store's mirror of the
  // profile for display. Falls back to the Firestore profile until the mirror catches up.
  const user = store.currentUser ?? session.user;

  const onLogout = async () => {
    setSigningOut(true);
    try {
      await session.signOut();
      router.replace("/login");
    } catch (err) {
      setSigningOut(false);
      console.error("Sign out failed:", err);
    }
  };

  if (session.status === "signed-in" && !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4">
        <div role="alert" className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl">!</div>
          <h1 className="mt-4 text-xl font-extrabold text-stone-900">Couldn&apos;t load your profile</h1>
          <p className="mt-1 text-sm text-stone-500">{session.error ?? "Please try again."}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={session.retry}>Try again</Button>
            <Button variant="ghost" onClick={() => void onLogout()} loading={signingOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (session.status !== "signed-in" || !user) {
    return (
      <div className="min-h-dvh bg-stone-50">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:pl-72 lg:px-8">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-stone-50">
      <Sidebar user={user} pathname={pathname} onLogout={() => void onLogout()} />
      <MobileTopBar user={user} />
      <main className="md:pl-64">
        <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 md:pb-12 md:pt-8 lg:px-8">{children}</div>
      </main>
      <MobileTabBar pathname={pathname} />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-5 sm:mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-900">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-stone-500 sm:text-base">{subtitle}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}
