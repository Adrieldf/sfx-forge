"use client";

import { useState } from "react";
import About from "./About";
import MusicStudio from "./MusicStudio";
import Studio from "./Studio";

const MODES = [
  ["sfx", "Sound effects"],
  ["music", "Music"],
  ["about", "How it's made"],
] as const;
type Mode = (typeof MODES)[number][0];

/** The studios stay mounted, so switching tabs keeps the sound and the track you were working on. */
export default function App() {
  // A shared music link (#m=…) opens straight on the Music tab.
  const [mode, setMode] = useState<Mode>(() => (window.location.hash.startsWith("#m=") ? "music" : "sfx"));

  const nav = (
    <nav className="mx-4 mb-3 flex gap-4 border-b border-line text-[14px]" aria-label="Sections">
      {MODES.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setMode(id)}
          aria-pressed={mode === id}
          className={`-mb-px border-b-2 pb-1.5 transition ${mode === id ? "border-amp font-semibold text-ink" : "border-transparent text-mute hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </nav>
  );

  return (
    <>
      <div hidden={mode !== "sfx"}>
        <Studio active={mode === "sfx"} nav={nav} />
      </div>
      <div hidden={mode !== "music"}>
        <MusicStudio active={mode === "music"} nav={nav} onAbout={() => setMode("about")} />
      </div>
      <div hidden={mode !== "about"}>
        <About nav={nav} />
      </div>
    </>
  );
}
