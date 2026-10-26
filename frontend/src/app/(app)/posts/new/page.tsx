"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { PageHeader } from "@/components/AppShell";
import { CameraCapture } from "@/components/CameraCapture";
import { ItemImage } from "@/components/ItemImage";
import { CheckIcon, MapPinIcon, SparklesIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Field, Segmented, inputClass } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/async";
import { data } from "@/lib/data";
import { POINTS } from "@/lib/points";
import { clearPrefill, getPrefill } from "@/lib/session";
import { CATEGORIES, CATEGORY_META, CONDITIONS, CONDITION_META, type Category, type Condition } from "@/lib/types";
import { UploadNotConfiguredError, isUploadConfigured, uploadPhoto } from "@/lib/upload";

type Submitting = null | { label: string; progress?: number };

export default function NewPostPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, mode } = useSession();

  const [photo, setPhoto] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [condition, setCondition] = useState<Condition>("good");
  const [fromScanId, setFromScanId] = useState<string | undefined>();
  const [fromScan, setFromScan] = useState(false);
  const [submitting, setSubmitting] = useState<Submitting>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = getPrefill();
    if (!p) return;
    if (p.title) setTitle(p.title);
    if (p.description) setDescription(p.description);
    if (p.category) setCategory(p.category);
    if (p.photoURL) setPhoto(p.photoURL);
    if (p.fromScanId) setFromScanId(p.fromScanId);
    setFromScan(!!p.fromScanId);
    clearPrefill();
  }, []);

  const uploadsOff = mode === "firebase" && !isUploadConfigured;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (title.trim().length < 3) {
      setError("Give it a short title (at least 3 characters).");
      return;
    }
    setError(null);
    try {
      let photoURL = "";
      if (photo) {
        setSubmitting({ label: "Uploading photo…", progress: 0 });
        try {
          photoURL = await uploadPhoto(photo, "posts", (f) => setSubmitting({ label: "Uploading photo…", progress: f }));
        } catch (err) {
          if (!(err instanceof UploadNotConfiguredError)) throw err;
          toast.show({ title: "Posted without the photo", description: "Photo uploads aren't configured on this deployment yet.", tone: "info" });
        }
      }
      setSubmitting({ label: "Publishing…" });
      const r = await data.createPost(user, {
        title,
        description: description || "No description — ask the giver for details.",
        category,
        condition,
        photoURL,
        fromScanId,
      });
      toast.points(r.delta, r.bonus ? `7-day streak bonus too! 🔥 ${r.streakCount}-day streak` : `${r.streakCount}-day streak 🔥`);
      router.push(`/posts/${r.post.id}`);
    } catch (err) {
      setSubmitting(null);
      setError(errorMessage(err));
      toast.error("Couldn't post it", errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Give something away" subtitle="Post it free for a neighbour. You earn points when the pickup is confirmed." back={{ href: "/feed", label: "Home" }} />

      {fromScan && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <SparklesIcon className="shrink-0 text-emerald-600" />
          Prefilled from your scan — tweak anything before posting.
        </div>
      )}

      {uploadsOff && (
        <div role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Photo uploads aren&apos;t configured yet.</span> You can still post; the card will show a category graphic instead of your photo.
        </div>
      )}

      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-stone-800">Photo</p>
          {photo ? (
            <div className="space-y-3">
              <ItemImage src={photo} alt="Your item" category={category} loading="eager" className="aspect-square w-full rounded-3xl border border-stone-200 lg:aspect-[4/3]" />
              {submitting?.progress !== undefined && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={Math.round(submitting.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${Math.round(submitting.progress * 100)}%` }} />
                </div>
              )}
              <Button variant="outline" onClick={() => setPhoto(null)} fullWidth disabled={!!submitting}>
                Retake or choose another photo
              </Button>
            </div>
          ) : (
            <CameraCapture onCapture={setPhoto} helper="Add a clear photo — items with photos get picked up 3× faster." />
          )}
        </div>

        <div className="space-y-5">
          <Field label="Title" htmlFor="title" error={error ?? undefined}>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oak dining chair" className={inputClass} maxLength={80} required disabled={!!submitting} />
          </Field>

          <Field label="Description" htmlFor="description" optional hint="Size, condition details, pickup notes.">
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Solid chair, a few scuffs. Porch pickup in Unionville, evenings best."
              rows={4}
              className={`${inputClass} resize-none`}
              maxLength={600}
              disabled={!!submitting}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-stone-800">Category</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {CATEGORIES.map((c) => {
                const selected = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-pressed={selected}
                    disabled={!!submitting}
                    className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-semibold transition ${
                      selected ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-600/20" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    <span className="text-xl" aria-hidden="true">
                      {CATEGORY_META[c].emoji}
                    </span>
                    {CATEGORY_META[c].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-stone-800">Condition</p>
            <Segmented ariaLabel="Condition" value={condition} onChange={setCondition} options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_META[c].label }))} />
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            <MapPinIcon size={16} className="text-emerald-600" />
            Pickup near <span className="font-semibold">{user?.neighbourhood ?? "Markham"}</span>
            <span className="ml-auto text-xs text-stone-400">from your location</span>
          </div>

          <div className="sticky bottom-20 z-10 md:static">
            <Button type="submit" size="xl" fullWidth loading={!!submitting} leftIcon={<CheckIcon />}>
              {submitting ? submitting.label : `Post it · +${POINTS.post_created} pts`}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
