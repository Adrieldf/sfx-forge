import type { DrumKind, Score } from "./compose";
import type { PatchId } from "./patches";

/** The closest General MIDI program to each instrument, so the file sounds roughly right anywhere. */
const PROGRAM: Record<PatchId, number> = {
  warmPad: 89, glassPad: 92, stringPad: 48, choir: 52, stab: 62,
  sawLead: 81, squareLead: 80, softLead: 73, triLead: 79, brass: 61, overdrive: 29, chipArp: 80,
  subBass: 33, sawBass: 38, squareBass: 39, pluckBass: 32,
  epiano: 4, piano: 0, organ: 16, bell: 9, kalimba: 108, musicBox: 10, marimba: 12,
  harp: 46, guitar: 24,
};
const DRUM_NOTE: Record<DrumKind, number> = {
  kick: 36, snare: 38, clap: 39, rim: 37, hat: 42, ohat: 46, shaker: 70,
  tomh: 50, tomm: 47, toml: 43, crash: 49, congah: 62, congal: 64, clave: 75,
};
const PPQ = 480;

function varLen(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

function chunk(id: string, body: number[]): number[] {
  const n = body.length;
  return [...id].map((c) => c.charCodeAt(0)).concat([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255], body);
}

/** Turns absolutely-timed events into a track: sorted, with delta times, ending in End of Track. */
function track(events: { tick: number; bytes: number[] }[]): number[] {
  // Note-offs sort before note-ons at the same tick, so repeated notes are not cut short.
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0));
  const body: number[] = [];
  let at = 0;
  for (const e of events) {
    body.push(...varLen(e.tick - at), ...e.bytes);
    at = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return chunk("MTrk", body);
}

/** A standard MIDI file (format 1) of a score: one track per instrument, drums on channel 10. */
export function scoreToMidi(score: Score): Uint8Array<ArrayBuffer> {
  const ticks = (seconds: number) => Math.max(0, Math.round((seconds * score.bpm * PPQ) / 60));
  const name = (text: string) => ({ tick: 0, bytes: [0xff, 0x03, text.length, ...[...text].map((c) => c.charCodeAt(0) & 0x7f)] });
  const usPerBeat = Math.round(60e6 / score.bpm);

  const tracks: number[][] = [
    track([
      { tick: 0, bytes: [0xff, 0x51, 3, (usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255] },
      { tick: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
    ]),
  ];

  // Channel 10 (index 9) belongs to the drums, so the instruments skip it.
  score.tracks.slice(0, 15).forEach((t, i) => {
    const ch = i >= 9 ? i + 1 : i;
    const events = [name(`${t.role} - ${t.patch}`), { tick: 0, bytes: [0xc0 | ch, PROGRAM[t.patch]] }];
    for (const n of t.notes) {
      const pitch = Math.min(127, Math.max(0, n.midi));
      events.push({ tick: ticks(n.t), bytes: [0x90 | ch, pitch, Math.max(1, Math.round(n.vel * 127))] });
      events.push({ tick: Math.max(ticks(n.t) + 1, ticks(n.t + n.d)), bytes: [0x80 | ch, pitch, 0] });
    }
    tracks.push(track(events));
  });

  if (score.drums.length) {
    const events = [name("drums")];
    for (const d of score.drums) {
      events.push({ tick: ticks(d.t), bytes: [0x99, DRUM_NOTE[d.kind], Math.max(1, Math.round(d.vel * 127))] });
      events.push({ tick: ticks(d.t) + 30, bytes: [0x89, DRUM_NOTE[d.kind], 0] });
    }
    tracks.push(track(events));
  }

  const header = chunk("MThd", [0, 1, (tracks.length >> 8) & 255, tracks.length & 255, PPQ >> 8, PPQ & 255]);
  return new Uint8Array(header.concat(...tracks));
}
