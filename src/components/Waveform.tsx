"use client";

import { useEffect, useRef } from "react";

interface Props {
  samples: Float32Array;
  /** Playback position in 0..1, or null when nothing is playing. */
  getProgress: () => number | null;
}

export default function Waveform({ samples, getProgress }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, w, h);
      const mid = h / 2;
      g.fillStyle = "#2a2e34";
      g.fillRect(0, Math.floor(mid), w, 1);
      if (!samples.length) return;

      g.fillStyle = "#5fd4b8";
      const per = samples.length / w;
      for (let x = 0; x < w; x++) {
        const from = Math.floor(x * per);
        const to = Math.max(from + 1, Math.floor((x + 1) * per));
        let lo = 1;
        let hi = -1;
        for (let i = from; i < to && i < samples.length; i++) {
          const v = samples[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const y0 = mid - hi * (mid - 2);
        const y1 = mid - lo * (mid - 2);
        g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [samples]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const head = headRef.current;
      if (head) {
        const p = getProgress();
        head.style.opacity = p === null ? "0" : "1";
        if (p !== null) head.style.left = `${p * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getProgress]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div ref={headRef} className="pointer-events-none absolute inset-y-0 w-px bg-amp opacity-0" />
    </div>
  );
}
