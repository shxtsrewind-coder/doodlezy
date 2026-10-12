import React, { useEffect, useState } from "react";
import { Flag, SkipForward, TriangleAlert, Users, LoaderCircle } from "lucide-react";
import { DoodleCanvas } from "./DoodleCanvas.tsx";
import { HexWord, Keyboard } from "./HexWord.tsx";
import { blanks, fillMask, MAX_GUESSES_PER_DOODLE } from "../lib/doodle.ts";
import { friendlyError, giveUp, reportDoodle, sendGuess, type Doodle } from "../lib/api.ts";
import { localSave, type GuessMark } from "../lib/localSave.ts";

type Status = "playing" | "solved" | "revealed" | "mine";

export interface FinishInfo {
  solved: boolean;
  guesses: number;
  word: string;
}

/**
 * One doodle to guess: the drawing, the hexagon answer row and a keyboard.
 * The server checks every guess and hands back the letters earned so far.
 */
export const GuessPanel: React.FC<{
  doodle: Doodle;
  kind: "daily" | "feed";
  keysEnabled: boolean;
  onFinished: (info: FinishInfo) => void;
  onSkip?: () => void;
  onReported?: () => void;
  footer?: React.ReactNode;
}> = ({ doodle, kind, keysEnabled, onFinished, onSkip, onReported, footer }) => {
  const initial: Status = doodle.isMine ? "mine" : doodle.mySolved ? "solved" : doodle.myGaveUp ? "revealed" : "playing";
  const [status, setStatus] = useState<Status>(initial);
  const [mask, setMask] = useState(doodle.myRevealed);
  const [typed, setTyped] = useState("");
  const [word, setWord] = useState<string | null>(doodle.word);
  const [solves, setSolves] = useState(doodle.solves);
  const [plays, setPlays] = useState(doodle.plays);
  const [guesses, setGuesses] = useState(doodle.myGuesses);
  const [marks, setMarks] = useState<GuessMark[]>(() => localSave.get().guesses[doodle.id] ?? []);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" | "info" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [confirm, setConfirm] = useState<"give_up" | "report" | null>(null);

  const need = blanks(mask);
  const playing = status === "playing";

  const finish = (solved: boolean, w: string, count: number) => {
    setStatus(solved ? "solved" : "revealed");
    setWord(w);
    setTyped("");
    onFinished({ solved, guesses: count, word: w });
  };

  const submit = async () => {
    if (!playing || busy) return;
    if (typed.length < need) {
      setMessage({ text: `Fill in all ${mask.length} letters`, tone: "info" });
      setShake((s) => s + 1);
      return;
    }
    const guess = fillMask(mask, typed);
    if (marks.some((m) => m.w === guess)) {
      setMessage({ text: `You've tried ${guess.toUpperCase()} already`, tone: "info" });
      setShake((s) => s + 1);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await sendGuess(doodle.id, guess);
      const earned = blanks(mask) - blanks(r.revealed);
      const mark: GuessMark = { w: guess, r: r.correct ? "g" : earned > 0 ? "y" : "r" };
      localSave.logGuess(doodle.id, mark);
      setMarks((m) => [...m, mark]);
      setGuesses(r.guesses);
      setSolves(r.solves);
      if (r.guesses === 1 && doodle.myGuesses === 0) setPlays((p) => p + 1);
      if (r.correct) {
        setMask(r.revealed);
        setMessage({ text: r.guesses === 1 ? "First try!" : `Got it in ${r.guesses}!`, tone: "good" });
        finish(true, r.word ?? guess, r.guesses);
        return;
      }
      setMask(r.revealed);
      setTyped("");
      setShake((s) => s + 1);
      setMessage(
        earned > 0
          ? { text: `Not quite — ${earned} letter${earned === 1 ? "" : "s"} in the right place`, tone: "info" }
          : { text: `Not ${guess.toUpperCase()} — try another word`, tone: "bad" }
      );
      if (r.guesses >= MAX_GUESSES_PER_DOODLE) {
        const w = await giveUp(doodle.id);
        finish(false, w, r.guesses);
      }
    } catch (err) {
      setMessage({ text: friendlyError(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const doGiveUp = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      const w = await giveUp(doodle.id);
      if (guesses === 0) setPlays((p) => p + 1);
      setMessage(null);
      finish(false, w, guesses);
    } catch (err) {
      setMessage({ text: friendlyError(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const doReport = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      await reportDoodle(doodle.id);
      onReported?.();
    } catch (err) {
      setMessage({ text: friendlyError(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const type = (l: string) => {
    if (!playing || busy) return;
    setMessage(null);
    setTyped((t) => (t.length < need ? t + l : t));
  };
  const back = () => {
    if (!playing || busy) return;
    setMessage(null);
    setTyped((t) => t.slice(0, -1));
  };

  // A real keyboard works too.
  useEffect(() => {
    if (!keysEnabled || !playing || confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "enter") {
        e.preventDefault();
        submit();
      } else if (k === "backspace") {
        back();
      } else if (/^[a-z]$/.test(k)) {
        type(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const wrong = marks.filter((m) => m.r !== "g");
  const crowd = plays > 0 && (
    <p className="text-xs font-mono text-muted inline-flex items-center gap-1.5">
      <Users className="w-3.5 h-3.5" />
      {solves} of {plays} player{plays === 1 ? "" : "s"} got it
    </p>
  );

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="w-full max-w-[24rem] flex items-center justify-between text-xs font-mono text-muted">
        <span className="truncate">
          by <span className="text-paper/90">{doodle.authorName}</span>
        </span>
        {playing && kind === "feed" && (
          <button type="button" onClick={() => setConfirm("report")} className="inline-flex items-center gap-1 hover:text-danger transition-colors shrink-0" aria-label="Report this doodle">
            <TriangleAlert className="w-3.5 h-3.5" />
            Report
          </button>
        )}
      </div>

      {/* Shrinks on short screens so the keyboard stays in view while guessing. */}
      <div style={{ width: playing ? "min(100%, 24rem, max(13rem, calc(100vh - 470px)))" : "min(100%, 24rem)" }}>
        <DoodleCanvas key={doodle.id} strokes={doodle.strokes} animate={playing} label={`A doodle by ${doodle.authorName}${word && !playing ? ` of ${word}` : ""}`} />
      </div>

      <HexWord mask={mask} typed={typed} word={status === "mine" ? doodle.word : word} status={playing ? "playing" : status === "revealed" ? "revealed" : "solved"} shake={shake} />

      <div className="min-h-6 flex items-center justify-center text-sm text-center" role="status" aria-live="polite">
        {busy ? (
          <LoaderCircle className="w-4 h-4 animate-spin text-muted" />
        ) : message ? (
          <span className={`font-mono ${message.tone === "good" ? "text-correct" : message.tone === "bad" ? "text-danger" : "text-present"}`}>{message.text}</span>
        ) : status === "mine" ? (
          <span className="font-mono text-present">You drew this one!</span>
        ) : status === "revealed" ? (
          <span className="font-mono text-present">The word was {word?.toUpperCase()}</span>
        ) : status === "solved" ? (
          <span className="font-mono text-correct">Solved in {guesses} {guesses === 1 ? "try" : "tries"}</span>
        ) : (
          <span className="font-mono text-muted text-xs uppercase tracking-wide">What is it? Type your guess</span>
        )}
      </div>

      {wrong.length > 0 && playing && (
        <ul className="w-full max-w-[24rem] flex flex-wrap justify-center gap-1.5" aria-label="Wrong guesses">
          {wrong.map((m) => (
            <li key={m.w} className={`px-2 py-0.5 rounded-md border font-mono text-xs uppercase ${m.r === "y" ? "border-present-dim/60 text-present" : "border-rule text-muted line-through"}`}>
              {m.w}
            </li>
          ))}
        </ul>
      )}

      {playing ? (
        <>
          <Keyboard onKey={type} onBack={back} onEnter={submit} disabled={busy || !!confirm} canEnter={typed.length === need} />
          <div className="flex items-center gap-2">
            {onSkip && (
              <button type="button" onClick={onSkip} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-rule bg-surface text-sm text-paper/90 hover:border-muted/60 transition-colors">
                <SkipForward className="w-4 h-4" />
                Skip
              </button>
            )}
            <button type="button" onClick={() => setConfirm("give_up")} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-rule bg-surface text-sm text-paper/90 hover:border-danger/60 transition-colors">
              <Flag className="w-4 h-4" />
              Give up
            </button>
          </div>
        </>
      ) : (
        <div className="w-full max-w-[24rem] flex flex-col items-center gap-3 animate-rise-in">
          {crowd}
          {footer}
        </div>
      )}

      {confirm && (
        <div role="dialog" aria-modal="true" aria-label={confirm === "give_up" ? "Give up?" : "Report this doodle?"} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm bg-surface border border-rule rounded-2xl p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display font-semibold text-lg">{confirm === "give_up" ? "Give up?" : "Report this doodle?"}</h2>
            <p className="text-sm text-muted">
              {confirm === "give_up"
                ? kind === "daily"
                  ? "You'll see the word, and today's streak ends."
                  : "You'll see the word. It won't count as a solve."
                : "For anything rude, hateful, or with the word written in. Three reports take a doodle down."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="py-2.5 rounded-lg border border-rule text-sm text-paper/90 hover:border-muted/60 transition-colors">
                Keep guessing
              </button>
              <button
                type="button"
                onClick={confirm === "give_up" ? doGiveUp : doReport}
                className="py-2.5 rounded-lg bg-danger/90 hover:bg-danger text-paper font-medium text-sm transition-colors"
              >
                {confirm === "give_up" ? "Show the word" : "Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
