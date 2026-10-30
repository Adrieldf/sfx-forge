import { SAMPLE_RATE, mulberry32 } from "../sfx/synth";

/**
 * Background textures and the tape effect. Like everything else here they are made from
 * noise and sine waves: nothing is recorded. A texture is generated from the seed, so the
 * same options always give the same rain.
 */
const sr = SAMPLE_RATE;
const TAU = Math.PI * 2;

export type AmbienceId = "rain" | "crackle" | "fire" | "wind" | "night" | "waves" | "birds";
export type Levels = Partial<Record<AmbienceId, number>>;

export const AMBIENCES: Record<AmbienceId, { label: string; hint: string; rms: number }> = {
  rain: { label: "Rain", hint: "Steady rainfall with single drops on a window", rms: 0.06 },
  crackle: { label: "Vinyl crackle", hint: "Dust and pops, like a record", rms: 0.02 },
  fire: { label: "Fireplace", hint: "A low rumble with crackling logs", rms: 0.05 },
  wind: { label: "Wind", hint: "Slow gusts that rise and fall", rms: 0.05 },
  night: { label: "Crickets", hint: "A summer night full of crickets", rms: 0.03 },
  waves: { label: "Waves", hint: "Surf rolling in and out", rms: 0.06 },
  birds: { label: "Birdsong", hint: "Short songs from a few birds", rms: 0.025 },
};
export const AMBIENCE_IDS = Object.keys(AMBIENCES) as AmbienceId[];

type Pair = [Float32Array, Float32Array];
const onePole = (fc: number) => 1 - Math.exp((-TAU * fc) / sr);

/** Adds a decaying burst to both channels, panned. */
function pan(l: Float32Array, r: Float32Array, at: number, p: number) {
  const angle = ((p + 1) * Math.PI) / 4;
  return (k: number, v: number) => {
    const i = at + k;
    if (i < 0 || i >= l.length) return;
    l[i] += v * Math.cos(angle);
    r[i] += v * Math.sin(angle);
  };
}

/** Times of events that arrive at random, `rate` per second on average. */
function scatter(n: number, rate: number, rnd: () => number): number[] {
  const out: number[] = [];
  for (let t = -Math.log(1 - rnd()) / rate; t * sr < n; t += -Math.log(1 - rnd()) / rate) out.push(Math.floor(t * sr));
  return out;
}

function rain(n: number, rnd: () => number): Pair {
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  // The body: noise between about 600 Hz and 7 kHz, swelling a little.
  for (const out of [l, r]) {
    const hi = onePole(7000);
    const lo = onePole(600);
    let a = 0, b = 0, swell = 0;
    for (let i = 0; i < n; i++) {
      const x = rnd() * 2 - 1;
      a += hi * (x - a);
      b += lo * (x - b);
      if ((i & 4095) === 0) swell = 0.85 + 0.3 * rnd();
      out[i] = (a - b) * swell;
    }
  }
  // Single drops: short rings at a few kHz.
  for (const at of scatter(n, 45, rnd)) {
    const f = TAU * (1800 + rnd() * 2600);
    const tau = (0.002 + rnd() * 0.004) * sr;
    const amp = 0.15 + rnd() * rnd() * 0.9;
    const put = pan(l, r, at, rnd() * 2 - 1);
    for (let k = 0; k < tau * 5; k++) put(k, amp * Math.sin((f * k) / sr) * Math.exp(-k / tau));
  }
  return [l, r];
}

function crackle(n: number, rnd: () => number): Pair {
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  // A faint hiss under everything.
  for (const out of [l, r]) {
    const lo = onePole(2500);
    let low = 0;
    for (let i = 0; i < n; i++) {
      const x = rnd() * 2 - 1;
      low += lo * (x - low);
      out[i] = (x - low) * 0.03;
    }
  }
  const pops = (rate: number, loud: number) => {
    for (const at of scatter(n, rate, rnd)) {
      const tau = (0.0004 + rnd() * 0.0016) * sr;
      const amp = loud * Math.pow(rnd(), 3);
      const put = pan(l, r, at, rnd() * 2 - 1);
      for (let k = 0; k < tau * 6; k++) put(k, amp * (rnd() * 2 - 1) * Math.exp(-k / tau));
    }
  };
  pops(40, 0.25); // dust
  pops(5, 1); // the odd loud pop
  return [l, r];
}

function fire(n: number, rnd: () => number): Pair {
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  // The roar: brown noise through a low-pass, drifting in level.
  for (const out of [l, r]) {
    const lo = onePole(260);
    let low = 0, brown = 0, level = 1, target = 1;
    for (let i = 0; i < n; i++) {
      brown = brown * 0.998 + (rnd() * 2 - 1) * 0.06;
      low += lo * (brown - low);
      if ((i & 8191) === 0) target = 0.6 + 0.6 * rnd();
      level += 0.0004 * (target - level);
      out[i] = low * level * 4;
    }
  }
  // Logs cracking: little clusters of resonant clicks.
  for (const start of scatter(n, 4, rnd)) {
    const clicks = 1 + Math.floor(rnd() * 4);
    for (let c = 0, at = start; c < clicks; c++, at += Math.floor(rnd() * 0.03 * sr)) {
      const f = TAU * (250 + rnd() * 1800);
      const tau = (0.002 + rnd() * 0.006) * sr;
      const amp = 0.2 + rnd() * rnd();
      const put = pan(l, r, at, rnd() * 1.4 - 0.7);
      for (let k = 0; k < tau * 5; k++) put(k, amp * (0.6 * Math.sin((f * k) / sr) + 0.5 * (rnd() * 2 - 1)) * Math.exp(-k / tau));
    }
  }
  return [l, r];
}

/** A state-variable band-pass; returns the filtered sample. */
function band() {
  let low = 0, bp = 0;
  return (x: number, fc: number, q: number) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, 8000)) / sr);
    low += f * bp;
    const high = x - low - q * bp;
    bp += f * high;
    return bp;
  };
}

function wind(n: number, rnd: () => number): Pair {
  const out: Pair = [new Float32Array(n), new Float32Array(n)];
  // Two slow wobbles, with periods of several seconds, move the pitch of the howl and its volume.
  const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
  const [p1, p2, p3] = [7 + rnd() * 4, 13 + rnd() * 5, 9 + rnd() * 4];
  for (const ch of out) {
    const bp = band();
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const fc = 420 + 180 * Math.sin((TAU * t) / p1 + ph[0]) + 90 * Math.sin((TAU * t) / p2 + ph[1]);
      const gust = 0.55 + 0.45 * Math.sin((TAU * t) / p3 + ph[2]);
      ch[i] = bp(rnd() * 2 - 1, fc, 0.35) * gust * gust;
    }
  }
  return out;
}

function waves(n: number, rnd: () => number): Pair {
  // Each wave is a swell that builds over a few seconds and then drains away.
  const swell = new Float32Array(n);
  for (let t = rnd() * 4; t * sr < n; t += 8 + rnd() * 5) {
    const rise = (2.5 + rnd() * 1.5) * sr;
    const fall = (4 + rnd() * 2) * sr;
    const peak = 0.6 + rnd() * 0.4;
    const at = Math.floor(t * sr);
    for (let k = 0; k < rise + fall * 3 && at + k < n; k++) {
      swell[at + k] += peak * (k < rise ? Math.pow(Math.sin((Math.PI / 2) * (k / rise)), 2) : Math.exp(-(k - rise) / fall));
    }
  }
  const out: Pair = [new Float32Array(n), new Float32Array(n)];
  for (const ch of out) {
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.min(1, swell[i]);
      const k = onePole(250 + 3600 * s * s);
      a += k * (rnd() * 2 - 1 - a);
      b += k * (a - b);
      ch[i] = b * (0.12 + 0.88 * s) * 3;
    }
  }
  return out;
}

function night(n: number, rnd: () => number): Pair {
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  // Each cricket has its own pitch and place, and chirps in short trains of pulses.
  for (let c = 0; c < 4; c++) {
    const f = TAU * (3700 + rnd() * 1500);
    const place = rnd() * 1.6 - 0.8;
    const loud = 0.5 + rnd() * 0.5;
    const pulses = 3 + Math.floor(rnd() * 2);
    const every = 0.28 + rnd() * 0.12;
    for (let t = rnd() * 2; t * sr < n; t += every) {
      // Now and then a cricket stops to listen.
      if (rnd() < 0.08) t += 1 + rnd() * 3;
      for (let p = 0; p < pulses; p++) {
        const at = Math.floor((t + p * 0.032) * sr);
        const len = Math.floor(0.014 * sr);
        const put = pan(l, r, at, place);
        for (let k = 0; k < len; k++) put(k, loud * Math.pow(Math.sin((Math.PI * k) / len), 2) * Math.sin((f * k) / sr));
      }
    }
  }
  return [l, r];
}

function birds(n: number, rnd: () => number): Pair {
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  // A song is a few chirps from one bird, each gliding up or down.
  for (let t = rnd() * 3; t * sr < n; t += 2 + rnd() * 5) {
    const base = 2200 + rnd() * 2600;
    const place = rnd() * 1.8 - 0.9;
    const loud = 0.4 + rnd() * 0.6;
    const chirps = 2 + Math.floor(rnd() * 5);
    let at = t;
    for (let c = 0; c < chirps; c++) {
      const len = Math.floor((0.05 + rnd() * 0.1) * sr);
      const glide = (rnd() < 0.5 ? -1 : 1) * (300 + rnd() * 1400);
      const start = Math.floor(at * sr);
      const put = pan(l, r, start, place);
      let phase = 0;
      for (let k = 0; k < len; k++) {
        const u = k / len;
        phase += (TAU * (base + glide * u + 60 * Math.sin(u * 40))) / sr;
        put(k, loud * Math.sin(Math.PI * u) * (Math.sin(phase) + 0.2 * Math.sin(2 * phase)));
      }
      at += len / sr + 0.05 + rnd() * 0.15;
    }
  }
  return [l, r];
}

const MAKERS: Record<AmbienceId, (n: number, rnd: () => number) => Pair> = { rain, crackle, fire, wind, night, waves, birds };

const rmsOf = (l: Float32Array, r: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < l.length; i++) sum += l[i] * l[i] + r[i] * r[i];
  return Math.sqrt(sum / (l.length * 2));
};

/**
 * Mixes the chosen textures into one stereo bed `outN` samples long. Levels run 0..1, and 0.5 is
 * a sensible background. In a loop the end is crossfaded into the start, so the bed repeats
 * without a seam.
 */
export function renderAmbience(levels: Levels, outN: number, seed: number, loop: boolean): { left: Float32Array; right: Float32Array } | null {
  const active = AMBIENCE_IDS.filter((id) => (levels[id] ?? 0) > 0);
  if (!active.length) return null;
  const fade = loop ? Math.min(Math.floor(outN / 2), 3 * sr) : 0;
  const left = new Float32Array(outN);
  const right = new Float32Array(outN);
  for (const id of active) {
    let salt = 0;
    for (const ch of id) salt = (salt * 31 + ch.charCodeAt(0)) | 0;
    const [l, r] = MAKERS[id](outN + fade, mulberry32(seed ^ Math.imul(salt, 0x9e3779b1)));
    const rms = rmsOf(l.subarray(0, outN), r.subarray(0, outN));
    if (rms < 1e-9) continue;
    const scale = (AMBIENCES[id].rms * (levels[id] as number)) / 0.5 / rms;
    for (let i = 0; i < outN; i++) {
      let a = l[i];
      let b = r[i];
      if (i < fade) {
        // Equal-power: the start fades in while the extra audio past the end fades out.
        const w = (Math.PI / 2) * (i / fade);
        a = a * Math.sin(w) + l[outN + i] * Math.cos(w);
        b = b * Math.sin(w) + r[outN + i] * Math.cos(w);
      }
      left[i] += a * scale;
      right[i] += b * scale;
    }
  }
  return { left, right };
}

/**
 * Makes a finished mix sound like it was played back from worn tape: the pitch drifts a little,
 * the highs roll off and loud peaks are softened. `amount` runs 0..1. Works in place on the first
 * `n` samples; in a loop the effect wraps round, so the join stays clean.
 */
export function applyTape(chans: Float32Array[], n: number, amount: number, seed: number, loop: boolean) {
  if (amount <= 0) return;
  const rnd = mulberry32(seed ^ 0x7a9e);
  const seconds = n / sr;
  // In a loop each wobble completes whole cycles, so the end meets the start.
  const rate = (hz: number) => (loop ? Math.max(1, Math.round(hz * seconds)) / seconds : hz);
  const wow = rate(0.45 + rnd() * 0.2);
  const drift = rate(0.12 + rnd() * 0.06);
  const flutter = rate(6 + rnd());
  const base = 0.0034 * amount * sr;
  const ph = rnd() * TAU;

  let rms = 0;
  for (const c of chans) for (let i = 0; i < n; i++) rms += c[i] * c[i];
  rms = Math.sqrt(rms / (n * chans.length)) || 1;
  // Saturation is judged against a normal output level, whatever the mix measured.
  const push = (0.16 / rms) * 2.2 * (0.4 + amount);
  const fc = 16000 * Math.pow(3800 / 16000, amount);

  chans.forEach((c, ch) => {
    const src = c.slice(0, n);
    const shift = ch * 0.35;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const delay =
        base +
        0.0016 * amount * sr * Math.sin(TAU * wow * t + ph + shift) +
        0.0008 * amount * sr * Math.sin(TAU * drift * t + ph * 2 + shift) +
        0.00007 * amount * sr * Math.sin(TAU * flutter * t + shift);
      let pos = i - delay;
      if (loop) pos = ((pos % n) + n) % n;
      else pos = Math.max(0, pos);
      const i0 = Math.floor(pos);
      const i1 = loop ? (i0 + 1) % n : Math.min(n - 1, i0 + 1);
      const f = pos - i0;
      const x = src[i0] * (1 - f) + src[i1] * f;
      c[i] = Math.tanh(x * push) / push;
    }
    // Two one-pole low-passes in a row; a loop warms up on its own last stretch first.
    const k = onePole(fc);
    let a = 0, b = 0;
    const run = (i: number) => {
      a += k * (c[i] - a);
      b += k * (a - b);
      c[i] = b;
    };
    if (loop) for (let i = Math.max(0, n - 4096); i < n; i++) {
      a += k * (c[i] - a);
      b += k * (a - b);
    }
    for (let i = 0; i < n; i++) run(i);
  });
}
