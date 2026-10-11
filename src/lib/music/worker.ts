import { wavBytes } from "../sfx/synth";
import { ALL_LAYERS, STINGERS, compose, type Form, type Layers, type MusicOptions, type ScoreInfo, type StingerKind } from "./compose";
import { renderScore } from "./render";
import { zip, type ZipEntry } from "./zip";

/** Composing and rendering a few minutes of audio takes seconds, so it happens off the main thread. */
export type ExportKind = "stems" | "variants" | "introloop" | "stingers";
export type WorkerJob = { job: "track"; opts: MusicOptions } | { job: ExportKind; opts: MusicOptions };
export type WorkerReply =
  | { type: "progress"; fraction: number }
  | { type: "done"; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer>; info: ScoreInfo }
  | { type: "file"; suffix: string; bytes: ArrayBuffer };

const post = (reply: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);

/** Renders options to WAV bytes. `share` is this render's slice of the progress bar. */
function wav(opts: MusicOptions, share: [number, number], gain?: number, cut?: boolean) {
  const [from, to] = share;
  const r = renderScore(compose(opts), opts.seed, (f) => post({ type: "progress", fraction: from + (to - from) * f }), { gain, cut });
  return { data: new Uint8Array(wavBytes(r.left, r.right)), gain: r.gain };
}

/** The arrangement of a track as an editable form, whether it was planned by hand or by the composer. */
function formOf(opts: MusicOptions): Form {
  const info = compose(opts);
  return { bpm: info.bpm, sections: info.sections.map(({ kind, bars, energy, shift }) => ({ kind, bars, energy, shift })) };
}

const NOTES: Record<ExportKind, string> = {
  stems:
    "One file per layer, all the same length and starting together.\nPlay them at once to get the full mix, and fade them in and out to change the mood as the game changes.\n\nmix.wav is the finished track. The stems add up to it, less the final limiter, so their sum can peak a little higher.\n",
  variants:
    "The same track at three intensities. All three are the same length and line up bar for bar,\nso you can crossfade between them at any moment: calm for exploring, intense for a fight.\n",
  introloop:
    "1-start.wav  play this once. It is an intro followed by the first pass through the loop.\n2-loop.wav   then repeat this for as long as you need.\n\nThe first file ends exactly where the second begins, so they join without a gap.\n",
  stingers: "Short jingles in the same key and instruments as the track, for wins, losses and rewards.\n",
};

function exportFiles(kind: ExportKind, opts: MusicOptions): ZipEntry[] {
  const files: ZipEntry[] = [];
  if (kind === "stems") {
    const layers = (Object.keys(ALL_LAYERS) as (keyof Layers)[]).filter((k) => opts.layers[k]);
    const mix = wav(opts, [0, 1 / (layers.length + 1)]);
    files.push({ name: "mix.wav", data: mix.data });
    layers.forEach((layer, i) => {
      const solo = { ...opts, layers: Object.fromEntries(Object.keys(ALL_LAYERS).map((k) => [k, k === layer])) as unknown as Layers };
      const score = compose(solo);
      if (!score.tracks.length && !score.drums.length) return;
      files.push({ name: `${layer}.wav`, data: wav(solo, [(i + 1) / (layers.length + 1), (i + 2) / (layers.length + 1)], mix.gain).data });
    });
  } else if (kind === "variants") {
    const form = formOf(opts);
    const body = (k: string) => k !== "intro" && k !== "outro";
    const scaled = (f: (energy: number, kind: string) => number): MusicOptions => ({
      ...opts,
      form: { ...form, sections: form.sections.map((s) => (body(s.kind) ? { ...s, energy: f(s.energy ?? 0.7, s.kind) } : s)) },
    });
    // The normal version sets the level, so calm really is quieter and intense really is louder.
    const normal = wav({ ...opts, form }, [0, 1 / 3]);
    files.push({ name: "1-calm.wav", data: wav(scaled((e) => Math.min(0.42, Math.max(0.3, e * 0.5))), [1 / 3, 2 / 3], normal.gain).data });
    files.push({ name: "2-normal.wav", data: normal.data });
    files.push({ name: "3-intense.wav", data: wav(scaled((e, k) => (k === "c" ? Math.max(e, 0.7) : 1)), [2 / 3, 1], normal.gain).data });
  } else if (kind === "introloop") {
    const form = formOf(opts);
    const loop = wav({ ...opts, loop: true, form }, [0, 0.5]);
    const start: Form = { ...form, sections: [{ kind: "intro", bars: 4 }, ...form.sections] };
    // Cut dead at the loop point: whatever is still ringing there is already folded into the loop's first bars.
    files.push({ name: "1-start.wav", data: wav({ ...opts, loop: true, form: start }, [0.5, 1], loop.gain, true).data });
    files.push({ name: "2-loop.wav", data: loop.data });
  } else {
    (Object.keys(STINGERS) as StingerKind[]).forEach((stinger, i, all) => {
      files.push({ name: `${stinger}.wav`, data: wav({ ...opts, loop: false, form: undefined, stinger }, [i / all.length, (i + 1) / all.length]).data });
    });
  }
  files.push({ name: "README.txt", data: new TextEncoder().encode(NOTES[kind]) });
  return files;
}

self.onmessage = (e: MessageEvent<WorkerJob>) => {
  const { job, opts } = e.data;
  if (job === "track") {
    const score = compose(opts);
    const { left, right } = renderScore(score, opts.seed, (fraction) => post({ type: "progress", fraction }));
    const { style, recipe, bpm, key, bars, seconds, sections, instruments } = score;
    post({ type: "done", left, right, info: { style, recipe, bpm, key, bars, seconds, sections, instruments } }, [left.buffer, right.buffer]);
    return;
  }
  const bytes = zip(exportFiles(job, opts)).buffer;
  post({ type: "file", suffix: job, bytes }, [bytes]);
};
