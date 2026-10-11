import { ALL_LAYERS, DRUM_CHOICES, MAX_SECTION_BARS, MIN_SECTION_BARS, SECTION_LABELS, type Form, type Layers, type MusicOptions, type SectionKind } from "./compose";
import { PATCH_CHOICES } from "./patches";
import { MAX_BLEND, MODES, STYLES, type ModeId, type StyleId } from "./styles";

/**
 * Options come back from places that cannot be trusted to hold the current shape:
 * browser storage written by an older version, and links people share. Everything read
 * from either goes through cleanOptions, which keeps what is valid and drops the rest.
 */
export const MAX_SECTIONS = 24;
export const MAX_SECONDS = 300;
export const SECTION_KINDS = Object.keys(SECTION_LABELS) as SectionKind[];
const LAYER_KEYS = Object.keys(ALL_LAYERS) as (keyof Layers)[];

const num = (x: unknown, lo: number, hi: number): number | undefined => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? x : undefined);
const int = (x: unknown, lo: number, hi: number) => (Number.isInteger(x) ? num(x, lo, hi) : undefined);
const record = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
/** Drops keys whose value is undefined, and the whole object if nothing is left. */
function compact<T extends object>(o: T): T | undefined {
  const kept = Object.entries(o).filter(([, v]) => v !== undefined);
  return kept.length ? (Object.fromEntries(kept) as T) : undefined;
}

export function formSeconds(f: Form, loop: boolean): number {
  return (f.sections.reduce((a, x) => a + x.bars, 0) * 240) / f.bpm + (loop ? 0 : 3);
}

export function cleanForm(raw: unknown): Form | undefined {
  const f = record(raw);
  const bpm = num(f.bpm, 30, 300);
  if (!bpm || !Array.isArray(f.sections) || !f.sections.length || f.sections.length > MAX_SECTIONS) return undefined;
  const sections = f.sections.map((x) => {
    const s = record(x);
    const bars = int(s.bars, MIN_SECTION_BARS, MAX_SECTION_BARS);
    if (!SECTION_KINDS.includes(s.kind as SectionKind) || !bars || bars % 2) return null;
    return { kind: s.kind as SectionKind, bars, energy: num(s.energy, 0, 1), shift: int(s.shift, -12, 12) || undefined };
  });
  return sections.every((s) => s !== null) ? { bpm, sections } : undefined;
}

export function cleanOptions(raw: unknown): MusicOptions | null {
  const r = record(raw);
  // Tracks saved before styles could be blended hold a single `style`.
  const styles = (Array.isArray(r.styles) ? r.styles : [r.style]).filter((id): id is StyleId => typeof id === "string" && id in STYLES);
  const seed = int(r.seed, -0x80000000, 0xffffffff);
  if (!styles.length || styles.length > MAX_BLEND || seed === undefined) return null;

  const pick = <T extends string>(x: unknown, allowed: readonly T[]) => (allowed.includes(x as T) ? (x as T) : undefined);
  const perLayer = (x: unknown, lo: number, hi: number, whole: boolean) => {
    const o = record(x);
    return compact(Object.fromEntries(LAYER_KEYS.map((k) => [k, whole ? int(o[k], lo, hi) : num(o[k], lo, hi)])) as Partial<Record<keyof Layers, number>>);
  };
  const layers = record(r.layers);
  const inst = record(r.instruments);
  const mood = record(r.mood);

  return {
    styles,
    seconds: num(r.seconds, 5, MAX_SECONDS) ?? 60,
    loop: !!r.loop,
    seed,
    layers: Object.fromEntries(LAYER_KEYS.map((k) => [k, layers[k] !== false])) as unknown as Layers,
    form: cleanForm(r.form),
    bpm: num(r.bpm, 40, 240),
    key: int(r.key, 0, 11),
    mode: pick(r.mode, Object.keys(MODES) as ModeId[]),
    instruments: compact({
      lead: pick(inst.lead, PATCH_CHOICES.lead),
      chords: pick(inst.chords, PATCH_CHOICES.chords),
      arp: pick(inst.arp, PATCH_CHOICES.arp),
      bass: pick(inst.bass, PATCH_CHOICES.bass),
      drums: pick(inst.drums, DRUM_CHOICES.map((d) => d[0])),
    }),
    levels: perLayer(r.levels, 0, 2, false),
    rerolls: perLayer(r.rerolls, 1, 0xffffffff, true),
    mood: compact({ bright: num(mood.bright, -1, 1), busy: num(mood.busy, -1, 1), space: num(mood.space, -1, 1) }),
  };
}

/** Two sets of options are the same song when the same styles were composed from the same seed. */
export const sameSong = (a: MusicOptions, b: MusicOptions) => a.styles.join() === b.styles.join() && a.seed === b.seed;

const SHARE_PREFIX = "#m=";

export function encodeShare(o: MusicOptions): string {
  // JSON drops undefined fields by itself; URL-safe base64 keeps the link clickable everywhere.
  return SHARE_PREFIX + btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShare(hash: string): MusicOptions | null {
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  try {
    return cleanOptions(JSON.parse(atob(hash.slice(SHARE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/"))));
  } catch {
    return null;
  }
}
