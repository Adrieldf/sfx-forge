/**
 * A melody is a short text score: steps separated by spaces, each step a pitch in
 * semitones relative to the Frequency slider.
 *
 *   "0 4 7 12"     four notes going up a major chord
 *   "0 - 0"        a note, a rest, the note again
 *   "0 7+12+16"    a note, then three notes at once
 *
 * Every step plays the whole sound (oscillator, pitch motion, envelope) once.
 */
const MAX_STEPS = 32;
const MAX_CHORD = 6;

export function parseMelody(text: string): number[][] {
  const steps = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_STEPS)
    .map((token) =>
      token
        .split("+")
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .slice(0, MAX_CHORD)
        .map((n) => Math.max(-48, Math.min(48, n))),
    );
  // Trailing rests would only add silence.
  while (steps.length && !steps[steps.length - 1].length) steps.pop();
  return steps.length ? steps : [[0]];
}

/** Keeps only the characters a melody can contain. */
export function cleanMelody(text: string): string {
  return text.replace(/[^0-9+\-. ]/g, "").slice(0, 160);
}

export const MELODY_PATTERNS: { label: string; melody: string }[] = [
  { label: "Single", melody: "" },
  { label: "Double", melody: "0 0" },
  { label: "Up", melody: "0 4 7 12" },
  { label: "Down", melody: "12 7 4 0" },
  { label: "Minor up", melody: "0 3 7 12" },
  { label: "Minor down", melody: "12 7 3 0" },
  { label: "Octaves", melody: "0 12 0 12" },
  { label: "Fanfare", melody: "0 0 0 4 - 0 4 7+12" },
  { label: "Chord", melody: "0+4+7" },
  { label: "Sad", melody: "0 -1 -3 -7" },
  { label: "Alarm", melody: "0 6 0 6" },
  { label: "Scale", melody: "0 2 4 5 7 9 11 12" },
];
