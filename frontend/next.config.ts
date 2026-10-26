import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo: the frontend imports shared JSON from ../data, so the workspace root is the repo
  // root. This also silences Turbopack's "multiple lockfiles" guess in `npm run dev`.
  turbopack: { root: path.resolve(__dirname, "..") },
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" }, // demo listing photos
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "res.cloudinary.com" }, // listing + handover photos (unsigned uploads)
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google account avatars
    ],
  },
};

export default nextConfig;
