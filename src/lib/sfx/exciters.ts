import type { SoundParams } from "./params";

export type P = Partial<SoundParams>;

// Things that excite a material. The material section then decides what it sounds like.
export const TAP: P = { wave: "noise", frequency: 6000, sustain: 0.003, decay: 0.025 };
export const FIST: P = { wave: "sine", frequency: 130, slide: -5, noiseMix: 0.6, sustain: 0.004, punch: 0.6, decay: 0.05 };
export const HARD_STEP: P = { wave: "sine", frequency: 110, slide: -4, noiseMix: 0.7, sustain: 0.003, decay: 0.04 };
export const SOFT_STEP: P = { wave: "noise", frequency: 5000, attack: 0.004, sustain: 0.03, decay: 0.08 };
export const RUSTLE: P = { wave: "noise", frequency: 6000, attack: 0.1, sustain: 0.5, decay: 0.4, tremDepth: 0.5, tremRate: 3 };
