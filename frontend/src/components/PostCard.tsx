"use client";

import Link from "next/link";

import { ItemImage } from "@/components/ItemImage";
import { Reveal } from "@/components/motion";
import { CheckIcon, HeartIcon, MapPinIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { firstName, timeAgo } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { CATEGORY_META, CONDITION_META, type Post, type User } from "@/lib/types";

export function PostCard({
  post,
  owner,
  distanceKm,
  claimCount,
  mine = false,
  index = 0,
}: {
  post: Post;
  owner?: User;
  distanceKm: number;
  claimCount: number;
  mine?: boolean;
  /** Position in the list, for the entrance stagger (first 8 cards, 40 ms apart). */
  index?: number;
}) {
  const cat = CATEGORY_META[post.category];
  const gone = post.status === "picked_up";

  return (
    <Reveal index={index} className="flex">
      <Link
        href={`/posts/${post.id}`}
        className="group flex w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 motion-reduce:hover:translate-y-0"
      >
      <div className="relative">
        <ItemImage
          src={post.photoURL}
          alt={post.title}
          category={post.category}
          className={`aspect-square w-full ${gone ? "opacity-70 saturate-50" : ""}`}
          imgClassName="transition duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          {gone ? (
            <Chip tone="emerald" className="shadow-sm">
              <CheckIcon size={12} /> Given away
            </Chip>
          ) : (
            <Chip tone="white">
              <MapPinIcon size={12} /> {formatDistance(distanceKm)}
            </Chip>
          )}
          {mine && !gone && <Chip tone="amber">Yours</Chip>}
        </div>
        {claimCount > 0 && !gone && (
          <div className="absolute bottom-2.5 right-2.5">
            <Chip tone="white">
              <HeartIcon size={12} className="text-rose-500" /> {claimCount}
            </Chip>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <h3 className="line-clamp-1 font-semibold text-stone-900">{post.title}</h3>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="stone" size="xs">
            <span aria-hidden="true">{cat.emoji}</span> {cat.label}
          </Chip>
          <Chip tone="stone" size="xs">
            {CONDITION_META[post.condition].label}
          </Chip>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-stone-500">
          {owner ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar user={owner} size="xs" />
              <span className="truncate">{firstName(owner.name)}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="shrink-0">{timeAgo(post.createdAt)}</span>
        </div>
      </div>
      </Link>
    </Reveal>
  );
}
