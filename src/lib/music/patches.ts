/**
 * The instruments. Three small engines cover everything the composer asks for:
 *
 *   sub    oscillators through a low-pass filter (pads, leads, basses)
 *   fm     a sine carrier bent by a sine modulator (electric piano, bells, mallets)
 *   pluck  a Karplus-Strong string (harp, guitar)
 *
 * `level` evens out how loud the patches are, so the mix only has to think in roles.
 */
interface Base {
  name: string;
  level: number;
}

export interface SubPatch extends Base {
  kind: "sub";
  wave: "saw" | "pulse" | "tri";
  /** Detuned copies of the oscillator, spread across the stereo field by `width`. */
  voices?: number;
  detune?: number; // cents
  width?: number;
  duty?: number;
  a: number;
  d: number;
  s: number;
  r: number;
  /** Filter cutoff in Hz for middle C; 20000 leaves the filter out. */
  cut: number;
  /** How much the cutoff follows the note, 0..1. */
  track?: number;
  /** Octaves the cutoff starts above `cut`, falling back over `fd` seconds. */
  env?: number;
  fd?: number;
  q?: number;
  vib?: number; // semitones
  vibRate?: number;
  vibDelay?: number;
  /** Level of a sine one octave down. */
  sub?: number;
}

export interface FmPatch extends Base {
  kind: "fm";
  ratio: number;
  index: number;
  /** The index falls to `isus` of itself over `idecay` seconds: bright attack, mellow tail. */
  idecay: number;
  isus: number;
  /** A second, very short modulator for the "tine" of a struck key. */
  ratio2?: number;
  index2?: number;
  a: number;
  d: number;
  s: number;
  r: number;
  /** Cents between the left and right carrier. */
  spread?: number;
}

export interface PluckPatch extends Base {
  kind: "pluck";
  bright: number;
  /** Seconds a middle C rings. */
  ring: number;
}

export type Patch = SubPatch | FmPatch | PluckPatch;

const patches = {
  // pads
  warmPad: { kind: "sub", name: "Warm pad", level: 0.55, wave: "saw", voices: 3, detune: 12, width: 0.8, a: 0.35, d: 1.5, s: 0.8, r: 0.7, cut: 900, track: 0.3, env: 0.5, fd: 1.5, q: 0.8 },
  glassPad: { kind: "sub", name: "Glass pad", level: 0.55, wave: "tri", voices: 2, detune: 7, width: 0.7, a: 0.5, d: 2, s: 0.8, r: 1.2, cut: 20000 },
  stringPad: { kind: "sub", name: "Strings", level: 0.42, wave: "saw", voices: 3, detune: 16, width: 0.9, a: 0.18, d: 1, s: 0.85, r: 0.45, cut: 2200, track: 0.4, q: 0.7, vib: 0.08, vibRate: 5, vibDelay: 0.3 },
  stab: { kind: "sub", name: "Synth stabs", level: 0.55, wave: "saw", voices: 2, detune: 10, width: 0.6, a: 0.003, d: 0.12, s: 0.25, r: 0.08, cut: 1400, track: 0.4, env: 2, fd: 0.1, q: 1 },
  // leads
  sawLead: { kind: "sub", name: "Saw lead", level: 0.6, wave: "saw", voices: 2, detune: 9, width: 0.3, a: 0.01, d: 0.25, s: 0.65, r: 0.12, cut: 2600, track: 0.5, env: 1.2, fd: 0.25, q: 1.2, vib: 0.12, vibRate: 5.5, vibDelay: 0.18 },
  squareLead: { kind: "sub", name: "Square lead", level: 0.4, wave: "pulse", duty: 0.5, a: 0.005, d: 0.2, s: 0.7, r: 0.08, cut: 5000, track: 0.3, q: 0.7, vib: 0.15, vibRate: 6, vibDelay: 0.2 },
  softLead: { kind: "sub", name: "Soft flute", level: 0.6, wave: "tri", a: 0.04, d: 0.3, s: 0.8, r: 0.15, cut: 3000, track: 0.6, q: 0.7, vib: 0.15, vibRate: 5, vibDelay: 0.25 },
  triLead: { kind: "sub", name: "Triangle lead", level: 0.6, wave: "tri", a: 0.003, d: 0.2, s: 0.8, r: 0.05, cut: 20000, vib: 0.1, vibRate: 6, vibDelay: 0.2 },
  brass: { kind: "sub", name: "Brass", level: 0.6, wave: "saw", voices: 2, detune: 6, width: 0.2, a: 0.05, d: 0.3, s: 0.75, r: 0.15, cut: 900, track: 0.5, env: 1.6, fd: 0.5, q: 0.9, vib: 0.08, vibRate: 5, vibDelay: 0.3 },
  chipArp: { kind: "sub", name: "Pulse arp", level: 0.4, wave: "pulse", duty: 0.25, a: 0.002, d: 0.08, s: 0.4, r: 0.04, cut: 20000 },
  // basses
  subBass: { kind: "sub", name: "Round bass", level: 0.7, wave: "tri", a: 0.008, d: 0.4, s: 0.8, r: 0.08, cut: 700, track: 0.5, sub: 0.5 },
  sawBass: { kind: "sub", name: "Synth bass", level: 0.7, wave: "saw", a: 0.004, d: 0.18, s: 0.55, r: 0.06, cut: 350, track: 0.5, env: 2.2, fd: 0.12, q: 1.4, sub: 0.5 },
  squareBass: { kind: "sub", name: "Pulse bass", level: 0.45, wave: "pulse", duty: 0.25, a: 0.003, d: 0.15, s: 0.7, r: 0.04, cut: 20000 },
  pluckBass: { kind: "sub", name: "Plucked bass", level: 0.85, wave: "saw", a: 0.004, d: 0.3, s: 0.3, r: 0.1, cut: 300, track: 0.6, env: 1.8, fd: 0.09, q: 0.9, sub: 0.4 },
  // keys and mallets
  epiano: { kind: "fm", name: "Electric piano", level: 0.5, ratio: 1, index: 1.6, idecay: 0.35, isus: 0.25, ratio2: 14, index2: 0.5, a: 0.004, d: 1.3, s: 0.15, r: 0.2, spread: 3 },
  bell: { kind: "fm", name: "Bells", level: 0.55, ratio: 3.5, index: 2.2, idecay: 0.5, isus: 0.15, a: 0.002, d: 0.9, s: 0, r: 0.5, spread: 4 },
  kalimba: { kind: "fm", name: "Kalimba", level: 0.85, ratio: 6.3, index: 1, idecay: 0.06, isus: 0.05, a: 0.002, d: 0.35, s: 0, r: 0.25, spread: 2 },
  musicBox: { kind: "fm", name: "Music box", level: 0.65, ratio: 4, index: 1.2, idecay: 0.15, isus: 0.1, a: 0.002, d: 0.7, s: 0, r: 0.5, spread: 5 },
  // strings
  harp: { kind: "pluck", name: "Harp", level: 0.7, bright: 0.75, ring: 2.5 },
  guitar: { kind: "pluck", name: "Nylon guitar", level: 1.5, bright: 0.45, ring: 1.8 },
} satisfies Record<string, Patch>;

export type PatchId = keyof typeof patches;
export const PATCHES: Record<PatchId, Patch> = patches;
