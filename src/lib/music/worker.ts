import { compose, type MusicOptions, type ScoreInfo } from "./compose";
import { renderScore } from "./render";

/** Composing and rendering a few minutes of audio takes seconds, so it happens off the main thread. */
export type WorkerReply =
  | { type: "progress"; fraction: number }
  | { type: "done"; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer>; info: ScoreInfo };

const post = (reply: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);

self.onmessage = (e: MessageEvent<MusicOptions>) => {
  const score = compose(e.data);
  const { left, right } = renderScore(score, e.data.seed, (fraction) => post({ type: "progress", fraction }));
  const { style, recipe, bpm, key, bars, seconds, sections, instruments } = score;
  post({ type: "done", left, right, info: { style, recipe, bpm, key, bars, seconds, sections, instruments } }, [left.buffer, right.buffer]);
};
