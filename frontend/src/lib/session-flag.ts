// A cheap "probably signed in" hint for pages that must not load Firebase (the landing page is the
// QR-code target and ships without the app providers). Kept up to date by lib/auth.tsx.
// Deliberately dependency-free: importing this must never pull Firebase into a bundle.

export const SIGNED_IN_FLAG = "ecoloop.signedIn";

export function setSignedInFlag(on: boolean) {
  try {
    if (on) window.localStorage.setItem(SIGNED_IN_FLAG, "1");
    else window.localStorage.removeItem(SIGNED_IN_FLAG);
  } catch {
    /* private mode / blocked storage: the landing just shows the signed-out buttons */
  }
}

export function readSignedInFlag(): boolean {
  try {
    return window.localStorage.getItem(SIGNED_IN_FLAG) === "1";
  } catch {
    return false;
  }
}
