import React, { useEffect, useRef, useState } from "react";
import { drawStrokes, pointCount, type Stroke } from "../lib/doodle.ts";

/** Measures an element's CSS width and keeps it up to date. */
export function useWidth(ref: React.RefObject<HTMLElement>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * A finished doodle on paper. With `animate` it draws itself stroke by stroke,
 * the way the artist drew it; a tap skips to the end.
 */
export const DoodleCanvas: React.FC<{ strokes: Stroke[]; animate?: boolean; label: string; className?: string }> = ({
  strokes,
  animate = false,
  label,
  className = "",
}) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = useWidth(wrap);
  const [skip, setSkip] = useState(!animate);
  const [playing, setPlaying] = useState(animate);

  useEffect(() => {
    const c = canvas.current;
    if (!c || width === 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.round(width * dpr);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const total = pointCount(strokes);
    if (skip || total === 0) {
      drawStrokes(ctx, strokes, px);
      setPlaying(false);
      return;
    }
    // About 9 ms a point, kept between 1.2 and 4 seconds.
    const duration = Math.max(1200, Math.min(4000, total * 9));
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const f = Math.min(1, (t - start) / duration);
      drawStrokes(ctx, strokes, px, Math.ceil(total * f));
      if (f < 1) raf = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [strokes, width, skip]);

  return (
    <div ref={wrap} className={`relative w-full aspect-square rounded-xl overflow-hidden bg-[#f7f1e3] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] ${className}`}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        className="block w-full h-full"
        onClick={() => playing && setSkip(true)}
      />
    </div>
  );
};
