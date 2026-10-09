"use client";

import type { CSSProperties } from "react";
import { fromNorm, toNorm, type ParamDef } from "@/lib/sfx/params";

interface Props {
  def: ParamDef;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export default function ParamSlider({ def, value, disabled, onChange }: Props) {
  const pos = toNorm(def, value);
  // Bipolar parameters fill outward from zero, the rest from the left edge.
  const origin = def.min < 0 ? toNorm(def, 0) : 0;
  const idle = value === def.def;
  const style = {
    "--a": `${Math.min(pos, origin) * 100}%`,
    "--b": `${Math.max(pos, origin) * 100}%`,
  } as CSSProperties;

  return (
    <label
      className={`grid grid-cols-[6.5rem_1fr_5.25rem] items-center gap-2 ${disabled ? "opacity-50" : ""}`}
      title={def.hint ? `${def.hint} Double-click the name to reset.` : "Double-click the name to reset."}
    >
      <span
        className={`truncate text-[13px] select-none ${idle ? "text-mute" : "text-ink"}`}
        onDoubleClick={() => onChange(def.def)}
      >
        {def.label}
      </span>
      <input
        type="range"
        className={`sl ${idle ? "idle" : ""}`}
        min={0}
        max={1}
        step={0.001}
        value={pos}
        disabled={disabled}
        style={style}
        onChange={(e) => onChange(fromNorm(def, Number(e.target.value)))}
      />
      <output className={`text-right font-mono text-xs tabular-nums ${idle ? "text-faint" : "text-ink"}`}>
        {def.fmt(value)}
      </output>
    </label>
  );
}
