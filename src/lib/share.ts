import { puzzleNumber } from "./doodle.ts";
import type { GuessMark } from "./localSave.ts";

export const GAME_URL = "https://doodlezy.bgameworld.com/";

const SQUARE = { g: "🟩", y: "🟨", r: "🟥" } as const;

/** Spoiler-free daily result: one square per guess, never the word. */
export function buildDailyShare(opts: { date: string; marks: GuessMark[]; solved: boolean; guesses: number }): string {
  const squares = opts.marks.map((m) => SQUARE[m.r]).join("");
  const line = opts.solved
    ? `Guessed it in ${opts.guesses} ${opts.guesses === 1 ? "try" : "tries"}`
    : `Stumped after ${opts.guesses} ${opts.guesses === 1 ? "try" : "tries"} 🏳️`;
  return `Doodlezy No. ${puzzleNumber(opts.date)} 🎨\n${line}${squares ? `\n${squares}` : ""}\n${GAME_URL}`;
}

/** A link straight to one doodle. */
export function doodleLink(id: string): string {
  return `${GAME_URL}?d=${id}`;
}

export function buildDoodleShare(id: string): string {
  return `Can you guess what I drew? 🎨\n${doodleLink(id)}`;
}

/** Opens the native share sheet where there is one (phones), otherwise
 *  copies to the clipboard. Resolves to what happened, for the button label. */
export async function shareResult(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      await navigator.share({ text });
      return "shared";
    }
  } catch (err) {
    // The player closing the share sheet isn't a failure worth reporting.
    if ((err as { name?: string })?.name === "AbortError") return "shared";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
