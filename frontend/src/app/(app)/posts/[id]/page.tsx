"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { LiveStatus, PageHeader } from "@/components/AppShell";
import { CameraCapture } from "@/components/CameraCapture";
import { EmptyState } from "@/components/EmptyState";
import { ItemImage } from "@/components/ItemImage";
import { CameraIcon, CheckIcon, HeartIcon, MapPinIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/async";
import { data } from "@/lib/data";
import { useClaims, usePost, useUser, useUsers } from "@/lib/data/hooks";
import { firstName, formatPoints, pluralize, timeAgo } from "@/lib/format";
import { DEFAULT_LOCATION, formatDistance, haversineKm } from "@/lib/geo";
import { LINKED_ACCOUNTS_MESSAGE, POINTS } from "@/lib/points";
import { samplePost } from "@/lib/sample-posts";
import { CATEGORY_META, CONDITION_META, type User } from "@/lib/types";
import { UploadNotConfiguredError, uploadPhoto } from "@/lib/upload";

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user: me } = useSession();

  const sample = samplePost(id);
  const live = usePost(sample ? null : id);
  const post = sample ?? live.data ?? null;
  const isOwner = !!me && !!post && me.id === post.ownerId;
  const claims = useClaims(post && !sample ? post.id : null, me ? { uid: me.id, isOwner } : null);
  const owner = useUser(post?.ownerId ?? null);
  const claimer = useUser(post?.claimerId ?? null);
  const claimants = useUsers((claims.data ?? []).map((c) => c.userId));

  const [claiming, setClaiming] = useState(false);
  const [pickupFor, setPickupFor] = useState<User | null>(null);
  const [pickupPhoto, setPickupPhoto] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<null | { label: string; progress?: number }>(null);
  const [done, setDone] = useState<{ claimer: User; ownerDelta: number; claimerDelta: number } | null>(null);

  if (!sample && live.loading) {
    return (
      <div aria-busy="true" aria-label="Loading post">
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-3xl" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!sample && live.error) {
    return <LiveStatus error={live.error} slow={false} onRetry={live.retry} />;
  }

  if (!post) {
    return (
      <EmptyState
        emoji="🔍"
        title="Post not found"
        description="It may have been removed, or the link is wrong."
        action={<ButtonLink href="/feed">Back to Home</ButtonLink>}
      />
    );
  }

  const claimList = claims.data ?? [];
  const claimed = !!me && claimList.some((c) => c.userId === me.id);
  const gone = post.status === "picked_up";
  const claimCount = isOwner ? claimList.length : (post.claimCount ?? 0);
  const distanceKm = haversineKm(me?.location ?? DEFAULT_LOCATION, post.location);
  const cat = CATEGORY_META[post.category];

  const onClaim = async () => {
    if (!me) return;
    setClaiming(true);
    try {
      await data.claimPost(me, post);
      toast.success("You asked for this", `${firstName(owner?.name ?? "The giver")} will confirm the pickup with you.`);
    } catch (err) {
      toast.error("Couldn't ask for this", errorMessage(err));
    } finally {
      setClaiming(false);
    }
  };

  const closePickup = () => {
    setPickupFor(null);
    setPickupPhoto(null);
    setConfirming(null);
  };

  const onConfirmPickup = async () => {
    if (!me || !pickupFor || !pickupPhoto) return;
    try {
      let photoURL = "";
      setConfirming({ label: "Uploading photo…", progress: 0 });
      try {
        photoURL = await uploadPhoto(pickupPhoto, "pickups", (f) => setConfirming({ label: "Uploading photo…", progress: f }));
      } catch (err) {
        if (!(err instanceof UploadNotConfiguredError)) throw err;
        toast.show({ title: "Photo not saved", description: "Uploads aren't configured yet — confirming without the photo.", tone: "info" });
      }
      setConfirming({ label: "Confirming…" });
      const r = await data.confirmPickup(me, post, pickupFor.id, photoURL);
      setDone({ claimer: pickupFor, ownerDelta: r.ownerDelta, claimerDelta: r.claimerDelta });
      closePickup();
      if (r.limited) toast.show({ title: "Handover confirmed — no points", description: r.limited, tone: "info" });
      else toast.points(r.ownerDelta, `${firstName(pickupFor.name)} earns +${r.claimerDelta} too.`);
    } catch (err) {
      setConfirming(null);
      toast.error("Couldn't confirm pickup", errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title={post.title} back={{ href: "/feed", label: "Home" }} />

      {post.isSample && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Sample listing.</span> This is dummy data to show how EcoLoop works. It can&apos;t be claimed.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <ItemImage src={post.photoURL} alt={post.title} category={post.category} loading="eager" className={`aspect-square w-full lg:aspect-[4/3] ${gone ? "saturate-50" : ""}`} />
          {gone && (
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-stone-900/80 to-transparent p-4 pt-10 text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500">
                <CheckIcon size={16} />
              </span>
              <span className="font-semibold">Given away{claimer ? ` to ${firstName(claimer.name)}` : ""}</span>
              {post.pickedUpAt && <span className="ml-auto text-sm text-stone-200">{timeAgo(post.pickedUpAt)}</span>}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Chip tone="stone" size="md">
              <span aria-hidden="true">{cat.emoji}</span> {cat.label}
            </Chip>
            <Chip tone="stone" size="md">
              {CONDITION_META[post.condition].label}
            </Chip>
            <Chip tone="emerald" size="md">
              <MapPinIcon size={14} /> {formatDistance(distanceKm)} · {post.neighbourhood}
            </Chip>
            {post.isSample && <Chip tone="amber" size="md">Sample</Chip>}
          </div>

          <p className="whitespace-pre-line text-[15px] leading-relaxed text-stone-800">{post.description}</p>

          {owner ? (
            <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3.5">
              <Avatar user={owner} size="lg" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate font-semibold text-stone-900">
                  {owner.name}
                  {isOwner && <span className="ml-2 text-xs font-medium text-stone-400">(you)</span>}
                </p>
                <p className="truncate text-sm text-stone-500">
                  {owner.neighbourhood} · {formatPoints(owner.points)} pts · posted {timeAgo(post.createdAt)}
                </p>
              </div>
            </div>
          ) : (
            <Skeleton className="h-[72px] w-full rounded-2xl" />
          )}

          {/* --- Actions ------------------------------------------------------------------ */}
          {gone ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">This item found a new home.</p>
              <p className="mt-0.5 text-emerald-800">
                {claimer ? `${firstName(claimer.name)} picked it up` : "Picked up"}
                {post.pickedUpAt ? ` ${timeAgo(post.pickedUpAt)}` : ""}.{post.pointsAwarded === false ? "" : " Both sides earned points."}
              </p>
              {post.pickupPhotoURL && <ItemImage src={post.pickupPhotoURL} alt="Handover photo" className="mt-3 h-28 w-28 rounded-xl" />}
            </div>
          ) : isOwner ? (
            <section className="rounded-3xl border border-stone-200 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-stone-900">{claimCount ? `${pluralize(claimCount, "person", "people")} ${claimCount === 1 ? "wants" : "want"} this` : "No requests yet"}</h2>
                <Chip tone="amber">Your listing</Chip>
              </div>
              <LiveStatus error={claims.error} slow={claims.slow} onRetry={claims.retry} />
              {claims.loading ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : claimList.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">When a neighbour taps “I want this”, they’ll show up here and you can confirm the handover.</p>
              ) : (
                <ul className="mt-3 divide-y divide-stone-100">
                  {claimList.map((c) => {
                    const u = claimants.get(c.userId);
                    return (
                      <li key={c.userId} className="flex items-center gap-3 py-3">
                        {u ? <Avatar user={u} size="md" /> : <Skeleton className="h-10 w-10 rounded-full" />}
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate font-semibold text-stone-900">{u?.name ?? "Neighbour"}</p>
                          <p className="truncate text-xs text-stone-500">
                            {u?.neighbourhood ?? "Markham"} · asked {timeAgo(c.createdAt)}
                          </p>
                        </div>
                        <Button size="sm" variant="secondary" leftIcon={<CameraIcon size={16} />} disabled={!u} onClick={() => u && setPickupFor(u)}>
                          Confirm pickup
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs text-stone-400">
                Confirming with a handover photo earns you +{POINTS.pickup_giver} and the receiver +{POINTS.pickup_receiver}.
                {me?.isGuest && <span className="mt-1 block text-amber-700">{LINKED_ACCOUNTS_MESSAGE} Link Google from Profile.</span>}
              </p>
            </section>
          ) : (
            <div className="space-y-3">
              {post.isSample ? (
                <Button size="xl" fullWidth variant="secondary" disabled leftIcon={<HeartIcon />}>
                  Sample — can&apos;t be claimed
                </Button>
              ) : claimed ? (
                <Button size="xl" fullWidth variant="secondary" disabled leftIcon={<CheckIcon />}>
                  You asked for this
                </Button>
              ) : (
                <Button size="xl" fullWidth onClick={() => void onClaim()} loading={claiming} disabled={claims.loading} leftIcon={<HeartIcon />}>
                  I want this
                </Button>
              )}
              <p className="text-center text-sm text-stone-500">
                {claimCount === 0 ? "Be the first to ask." : `${pluralize(claimCount, "person", "people")} ${claimCount === 1 ? "has" : "have"} asked for this.`}
              </p>
              {me?.isGuest && !post.isSample && (
                <p className="text-center text-xs text-amber-700">Sign in with Google (Profile) to earn +{POINTS.pickup_receiver} when you pick this up.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- Pickup confirmation modal ---------------------------------------------------- */}
      <Modal
        open={!!pickupFor}
        onClose={confirming ? () => undefined : closePickup}
        title={pickupFor ? `Hand over to ${firstName(pickupFor.name)}` : "Confirm pickup"}
        description="Snap a quick photo of the handover. It's the proof that awards points to both of you."
        footer={
          pickupPhoto ? (
            <>
              <Button variant="ghost" onClick={() => setPickupPhoto(null)} disabled={!!confirming}>
                Retake
              </Button>
              <Button onClick={() => void onConfirmPickup()} loading={!!confirming} leftIcon={<CheckIcon />}>
                {confirming?.label ?? "Confirm handover"}
              </Button>
            </>
          ) : undefined
        }
      >
        {pickupPhoto ? (
          <div className="space-y-3">
            <ItemImage src={pickupPhoto} alt="Handover" className="aspect-[4/3] w-full rounded-2xl" loading="eager" />
            {confirming?.progress !== undefined && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={Math.round(confirming.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${Math.round(confirming.progress * 100)}%` }} />
              </div>
            )}
          </div>
        ) : (
          <CameraCapture onCapture={setPickupPhoto} autoStart helper="Your browser will ask for camera access." />
        )}
      </Modal>

      {/* --- Success modal ---------------------------------------------------------------- */}
      <Modal
        open={!!done}
        onClose={() => setDone(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDone(null)}>
              Stay here
            </Button>
            <Button onClick={() => router.push("/feed")}>Back to Home</Button>
          </>
        }
      >
        {done && (
          <div className="py-2 text-center animate-pop">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">🎉</div>
            <h2 className="mt-4 text-2xl font-extrabold text-stone-900">{done.ownerDelta > 0 ? "You both earned points!" : "Handover confirmed"}</h2>
            <p className="mt-2 text-stone-600">
              <span className="font-bold text-emerald-700">+{done.ownerDelta}</span> for you ·{" "}
              <span className="font-bold text-emerald-700">+{done.claimerDelta}</span> for {firstName(done.claimer.name)}
            </p>
            <p className="mt-1 text-sm text-stone-500">One less thing in a Markham landfill.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
