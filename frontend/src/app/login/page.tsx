"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";

import { ArrowRightIcon, CheckIcon, MapPinIcon, RecycleIcon, ScanIcon, SparklesIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { formatPoints } from "@/lib/format";
import { DEFAULT_LOCATION, nearestNeighbourhood } from "@/lib/geo";
import { requestLocation } from "@/lib/geolocation";
import { useStore } from "@/lib/store";

type Step = "signin" | "location";

export default function LoginPage() {
  const { hydrated, state, currentUser, login, setLocation } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>("signin");
  const [name, setName] = useState("");
  const [locating, setLocating] = useState(false);

  // Already signed in and already answered the location prompt → straight to the feed.
  useEffect(() => {
    if (!hydrated) return;
    if (currentUser && state.locationGranted !== null) router.replace("/feed");
    else if (currentUser) setStep("location");
  }, [hydrated, currentUser, state.locationGranted, router]);

  const demoUsers = state.users.filter((u) => u.isDemo).slice(0, 6);

  const signIn = (opts: { userId?: string; name?: string }) => {
    const user = login(opts);
    toast.success(`Welcome, ${user.name.split(" ")[0]}!`);
    setStep("location");
  };

  const onSubmitName = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    signIn({ name });
  };

  const allowLocation = async () => {
    setLocating(true);
    const r = await requestLocation();
    setLocating(false);
    if (r.ok) {
      setLocation(r.loc, true);
      toast.success("Location on", `Showing items near ${nearestNeighbourhood(r.loc)}.`);
    } else {
      setLocation(DEFAULT_LOCATION, false);
      toast.show({
        title: r.reason === "denied" ? "Location blocked" : "Couldn't get your location",
        description: "Using Markham Civic Centre instead. You can update it any time from Home.",
        tone: "info",
      });
    }
    router.replace("/feed");
  };

  const skipLocation = () => {
    setLocation(DEFAULT_LOCATION, false);
    router.replace("/feed");
  };

  return (
    <div className="min-h-dvh bg-stone-50 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden bg-emerald-700 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-500/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-400/30 blur-3xl" />
        <div className="relative w-fit rounded-3xl bg-white p-1 shadow-lg shadow-emerald-950/10">
          <Image src="/ecoloop-logo.png" alt="EcoLoop" width={144} height={144} className="h-36 w-36 rounded-[20px]" />
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">
            Scan it. Sort it.
            <br />
            Share it.
          </h1>
          <p className="mt-4 text-lg text-emerald-100">
            Find out which Markham bin or depot anything belongs in, give what still works to a neighbour, and earn points at local shops.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: ScanIcon, title: "Point your camera", text: "Instant Markham-specific sorting instructions." },
              { icon: RecycleIcon, title: "Give instead of bin", text: "Items nearby, sorted by distance. Both sides earn points." },
              { icon: SparklesIcon, title: "Redeem locally", text: "Coffee, bread, bike tune-ups — from businesses down the street." },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-emerald-100">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-emerald-200">Built for the GDG Markham civic-tech hackathon · City of Markham 80% diversion target</p>
      </aside>

      {/* Form panel */}
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <Image src="/ecoloop-mark.png" alt="" width={40} height={40} className="h-10 w-10" />
          <span className="text-xl font-extrabold tracking-tight text-stone-900">EcoLoop</span>
        </div>

        <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-900/5 sm:p-8 animate-slide-up">
          {!hydrated ? (
            <div className="h-64 animate-pulse rounded-2xl bg-stone-100" />
          ) : step === "signin" ? (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">Sign in</h2>
              <p className="mt-1 text-sm text-stone-500">Pick a demo neighbour, or just type your name to get started.</p>

              <div className="mt-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Demo profiles</p>
                <div className="grid grid-cols-2 gap-2">
                  {demoUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => signIn({ userId: u.id })}
                      className="group flex items-center gap-2.5 rounded-2xl border border-stone-200 p-2.5 text-left transition hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                      <Avatar user={u} size="md" />
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-sm font-semibold text-stone-900">{u.name}</span>
                        <span className="block truncate text-[11px] text-stone-500">
                          {u.neighbourhood} · {formatPoints(u.points)} pts
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-stone-400">
                <span className="h-px flex-1 bg-stone-200" />
                or
                <span className="h-px flex-1 bg-stone-200" />
              </div>

              <form onSubmit={onSubmitName} className="space-y-3">
                <label htmlFor="name" className="block text-sm font-semibold text-stone-800">
                  Your name
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="e.g. Alex Nguyen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  maxLength={40}
                />
                <Button type="submit" size="lg" fullWidth disabled={name.trim().length < 2} rightIcon={<ArrowRightIcon />}>
                  Continue
                </Button>
              </form>
              <p className="mt-4 text-center text-xs text-stone-400">No password needed for the demo. Everything stays in this browser.</p>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <MapPinIcon size={28} />
              </div>
              <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-stone-900">Find items near you</h2>
              <p className="mt-1 text-sm text-stone-500">
                EcoLoop sorts the marketplace by distance. Your browser will ask for permission — we only keep an approximate point, never a history.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-stone-700">
                {["See what neighbours are giving away closest to you", "Show how far a pickup is before you ask", "Fall back to Markham Civic Centre if you say no"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <CheckIcon size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-6 space-y-2">
                <Button size="lg" fullWidth onClick={allowLocation} loading={locating} leftIcon={<MapPinIcon />}>
                  Allow location
                </Button>
                <Button size="lg" fullWidth variant="ghost" onClick={skipLocation} disabled={locating}>
                  Skip — use Markham Civic Centre
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
