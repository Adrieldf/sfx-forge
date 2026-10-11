"use client";

import { useState } from "react";
import MusicStudio from "./MusicStudio";
import Studio from "./Studio";

const MODES = [
  ["sfx", "Sound effects"],
  ["music", "Music"],
] as const;
type Mode = (typeof MODES)[number][0];

/** Both studios stay mounted, so switching tabs keeps the sound and the track you were working on. */
export default function App() {
  const [mode, setMode] = useState<Mode>("sfx");

  const nav = (
    <nav className="mx-4 mb-3 flex gap-0.5 rounded-md border border-line p-0.5" aria-label="Studio">
      {MODES.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setMode(id)}
          aria-pressed={mode === id}
          className={`flex-1 rounded px-2 py-1 text-[13px] transition ${mode === id ? "bg-amp/15 font-medium text-amp" : "text-mute hover:text-ink"}`}
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
        <MusicStudio active={mode === "music"} nav={nav} />
      </div>
    </>
  );
}
