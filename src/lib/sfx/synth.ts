import { MATERIALS, type MaterialDef } from "./materials";
import { parseMelody } from "./melody";
import type { SoundParams, Wave } from "./params";

export const SAMPLE_RATE = 44100;
const MAX_SECONDS = 10;
const TAU = Math.PI * 2;

export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function osc(wave: Wave, phase: number, duty: number): number {
  phase -= Math.floor(phase);
  switch (wave) {
    case "sine":
      return Math.sin(TAU * phase);
    case "triangle":
      return 1 - 4 * Math.abs(phase - 0.5);
    case "saw":
      return 2 * phase - 1;
    default:
      return phase < duty ? 1 : -1;
  }
}

/** Zavalishin TPT state-variable filter; stable under per-sample cutoff changes. */
class Svf {
  private ic1 = 0;
  private ic2 = 0;
  low = 0;
  band = 0;
  high = 0;
  reset() {
    this.ic1 = this.ic2 = this.low = this.band = this.high = 0;
  }
  process(x: number, cutoff: number, q: number) {
    const fc = Math.min(SAMPLE_RATE * 0.45, Math.max(20, cutoff));
    const g = Math.tan((Math.PI * fc) / SAMPLE_RATE);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.band = v1;
    this.high = x - k * v1 - v2;
  }
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];

/** Mono Freeverb-style reverb. */
class Reverb {
  private combs = COMBS.map((n) => ({ buf: new Float32Array(n), i: 0, lp: 0 }));
  private aps = ALLPASSES.map((n) => ({ buf: new Float32Array(n), i: 0 }));
  private feedback: number;
  constructor(size: number) {
    this.feedback = 0.7 + size * 0.28;
  }
  process(x: number): number {
    const input = x * 0.1;
    let wet = 0;
    for (const c of this.combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.7 + c.lp * 0.3;
      c.buf[c.i] = input + c.lp * this.feedback;
      if (++c.i >= c.buf.length) c.i = 0;
      wet += y;
    }
    for (const a of this.aps) {
      const y = a.buf[a.i];
      a.buf[a.i] = wet + y * 0.5;
      if (++a.i >= a.buf.length) a.i = 0;
      wet = y - wet;
    }
    return wet;
  }
}

/** Ring and Grain density sliders are centred: 50% is the material as designed, the ends are 4x either way. */
const centred = (v: number) => Math.pow(4, 2 * v - 1);

/** Seconds the material keeps sounding after the source has stopped. */
function materialTail(def: MaterialDef, p: SoundParams): number {
  let longest = def.grain ? 0.03 : 0;
  for (const m of def.modes) longest = Math.max(longest, m[2] * centred(p.matRing));
  return Math.min(3, longest);
}

/**
 * Runs buf[0..envN) through the material and mixes the result back over buf[0..bodyN).
 * The material's output is matched to the source's peak, so Amount is a true crossfade.
 */
function applyMaterial(buf: Float32Array, envN: number, bodyN: number, def: MaterialDef, p: SoundParams) {
  const sr = SAMPLE_RATE;
  const wet = new Float32Array(bodyN);

  // Loose materials: chop the source into short grains, each band-passed at its own pitch.
  if (def.grain) {
    const g = def.grain;
    const rnd = mulberry32(p.seed ^ 0x9e3779b9);
    const chance = (g.rate * centred(p.matDensity)) / sr;
    const fade = Math.exp(-1 / (g.len * sr));
    const chirp = g.chirp ? Math.pow(2, g.chirp / sr) : 1;
    const lo = g.lo / p.matSize;
    const span = g.hi / g.lo;
    // Each grain gets a filter of its own, so a new grain never retunes one that is
    // still ringing (which would click). Two passes per voice: a single band-pass
    // leaks enough hiss to bury the pitch of a grain.
    const voices = Array.from({ length: 4 }, () => ({ a: new Svf(), b: new Svf(), env: 0, fc: lo }));
    let next = 0;
    const strike = () => {
      const v = voices[next];
      next = (next + 1) % voices.length;
      v.a.reset();
      v.b.reset();
      v.env = 0.3 + 0.7 * rnd();
      v.fc = lo * Math.pow(span, rnd());
    };
    strike();
    for (let i = 0; i < bodyN; i++) {
      if (i < envN && rnd() < chance) strike();
      const x = i < envN ? buf[i] : 0;
      let sum = 0;
      for (const v of voices) {
        if (v.env < 1e-5) continue;
        v.a.process(x * v.env, v.fc, g.q);
        v.b.process(v.a.band / g.q, v.fc, g.q);
        sum += v.b.band;
        v.env *= fade;
        v.fc *= chirp;
      }
      wet[i] = sum;
    }
  } else {
    wet.set(buf.subarray(0, envN));
  }

  // Solid materials: the (possibly grained) source excites a bank of decaying resonators.
  if (def.modes.length) {
    const exciter = wet.slice();
    for (let i = 0; i < bodyN; i++) wet[i] *= def.direct;
    const ring = centred(p.matRing);
    for (const [freq, gain, seconds] of def.modes) {
      const w = (TAU * Math.min(freq / p.matSize, sr * 0.45)) / sr;
      const r = Math.pow(10, -3 / (seconds * ring * sr));
      const a1 = 2 * r * Math.cos(w);
      const a2 = -r * r;
      const g = gain * Math.sin(w);
      let y1 = 0;
      let y2 = 0;
      for (let i = 0; i < bodyN; i++) {
        const y = exciter[i] * g + a1 * y1 + a2 * y2;
        y2 = y1;
        y1 = y;
        wet[i] += y;
      }
    }
  }

  let dryPeak = 0;
  let wetPeak = 0;
  for (let i = 0; i < envN; i++) dryPeak = Math.max(dryPeak, Math.abs(buf[i]));
  for (let i = 0; i < bodyN; i++) wetPeak = Math.max(wetPeak, Math.abs(wet[i]));
  if (wetPeak < 1e-9) return;
  const k = (dryPeak / wetPeak) * p.matAmount;
  const dry = 1 - p.matAmount;
  for (let i = 0; i < bodyN; i++) buf[i] = buf[i] * dry + wet[i] * k;
}

/**
 * Adds one note to `out`: the oscillators, shaped by the envelope, starting at
 * sample `start` and transposed by `ratio`. Pitch motion restarts with each note.
 */
function addVoice(out: Float32Array, start: number, len: number, ratio: number, p: SoundParams, rnd: () => number) {
  const sr = SAMPLE_RATE;
  const isNoise = p.wave === "noise";
  const useNoise = isNoise || p.noiseMix > 0;
  const useOsc2 = !isNoise && p.osc2Mix > 0;
  const useFm = !isNoise && p.fmDepth > 0;
  const detune = Math.pow(2, p.osc2Detune / 12);
  const jump1 = Math.pow(2, p.jump1 / 12);
  const jump2 = Math.pow(2, p.jump2 / 12);
  const fmIndex = p.fmDepth / TAU;
  const repeatPeriod = p.repeatRate > 0 ? 1 / p.repeatRate : 0;

  let phase = 0;
  let phase2 = 0;
  let modPhase = 0;
  let noisePhase = 1;
  let noiseVal = 0;

  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / sr;
    let s: number;

    // --- pitch ---
    const tr = repeatPeriod ? t % repeatPeriod : t;
    let f = p.frequency * ratio * Math.pow(2, p.slide * tr + p.slideAccel * tr * tr);
    if (p.jump2 !== 0 && tr >= p.jump2Time) f *= jump2;
    else if (p.jump1 !== 0 && tr >= p.jump1Time) f *= jump1;
    if (p.vibDepth > 0) f *= Math.pow(2, (p.vibDepth / 12) * Math.sin(TAU * p.vibRate * t));
    f = Math.min(sr / 2, Math.max(1, f));

    // --- oscillators ---
    if (useNoise) {
      noisePhase += Math.min(1, (f * 16) / sr);
      if (noisePhase >= 1) {
        noisePhase -= 1;
        noiseVal = rnd() * 2 - 1;
      }
    }
    if (isNoise) {
      s = noiseVal;
    } else {
      const duty = Math.min(0.98, Math.max(0.02, p.duty + p.dutySweep * tr));
      let pm = 0;
      if (useFm) {
        modPhase += (f * p.fmRatio) / sr;
        pm = fmIndex * Math.sin(TAU * modPhase);
      }
      phase += f / sr;
      s = osc(p.wave, phase + pm, duty);
      if (useOsc2) {
        phase2 += (f * detune) / sr;
        s = (s + p.osc2Mix * osc(p.wave, phase2 + pm, duty)) / (1 + p.osc2Mix);
      }
      if (p.noiseMix > 0) s = s * (1 - p.noiseMix) + noiseVal * p.noiseMix;
    }

    // --- amplitude ---
    let env: number;
    if (t < p.attack) env = t / p.attack;
    else if (t < p.attack + p.sustain) env = 1 + p.punch * (1 - (t - p.attack) / p.sustain);
    else {
      const x = p.decay > 0 ? 1 - (t - p.attack - p.sustain) / p.decay : 0;
      env = x > 0 ? x * x : 0;
    }
    if (p.tremDepth > 0) env *= 1 - p.tremDepth * (0.5 - 0.5 * Math.cos(TAU * p.tremRate * t));
    out[start + i] += s * env;
  }
}

/** Renders a sound to mono PCM at SAMPLE_RATE. Deterministic for a given parameter set. */
export function render(p: SoundParams): Float32Array<ArrayBuffer> {
  const sr = SAMPLE_RATE;
  const envLen = Math.max(0.01, p.attack + p.sustain + p.decay);
  const echoOn = p.echoMix > 0.001;
  const reverbOn = p.reverbMix > 0.001;
  const material = p.material !== "none" && p.matAmount > 0 ? MATERIALS[p.material] : null;

  let tail = 0;
  if (echoOn) {
    const repeats = p.echoFeedback > 0.01 ? Math.log(0.01) / Math.log(p.echoFeedback) : 0;
    tail = Math.max(tail, p.echoTime * (1 + repeats));
  }
  if (reverbOn) tail = Math.max(tail, 0.4 + p.reverbSize * 2.2);
  tail = Math.min(tail, 4);

  // Three stretches: the source (one note, or a sequence of them) plays for envN
  // samples, the material may ring on until bodyN, and echo/reverb tails run to n.
  const steps = parseMelody(p.melody);
  const stepN = Math.floor(p.stepTime * sr);
  const noteN = Math.floor(envLen * sr);
  const envN = Math.min((steps.length - 1) * stepN + noteN, sr * MAX_SECONDS);
  const bodyLen = envN / sr + (material ? materialTail(material, p) : 0);
  const bodyN = Math.min(Math.floor(bodyLen * sr), sr * MAX_SECONDS);
  const n = Math.min(Math.floor((bodyLen + tail) * sr), sr * MAX_SECONDS);
  const out = new Float32Array(n);

  // ---------- source: oscillators shaped by the envelope ----------
  const rnd = mulberry32(p.seed);
  steps.forEach((chord, k) => {
    for (const semitones of chord) addVoice(out, k * stepN, noteN, Math.pow(2, semitones / 12), p, rnd);
  });

  if (material) applyMaterial(out, Math.min(envN, n), bodyN, material, p);

  // ---------- processing: filters, grit, space ----------
  const lpOn = p.lpCutoff < 19900 || p.lpSweep !== 0 || p.lpResonance > 0;
  const hpOn = p.hpCutoff > 21 || p.hpSweep !== 0;
  const lp = new Svf();
  const hp = new Svf();
  const lpQ = 0.707 + p.lpResonance * p.lpResonance * 14;

  const driveGain = 1 + p.drive * 24;
  const driveNorm = 1 / Math.tanh(driveGain);
  const crushLevels = Math.pow(2, p.bits - 1);
  const crushStep = p.crushRate / sr;
  const crushOn = p.bits < 16 || p.crushRate < sr;
  let crushPhase = 1;
  let crushHold = 0;

  const flangerOn = p.flangerOffset > 0.01 || p.flangerSweep !== 0;
  const flBuf = new Float32Array(2048);
  let flPos = 0;

  const echoBuf = new Float32Array(Math.max(1, Math.round(p.echoTime * sr)));
  let echoPos = 0;
  const reverb = reverbOn ? new Reverb(p.reverbSize) : null;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = out[i];

    if (i < bodyN) {
      if (lpOn) {
        lp.process(s, p.lpCutoff * Math.pow(2, p.lpSweep * t), lpQ);
        s = lp.low;
      }
      if (hpOn) {
        hp.process(s, p.hpCutoff * Math.pow(2, p.hpSweep * t), 0.707);
        s = hp.high;
      }
      if (p.drive > 0) s = Math.tanh(s * driveGain) * driveNorm;
    }

    if (flangerOn) {
      flBuf[flPos] = s;
      const delay = Math.min(2040, Math.max(0, ((p.flangerOffset + p.flangerSweep * t) / 1000) * sr));
      const whole = Math.floor(delay);
      const frac = delay - whole;
      const a = flBuf[(flPos - whole + 2048) & 2047];
      const b = flBuf[(flPos - whole - 1 + 2048) & 2047];
      s += a + (b - a) * frac;
      flPos = (flPos + 1) & 2047;
    }

    if (crushOn) {
      crushPhase += crushStep;
      if (crushPhase >= 1) {
        crushPhase -= 1;
        crushHold = p.bits < 16 ? Math.round(s * crushLevels) / crushLevels : s;
      }
      s = crushHold;
    }

    if (echoOn) {
      const d = echoBuf[echoPos];
      echoBuf[echoPos] = s + d * p.echoFeedback;
      if (++echoPos >= echoBuf.length) echoPos = 0;
      s += d * p.echoMix;
    }

    if (reverb) s = s * (1 - p.reverbMix * 0.4) + reverb.process(s) * p.reverbMix;

    out[i] = s;
  }

  // Normalize to the requested volume so every sound is equally loud and never clips.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-6) return out.subarray(0, Math.min(n, envN)) as Float32Array<ArrayBuffer>;
  const gain = p.volume / peak;

  // Trim the silent end of the tail, then fade the last few ms to avoid a click.
  let end = n;
  const floor = peak * 0.004;
  while (end > envN && Math.abs(out[end - 1]) < floor) end--;
  const fade = Math.min(end, Math.floor(sr * 0.004));
  for (let i = 0; i < end; i++) out[i] *= gain;
  for (let i = 0; i < fade; i++) out[end - 1 - i] *= i / fade;
  return out.subarray(0, end) as Float32Array<ArrayBuffer>;
}

/** 16-bit WAV: mono, or stereo when a right channel is given. */
export function encodeWav(samples: Float32Array, right?: Float32Array): Blob {
  return new Blob([wavBytes(samples, right)], { type: "audio/wav" });
}

/** The bytes of a 16-bit WAV file. */
export function wavBytes(samples: Float32Array, right?: Float32Array): ArrayBuffer {
  const channels = right ? 2 : 1;
  const bytes = samples.length * channels * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, bytes, true);
  const put = (o: number, x: number) => {
    const s = Math.max(-1, Math.min(1, x));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  };
  for (let i = 0, o = 44; i < samples.length; i++, o += channels * 2) {
    put(o, samples[i]);
    if (right) put(o + 2, right[i]);
  }
  return buf;
}
