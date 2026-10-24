"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/AppShell";
import { CameraCapture } from "@/components/CameraCapture";
import { EmptyState } from "@/components/EmptyState";
import { ItemImage } from "@/components/ItemImage";
import { CameraIcon, CheckIcon, HeartIcon, MapPinIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { firstName, formatPoints, pluralize, timeAgo } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { POINTS } from "@/lib/points";
import { useStore } from "@/lib/store";
import { CATEGORY_META, CONDITION_META, type User } from "@/lib/types";

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { state, currentUser, userById, claimsFor, hasClaimed, distanceTo, claimPost, confirmPickup } = useStore();

  const [pickupFor, setPickupFor] = useState<User | null>(null);
  const [pickupPhoto, setPickupPhoto] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ claimer: User; ownerDelta: number; claimerDelta: number } | null>(null);

  const post = state.posts.find((p) => p.id === id);
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

  const owner = userById(post.ownerId);
  const isOwner = currentUser?.id === post.ownerId;
  const claims = claimsFor(post.id);
  const claimed = hasClaimed(post.id);
  const gone = post.status === "picked_up";
  const claimer = post.claimerId ? userById(post.claimerId) : undefined;
  const distanceKm = distanceTo(post.location);
  const cat = CATEGORY_META[post.category];

  const onClaim = () => {
    const r = claimPost(post.id);
    if (r.ok) toast.success("You asked for this", `${firstName(owner?.name ?? "The giver")} will confirm the pickup with you.`);
    else toast.error("Couldn't ask for this", r.error);
  };

  const closePickup = () => {
    setPickupFor(null);
    setPickupPhoto(null);
  };

  const onConfirmPickup = () => {
    if (!pickupFor || !pickupPhoto) return;
    setConfirming(true);
    const r = confirmPickup(post.id, pickupFor.id, pickupPhoto);
    setConfirming(false);
    if (!r.ok) {
      toast.error("Couldn't confirm pickup", r.error);
      return;
    }
    setDone({ claimer: pickupFor, ownerDelta: r.ownerDelta, claimerDelta: r.claimerDelta });
    closePickup();
    if (r.limited) toast.show({ title: "Handover confirmed — no points", description: r.limited, tone: "info" });
    else toast.points(r.ownerDelta, `${firstName(pickupFor.name)} earned +${r.claimerDelta} too.`);
  };

  return (
    <>
      <PageHeader title={post.title} back={{ href: "/feed", label: "Home" }} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <ItemImage
            src={post.photoURL}
            alt={post.title}
            category={post.category}
            loading="eager"
            className={`aspect-square w-full lg:aspect-[4/3] ${gone ? "saturate-50" : ""}`}
          />
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
          </div>

          <p className="whitespace-pre-line text-[15px] leading-relaxed text-stone-800">{post.description}</p>

          {owner && (
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
          )}

          {/* --- Actions ------------------------------------------------------------------ */}
          {gone ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">This item found a new home.</p>
              <p className="mt-0.5 text-emerald-800">
                {claimer ? `${firstName(claimer.name)} picked it up` : "Picked up"}
                {post.pickedUpAt ? ` ${timeAgo(post.pickedUpAt)}` : ""}. Both sides earned points.
              </p>
              {post.pickupPhotoURL && (
                <img src={post.pickupPhotoURL} alt="Handover photo" className="mt-3 h-28 w-28 rounded-xl object-cover" />
              )}
            </div>
          ) : isOwner ? (
            <section className="rounded-3xl border border-stone-200 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-stone-900">
                  {claims.length ? `${pluralize(claims.length, "person", "people")} want this` : "No requests yet"}
                </h2>
                <Chip tone="amber">Your listing</Chip>
              </div>
              {claims.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">When a neighbour taps “I want this”, they’ll show up here and you can confirm the handover.</p>
              ) : (
                <ul className="mt-3 divide-y divide-stone-100">
                  {claims.map((c) => {
                    const u = userById(c.userId);
                    if (!u) return null;
                    return (
                      <li key={c.userId} className="flex items-center gap-3 py-3">
                        <Avatar user={u} size="md" />
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate font-semibold text-stone-900">{u.name}</p>
                          <p className="truncate text-xs text-stone-500">
                            {u.neighbourhood} · asked {timeAgo(c.createdAt)}
                          </p>
                        </div>
                        <Button size="sm" variant="secondary" leftIcon={<CameraIcon size={16} />} onClick={() => setPickupFor(u)}>
                          Confirm pickup
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs text-stone-400">
                Confirming with a handover photo earns you +{POINTS.pickup_giver} and the receiver +{POINTS.pickup_receiver}.
              </p>
            </section>
          ) : (
            <div className="space-y-3">
              {claimed ? (
                <Button size="xl" fullWidth variant="secondary" disabled leftIcon={<CheckIcon />}>
                  You asked for this
                </Button>
              ) : (
                <Button size="xl" fullWidth onClick={onClaim} leftIcon={<HeartIcon />}>
                  I want this
                </Button>
              )}
              <p className="text-center text-sm text-stone-500">
                {claims.length === 0
                  ? "Be the first to ask."
                  : `${pluralize(claims.length, "person", "people")} ${claims.length === 1 ? "has" : "have"} asked for this.`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* --- Pickup confirmation modal ---------------------------------------------------- */}
      <Modal
        open={!!pickupFor}
        onClose={closePickup}
        title={pickupFor ? `Hand over to ${firstName(pickupFor.name)}` : "Confirm pickup"}
        description="Snap a quick photo of the handover. It's the proof that awards points to both of you."
        footer={
          pickupPhoto ? (
            <>
              <Button variant="ghost" onClick={() => setPickupPhoto(null)}>
                Retake
              </Button>
              <Button onClick={onConfirmPickup} loading={confirming} leftIcon={<CheckIcon />}>
                Confirm handover
              </Button>
            </>
          ) : undefined
        }
      >
        {pickupPhoto ? (
          <img src={pickupPhoto} alt="Handover" className="aspect-[4/3] w-full rounded-2xl object-cover" />
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
