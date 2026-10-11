"use client";

import dynamic from "next/dynamic";

// The app is all Web Audio, canvas and localStorage, so it only renders in the browser.
const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-mute">Loading studio…</div>,
});

export default function StudioLoader() {
  return <App />;
}
