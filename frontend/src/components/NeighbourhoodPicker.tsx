"use client";

import { useState } from "react";

import { CheckIcon, MapPinIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/async";
import { NEIGHBOURHOODS, isInMarkhamArea, nearestNeighbourhood } from "@/lib/geo";
import { requestLocation, type LocationResult } from "@/lib/geolocation";
import type { LatLng } from "@/lib/types";

export type PickerReason = "denied" | "unavailable" | "timeout" | "unsupported" | "outside" | "change" | null;

const REASON_COPY: Record<Exclude<PickerReason, null>, { title: string; text: string }> = {
  denied: { title: "Location is blocked", text: "No problem — pick the Markham area you want to browse. You can allow location later in your browser settings." },
  unavailable: { title: "Couldn't get your location", text: "Your device didn't return a position. Pick your area instead." },
  timeout: { title: "Location took too long", text: "Pick your area instead, or try again." },
  unsupported: { title: "No location on this device", text: "Pick the Markham area you want to browse." },
  outside: { title: "You seem to be outside Markham", text: "EcoLoop covers Markham, Ontario. Pick the area you want to browse." },
  change: { title: "Change my area", text: "The feed is sorted by distance from here." },
};

/** Saves {location, neighbourhood, locationSource} on the profile. Shared by login, feed and profile. */
export function useSaveLocation() {
  const { updateUser } = useSession();
  const toast = useToast();
  return async (loc: LatLng, source: "gps" | "picked") => {
    const neighbourhood = nearestNeighbourhood(loc);
    try {
      await updateUser({ location: loc, neighbourhood, locationSource: source });
      return true;
    } catch (err) {
      toast.error("Couldn't save your location", errorMessage(err));
      return false;
    }
  };
}

/** Turns a geolocation outcome into the picker reason, or null when GPS is usable. */
export function reasonFor(r: LocationResult): PickerReason {
  if (!r.ok) return r.reason;
  return isInMarkhamArea(r.loc) ? null : "outside";
}

export function NeighbourhoodPicker({
  open,
  reason,
  current,
  onClose,
  onDone,
}: {
  open: boolean;
  reason: PickerReason;
  current?: string;
  onClose: () => void;
  /** Called after the profile was saved (either a pick or a successful GPS fix). */
  onDone: () => void;
}) {
  const save = useSaveLocation();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const copy = REASON_COPY[reason ?? "change"];

  const pick = async (n: (typeof NEIGHBOURHOODS)[number]) => {
    setBusy(n.name);
    const ok = await save({ lat: n.lat, lng: n.lng }, "picked");
    setBusy(null);
    if (ok) {
      toast.success(`Showing items near ${n.name}`);
      onDone();
    }
  };

  const locateMe = async () => {
    setBusy("gps");
    setGpsNote(null);
    const r = await requestLocation();
    const why = reasonFor(r);
    if (r.ok && !why) {
      const ok = await save(r.loc, "gps");
      setBusy(null);
      if (ok) {
        toast.success("Location on", `Showing items near ${nearestNeighbourhood(r.loc)}.`);
        onDone();
      }
      return;
    }
    setBusy(null);
    setGpsNote(why ? REASON_COPY[why].title : "Couldn't use your location.");
  };

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={copy.title} description={copy.text}>
      {reason !== "unsupported" && (
        <div className="mb-4">
          <Button variant="outline" fullWidth leftIcon={<MapPinIcon />} onClick={() => void locateMe()} loading={busy === "gps"} disabled={!!busy && busy !== "gps"}>
            Use my location
          </Button>
          {gpsNote && (
            <p role="status" className="mt-2 text-center text-xs text-amber-700">
              {gpsNote} — choose an area below.
            </p>
          )}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-2" aria-label="Markham neighbourhoods">
        {NEIGHBOURHOODS.map((n) => {
          const selected = n.name === current;
          return (
            <li key={n.name}>
              <button
                type="button"
                onClick={() => void pick(n)}
                disabled={!!busy}
                aria-pressed={selected}
                className={`flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-sm font-semibold transition disabled:opacity-60 ${
                  selected ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-800 hover:border-emerald-400 hover:bg-emerald-50"
                }`}
              >
                <span className="truncate">{n.name}</span>
                {busy === n.name ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" /> : selected && <CheckIcon size={16} className="text-emerald-600" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
