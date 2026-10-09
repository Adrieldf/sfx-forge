"use client";

import dynamic from "next/dynamic";

// The studio is all Web Audio, canvas and localStorage, so it only renders in the browser.
const Studio = dynamic(() => import("./Studio"), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-mute">Loading studio…</div>,
});

export default function StudioLoader() {
  return <Studio />;
}
