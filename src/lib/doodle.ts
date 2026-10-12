// Doodles: the stroke format shared with the server, drawing them onto a
// canvas (all at once or animated), and the daily-puzzle dates.
//
// A doodle is a list of strokes; each stroke is
//   [colour index, size index, x0, y0, x1, y1, ...]
// with coordinates on a 1000 × 1000 square, so a doodle looks the same at any
// size. The server stores exactly this (doodlezy_doodles.strokes) and checks
// the limits below.
import { DRAW_WORDS } from "../data/drawWords.ts";

export type Stroke = number[];

/** Ink colours. The last one is the paper colour, used by the eraser. */
export const PALETTE = [
  { name: "Black", hex: "#1f1b16" },
  { name: "Red", hex: "#d9483b" },
  { name: "Orange", hex: "#ee8a2a" },
  { name: "Yellow", hex: "#e9b520" },
  { name: "Green", hex: "#2f9e6e" },
  { name: "Blue", hex: "#3b7dd8" },
  { name: "Purple", hex: "#8b57c9" },
  { name: "Brown", hex: "#8a5a33" },
  { name: "Pink", hex: "#e566a6" },
] as const;
export const PAPER = "#f7f1e3";
export const ERASER = PALETTE.length; // colour index 9

/** Line widths on the 1000-unit square: thin, medium, thick. */
export const SIZES = [8, 16, 30] as const;
export const ERASER_WIDTH = 60;

export const CANVAS_UNITS = 1000;
/** Server limits (doodlezy_create): strokes per doodle and numbers in total. */
export const MAX_STROKES = 400;
export const MAX_VALUES = 40000;

function colourOf(c: number): string {
  return c === ERASER ? PAPER : (PALETTE[c]?.hex ?? PALETTE[0].hex);
}

function widthOf(c: number, s: number): number {
  return c === ERASER ? ERASER_WIDTH : (SIZES[s] ?? SIZES[1]);
}

/** Number of points in a doodle (what the replay animation steps through). */
export function pointCount(strokes: Stroke[]): number {
  return strokes.reduce((n, s) => n + Math.max(0, Math.floor((s.length - 2) / 2)), 0);
}

/** Total numbers stored, as the server counts them. */
export function valueCount(strokes: Stroke[]): number {
  return strokes.reduce((n, s) => n + s.length, 0);
}

/**
 * Draws `strokes` onto a square canvas `px` pixels wide (already scaled for
 * the device pixel ratio). `upto` limits how many points are drawn, for the
 * replay animation; leave it out to draw everything.
 */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], px: number, upto = Infinity): void {
  const k = px / CANVAS_UNITS;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, px, px);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  let left = upto;
  for (const s of strokes) {
    if (left <= 0) break;
    const n = Math.min(Math.floor((s.length - 2) / 2), left);
    left -= n;
    if (n <= 0) continue;
    drawOne(ctx, s, n, k);
  }
}

/** Draws the first `n` points of one stroke, smoothed through midpoints. */
export function drawOne(ctx: CanvasRenderingContext2D, s: Stroke, n: number, k: number): void {
  const colour = colourOf(s[0]);
  const w = widthOf(s[0], s[1]) * k;
  const x = (i: number) => s[2 + i * 2] * k;
  const y = (i: number) => s[3 + i * 2] * k;
  if (n === 1) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x(0), y(0), w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = colour;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  for (let i = 1; i < n - 1; i++) {
    ctx.quadraticCurveTo(x(i), y(i), (x(i) + x(i + 1)) / 2, (y(i) + y(i + 1)) / 2);
  }
  ctx.lineTo(x(n - 1), y(n - 1));
  ctx.stroke();
}

/** A doodle from the server, defensively cleaned (it's just JSON). */
export function parseStrokes(raw: unknown): Stroke[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is unknown[] => Array.isArray(s) && s.length >= 4)
    .map((s) => s.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0)));
}

// ---- Words ------------------------------------------------------------------

/** Lower-case letters only. */
export function cleanWord(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/** `n` different random words to choose from, avoiding `avoid`. */
export function pickWords(n: number, avoid: string[] = []): string[] {
  const pool = DRAW_WORDS.filter((w) => !avoid.includes(w));
  const out: string[] = [];
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

/** Puts typed letters into the blanks of a revealed mask ("k__e" + "it" → "kite"). */
export function fillMask(mask: string, typed: string): string {
  let i = 0;
  return mask
    .split("")
    .map((c) => (c === "_" ? (typed[i++] ?? "_") : c))
    .join("");
}

export function blanks(mask: string): number {
  return mask.split("").filter((c) => c === "_").length;
}

// ---- Daily ------------------------------------------------------------------

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayOf(date: string): string {
  return new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
}

export function msUntilNextPuzzle(now: number = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

export const LAUNCH_DATE = "2026-10-12";
export function puzzleNumber(date: string): number {
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(LAUNCH_DATE + "T00:00:00Z")) / 86400000) + 1;
}

/** Free play each UTC day: doodles to guess beyond the daily, and doodles to post. */
export const FREE_GUESSES_PER_DAY = 10;
export const FREE_DRAWS_PER_DAY = 3;
/** The server's own cap, for everyone. */
export const MAX_DRAWS_PER_DAY = 30;
export const MAX_GUESSES_PER_DOODLE = 30;
