"use client";

import { useSyncExternalStore } from "react";
import { FORMATS, FORMAT_LIST, saveFormat, savedFormat, type AudioFormat } from "@/lib/encode";

// Both studios stay mounted, so the pick lives outside either of them.
let current: AudioFormat | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const read = () => (current ??= savedFormat());
const pick = (f: AudioFormat) => {
  current = f;
  saveFormat(f);
  listeners.forEach((fn) => fn());
};

/** The file type picked for downloads, remembered between visits and shared by both studios. */
export function useAudioFormat(): [AudioFormat, (f: AudioFormat) => void] {
  return [useSyncExternalStore(subscribe, read, read), pick];
}

export default function FormatPicker({ value, onChange, disabled }: { value: AudioFormat; onChange: (f: AudioFormat) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="File type" className="inline-flex h-8 shrink-0 overflow-hidden rounded-md border border-line bg-raise text-[12px]">
      {FORMAT_LIST.map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={value === f}
          onClick={() => onChange(f)}
          disabled={disabled}
          title={FORMATS[f].hint}
          className={`px-2 font-mono transition not-first:border-l not-first:border-line disabled:opacity-40 ${
            value === f ? "bg-amp/10 text-amp" : "text-mute hover:text-ink"
          }`}
        >
          {FORMATS[f].label}
        </button>
      ))}
    </div>
  );
}
