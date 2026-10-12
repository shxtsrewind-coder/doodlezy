// Achievement definitions — computed from the per-device SaveData, so
// unlocking one doesn't require an account.
import type { SaveData } from "../lib/localSave.ts";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** lucide-react icon name, resolved by the component that renders these. */
  icon: "Star" | "Flame" | "Zap" | "Eye" | "Brush" | "Trophy";
  isUnlocked: (save: SaveData) => boolean;
  /** Shown under a locked achievement, e.g. "Best streak: 2". */
  progress?: (save: SaveData) => string;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_solve",
    title: "Got It",
    description: "Guess your first doodle.",
    icon: "Star",
    isUnlocked: (s) => s.solves >= 1,
  },
  {
    id: "first_try",
    title: "Sharp Eye",
    description: "Guess a doodle on the first try.",
    icon: "Eye",
    isUnlocked: (s) => s.firstTry >= 1,
  },
  {
    id: "solves_10",
    title: "Art Critic",
    description: "Guess 10 doodles.",
    icon: "Zap",
    isUnlocked: (s) => s.solves >= 10,
    progress: (s) => `${s.solves} / 10`,
  },
  {
    id: "solves_50",
    title: "Gallery Regular",
    description: "Guess 50 doodles.",
    icon: "Trophy",
    isUnlocked: (s) => s.solves >= 50,
    progress: (s) => `${s.solves} / 50`,
  },
  {
    id: "first_doodle",
    title: "Artist",
    description: "Post your first doodle.",
    icon: "Brush",
    isUnlocked: (s) => s.posted >= 1,
  },
  {
    id: "crowd_pleaser",
    title: "Crowd Pleaser",
    description: "Have one of your doodles guessed by 5 players.",
    icon: "Trophy",
    isUnlocked: (s) => s.bestDoodleSolves >= 5,
    progress: (s) => `Best so far: ${s.bestDoodleSolves}`,
  },
  {
    id: "streak_3",
    title: "On a Roll",
    description: "Guess the daily doodle 3 days in a row.",
    icon: "Flame",
    isUnlocked: (s) => s.maxStreak >= 3,
    progress: (s) => `Best streak: ${s.maxStreak}`,
  },
  {
    id: "streak_7",
    title: "Week Streak",
    description: "Guess the daily doodle 7 days in a row.",
    icon: "Flame",
    isUnlocked: (s) => s.maxStreak >= 7,
    progress: (s) => `Best streak: ${s.maxStreak}`,
  },
];

/** Ids of achievements newly true in `save` that weren't already unlocked. */
export function diffNewlyUnlocked(save: SaveData, prevUnlockedIds: string[]): string[] {
  const prev = new Set(prevUnlockedIds);
  return ACHIEVEMENTS.filter((a) => !prev.has(a.id) && a.isUnlocked(save)).map((a) => a.id);
}
