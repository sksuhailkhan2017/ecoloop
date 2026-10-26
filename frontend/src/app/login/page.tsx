"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { ArrowRightIcon, CheckIcon, MapPinIcon, RecycleIcon, ScanIcon, SparklesIcon, UserIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { SignInCancelled, useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/async";
import { firstName, formatPoints } from "@/lib/format";
import { DEFAULT_LOCATION, nearestNeighbourhood } from "@/lib/geo";
import { requestLocation } from "@/lib/geolocation";

type Step = "signin" | "location";
type Busy = "google" | "guest" | "demo" | null;

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>("signin");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const isDemo = session.mode === "demo";
  const loading = session.status === "loading";

  // Signed in → location step once (until the profile has a locationSource), then the feed.
  useEffect(() => {
    if (session.status !== "signed-in" || !session.user) return;
    if (session.user.locationSource) router.replace("/feed");
    else setStep("location");
  }, [session.status, session.user, router]);

  const demoUsers = session.demoUsers;

  const run = async (kind: Busy, fn: () => Promise<unknown>, welcome?: string) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      if (welcome) toast.success(welcome);
    } catch (err) {
      if (!(err instanceof SignInCancelled)) setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onGoogle = () => run("google", () => session.signInWithGoogle());
  const onGuest = () => run("guest", () => session.signInAsGuest(), "Welcome, neighbour!");
  const onDemoUser = (userId: string) =>
    run("demo", async () => {
      const u = await session.signInDemo({ userId });
      toast.success(`Welcome back, ${firstName(u.name)}!`);
    });
  const onSubmitName = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    void run("demo", async () => {
      const u = await session.signInDemo({ name });
      toast.success(`Welcome, ${firstName(u.name)}!`);
    });
  };

  const saveLocation = async (loc: { lat: number; lng: number }, source: "gps" | "default") => {
    try {
      await session.updateUser({ location: loc, neighbourhood: nearestNeighbourhood(loc), locationSource: source });
    } catch (err) {
      toast.error("Couldn't save your location", errorMessage(err));
    }
    router.replace("/feed");
  };

  const allowLocation = async () => {
    setLocating(true);
    const r = await requestLocation();
    if (r.ok) {
      toast.success("Location on", `Showing items near ${nearestNeighbourhood(r.loc)}.`);
      await saveLocation(r.loc, "gps");
    } else {
      toast.show({
        title: r.reason === "denied" ? "Location blocked" : "Couldn't get your location",
        description: "Using Markham Civic Centre instead. You can update it any time from Home.",
        tone: "info",
      });
      await saveLocation(DEFAULT_LOCATION, "default");
    }
    setLocating(false);
  };

  const skipLocation = () => void saveLocation(DEFAULT_LOCATION, "default");

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
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Checking your session">
              <div className="h-8 w-40 animate-pulse rounded-lg bg-stone-100" />
              <div className="h-4 w-64 animate-pulse rounded bg-stone-100" />
              <div className="mt-6 h-12 animate-pulse rounded-xl bg-stone-100" />
              <div className="h-12 animate-pulse rounded-xl bg-stone-100" />
            </div>
          ) : step === "signin" ? (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">Sign in</h2>
              <p className="mt-1 text-sm text-stone-500">
                {isDemo ? "Pick a demo neighbour, or just type your name to get started." : "Use your Google account, or try EcoLoop as a guest."}
              </p>

              {isDemo && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span className="font-semibold">Demo mode.</span> Firebase isn&apos;t configured, so everything stays in this browser. Set{" "}
                  <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_FIREBASE_*</code> for real sign-in.
                </div>
              )}

              <div className="mt-6 space-y-2">
                {!isDemo && (
                  <Button
                    size="lg"
                    fullWidth
                    variant="outline"
                    onClick={onGoogle}
                    loading={busy === "google"}
                    disabled={busy !== null}
                    leftIcon={<GoogleMark />}
                    className="border-stone-300"
                  >
                    Continue with Google
                  </Button>
                )}
                <Button size="lg" fullWidth variant={isDemo ? "outline" : "secondary"} onClick={onGuest} loading={busy === "guest"} disabled={busy !== null} leftIcon={<UserIcon size={18} />}>
                  Continue as guest
                </Button>
              </div>

              {error && (
                <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}

              {isDemo ? (
                <>
                  <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-stone-400">
                    <span className="h-px flex-1 bg-stone-200" />
                    or
                    <span className="h-px flex-1 bg-stone-200" />
                  </div>

                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Demo profiles</p>
                  <div className="grid grid-cols-2 gap-2">
                    {demoUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void onDemoUser(u.id)}
                        className="group flex items-center gap-2.5 rounded-2xl border border-stone-200 p-2.5 text-left transition hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60"
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

                  <form onSubmit={onSubmitName} className="mt-5 space-y-3">
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
                    <Button type="submit" size="lg" fullWidth disabled={name.trim().length < 2 || busy !== null} loading={busy === "demo"} rightIcon={<ArrowRightIcon />}>
                      Continue
                    </Button>
                  </form>
                </>
              ) : (
                <p className="mt-5 text-center text-xs leading-relaxed text-stone-400">
                  Guest accounts live on this device only. Sign in with Google to keep your points across phones.
                  <br />
                  By continuing you agree to our{" "}
                  <Link href="/privacy" className="font-medium text-stone-500 underline underline-offset-2 hover:text-stone-700">
                    privacy notice
                  </Link>
                  : we store your name, an approximate location and your EcoLoop activity — nothing else.
                </p>
              )}
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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.6 14.6 0 0 1 9.7 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-3.9-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
