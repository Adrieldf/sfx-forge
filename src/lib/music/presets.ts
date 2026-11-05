import type { AmbienceId } from "./ambience";
import type { Instruments, Mood, MusicOptions } from "./compose";
import type { ModeId, StyleId } from "./styles";

/**
 * Starting points that call to mind a kind of game soundtrack: an era's sound chips, a genre's
 * usual band. They only fill in the ordinary options (styles, tempo, scale, instruments, mood,
 * texture), so every song is still written fresh by the composer — the feel is borrowed, never a tune.
 */
export interface Preset {
  label: string;
  blurb: string;
  styles: StyleId[];
  /** Tempo range; each new song picks a tempo inside it. */
  bpm: [number, number];
  mode?: ModeId;
  instruments: Instruments;
  mood?: Mood;
  ambience?: Partial<Record<AmbienceId, number>>;
  tape?: number;
}

const presets = {
  // ----- 8-bit -----
  platformer: {
    label: "Pixel platformer",
    blurb: "Bouncy pulse-wave hero theme for running and jumping through the first world",
    styles: ["retro", "upbeat"], bpm: [134, 150], mode: "major",
    instruments: { lead: "squareLead", chords: "chipArp", arp: "chipArp", bass: "squareBass", drums: "chip" },
    mood: { bright: 0.3, busy: 0.3, space: -0.5 },
  },
  underground: {
    label: "Underground level",
    blurb: "Sparse, plinky bass-heavy loop for pipes, caves and basements",
    styles: ["retro", "mysterious"], bpm: [104, 118], mode: "dorian",
    instruments: { lead: "triLead", chords: "chipArp", arp: "chipArp", bass: "squareBass", drums: "chip" },
    mood: { bright: -0.3, busy: -0.2, space: -0.4 },
  },
  fortress: {
    label: "8-bit fortress",
    blurb: "Tense chromatic chip march for the castle at the end of the world",
    styles: ["retro", "boss"], bpm: [150, 168], mode: "harmonic",
    instruments: { lead: "squareLead", chords: "chipArp", arp: "chipArp", bass: "squareBass", drums: "chip" },
    mood: { bright: -0.2, busy: 0.4, space: -0.5 },
  },
  shmup: {
    label: "Arcade shooter",
    blurb: "Fast synth lead over breakbeats, for scrolling space stages",
    styles: ["retro", "scifi", "action"], bpm: [150, 166], mode: "minor",
    instruments: { lead: "sawLead", chords: "stab", arp: "chipArp", bass: "squareBass", drums: "break" },
    mood: { bright: 0.3, busy: 0.4 },
  },
  chipvillage: {
    label: "Chip village",
    blurb: "Soft triangle-wave tune with a gentle shuffle, for a sleepy pixel hometown",
    styles: ["retro", "cozy"], bpm: [96, 110], mode: "major",
    instruments: { lead: "triLead", chords: "chipArp", arp: "chipArp", bass: "squareBass", drums: "brush" },
    mood: { busy: -0.2, space: -0.2 },
  },
  saveroom: {
    label: "Save room",
    blurb: "A quiet chip lullaby for the safe room where you rest and write your progress down",
    styles: ["retro", "lullaby"], bpm: [70, 84], mode: "major",
    instruments: { lead: "triLead", chords: "warmPad", arp: "chipArp", bass: "squareBass", drums: "none" },
    mood: { busy: -0.4, space: 0.1 },
    tape: 0.1,
  },
  pixelsnow: {
    label: "Pixel snowfield",
    blurb: "Twinkling chip arpeggios and celesta over a hushed winter map",
    styles: ["retro", "snowfall"], bpm: [88, 100], mode: "lydian",
    instruments: { lead: "triLead", chords: "chipArp", arp: "celesta", bass: "squareBass", drums: "chip" },
    mood: { busy: -0.2, space: 0.2 },
    ambience: { wind: 0.2 },
  },
  fishing: {
    label: "Fishing pond",
    blurb: "Lazy, swaying chip tune for sitting on the dock waiting for a bite",
    styles: ["retro", "chill"], bpm: [80, 92], mode: "mixolydian",
    instruments: { lead: "triLead", chords: "chipArp", arp: "chipArp", bass: "squareBass", drums: "half" },
    mood: { busy: -0.3 },
    ambience: { waves: 0.2, birds: 0.15 },
  },
  // ----- 16-bit -----
  field: {
    label: "Hero's open field",
    blurb: "Brassy, marching overworld theme from the age of cartridge orchestras",
    styles: ["adventure", "epic"], bpm: [108, 124], mode: "major",
    instruments: { lead: "brass", chords: "stringPad", arp: "harp", bass: "pluckBass", drums: "march" },
    mood: { space: 0.2 },
  },
  village: {
    label: "RPG village",
    blurb: "Gentle folk tune with ocarina and harp, for a hometown with an inn and a well",
    styles: ["cozy", "upbeat"], bpm: [92, 108], mode: "major",
    instruments: { lead: "ocarina", chords: "guitar", arp: "harp", bass: "pluckBass", drums: "brush" },
    mood: { busy: -0.1 },
    ambience: { birds: 0.3 },
  },
  ruins: {
    label: "Ancient temple",
    blurb: "Floating lydian pads and celesta for ruins, shrines and sky islands",
    styles: ["mysterious", "dreamy"], bpm: [76, 92], mode: "lydian",
    instruments: { lead: "ocarina", chords: "glassPad", arp: "celesta", bass: "subBass", drums: "half" },
    mood: { space: 0.5, busy: -0.3 },
    ambience: { wind: 0.25 },
  },
  finalboss: {
    label: "Final boss",
    blurb: "Organ, choir and pounding drums for the last fight of a long quest",
    styles: ["boss", "epic"], bpm: [150, 170], mode: "harmonic",
    instruments: { lead: "organ", chords: "choir", arp: "pizz", bass: "sawBass", drums: "heavy" },
    mood: { bright: 0.1, busy: 0.3 },
  },
  inn: {
    label: "Fireside inn",
    blurb: "Harp and guitar by the hearth, for a warm room after a long day on the road",
    styles: ["campfire", "cozy"], bpm: [80, 94], mode: "major",
    instruments: { lead: "harp", chords: "guitar", arp: "pizz", bass: "pluckBass", drums: "hand" },
    mood: { busy: -0.2 },
    ambience: { fire: 0.4 },
  },
  spring: {
    label: "Healing spring",
    blurb: "Shimmering harp and pads for a hidden pool that restores your health",
    styles: ["dreamy", "lullaby"], bpm: [68, 80], mode: "lydian",
    instruments: { lead: "harp", chords: "glassPad", arp: "celesta", bass: "subBass", drums: "none" },
    mood: { space: 0.5, busy: -0.2 },
    ambience: { waves: 0.15 },
  },
  rainytown: {
    label: "Rainy town",
    blurb: "Piano and music box under grey skies, for a town where it's always drizzling",
    styles: ["rainy", "cozy"], bpm: [76, 90], mode: "major",
    instruments: { lead: "piano", chords: "epiano", arp: "musicBox", bass: "upright", drums: "brush" },
    mood: { bright: -0.2 },
    ambience: { rain: 0.4 },
  },
  flowers: {
    label: "Flower fields",
    blurb: "Breezy ocarina melody with plucked strings, for strolling through a sunny meadow",
    styles: ["meadow", "upbeat"], bpm: [100, 114], mode: "major",
    instruments: { lead: "ocarina", chords: "harp", arp: "pizz", bass: "pluckBass", drums: "brush" },
    mood: { bright: 0.2 },
    ambience: { birds: 0.35, wind: 0.1 },
  },
  // ----- 3D and handheld era -----
  kart: {
    label: "Kart circuit",
    blurb: "Sunny, funky racing theme with slap-happy bass and a big hook",
    styles: ["racing", "funky"], bpm: [148, 164], mode: "mixolydian",
    instruments: { lead: "sawLead", chords: "stab", arp: "marimba", bass: "sawBass", drums: "four" },
    mood: { bright: 0.4, busy: 0.2 },
  },
  route: {
    label: "Handheld route",
    blurb: "Cheerful walking theme for tall grass between towns, on a pocket console",
    styles: ["upbeat", "adventure", "retro"], bpm: [124, 136], mode: "major",
    instruments: { lead: "squareLead", chords: "stringPad", arp: "chipArp", bass: "pluckBass", drums: "pop" },
    mood: { bright: 0.2, space: -0.2 },
  },
  mansion: {
    label: "Haunted mansion",
    blurb: "Sneaky, swinging spooky jazz with vibes and walking bass",
    styles: ["spooky", "jazzy"], bpm: [92, 110], mode: "harmonic",
    instruments: { lead: "vibes", chords: "organ", arp: "celesta", bass: "upright", drums: "brush" },
    mood: { bright: -0.2 },
  },
  puzzle: {
    label: "Puzzle lounge",
    blurb: "Smooth electric piano and vibes for falling blocks and level select",
    styles: ["jazzy", "chill"], bpm: [96, 112], mode: "dorian",
    instruments: { lead: "epiano", chords: "vibes", arp: "bell", bass: "upright", drums: "brush" },
  },
  petcafe: {
    label: "Pet café",
    blurb: "Bouncy vibes and electric piano for running a little café full of animals",
    styles: ["cafe", "cozy"], bpm: [92, 106], mode: "major",
    instruments: { lead: "vibes", chords: "epiano", arp: "kalimba", bass: "upright", drums: "brush" },
  },
  homemenu: {
    label: "Home menu",
    blurb: "Clean, airy bells and soft beats for a console's home screen",
    styles: ["chill", "dreamy"], bpm: [84, 96], mode: "major",
    instruments: { lead: "bell", chords: "epiano", arp: "kalimba", bass: "subBass", drums: "half" },
    mood: { bright: 0.2, busy: -0.2 },
  },
  sunset: {
    label: "Sunset beach",
    blurb: "Ukulele and kalimba as the sun goes down over a quiet resort island",
    styles: ["seaside", "tropical"], bpm: [84, 98], mode: "mixolydian",
    instruments: { lead: "kalimba", chords: "ukulele", arp: "marimba", bass: "pluckBass", drums: "hand" },
    mood: { busy: -0.2 },
    ambience: { waves: 0.4 },
  },
  shop: {
    label: "Corner shop",
    blurb: "Catchy, slightly funky jingle loop for browsing items and haggling",
    styles: ["cozy", "funky"], bpm: [104, 118], mode: "major",
    instruments: { lead: "marimba", chords: "epiano", arp: "vibes", bass: "pluckBass", drums: "pop" },
    mood: { bright: 0.2 },
  },
  // ----- modern indie -----
  island: {
    label: "Island life",
    blurb: "Ukulele and marimba for a relaxed life on a small island, one day at a time",
    styles: ["cozy", "tropical"], bpm: [92, 104], mode: "major",
    instruments: { lead: "marimba", chords: "ukulele", arp: "kalimba", bass: "pluckBass", drums: "hand" },
    ambience: { waves: 0.3, birds: 0.3 },
  },
  farm: {
    label: "Farm morning",
    blurb: "Warm guitar and felt piano for watering crops before the shops open",
    styles: ["meadow", "cozy"], bpm: [84, 98], mode: "major",
    instruments: { lead: "feltPiano", chords: "guitar", arp: "musicBox", bass: "upright", drums: "brush" },
    ambience: { birds: 0.4 },
    tape: 0.2,
  },
  caverns: {
    label: "Lonely caverns",
    blurb: "Moody piano and cold pads for exploring a vast, silent underground map",
    styles: ["mysterious", "sad", "scifi"], bpm: [70, 84], mode: "minor",
    instruments: { lead: "feltPiano", chords: "glassPad", arp: "bell", bass: "subBass", drums: "half" },
    mood: { space: 0.5, busy: -0.3, bright: -0.2 },
    ambience: { wind: 0.3 },
  },
  roguelike: {
    label: "Dungeon run",
    blurb: "Driving dark-synth loop for one more run through procedurally built floors",
    styles: ["action", "scifi"], bpm: [128, 142], mode: "phrygian",
    instruments: { lead: "overdrive", chords: "stab", arp: "chipArp", bass: "sawBass", drums: "break" },
    mood: { bright: -0.1, space: -0.2 },
  },
  study: {
    label: "Study room",
    blurb: "Dusty beats and felt piano on a worn tape, for a desk by a rainy window",
    styles: ["lofi", "chill"], bpm: [72, 86], mode: "dorian",
    instruments: { lead: "feltPiano", chords: "epiano", arp: "bell", bass: "subBass", drums: "lofi" },
    ambience: { rain: 0.3, crackle: 0.3 },
    tape: 0.4,
  },
  garden: {
    label: "Cottage garden",
    blurb: "Music box and harp for tending a tiny garden behind a cottage",
    styles: ["meadow", "lullaby"], bpm: [78, 92], mode: "major",
    instruments: { lead: "musicBox", chords: "harp", arp: "kalimba", bass: "pluckBass", drums: "brush" },
    mood: { busy: -0.2 },
    ambience: { birds: 0.4 },
    tape: 0.15,
  },
  camping: {
    label: "Night camping",
    blurb: "Fingerpicked guitar under the stars, with crickets and a crackling fire",
    styles: ["campfire", "quietnight"], bpm: [70, 84], mode: "major",
    instruments: { lead: "guitar", chords: "guitar", arp: "harp", bass: "upright", drums: "none" },
    mood: { busy: -0.3, space: 0.2 },
    ambience: { fire: 0.35, night: 0.4 },
  },
  cabin: {
    label: "Snowy cabin",
    blurb: "Felt piano and celesta inside a warm cabin while snow piles up outside",
    styles: ["snowfall", "cozy"], bpm: [72, 86], mode: "major",
    instruments: { lead: "feltPiano", chords: "warmPad", arp: "celesta", bass: "upright", drums: "none" },
    mood: { busy: -0.2, space: 0.2 },
    ambience: { fire: 0.3, wind: 0.2 },
    tape: 0.15,
  },
} satisfies Record<string, Preset>;

export type PresetId = keyof typeof presets;
export const PRESETS: Record<PresetId, Preset> = presets;

export const PRESET_GROUPS: [string, PresetId[]][] = [
  ["8-bit", ["platformer", "underground", "fortress", "shmup", "chipvillage", "saveroom", "pixelsnow", "fishing"]],
  ["16-bit", ["field", "village", "ruins", "finalboss", "inn", "spring", "rainytown", "flowers"]],
  ["3D and handheld", ["kart", "route", "mansion", "puzzle", "petcafe", "homemenu", "sunset", "shop"]],
  ["Modern indie", ["island", "farm", "caverns", "roguelike", "study", "garden", "camping", "cabin"]],
];

/**
 * The options a preset sets, with a tempo picked from its range. Everything a preset has no
 * opinion on (key, levels, a hand-made arrangement) goes back to the composer.
 */
export function presetOptions(id: PresetId, rnd: () => number): Partial<MusicOptions> {
  const p = PRESETS[id];
  return {
    styles: p.styles,
    bpm: Math.round(p.bpm[0] + rnd() * (p.bpm[1] - p.bpm[0])),
    key: undefined,
    mode: p.mode,
    instruments: p.instruments,
    mood: p.mood,
    levels: undefined,
    form: undefined,
    // No ambience in a preset means none, not the styles' own.
    ambience: p.ambience ?? {},
    tape: p.tape ?? 0,
  };
}

/** The preset these options still match, if any: same styles and same band. */
export function matchPreset(o: MusicOptions): PresetId | undefined {
  const same = (a: object = {}, b: object = {}) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  return (Object.keys(PRESETS) as PresetId[]).find((id) => PRESETS[id].styles.join() === o.styles.join() && PRESETS[id].mode === o.mode && same(PRESETS[id].instruments, o.instruments));
}
