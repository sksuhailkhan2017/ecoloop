"use client";

import Image from "next/image";
import Link from "next/link";

import { ArrowRightIcon, GiftIcon, HeartIcon, MapPinIcon, RecycleIcon, ScanIcon, SparklesIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/Button";
import { useSession } from "@/lib/auth";

const STEPS = [
  {
    n: "1",
    icon: ScanIcon,
    title: "Scan it",
    text: "Point your camera at anything — a foam tray, a jacket, a dead phone. Gemini reads it and matches it to Markham's What Goes Where rules.",
  },
  {
    n: "2",
    icon: RecycleIcon,
    title: "Sort it",
    text: "Get the exact bin or depot, part by part: Blue Box, Green Bin, textile bin, hazardous waste depot. Log it to track what you've diverted.",
  },
  {
    n: "3",
    icon: HeartIcon,
    title: "Share it",
    text: "Still usable? Post it free to neighbours nearby. When they pick it up, you both earn points to spend at local Markham shops.",
  },
];

const FEATURES = [
  { icon: ScanIcon, title: "Markham-specific sorting", text: "146 items from the City's guidance, including the ones people get wrong: clean Styrofoam goes to the depot, not the Blue Box." },
  { icon: MapPinIcon, title: "Nearby-first marketplace", text: "Free items sorted by distance from you, with one-tap “I want this” and photo-confirmed handovers." },
  { icon: GiftIcon, title: "Rewards that stay local", text: "Points redeem for discounts at Markham businesses. Capped daily and tied to real handovers, so they can't be farmed." },
  { icon: SparklesIcon, title: "Your impact, honestly", text: "A dashboard of items and kilograms diverted, measured against the City of Markham's 80% diversion target." },
];

export default function LandingPage() {
  const session = useSession();
  const signedIn = session.status === "signed-in" && !!session.user;

  return (
    <div className="min-h-dvh bg-stone-50 text-stone-900">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/ecoloop-mark.png" alt="" width={40} height={40} className="h-10 w-10" priority />
            <span className="text-lg font-extrabold tracking-tight">EcoLoop</span>
          </Link>
          <nav className="flex items-center gap-2">
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-stone-600 hover:text-stone-900 sm:inline-block">
              How it works
            </a>
            <ButtonLink href={signedIn ? "/feed" : "/login"} size="sm">
              {signedIn ? "Open app" : "Sign in"}
            </ButtonLink>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-emerald-200/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-[24rem] w-[24rem] rounded-full bg-teal-200/40 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-20">
          <div className="animate-slide-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <MapPinIcon size={14} /> Built for Markham, Ontario
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Scan it.
              <br />
              Sort it.
              <br />
              <span className="text-emerald-600">Share it.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-stone-600">
              EcoLoop tells you which Markham bin or depot anything belongs in, helps you give what still works to a neighbour, and rewards you at local shops.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={signedIn ? "/scan" : "/login"} size="xl" rightIcon={<ArrowRightIcon />}>
                {signedIn ? "Scan an item" : "Get started — it's free"}
              </ButtonLink>
              <ButtonLink href={signedIn ? "/feed" : "/login"} size="xl" variant="outline">
                Browse free items nearby
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-stone-500">No account or password needed. Works on any phone browser.</p>
          </div>

          <div className="relative mx-auto w-full max-w-sm animate-pop lg:max-w-md">
            <div className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-2xl shadow-emerald-900/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">Scan result</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">High confidence</span>
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">Styrofoam tray</p>
                  <p className="text-sm text-stone-500">Clean polystyrene</p>
                </div>
                <span className="inline-flex h-10 items-center gap-2 rounded-full bg-orange-100 px-4 text-base font-bold text-orange-900 ring-1 ring-inset ring-orange-200">
                  <span className="h-2 w-2 rounded-full bg-orange-500" /> Recycling Depot
                </span>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-stone-800">
                Clean Styrofoam is <strong>not</strong> accepted in the Blue Box in Markham. Take it to a Markham Recycling Depot — free for residents.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <span className="rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white">Log it · +5 pts</span>
                <span className="rounded-xl border border-stone-300 py-2.5 text-center text-sm font-semibold text-stone-700">Find a depot</span>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-lg sm:-left-10">
              <p className="text-xs font-semibold text-stone-500">Diversion rate</p>
              <p className="text-2xl font-extrabold text-emerald-700">
                86% <span className="text-sm font-semibold text-stone-400">/ 80% target</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
          {[
            { value: "146", label: "Markham sorting rules" },
            { value: "9", label: "Bins, depots & take-backs" },
            { value: "80%", label: "City diversion target" },
            { value: "+25", label: "Points per confirmed handover" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold tracking-tight text-emerald-700">{s.value}</p>
              <p className="text-sm text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mt-2 max-w-2xl text-stone-600">Three taps from “what is this?” to “a neighbour picked it up”.</p>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ n, icon: Icon, title, text }) => (
            <li key={n} className="relative rounded-3xl border border-stone-200 bg-white p-6">
              <span className="absolute right-5 top-5 text-5xl font-extrabold text-stone-100" aria-hidden="true">
                {n}
              </span>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
                <Icon size={24} />
              </span>
              <h3 className="mt-5 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-stone-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="bg-emerald-700 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Made for how Markham actually sorts</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 rounded-3xl bg-white/10 p-6 ring-1 ring-white/15">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon size={22} />
                </span>
                <div>
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="mt-1 text-emerald-50">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:py-24">
        <Image src="/ecoloop-logo.png" alt="EcoLoop" width={96} height={96} className="mx-auto h-24 w-24 rounded-[20px] shadow-lg" />
        <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to sort smarter?</h2>
        <p className="mx-auto mt-3 max-w-xl text-stone-600">Pick a demo neighbour or type your name, allow location, and scan your first item in under a minute.</p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href={signedIn ? "/feed" : "/login"} size="xl" rightIcon={<ArrowRightIcon />}>
            {signedIn ? "Open EcoLoop" : "Get started"}
          </ButtonLink>
        </div>
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-sm text-stone-500">
        EcoLoop · GDG Markham civic-tech hackathon · Sorting rules drafted from City of Markham guidance — verify at markham.ca
      </footer>
    </div>
  );
}
