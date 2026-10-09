import { MATERIAL_IDS, type Material } from "./materials";
import { MELODY_PATTERNS, cleanMelody } from "./melody";

export type Wave = "sine" | "triangle" | "saw" | "square" | "noise";
export const WAVES: Wave[] = ["sine", "triangle", "saw", "square", "noise"];

export type SectionId = "osc" | "pitch" | "seq" | "env" | "mat" | "filter" | "fx" | "space";

export interface SoundParams {
  wave: Wave;
  seed: number;
  material: Material;
  /** Note sequence; see melody.ts. Empty plays the sound once. */
  melody: string;
  // oscillator
  frequency: number;
  duty: number;
  dutySweep: number;
  osc2Mix: number;
  osc2Detune: number;
  fmDepth: number;
  fmRatio: number;
  noiseMix: number;
  // pitch motion
  slide: number;
  slideAccel: number;
  jump1: number;
  jump1Time: number;
  jump2: number;
  jump2Time: number;
  vibDepth: number;
  vibRate: number;
  repeatRate: number;
  // sequence
  stepTime: number;
  // envelope
  attack: number;
  sustain: number;
  punch: number;
  decay: number;
  tremDepth: number;
  tremRate: number;
  // material
  matAmount: number;
  matSize: number;
  matRing: number;
  matDensity: number;
  // filter
  lpCutoff: number;
  lpSweep: number;
  lpResonance: number;
  hpCutoff: number;
  hpSweep: number;
  // grit
  drive: number;
  bits: number;
  crushRate: number;
  flangerOffset: number;
  flangerSweep: number;
  // space
  echoTime: number;
  echoFeedback: number;
  echoMix: number;
  reverbSize: number;
  reverbMix: number;
  // output
  volume: number;
}

export type NumKey = Exclude<keyof SoundParams, "wave" | "seed" | "material" | "melody">;

/** lin: straight; log: exponential (frequencies); pow: fine control near min (times); sym: fine control around zero. */
type Curve = "lin" | "log" | "pow" | "sym";

export interface ParamDef {
  key: NumKey;
  section: SectionId | "out";
  label: string;
  min: number;
  max: number;
  def: number;
  curve: Curve;
  step?: number;
  fmt: (v: number) => string;
  /** Randomizer: [chance of being active, low, high]. Inactive params fall back to `def`. */
  rnd?: [number, number, number];
  /** Only meaningful for this waveform; dimmed otherwise. */
  onlyWave?: Wave;
  hint?: string;
}

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${v.toFixed(v < 100 ? 1 : 0)} Hz`);
const sec = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (digits: number, unit: string) => (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;
const off = (f: (v: number) => string) => (v: number) => (v === 0 ? "off" : f(v));

export const PARAMS: ParamDef[] = [
  { key: "frequency", section: "osc", label: "Frequency", min: 20, max: 8000, def: 440, curve: "log", fmt: hz, rnd: [1, 80, 2000], hint: "Base pitch. For noise, lower values sound rumblier." },
  { key: "duty", section: "osc", label: "Pulse width", min: 0.02, max: 0.98, def: 0.5, curve: "lin", fmt: pct, rnd: [0.7, 0.1, 0.9], onlyWave: "square" },
  { key: "dutySweep", section: "osc", label: "Width sweep", min: -2, max: 2, def: 0, curve: "sym", fmt: signed(2, " /s"), rnd: [0.15, -1, 1], onlyWave: "square" },
  { key: "osc2Mix", section: "osc", label: "Layer mix", min: 0, max: 1, def: 0, curve: "lin", fmt: off(pct), rnd: [0.25, 0.2, 0.8], hint: "Adds a second, detuned copy of the oscillator." },
  { key: "osc2Detune", section: "osc", label: "Layer detune", min: -24, max: 24, def: 12, curve: "lin", step: 0.1, fmt: signed(1, " st"), rnd: [1, -12, 12] },
  { key: "fmDepth", section: "osc", label: "FM depth", min: 0, max: 10, def: 0, curve: "pow", fmt: off((v) => v.toFixed(2)), rnd: [0.25, 0.3, 5], hint: "Frequency modulation — bells, metal, zaps." },
  { key: "fmRatio", section: "osc", label: "FM ratio", min: 0.25, max: 12, def: 2, curve: "log", fmt: (v) => `×${v.toFixed(2)}`, rnd: [1, 0.5, 8] },
  { key: "noiseMix", section: "osc", label: "Noise blend", min: 0, max: 1, def: 0, curve: "lin", fmt: off(pct), rnd: [0.15, 0.1, 0.7] },

  { key: "slide", section: "pitch", label: "Slide", min: -8, max: 8, def: 0, curve: "sym", fmt: signed(2, " oct/s"), rnd: [0.6, -5, 5] },
  { key: "slideAccel", section: "pitch", label: "Slide accel", min: -16, max: 16, def: 0, curve: "sym", fmt: signed(2, " oct/s²"), rnd: [0.15, -4, 4] },
  { key: "jump1", section: "pitch", label: "Jump 1", min: -24, max: 24, def: 0, curve: "lin", step: 1, fmt: off(signed(0, " st")), rnd: [0.25, -12, 12], hint: "Instant pitch change, relative to the base pitch." },
  { key: "jump1Time", section: "pitch", label: "Jump 1 at", min: 0, max: 1, def: 0.08, curve: "pow", fmt: sec, rnd: [1, 0.03, 0.2] },
  { key: "jump2", section: "pitch", label: "Jump 2", min: -24, max: 24, def: 0, curve: "lin", step: 1, fmt: off(signed(0, " st")), rnd: [0.1, -12, 19] },
  { key: "jump2Time", section: "pitch", label: "Jump 2 at", min: 0, max: 1, def: 0.16, curve: "pow", fmt: sec, rnd: [1, 0.1, 0.35] },
  { key: "vibDepth", section: "pitch", label: "Vibrato depth", min: 0, max: 12, def: 0, curve: "pow", fmt: off((v) => `${v.toFixed(2)} st`), rnd: [0.25, 0.1, 3] },
  { key: "vibRate", section: "pitch", label: "Vibrato rate", min: 0.5, max: 80, def: 8, curve: "log", fmt: hz, rnd: [1, 3, 40] },
  { key: "repeatRate", section: "pitch", label: "Retrigger", min: 0, max: 40, def: 0, curve: "pow", fmt: off(hz), rnd: [0.1, 4, 25], hint: "Restarts the pitch motion this many times per second." },

  { key: "stepTime", section: "seq", label: "Step time", min: 0.02, max: 0.8, def: 0.12, curve: "pow", fmt: sec, rnd: [1, 0.05, 0.2], hint: "Time from one note to the next. Notes longer than this overlap." },

  { key: "attack", section: "env", label: "Attack", min: 0, max: 1, def: 0, curve: "pow", fmt: sec, rnd: [0.2, 0.005, 0.2] },
  { key: "sustain", section: "env", label: "Sustain", min: 0, max: 2, def: 0.1, curve: "pow", fmt: sec, rnd: [1, 0, 0.35] },
  { key: "punch", section: "env", label: "Punch", min: 0, max: 1, def: 0, curve: "lin", fmt: off(pct), rnd: [0.4, 0.2, 0.8], hint: "Extra loudness at the start of the sustain." },
  { key: "decay", section: "env", label: "Decay", min: 0, max: 3, def: 0.2, curve: "pow", fmt: sec, rnd: [1, 0.04, 0.7] },
  { key: "tremDepth", section: "env", label: "Tremolo depth", min: 0, max: 1, def: 0, curve: "lin", fmt: off(pct), rnd: [0.15, 0.3, 1] },
  { key: "tremRate", section: "env", label: "Tremolo rate", min: 0.5, max: 80, def: 10, curve: "log", fmt: hz, rnd: [1, 4, 50] },

  { key: "matAmount", section: "mat", label: "Amount", min: 0, max: 1, def: 1, curve: "lin", fmt: pct, rnd: [1, 0.6, 1], hint: "How much of the sound goes through the material. Lower it to let the raw source back in." },
  { key: "matSize", section: "mat", label: "Size", min: 0.25, max: 4, def: 1, curve: "log", fmt: (v) => `×${v.toFixed(2)}`, rnd: [1, 0.5, 2], hint: "Bigger objects sound lower: a twig versus a log, a pebble versus a boulder." },
  { key: "matRing", section: "mat", label: "Ring", min: 0, max: 1, def: 0.5, curve: "lin", fmt: pct, rnd: [1, 0.3, 0.7], hint: "How long solid materials keep resonating. Low is damped, high is free-hanging." },
  { key: "matDensity", section: "mat", label: "Grain density", min: 0, max: 1, def: 0.5, curve: "lin", fmt: pct, rnd: [1, 0.3, 0.7], hint: "For loose materials: sparse crackle to dense hiss." },

  { key: "lpCutoff", section: "filter", label: "Low-pass", min: 40, max: 20000, def: 20000, curve: "log", fmt: hz, rnd: [0.35, 300, 8000] },
  { key: "lpSweep", section: "filter", label: "LP sweep", min: -8, max: 8, def: 0, curve: "sym", fmt: signed(2, " oct/s"), rnd: [0.3, -4, 4] },
  { key: "lpResonance", section: "filter", label: "Resonance", min: 0, max: 1, def: 0, curve: "lin", fmt: off(pct), rnd: [0.3, 0.1, 0.7] },
  { key: "hpCutoff", section: "filter", label: "High-pass", min: 20, max: 10000, def: 20, curve: "log", fmt: hz, rnd: [0.2, 100, 2000] },
  { key: "hpSweep", section: "filter", label: "HP sweep", min: -8, max: 8, def: 0, curve: "sym", fmt: signed(2, " oct/s"), rnd: [0.1, -3, 3] },

  { key: "drive", section: "fx", label: "Distortion", min: 0, max: 1, def: 0, curve: "lin", fmt: off(pct), rnd: [0.2, 0.2, 0.8] },
  { key: "bits", section: "fx", label: "Bit depth", min: 1, max: 16, def: 16, curve: "lin", step: 1, fmt: (v) => `${v} bit`, rnd: [0.15, 3, 8] },
  { key: "crushRate", section: "fx", label: "Sample rate", min: 500, max: 44100, def: 44100, curve: "log", fmt: hz, rnd: [0.15, 2000, 12000] },
  { key: "flangerOffset", section: "fx", label: "Flanger", min: 0, max: 20, def: 0, curve: "pow", fmt: off((v) => `${v.toFixed(1)} ms`), rnd: [0.15, 1, 10] },
  { key: "flangerSweep", section: "fx", label: "Flanger sweep", min: -40, max: 40, def: 0, curve: "sym", fmt: signed(1, " ms/s"), rnd: [0.15, -20, 20] },

  { key: "echoMix", section: "space", label: "Echo mix", min: 0, max: 1, def: 0, curve: "lin", fmt: off(pct), rnd: [0.2, 0.15, 0.6] },
  { key: "echoTime", section: "space", label: "Echo time", min: 0.02, max: 0.6, def: 0.15, curve: "lin", fmt: sec, rnd: [1, 0.06, 0.3] },
  { key: "echoFeedback", section: "space", label: "Echo feedback", min: 0, max: 0.9, def: 0.35, curve: "lin", fmt: pct, rnd: [1, 0.1, 0.6] },
  { key: "reverbMix", section: "space", label: "Reverb mix", min: 0, max: 1, def: 0, curve: "lin", fmt: off(pct), rnd: [0.25, 0.1, 0.5] },
  { key: "reverbSize", section: "space", label: "Reverb size", min: 0, max: 1, def: 0.5, curve: "lin", fmt: pct, rnd: [1, 0.2, 0.9] },

  { key: "volume", section: "out", label: "Volume", min: 0, max: 1, def: 0.8, curve: "lin", fmt: pct },
];

export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((d) => [d.key, d])) as Record<NumKey, ParamDef>;

export const SECTIONS: { id: SectionId; title: string; blurb: string }[] = [
  { id: "osc", title: "Oscillator", blurb: "The raw tone" },
  { id: "pitch", title: "Pitch motion", blurb: "Slides, jumps, wobble" },
  { id: "seq", title: "Sequence", blurb: "Several notes in a row" },
  { id: "env", title: "Envelope", blurb: "Loudness over time" },
  { id: "mat", title: "Material", blurb: "What it hits or moves through" },
  { id: "filter", title: "Filter", blurb: "Brightness" },
  { id: "fx", title: "Grit", blurb: "Crunch and lo-fi" },
  { id: "space", title: "Space", blurb: "Echo and reverb" },
];

export const DEFAULTS: SoundParams = {
  wave: "square",
  seed: 1,
  material: "none",
  melody: "",
  ...(Object.fromEntries(PARAMS.map((d) => [d.key, d.def])) as Record<NumKey, number>),
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Parameter value -> slider position in 0..1. */
export function toNorm(d: ParamDef, v: number): number {
  v = clamp(v, d.min, d.max);
  switch (d.curve) {
    case "log":
      return Math.log(v / d.min) / Math.log(d.max / d.min);
    case "pow":
      return Math.sqrt((v - d.min) / (d.max - d.min));
    case "sym":
      return (Math.sign(v) * Math.sqrt(Math.abs(v) / d.max) + 1) / 2;
    default:
      return (v - d.min) / (d.max - d.min);
  }
}

/** Slider position in 0..1 -> parameter value. */
export function fromNorm(d: ParamDef, p: number): number {
  p = clamp(p, 0, 1);
  let v: number;
  switch (d.curve) {
    case "log":
      v = d.min * Math.pow(d.max / d.min, p);
      break;
    case "pow":
      v = d.min + (d.max - d.min) * p * p;
      break;
    case "sym": {
      const x = 2 * p - 1;
      v = Math.sign(x) * x * x * d.max;
      break;
    }
    default:
      v = d.min + (d.max - d.min) * p;
  }
  if (d.step) v = Math.round(v / d.step) * d.step;
  return clamp(Number(v.toPrecision(6)), d.min, d.max);
}

export type Locks = Record<SectionId, boolean>;
export const NO_LOCKS: Locks = { osc: false, pitch: false, seq: false, env: false, mat: false, filter: false, fx: false, space: false };

/** Takes unlocked sections from `source`, keeps locked sections (and volume) from `current`. */
export function mergeUnlocked(current: SoundParams, source: SoundParams, locks: Locks): SoundParams {
  const out: SoundParams = { ...current };
  if (!locks.osc) {
    out.wave = source.wave;
    out.seed = source.seed;
  }
  if (!locks.mat) out.material = source.material;
  if (!locks.seq) out.melody = source.melody;
  for (const d of PARAMS) {
    if (d.section !== "out" && !locks[d.section]) out[d.key] = source[d.key];
  }
  return out;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/** A fresh random sound; most effects stay off so results are usable more often than not. */
export function randomParams(sections?: SectionId[]): Partial<SoundParams> {
  const out: Partial<SoundParams> = {};
  const wants = (s: SectionId | "out") => s !== "out" && (!sections || sections.includes(s));
  if (wants("osc")) {
    out.wave = WAVES[Math.floor(Math.random() * WAVES.length)];
    out.seed = randomSeed();
  }
  if (wants("mat")) {
    // Rolling the whole sound only sometimes adds a material; rolling this section alone always does.
    const use = sections ? true : Math.random() < 0.3;
    out.material = use ? MATERIAL_IDS[1 + Math.floor(Math.random() * (MATERIAL_IDS.length - 1))] : "none";
  }
  if (wants("seq")) {
    // Same idea: a full roll is usually a single hit, rolling this section always gives a pattern.
    const use = sections ? true : Math.random() < 0.12;
    out.melody = use ? MELODY_PATTERNS[1 + Math.floor(Math.random() * (MELODY_PATTERNS.length - 1))].melody : "";
  }
  for (const d of PARAMS) {
    if (!wants(d.section) || !d.rnd) continue;
    const [chance, lo, hi] = d.rnd;
    if (Math.random() >= chance) {
      out[d.key] = d.def;
      continue;
    }
    const a = toNorm(d, lo);
    const b = toNorm(d, hi);
    out[d.key] = fromNorm(d, a + (b - a) * Math.random());
  }
  return out;
}

/** Nudges every parameter that is in use; occasionally wakes up one that is not. */
export function mutateParams(p: SoundParams, amount = 0.07): SoundParams {
  const out = { ...p };
  for (const d of PARAMS) {
    if (d.section === "out") continue;
    if (p[d.key] === d.def && Math.random() > 0.08) continue;
    const n = toNorm(d, p[d.key]) + (Math.random() * 2 - 1) * amount;
    out[d.key] = fromNorm(d, n);
  }
  return out;
}

/** Validates untrusted input (pasted JSON, share links) into a full parameter set. */
export function sanitize(input: unknown): SoundParams | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: SoundParams = { ...DEFAULTS };
  if (typeof src.wave === "string" && (WAVES as string[]).includes(src.wave)) out.wave = src.wave as Wave;
  if (typeof src.seed === "number" && Number.isFinite(src.seed)) out.seed = Math.floor(Math.abs(src.seed)) || 1;
  if (typeof src.material === "string" && (MATERIAL_IDS as string[]).includes(src.material)) out.material = src.material as Material;
  if (typeof src.melody === "string") out.melody = cleanMelody(src.melody);
  for (const d of PARAMS) {
    const v = src[d.key];
    if (typeof v === "number" && Number.isFinite(v)) out[d.key] = clamp(v, d.min, d.max);
  }
  return out;
}

/** Only the values that differ from the defaults — keeps JSON and share links short. */
export function compact(p: SoundParams): Partial<SoundParams> {
  const out: Partial<SoundParams> = { wave: p.wave };
  if (p.seed !== DEFAULTS.seed) out.seed = p.seed;
  if (p.material !== "none") out.material = p.material;
  if (p.melody.trim()) out.melody = p.melody;
  for (const d of PARAMS) if (p[d.key] !== d.def) out[d.key] = p[d.key];
  return out;
}
