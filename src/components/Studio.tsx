"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  DEFAULTS,
  NO_LOCKS,
  PARAMS,
  PARAM_BY_KEY,
  SECTIONS,
  WAVES,
  compact,
  mergeUnlocked,
  mutateParams,
  randomParams,
  randomSeed,
  sanitize,
  type Locks,
  type SectionId,
  type SoundParams,
  type Wave,
} from "@/lib/sfx/params";
import { MATERIALS, MATERIAL_IDS, materialLabel, type Material } from "@/lib/sfx/materials";
import { MELODY_PATTERNS, cleanMelody } from "@/lib/sfx/melody";
import { CATEGORIES, PRESETS, type Preset, type PresetStyle } from "@/lib/sfx/presets";
import { SAMPLE_RATE, encodeWav, render } from "@/lib/sfx/synth";
import ParamSlider from "./ParamSlider";
import Waveform from "./Waveform";

// ---------- state ----------

interface State {
  params: SoundParams;
  past: SoundParams[];
  future: SoundParams[];
  name: string;
  edited: boolean;
  lastKey: string | null;
  lastT: number;
}

type Action =
  | { type: "set"; key: keyof SoundParams; value: number | string; t: number }
  | { type: "replace"; params: SoundParams; name?: string; mixed?: boolean }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY = 100;

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "set": {
      if (s.params[a.key] === a.value) return s;
      // Collapse a continuous drag of one slider into a single undo step.
      const sameDrag = s.lastKey === a.key && a.t - s.lastT < 700;
      return {
        ...s,
        params: { ...s.params, [a.key]: a.value },
        past: sameDrag ? s.past : [...s.past.slice(-HISTORY), s.params],
        future: [],
        edited: true,
        lastKey: a.key,
        lastT: a.t,
      };
    }
    case "replace":
      return {
        ...s,
        params: a.params,
        past: [...s.past.slice(-HISTORY), s.params],
        future: [],
        name: a.name ?? s.name,
        edited: a.name === undefined || !!a.mixed,
        lastKey: null,
      };
    case "undo": {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { ...s, params: prev, past: s.past.slice(0, -1), future: [s.params, ...s.future], edited: true, lastKey: null };
    }
    case "redo": {
      const next = s.future[0];
      if (!next) return s;
      return { ...s, params: next, past: [...s.past, s.params], future: s.future.slice(1), edited: true, lastKey: null };
    }
  }
}

// ---------- persistence ----------

interface SavedSound {
  id: string;
  name: string;
  params: SoundParams;
}

const STORAGE_KEY = "sfx-forge.saved";

function loadSaved(): SavedSound[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r) => {
      const params = sanitize(r?.params);
      return params && typeof r.name === "string" ? [{ id: String(r.id), name: r.name, params }] : [];
    });
  } catch {
    return [];
  }
}

function encodeShare(p: SoundParams): string {
  return btoa(JSON.stringify(compact(p))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeShare(hash: string): SoundParams | null {
  if (!hash.startsWith("#s=")) return null;
  try {
    return sanitize(JSON.parse(atob(hash.slice(3).replace(/-/g, "+").replace(/_/g, "/"))));
  } catch {
    return null;
  }
}

function initState(): State {
  const shared = decodeShare(window.location.hash);
  const first = PRESETS[0];
  return {
    params: shared ?? first.params,
    past: [],
    future: [],
    name: shared ? "Shared sound" : first.name,
    edited: false,
    lastKey: null,
    lastT: 0,
  };
}

// Rendering is pure, so one buffer per parameter object is enough.
const renderCache = new WeakMap<SoundParams, Float32Array<ArrayBuffer>>();
function renderCached(p: SoundParams) {
  let buf = renderCache.get(p);
  if (!buf) {
    buf = render(p);
    renderCache.set(p, buf);
  }
  return buf;
}

// ---------- small pieces ----------

const WAVE_PATHS: Record<Wave, string> = {
  sine: "M1 7C4-1 9-1 12 7s8 8 11 0",
  triangle: "M1 7l5.5-5.5 11 11L23 7",
  saw: "M1 12.5L12 1.5v11L23 1.5",
  square: "M1 12.5v-11h11v11h11v-11",
  noise: "M1 7l2-4 2 8 2-10 2 7 2-3 2 6 2-9 2 7 2-4 2 5 2-3",
};

function Icon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICON = {
  play: "M4.5 2.5v11l9-5.500z",
  dice: "M3 3h10v10H3zM5.800 5.800h.01M10.200 10.200h.01M8 8h.01",
  reset: "M2.500 8a5.500 5.500 0 1 0 1.700-4M2.500 2.500V5H5",
  locked: "M4 7.500h8v6H4zM5.500 7.500V5a2.500 2.500 0 0 1 5 0v2.500",
  unlocked: "M4 7.500h8v6H4zM5.500 7.500V5a2.500 2.500 0 0 1 4.800-1",
  undo: "M5.500 3L2.500 6l3 3M2.500 6h6.500a4 4 0 0 1 0 8H7",
  redo: "M10.500 3l3 3-3 3M13.500 6H7a4 4 0 0 0 0 8h2",
  close: "M4 4l8 8M12 4l-8 8",
};

function Btn({
  children,
  onClick,
  title,
  primary,
  disabled,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  primary?: boolean;
  disabled?: boolean;
  active?: boolean;
}) {
  const tone = primary
    ? "border-amp bg-amp text-bg font-semibold hover:brightness-110"
    : active
      ? "border-amp/60 bg-amp/10 text-amp"
      : "border-line bg-raise text-ink hover:border-faint";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] whitespace-nowrap transition disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  );
}

function IconBtn({ d, onClick, title, active }: { d: string; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`grid h-6 w-6 place-items-center rounded transition hover:bg-line ${active ? "text-amp" : "text-mute hover:text-ink"}`}
    >
      <Icon d={d} />
    </button>
  );
}

// ---------- studio ----------

export default function Studio({ active, nav }: { active: boolean; nav: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const { params } = state;
  const [locks, setLocks] = useState<Locks>(NO_LOCKS);
  const [autoplay, setAutoplay] = useState(true);
  const [tab, setTab] = useState<"presets" | "saved">("presets");
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<PresetStyle | "all">("all");
  const [saved, setSaved] = useState<SavedSound[]>(loadSaved);
  const [saveName, setSaveName] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [toast, setToast] = useState("");

  const samples = useMemo(() => renderCached(params), [params]);

  // ----- audio -----
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const playingRef = useRef<{ start: number; dur: number } | null>(null);
  const lastPlayedRef = useRef<Float32Array | null>(null);
  const interactedRef = useRef(false);

  const play = useCallback((data: Float32Array<ArrayBuffer>) => {
    if (!data.length) return;
    const ctx = (ctxRef.current ??= new AudioContext());
    if (ctx.state === "suspended") void ctx.resume();
    srcRef.current?.stop();
    const buffer = ctx.createBuffer(1, data.length, SAMPLE_RATE);
    buffer.copyToChannel(data, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
    srcRef.current = src;
    playingRef.current = { start: ctx.currentTime, dur: buffer.duration };
    lastPlayedRef.current = data;
  }, []);

  const getProgress = useCallback(() => {
    const ctx = ctxRef.current;
    const p = playingRef.current;
    if (!ctx || !p) return null;
    const x = (ctx.currentTime - p.start) / p.dur;
    return x >= 0 && x <= 1 ? x : null;
  }, []);

  // Audition every change shortly after it lands (browsers need a user gesture first).
  useEffect(() => {
    if (!autoplay || !interactedRef.current || lastPlayedRef.current === samples) return;
    const id = setTimeout(() => play(samples), 70);
    return () => clearTimeout(id);
  }, [samples, autoplay, play]);

  // ----- actions -----
  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1800);
  }, []);

  /** Loads a whole sound, keeping locked sections, and plays it straight away. */
  const load = useCallback(
    (source: SoundParams, name?: string) => {
      const next = mergeUnlocked(params, source, locks);
      // With a section locked the result is a hybrid, not the preset itself.
      dispatch({ type: "replace", params: next, name, mixed: Object.values(locks).some(Boolean) });
      play(renderCached(next));
    },
    [params, locks, play],
  );

  const set = useCallback((key: keyof SoundParams, value: number | string) => {
    dispatch({ type: "set", key, value, t: Date.now() });
  }, []);

  const randomize = useCallback(() => load({ ...DEFAULTS, ...randomParams() }), [load]);
  const mutate = useCallback(() => load(mutateParams(params)), [load, params]);
  const resetAll = useCallback(() => load(DEFAULTS), [load]);

  const randomizeSection = (id: SectionId) => {
    const next = { ...params, ...randomParams([id]) };
    dispatch({ type: "replace", params: next });
    play(renderCached(next));
  };
  const resetSection = (id: SectionId) => {
    const next = { ...params };
    for (const d of PARAMS) if (d.section === id) next[d.key] = d.def;
    if (id === "mat") next.material = "none";
    if (id === "seq") next.melody = "";
    dispatch({ type: "replace", params: next });
  };

  const title = state.edited ? `${state.name} (edited)` : state.name;
  const fileName = state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sound";

  const downloadWav = () => {
    const url = URL.createObjectURL(encodeWav(samples));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(done);
    } catch {
      flash("Clipboard is blocked in this browser");
    }
  };

  const applyPaste = () => {
    let parsed: SoundParams | null = null;
    try {
      parsed = sanitize(JSON.parse(pasteText));
    } catch {
      // handled below
    }
    if (!parsed) {
      flash("That is not valid sound JSON");
      return;
    }
    dispatch({ type: "replace", params: parsed, name: "Imported sound" });
    play(renderCached(parsed));
    setPasteOpen(false);
    setPasteText("");
  };

  const persist = (next: SavedSound[]) => {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      flash("Could not write to browser storage");
    }
  };

  const saveCurrent = () => {
    const name = saveName.trim() || state.name;
    persist([{ id: Date.now().toString(36), name, params }, ...saved]);
    setSaveName("");
    setTab("saved");
    flash(`Saved "${name}"`);
  };

  // ----- keyboard -----
  useEffect(() => {
    const touch = () => {
      interactedRef.current = true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      touch();
      const el = e.target as HTMLElement;
      const typing = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range");
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && k === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod || e.altKey) {
        return;
      } else if (e.code === "Space" && el.tagName !== "BUTTON") {
        e.preventDefault();
        play(samples);
      } else if (k === "r") randomize();
      else if (k === "m") mutate();
    };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, play, samples, randomize, mutate]);

  // ----- derived -----
  const q = query.trim().toLowerCase();
  const visiblePresets = useMemo(
    () =>
      PRESETS.filter(
        (p) =>
          (style === "all" || p.style === style) &&
          (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)),
      ),
    [q, style],
  );
  const lockedCount = Object.values(locks).filter(Boolean).length;
  const seconds = samples.length / SAMPLE_RATE;

  const presetButton = (p: Preset) => {
    const current = !state.edited && state.name === p.name;
    return (
      <button
        key={p.name}
        type="button"
        onClick={() => load(p.params, p.name)}
        className={`truncate rounded border px-2 py-1.5 text-left text-[13px] transition ${
          current ? "border-amp/60 bg-amp/10 text-amp" : "border-transparent bg-raise text-ink hover:border-faint"
        }`}
      >
        {p.name}
      </button>
    );
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1560px] flex-col lg:h-screen lg:flex-row">
      {/* ---------- library ---------- */}
      <aside className="flex shrink-0 flex-col border-line lg:h-screen lg:w-[19rem] lg:border-r">
        <div className="flex items-baseline gap-2 px-4 pt-4 pb-3">
          <h1 className="text-lg font-semibold tracking-tight">
            SFX <span className="text-amp">Forge</span>
          </h1>
          <span className="text-xs text-mute">game &amp; UI sound effects</span>
        </div>
        {nav}

        <div className="flex gap-1 px-4">
          {(["presets", "saved"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-2 py-1.5 text-[13px] transition ${
                tab === t ? "bg-raise text-ink" : "text-mute hover:text-ink"
              }`}
            >
              {t === "presets" ? `Presets · ${PRESETS.length}` : `My sounds · ${saved.length}`}
            </button>
          ))}
        </div>

        {tab === "presets" ? (
          <>
            <div className="flex gap-1 px-4 pt-3">
              {(["all", "modern", "foley", "classic"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  aria-pressed={style === s}
                  title={STYLE_HINTS[s]}
                  className={`flex-1 rounded border px-1 py-1 text-xs capitalize transition ${
                    style === s ? "border-amp/60 bg-amp/10 text-amp" : "border-line text-mute hover:border-faint hover:text-ink"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="px-4 pt-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search presets…"
                className="h-8 w-full rounded-md border border-line bg-panel px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-faint"
              />
            </div>
            <div className="scroll-thin max-h-72 flex-1 overflow-y-auto px-4 pt-1 pb-4 lg:max-h-none">
              {CATEGORIES.map((cat) => {
                const items = visiblePresets.filter((p) => p.category === cat);
                if (!items.length) return null;
                return (
                  <section key={cat}>
                    <h2 className="pt-3 pb-1.5 text-[11px] font-medium tracking-wider text-mute uppercase">{cat}</h2>
                    <div className="grid grid-cols-2 gap-1">{items.map(presetButton)}</div>
                  </section>
                );
              })}
              {!visiblePresets.length && <p className="pt-4 text-[13px] text-mute">No preset matches{query ? ` “${query}”` : ""} here.</p>}
            </div>
          </>
        ) : (
          <div className="scroll-thin max-h-72 flex-1 overflow-y-auto px-4 pt-3 pb-4 lg:max-h-none">
            <div className="flex gap-1.5">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
                placeholder={state.name}
                aria-label="Name for the current sound"
                className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-faint"
              />
              <Btn onClick={saveCurrent}>Save current</Btn>
            </div>
            {saved.length === 0 ? (
              <p className="pt-4 text-[13px] leading-relaxed text-mute">
                Sounds you save are kept in this browser. Name the current sound above to start a collection.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 pt-3">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-center gap-1 rounded bg-raise pr-1">
                    <button
                      type="button"
                      onClick={() => load(s.params, s.name)}
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[13px] hover:text-amp"
                    >
                      {s.name}
                    </button>
                    <IconBtn d={ICON.close} title={`Remove ${s.name}`} onClick={() => persist(saved.filter((x) => x.id !== s.id))} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>

      {/* ---------- editor ---------- */}
      <main className="scroll-thin min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-line bg-bg/95 px-4 pt-4 pb-3 backdrop-blur lg:px-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate text-[15px] font-medium">{title}</h2>
            <span className="shrink-0 font-mono text-xs text-mute tabular-nums">
              {seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(2)} s`} · {(samples.length * 2 / 1024).toFixed(0)} KB wav
            </span>
          </div>

          <button
            type="button"
            onClick={() => play(samples)}
            title="Play (Space)"
            aria-label="Play sound"
            className="mt-2 block h-24 w-full cursor-pointer rounded-md border border-line bg-panel transition hover:border-faint"
          >
            <Waveform samples={samples} getProgress={getProgress} />
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Btn primary onClick={() => play(samples)} title="Play (Space)">
              <Icon d={ICON.play} className="fill-current" /> Play
            </Btn>
            <Btn onClick={mutate} title="Nudge every active slider a little (M)">
              Mutate
            </Btn>
            <Btn onClick={randomize} title="Roll a brand new sound (R)">
              <Icon d={ICON.dice} /> Randomize
            </Btn>
            <Btn onClick={resetAll} title="Back to a plain beep">
              Reset
            </Btn>
            <Btn onClick={() => dispatch({ type: "undo" })} disabled={!state.past.length} title="Undo (Ctrl+Z)">
              <Icon d={ICON.undo} />
            </Btn>
            <Btn onClick={() => dispatch({ type: "redo" })} disabled={!state.future.length} title="Redo (Ctrl+Shift+Z)">
              <Icon d={ICON.redo} />
            </Btn>
            <Btn onClick={() => setAutoplay((v) => !v)} active={autoplay} title="Play automatically after every change">
              Autoplay {autoplay ? "on" : "off"}
            </Btn>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <div className="w-56">
                <ParamSlider def={PARAM_BY_KEY.volume} value={params.volume} onChange={(v) => set("volume", v)} />
              </div>
              <Btn onClick={() => copy(JSON.stringify(compact(params), null, 2), "JSON copied")} title="Copy this sound as JSON">
                Copy JSON
              </Btn>
              <Btn onClick={() => setPasteOpen((v) => !v)} active={pasteOpen} title="Load a sound from JSON">
                Paste JSON
              </Btn>
              <Btn
                onClick={() => copy(`${location.origin}${location.pathname}#s=${encodeShare(params)}`, "Link copied")}
                title="Copy a link that opens this exact sound"
              >
                Copy link
              </Btn>
              <Btn primary onClick={downloadWav} title="16-bit mono WAV, 44.1 kHz">
                Download WAV
              </Btn>
            </div>
          </div>

          {pasteOpen && (
            <div className="mt-3 flex gap-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder='{ "wave": "square", "frequency": 988, … }'
                rows={3}
                className="scroll-thin min-w-0 flex-1 rounded-md border border-line bg-panel p-2 font-mono text-xs outline-none placeholder:text-faint focus:border-faint"
              />
              <Btn onClick={applyPaste} disabled={!pasteText.trim()}>
                Load
              </Btn>
            </div>
          )}

          <p className="mt-2 h-4 text-xs text-mute">
            {toast ||
              (lockedCount
                ? `${lockedCount} section${lockedCount > 1 ? "s" : ""} locked — presets, Randomize, Mutate and Reset leave ${lockedCount > 1 ? "them" : "it"} alone.`
                : "Lock a section to keep it while you load other presets or randomize — that is how you mix and match.")}
          </p>
        </div>

        <div className="grid gap-3 p-4 lg:px-6 xl:grid-cols-2 2xl:grid-cols-3">
          {SECTIONS.map((sec) => {
            const locked = locks[sec.id];
            return (
              <section key={sec.id} className={`rounded-lg border bg-panel p-3 ${locked ? "border-amp/50" : "border-line"}`}>
                <header className="mb-2 flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold">{sec.title}</h3>
                  <span className="truncate text-xs text-faint">{sec.blurb}</span>
                  <div className="ml-auto flex items-center gap-0.5">
                    <IconBtn d={ICON.dice} title={`Randomize ${sec.title.toLowerCase()} only`} onClick={() => randomizeSection(sec.id)} />
                    <IconBtn d={ICON.reset} title={`Reset ${sec.title.toLowerCase()}`} onClick={() => resetSection(sec.id)} />
                    <IconBtn
                      d={locked ? ICON.locked : ICON.unlocked}
                      title={locked ? `Unlock ${sec.title.toLowerCase()}` : `Lock ${sec.title.toLowerCase()}`}
                      active={locked}
                      onClick={() => setLocks((l) => ({ ...l, [sec.id]: !l[sec.id] }))}
                    />
                  </div>
                </header>

                {sec.id === "osc" && (
                  <div className="mb-2 flex gap-1">
                    {WAVES.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => set("wave", w)}
                        aria-pressed={params.wave === w}
                        className={`flex flex-1 flex-col items-center gap-1 rounded border py-1.5 text-[11px] capitalize transition ${
                          params.wave === w ? "border-amp/60 bg-amp/10 text-amp" : "border-line text-mute hover:border-faint hover:text-ink"
                        }`}
                      >
                        <svg viewBox="0 0 24 14" className="h-3.5 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d={WAVE_PATHS[w]} />
                        </svg>
                        {w}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => set("seed", randomSeed())}
                      title="Roll a different noise pattern"
                      className="rounded border border-line px-2 text-[11px] text-mute transition hover:border-faint hover:text-ink"
                    >
                      New
                      <br />
                      seed
                    </button>
                  </div>
                )}

                {sec.id === "seq" && (
                  <div className="mb-2">
                    <input
                      value={params.melody}
                      onChange={(e) => set("melody", cleanMelody(e.target.value))}
                      placeholder="e.g. 0 4 7 12"
                      aria-label="Melody"
                      title="Semitones from the base pitch, separated by spaces. Use - for a rest and + for notes played together, e.g. 0 4 - 7+12"
                      spellCheck={false}
                      className="h-8 w-full rounded-md border border-line bg-bg px-2.5 font-mono text-[13px] outline-none placeholder:text-faint focus:border-faint"
                    />
                    <div className="mt-1 grid grid-cols-4 gap-1">
                      {MELODY_PATTERNS.map((m) => (
                        <button
                          key={m.label}
                          type="button"
                          onClick={() => set("melody", m.melody)}
                          aria-pressed={params.melody.trim() === m.melody}
                          title={m.melody || "Play the sound once"}
                          className={`truncate rounded border px-1 py-1 text-[11px] transition ${
                            params.melody.trim() === m.melody ? "border-amp/60 bg-amp/10 text-amp" : "border-line text-mute hover:border-faint hover:text-ink"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-faint">
                      Semitones from the base pitch. Space between steps, <span className="font-mono">-</span> for a rest,{" "}
                      <span className="font-mono">+</span> for a chord.
                    </p>
                  </div>
                )}

                {sec.id === "mat" && (
                  <div className="mb-2 grid grid-cols-4 gap-1">
                    {MATERIAL_IDS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set("material", m)}
                        aria-pressed={params.material === m}
                        className={`truncate rounded border px-1 py-1 text-[11px] transition ${
                          params.material === m ? "border-amp/60 bg-amp/10 text-amp" : "border-line text-mute hover:border-faint hover:text-ink"
                        }`}
                      >
                        {materialLabel(m)}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-0.5">
                  {PARAMS.filter((d) => d.section === sec.id).map((d) => (
                    <ParamSlider
                      key={d.key}
                      def={d}
                      value={params[d.key]}
                      disabled={
                        (d.onlyWave && params.wave !== d.onlyWave) ||
                        (params.wave === "noise" && NOISE_IGNORES.has(d.key)) ||
                        (d.section === "mat" && materialIgnores(params.material, d.key)) ||
                        (d.key === "stepTime" && !/\s/.test(params.melody.trim()))
                      }
                      onChange={(v) => set(d.key, v)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

const STYLE_HINTS: Record<PresetStyle | "all", string> = {
  all: "Every preset",
  modern: "Clean tones, soft attacks, reverb",
  foley: "Hits, footsteps and textures on real materials",
  classic: "Chip-tune, 8-bit flavour",
};

/** Ring only matters for materials that resonate, Grain density only for loose ones. */
function materialIgnores(m: Material, key: string): boolean {
  if (m === "none") return true;
  const def: { modes: unknown[]; grain?: unknown } = MATERIALS[m];
  return (key === "matRing" && !def.modes.length) || (key === "matDensity" && !def.grain);
}

/** Tone-shaping parameters that pure noise has no use for. */
const NOISE_IGNORES = new Set<string>(["osc2Mix", "osc2Detune", "fmDepth", "fmRatio", "noiseMix"]);
