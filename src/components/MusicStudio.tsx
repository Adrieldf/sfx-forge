"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  ALL_LAYERS,
  MAX_SECTION_BARS,
  MIN_SECTION_BARS,
  SECTION_LABELS,
  type Form,
  type FormSection,
  type Layers,
  type MusicOptions,
  type ScoreInfo,
  type SectionKind,
} from "@/lib/music/compose";
import { MAX_BLEND, STYLES, STYLE_IDS, type StyleId } from "@/lib/music/styles";
import type { WorkerReply } from "@/lib/music/worker";
import { randomSeed } from "@/lib/sfx/params";
import { SAMPLE_RATE, encodeWav } from "@/lib/sfx/synth";
import Waveform from "./Waveform";

interface TrackData {
  opts: MusicOptions;
  info: ScoreInfo;
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
}

/** Enough to compose a track again; the audio itself is never stored. */
interface Recent {
  styles: StyleId[];
  seconds: number;
  loop: boolean;
  seed: number;
  label: string;
  /** Present when the arrangement was edited by hand. */
  form?: Form;
}

const SECTION_KINDS = Object.keys(SECTION_LABELS) as SectionKind[];
/** What a section added by hand starts out as: bars and energy. */
const NEW_SECTION: Record<SectionKind, [number, number]> = { intro: [4, 0.3], a: [8, 0.8], b: [8, 0.9], c: [4, 0.4], outro: [4, 0.5] };
const MAX_SECTIONS = 24;
const MAX_SECONDS = 300;
const formSeconds = (f: Form, loop: boolean) => (f.sections.reduce((a, x) => a + x.bars, 0) * 240) / f.bpm + (loop ? 0 : 3);

function cleanForm(raw: unknown): Form | undefined {
  const f = raw as Form | undefined;
  if (!f || !Number.isFinite(f.bpm) || f.bpm < 30 || f.bpm > 300 || !Array.isArray(f.sections) || !f.sections.length || f.sections.length > MAX_SECTIONS) return undefined;
  const ok = f.sections.every(
    (x) => x && SECTION_KINDS.includes(x.kind) && Number.isInteger(x.bars) && x.bars >= MIN_SECTION_BARS && x.bars <= MAX_SECTION_BARS && x.bars % 2 === 0 && (x.energy === undefined || (x.energy >= 0 && x.energy <= 1)),
  );
  return ok ? { bpm: f.bpm, sections: f.sections.map(({ kind, bars, energy }) => ({ kind, bars, energy })) } : undefined;
}

const STORAGE_KEY = "sfx-forge.music";
const LENGTHS: [number, string][] = [[15, "15s"], [30, "30s"], [60, "1m"], [120, "2m"], [180, "3m"]];
const LAYER_LABELS: [keyof Layers, string][] = [["melody", "Melody"], ["chords", "Chords"], ["arp", "Arpeggio"], ["bass", "Bass"], ["drums", "Drums"]];
const NOTHING = new Float32Array(0);

const SECTION_TONE: Record<SectionKind, string> = {
  intro: "bg-raise text-mute",
  outro: "bg-raise text-mute",
  a: "bg-amp/20 text-amp",
  b: "bg-sig/20 text-sig",
  c: "bg-line text-ink",
};

function loadRecent(): Recent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const list: Recent[] = raw.flatMap((r) => {
      // Entries saved before styles could be blended hold a single `style`.
      const styles: unknown[] = Array.isArray(r?.styles) ? r.styles : [r?.style];
      const ok = styles.length > 0 && styles.length <= MAX_BLEND && styles.every((id) => typeof id === "string" && id in STYLES);
      if (!ok || !Number.isFinite(r.seconds) || !Number.isFinite(r.seed) || typeof r.label !== "string") return [];
      return [{ styles: styles as StyleId[], seconds: r.seconds, loop: !!r.loop, seed: r.seed, label: r.label, form: cleanForm(r.form) }];
    });
    return list.filter((r, i) => list.findIndex((x) => sameTrack(x, r)) === i);
  } catch {
    return [];
  }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/** One entry per composition: changing its length, loop or arrangement updates the entry instead of adding another. */
const sameTrack = (a: Recent, b: Recent) => a.styles.join() === b.styles.join() && a.seed === b.seed;

function Chip({ children, on, onClick, title, className = "" }: { children: ReactNode; on: boolean; onClick: () => void; title?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`truncate rounded border px-2 py-1.5 text-[13px] transition ${
        on ? "border-amp/60 bg-amp/10 text-amp" : "border-line text-mute hover:border-faint hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export default function MusicStudio({ active, nav }: { active: boolean; nav: ReactNode }) {
  const [styles, setStyles] = useState<StyleId[]>(["upbeat"]);
  const [seconds, setSeconds] = useState(60);
  const [loop, setLoop] = useState(true);
  const [layers, setLayers] = useState<Layers>(ALL_LAYERS);
  const [seed, setSeed] = useState(randomSeed);
  // A hand-edited arrangement; null lets the composer plan the sections from the length.
  const [form, setForm] = useState<Form | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [track, setTrack] = useState<TrackData | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recent, setRecent] = useState<Recent[]>(loadRecent);
  const [error, setError] = useState("");

  // ----- audio -----
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<{ of: TrackData; buffer: AudioBuffer } | null>(null);
  const playingRef = useRef<{ start: number; dur: number; loop: boolean } | null>(null);

  const stop = useCallback(() => {
    const src = srcRef.current;
    srcRef.current = null;
    playingRef.current = null;
    if (src) {
      src.onended = null;
      src.stop();
    }
    setPlaying(false);
  }, []);

  const start = useCallback(
    (t: TrackData, offset = 0) => {
      stop();
      const ctx = (ctxRef.current ??= new AudioContext());
      if (ctx.state === "suspended") void ctx.resume();
      if (bufferRef.current?.of !== t) {
        const buffer = ctx.createBuffer(2, t.left.length, SAMPLE_RATE);
        buffer.copyToChannel(t.left, 0);
        buffer.copyToChannel(t.right, 1);
        bufferRef.current = { of: t, buffer };
      }
      const { buffer } = bufferRef.current;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = t.opts.loop;
      src.connect(ctx.destination);
      src.onended = () => {
        if (srcRef.current !== src) return;
        srcRef.current = null;
        playingRef.current = null;
        setPlaying(false);
      };
      src.start(0, offset);
      srcRef.current = src;
      playingRef.current = { start: ctx.currentTime - offset, dur: buffer.duration, loop: t.opts.loop };
      setPlaying(true);
    },
    [stop],
  );

  const getProgress = useCallback(() => {
    const ctx = ctxRef.current;
    const p = playingRef.current;
    if (!ctx || !p) return null;
    const x = (ctx.currentTime - p.start) / p.dur;
    return p.loop ? x % 1 : x <= 1 ? x : null;
  }, []);

  // ----- generating -----
  const workerRef = useRef<Worker | null>(null);

  const generate = useCallback(
    (opts: MusicOptions) => {
      // Called from a click, which is also what lets the browser play the result later.
      const ctx = (ctxRef.current ??= new AudioContext());
      if (ctx.state === "suspended") void ctx.resume();
      stop();
      workerRef.current?.terminate();
      const worker = new Worker(new URL("../lib/music/worker.ts", import.meta.url));
      workerRef.current = worker;
      setError("");
      setProgress(0);
      worker.onmessage = (e: MessageEvent<WorkerReply>) => {
        if (e.data.type === "progress") {
          setProgress(e.data.fraction);
          return;
        }
        const next: TrackData = { opts, info: e.data.info, left: e.data.left, right: e.data.right };
        worker.terminate();
        workerRef.current = null;
        setProgress(null);
        setTrack(next);
        const entry: Recent = {
          styles: opts.styles,
          seconds: opts.seconds,
          loop: opts.loop,
          seed: opts.seed,
          form: opts.form,
          label: `${next.info.style} · ${next.info.key} · ${Math.round(next.info.bpm)} bpm`,
        };
        setRecent((list) => [entry, ...list.filter((r) => !sameTrack(r, entry))].slice(0, 20));
        start(next);
      };
      worker.onerror = () => {
        worker.terminate();
        workerRef.current = null;
        setProgress(null);
        setError("Could not generate the track in this browser.");
      };
      worker.postMessage(opts);
    },
    [start, stop],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch {
      // Storage is a convenience here; the track itself is unaffected.
    }
  }, [recent]);

  // Leaving the tab stops the music; leaving the page also drops the worker.
  useEffect(() => (active ? stop : undefined), [active, stop]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  // ----- actions -----
  const current = (over: Partial<MusicOptions> = {}): MusicOptions => ({ styles, seconds, loop, seed, layers, form: form ?? undefined, ...over });

  const generateNew = useCallback(
    (over: Partial<MusicOptions> = {}) => {
      const next = randomSeed();
      setSeed(next);
      generate({ styles, seconds, loop, layers, form: form ?? undefined, ...over, seed: next });
    },
    [generate, styles, seconds, loop, layers, form],
  );

  /** Styles toggle: up to MAX_BLEND are blended, and one always stays on. */
  const pickStyle = (id: StyleId) => {
    const next = styles.includes(id) ? styles.filter((x) => x !== id) : [...styles, id];
    if (!next.length || next.length > MAX_BLEND) return;
    setStyles(next);
    // Another style has another tempo, so the arrangement is planned afresh.
    setForm(null);
    generateNew({ styles: next, form: undefined });
  };
  // Length, loop and layers reshape the track you have rather than rolling a new one.
  const pickSeconds = (s: number) => {
    setSeconds(s);
    setForm(null);
    if (track) generate(current({ seconds: s, form: undefined }));
  };
  const toggleLoop = () => {
    setLoop(!loop);
    if (track) generate(current({ loop: !loop }));
  };
  const toggleLayer = (key: keyof Layers) => {
    const next = { ...layers, [key]: !layers[key] };
    if (!Object.values(next).some(Boolean)) return;
    setLayers(next);
    if (track) generate(current({ layers: next }));
  };
  const reopen = (r: Recent) => {
    setStyles(r.styles);
    setSeconds(r.seconds);
    setLoop(r.loop);
    setSeed(r.seed);
    setForm(r.form ?? null);
    generate({ styles: r.styles, seconds: r.seconds, loop: r.loop, seed: r.seed, form: r.form, layers });
  };

  // ----- arrangement -----
  const editTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(editTimer.current), []);

  /** The sections as the editor shows them: the edited form, or the one the composer chose. */
  const rows: FormSection[] = form?.sections ?? track?.info.sections.map(({ kind, bars, energy }) => ({ kind, bars, energy })) ?? [];
  const rowBpm = form?.bpm ?? track?.info.bpm ?? 120;

  /** Applies an edit and re-renders shortly after, so a burst of edits costs one render. */
  const arrange = (sections: FormSection[]) => {
    if (!track || !sections.length || sections.length > MAX_SECTIONS) return;
    const next: Form = { bpm: rowBpm, sections };
    if (formSeconds(next, loop) > MAX_SECONDS) {
      setError(`An arrangement can be up to ${MAX_SECONDS / 60} minutes long.`);
      return;
    }
    setError("");
    setForm(next);
    clearTimeout(editTimer.current);
    editTimer.current = setTimeout(() => generate(current({ form: next })), 450);
  };
  const patchRow = (i: number, patch: Partial<FormSection>) => arrange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const moveRow = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = rows.slice();
    next.splice(to, 0, ...next.splice(from, 1));
    arrange(next);
  };
  const addRow = (kind: SectionKind) => {
    const [bars, energy] = NEW_SECTION[kind];
    // New sections go last, but in front of an outro; an intro goes first.
    const at = kind === "intro" ? 0 : rows[rows.length - 1]?.kind === "outro" && kind !== "outro" ? rows.length - 1 : rows.length;
    arrange([...rows.slice(0, at), { kind, bars, energy }, ...rows.slice(at)]);
  };
  const resetForm = () => {
    clearTimeout(editTimer.current);
    setForm(null);
    setError("");
    if (track) generate(current({ form: undefined }));
  };

  const toggle = useCallback(() => {
    if (!track) return;
    if (playingRef.current) stop();
    else start(track);
  }, [track, start, stop]);

  const seek = (e: MouseEvent<HTMLButtonElement>) => {
    if (!track) return;
    const box = e.currentTarget.getBoundingClientRect();
    // A keyboard "click" has no position; treat it as play/stop.
    if (e.detail === 0) toggle();
    else start(track, Math.max(0, Math.min(0.999, (e.clientX - box.left) / box.width)) * track.info.seconds);
  };

  const download = () => {
    if (!track) return;
    const url = URL.createObjectURL(encodeWav(track.left, track.right));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${track.opts.styles.join("-")}-${Math.round(track.info.bpm)}bpm-${track.opts.seed.toString(36)}${track.opts.loop ? "-loop" : ""}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ----- keyboard -----
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space" && el.tagName !== "BUTTON") {
        e.preventDefault();
        toggle();
      } else if (e.key.toLowerCase() === "g") generateNew();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, toggle, generateNew]);

  const busy = progress !== null;
  const full = styles.length >= MAX_BLEND;
  const info = track?.info;
  const title = track ? `${track.info.style} · ${track.info.key} · ${Math.round(track.info.bpm)} bpm` : "No track yet";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1560px] flex-col lg:h-screen lg:flex-row">
      {/* ---------- options ---------- */}
      <aside className="flex shrink-0 flex-col border-line lg:h-screen lg:w-[19rem] lg:border-r">
        <div className="flex items-baseline gap-2 px-4 pt-4 pb-3">
          <h1 className="text-lg font-semibold tracking-tight">
            SFX <span className="text-amp">Forge</span>
          </h1>
          <span className="text-xs text-mute">game music</span>
        </div>
        {nav}

        <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-4">
          <h2 className="flex items-baseline justify-between pt-3 pb-1.5 text-[11px] font-medium tracking-wider text-mute uppercase">
            Style
            <span className="tracking-normal text-faint normal-case">
              {styles.length} of {MAX_BLEND} · pick several to blend
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-1">
            {STYLE_IDS.map((id) => (
              <Chip
                key={id}
                on={styles.includes(id)}
                onClick={() => pickStyle(id)}
                title={!styles.includes(id) && full ? `Up to ${MAX_BLEND} styles — switch one off first` : STYLES[id].blurb}
                className={`text-left ${!styles.includes(id) && full ? "opacity-40" : ""}`}
              >
                {STYLES[id].label}
              </Chip>
            ))}
          </div>
          <p className="pt-2 text-xs leading-snug text-faint">
            {styles.length === 1
              ? `${STYLES[styles[0]].blurb}.`
              : "A blend: one style brings the rhythm, another the harmony, another the melody. Who leads what changes with every track."}
          </p>

          <h2 className="pt-4 pb-1.5 text-[11px] font-medium tracking-wider text-mute uppercase">Length</h2>
          <div className="flex gap-1">
            {LENGTHS.map(([s, label]) => (
              <Chip key={s} on={!form && seconds === s} onClick={() => pickSeconds(s)} className="flex-1 px-1 text-xs">
                {label}
              </Chip>
            ))}
          </div>
          {form && <p className="pt-1.5 text-xs leading-snug text-faint">Custom arrangement, {clock(formSeconds(form, loop))} long. Pick a length to go back to an automatic one.</p>}
          <div className="pt-1">
            <Chip on={loop} onClick={toggleLoop} title="End exactly where it starts, so the track can repeat forever without a gap" className="w-full text-xs">
              {loop ? "Seamless loop" : "Plays once, with an intro and an ending"}
            </Chip>
          </div>

          <h2 className="pt-4 pb-1.5 text-[11px] font-medium tracking-wider text-mute uppercase">Layers</h2>
          <div className="flex flex-wrap gap-1">
            {LAYER_LABELS.map(([key, label]) => (
              <Chip key={key} on={layers[key]} onClick={() => toggleLayer(key)} title={`Include the ${label.toLowerCase()} in the mix`} className="px-2 text-xs">
                {label}
              </Chip>
            ))}
          </div>

          {recent.length > 0 && (
            <>
              <h2 className="pt-4 pb-1.5 text-[11px] font-medium tracking-wider text-mute uppercase">Recent tracks</h2>
              <ul className="flex flex-col gap-1">
                {recent.map((r) => (
                  <li key={`${r.styles.join("+")}-${r.seed}`} className="flex items-center gap-1 rounded bg-raise pr-1">
                    <button type="button" onClick={() => reopen(r)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[13px] hover:text-amp">
                      {r.label}
                      <span className="text-faint">
                        {" "}
                        · {clock(r.form ? formSeconds(r.form, r.loop) : r.seconds)}
                        {r.loop ? " loop" : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecent((list) => list.filter((x) => !sameTrack(x, r)))}
                      title={`Forget ${r.label}`}
                      aria-label={`Forget ${r.label}`}
                      className="grid h-6 w-6 place-items-center rounded text-mute transition hover:bg-line hover:text-ink"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>

      {/* ---------- track ---------- */}
      <main className="scroll-thin min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-line bg-bg/95 px-4 pt-4 pb-3 backdrop-blur lg:px-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate text-[15px] font-medium">{title}</h2>
            {track && (
              <span className="shrink-0 font-mono text-xs text-mute tabular-nums">
                {clock(track.info.seconds)} · {track.info.bars} bars · {((track.left.length * 4) / 1048576).toFixed(1)} MB wav
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={seek}
            disabled={!track}
            title="Click anywhere to play from there"
            aria-label="Play from this point"
            className="relative mt-2 block h-24 w-full cursor-pointer rounded-md border border-line bg-panel transition hover:border-faint disabled:cursor-default disabled:hover:border-line"
          >
            <Waveform samples={track?.left ?? NOTHING} getProgress={getProgress} />
            {busy && (
              <span className="absolute inset-0 grid place-items-center rounded-md bg-panel/80 text-[13px] text-mute">
                <span className="w-56">
                  Composing and rendering… {Math.round(progress * 100)}%
                  <span className="mt-1.5 block h-1 overflow-hidden rounded bg-line">
                    <span className="block h-full bg-amp transition-[width]" style={{ width: `${progress * 100}%` }} />
                  </span>
                </span>
              </span>
            )}
            {!track && !busy && (
              <span className="absolute inset-0 grid place-items-center text-[13px] text-mute">Pick a style on the left, or press Generate.</span>
            )}
          </button>

          {/* The form of the piece, lined up under the waveform. */}
          <div className="mt-1 flex h-5 gap-px overflow-hidden rounded text-[11px]">
            {info?.sections.map((s, i) => (
              <div
                key={i}
                title={`${s.label} · ${clock(s.start)}–${clock(s.end)} · ${s.bars} bars`}
                style={{ width: `${((s.end - s.start) / info.seconds) * 100}%` }}
                className={`truncate px-1.5 leading-5 ${SECTION_TONE[s.kind]}`}
              >
                {s.label}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={toggle}
              disabled={!track}
              title="Play or stop (Space)"
              className="inline-flex h-8 w-20 items-center justify-center rounded-md border border-amp bg-amp text-[13px] font-semibold text-bg transition hover:brightness-110 disabled:opacity-40"
            >
              {playing ? "Stop" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => generateNew()}
              title="Compose a new track with these settings (G)"
              className="inline-flex h-8 items-center rounded-md border border-line bg-raise px-3 text-[13px] whitespace-nowrap transition hover:border-faint"
            >
              {track ? "Generate another" : "Generate"}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!track || busy}
              title="16-bit stereo WAV, 44.1 kHz"
              className="ml-auto inline-flex h-8 items-center rounded-md border border-amp bg-amp px-3 text-[13px] font-semibold whitespace-nowrap text-bg transition hover:brightness-110 disabled:opacity-40"
            >
              Download WAV
            </button>
          </div>

          <p className="mt-2 min-h-4 text-xs text-mute">
            {error ||
              (track
                ? track.opts.loop
                  ? "Loops without a gap: the reverb tail is folded back into the first bars, so just set it to repeat in your engine."
                  : "Plays once: it ends on the home chord and rings out, so it suits jingles, cutscenes and title screens."
                : "Every track is composed from scratch — its own key, chords, tune and arrangement — then rendered in your browser.")}
          </p>
        </div>

        {info && (
          <div className="grid gap-3 p-4 lg:px-6 xl:grid-cols-2">
            <section className="rounded-lg border border-line bg-panel p-3">
              <header className="mb-2 flex items-center gap-2">
                <h3 className="text-[13px] font-semibold">Arrangement</h3>
                <span className="truncate text-xs text-faint">drag to reorder · every change re-renders the track</span>
                {form && (
                  <button type="button" onClick={resetForm} title="Let the composer plan the sections again" className="ml-auto shrink-0 rounded border border-line px-2 py-0.5 text-xs text-mute transition hover:border-faint hover:text-ink">
                    Reset
                  </button>
                )}
              </header>
              <ul className="flex flex-col gap-1">
                {rows.map((r, i) => {
                  const startBar = rows.slice(0, i).reduce((n, x) => n + x.bars, 0);
                  const energy = r.energy ?? 0.5;
                  const first = i === 0;
                  const last = i === rows.length - 1;
                  return (
                    <li
                      key={i}
                      onDragOver={(e) => {
                        if (dragging !== null) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragging !== null) moveRow(dragging, i);
                        setDragging(null);
                      }}
                      className={`grid grid-cols-[1.25rem_2.75rem_1fr_5.25rem_minmax(3rem,5rem)_3.75rem] items-center gap-1.5 rounded px-1 py-0.5 text-[13px] ${dragging === i ? "opacity-40" : ""} ${dragging !== null && dragging !== i ? "outline outline-1 outline-line" : ""}`}
                    >
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(i));
                          setDragging(i);
                        }}
                        onDragEnd={() => setDragging(null)}
                        title="Drag to move this section"
                        className="cursor-grab text-center text-faint select-none hover:text-ink active:cursor-grabbing"
                      >
                        ⠿
                      </span>
                      <span className="font-mono text-xs text-mute tabular-nums">{clock((startBar * 240) / rowBpm)}</span>
                      <select
                        value={r.kind}
                        onChange={(e) => patchRow(i, { kind: e.target.value as SectionKind })}
                        aria-label={`Section ${i + 1} type`}
                        className={`h-7 min-w-0 rounded border border-transparent px-1.5 text-[13px] outline-none hover:border-faint focus:border-faint ${SECTION_TONE[r.kind]}`}
                      >
                        {SECTION_KINDS.map((k) => (
                          <option key={k} value={k} className="bg-panel text-ink">
                            {SECTION_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      <span className="flex items-center justify-between rounded border border-line">
                        <button type="button" onClick={() => patchRow(i, { bars: r.bars - 2 })} disabled={r.bars <= MIN_SECTION_BARS} title="Two bars shorter" aria-label={`Shorten section ${i + 1}`} className="h-6 w-6 text-mute transition hover:text-ink disabled:opacity-30">
                          −
                        </button>
                        <span className="font-mono text-xs tabular-nums" title="Length in bars">
                          {r.bars}
                        </span>
                        <button type="button" onClick={() => patchRow(i, { bars: r.bars + 2 })} disabled={r.bars >= MAX_SECTION_BARS} title="Two bars longer" aria-label={`Lengthen section ${i + 1}`} className="h-6 w-6 text-mute transition hover:text-ink disabled:opacity-30">
                          +
                        </button>
                      </span>
                      <input
                        type="range"
                        className="sl"
                        min={0.2}
                        max={1}
                        step={0.05}
                        value={energy}
                        disabled={r.kind === "intro"}
                        onChange={(e) => patchRow(i, { energy: Number(e.target.value) })}
                        style={{ "--a": "0%", "--b": `${((energy - 0.2) / 0.8) * 100}%`, "--fill": "var(--color-sig)" } as CSSProperties}
                        aria-label={`Section ${i + 1} energy`}
                        title={r.kind === "intro" ? "An intro is always just chords and an arpeggio" : "Energy: below 30% the bass drops out, below 45% the drums; near the top everything doubles up"}
                      />
                      <span className="flex justify-end text-mute">
                        <button type="button" onClick={() => moveRow(i, i - 1)} disabled={first} title="Move earlier" aria-label={`Move section ${i + 1} earlier`} className="h-6 w-5 transition hover:text-ink disabled:opacity-30">
                          ↑
                        </button>
                        <button type="button" onClick={() => moveRow(i, i + 1)} disabled={last} title="Move later" aria-label={`Move section ${i + 1} later`} className="h-6 w-5 transition hover:text-ink disabled:opacity-30">
                          ↓
                        </button>
                        <button type="button" onClick={() => arrange(rows.filter((_, n) => n !== i))} disabled={rows.length === 1} title="Remove this section" aria-label={`Remove section ${i + 1}`} className="h-6 w-5 transition hover:text-ink disabled:opacity-30">
                          ×
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-2">
                <span className="pr-1 text-xs text-mute">Add</span>
                {SECTION_KINDS.map((k) => (
                  <button key={k} type="button" onClick={() => addRow(k)} disabled={rows.length >= MAX_SECTIONS} className={`rounded px-2 py-0.5 text-xs transition hover:brightness-125 disabled:opacity-40 ${SECTION_TONE[k]}`}>
                    {SECTION_LABELS[k]}
                  </button>
                ))}
                <span className="ml-auto font-mono text-xs text-faint tabular-nums">
                  {rows.reduce((n, x) => n + x.bars, 0)} bars · {clock(formSeconds({ bpm: rowBpm, sections: rows }, loop))}
                </span>
              </div>
            </section>

            <section className="rounded-lg border border-line bg-panel p-3">
              <header className="mb-2 flex items-center gap-2">
                <h3 className="text-[13px] font-semibold">Instruments</h3>
                <span className="truncate text-xs text-faint">what was picked for this track</span>
              </header>
              <ul className="flex flex-col gap-1">
                {LAYER_LABELS.map(([key, label]) => (
                  <li key={key} className={`grid grid-cols-[5.5rem_1fr] gap-2 text-[13px] ${track.opts.layers[key] ? "" : "opacity-40"}`}>
                    <span className="text-mute">{label}</span>
                    <span>{info.instruments[key].join(", ") || "—"}</span>
                  </li>
                ))}
              </ul>
              {info.recipe && <p className="mt-2 border-t border-line pt-2 text-xs text-mute">{info.recipe}.</p>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
