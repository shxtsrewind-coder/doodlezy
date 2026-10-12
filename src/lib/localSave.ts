// What's kept on this device: streaks and counts for achievements, today's
// free-play allowance, and the words typed at each doodle (the server only
// keeps how many guesses there were). Doodles, answers and solves live in
// Supabase (lib/api.ts).
import { yesterdayOf } from "./doodle.ts";

const KEY = "doodlezy.save.v1";

/** One typed guess and how it went: g = right, y = earned letters, r = nothing new. */
export interface GuessMark {
  w: string;
  r: "g" | "y" | "r";
}

export interface SaveData {
  lastDailyDate: string | null;
  streak: number;
  maxStreak: number;
  dailiesSolved: number;
  solves: number;
  firstTry: number;
  posted: number;
  bestDoodleSolves: number;
  /** Today's (UTC) use of the free allowance. */
  day: { date: string; guessed: number; drawn: number };
  guesses: Record<string, GuessMark[]>;
  /** Unlimited guessing and drawing (stub until payments exist). */
  unlocked: boolean;
  unlockedAchievements: string[];
}

const DEFAULTS: SaveData = {
  lastDailyDate: null,
  streak: 0,
  maxStreak: 0,
  dailiesSolved: 0,
  solves: 0,
  firstTry: 0,
  posted: 0,
  bestDoodleSolves: 0,
  day: { date: "", guessed: 0, drawn: 0 },
  guesses: {},
  unlocked: false,
  unlockedAchievements: [],
};

const MAX_GUESS_LOGS = 80;

function read(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, day: { ...DEFAULTS.day }, guesses: {} };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...DEFAULTS, ...parsed, day: { ...DEFAULTS.day, ...(parsed.day ?? {}) }, guesses: parsed.guesses ?? {} };
  } catch {
    return { ...DEFAULTS, day: { ...DEFAULTS.day }, guesses: {} };
  }
}

function write(s: SaveData): SaveData {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked — the game still works this session */
  }
  return s;
}

function today(s: SaveData, date: string): SaveData["day"] {
  return s.day.date === date ? s.day : { date, guessed: 0, drawn: 0 };
}

export const localSave = {
  get: read,

  /** How much of today's free allowance is used. */
  dayFor(s: SaveData, date: string) {
    return today(s, date);
  },

  logGuess(id: string, mark: GuessMark): SaveData {
    const s = read();
    const list = [...(s.guesses[id] ?? []), mark];
    const guesses = { ...s.guesses, [id]: list };
    const ids = Object.keys(guesses);
    if (ids.length > MAX_GUESS_LOGS) {
      for (const old of ids.slice(0, ids.length - MAX_GUESS_LOGS)) delete guesses[old];
    }
    return write({ ...s, guesses });
  },

  /** A doodle was solved or given up. `daily` updates the streak; `fromFeed`
   *  uses up one of today's free guesses. */
  finish(opts: { solved: boolean; guesses: number; daily: string | null; fromFeed: boolean; date: string }): SaveData {
    const s = read();
    const next: SaveData = { ...s };
    if (opts.solved) {
      next.solves = s.solves + 1;
      if (opts.guesses === 1) next.firstTry = s.firstTry + 1;
    }
    if (opts.daily && s.lastDailyDate !== opts.daily) {
      if (opts.solved) {
        next.streak = s.lastDailyDate === yesterdayOf(opts.daily) ? s.streak + 1 : 1;
        next.maxStreak = Math.max(s.maxStreak, next.streak);
        next.dailiesSolved = s.dailiesSolved + 1;
      } else {
        next.streak = 0;
      }
      next.lastDailyDate = opts.daily;
    }
    if (opts.fromFeed) {
      const d = today(s, opts.date);
      next.day = { ...d, guessed: d.guessed + 1 };
    }
    return write(next);
  },

  posted(date: string): SaveData {
    const s = read();
    const d = today(s, date);
    return write({ ...s, posted: s.posted + 1, day: { ...d, drawn: d.drawn + 1 } });
  },

  setBestDoodleSolves(n: number): SaveData {
    const s = read();
    return n > s.bestDoodleSolves ? write({ ...s, bestDoodleSolves: n }) : s;
  },

  /** A daily missed for a day or more breaks the streak (shown as 0). */
  checkStreak(date: string): SaveData {
    const s = read();
    if (s.streak > 0 && s.lastDailyDate !== date && s.lastDailyDate !== yesterdayOf(date)) return write({ ...s, streak: 0 });
    return s;
  },

  unlock(): SaveData {
    return write({ ...read(), unlocked: true });
  },

  setUnlockedAchievements(ids: string[]): SaveData {
    return write({ ...read(), unlockedAchievements: ids });
  },
};
