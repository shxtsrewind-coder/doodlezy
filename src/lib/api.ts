// Calls to the doodlezy_* functions in the shared Supabase project (see
// supabase/migrations). The server keeps every answer word to itself until a
// player solves the doodle or gives up, and checks guesses itself.
import { supabase } from "./supabase.ts";
import { parseStrokes, type Stroke } from "./doodle.ts";

export interface Doodle {
  id: string;
  authorName: string;
  letters: number;
  strokes: Stroke[];
  solves: number;
  plays: number;
  createdAt: string;
  isMine: boolean;
  myGuesses: number;
  /** Letters this player has earned, "_" for the rest. */
  myRevealed: string;
  mySolved: boolean;
  myGaveUp: boolean;
  /** Only once solved, given up, or for the artist. */
  word: string | null;
}

interface DoodleRow {
  id: string;
  author_name: string;
  letters: number;
  strokes: unknown;
  solves: number;
  plays: number;
  created_at: string;
  is_mine: boolean;
  my_guesses: number;
  my_revealed: string;
  my_solved: boolean;
  my_gave_up: boolean;
  word: string | null;
}

function toDoodle(r: DoodleRow): Doodle {
  return {
    id: r.id,
    authorName: r.author_name,
    letters: r.letters,
    strokes: parseStrokes(r.strokes),
    solves: r.solves,
    plays: r.plays,
    createdAt: r.created_at,
    isMine: !!r.is_mine,
    myGuesses: r.my_guesses ?? 0,
    myRevealed: r.my_revealed ?? "_".repeat(r.letters),
    mySolved: !!r.my_solved,
    myGaveUp: !!r.my_gave_up,
    word: r.word ?? null,
  };
}

function firstDoodle(data: unknown): Doodle | null {
  const rows = (data as DoodleRow[] | null) ?? [];
  return rows.length > 0 ? toDoodle(rows[0]) : null;
}

/** Turns a server error into something to show the player. */
export function friendlyError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (/wrong length/.test(msg)) return "That's not the right number of letters";
  if (/too many guesses/.test(msg)) return "That's the most guesses one doodle allows";
  if (/daily limit/.test(msg)) return "That's the most doodles anyone can post in a day";
  if (/word not allowed/.test(msg)) return "That word isn't on the drawing list";
  if (/drawing too big|invalid drawing/.test(msg)) return "That drawing is too big to post — try fewer strokes";
  if (/account suspended/.test(msg)) return "This account can't post doodles";
  if (/no such doodle/.test(msg)) return "That doodle isn't available any more";
  if (/not authenticated|JWT|Failed to fetch|NetworkError|network/i.test(msg)) return "Couldn't reach Doodlezy — check your connection";
  return "Something went wrong — try again";
}

export async function ensureProfile(): Promise<string | null> {
  const { data, error } = await supabase.rpc("doodlezy_ensure_profile");
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Today's doodle, the same for everyone. */
export async function getDaily(date: string): Promise<Doodle | null> {
  const { data, error } = await supabase.rpc("doodlezy_daily", { p_date: date });
  if (error) throw error;
  return firstDoodle(data);
}

export async function getDoodle(id: string): Promise<Doodle | null> {
  const { data, error } = await supabase.rpc("doodlezy_get", { p_id: id });
  if (error) throw error;
  return firstDoodle(data);
}

/** The next doodle to guess, or null when there are none left. */
export async function nextDoodle(skip: string[]): Promise<Doodle | null> {
  const { data, error } = await supabase.rpc("doodlezy_feed", { p_skip: skip });
  if (error) throw error;
  return firstDoodle(data);
}

export interface GuessResult {
  correct: boolean;
  revealed: string;
  word: string | null;
  solves: number;
  guesses: number;
}

export async function sendGuess(id: string, guess: string): Promise<GuessResult> {
  const { data, error } = await supabase.rpc("doodlezy_guess", { p_id: id, p_guess: guess });
  if (error) throw error;
  const r = ((data as GuessResult[] | null) ?? [])[0];
  if (!r) throw new Error("no result");
  return { correct: !!r.correct, revealed: r.revealed, word: r.word ?? null, solves: r.solves, guesses: r.guesses };
}

export async function giveUp(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("doodlezy_give_up", { p_id: id });
  if (error) throw error;
  return data as string;
}

export async function postDoodle(word: string, strokes: Stroke[]): Promise<string> {
  const { data, error } = await supabase.rpc("doodlezy_create", { p_word: word, p_strokes: strokes });
  if (error) throw error;
  return data as string;
}

export async function reportDoodle(id: string): Promise<void> {
  const { error } = await supabase.rpc("doodlezy_report", { p_id: id });
  if (error) throw error;
}

export interface CollectedDoodle {
  id: string;
  word: string;
  strokes: Stroke[];
  authorName: string;
  solvedAt: string;
}

export async function getCollection(): Promise<CollectedDoodle[]> {
  const { data, error } = await supabase.rpc("doodlezy_collection", { p_limit: 60 });
  if (error) throw error;
  return ((data as { id: string; word: string; strokes: unknown; author_name: string; solved_at: string }[] | null) ?? []).map((r) => ({
    id: r.id,
    word: r.word,
    strokes: parseStrokes(r.strokes),
    authorName: r.author_name,
    solvedAt: r.solved_at,
  }));
}

export interface MyDoodle {
  id: string;
  word: string;
  strokes: Stroke[];
  solves: number;
  plays: number;
  hidden: boolean;
  createdAt: string;
}

export async function getMine(): Promise<MyDoodle[]> {
  const { data, error } = await supabase.rpc("doodlezy_mine", { p_limit: 60 });
  if (error) throw error;
  return ((data as { id: string; word: string; strokes: unknown; solves: number; plays: number; hidden: boolean; created_at: string }[] | null) ?? []).map((r) => ({
    id: r.id,
    word: r.word,
    strokes: parseStrokes(r.strokes),
    solves: r.solves,
    plays: r.plays,
    hidden: !!r.hidden,
    createdAt: r.created_at,
  }));
}

export interface Artist {
  authorId: string;
  name: string;
  doodles: number;
  solves: number;
}

export async function getTopArtists(): Promise<Artist[]> {
  const { data, error } = await supabase.rpc("doodlezy_top_artists", { p_limit: 10 });
  if (error) throw error;
  return ((data as { author_id: string; author_name: string; doodles: number; solves: number }[] | null) ?? []).map((r) => ({
    authorId: r.author_id,
    name: r.author_name,
    doodles: Number(r.doodles),
    solves: Number(r.solves),
  }));
}
