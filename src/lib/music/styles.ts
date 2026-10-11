import type { PatchId } from "./patches";

export type ModeId = "major" | "lydian" | "mixolydian" | "minor" | "dorian" | "phrygian" | "harmonic";

export interface ModeDef {
  label: string;
  scale: number[];
  /** Four-chord loops as scale degrees (0 = tonic). None of them lands on a diminished triad. */
  progs: number[][];
  /** The degree that wants to fall back to the tonic. */
  dom: number;
}

export const MODES: Record<ModeId, ModeDef> = {
  major: {
    label: "major",
    scale: [0, 2, 4, 5, 7, 9, 11],
    progs: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 5, 4], [3, 0, 4, 5], [5, 3, 0, 4], [0, 2, 3, 4], [1, 4, 0, 5], [0, 3, 1, 4], [0, 5, 1, 4]],
    dom: 4,
  },
  lydian: { label: "lydian", scale: [0, 2, 4, 6, 7, 9, 11], progs: [[0, 1, 0, 4], [0, 4, 1, 0], [0, 1, 5, 4], [0, 5, 1, 0]], dom: 4 },
  mixolydian: { label: "mixolydian", scale: [0, 2, 4, 5, 7, 9, 10], progs: [[0, 6, 3, 0], [0, 3, 6, 3], [0, 6, 0, 3], [0, 4, 6, 3], [3, 0, 6, 0]], dom: 6 },
  minor: {
    label: "minor",
    scale: [0, 2, 3, 5, 7, 8, 10],
    progs: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 5, 4], [0, 5, 3, 4], [0, 2, 6, 5], [0, 4, 5, 3], [0, 3, 6, 2], [3, 0, 5, 6]],
    dom: 4,
  },
  dorian: { label: "dorian", scale: [0, 2, 3, 5, 7, 9, 10], progs: [[0, 3, 0, 3], [0, 3, 6, 0], [0, 6, 3, 0], [0, 2, 3, 0], [0, 3, 2, 6], [0, 1, 3, 0]], dom: 6 },
  phrygian: { label: "phrygian", scale: [0, 1, 3, 5, 7, 8, 10], progs: [[0, 1, 0, 6], [0, 1, 2, 1], [0, 6, 1, 0], [0, 5, 1, 0]], dom: 1 },
  harmonic: { label: "harmonic minor", scale: [0, 2, 3, 5, 7, 8, 11], progs: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 3, 0, 4], [5, 3, 4, 0]], dom: 4 },
};

export type ChordPattern = "sustain" | "comp" | "offbeat" | "drive" | "strum" | "broken" | "chiparp";
export type BassPattern = "long" | "root" | "synco" | "octave8" | "pedal16" | "walk";
export type DrumPattern = "four" | "pop" | "lofi" | "break" | "brush" | "march" | "heavy" | "chip" | "half" | "none";

export interface StyleDef {
  label: string;
  blurb: string;
  bpm: [number, number];
  /** Swing, in sixteenth-notes of delay, on the off-beat eighth and on the odd sixteenths. */
  swing8: number;
  swing16: number;
  modes: ModeId[];
  /** Chance that a chord gets its seventh. */
  sevenths: number;
  /** Bars a chord may last. */
  hr: number[];
  lead: PatchId[];
  lead2: PatchId[];
  /** MIDI note the melody circles around. */
  leadCentre: number;
  /** Melody stays on the five safest notes of the scale. */
  pentatonic: boolean;
  /** How busy the melody is, 0..1, and how often it reaches for sixteenth notes. */
  density: number;
  sixteenths: number;
  /** Fraction of each melody note that actually sounds. */
  gate: number;
  chords: [PatchId, ChordPattern][];
  bass: [PatchId, BassPattern][];
  arp: PatchId[];
  /** Sixteenths per arpeggio note. */
  arpRate: number[];
  /** Chance that an arpeggio runs through the ordinary sections, not just the breaks. */
  arpChance: number;
  drums: DrumPattern[];
  /** Low-pass on the kit in Hz; low values give soft, dusty drums. */
  drumTone: number;
  drumLevel: number;
  reverb: { size: number; mix: number };
  /** Echo time in sixteenths, and its level. */
  delay: { steps: number; mix: number };
  /** How hard the kick ducks the chords and bass. */
  pump: number;
  /** Timing looseness in seconds. */
  human: number;
}

const styles = {
  upbeat: {
    label: "Upbeat",
    blurb: "Bright, bouncy and catchy — menus, overworlds, shops",
    bpm: [114, 130], swing8: 0, swing16: 0,
    modes: ["major", "major", "mixolydian", "lydian"], sevenths: 0.15, hr: [1, 1, 2],
    lead: ["squareLead", "sawLead", "kalimba"], lead2: ["bell", "softLead", "kalimba"], leadCentre: 74,
    pentatonic: true, density: 0.7, sixteenths: 0.25, gate: 0.8,
    chords: [["stab", "offbeat"], ["epiano", "comp"], ["warmPad", "sustain"]],
    bass: [["sawBass", "octave8"], ["pluckBass", "synco"], ["pluckBass", "root"]],
    arp: ["harp", "chipArp", "kalimba"], arpRate: [2, 1], arpChance: 0.45,
    drums: ["four", "pop"], drumTone: 16000, drumLevel: 0.85,
    reverb: { size: 0.5, mix: 0.2 }, delay: { steps: 3, mix: 0.2 }, pump: 0.35, human: 0.004,
  },
  cozy: {
    label: "Cozy",
    blurb: "Warm and gentle with a little shuffle — villages, farms, home",
    bpm: [78, 98], swing8: 0.4, swing16: 0,
    modes: ["major", "major", "mixolydian"], sevenths: 0.5, hr: [1, 2],
    lead: ["kalimba", "musicBox", "softLead", "harp"], lead2: ["softLead", "musicBox", "epiano"], leadCentre: 74,
    pentatonic: true, density: 0.5, sixteenths: 0.05, gate: 0.9,
    chords: [["guitar", "strum"], ["epiano", "comp"], ["warmPad", "sustain"], ["guitar", "broken"]],
    bass: [["pluckBass", "walk"], ["subBass", "root"]],
    arp: ["harp", "musicBox"], arpRate: [2], arpChance: 0.35,
    drums: ["brush"], drumTone: 9000, drumLevel: 0.7,
    reverb: { size: 0.55, mix: 0.26 }, delay: { steps: 3, mix: 0.15 }, pump: 0, human: 0.008,
  },
  chill: {
    label: "Chill",
    blurb: "Laid-back, jazzy chords over dusty drums — puzzles, crafting, pause screens",
    bpm: [70, 90], swing8: 0, swing16: 0.24,
    modes: ["dorian", "minor", "major", "lydian"], sevenths: 0.9, hr: [1, 2],
    lead: ["softLead", "epiano", "bell"], lead2: ["bell", "kalimba", "softLead"], leadCentre: 72,
    pentatonic: true, density: 0.45, sixteenths: 0.15, gate: 0.9,
    chords: [["epiano", "comp"], ["warmPad", "sustain"], ["epiano", "broken"]],
    bass: [["subBass", "synco"], ["subBass", "root"]],
    arp: ["bell", "harp"], arpRate: [2, 3], arpChance: 0.3,
    drums: ["lofi"], drumTone: 5200, drumLevel: 0.9,
    reverb: { size: 0.6, mix: 0.26 }, delay: { steps: 3, mix: 0.25 }, pump: 0.2, human: 0.01,
  },
  action: {
    label: "Action",
    blurb: "Fast and driving — chases, combat, time pressure",
    bpm: [138, 160], swing8: 0, swing16: 0,
    modes: ["minor", "minor", "dorian", "harmonic"], sevenths: 0.05, hr: [1, 2, 2],
    lead: ["sawLead", "squareLead", "brass"], lead2: ["squareLead", "brass", "sawLead"], leadCentre: 72,
    pentatonic: true, density: 0.8, sixteenths: 0.5, gate: 0.75,
    chords: [["stab", "drive"], ["stringPad", "sustain"]],
    bass: [["sawBass", "octave8"], ["sawBass", "pedal16"]],
    arp: ["chipArp"], arpRate: [1], arpChance: 0.5,
    drums: ["break", "four"], drumTone: 16000, drumLevel: 0.85,
    reverb: { size: 0.4, mix: 0.13 }, delay: { steps: 3, mix: 0.15 }, pump: 0.25, human: 0.002,
  },
  adventure: {
    label: "Adventure",
    blurb: "Heroic and open — exploring, travelling, setting out",
    bpm: [104, 124], swing8: 0, swing16: 0,
    modes: ["major", "mixolydian", "lydian", "major"], sevenths: 0.1, hr: [1, 2],
    lead: ["brass", "softLead", "harp"], lead2: ["softLead", "harp", "bell"], leadCentre: 70,
    pentatonic: false, density: 0.6, sixteenths: 0.2, gate: 0.9,
    chords: [["stringPad", "sustain"], ["harp", "strum"], ["harp", "broken"]],
    bass: [["pluckBass", "root"], ["subBass", "root"]],
    arp: ["harp"], arpRate: [2], arpChance: 0.4,
    drums: ["march", "pop"], drumTone: 12000, drumLevel: 0.85,
    reverb: { size: 0.7, mix: 0.26 }, delay: { steps: 4, mix: 0.12 }, pump: 0, human: 0.005,
  },
  mysterious: {
    label: "Mysterious",
    blurb: "Sparse, shadowy, a little uneasy — caves, ruins, secrets",
    bpm: [66, 88], swing8: 0, swing16: 0,
    modes: ["dorian", "phrygian", "minor", "harmonic"], sevenths: 0.3, hr: [2],
    lead: ["bell", "softLead", "musicBox", "harp"], lead2: ["harp", "bell", "softLead"], leadCentre: 72,
    pentatonic: false, density: 0.3, sixteenths: 0.05, gate: 1,
    chords: [["glassPad", "sustain"], ["stringPad", "sustain"]],
    bass: [["subBass", "long"]],
    arp: ["bell", "harp"], arpRate: [2, 3, 4], arpChance: 0.6,
    drums: ["half", "none"], drumTone: 6000, drumLevel: 0.6,
    reverb: { size: 0.85, mix: 0.36 }, delay: { steps: 3, mix: 0.3 }, pump: 0, human: 0.006,
  },
  boss: {
    label: "Boss fight",
    blurb: "Heavy, dark and relentless — the big encounter",
    bpm: [150, 174], swing8: 0, swing16: 0,
    modes: ["phrygian", "harmonic", "minor"], sevenths: 0, hr: [2, 1],
    lead: ["brass", "sawLead", "squareLead"], lead2: ["sawLead", "squareLead", "brass"], leadCentre: 70,
    pentatonic: false, density: 0.75, sixteenths: 0.45, gate: 0.8,
    chords: [["stab", "drive"], ["stringPad", "sustain"]],
    bass: [["sawBass", "pedal16"]],
    arp: ["chipArp"], arpRate: [1], arpChance: 0.4,
    drums: ["heavy", "break"], drumTone: 16000, drumLevel: 0.75,
    reverb: { size: 0.5, mix: 0.16 }, delay: { steps: 3, mix: 0.12 }, pump: 0.2, human: 0.002,
  },
  retro: {
    label: "Retro",
    blurb: "Chiptune — pulse waves, fast arpeggios, 8-bit drums",
    bpm: [120, 150], swing8: 0, swing16: 0,
    modes: ["major", "minor", "mixolydian", "dorian"], sevenths: 0, hr: [1, 2],
    lead: ["squareLead", "triLead"], lead2: ["triLead", "squareLead"], leadCentre: 74,
    pentatonic: false, density: 0.75, sixteenths: 0.4, gate: 0.8,
    chords: [["chipArp", "chiparp"]],
    bass: [["squareBass", "octave8"], ["squareBass", "root"]],
    arp: ["chipArp"], arpRate: [1], arpChance: 0,
    drums: ["chip"], drumTone: 16000, drumLevel: 0.75,
    reverb: { size: 0.3, mix: 0.05 }, delay: { steps: 3, mix: 0.14 }, pump: 0, human: 0,
  },
  dreamy: {
    label: "Dreamy",
    blurb: "Floating, slow and spacious — title screens, night, underwater",
    bpm: [60, 76], swing8: 0, swing16: 0,
    modes: ["lydian", "major", "lydian"], sevenths: 0.7, hr: [2],
    lead: ["bell", "musicBox", "softLead"], lead2: ["softLead", "harp", "musicBox"], leadCentre: 76,
    pentatonic: true, density: 0.3, sixteenths: 0, gate: 1,
    chords: [["warmPad", "sustain"], ["glassPad", "sustain"]],
    bass: [["subBass", "long"]],
    arp: ["harp", "bell", "musicBox"], arpRate: [2, 3], arpChance: 0.85,
    drums: ["none", "half"], drumTone: 5000, drumLevel: 0.5,
    reverb: { size: 0.9, mix: 0.4 }, delay: { steps: 4, mix: 0.3 }, pump: 0, human: 0.008,
  },
  sad: {
    label: "Sad",
    blurb: "Slow and bittersweet — farewells, game over, quiet story beats",
    bpm: [62, 80], swing8: 0, swing16: 0,
    modes: ["minor", "minor", "dorian"], sevenths: 0.35, hr: [1, 2],
    lead: ["softLead", "epiano", "harp", "musicBox"], lead2: ["harp", "softLead", "bell"], leadCentre: 72,
    pentatonic: false, density: 0.35, sixteenths: 0, gate: 1,
    chords: [["epiano", "broken"], ["stringPad", "sustain"], ["harp", "broken"]],
    bass: [["subBass", "long"], ["subBass", "root"]],
    arp: ["harp", "musicBox"], arpRate: [2], arpChance: 0.2,
    drums: ["none", "half"], drumTone: 5000, drumLevel: 0.5,
    reverb: { size: 0.75, mix: 0.32 }, delay: { steps: 3, mix: 0.2 }, pump: 0, human: 0.01,
  },
} satisfies Record<string, StyleDef>;

export type StyleId = keyof typeof styles;
export const STYLES: Record<StyleId, StyleDef> = styles;
export const STYLE_IDS = Object.keys(styles) as StyleId[];
