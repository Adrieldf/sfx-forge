import { SAMPLE_RATE, mulberry32 } from "../sfx/synth";
import type { DrumKind, Score } from "./compose";
import { PATCHES, type FmPatch, type PluckPatch, type SubPatch } from "./patches";

const sr = SAMPLE_RATE;
const TAU = Math.PI * 2;
/** Seconds of reverb and echo folded back to the start of a loop. */
const LOOP_TAIL = 4;
const DUCK_HOP = 64;

// Every note is rendered into this scratch pair first, then mixed into the buses.
let noteL = new Float32Array(sr * 4);
let noteR = new Float32Array(sr * 4);
let noteStereo = false;
function reserve(n: number) {
  if (noteL.length < n) {
    noteL = new Float32Array(Math.ceil(n * 1.5));
    noteR = new Float32Array(noteL.length);
  }
}

/** Rounds off the step of a saw or pulse wave so it does not alias. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

// ---------- instruments: each fills the scratch buffers and returns the sample count ----------

function playSub(p: SubPatch, f0: number, dur: number, vel: number, rnd: () => number): number {
  const m = Math.ceil((dur + p.r * 5) * sr);
  reserve(m);
  const nv = p.voices ?? 1;
  const stereo = (noteStereo = nv > 1 && (p.width ?? 0) > 0);
  const phase = new Float64Array(nv);
  const inc = new Float64Array(nv);
  const gl = new Float64Array(nv);
  const gr = new Float64Array(nv);
  for (let v = 0; v < nv; v++) {
    const x = nv > 1 ? (v / (nv - 1)) * 2 - 1 : 0;
    phase[v] = rnd();
    inc[v] = (f0 * Math.pow(2, (x * (p.detune ?? 0)) / 1200)) / sr;
    const angle = ((x * (p.width ?? 0) + 1) * Math.PI) / 4;
    gl[v] = stereo ? Math.cos(angle) * Math.SQRT2 : 1;
    gr[v] = Math.sin(angle) * Math.SQRT2;
  }
  const saw = p.wave === "saw";
  const pulse = p.wave === "pulse";
  const duty = p.duty ?? 0.5;
  const norm = vel / Math.sqrt(nv);

  const aN = Math.max(1, p.a * sr);
  const durN = dur * sr;
  const kd = Math.exp(-1 / (p.d * sr));
  const kr = Math.exp(-1 / (p.r * sr));
  let dec = 1;
  let rel = 1;

  const filter = p.cut < 18000;
  const base = p.cut * Math.pow(f0 / 261.63, p.track ?? 0) * (0.75 + 0.25 * vel);
  const kf = Math.exp(-16 / ((p.fd ?? 0.2) * sr));
  const k = 1 / (p.q ?? 0.707);
  let fenv = 1;
  let a1 = 0, a2 = 0, a3 = 0;
  let l1 = 0, l2 = 0, r1 = 0, r2 = 0;

  const vibDepth = p.vib ? Math.pow(2, p.vib / 12) - 1 : 0;
  let vib = 1;
  let subPhase = 0;
  const subInc = f0 / 2 / sr;
  const sub = p.sub ?? 0;

  for (let i = 0; i < m; i++) {
    // Filter and vibrato move slowly enough to update every 16 samples.
    if ((i & 15) === 0) {
      if (filter) {
        const g = Math.tan((Math.PI * Math.min(base * Math.pow(2, (p.env ?? 0) * fenv), sr * 0.45)) / sr);
        fenv *= kf;
        a1 = 1 / (1 + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
      }
      if (vibDepth) {
        const t = i / sr - (p.vibDelay ?? 0);
        vib = t > 0 ? 1 + vibDepth * Math.min(1, t / 0.25) * Math.sin(TAU * (p.vibRate ?? 5) * t) : 1;
      }
    }

    let l = 0;
    let r = 0;
    for (let v = 0; v < nv; v++) {
      const dt = inc[v] * vib;
      let x = phase[v] + dt;
      x -= Math.floor(x);
      phase[v] = x;
      let w: number;
      if (saw) w = 2 * x - 1 - blep(x, dt);
      else if (pulse) {
        let y = x + 1 - duty;
        y -= Math.floor(y);
        w = (x < duty ? 1 : -1) + blep(x, dt) - blep(y, dt);
      } else w = 1 - 4 * Math.abs(x - 0.5);
      l += w * gl[v];
      if (stereo) r += w * gr[v];
    }
    if (sub) {
      subPhase += subInc;
      const s = Math.sin(TAU * subPhase) * sub;
      l += s;
      r += s;
    }

    let e: number;
    if (i < aN) e = i / aN;
    else {
      dec *= kd;
      e = p.s + (1 - p.s) * dec;
    }
    if (i > durN) {
      rel *= kr;
      e *= rel;
    }

    if (filter) {
      let v3 = l - l2;
      let v1 = a1 * l1 + a2 * v3;
      let v2 = l2 + a2 * l1 + a3 * v3;
      l1 = 2 * v1 - l1;
      l2 = 2 * v2 - l2;
      l = v2;
      if (stereo) {
        v3 = r - r2;
        v1 = a1 * r1 + a2 * v3;
        v2 = r2 + a2 * r1 + a3 * v3;
        r1 = 2 * v1 - r1;
        r2 = 2 * v2 - r2;
        r = v2;
      }
    }
    noteL[i] = l * e * norm;
    if (stereo) noteR[i] = r * e * norm;
  }
  return m;
}

function playFm(p: FmPatch, f0: number, dur: number, vel: number): number {
  const m = Math.ceil((dur + p.r * 5) * sr);
  reserve(m);
  const spread = Math.pow(2, (p.spread ?? 0) / 1200) - 1;
  noteStereo = spread > 0;
  const incL = (f0 * (1 + spread)) / sr;
  const incR = (f0 * (1 - spread)) / sr;
  const incM = (f0 * p.ratio) / sr;
  const incT = (f0 * (p.ratio2 ?? 0)) / sr;
  const index = p.index * (0.5 + 0.5 * vel);
  const tine = (p.index2 ?? 0) * vel;
  const ki = Math.exp(-1 / (p.idecay * sr));
  const kt = Math.exp(-1 / (0.03 * sr));
  const aN = Math.max(1, p.a * sr);
  const durN = dur * sr;
  const kd = Math.exp(-1 / (p.d * sr));
  const kr = Math.exp(-1 / (p.r * sr));
  let pl = 0, pr = 0, pm = 0, pt = 0;
  let ienv = 1, tenv = 1, dec = 1, rel = 1;

  for (let i = 0; i < m; i++) {
    let mod = index * (p.isus + (1 - p.isus) * ienv) * Math.sin(TAU * pm);
    ienv *= ki;
    pm += incM;
    if (tine) {
      mod += tine * tenv * Math.sin(TAU * pt);
      tenv *= kt;
      pt += incT;
    }
    let e: number;
    if (i < aN) e = i / aN;
    else {
      dec *= kd;
      e = p.s + (1 - p.s) * dec;
    }
    if (i > durN) {
      rel *= kr;
      e *= rel;
    }
    if (i > aN && e < 1e-4) return i;
    e *= vel;
    pl += incL;
    pr += incR;
    noteL[i] = Math.sin(TAU * pl + mod) * e;
    noteR[i] = Math.sin(TAU * pr + mod) * e;
  }
  return m;
}

/** Karplus-Strong: a burst of noise circulating in a delay line one period long. */
function playPluck(p: PluckPatch, f0: number, dur: number, vel: number, rnd: () => number): number {
  const m = Math.ceil((dur + 0.5) * sr);
  reserve(m);
  noteStereo = false;
  // The loop filter delays the signal a little; an all-pass makes up the fraction so the string stays in tune.
  const blend = 0.5 + 0.4 * p.bright;
  const want = sr / f0 - (1 - blend);
  let n = Math.floor(want);
  let frac = want - n;
  if (frac < 0.1) {
    n--;
    frac += 1;
  }
  n = Math.max(2, n);
  const c = (1 - frac) / (1 + frac);
  const rho = Math.pow(10, -3 / (f0 * p.ring * Math.sqrt(261.63 / f0)));
  const release = Math.exp(-1 / (0.09 * sr));
  const durN = dur * sr;

  const buf = new Float32Array(n);
  const soften = 0.15 + 0.85 * p.bright * (0.4 + 0.6 * vel);
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    lp += soften * (rnd() * 2 - 1 - lp);
    buf[i] = lp;
    mean += lp;
  }
  mean /= n;
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs((buf[i] -= mean)));
  // Low strings lose their harmonics fast and would otherwise sound much quieter than high ones.
  const gain = (vel / peak) * Math.min(2, Math.max(0.8, Math.sqrt(330 / f0)));

  let idx = 0;
  let x1 = 0, apIn = 0, apOut = 0;
  let damp = 1;
  for (let i = 0; i < m; i++) {
    const x = buf[idx];
    const low = blend * x + (1 - blend) * x1;
    x1 = x;
    const y = c * low + apIn - c * apOut;
    apIn = low;
    apOut = y;
    if (i > durN) damp = release;
    buf[idx] = y * rho * damp;
    if (++idx >= n) idx = 0;
    noteL[i] = x * gain;
  }
  return m;
}

function playDrum(kind: DrumKind, vel: number, rnd: () => number): number {
  noteStereo = false;
  const noise = () => rnd() * 2 - 1;
  const fill = (seconds: number, fn: (t: number, i: number) => number) => {
    const m = Math.ceil(seconds * sr);
    reserve(m);
    for (let i = 0; i < m; i++) noteL[i] = fn(i / sr, i) * vel;
    return m;
  };
  // One-pole low-pass state, used to build cheap high-passed noise (noise minus its lows).
  let lp = 0;
  const hiss = (cutoff: number) => {
    const c = 1 - Math.exp((-TAU * cutoff) / sr);
    return () => {
      const x = noise();
      lp += c * (x - lp);
      return x - lp;
    };
  };
  let phase = 0;
  const sweep = (from: number, to: number, fall: number) => (t: number) => {
    phase += (to + (from - to) * Math.exp(-t / fall)) / sr;
    return Math.sin(TAU * phase);
  };

  switch (kind) {
    case "kick": {
      const body = sweep(160, 46, 0.035);
      return fill(0.4, (t) => Math.tanh((body(t) * Math.exp(-t / 0.15) + noise() * 0.25 * Math.exp(-t / 0.003)) * 1.6));
    }
    case "snare": {
      const h = hiss(1800);
      return fill(0.3, (t) => Math.sin(TAU * 185 * t) * 0.5 * Math.exp(-t / 0.06) + Math.sin(TAU * 331 * t) * 0.25 * Math.exp(-t / 0.035) + h() * 0.85 * Math.exp(-t / 0.1));
    }
    case "clap": {
      const h = hiss(900);
      return fill(0.3, (t) => {
        const burst = Math.max(Math.exp(-t / 0.008), t > 0.011 ? Math.exp(-(t - 0.011) / 0.008) : 0, t > 0.022 ? Math.exp(-(t - 0.022) / 0.09) : 0);
        return h() * burst * 0.9;
      });
    }
    case "rim":
      return fill(0.08, (t) => Math.sin(TAU * 820 * t) * 0.7 * Math.exp(-t / 0.012) + Math.sin(TAU * 1730 * t) * 0.3 * Math.exp(-t / 0.008) + noise() * 0.3 * Math.exp(-t / 0.003));
    case "hat": {
      const h = hiss(7000);
      return fill(0.1, (t) => h() * Math.exp(-t / 0.022));
    }
    case "ohat": {
      const h = hiss(6500);
      return fill(0.45, (t) => h() * Math.exp(-t / 0.13));
    }
    case "shaker": {
      const h = hiss(5000);
      return fill(0.14, (t) => h() * Math.min(1, t / 0.012) * Math.exp(-t / 0.035) * 0.9);
    }
    case "crash": {
      const h = hiss(4000);
      return fill(1.8, (t) => h() * (0.6 * Math.exp(-t / 0.5) + 0.4 * Math.exp(-t / 0.05)));
    }
    default: {
      const pitch = kind === "tomh" ? 190 : kind === "tomm" ? 140 : 100;
      const body = sweep(pitch * 1.7, pitch, 0.03);
      return fill(0.45, (t) => body(t) * Math.exp(-t / 0.16) + noise() * 0.15 * Math.exp(-t / 0.004));
    }
  }
}

const DRUM_MIX: Record<DrumKind, { gain: number; pan: number; reverb: number }> = {
  kick: { gain: 0.7, pan: 0, reverb: 0 },
  snare: { gain: 0.45, pan: 0, reverb: 0.2 },
  clap: { gain: 0.42, pan: 0, reverb: 0.25 },
  rim: { gain: 0.4, pan: -0.15, reverb: 0.25 },
  hat: { gain: 0.16, pan: 0.25, reverb: 0.05 },
  ohat: { gain: 0.15, pan: 0.25, reverb: 0.08 },
  shaker: { gain: 0.2, pan: 0.3, reverb: 0.1 },
  tomh: { gain: 0.5, pan: -0.3, reverb: 0.2 },
  tomm: { gain: 0.5, pan: 0, reverb: 0.2 },
  toml: { gain: 0.55, pan: 0.3, reverb: 0.2 },
  crash: { gain: 0.2, pan: -0.2, reverb: 0.3 },
};

// ---------- space ----------

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];

/** One channel of a Freeverb-style reverb; `offset` detunes it from its twin for width. */
class Verb {
  private combs: Float32Array[];
  private pos: Int32Array;
  private lows: Float64Array;
  private aps: Float32Array[];
  private apPos: Int32Array;
  private feedback: number;
  private damp: number;
  constructor(offset: number, size: number) {
    this.combs = COMBS.map((n) => new Float32Array(n + offset));
    this.pos = new Int32Array(COMBS.length);
    this.lows = new Float64Array(COMBS.length);
    this.aps = ALLPASSES.map((n) => new Float32Array(n + offset));
    this.apPos = new Int32Array(ALLPASSES.length);
    this.feedback = 0.72 + size * 0.25;
    this.damp = 0.25 + 0.15 * (1 - size);
  }
  process(x: number): number {
    let wet = 0;
    for (let c = 0; c < 8; c++) {
      const buf = this.combs[c];
      const i = this.pos[c];
      const y = buf[i];
      const low = (this.lows[c] = y * (1 - this.damp) + this.lows[c] * this.damp);
      buf[i] = x + low * this.feedback;
      this.pos[c] = i + 1 >= buf.length ? 0 : i + 1;
      wet += y;
    }
    for (let a = 0; a < 4; a++) {
      const buf = this.aps[a];
      const i = this.apPos[a];
      const y = buf[i];
      buf[i] = wet + y * 0.5;
      this.apPos[a] = i + 1 >= buf.length ? 0 : i + 1;
      wet = y - wet;
    }
    return wet;
  }
}

// ---------- the mix ----------

/** Plays a score. Returns left and right channels at SAMPLE_RATE, exactly `score.seconds` long. */
export function renderScore(score: Score, seed: number, onProgress?: (fraction: number) => void): { left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> } {
  const outN = Math.round(score.seconds * sr);
  const tailN = score.loop ? Math.min(outN, LOOP_TAIL * sr) : 0;
  const n = outN + tailN;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const revSend = new Float32Array(n);
  const delSend = new Float32Array(n);
  const rnd = mulberry32(seed ^ 0x5f3759df);

  // How far the kick pushes everything else down, sampled every DUCK_HOP samples.
  const duck = new Float32Array(Math.ceil(n / DUCK_HOP) + 2);
  for (const d of score.drums) {
    if (d.kind !== "kick") continue;
    const from = Math.floor((d.t * sr) / DUCK_HOP);
    for (let j = from; j < duck.length; j++) {
      const t = ((j - from) * DUCK_HOP) / sr;
      if (t > 0.6) break;
      duck[j] = Math.max(duck[j], Math.min(1, t / 0.006) * Math.exp(-t / 0.16) * d.vel);
    }
  }

  const mixIn = (start: number, m: number, gain: number, pan: number, reverb: number, delay: number, ducking: number) => {
    const angle = ((pan + 1) * Math.PI) / 4;
    const gl = gain * Math.cos(angle);
    const gr = gain * Math.sin(angle);
    const end = Math.min(m, n - start);
    for (let i = 0; i < end; i++) {
      const j = start + i;
      let l = noteL[i];
      let r = noteStereo ? noteR[i] : l;
      if (ducking) {
        const x = j / DUCK_HOP;
        const k = Math.floor(x);
        const g = 1 - ducking * (duck[k] + (duck[k + 1] - duck[k]) * (x - k));
        l *= g;
        r *= g;
      }
      L[j] += l * gl;
      R[j] += r * gr;
      const mono = (l + r) * 0.5 * gain;
      revSend[j] += mono * reverb;
      delSend[j] += mono * delay;
    }
  };

  const totalNotes = score.tracks.reduce((a, t) => a + t.notes.length, 0) + score.drums.length;
  let done = 0;
  const tick = () => {
    if ((++done & 63) === 0) onProgress?.((done / totalNotes) * 0.7);
  };

  for (const tr of score.tracks) {
    const patch = PATCHES[tr.patch];
    for (const ev of tr.notes) {
      const f0 = 440 * Math.pow(2, (ev.midi - 69) / 12);
      const m = patch.kind === "sub" ? playSub(patch, f0, ev.d, ev.vel, rnd) : patch.kind === "fm" ? playFm(patch, f0, ev.d, ev.vel) : playPluck(patch, f0, ev.d, ev.vel, rnd);
      mixIn(Math.floor(ev.t * sr), m, tr.gain, tr.pan, tr.reverb, tr.delay * score.delay.mix, tr.duck);
      tick();
    }
  }

  const tone = score.drumTone < 15000 ? 1 - Math.exp((-TAU * score.drumTone) / sr) : 0;
  for (const d of score.drums) {
    const m = playDrum(d.kind, d.vel, rnd);
    if (tone && d.kind !== "kick") {
      let lp = 0;
      for (let i = 0; i < m; i++) noteL[i] = lp += tone * (noteL[i] - lp);
    }
    const mix = DRUM_MIX[d.kind];
    mixIn(Math.floor(d.t * sr), m, mix.gain * score.drumLevel, mix.pan, mix.reverb, 0, 0);
    tick();
  }

  // Echo: bounces between left and right, losing highs on every bounce.
  if (score.delay.mix > 0) {
    const len = Math.max(1, Math.round(score.delay.seconds * sr));
    const dl = new Float32Array(len);
    const dr = new Float32Array(len);
    let pos = 0;
    let lowL = 0, lowR = 0;
    for (let i = 0; i < n; i++) {
      const a = dl[pos];
      const b = dr[pos];
      lowL += 0.45 * (a - lowL);
      lowR += 0.45 * (b - lowR);
      dl[pos] = delSend[i] + lowR * 0.42;
      dr[pos] = lowL * 0.75;
      if (++pos >= len) pos = 0;
      L[i] += a;
      R[i] += b;
      revSend[i] += (a + b) * 0.15;
    }
  }
  onProgress?.(0.75);

  // Reverb, with the lows kept out of it so the mix stays clear.
  if (score.reverb.mix > 0) {
    const left = new Verb(0, score.reverb.size);
    const right = new Verb(23, score.reverb.size);
    const wet = score.reverb.mix * 0.09;
    const hp = 1 - Math.exp((-TAU * 220) / sr);
    let low = 0;
    for (let i = 0; i < n; i++) {
      const x = revSend[i];
      low += hp * (x - low);
      const s = x - low;
      L[i] += left.process(s) * wet;
      R[i] += right.process(s) * wet;
      if ((i & 0xfffff) === 0) onProgress?.(0.75 + (i / n) * 0.2);
    }
  }

  // A loop gets whatever rings past its end laid over its beginning; a one-off just fades.
  if (score.loop) {
    for (let i = 0; i < tailN; i++) {
      L[i] += L[outN + i];
      R[i] += R[outN + i];
    }
  } else {
    const fade = Math.min(outN, Math.floor(sr * 0.4));
    for (let i = 0; i < fade; i++) {
      L[outN - 1 - i] *= i / fade;
      R[outN - 1 - i] *= i / fade;
    }
  }

  // Master: a steady loudness whatever the style, with peaks rounded off rather than clipped.
  let sum = 0;
  for (let i = 0; i < outN; i++) sum += L[i] * L[i] + R[i] * R[i];
  const rms = Math.sqrt(sum / (outN * 2));
  const gain = rms > 1e-6 ? 0.16 / rms : 0;
  const knee = 0.7;
  const room = 0.98 - knee;
  const limit = (x: number) => {
    const a = Math.abs(x);
    return a <= knee ? x : Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
  };
  for (let i = 0; i < outN; i++) {
    L[i] = limit(L[i] * gain);
    R[i] = limit(R[i] * gain);
  }
  onProgress?.(1);
  return { left: L.slice(0, outN), right: R.slice(0, outN) };
}
