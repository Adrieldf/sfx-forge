import { mulberry32 } from "../sfx/synth";
import { PATCHES, type PatchId } from "./patches";
import { MODES, blendStyles, type BassPattern, type ChordPattern, type DrumPattern, type ModeId, type StyleDef, type StyleId } from "./styles";

/**
 * Writes a piece of music as a list of timed notes. Nothing here makes sound; render.ts
 * plays the score. The same options always give the same piece.
 *
 * What keeps a piece from sounding like one bar on repeat:
 *   - it is built from sections (A, B, a quieter break C), each with its own chords and tune;
 *   - a tune is a two-bar motif that is stated, answered, contrasted and resolved, and
 *     every return of a section keeps the motif but writes new answers to it;
 *   - each section has an energy level that decides which instruments play, so the
 *     arrangement rises and falls;
 *   - drums vary bar to bar and play a fill into every new section.
 */

export interface Layers {
  melody: boolean;
  chords: boolean;
  arp: boolean;
  bass: boolean;
  drums: boolean;
}
export const ALL_LAYERS: Layers = { melody: true, chords: true, arp: true, bass: true, drums: true };

export interface MusicOptions {
  /** One style, or up to three to blend. */
  styles: StyleId[];
  seconds: number;
  /** Ends exactly where it starts, with the reverb tail folded back to the top. */
  loop: boolean;
  seed: number;
  layers: Layers;
  /** A hand-made arrangement. It sets the length itself, so `seconds` is ignored. */
  form?: Form;
  /** An exact tempo. The length then rounds to whole bars at that tempo instead of the tempo bending. */
  bpm?: number;
  /** Key note, 0 = C … 11 = B, and scale. Left out, the style decides. */
  key?: number;
  mode?: ModeId;
  /** Instruments chosen by hand; anything left out is picked by the style. */
  instruments?: Instruments;
  /** Volume of each layer, 1 = as mixed. */
  levels?: Partial<Record<keyof Layers, number>>;
  /** Changing a layer's number rewrites that layer and leaves the others as they were. */
  rerolls?: Partial<Record<keyof Layers, number>>;
  /** Each −1..1 around the style's own setting. */
  mood?: Mood;
  /** Writes a short jingle in the track's key and instruments instead of the track. */
  stinger?: StingerKind;
}

export interface Instruments {
  lead?: PatchId;
  chords?: PatchId;
  arp?: PatchId;
  bass?: PatchId;
  drums?: DrumPattern;
}
export interface Mood {
  /** Darker and softer, or brighter and sharper. */
  bright?: number;
  /** How many notes the tune and arpeggio play. */
  busy?: number;
  /** Dry and close, or washed in reverb and echo. */
  space?: number;
}
export type StingerKind = "victory" | "defeat" | "levelup";
export const STINGERS: Record<StingerKind, string> = { victory: "Victory", defeat: "Defeat", levelup: "Level up" };

export type SectionKind = "intro" | "a" | "b" | "c" | "outro";
export interface FormSection {
  kind: SectionKind;
  /** An even number of bars: tunes are written in two-bar phrases. */
  bars: number;
  /** 0..1: how many instruments play, and how hard. Left out, the composer decides. */
  energy?: number;
  /** Key change for this section, in semitones. */
  shift?: number;
}
export interface Form {
  bpm: number;
  sections: FormSection[];
}
export const SECTION_LABELS: Record<SectionKind, string> = { intro: "Intro", a: "Theme A", b: "Theme B", c: "Break", outro: "Outro" };
export const MIN_SECTION_BARS = 2;
export const MAX_SECTION_BARS = 16;

export type DrumKind = "kick" | "snare" | "clap" | "rim" | "hat" | "ohat" | "shaker" | "tomh" | "tomm" | "toml" | "crash" | "congah" | "congal" | "clave";
export type Role = "lead" | "answer" | "chords" | "arp" | "bass";

export interface NoteEvent {
  t: number;
  d: number;
  midi: number;
  vel: number;
}
export interface Track {
  role: Role;
  patch: PatchId;
  gain: number;
  pan: number;
  reverb: number;
  delay: number;
  duck: number;
  notes: NoteEvent[];
}
export interface DrumEvent {
  t: number;
  kind: DrumKind;
  vel: number;
}
export interface SectionInfo {
  label: string;
  kind: SectionKind;
  start: number;
  end: number;
  bars: number;
  energy: number;
  shift: number;
}
export interface ScoreInfo {
  /** Style name, or the names of a blend joined with "+". */
  style: string;
  /** For a blend, which style supplied which part of the band. */
  recipe: string;
  bpm: number;
  key: string;
  bars: number;
  seconds: number;
  sections: SectionInfo[];
  /** Instrument names per layer, for display. */
  instruments: Record<keyof Layers, string[]>;
}
export interface Score extends ScoreInfo {
  loop: boolean;
  tracks: Track[];
  drums: DrumEvent[];
  /** Every kick, even when the drum layer is off, so the other layers still duck the same way. */
  kicks: DrumEvent[];
  /** Multiplier on every filter: above 1 is brighter. */
  brightness: number;
  drumTone: number;
  drumLevel: number;
  reverb: { size: number; mix: number };
  delay: { seconds: number; mix: number };
}

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** Per-role mix: level, stereo position, effect sends and how much the kick ducks it. */
const MIX: Record<Role, { gain: number; pan: number; reverb: number; delay: number; duck: number }> = {
  lead: { gain: 0.55, pan: 0.05, reverb: 0.3, delay: 1, duck: 0 },
  answer: { gain: 0.5, pan: -0.2, reverb: 0.35, delay: 1, duck: 0 },
  chords: { gain: 0.26, pan: 0.1, reverb: 0.35, delay: 0.1, duck: 1 },
  arp: { gain: 0.36, pan: -0.3, reverb: 0.35, delay: 0.8, duck: 0.4 },
  bass: { gain: 0.36, pan: 0, reverb: 0, delay: 0, duck: 0.5 },
};

// ---------- pattern tables ----------

/** Onsets inside one beat, in sixteenths. */
const CELLS = [[0], [0, 2], [], [2], [0, 3], [0, 2, 3], [0, 1, 2, 3], [0, 1, 2]];

// Bass notes as [step, length, tone]: Root, Fifth, Octave, Third, or an Approach to the next root.
const R = 0, F = 1, O = 2, T = 3, A = 4;
const BASS: Record<BassPattern, number[][][]> = {
  long: [[[0, 16, R]]],
  root: [
    [[0, 6, R], [6, 2, R], [8, 6, R], [14, 2, F]],
    [[0, 8, R], [8, 4, R], [12, 4, F]],
    [[0, 12, R], [12, 4, F]],
    [[0, 6, R], [8, 6, R]],
  ],
  synco: [
    [[0, 3, R], [3, 3, R], [6, 2, O], [10, 2, R], [12, 2, F], [14, 2, A]],
    [[0, 4, R], [6, 2, R], [8, 2, O], [11, 3, R], [14, 2, F]],
    [[0, 3, R], [4, 2, O], [7, 3, R], [10, 2, R], [12, 3, F]],
  ],
  octave8: [
    [R, R, O, R, R, R, O, R].map((t, i) => [i * 2, 2, t]),
    [R, O, R, O, R, O, R, O].map((t, i) => [i * 2, 2, t]),
    [R, R, R, R, R, R, R, F].map((t, i) => [i * 2, 2, t]),
  ],
  pedal16: [
    Array.from({ length: 16 }, (_, i) => [i, 1, i === 6 || i === 14 ? O : R]),
    Array.from({ length: 16 }, (_, i) => [i, 1, i === 3 || i === 11 ? O : i === 15 ? F : R]),
  ],
  walk: [
    [[0, 4, R], [4, 4, T], [8, 4, F], [12, 4, A]],
    [[0, 4, R], [4, 4, F], [8, 4, T], [12, 4, A]],
  ],
};

// Chord hits as [step, length].
const COMP = [
  [[0, 5], [6, 4], [12, 3]],
  [[0, 3], [3, 3], [8, 4], [14, 2]],
  [[0, 6], [10, 5]],
  [[0, 4], [7, 3], [10, 4]],
];
const DRIVE = [
  [[0, 1.5], [3, 1.5], [6, 1.5], [8, 1.5], [11, 1.5], [14, 1.5]],
  [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 1.2]),
  [[0, 2], [4, 1.5], [6, 1.5], [10, 1.5], [12, 2]],
];
const STRUM = [
  [[0, 7], [8, 6]],
  [[0, 5], [6, 2], [8, 4], [12, 4]],
  [[0, 6], [6, 4], [10, 6]],
];
/** Which chord note each eighth plays; 0 is the root an octave down. */
const BROKEN = [
  [0, 2, 1, 2, 3, 2, 1, 2],
  [0, 1, 2, 3, 2, 1, 2, 1],
  [0, 2, 3, 2, 0, 2, 3, 1],
];
const ARP_SHAPES = [
  [0, 1, 2, 3],
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 1],
  [4, 3, 2, 1],
  [0, 2, 4, 2],
];

interface Kit {
  name: string;
  kick: number[];
  snare: number[];
  snareKind: DrumKind;
  hat: number[];
  hatKind: DrumKind;
  open: number[];
  /** What plays the kick's part, when it is not a kick. */
  kickKind?: DrumKind;
  /** Where an extra kick may land on the looser bars. */
  extra: number[];
  /** Quiet kits get a two-note pickup instead of a full roll. */
  soft?: boolean;
}
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const SIXTEENTHS = Array.from({ length: 16 }, (_, i) => i);
const KITS: Record<Exclude<DrumPattern, "none">, Kit> = {
  four: { name: "Four-on-the-floor kit", kick: [0, 4, 8, 12], snare: [4, 12], snareKind: "clap", hat: EIGHTHS, hatKind: "hat", open: [6, 14], extra: [15, 7] },
  pop: { name: "Pop kit", kick: [0, 8, 10], snare: [4, 12], snareKind: "snare", hat: EIGHTHS, hatKind: "hat", open: [14], extra: [6, 14, 3] },
  lofi: { name: "Dusty boom-bap kit", kick: [0, 10], snare: [4, 12], snareKind: "snare", hat: EIGHTHS, hatKind: "hat", open: [], extra: [7, 14], soft: true },
  break: { name: "Breakbeat kit", kick: [0, 6, 10], snare: [4, 12], snareKind: "snare", hat: SIXTEENTHS, hatKind: "hat", open: [14], extra: [3, 14] },
  brush: { name: "Shaker and rim", kick: [0, 8], snare: [4, 12], snareKind: "rim", hat: EIGHTHS, hatKind: "shaker", open: [], extra: [10, 7], soft: true },
  march: { name: "Marching kit", kick: [0, 8], snare: [4, 12, 14], snareKind: "snare", hat: EIGHTHS, hatKind: "hat", open: [], extra: [6, 11] },
  heavy: { name: "Heavy kit", kick: [0, 3, 6, 8, 11, 14], snare: [4, 12], snareKind: "snare", hat: EIGHTHS, hatKind: "hat", open: [0, 8], extra: [2, 10] },
  chip: { name: "8-bit kit", kick: [0, 8, 10], snare: [4, 12], snareKind: "snare", hat: EIGHTHS, hatKind: "hat", open: [], extra: [6, 14] },
  hand: { name: "Hand percussion", kick: [0, 6, 10], kickKind: "congal", snare: [3, 7, 12, 14], snareKind: "congah", hat: EIGHTHS, hatKind: "shaker", open: [], extra: [15, 9], soft: true },
  half: { name: "Half-time kit", kick: [0, 10], snare: [8], snareKind: "rim", hat: [0, 4, 8, 12], hatKind: "shaker", open: [], extra: [6, 14], soft: true },
};

/** Drum kits by name, for the instrument picker. */
export const DRUM_CHOICES: [DrumPattern, string][] = [...(Object.keys(KITS) as (keyof typeof KITS)[]).map((id): [DrumPattern, string] => [id, KITS[id].name]), ["none", "No drums"]];

const PARTS: (keyof Layers)[] = ["melody", "chords", "arp", "bass", "drums"];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Keeps a hand-picked chord instrument playing in a way that suits it. */
function fitPattern(patch: PatchId, pattern: ChordPattern): ChordPattern {
  const p = PATCHES[patch];
  if (p.kind === "sub" && p.a >= 0.15) return "sustain"; // a slow pad cannot play short hits
  if (pattern !== "sustain") return pattern;
  if (p.kind === "pluck") return "strum"; // and a plucked string cannot hold a chord
  return p.kind === "fm" && p.s < 0.5 ? "comp" : pattern;
}

// ---------- composer ----------

interface Chord {
  deg: number;
  pcs: number[];
  /** Notes for the chord instrument, folded into one octave so chords glide into each other. */
  voicing: number[];
  bass: number;
  /** Natural pitch class the melody must raise over this chord (the major V of a minor key). */
  raise: number;
}
interface Motif {
  hits: { s: number; d: number }[];
  /** Movement along the melody scale from each note to the next. */
  deltas: number[];
}
type Letter = "A" | "B" | "C";
interface Section {
  /** Semitones this section is transposed by. */
  shift: number;
  kind: "intro" | "body" | "outro";
  letter: Letter;
  bar0: number;
  bars: number;
  energy: number;
  /** How many times this letter has been heard before. */
  variant: number;
  /** Last bar leans on the dominant, pulling into whatever follows. */
  turn: boolean;
}
interface Material {
  prog: number[];
  hr: number;
  density: number;
  motif: Motif;
  start: number;
  lead: PatchId;
  answer: PatchId;
  chords: [PatchId, ChordPattern];
  bass: number[][];
  variation: number;
  arp: PatchId;
  arpRate: number;
  arpShape: number[];
  arpOn: boolean;
  drums: DrumPattern;
}

const FORM = "AABACBABACBA";
const CHORD_LOW = 55;

export function compose(o: MusicOptions): Score {
  // Every layer draws its random numbers from a stream of its own, and from a fresh one in
  // each section. Re-rolling one layer, or moving one section, leaves everything else alone.
  let rnd = mulberry32(o.seed);
  const draw = (part: keyof Layers, key = 0) => {
    rnd = mulberry32(o.seed ^ Math.imul(0x9e3779b1, key + 1) ^ Math.imul(0x85ebca6b, PARTS.indexOf(part) + 1) ^ Math.imul(0xc2b2ae35, o.rerolls?.[part] ?? 0));
  };
  const blended = blendStyles(o.styles, rnd);
  const recipe = blended.recipe;
  const busy = clamp(o.mood?.busy ?? 0, -1, 1);
  const space = clamp(o.mood?.space ?? 0, -1, 1);
  const st: StyleDef = {
    ...blended.style,
    density: clamp(blended.style.density * (1 + 0.6 * busy), 0.12, 1),
    sixteenths: clamp(blended.style.sixteenths + (busy > 0 || blended.style.sixteenths > 0 ? 0.3 * busy : 0), 0, 0.85),
    arpChance: clamp(blended.style.arpChance + 0.35 * busy, 0, 1),
    reverb: { size: clamp(blended.style.reverb.size + 0.12 * space, 0.1, 0.97), mix: Math.min(0.7, blended.style.reverb.mix * Math.pow(2, 1.3 * space)) },
    delay: { steps: blended.style.delay.steps, mix: Math.min(0.5, blended.style.delay.mix * Math.pow(2, space)) },
  };
  const pick = <X,>(a: readonly X[]): X => a[Math.floor(rnd() * a.length)];
  const chance = (p: number) => rnd() < p;
  const weighted = (w: number[]) => {
    let x = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return i;
    return w.length - 1;
  };

  // ----- time -----
  const STINGER_BPM = { victory: 132, defeat: 84, levelup: 150 };
  const formBars = o.form?.sections.reduce((a, f) => a + f.bars, 0) ?? 0;
  const ringOut = o.stinger ? 2.5 : o.loop ? 0 : o.form ? 3 : Math.min(3, o.seconds * 0.2);
  const rolledTempo = st.bpm[0] + rnd() * (st.bpm[1] - st.bpm[0]);
  let bars: number;
  let musicLen: number;
  if (o.stinger) {
    // A stinger is written straight onto a two-bar grid further down.
    bars = 2;
    musicLen = (bars * 240) / STINGER_BPM[o.stinger];
  } else if (o.form) {
    bars = formBars;
    musicLen = (bars * 240) / o.form.bpm;
  } else if (o.bpm) {
    // An exact tempo: the length gives way, to the nearest phrase.
    const estimate = ((o.seconds - ringOut) * o.bpm) / 240;
    bars = estimate >= 15 ? Math.round(estimate / 4) * 4 : Math.max(2, Math.round(estimate / 2) * 2);
    musicLen = (bars * 240) / o.bpm;
  } else {
    // A tempo from the style, bent so that whole bars fill the length exactly.
    musicLen = o.seconds - ringOut;
    const estimate = (musicLen * rolledTempo) / 240;
    // Prefer a bar count in fours, then in twos, that keeps the tempo inside the style's range.
    const inRange = (b: number) => b >= 2 && (b * 240) / musicLen >= st.bpm[0] * 0.97 && (b * 240) / musicLen <= st.bpm[1] * 1.03;
    const near = (unit: number) => [0, 1, -1].map((k) => (Math.round(estimate / unit) + k) * unit).find(inRange) ?? 0;
    bars = near(4) || near(2) || Math.max(2, Math.round(estimate / 2) * 2);
  }
  const stepDur = musicLen / (bars * 16);
  const swing = [0, st.swing16, st.swing8, st.swing8 * 0.5 + st.swing16];
  const at = (step: number) => (step + swing[Math.floor(step) & 3]) * stepDur;

  // ----- harmony -----
  draw("chords");
  const rolledMode = pick(st.modes);
  const rolledTonic = Math.floor(rnd() * 12);
  const modeId = o.mode ?? rolledMode;
  const mode = MODES[modeId];
  const scale = mode.scale;
  const tonic = o.key ?? rolledTonic;
  const minorish = scale[2] === 3;
  const sevenths = scale.map(() => chance(st.sevenths));
  // The tune of a harmonic minor piece uses the natural seventh, except over chords that hold the raised one.
  const tuneScale = modeId === "harmonic" ? MODES.minor.scale : scale;
  const tunePcs = tuneScale.map((x) => (tonic + x) % 12);
  const fold = (pc: number, low: number) => low + ((((pc - low) % 12) + 12) % 12);

  const chordCache = new Map<number, Chord>();
  const chord = (deg: number, major = false): Chord => {
    const key = deg * 2 + (major ? 1 : 0);
    let c = chordCache.get(key);
    if (!c) {
      const tones = sevenths[deg] ? [0, 2, 4, 6] : [0, 2, 4];
      const pcs = tones.map((k) => (tonic + scale[(deg + k) % 7]) % 12);
      if (major && (pcs[1] - pcs[0] + 12) % 12 === 3) pcs[1] = (pcs[1] + 1) % 12;
      const sharp = pcs.find((pc) => !tunePcs.includes(pc));
      const raise = sharp === undefined ? -1 : (sharp + 11) % 12;
      c = { deg, pcs, voicing: pcs.map((pc) => fold(pc, CHORD_LOW)).sort((a, b) => a - b), bass: fold(pcs[0], 31), raise };
      chordCache.set(key, c);
    }
    return c;
  };
  const dominant = () => chord(mode.dom, modeId === "minor");

  // ----- melody scale -----
  const degrees = st.pentatonic ? (minorish ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5]) : [0, 1, 2, 3, 4, 5, 6];
  const melodyPcs = new Set(degrees.map((d) => tunePcs[d]));
  const ladder: number[] = [];
  for (let m = 48; m <= 98; m++) if (melodyPcs.has(m % 12)) ladder.push(m);
  const rung = (pitch: number) => {
    let best = 0;
    for (let i = 1; i < ladder.length; i++) if (Math.abs(ladder[i] - pitch) < Math.abs(ladder[best] - pitch)) best = i;
    return best;
  };
  const centre = rung(st.leadCentre);
  const lo = rung(st.leadCentre - 9);
  const hi = rung(st.leadCentre + 10);
  const nearestIn = (pitch: number, pcs: number[]) => {
    for (let d = 0; d < 12; d++) {
      if (pcs.includes((pitch - d + 120) % 12)) return pitch - d;
      if (pcs.includes((pitch + d) % 12)) return pitch + d;
    }
    return pitch;
  };

  // ----- motifs -----
  const rhythmBar = (density: number): number[] => {
    const s16 = st.sixteenths;
    const w = [1.2 - density * 0.5, 0.5 + density, Math.max(0.1, 0.8 - density * 0.7), 0.35, s16 * 1.2, s16 * 1.2, s16 * 0.8, s16 * 0.5];
    const out: number[] = [];
    for (let beat = 0; beat < 4; beat++) {
      const cell = CELLS[weighted(w)];
      for (const x of beat === 0 && !cell.length ? [0] : cell) out.push(beat * 4 + x);
    }
    return out;
  };
  const rollDeltas = (n: number, from = 0, into: number[] = []): number[] => {
    let prev = from ? into[from - 1] : 0;
    for (let k = from; k < n; k++) {
      let d = 0;
      if (k > 0) {
        const r = rnd();
        if (Math.abs(prev) >= 2 && r < 0.7) d = -Math.sign(prev); // step back after a leap
        else if (Math.abs(prev) === 1 && r < 0.45) d = prev; // keep running in a line
        else {
          const q = rnd();
          d = q < 0.3 ? 1 : q < 0.6 ? -1 : q < 0.7 ? 0 : q < 0.8 ? 2 : q < 0.9 ? -2 : q < 0.95 ? 3 : -3;
        }
      }
      into[k] = prev = d;
    }
    return into;
  };
  /** Two bars: a rhythm, usually echoed in the second bar, that comes to rest on a long note. */
  const makeMotif = (density: number): Motif => {
    for (;;) {
      const bar1 = rhythmBar(density);
      const rest = pick([24, 24, 20, 22]);
      const bar2 = (chance(0.65) ? bar1 : rhythmBar(density)).filter((s) => s < 8 && s + 16 < rest - 1);
      const onsets = [...bar1, ...bar2.map((s) => s + 16), rest];
      if (onsets.length < 4) continue;
      const hits = onsets.map((s, i) => ({ s, d: i + 1 < onsets.length ? Math.min(onsets[i + 1] - s, 8) : 6 }));
      return { hits, deltas: rollDeltas(hits.length) };
    }
  };
  /** The same motif with a new ending. */
  const retail = (m: Motif): Motif => {
    const n = m.hits.length;
    return { hits: m.hits, deltas: rollDeltas(n, Math.max(1, n - 3), m.deltas.slice()) };
  };

  // ----- form -----
  const sections: Section[] = [];
  const usualEnergy = (letter: Letter, variant: number) => (letter === "C" ? 0.4 : letter === "B" ? (variant ? 1 : 0.9) : [0.65, 0.8, 0.9][Math.min(variant, 2)]);
  if (o.stinger) {
    // No sections: the jingle is written by hand below.
  } else if (o.form) {
    const seen = { A: 0, B: 0, C: 0 };
    let bar = 0;
    o.form.sections.forEach((f, i) => {
      const letter: Letter = f.kind === "b" ? "B" : f.kind === "c" ? "C" : "A";
      const kind = f.kind === "intro" || f.kind === "outro" ? f.kind : "body";
      const variant = kind === "body" ? seen[letter]++ : kind === "outro" ? 9 : 0;
      const energy = f.energy ?? (kind === "intro" ? 0.3 : kind === "outro" ? 0.5 : usualEnergy(letter, variant));
      const next = o.form!.sections[i + 1];
      sections.push({ shift: f.shift ?? 0, kind, letter, bar0: bar, bars: f.bars, energy, variant, turn: kind !== "intro" && (!next || next.kind !== f.kind) });
      bar += f.bars;
    });
  } else if (bars < 16) {
    sections.push({ shift: 0, kind: "body", letter: "A", bar0: 0, bars, energy: 0.8, variant: 0, turn: o.loop });
  } else {
    const edge = o.loop ? 0 : 4;
    // An odd pair of bars is taken out of the intro, so the body stays in fours.
    const intro = edge && bars % 4 === 2 ? 2 : edge;
    const body = bars - edge - intro;
    const count = Math.floor(body / 8);
    const letters = (count <= 3 ? "ABA".slice(0, count) : Array.from({ length: count }, (_, i) => FORM[i % FORM.length]).join("")).split("") as Letter[];
    if (!o.loop && letters[count - 1] === "C") letters[count - 1] = "A";
    const lens = letters.map(() => 8);
    if (body > count * 8) {
      // Bars left over become a short break before the last section.
      const i = Math.max(1, count - 1);
      letters.splice(i, 0, "C");
      lens.splice(i, 0, body - count * 8);
    }
    let bar = 0;
    if (edge) {
      sections.push({ shift: 0, kind: "intro", letter: "A", bar0: 0, bars: intro, energy: 0.3, variant: 0, turn: false });
      bar = intro;
    }
    const seen = { A: 0, B: 0, C: 0 };
    letters.forEach((letter, i) => {
      const variant = seen[letter]++;
      const last = i === letters.length - 1;
      let energy = usualEnergy(letter, variant);
      if (last && !o.loop && letter !== "C") energy = Math.max(energy, 0.9);
      sections.push({ shift: 0, kind: "body", letter, bar0: bar, bars: lens[i], energy, variant, turn: last || letters[i + 1] !== letter });
      bar += lens[i];
    });
    if (edge) sections.push({ shift: 0, kind: "outro", letter: "A", bar0: bar, bars: edge, energy: 0.5, variant: 9, turn: true });
  }

  // ----- material for each section letter, one layer at a time -----
  const LETTERS = ["A", "B", "C"] as const;
  const chosen = o.instruments ?? {};

  draw("chords", 1000);
  const progs = mode.progs.slice();
  for (let i = progs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [progs[i], progs[j]] = [progs[j], progs[i]];
  }
  const sustained = st.chords.filter((c) => c[1] === "sustain");
  const harmony = LETTERS.map((letter, i) => {
    let prog = progs[i % progs.length];
    // Only the main theme starts at home; the others begin somewhere else for contrast.
    if (i > 0) {
      const k = prog.findIndex((d, n) => n > 0 && d !== 0);
      if (prog[0] === 0 && k > 0) prog = [...prog.slice(k), ...prog.slice(0, k)];
    }
    const hr = pick(st.hr);
    const rolled = letter === "C" && sustained.length ? pick(sustained) : pick(st.chords);
    const chords: [PatchId, ChordPattern] = chosen.chords ? [chosen.chords, fitPattern(chosen.chords, rolled[1])] : rolled;
    return { prog, hr: letter === "C" ? 2 : hr, chords, variation: Math.floor(rnd() * 12) };
  });

  draw("melody", 1000);
  const tunes = LETTERS.map((letter) => {
    const density = letter === "C" ? st.density * 0.5 : letter === "B" ? Math.min(1, st.density * 1.15) : st.density;
    const rolled = pick(letter === "A" ? st.lead : st.lead2);
    const lead = chosen.lead ?? rolled;
    const others = [...st.lead, ...st.lead2].filter((p) => p !== lead);
    return { density, motif: makeMotif(density), start: centre + (letter === "B" ? 2 : 0) + pick([-1, 0, 1]), lead, answer: others.length ? pick(others) : lead };
  });

  draw("bass", 1000);
  const rolledBass = pick(st.bass);
  const bassInst: [PatchId, BassPattern] = [chosen.bass ?? rolledBass[0], rolledBass[1]];
  const bassLines = LETTERS.map(() => pick(BASS[bassInst[1]]));

  draw("arp", 1000);
  const arps = LETTERS.map(() => {
    const rolled = pick(st.arp);
    return { arp: chosen.arp ?? rolled, arpRate: pick(st.arpRate), arpShape: pick(ARP_SHAPES), arpOn: chance(st.arpChance) };
  });

  draw("drums", 1000);
  const rolledKits = [pick(st.drums), pick(st.drums)];
  const mainDrums = chosen.drums ?? rolledKits[0];

  const materials = {} as Record<Letter, Material>;
  LETTERS.forEach((letter, i) => {
    materials[letter] = { ...harmony[i], ...tunes[i], bass: bassLines[i], ...arps[i], drums: letter === "B" ? (chosen.drums ?? rolledKits[1]) : mainDrums };
  });

  // ----- chords for every bar, plus the tonic the piece finally lands on -----
  const barChord: Chord[] = [];
  for (const sec of sections) {
    const mat = materials[sec.letter];
    for (let j = 0; j < sec.bars; j++) {
      barChord[sec.bar0 + j] = sec.turn && j === sec.bars - 1 && sec.bars > 2 ? dominant() : chord(mat.prog[Math.floor(j / mat.hr) % mat.prog.length]);
    }
  }
  barChord[bars] = chord(0);
  const chordAt = (step: number) => barChord[Math.min(bars, Math.floor(step / 16))];

  // ----- writing notes -----
  const tracks = new Map<string, Track>();
  const drums: DrumEvent[] = [];
  const jitter = () => (rnd() - 0.5) * 2 * st.human;
  // Set per section while its notes are written.
  let shift = 0;
  let sectionKey = 0;
  const note = (role: Role, patch: PatchId, step: number, len: number, midi: number, vel: number, gate = 1, offset = 0) => {
    const key = `${role}:${patch}`;
    let tr = tracks.get(key);
    if (!tr) {
      const m = MIX[role];
      tr = { role, patch, gain: m.gain * PATCHES[patch].level, pan: m.pan, reverb: m.reverb, delay: m.delay, duck: m.duck * st.pump, notes: [] };
      tracks.set(key, tr);
    }
    const t = Math.max(0, at(step) + offset + jitter());
    tr.notes.push({ t, d: Math.max(0.03, (at(step + len) - at(step)) * gate), midi: midi + shift, vel: Math.min(1, vel) });
  };
  const hit = (kind: DrumKind, step: number, vel: number) => {
    drums.push({ kind, t: Math.max(0, at(step) + jitter() * 0.5), vel: Math.min(1, vel) });
  };

  /** Plays a motif over the chords, starting from a rung of the melody scale. Returns the last pitch. */
  let lastPitch = st.leadCentre;
  const sing = (role: Role, patch: PatchId, m: Motif, step0: number, start: number, loud: number, double: boolean) => {
    let idx = start;
    m.hits.forEach((h, k) => {
      idx += m.deltas[k];
      if (idx > hi) idx = 2 * hi - idx;
      if (idx < lo) idx = 2 * lo - idx;
      const c = chordAt(step0 + h.s);
      const last = k === m.hits.length - 1;
      let p = ladder[idx];
      // Notes that carry weight sit on the chord; the ones between are free to pass through.
      if (h.s % 8 === 0 || h.d >= 6 || last) {
        p = nearestIn(p, last && c.deg === 0 ? [c.pcs[0]] : c.pcs);
        idx = rung(p);
      } else if (p % 12 === c.raise) p += 1;
      const vel = (0.7 + (h.s % 8 === 0 ? 0.1 : 0) + rnd() * 0.1) * loud;
      note(role, patch, step0 + h.s, h.d, p, vel, st.gate);
      if (double) note(role, patch, step0 + h.s, h.d, p - 12, vel * 0.55, st.gate);
      lastPitch = p;
    });
  };

  const writeMelody = (sec: Section, mat: Material) => {
    draw("melody", sectionKey);
    const phrases = sec.bars / 2;
    const loud = 0.8 + 0.2 * sec.energy;
    for (let p = 0; p < phrases; p++) {
      const step0 = (sec.bar0 + p * 2) * 16;
      const last = p === phrases - 1;
      // A break leaves every other phrase empty.
      if (sec.letter === "C" && p % 2 === 1 && !last) continue;
      const role = last && phrases > 1 ? "cadence" : ["a", "a2", "b", "a"][p % 4];
      if (role === "a") sing("lead", mat.lead, mat.motif, step0, mat.start, loud, sec.energy >= 0.95);
      else if (role === "a2") sing("lead", mat.lead, retail(mat.motif), step0, mat.start + pick([0, 0, 1, -1, 2]), loud, false);
      else if (role === "b") {
        // The contrasting phrase is new every time; on repeats another instrument answers.
        const answer = sec.variant % 2 === 1;
        sing(answer ? "answer" : "lead", answer ? mat.answer : mat.lead, makeMotif(Math.min(1, mat.density * 1.1)), step0, mat.start + pick([2, 3, 4]), loud, false);
      } else sing("lead", mat.lead, retail(mat.motif), step0, mat.start, loud, sec.energy >= 0.95);
    }
  };

  const writeChords = (sec: Section, mat: Material) => {
    draw("chords", sectionKey);
    const [patch, pattern] = mat.chords;
    const loud = 0.6 + 0.25 * sec.energy;
    for (let j = 0; j < sec.bars; j++) {
      const bar = sec.bar0 + j;
      const c = barChord[bar];
      const v = c.voicing;
      const s0 = bar * 16;
      const tpl = mat.variation + (j % 4 === 3 ? 1 : 0); // every fourth bar plays a different figure
      if (pattern === "sustain") {
        if (j > 0 && barChord[bar - 1] === c) continue;
        let run = 1;
        while (j + run < sec.bars && barChord[bar + run] === c) run++;
        for (const p of v) note("chords", patch, s0, run * 16, p, loud * 0.9, 0.98);
      } else if (pattern === "comp" || pattern === "drive") {
        const hits = pattern === "comp" ? COMP[tpl % COMP.length] : DRIVE[tpl % DRIVE.length];
        for (const [s, d] of hits) for (const p of v) note("chords", patch, s0 + s, d, p, loud * (s % 8 === 0 ? 1 : 0.8) + rnd() * 0.06);
      } else if (pattern === "offbeat") {
        for (const s of [2, 6, 10, 14]) for (const p of v) note("chords", patch, s0 + s, 1.2, p, loud);
      } else if (pattern === "strum") {
        STRUM[tpl % STRUM.length].forEach(([s, d], n) => {
          const order = n % 2 ? v.slice().reverse() : v;
          order.forEach((p, k) => note("chords", patch, s0 + s, d, p, loud * (n % 2 ? 0.75 : 1), 1, k * 0.016));
        });
      } else if (pattern === "broken") {
        const pool = [v[0] - 12, v[1], v[2], v[3] ?? v[0] + 12];
        BROKEN[tpl % BROKEN.length].forEach((k, n) => note("chords", patch, s0 + n * 2, 3, pool[k], loud * (n % 4 === 0 ? 1 : 0.75)));
      } else {
        for (let s = 0; s < 16; s++) note("chords", patch, s0 + s, 1, v[s % v.length] + (s % (v.length * 2) >= v.length ? 12 : 0), loud * (s % 4 === 0 ? 0.9 : 0.65));
      }
    }
  };

  const writeArp = (sec: Section, mat: Material) => {
    draw("arp", sectionKey);
    const end = (sec.bar0 + sec.bars) * 16;
    const loud = 0.75 + 0.25 * sec.energy;
    for (let s = sec.bar0 * 16, n = 0; s < end; s += mat.arpRate, n++) {
      const v = chordAt(s).voicing;
      const pool = [v[0], v[1], v[2], v[3] ?? v[0] + 12, v[0] + 12 + (v.length > 3 ? 0 : v[1] - v[0])];
      note("arp", mat.arp, s, mat.arpRate, pool[mat.arpShape[n % mat.arpShape.length]] + 12, (s % 4 === 0 ? 0.78 : 0.55) * loud + rnd() * 0.08);
    }
  };

  const writeBass = (sec: Section, mat: Material) => {
    draw("bass", sectionKey);
    const simple = sec.energy < 0.5 || sec.kind === "outro";
    for (let j = 0; j < sec.bars; j++) {
      const bar = sec.bar0 + j;
      const c = barChord[bar];
      // The last bar of a loop walks back into the first bar that repeats.
      const next = bar + 1 < bars || !o.loop ? barChord[bar + 1] : barChord[sections.find((x) => x.kind !== "intro")?.bar0 ?? 0];
      for (const [s, d, tone] of simple ? BASS.long[0] : mat.bass) {
        let p = c.bass;
        if (tone === F) p += c.bass + 7 > 45 ? -5 : 7;
        else if (tone === O) p += 12;
        else if (tone === T) p += (c.pcs[1] - c.pcs[0] + 12) % 12;
        else if (tone === A) {
          // The scale note just under the next root, so the line walks into it.
          p = next.bass - 1;
          while (!tunePcs.includes(((p % 12) + 12) % 12)) p--;
        }
        note("bass", bassInst[0], bar * 16 + s, d, p, (s === 0 ? 0.9 : 0.75) + rnd() * 0.08, d >= 8 ? 0.95 : 0.85);
      }
    }
  };

  const writeDrums = (sec: Section, pattern: DrumPattern, fillOnly: boolean) => {
    if (pattern === "none") return;
    draw("drums", sectionKey);
    const kit = KITS[pattern];
    const light = sec.energy < 0.6;
    const next = sections[sections.indexOf(sec) + 1];
    const leadsOn = !!next || o.loop;
    if (!fillOnly && sec.energy >= 0.8 && !kit.soft) hit("crash", sec.bar0 * 16, 0.55);
    for (let j = 0; j < sec.bars; j++) {
      const s0 = (sec.bar0 + j) * 16;
      const fill = leadsOn && j === sec.bars - 1 && sec.bars > 2 && (fillOnly || sec.energy >= 0.45);
      const cut = fill ? (kit.soft ? 14 : 12) : 16;
      if (!fillOnly) {
        for (const s of kit.kick) if (s < cut && (!light || s % 8 === 0)) hit(kit.kickKind ?? "kick", s0 + s, s === 0 ? 1 : 0.85);
        if (!light) for (const s of kit.snare) if (s < cut) hit(kit.snareKind, s0 + s, 0.85 + rnd() * 0.1);
        for (const s of kit.hat) {
          if (s >= cut) continue;
          const open = !light && kit.open.includes(s);
          hit(open ? "ohat" : kit.hatKind, s0 + s, (s % 4 === 0 ? 0.7 : s % 2 === 0 ? 0.5 : 0.3) * (0.85 + rnd() * 0.3));
        }
        // Sixteenth hats in between when things get busy.
        if (sec.energy >= 0.95 && kit.hat.length === 8 && !kit.soft) for (let s = 1; s < cut; s += 2) hit(kit.hatKind, s0 + s, 0.22 + rnd() * 0.08);
        // Every other bar is a little looser than the one before.
        if (j % 2 === 1 && !light && !fill) {
          if (chance(0.35)) hit(kit.kickKind ?? "kick", s0 + pick(kit.extra), 0.7);
          if (chance(0.25) && !kit.soft) hit(kit.snareKind, s0 + pick([7, 9, 15]), 0.3);
          if (chance(0.2)) hit("ohat", s0 + 14, 0.45);
        }
      }
      if (fill) {
        if (kit.soft) {
          hit(kit.snareKind, s0 + 14, 0.5);
          hit(kit.snareKind, s0 + 15, 0.65);
        } else {
          const kind = Math.floor(rnd() * 3);
          if (kind === 0) [12, 13, 14, 15].forEach((s, n) => hit("snare", s0 + s, 0.5 + n * 0.15));
          else if (kind === 1) [12, 14, 15].forEach((s, n) => hit("snare", s0 + s, 0.6 + n * 0.15));
          else (["tomh", "tomh", "tomm", "toml"] as const).forEach((tom, n) => hit(tom, s0 + 12 + n, 0.7 + n * 0.08));
          hit("kick", s0 + 12, 0.8);
        }
      }
    }
  };

  for (const sec of sections) {
    const mat = materials[sec.letter];
    const e = sec.energy;
    // A section's streams are named by what it is and which return of it this is, so moving,
    // resizing or removing one section leaves the notes of the others alone.
    sectionKey = 1 + "ABC".indexOf(sec.letter) + 4 * ["intro", "body", "outro"].indexOf(sec.kind) + 16 * sec.variant;
    shift = sec.shift;
    writeChords(sec, mat);
    if (sec.kind === "intro") {
      writeArp(sec, mat);
      writeDrums(sec, mat.drums, true);
      continue;
    }
    writeMelody(sec, mat);
    if (e >= 0.3) writeBass(sec, mat);
    if (sec.letter === "C" || sec.kind === "outro" || (mat.arpOn && e >= 0.75) || (e >= 0.95 && sec.variant > 0)) writeArp(sec, mat);
    if (e >= 0.45) writeDrums(sec, mat.drums, false);
  }

  shift = 0;
  sectionKey = 900;

  // A stinger: a few bars in the track's key, played by the instruments of its main theme.
  if (o.stinger) {
    const a = materials.A;
    const home = chord(0);
    const minor = minorish;
    const kit = mainDrums === "none" ? null : KITS[mainDrums];
    const chordHit = (c: Chord, step: number, len: number, vel: number) => {
      for (const p of c.voicing) note("chords", a.chords[0], step, len, p, vel);
      note("bass", bassInst[0], step, len, c.bass, 0.9);
    };
    const top = (c: Chord) => nearestIn(st.leadCentre + 3, c.pcs);
    draw("melody", sectionKey);
    if (o.stinger === "victory") {
      // Two chords climbing home, the tune on top, then a run up the home chord.
      const up = [chord(minor ? 5 : 3), chord(minor ? 6 : 4)];
      up.forEach((c, i) => {
        chordHit(c, i * 4, 3, 0.85);
        note("lead", a.lead, i * 4, 2.5, top(c), 0.85);
        note("lead", a.lead, i * 4 + 3, 1, top(c), 0.7);
        if (kit) hit(kit.kickKind ?? "kick", i * 4, 0.9);
      });
      chordHit(home, 8, 20, 0.95);
      const peak = nearestIn(st.leadCentre + 7, [home.pcs[0]]);
      const run = [nearestIn(peak - 9, home.pcs), nearestIn(peak - 5, home.pcs), nearestIn(peak - 2, home.pcs)];
      run.forEach((p, i) => note("lead", a.lead, 8 + i, 1, p, 0.8));
      note("lead", a.lead, 11, 14, peak, 0.95);
      if (kit) {
        [6, 7].forEach((s) => hit(kit.snareKind, s, 0.7));
        hit(kit.kickKind ?? "kick", 8, 1);
        if (!kit.soft) hit("crash", 8, 0.65);
      }
    } else if (o.stinger === "levelup") {
      // A quick climb through the home chord over two octaves, landing on a bright chord.
      const base = nearestIn(st.leadCentre - 7, [home.pcs[0]]);
      const tones = [0, 1, 2].map((k) => fold(home.pcs[k], base));
      const climb = [...tones, ...tones.map((p) => p + 12), tones[0] + 24];
      climb.forEach((p, i) => note("lead", a.lead, i, 1.5, p, 0.7 + i * 0.03));
      chordHit(home, climb.length, 14, 0.85);
      note("arp", a.arp, climb.length, 12, tones[0] + 24, 0.8);
      note("arp", a.arp, climb.length + 1, 12, tones[2] + 12, 0.6);
      if (kit && !kit.soft) hit("crash", climb.length, 0.45);
    } else {
      // A line sinking step by step from the fifth, onto a low, dark chord.
      const low = chord(minor ? 0 : 5);
      const start = rung(nearestIn(st.leadCentre - 2, [(tonic + 7) % 12]));
      [0, 1, 2, 3].forEach((k) => note("lead", a.lead, k * 4, 4, ladder[Math.max(0, start - k)], 0.8 - k * 0.06));
      note("lead", a.lead, 16, 14, nearestIn(ladder[Math.max(0, start - 4)], low.pcs), 0.7);
      for (const p of low.voicing) note("chords", a.chords[0], 16, 16, p - 12 < 43 ? p : p - 12, 0.75);
      note("bass", bassInst[0], 16, 16, low.bass, 0.9);
      if (kit) hit(kit.kickKind ?? "kick", 16, 0.8);
    }
  }

  // A piece that does not loop lands on the tonic and rings out.
  if (!o.loop && !o.stinger) {
    const end = bars * 16;
    const home = barChord[bars];
    const a = materials.A;
    for (const p of home.voicing) note("chords", a.chords[0], end, 16, p, 0.8);
    note("bass", bassInst[0], end, 16, home.bass, 0.9);
    note("lead", a.lead, end, 12, nearestIn(lastPitch, [home.pcs[0]]), 0.8);
    if (mainDrums !== "none") {
      hit("kick", end, 0.9);
      if (!KITS[mainDrums].soft) hit("crash", end, 0.6);
    }
  }

  // ----- hand over -----
  const all = [...tracks.values()];
  const names = (roles: Role[]) => [...new Set(all.filter((t) => roles.includes(t.role)).map((t) => PATCHES[t.patch].name))];
  const kits = [...new Set(sections.filter((s) => s.energy >= 0.45).map((s) => materials[s.letter].drums))].flatMap((d) => (d === "none" ? [] : [KITS[d].name]));
  const layerOf = (role: Role): keyof Layers => (role === "lead" || role === "answer" ? "melody" : role);
  const on = (role: Role) => o.layers[layerOf(role)];

  return {
    style: st.label,
    recipe,
    bpm: 15 / stepDur,
    key: `${NOTE_NAMES[tonic]} ${mode.label}`,
    bars,
    seconds: (o.stinger ? at(o.stinger === "defeat" ? 16 : 8) : musicLen) + ringOut,
    loop: o.loop,
    sections: sections.map((s) => ({
      label: SECTION_LABELS[s.kind === "body" ? (s.letter.toLowerCase() as "a" | "b" | "c") : s.kind],
      kind: s.kind === "body" ? (s.letter.toLowerCase() as "a" | "b" | "c") : s.kind,
      start: s.bar0 * 16 * stepDur,
      end: (s.bar0 + s.bars) * 16 * stepDur,
      bars: s.bars,
      energy: s.energy,
      shift: s.shift,
    })),
    instruments: {
      melody: names(["lead", "answer"]),
      chords: names(["chords"]),
      arp: names(["arp"]),
      bass: names(["bass"]),
      drums: drums.length ? kits : [],
    },
    tracks: all.filter((t) => on(t.role)).map((t) => ({ ...t, gain: t.gain * (o.levels?.[layerOf(t.role)] ?? 1) })),
    drums: o.layers.drums ? drums : [],
    kicks: drums.filter((d) => d.kind === "kick"),
    brightness: Math.pow(2, 1.2 * clamp(o.mood?.bright ?? 0, -1, 1)),
    drumTone: st.drumTone,
    drumLevel: st.drumLevel * (o.levels?.drums ?? 1),
    reverb: st.reverb,
    delay: { seconds: st.delay.steps * stepDur, mix: st.delay.mix },
  };
}
