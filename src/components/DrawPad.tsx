import React, { useEffect, useRef, useState } from "react";
import { Eraser, Undo2, Trash2 } from "lucide-react";
import { useWidth } from "./DoodleCanvas.tsx";
import {
  drawOne,
  drawStrokes,
  valueCount,
  CANVAS_UNITS,
  ERASER,
  MAX_STROKES,
  MAX_VALUES,
  PALETTE,
  SIZES,
  type Stroke,
} from "../lib/doodle.ts";

/** Points closer than this (in 1000-units) to the last one are dropped. */
const MIN_STEP = 4;

/**
 * The drawing paper and its tools. Strokes live in the parent so the page
 * can post them; this only adds to them.
 */
export const DrawPad: React.FC<{ strokes: Stroke[]; onChange: (s: Stroke[]) => void; disabled?: boolean }> = ({ strokes, onChange, disabled }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = useWidth(wrap);
  const [colour, setColour] = useState(0);
  const [size, setSize] = useState(1);
  const [full, setFull] = useState(false);
  const current = useRef<Stroke | null>(null);
  const pxRef = useRef(0);

  // Redraw everything whenever the strokes or the size change.
  useEffect(() => {
    const c = canvas.current;
    if (!c || width === 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.round(width * dpr);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    pxRef.current = px;
    const ctx = c.getContext("2d");
    if (ctx) drawStrokes(ctx, strokes, px);
  }, [strokes, width]);

  const point = (e: React.PointerEvent | PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * CANVAS_UNITS);
    const y = Math.round(((e.clientY - r.top) / r.height) * CANVAS_UNITS);
    return [Math.max(0, Math.min(CANVAS_UNITS, x)), Math.max(0, Math.min(CANVAS_UNITS, y))];
  };

  const ctx = () => canvas.current?.getContext("2d") ?? null;
  const k = () => pxRef.current / CANVAS_UNITS;

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || e.button > 0) return;
    if (strokes.length >= MAX_STROKES || valueCount(strokes) >= MAX_VALUES - 50) {
      setFull(true);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    current.current = [colour, size, x, y];
    const c = ctx();
    if (c) drawOne(c, current.current, 1, k());
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s) return;
    // Coalesced events give the full path of a fast stroke, not just one point per frame.
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    const events = coalesced && coalesced.length > 0 ? coalesced : [e.nativeEvent];
    const c = ctx();
    const budget = MAX_VALUES - valueCount(strokes) - 2;
    for (const ev of events) {
      const [x, y] = point(ev);
      const lx = s[s.length - 2];
      const ly = s[s.length - 1];
      if (Math.hypot(x - lx, y - ly) < MIN_STEP) continue;
      if (s.length + 2 > budget) {
        setFull(true);
        break;
      }
      s.push(x, y);
      if (c) drawOne(c, [s[0], s[1], lx, ly, x, y], 2, k());
    }
  };

  const up = () => {
    const s = current.current;
    current.current = null;
    if (s) onChange([...strokes, s]);
  };

  const undo = () => {
    setFull(false);
    onChange(strokes.slice(0, -1));
  };

  const swatch = "flex-1 min-w-0 max-w-[2rem] aspect-square rounded-full border-2 transition-transform";

  return (
    <div className="w-full space-y-3">
      <div ref={wrap} className="relative w-full aspect-square rounded-xl overflow-hidden bg-[#f7f1e3] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
        <canvas
          ref={canvas}
          aria-label="Drawing paper"
          className={`block w-full h-full touch-none select-none ${disabled ? "opacity-70" : "cursor-crosshair"}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onLostPointerCapture={up}
        />
        {strokes.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#8d846f] pointer-events-none">Draw here</p>
        )}
      </div>

      {full && <p className="text-xs text-present text-center" role="status">That's as much as one doodle can hold — undo a few strokes or post it.</p>}

      <div className="flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Colour">
        {PALETTE.map((p, i) => (
          <button
            key={p.name}
            type="button"
            role="radio"
            aria-checked={colour === i}
            aria-label={p.name}
            onClick={() => setColour(i)}
            className={`${swatch} ${colour === i ? "border-paper scale-110" : "border-transparent"}`}
            style={{ background: p.hex }}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface border border-rule" role="radiogroup" aria-label="Brush size">
          {SIZES.map((s, i) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={size === i}
              aria-label={["Thin", "Medium", "Thick"][i]}
              onClick={() => setSize(i)}
              className={`w-10 h-9 rounded-md flex items-center justify-center transition-colors ${size === i ? "bg-surface-high" : "hover:bg-surface-high/60"}`}
            >
              <span className="rounded-full bg-paper" style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
            </button>
          ))}
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={colour === ERASER}
          aria-label="Eraser"
          onClick={() => setColour((c) => (c === ERASER ? 0 : ERASER))}
          className={`w-11 h-11 rounded-lg border flex items-center justify-center transition-colors ${colour === ERASER ? "bg-[#f7f1e3] text-ink border-paper" : "bg-surface border-rule text-paper/90 hover:border-muted/60"}`}
        >
          <Eraser className="w-5 h-5" />
        </button>
        <button type="button" onClick={undo} disabled={disabled || strokes.length === 0} aria-label="Undo" className="w-11 h-11 rounded-lg border border-rule bg-surface flex items-center justify-center text-paper/90 hover:border-muted/60 transition-colors disabled:opacity-40">
          <Undo2 className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setFull(false);
            onChange([]);
          }}
          disabled={disabled || strokes.length === 0}
          aria-label="Clear"
          className="w-11 h-11 rounded-lg border border-rule bg-surface flex items-center justify-center text-danger hover:border-danger/60 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
