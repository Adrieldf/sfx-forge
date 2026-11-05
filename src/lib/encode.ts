import { SAMPLE_RATE, wavBytes } from "./sfx/synth";

/** The file types a sound or track can be saved as. */
export type AudioFormat = "wav" | "ogg" | "mp3";

export const FORMATS: Record<AudioFormat, { label: string; mime: string; hint: string }> = {
  wav: { label: "WAV", mime: "audio/wav", hint: "16-bit, 44.1 kHz, uncompressed. Works everywhere" },
  ogg: { label: "OGG", mime: "audio/ogg", hint: "Ogg Vorbis, about a tenth the size of WAV. Unity, Godot, Unreal, GameMaker and the web; loops without a gap" },
  mp3: { label: "MP3", mime: "audio/mpeg", hint: "Plays in every browser and most engines. MP3 pads the start and end with a few ms of silence, so use OGG for loops" },
};
export const FORMAT_LIST = Object.keys(FORMATS) as AudioFormat[];

export const isFormat = (v: unknown): v is AudioFormat => typeof v === "string" && v in FORMATS;

/** Fed to the encoders a slice at a time, so their memory stays small however long the track. */
const CHUNK = 1 << 16;

/** Encodes mono, or stereo when a right channel is given. The Vorbis and LAME encoders only load the first time they are needed. */
export async function encodeAudio(
  format: AudioFormat,
  left: Float32Array,
  right?: Float32Array,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (format === "wav") return new Uint8Array(wavBytes(left, right));
  const lib = await import("wasm-media-encoders");
  const channels = right ? 2 : 1;
  const parts: Uint8Array[] = [];
  // What the encoders hand back is a view into their own memory, only good until the next call.
  const keep = (b: Uint8Array) => b.length && parts.push(b.slice());
  if (format === "ogg") {
    const enc = await lib.createOggEncoder();
    enc.configure({ channels, sampleRate: SAMPLE_RATE, vbrQuality: 6 });
    for (let i = 0; i < left.length; i += CHUNK) {
      keep(enc.encode(slice(left, right, i)));
      onProgress?.(i / left.length);
    }
    keep(enc.finalize());
  } else {
    const enc = await lib.createMp3Encoder();
    enc.configure({ channels, sampleRate: SAMPLE_RATE, outputSampleRate: SAMPLE_RATE, vbrQuality: 2 });
    for (let i = 0; i < left.length; i += CHUNK) {
      keep(enc.encode(slice(left, right, i)));
      onProgress?.(i / left.length);
    }
    keep(enc.finalize());
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function slice(left: Float32Array, right: Float32Array | undefined, i: number): Float32Array[] {
  const l = left.subarray(i, i + CHUNK);
  return right ? [l, right.subarray(i, i + CHUNK)] : [l];
}

const KEY = "sfx-forge:format";

/** The format last picked, shared by the sound and music studios. */
export function savedFormat(): AudioFormat {
  try {
    const v = localStorage.getItem(KEY);
    return isFormat(v) ? v : "wav";
  } catch {
    return "wav";
  }
}

export function saveFormat(f: AudioFormat) {
  try {
    localStorage.setItem(KEY, f);
  } catch {
    // Only a convenience: the picker still works for this visit.
  }
}
