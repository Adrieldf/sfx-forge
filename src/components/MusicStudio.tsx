"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  ALL_LAYERS,
  DRUM_CHOICES,
  MAX_SECTION_BARS,
  MIN_SECTION_BARS,
  SECTION_LABELS,
  compose,
  type Form,
  type FormSection,
  type Instruments,
  type Layers,
  type Mood,
  type MusicOptions,
  type ScoreInfo,
  type SectionKind,
} from "@/lib/music/compose";
import { scoreToMidi } from "@/lib/music/midi";
import { MAX_SECONDS, MAX_SECTIONS, SECTION_KINDS, cleanOptions, decodeShare, encodeShare, formSeconds, sameSong } from "@/lib/music/options";
import { PATCHES, PATCH_CHOICES } from "@/lib/music/patches";
import { MAX_BLEND, MODES, STYLES, STYLE_IDS, type ModeId, type StyleId } from "@/lib/music/styles";
import type { ExportKind, WorkerJob, WorkerReply } from "@/lib/music/worker";
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
interface Stored {
  label: string;
  opts: MusicOptions;
}

const RECENT_KEY = "sfx-forge.music";
const SAVED_KEY = "sfx-forge.music.saved";
const LENGTHS: [number, string][] = [[15, "15s"], [30, "30s"], [60, "1m"], [120, "2m"], [180, "3m"]];
const NOTHING = new Float32Array(0);
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const MODE_IDS = Object.keys(MODES) as ModeId[];

/** The band, row by row: the layer, its label, and which instrument choice it carries. */
const BAND: { layer: keyof Layers; label: string; slot: keyof Instruments }[] = [
  { layer: "melody", label: "Melody", slot: "lead" },
  { layer: "chords", label: "Chords", slot: "chords" },
  { layer: "arp", label: "Arpeggio", slot: "arp" },
  { layer: "bass", label: "Bass", slot: "bass" },
  { layer: "drums", label: "Drums", slot: "drums" },
];
const MOODS: { key: keyof Mood; label: string; hint: string }[] = [
  { key: "bright", label: "Brightness", hint: "Left is darker and softer, right is brighter and sharper." },
  { key: "busy", label: "Busyness", hint: "How many notes the tune and the arpeggio play." },
  { key: "space", label: "Space", hint: "Left is dry and close, right is washed in reverb and echo." },
];
const EXPORTS: { kind: ExportKind; label: string; hint: string }[] = [
  { kind: "stems", label: "Stems", hint: "One WAV per layer plus the full mix, so the game can fade layers in and out" },
  { kind: "variants", label: "Intensity set", hint: "Calm, normal and intense versions that line up bar for bar" },
  { kind: "introloop", label: "Intro + loop", hint: "A file to play once, then a file to repeat, joining without a gap" },
  { kind: "stingers", label: "Stingers", hint: "Victory, defeat and level-up jingles in this track's key and instruments" },
];
/** What a section added by hand starts out as: bars and energy. */
const NEW_SECTION: Record<SectionKind, [number, number]> = { intro: [4, 0.3], a: [8, 0.8], b: [8, 0.9], c: [4, 0.4], outro: [4, 0.5] };

const SECTION_TONE: Record<SectionKind, string> = {
  intro: "bg-raise text-mute",
  outro: "bg-raise text-mute",
  a: "bg-amp/20 text-amp",
  b: "bg-sig/20 text-sig",
  c: "bg-line text-ink",
};
const HEADING = "text-[11px] font-medium tracking-wider text-mute uppercase";
const SELECT = "h-7 min-w-0 rounded border border-line bg-panel px-1.5 text-[13px] text-ink outline-none hover:border-faint focus:border-faint disabled:opacity-40";
const SMALL_BTN = "rounded border border-line px-2 py-0.5 text-xs text-mute transition hover:border-faint hover:text-ink disabled:opacity-40";

function loadStored(key: string): Stored[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const list: Stored[] = raw.flatMap((r) => {
      // Older entries kept the options beside the label instead of under `opts`.
      const opts = cleanOptions(r?.opts ?? r);
      return opts && typeof r.label === "string" ? [{ label: r.label, opts }] : [];
    });
    return list;
  } catch {
    return [];
  }
}

function store(key: string, list: Stored[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage is a convenience here; the track itself is unaffected.
  }
}

function initialOptions(): MusicOptions {
  return decodeShare(window.location.hash) ?? { styles: ["upbeat"], seconds: 60, loop: true, seed: randomSeed(), layers: ALL_LAYERS };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const fileBase = (t: TrackData) => `${t.opts.styles.join("-")}-${Math.round(t.info.bpm)}bpm-${(t.opts.seed >>> 0).toString(36)}`;

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

/** A slider in the house style. With `centre`, the fill grows outward from that value. */
function Slider({ value, min, max, step, centre, onChange, disabled, label, title, tone = "amp" }: {
  value: number;
  min: number;
  max: number;
  step: number;
  centre?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string;
  title?: string;
  tone?: "amp" | "sig";
}) {
  const at = (x: number) => ((x - min) / (max - min)) * 100;
  const from = centre ?? min;
  const style = { "--a": `${at(Math.min(value, from))}%`, "--b": `${at(Math.max(value, from))}%`, "--fill": `var(--color-${tone})` } as CSSProperties;
  return <input type="range" className="sl" min={min} max={max} step={step} value={value} disabled={disabled} style={style} aria-label={label} title={title} onChange={(e) => onChange(Number(e.target.value))} />;
}

function Card({ title, hint, action, children, wide }: { title: string; hint: string; action?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-lg border border-line bg-panel p-3 ${wide ? "xl:col-span-2" : ""}`}>
      <header className="mb-2 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="truncate text-xs text-faint">{hint}</span>
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </header>
      {children}
    </section>
  );
}

export default function MusicStudio({ active, nav }: { active: boolean; nav: ReactNode }) {
  // Everything the composer is told, in one object: what is here is what the next render uses.
  const [opts, setOpts] = useState<MusicOptions>(initialOptions);
  const [track, setTrack] = useState<TrackData | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  /** Index of the section playing on repeat, if one is. */
  const [region, setRegion] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [recent, setRecent] = useState<Stored[]>(() => loadStored(RECENT_KEY));
  const [saved, setSaved] = useState<Stored[]>(() => loadStored(SAVED_KEY));
  const [saveName, setSaveName] = useState("");
  const [exporting, setExporting] = useState<{ label: string; fraction: number } | null>(null);
  const [notice, setNotice] = useState("");
  const { styles, seconds, loop, layers } = opts;
  const form = opts.form ?? null;

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((t) => (t === msg ? "" : t)), 2500);
  }, []);

  // ----- audio -----
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<{ of: TrackData; buffer: AudioBuffer } | null>(null);
  /** `at` is the context time at which the position was `from`; playback cycles through from..to when it repeats. */
  const playingRef = useRef<{ at: number; dur: number; from: number; to: number; repeat: boolean } | null>(null);

  const stop = useCallback(() => {
    const src = srcRef.current;
    srcRef.current = null;
    playingRef.current = null;
    if (src) {
      src.onended = null;
      src.stop();
    }
    setPlaying(false);
    setRegion(null);
  }, []);

  /** Plays from `offset`; with `only`, repeats that stretch of the track (a section) until stopped. */
  const start = useCallback(
    (t: TrackData, offset = 0, only?: [number, number]) => {
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
      src.loop = t.opts.loop || !!only;
      if (only) {
        src.loopStart = only[0];
        src.loopEnd = Math.min(buffer.duration, only[1]);
      }
      src.connect(ctx.destination);
      src.onended = () => {
        if (srcRef.current !== src) return;
        srcRef.current = null;
        playingRef.current = null;
        setPlaying(false);
        setRegion(null);
      };
      const from = only ? only[0] : 0;
      const first = only ? only[0] : offset;
      src.start(0, first);
      srcRef.current = src;
      playingRef.current = { at: ctx.currentTime - (first - from), dur: buffer.duration, from, to: only ? src.loopEnd : buffer.duration, repeat: src.loop };
      setPlaying(true);
    },
    [stop],
  );

  const getProgress = useCallback(() => {
    const ctx = ctxRef.current;
    const p = playingRef.current;
    if (!ctx || !p) return null;
    const elapsed = ctx.currentTime - p.at;
    if (p.repeat) return (p.from + (elapsed % (p.to - p.from))) / p.dur;
    return elapsed <= p.dur ? elapsed / p.dur : null;
  }, []);

  // ----- generating -----
  const workerRef = useRef<Worker | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const generate = useCallback(
    (next: MusicOptions) => {
      // Called from a click, which is also what lets the browser play the result later.
      const ctx = (ctxRef.current ??= new AudioContext());
      if (ctx.state === "suspended") void ctx.resume();
      clearTimeout(editTimer.current);
      stop();
      workerRef.current?.terminate();
      const worker = new Worker(new URL("../lib/music/worker.ts", import.meta.url));
      workerRef.current = worker;
      setNotice("");
      setProgress(0);
      worker.onmessage = (e: MessageEvent<WorkerReply>) => {
        if (e.data.type === "progress") {
          setProgress(e.data.fraction);
          return;
        }
        if (e.data.type !== "done") return;
        const made: TrackData = { opts: next, info: e.data.info, left: e.data.left, right: e.data.right };
        worker.terminate();
        workerRef.current = null;
        setProgress(null);
        setTrack(made);
        const entry: Stored = { opts: next, label: `${made.info.style} · ${made.info.key} · ${Math.round(made.info.bpm)} bpm` };
        // One entry per song: changing its length, mix or arrangement updates the entry.
        setRecent((list) => [entry, ...list.filter((r) => !sameSong(r.opts, next))].slice(0, 20));
        start(made);
      };
      worker.onerror = () => {
        worker.terminate();
        workerRef.current = null;
        setProgress(null);
        setNotice("Could not generate the track in this browser.");
      };
      worker.postMessage({ job: "track", opts: next } satisfies WorkerJob);
    },
    [start, stop],
  );

  useEffect(() => store(RECENT_KEY, recent), [recent]);
  useEffect(() => store(SAVED_KEY, saved), [saved]);

  // Leaving the tab stops the music; leaving the page also drops the workers.
  useEffect(() => (active ? stop : undefined), [active, stop]);
  const exportRef = useRef<Worker | null>(null);
  useEffect(
    () => () => {
      clearTimeout(editTimer.current);
      workerRef.current?.terminate();
      exportRef.current?.terminate();
    },
    [],
  );

  // ----- actions -----
  /**
   * Changes options and re-renders the track you have. Sliders and other quick-fire edits
   * wait a moment first, so a burst of them costs one render.
   */
  const apply = (patch: Partial<MusicOptions>, soon = false) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    clearTimeout(editTimer.current);
    if (!track) return;
    if (soon) editTimer.current = setTimeout(() => generate(next), 450);
    else generate(next);
  };

  /** A new song with the current settings: new seed, and nothing re-rolled yet. */
  const generateNew = useCallback(
    (patch: Partial<MusicOptions> = {}) => {
      const next = { ...opts, ...patch, seed: randomSeed(), rerolls: undefined };
      setOpts(next);
      generate(next);
    },
    [generate, opts],
  );
  /** The first press plays the song on screen (it may have come from a link); later ones roll new songs. */
  const generateButton = useCallback(() => (track ? generateNew() : generate(opts)), [track, generateNew, generate, opts]);

  /** Styles toggle: up to MAX_BLEND are blended, and one always stays on. */
  const pickStyle = (id: StyleId) => {
    const next = styles.includes(id) ? styles.filter((x) => x !== id) : [...styles, id];
    if (!next.length || next.length > MAX_BLEND) return;
    // Another style has another tempo, so the arrangement is planned afresh.
    generateNew({ styles: next, form: undefined });
  };
  const toggleLayer = (key: keyof Layers) => {
    const next = { ...layers, [key]: !layers[key] };
    if (Object.values(next).some(Boolean)) apply({ layers: next });
  };
  const reopen = (o: MusicOptions) => {
    setOpts(o);
    generate(o);
  };

  // ----- song: tempo, key, mood -----
  const tempo = form?.bpm ?? opts.bpm ?? track?.info.bpm ?? 120;
  const setTempo = (bpm: number) => apply(form ? { form: { ...form, bpm } } : { bpm }, true);
  const setMood = (key: keyof Mood, value: number) => apply({ mood: { ...opts.mood, [key]: value || undefined } }, true);

  // ----- band: instruments, levels, re-rolls -----
  const setInstrument = (slot: keyof Instruments, value: string) => apply({ instruments: { ...opts.instruments, [slot]: value || undefined } as Instruments });
  const setLevel = (layer: keyof Layers, value: number) => apply({ levels: { ...opts.levels, [layer]: value === 1 ? undefined : value } }, true);
  const reroll = (layer: keyof Layers) => apply({ rerolls: { ...opts.rerolls, [layer]: randomSeed() >>> 0 || 1 } });

  // ----- arrangement -----
  /** The sections as the editor shows them: the edited form, or the one the composer chose. */
  const rows: FormSection[] = form?.sections ?? track?.info.sections.map(({ kind, bars, energy, shift }) => ({ kind, bars, energy, shift: shift || undefined })) ?? [];

  const arrange = (sections: FormSection[]) => {
    if (!track || !sections.length || sections.length > MAX_SECTIONS) return;
    const next: Form = { bpm: tempo, sections };
    if (formSeconds(next, loop) > MAX_SECONDS) {
      flash(`An arrangement can be up to ${MAX_SECONDS / 60} minutes long.`);
      return;
    }
    apply({ form: next }, true);
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
  /** Repeats one section, to hear an edit without sitting through the whole track. */
  const playRow = (i: number) => {
    const s = track?.info.sections[i];
    if (!track || !s) return;
    if (region === i) {
      stop();
      return;
    }
    start(track, 0, [s.start, s.end]);
    setRegion(i);
  };

  // ----- transport -----
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

  // ----- saving and exporting -----
  const saveCurrent = () => {
    if (!track) return;
    const label = saveName.trim() || `${track.info.style} · ${track.info.key} · ${Math.round(track.info.bpm)} bpm`;
    setSaved((list) => [{ label, opts: track.opts }, ...list].slice(0, 50));
    setSaveName("");
    flash(`Saved "${label}"`);
  };

  const copyLink = async () => {
    if (!track) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}${encodeShare(track.opts)}`);
      flash("Link copied — it opens this exact track");
    } catch {
      flash("Clipboard is blocked in this browser");
    }
  };

  const exportZip = (kind: ExportKind, label: string) => {
    if (!track || exporting) return;
    const of = track;
    const worker = new Worker(new URL("../lib/music/worker.ts", import.meta.url));
    exportRef.current = worker;
    setExporting({ label, fraction: 0 });
    const finish = () => {
      worker.terminate();
      exportRef.current = null;
      setExporting(null);
    };
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (e.data.type === "progress") setExporting({ label, fraction: e.data.fraction });
      else if (e.data.type === "file") {
        saveFile(new Blob([e.data.bytes], { type: "application/zip" }), `${fileBase(of)}-${e.data.suffix}.zip`);
        finish();
      }
    };
    worker.onerror = () => {
      finish();
      flash(`Could not export the ${label.toLowerCase()}.`);
    };
    worker.postMessage({ job: kind, opts: of.opts } satisfies WorkerJob);
  };

  const exportMidi = () => {
    if (track) saveFile(new Blob([scoreToMidi(compose(track.opts))], { type: "audio/midi" }), `${fileBase(track)}.mid`);
  };

  // ----- keyboard -----
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range");
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space" && el.tagName !== "BUTTON") {
        e.preventDefault();
        toggle();
      } else if (e.key.toLowerCase() === "g") generateButton();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, toggle, generateButton]);

  const busy = progress !== null;
  const full = styles.length >= MAX_BLEND;
  const info = track?.info;
  const title = track ? `${track.info.style} · ${track.info.key} · ${Math.round(track.info.bpm)} bpm` : "No track yet";
  const instrumentChoices = (slot: keyof Instruments): [string, string][] => (slot === "drums" ? DRUM_CHOICES : PATCH_CHOICES[slot].map((id) => [id, PATCHES[id].name]));

  const storedList = (list: Stored[], forget: (s: Stored) => void) => (
    <ul className="flex flex-col gap-1">
      {list.map((s, i) => (
        <li key={i} className="flex items-center gap-1 rounded bg-raise pr-1">
          <button type="button" onClick={() => reopen(s.opts)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[13px] hover:text-amp">
            {s.label}
            <span className="text-faint">
              {" "}
              · {s.opts.form ? clock(formSeconds(s.opts.form, s.opts.loop)) : clock(s.opts.seconds)}
              {s.opts.loop ? " loop" : ""}
            </span>
          </button>
          <button type="button" onClick={() => forget(s)} title={`Remove ${s.label}`} aria-label={`Remove ${s.label}`} className="grid h-6 w-6 place-items-center rounded text-mute transition hover:bg-line hover:text-ink">
            ×
          </button>
        </li>
      ))}
    </ul>
  );

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
          <h2 className={`flex items-baseline justify-between pt-3 pb-1.5 ${HEADING}`}>
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

          <h2 className={`pt-4 pb-1.5 ${HEADING}`}>Length</h2>
          <div className="flex gap-1">
            {LENGTHS.map(([s, label]) => (
              <Chip key={s} on={!form && seconds === s} onClick={() => apply({ seconds: s, form: undefined })} className="flex-1 px-1 text-xs">
                {label}
              </Chip>
            ))}
          </div>
          {form && <p className="pt-1.5 text-xs leading-snug text-faint">Custom arrangement, {clock(formSeconds(form, loop))} long. Pick a length to go back to an automatic one.</p>}
          {!form && opts.bpm && <p className="pt-1.5 text-xs leading-snug text-faint">With a set tempo, the length rounds to the nearest whole phrase.</p>}
          <div className="pt-1">
            <Chip on={loop} onClick={() => apply({ loop: !loop })} title="End exactly where it starts, so the track can repeat forever without a gap" className="w-full text-xs">
              {loop ? "Seamless loop" : "Plays once, with an intro and an ending"}
            </Chip>
          </div>

          <h2 className={`pt-4 pb-1.5 ${HEADING}`}>Saved tracks</h2>
          <div className="flex gap-1.5">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
              placeholder={track ? title : "Generate a track first"}
              aria-label="Name for the current track"
              disabled={!track}
              className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-faint disabled:opacity-50"
            />
            <button type="button" onClick={saveCurrent} disabled={!track} className="h-8 rounded-md border border-line bg-raise px-3 text-[13px] transition hover:border-faint disabled:opacity-40">
              Save
            </button>
          </div>
          {saved.length > 0 && <div className="pt-2">{storedList(saved, (s) => setSaved((list) => list.filter((x) => x !== s)))}</div>}

          {recent.length > 0 && (
            <>
              <h2 className={`pt-4 pb-1.5 ${HEADING}`}>Recent tracks</h2>
              {storedList(recent, (s) => setRecent((list) => list.filter((x) => x !== s)))}
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
            {!track && !busy && <span className="absolute inset-0 grid place-items-center text-[13px] text-mute">Pick a style on the left, or press Generate.</span>}
          </button>

          {/* The form of the piece, lined up under the waveform. */}
          <div className="mt-1 flex h-5 gap-px overflow-hidden rounded text-[11px]">
            {info?.sections.map((s, i) => (
              <div
                key={i}
                title={`${s.label} · ${clock(s.start)}–${clock(s.end)} · ${s.bars} bars`}
                style={{ width: `${((s.end - s.start) / info.seconds) * 100}%` }}
                className={`truncate px-1.5 leading-5 ${SECTION_TONE[s.kind]} ${region === i ? "outline outline-1 -outline-offset-1 outline-ink" : ""}`}
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
              onClick={generateButton}
              title="Compose a new track with these settings (G)"
              className="inline-flex h-8 items-center rounded-md border border-line bg-raise px-3 text-[13px] whitespace-nowrap transition hover:border-faint"
            >
              {track ? "Generate another" : "Generate"}
            </button>
            <button
              type="button"
              onClick={copyLink}
              disabled={!track}
              title="Copy a link that opens this exact track"
              className="ml-auto inline-flex h-8 items-center rounded-md border border-line bg-raise px-3 text-[13px] whitespace-nowrap transition hover:border-faint disabled:opacity-40"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => track && saveFile(encodeWav(track.left, track.right), `${fileBase(track)}${track.opts.loop ? "-loop" : ""}.wav`)}
              disabled={!track || busy}
              title="16-bit stereo WAV, 44.1 kHz"
              className="inline-flex h-8 items-center rounded-md border border-amp bg-amp px-3 text-[13px] font-semibold whitespace-nowrap text-bg transition hover:brightness-110 disabled:opacity-40"
            >
              Download WAV
            </button>
          </div>

          <p className="mt-2 min-h-4 text-xs text-mute">
            {notice ||
              (track
                ? track.opts.loop
                  ? "Loops without a gap: the reverb tail is folded back into the first bars, so just set it to repeat in your engine."
                  : "Plays once: it ends on the home chord and rings out, so it suits jingles, cutscenes and title screens."
                : decodeShare(window.location.hash)
                  ? "A shared track is loaded. Press Generate to hear it."
                  : "Every track is composed from scratch — its own key, chords, tune and arrangement — then rendered in your browser.")}
          </p>
        </div>

        {info && track && (
          <div className="grid gap-3 p-4 lg:px-6 xl:grid-cols-2">
            <Card
              wide
              title="Arrangement"
              hint="drag to reorder · every change re-renders the track"
              action={
                form && (
                  <button type="button" onClick={() => apply({ form: undefined })} title="Let the composer plan the sections again" className={SMALL_BTN}>
                    Reset
                  </button>
                )
              }
            >
              <ul className="flex flex-col gap-1">
                {rows.map((r, i) => {
                  const startBar = rows.slice(0, i).reduce((n, x) => n + x.bars, 0);
                  const energy = r.energy ?? 0.5;
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
                      className={`grid grid-cols-[1.25rem_1.5rem_2.75rem_minmax(5.5rem,1fr)_5.25rem_minmax(3rem,2fr)_4.75rem_3.75rem] items-center gap-1.5 rounded px-1 py-0.5 text-[13px] ${dragging === i ? "opacity-40" : ""} ${dragging !== null && dragging !== i ? "outline outline-1 outline-line" : ""}`}
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
                      <button
                        type="button"
                        onClick={() => playRow(i)}
                        disabled={!info.sections[i] || busy}
                        aria-pressed={region === i}
                        title={region === i ? "Stop" : "Play just this section, on repeat"}
                        aria-label={`Play section ${i + 1} on repeat`}
                        className={`h-6 rounded text-xs transition hover:bg-line disabled:opacity-30 ${region === i ? "text-amp" : "text-mute hover:text-ink"}`}
                      >
                        {region === i ? "■" : "▶"}
                      </button>
                      <span className="font-mono text-xs text-mute tabular-nums">{clock((startBar * 240) / tempo)}</span>
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
                      <Slider
                        value={energy}
                        min={0.2}
                        max={1}
                        step={0.05}
                        tone="sig"
                        disabled={r.kind === "intro"}
                        onChange={(v) => patchRow(i, { energy: v })}
                        label={`Section ${i + 1} energy`}
                        title={r.kind === "intro" ? "An intro is always just chords and an arpeggio" : "Energy: below 30% the bass drops out, below 45% the drums; near the top everything doubles up"}
                      />
                      <select
                        value={r.shift ?? 0}
                        onChange={(e) => patchRow(i, { shift: Number(e.target.value) || undefined })}
                        aria-label={`Section ${i + 1} key change`}
                        title="Key change: play this section higher or lower, in semitones"
                        className={`${SELECT} px-1 font-mono text-xs ${r.shift ? "text-amp" : "text-mute"}`}
                      >
                        {[5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5].map((n) => (
                          <option key={n} value={n}>
                            {n === 0 ? "key ±0" : `key ${n > 0 ? "+" : "−"}${Math.abs(n)}`}
                          </option>
                        ))}
                      </select>
                      <span className="flex justify-end text-mute">
                        <button type="button" onClick={() => moveRow(i, i - 1)} disabled={i === 0} title="Move earlier" aria-label={`Move section ${i + 1} earlier`} className="h-6 w-5 transition hover:text-ink disabled:opacity-30">
                          ↑
                        </button>
                        <button type="button" onClick={() => moveRow(i, i + 1)} disabled={i === rows.length - 1} title="Move later" aria-label={`Move section ${i + 1} later`} className="h-6 w-5 transition hover:text-ink disabled:opacity-30">
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
                  {rows.reduce((n, x) => n + x.bars, 0)} bars · {clock(formSeconds({ bpm: tempo, sections: rows }, loop))}
                </span>
              </div>
            </Card>

            <Card title="Band" hint="choose instruments, set levels, or re-roll one layer and keep the rest">
              <ul className="flex flex-col gap-1">
                {BAND.map(({ layer, label, slot }) => {
                  const level = opts.levels?.[layer] ?? 1;
                  const auto = info.instruments[layer].join(", ") || "none this time";
                  return (
                    <li key={layer} className="grid grid-cols-[5rem_minmax(0,1fr)_minmax(3rem,6rem)_1.75rem] items-center gap-1.5">
                      <Chip on={layers[layer]} onClick={() => toggleLayer(layer)} title={`${layers[layer] ? "Mute" : "Unmute"} the ${label.toLowerCase()}`} className="px-1.5 py-1 text-xs">
                        {label}
                      </Chip>
                      <select
                        value={opts.instruments?.[slot] ?? ""}
                        onChange={(e) => setInstrument(slot, e.target.value)}
                        disabled={!layers[layer]}
                        aria-label={`${label} instrument`}
                        title={slot === "lead" ? "The main melody instrument; a second one may still answer it" : undefined}
                        className={`${SELECT} ${opts.instruments?.[slot] ? "text-amp" : ""}`}
                      >
                        <option value="">Auto — {auto}</option>
                        {instrumentChoices(slot).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <Slider value={level} min={0} max={2} step={0.05} centre={1} disabled={!layers[layer]} onChange={(v) => setLevel(layer, v)} label={`${label} volume`} title={`Volume: ${Math.round(level * 100)}%`} />
                      <button type="button" onClick={() => reroll(layer)} disabled={!layers[layer] || busy} title={`Write a new ${label.toLowerCase()} part and keep everything else`} aria-label={`Re-roll the ${label.toLowerCase()}`} className="grid h-7 place-items-center rounded border border-line text-mute transition hover:border-faint hover:text-ink disabled:opacity-30">
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 3h10v10H3zM5.800 5.800h.01M10.200 10.200h.01M8 8h.01" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 border-t border-line pt-2 text-xs text-mute">
                {info.recipe ? `${info.recipe}. ` : ""}Re-rolling the chords also picks a new key and progression; the tune keeps its shape and follows them.
              </p>
            </Card>

            <Card
              title="Song"
              hint="tempo, key and mood"
              action={
                (opts.bpm || opts.key !== undefined || opts.mode || opts.mood) && (
                  <button type="button" onClick={() => apply({ bpm: undefined, key: undefined, mode: undefined, mood: undefined })} title="Let the style decide all of these again" className={SMALL_BTN}>
                    Reset
                  </button>
                )
              }
            >
              <div className="flex flex-col gap-1">
                <label className="grid grid-cols-[5rem_minmax(0,1fr)_4.5rem] items-center gap-1.5 text-[13px]">
                  <span className="text-mute">Tempo</span>
                  <Slider value={Math.round(tempo)} min={50} max={200} step={1} onChange={setTempo} label="Tempo" title="Beats per minute" />
                  <span className="flex items-center justify-end gap-1 font-mono text-xs tabular-nums">
                    {Math.round(tempo)}
                    {opts.bpm && !form ? (
                      <button type="button" onClick={() => apply({ bpm: undefined })} title="Let the style pick the tempo" className="text-faint hover:text-ink">
                        ×
                      </button>
                    ) : (
                      <span className="text-faint">{form ? "" : "auto"}</span>
                    )}
                  </span>
                </label>
                <div className="grid grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 text-[13px]">
                  <span className="text-mute">Key</span>
                  <select value={opts.key ?? ""} onChange={(e) => apply({ key: e.target.value === "" ? undefined : Number(e.target.value) })} aria-label="Key" className={`${SELECT} ${opts.key !== undefined ? "text-amp" : ""}`}>
                    <option value="">Auto — {info.key.split(" ")[0]}</option>
                    {NOTE_NAMES.map((n, i) => (
                      <option key={n} value={i}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <select value={opts.mode ?? ""} onChange={(e) => apply({ mode: (e.target.value || undefined) as ModeId | undefined })} aria-label="Scale" className={`${SELECT} ${opts.mode ? "text-amp" : ""}`}>
                    <option value="">Auto — {info.key.split(" ").slice(1).join(" ")}</option>
                    {MODE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {MODES[id].label}
                      </option>
                    ))}
                  </select>
                </div>
                {MOODS.map(({ key, label, hint }) => {
                  const value = opts.mood?.[key] ?? 0;
                  return (
                    <label key={key} className="grid grid-cols-[5rem_minmax(0,1fr)_4.5rem] items-center gap-1.5 text-[13px]" title={hint}>
                      <span className="text-mute" onDoubleClick={() => setMood(key, 0)}>
                        {label}
                      </span>
                      <Slider value={value} min={-1} max={1} step={0.05} centre={0} onChange={(v) => setMood(key, v)} label={label} title={hint} />
                      <span className={`text-right font-mono text-xs tabular-nums ${value ? "" : "text-faint"}`}>{value ? `${value > 0 ? "+" : "−"}${Math.round(Math.abs(value) * 100)}%` : "style"}</span>
                    </label>
                  );
                })}
              </div>
            </Card>

            <Card wide title="Export" hint="more than the plain WAV, packaged for a game">
              <div className="flex flex-wrap items-center gap-1.5">
                {EXPORTS.map(({ kind, label, hint }) => {
                  const needsLoop = kind === "introloop" && !track.opts.loop;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => exportZip(kind, label)}
                      disabled={busy || !!exporting || needsLoop}
                      title={needsLoop ? "Turn on Seamless loop to export an intro and a loop" : `${hint} (.zip)`}
                      className="inline-flex h-8 items-center rounded-md border border-line bg-raise px-3 text-[13px] whitespace-nowrap transition hover:border-faint disabled:opacity-40"
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={exportMidi}
                  disabled={busy}
                  title="The notes as a standard MIDI file, one track per instrument, for use in a DAW"
                  className="inline-flex h-8 items-center rounded-md border border-line bg-raise px-3 text-[13px] whitespace-nowrap transition hover:border-faint disabled:opacity-40"
                >
                  MIDI
                </button>
                {exporting && (
                  <span className="flex items-center gap-2 text-xs text-mute">
                    Rendering {exporting.label.toLowerCase()}… {Math.round(exporting.fraction * 100)}%
                    <span className="block h-1 w-24 overflow-hidden rounded bg-line">
                      <span className="block h-full bg-amp transition-[width]" style={{ width: `${exporting.fraction * 100}%` }} />
                    </span>
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs leading-snug text-faint">
                Stems, the intensity set and intro + loop are all cut from the track above, so they match what you hear. Each zip includes a short note on how to use the files.
              </p>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
