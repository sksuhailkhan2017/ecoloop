// Google Maps deep links. These use the free "Maps URLs" scheme, so they need NO API key and work
// on any phone (they open the Google Maps app when installed). When you later add the Maps
// JavaScript / Places APIs for an in-app map, keep these as the zero-cost fallback.
import type { LatLng, Stream } from "./types";

/** What to search for, per stream that needs a physical drop-off. */
const SEARCH_BY_STREAM: Partial<Record<Stream, string>> = {
  recycling_depot: "recycling depot",
  hazardous_depot: "household hazardous waste depot",
  textile_bin: "clothing donation bin",
};

export const needsDropOff = (stream: Stream): boolean => stream in SEARCH_BY_STREAM;

/** Map search centred on the user, e.g. "recycling depot" around where they are. */
export function nearestDropOffUrl(stream: Stream, from: LatLng): string | undefined {
  const query = SEARCH_BY_STREAM[stream];
  if (!query) return undefined;
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${from.lat.toFixed(5)},${from.lng.toFixed(5)},13z`;
}

/** Turn-by-turn directions to an address or coordinates (origin defaults to the user's live location). */
export function directionsUrl(destination: string | LatLng, from?: LatLng): string {
  const dest = typeof destination === "string" ? destination : `${destination.lat},${destination.lng}`;
  const params = new URLSearchParams({ api: "1", destination: dest, travelmode: "driving" });
  if (from) params.set("origin", `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
