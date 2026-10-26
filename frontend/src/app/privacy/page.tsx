import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What EcoLoop stores about you, and what it doesn't.",
};

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "What we store",
    body: [
      "Your display name, profile photo (if you sign in with Google) and an approximate location: the neighbourhood you pick or the point your browser reports once at sign-in. We never keep a location history.",
      "Your EcoLoop activity: items you scan and log, listings you post, pickups you request or confirm, points, streaks and reward codes.",
      "Photos you attach to a listing or a handover. They are hosted on Cloudinary and shown to other signed-in EcoLoop users.",
    ],
  },
  {
    title: "What we don't do",
    body: [
      "We don't sell or share your data with advertisers, and we don't send marketing email.",
      "Scanned photos are sent to Google Gemini only to identify the item, and are not kept by EcoLoop afterwards.",
      "Guest accounts are anonymous: no email is collected unless you choose to link a Google account.",
    ],
  },
  {
    title: "Who can see what",
    body: [
      "Other signed-in users see your name, avatar, neighbourhood and your listings. Only you see your scan log, points history and reward codes.",
      "Data is stored in Google Firebase (Firestore) in the region configured for the project.",
    ],
  },
  {
    title: "Deleting your data",
    body: [
      "Guest data stays on your device until you sign out or clear site data. To delete a Google-linked account and everything attached to it, email the project maintainer listed on the GitHub repository and we will remove it within a few days.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-10 text-stone-900 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Image src="/ecoloop-mark.png" alt="" width={36} height={36} className="h-9 w-9" />
          <span className="text-lg font-extrabold tracking-tight">EcoLoop</span>
        </Link>
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">Privacy notice</h1>
        <p className="mt-3 text-stone-600">
          EcoLoop is a civic-tech hackathon project for Markham, Ontario, not a commercial service. This page says plainly what it keeps about you. Last updated October 2026.
        </p>
        <div className="mt-8 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-xl font-bold">{s.title}</h2>
              <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-stone-700">
                {s.body.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm text-stone-500">
          Questions? Open an issue on the project repository or{" "}
          <Link href="/login" className="font-medium text-emerald-700 hover:underline">
            go back to sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
