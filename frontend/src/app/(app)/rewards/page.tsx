"use client";

import { useState } from "react";

import { LiveStatus, PageHeader } from "@/components/AppShell";
import { RewardCard } from "@/components/RewardCard";
import { ClipboardIcon, GiftIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { SignInCancelled, useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/async";
import { data } from "@/lib/data";
import { useMyRedemptions } from "@/lib/data/hooks";
import { formatDate, formatPoints } from "@/lib/format";
import { REWARDS, rewardById } from "@/lib/rewards";
import type { Reward } from "@/lib/types";

export default function RewardsPage() {
  const toast = useToast();
  const session = useSession();
  const user = session.user;
  const redemptions = useMyRedemptions(user?.id ?? null);
  const [pending, setPending] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [issued, setIssued] = useState<{ reward: Reward; code: string } | null>(null);

  const balance = user?.points ?? 0;
  // Redeeming is the one action that needs a real identity: it stops someone farming points across
  // throw-away guest accounts.
  const needsGoogle = session.mode === "firebase" && !!user?.isGuest;

  const confirm = async () => {
    if (!pending || !user) return;
    setBusy(true);
    try {
      const r = await data.redeem(user, pending.id);
      setIssued({ reward: pending, code: r.code });
      setPending(null);
      toast.points(-pending.cost, `${pending.title} at ${pending.businessName}`);
    } catch (err) {
      toast.error("Couldn't redeem", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onLink = async () => {
    setLinking(true);
    try {
      await session.linkWithGoogle();
      toast.success("Account saved", "You can redeem rewards now.");
    } catch (err) {
      if (!(err instanceof SignInCancelled)) toast.error("Couldn't link Google", errorMessage(err));
    } finally {
      setLinking(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied");
    } catch {
      toast.error("Couldn't copy", "Long-press the code to copy it.");
    }
  };

  return (
    <>
      <PageHeader title="Rewards" subtitle="Redeem your points at local Markham businesses." back={{ href: "/profile", label: "Profile" }} />

      <div className="mb-6 flex items-center justify-between gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Your balance</p>
          <p className="text-3xl font-extrabold text-emerald-900">
            {formatPoints(balance)} <span className="text-base font-semibold text-emerald-700">pts</span>
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
          <GiftIcon size={24} />
        </div>
      </div>

      {needsGoogle && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <div className="flex-1 text-sm text-amber-900">
            <p className="font-semibold">Sign in with Google to redeem.</p>
            <p>Guests can earn points, but a redeem code needs a real account. Your points come with you.</p>
          </div>
          <Button onClick={() => void onLink()} loading={linking}>
            Sign in with Google
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REWARDS.map((reward) => (
          <RewardCard key={reward.id} reward={reward} balance={needsGoogle ? 0 : balance} onRedeem={setPending} />
        ))}
      </div>

      <section className="mt-10">
        <LiveStatus error={redemptions.error} slow={redemptions.slow} onRetry={redemptions.retry} />
        {(redemptions.data ?? []).length > 0 && (
          <>
            <h2 className="mb-3 text-lg font-bold text-stone-900">My redemptions</h2>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-3xl border border-stone-200 bg-white">
              {(redemptions.data ?? []).map((r) => {
                const reward = rewardById(r.rewardId);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-2xl" aria-hidden="true">
                      {reward?.emoji ?? "🎁"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-stone-900">{reward?.title ?? "Reward"}</p>
                      <p className="truncate text-xs text-stone-500">
                        {reward?.businessName} · {formatDate(r.createdAt)}
                      </p>
                    </div>
                    <button type="button" onClick={() => copy(r.code)} className="rounded-lg bg-stone-100 px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-stone-800 hover:bg-stone-200">
                      {r.code}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Confirm */}
      <Modal
        open={!!pending}
        onClose={() => !busy && setPending(null)}
        title={pending ? `Redeem ${pending.title}?` : ""}
        description={pending ? `${pending.businessName} · ${pending.address}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} loading={busy}>
              Redeem for {pending ? formatPoints(pending.cost) : ""} pts
            </Button>
          </>
        }
      >
        {pending && (
          <div className="rounded-2xl bg-stone-50 p-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-stone-500">Your balance</span>
              <span className="font-semibold">{formatPoints(balance)} pts</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-stone-500">Cost</span>
              <span className="font-semibold text-rose-600">−{formatPoints(pending.cost)} pts</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-stone-200 pt-2">
              <span className="font-semibold text-stone-700">After</span>
              <span className="font-bold text-emerald-700">{formatPoints(balance - pending.cost)} pts</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Code */}
      <Modal open={!!issued} onClose={() => setIssued(null)} footer={<Button onClick={() => setIssued(null)}>Done</Button>}>
        {issued && (
          <div className="py-2 text-center animate-pop">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl" aria-hidden="true">
              {issued.reward.emoji}
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-stone-900">{issued.reward.title}</h2>
            <p className="text-sm text-stone-500">{issued.reward.businessName}</p>
            <div className="mx-auto mt-5 w-fit rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-6 py-4">
              <p className="font-mono text-3xl font-extrabold tracking-[0.3em] text-emerald-900">{issued.code}</p>
            </div>
            <p className="mt-3 text-sm font-medium text-stone-700">Show this at the counter.</p>
            <Button variant="ghost" size="sm" className="mt-2" leftIcon={<ClipboardIcon size={16} />} onClick={() => copy(issued.code)}>
              Copy code
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
