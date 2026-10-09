/**
 * Materials turn the raw oscillator signal into "something hitting something".
 *
 * Solid materials are a bank of resonant modes that ring when excited (a knock on
 * wood, a clang on metal). Loose materials break the signal into many tiny grains,
 * each with its own colour (blades of grass, bits of gravel, bubbles in water).
 * Some use both.
 */
export interface MaterialDef {
  label: string;
  /** Resonant modes: [frequency Hz, gain, time to ring out in seconds]. */
  modes: [number, number, number][];
  /** How much of the un-resonated signal stays in alongside the modes. */
  direct: number;
  grain?: {
    /** Grains per second. */
    rate: number;
    /** Grain fade time in seconds. */
    len: number;
    /** Each grain is band-passed somewhere between lo and hi Hz. */
    lo: number;
    hi: number;
    q: number;
    /** Pitch rise within a grain in octaves per second (bubbles). */
    chirp?: number;
  };
}

export const MATERIALS = {
  wood: {
    label: "Wood",
    modes: [[180, 1, 0.09], [410, 0.7, 0.06], [690, 0.5, 0.045], [1120, 0.35, 0.03], [1730, 0.2, 0.02]],
    direct: 0.25,
  },
  hollow: {
    label: "Hollow wood",
    modes: [[110, 1, 0.18], [240, 0.8, 0.14], [385, 0.5, 0.1], [720, 0.3, 0.06]],
    direct: 0.15,
  },
  stone: {
    label: "Stone",
    modes: [[320, 0.5, 0.04], [850, 1, 0.025], [1650, 0.8, 0.02], [2700, 0.6, 0.015], [4300, 0.4, 0.01]],
    direct: 0.5,
  },
  metal: {
    label: "Metal",
    modes: [[420, 1, 0.9], [1130, 0.8, 0.7], [1870, 0.6, 0.6], [2990, 0.5, 0.45], [4410, 0.35, 0.3], [6200, 0.2, 0.2]],
    direct: 0.1,
  },
  glass: {
    label: "Glass",
    modes: [[1400, 1, 0.35], [2950, 0.8, 0.28], [4700, 0.6, 0.2], [6900, 0.4, 0.14], [9300, 0.25, 0.1]],
    direct: 0.15,
  },
  plastic: {
    label: "Plastic",
    modes: [[320, 1, 0.035], [870, 0.7, 0.025], [1500, 0.4, 0.018]],
    direct: 0.4,
  },
  flesh: {
    label: "Flesh",
    modes: [[90, 1, 0.06], [160, 0.7, 0.045], [260, 0.3, 0.03]],
    direct: 0.2,
  },
  dirt: {
    label: "Dirt",
    modes: [[80, 1, 0.06], [140, 0.6, 0.05]],
    direct: 0.6,
    grain: { rate: 500, len: 0.012, lo: 150, hi: 900, q: 1.2 },
  },
  grass: {
    label: "Grass",
    modes: [],
    direct: 1,
    grain: { rate: 900, len: 0.006, lo: 2500, hi: 9000, q: 1.5 },
  },
  leaves: {
    label: "Leaves",
    modes: [],
    direct: 1,
    grain: { rate: 260, len: 0.004, lo: 1800, hi: 7000, q: 3 },
  },
  gravel: {
    label: "Gravel",
    modes: [[1200, 0.4, 0.012], [2600, 0.3, 0.01]],
    direct: 0.8,
    grain: { rate: 160, len: 0.008, lo: 700, hi: 4500, q: 4 },
  },
  sand: {
    label: "Sand",
    modes: [],
    direct: 1,
    grain: { rate: 3000, len: 0.003, lo: 3000, hi: 10000, q: 0.9 },
  },
  snow: {
    label: "Snow",
    modes: [],
    direct: 1,
    grain: { rate: 420, len: 0.012, lo: 500, hi: 2600, q: 2.5 },
  },
  water: {
    label: "Water",
    modes: [],
    direct: 1,
    grain: { rate: 70, len: 0.03, lo: 350, hi: 2200, q: 14, chirp: 12 },
  },
  cloth: {
    label: "Cloth",
    modes: [],
    direct: 1,
    grain: { rate: 1500, len: 0.01, lo: 300, hi: 2200, q: 0.8 },
  },
} satisfies Record<string, MaterialDef>;

export type Material = "none" | keyof typeof MATERIALS;
export const MATERIAL_IDS: Material[] = ["none", ...(Object.keys(MATERIALS) as (keyof typeof MATERIALS)[])];

export function materialLabel(m: Material): string {
  return m === "none" ? "None" : MATERIALS[m].label;
}
