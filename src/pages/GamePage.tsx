import React, { useCallback, useEffect, useState } from "react";
import { Lock, Sparkles, Flame, WifiOff, Award, Share2, Check, X, CircleHelp, Brush, Shuffle, Send, LoaderCircle, ChevronRight, Infinity as InfinityIcon } from "lucide-react";
import { GuessPanel, type FinishInfo } from "../components/GuessPanel.tsx";
import { DoodleCanvas } from "../components/DoodleCanvas.tsx";
import { DrawPad } from "../components/DrawPad.tsx";
import { Gallery } from "../components/Gallery.tsx";
import { AuthModal } from "../components/AuthModal.tsx";
import { Confetti } from "../components/Confetti.tsx";
import { AchievementToastStack } from "../components/AchievementToast.tsx";
import { AchievementsModal } from "../components/AchievementsModal.tsx";
import {
  msUntilNextPuzzle,
  pickWords,
  puzzleNumber,
  todayUtc,
  FREE_DRAWS_PER_DAY,
  FREE_GUESSES_PER_DAY,
  type Stroke,
} from "../lib/doodle.ts";
import { ensureProfile, friendlyError, getDaily, getDoodle, nextDoodle, postDoodle, type Doodle } from "../lib/api.ts";
import { localSave, type SaveData } from "../lib/localSave.ts";
import { supabase, ensureSession, currentUser, withTimeout, BOOT_STEP_MS } from "../lib/supabase.ts";
import { formatCountdown } from "../hooks/useTimer.ts";
import { ACHIEVEMENTS, diffNewlyUnlocked, type Achievement } from "../data/achievements.ts";
import { buildDailyShare, buildDoodleShare, shareResult } from "../lib/share.ts";

type Mode = "daily" | "guess" | "draw" | "gallery";
type Phase = "auth_checking" | "choice" | "ready";
type Load = "idle" | "loading" | "ready" | "empty" | "error";

const PLAY_CHOICE_KEY = "doodlezy.playChoice";
const SEEN_HELP_KEY = "doodlezy.seenHelp";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODES: { id: Mode; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "guess", label: "Guess" },
  { id: "draw", label: "Draw" },
  { id: "gallery", label: "Gallery" },
];

const OTHER_GAMES = [
  { name: "Wordezy", url: "https://wordezy.bgameworld.com/" },
  { name: "Wordezy Search", url: "https://wordezysearch.bgameworld.com/" },
  { name: "Wordezy Scramble", url: "https://wordezyscramble.bgameworld.com/" },
  { name: "Wordezy Ladder", url: "https://wordezyladder.bgameworld.com/" },
  { name: "Letterezy", url: "https://letterezy.bgameworld.com/" },
  { name: "Warmezy", url: "https://warmezy.bgameworld.com/" },
  { name: "Mergezy", url: "https://mergezy.bgameworld.com/" },
  { name: "Sortezy", url: "https://sortezy.bgameworld.com/" },
  { name: "When & Where", url: "https://whenandwhere.bgameworld.com/" },
];

const HEX = "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)";

const Wordmark: React.FC = () => (
  <span className="flex gap-[3px] shrink-0" aria-hidden="true">
    {["#d9483b", "#e9b520", "#3b7dd8"].map((c, i) => (
      <span key={c} className="w-[20px] h-[18px] flex items-center justify-center" style={{ clipPath: HEX, background: c }}>
        {i === 1 && <Brush className="w-3 h-3 text-ink" />}
      </span>
    ))}
  </span>
);

/** The Guess tab's current doodle. `linked` came from a shared link (?d=). */
interface FeedState {
  state: Load;
  doodle: Doodle | null;
  linked: boolean;
  done: boolean;
  error?: string;
}

interface DrawState {
  choices: string[];
  word: string | null;
  strokes: Stroke[];
  posting: boolean;
  posted: { id: string; strokes: Stroke[]; word: string } | null;
  error: string | null;
}

const newDraw = (avoid: string[] = []): DrawState => ({ choices: pickWords(3, avoid), word: null, strokes: [], posting: false, posted: null, error: null });

export const GamePage: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("auth_checking");
  // Sign-in couldn't be reached: drawing works, guessing waits.
  const [offline, setOffline] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Player");
  const [hasProfile, setHasProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [linkedId] = useState<string | null>(() => {
    try {
      const d = new URLSearchParams(window.location.search).get("d");
      return d && UUID.test(d) ? d.toLowerCase() : null;
    } catch {
      return null;
    }
  });
  const [mode, setMode] = useState<Mode>(linkedId ? "guess" : "daily");
  const [today] = useState(() => todayUtc());
  const [save, setSave] = useState(() => localSave.checkStreak(todayUtc()));

  const [daily, setDaily] = useState<{ state: Load; doodle: Doodle | null }>({ state: "idle", doodle: null });
  const [dailyResult, setDailyResult] = useState<{ solved: boolean; guesses: number } | null>(null);
  const [feed, setFeed] = useState<FeedState>({ state: "idle", doodle: null, linked: false, done: false });
  const [skip, setSkip] = useState<string[]>([]);
  const [draw, setDraw] = useState<DrawState>(() => newDraw());
  const [galleryKey, setGalleryKey] = useState(0);

  const [showAchievements, setShowAchievements] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[] | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  const dayUse = localSave.dayFor(save, today);
  const guessesLeft = Math.max(0, FREE_GUESSES_PER_DAY - dayUse.guessed);
  const drawsLeft = Math.max(0, FREE_DRAWS_PER_DAY - dayUse.drawn);

  const unlockAchievements = useCallback((updated: SaveData) => {
    const prev = updated.unlockedAchievements;
    const newIds = diffNewlyUnlocked(updated, prev);
    if (newIds.length === 0) return updated;
    setNewlyUnlocked(ACHIEVEMENTS.filter((a) => newIds.includes(a.id)));
    return localSave.setUnlockedAchievements([...prev, ...newIds]);
  }, []);

  /** `quiet` retries in the background (the Retry link, coming back online)
   *  without swapping the game out for the loading screen. */
  const bootAuth = useCallback(async (quiet = false) => {
    if (!quiet) setPhase("auth_checking");
    try {
      const session = await ensureSession();
      if (!session.ok) {
        // Offline, blocked or down. Drawing still works; doodles to guess
        // load once a later retry gets through.
        setOffline(true);
        setPhase("ready");
        return;
      }
      setOffline(false);
      const user = await currentUser();
      const anon = user?.is_anonymous ?? true;
      setUserId(user?.id ?? null);
      const name = await withTimeout(ensureProfile(), BOOT_STEP_MS, null);
      if (name) {
        setDisplayName(name);
        setHasProfile(true);
      }
      const choiceDone = typeof window !== "undefined" && sessionStorage.getItem(PLAY_CHOICE_KEY) === "true";
      setPhase(!anon || choiceDone || name || quiet || linkedId ? "ready" : "choice");
    } catch (err) {
      console.error("Failed to establish session:", err);
      setOffline(true);
      setPhase("ready");
    }
  }, [linkedId]);

  useEffect(() => {
    bootAuth();
  }, [bootAuth]);

  useEffect(() => {
    if (!offline) return;
    const retry = () => bootAuth(true);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [offline, bootAuth]);

  // First visit: show how to play once the game is on screen.
  useEffect(() => {
    if (phase !== "ready") return;
    try {
      if (!localStorage.getItem(SEEN_HELP_KEY)) {
        localStorage.setItem(SEEN_HELP_KEY, "1");
        setShowHelp(true);
      }
    } catch {
      /* storage blocked — skip the auto help */
    }
  }, [phase]);

  const handleAuthResolved = useCallback((opts: { isAnonymous: boolean; displayName?: string }) => {
    if (typeof window !== "undefined") sessionStorage.setItem(PLAY_CHOICE_KEY, "true");
    setShowAuth(false);
    setPhase("ready");
    if (!opts.displayName && opts.isAnonymous) return;
    if (opts.displayName) setDisplayName(opts.displayName);
    setHasProfile(true);
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // ---- Loading doodles -----------------------------------------------------

  const loadDaily = useCallback(() => {
    setDaily({ state: "loading", doodle: null });
    getDaily(today)
      .then((d) => {
        setDaily({ state: d ? "ready" : "empty", doodle: d });
        if (d && (d.mySolved || d.myGaveUp)) setDailyResult({ solved: d.mySolved, guesses: d.myGuesses });
      })
      .catch(() => setDaily({ state: "error", doodle: null }));
  }, [today]);

  const loadNext = useCallback(
    (skipList: string[]) => {
      setFeed({ state: "loading", doodle: null, linked: false, done: false });
      // Never offer today's daily here, so it stays the daily.
      const avoid = daily.doodle ? [...skipList, daily.doodle.id] : skipList;
      nextDoodle(avoid)
        .then((d) => setFeed({ state: d ? "ready" : "empty", doodle: d, linked: false, done: !!d && (d.mySolved || d.myGaveUp) }))
        .catch((err) => setFeed({ state: "error", doodle: null, linked: false, done: false, error: friendlyError(err) }));
    },
    [daily.doodle]
  );

  const limitHit = !save.unlocked && guessesLeft <= 0;

  useEffect(() => {
    if (phase !== "ready" || offline) return;
    if (daily.state === "idle") loadDaily();
  }, [phase, offline, daily.state, loadDaily]);

  useEffect(() => {
    if (phase !== "ready" || offline || mode !== "guess" || feed.state !== "idle") return;
    if (linkedId && !skip.includes(linkedId) && feed.doodle === null && !feed.done) {
      setFeed({ state: "loading", doodle: null, linked: true, done: false });
      getDoodle(linkedId)
        .then((d) =>
          d
            ? setFeed({ state: "ready", doodle: d, linked: true, done: d.mySolved || d.myGaveUp || d.isMine })
            : setFeed({ state: "error", doodle: null, linked: true, done: false, error: "That doodle isn't available any more" })
        )
        .catch((err) => setFeed({ state: "error", doodle: null, linked: true, done: false, error: friendlyError(err) }));
      setSkip((s) => [...s, linkedId]);
      return;
    }
    if (!limitHit) loadNext(skip);
  }, [phase, offline, mode, feed.state, feed.doodle, feed.done, linkedId, skip, limitHit, loadNext]);

  const forgetLink = () => {
    try {
      if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* not important */
    }
  };

  // ---- Finishing doodles ---------------------------------------------------

  const celebrate = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1600);
  };

  const onDailyFinished = (info: FinishInfo) => {
    setDailyResult({ solved: info.solved, guesses: info.guesses });
    setSave(unlockAchievements(localSave.finish({ solved: info.solved, guesses: info.guesses, daily: today, fromFeed: false, date: today })));
    if (info.solved) celebrate();
  };

  const onFeedFinished = (info: FinishInfo) => {
    setFeed((f) => ({ ...f, done: true }));
    setSave(unlockAchievements(localSave.finish({ solved: info.solved, guesses: info.guesses, daily: null, fromFeed: !feed.linked, date: today })));
    if (feed.linked) forgetLink();
    if (info.solved) celebrate();
  };

  const nextInFeed = () => {
    const id = feed.doodle?.id;
    const nextSkip = id ? [...skip, id] : skip;
    setSkip(nextSkip);
    forgetLink();
    if (!save.unlocked && localSave.dayFor(localSave.get(), today).guessed >= FREE_GUESSES_PER_DAY) {
      setFeed({ state: "idle", doodle: null, linked: false, done: false });
      return;
    }
    loadNext(nextSkip);
  };

  // ---- Drawing -------------------------------------------------------------

  const post = async () => {
    if (!draw.word || draw.strokes.length === 0 || draw.posting) return;
    if (offline) {
      setDraw((d) => ({ ...d, error: "You're offline — reconnect to post your doodle" }));
      return;
    }
    setDraw((d) => ({ ...d, posting: true, error: null }));
    try {
      const id = await postDoodle(draw.word, draw.strokes);
      setSave(unlockAchievements(localSave.posted(today)));
      setDraw((d) => ({ ...d, posting: false, posted: { id, strokes: d.strokes, word: d.word ?? "" } }));
      setGalleryKey((k) => k + 1);
    } catch (err) {
      setDraw((d) => ({ ...d, posting: false, error: friendlyError(err) }));
    }
  };

  const changeWord = () => {
    if (draw.strokes.length > 0 && !window.confirm("Start over with a different word?")) return;
    setDraw((d) => newDraw(d.word ? [d.word, ...d.choices] : d.choices));
  };

  // ---- Sharing and unlocking -----------------------------------------------

  const flashShare = (r: "shared" | "copied" | "failed") => {
    setShareState(r);
    setTimeout(() => setShareState("idle"), 2200);
  };

  const shareDaily = async () => {
    if (!daily.doodle || !dailyResult) return;
    const marks = localSave.get().guesses[daily.doodle.id] ?? [];
    flashShare(await shareResult(buildDailyShare({ date: today, marks, solved: dailyResult.solved, guesses: dailyResult.guesses })));
  };

  const handleUnlock = () => {
    // Stub — no payment processor wired up yet. Replace with a real
    // server-verified purchase flow before this ever ships.
    alert("Payments aren't set up yet — unlimited guessing and drawing will unlock for $2 once that's wired in.");
  };

  // ---- Screens -------------------------------------------------------------

  if (phase === "auth_checking") {
    return (
      <div className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <Wordmark />
      </div>
    );
  }
  if (phase === "choice") {
    return <AuthModal currentDisplayName={displayName} onResolved={handleAuthResolved} />;
  }

  const modalOpen = showAuth || showAchievements || showHelp;
  const spinner = <LoaderCircle className="w-6 h-6 animate-spin text-muted my-16" aria-label="Loading" />;
  const needsConnection = (
    <section className="w-full max-w-sm bg-surface border border-rule rounded-xl p-6 text-center space-y-3 mt-2">
      <WifiOff className="w-7 h-7 text-present mx-auto" />
      <p className="text-sm text-muted">Doodles to guess come from the server, so this needs a connection. You can still practise in Draw.</p>
      <button type="button" onClick={() => bootAuth(true)} className="px-4 py-2 rounded-md bg-correct hover:bg-correct-dim text-paper text-sm font-medium transition-colors">
        Try again
      </button>
    </section>
  );
  const shareLabel = (idle: string) =>
    shareState === "copied" ? "Copied — paste it anywhere" : shareState === "shared" ? "Shared" : shareState === "failed" ? "Couldn't copy — try again" : idle;

  return (
    <div className="min-h-screen bg-ink text-paper flex flex-col items-center px-4 py-6 gap-4">
      <header className="w-full max-w-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Wordmark />
          <h1 className="font-display font-semibold text-lg truncate">Doodlezy</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {save.streak > 0 && (
            <div className="flex items-center gap-1 text-sm text-present font-mono" title="Daily streak">
              <Flame className="w-4 h-4" />
              {save.streak}
            </div>
          )}
          <button type="button" onClick={() => setShowHelp(true)} className="text-muted hover:text-paper transition-colors" aria-label="How to play">
            <CircleHelp className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setShowAchievements(true)} className="flex items-center gap-1.5 text-sm text-muted hover:text-paper transition-colors" aria-label="Achievements">
            <Award className="w-4 h-4" />
            {save.unlockedAchievements.length}/{ACHIEVEMENTS.length}
          </button>
        </div>
      </header>

      {showConfetti && <Confetti durationMs={1600} />}
      {newlyUnlocked && newlyUnlocked.length > 0 && <AchievementToastStack achievements={newlyUnlocked} onDone={() => setNewlyUnlocked(null)} />}
      {showAchievements && <AchievementsModal save={save} onClose={() => setShowAchievements(false)} />}
      {showAuth && <AuthModal currentDisplayName={displayName} onResolved={handleAuthResolved} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <nav className="flex items-center gap-1 p-1 bg-surface border border-rule rounded-lg" aria-label="Modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-current={mode === m.id ? "page" : undefined}
            className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === m.id ? "bg-correct text-paper" : "text-muted hover:text-paper"}`}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <main className="w-full max-w-xl flex flex-col items-center gap-4">
        {offline && (
          <div role="status" className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-rule bg-surface text-xs text-muted">
            <WifiOff className="w-4 h-4 shrink-0 text-present" aria-hidden="true" />
            <span className="flex-1">Playing offline. Your game saves on this device; doodles come back when you reconnect.</span>
            <button type="button" onClick={() => bootAuth(true)} className="shrink-0 font-medium text-paper underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        {/* ---- Daily ---- */}
        {mode === "daily" &&
          (offline ? (
            needsConnection
          ) : daily.state === "ready" && daily.doodle ? (
            <>
              <p className="text-xs font-mono text-muted text-center -mb-1">
                Doodle No. {puzzleNumber(today)} · everyone guesses the same one today
              </p>
              <GuessPanel
                key={daily.doodle.id}
                doodle={daily.doodle}
                kind="daily"
                keysEnabled={!modalOpen && mode === "daily"}
                onFinished={onDailyFinished}
                footer={
                  <>
                    {dailyResult && !daily.doodle.isMine && (
                      <button type="button" onClick={shareDaily} className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors">
                        {shareState === "copied" ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                        {shareLabel("Share result")}
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button type="button" onClick={() => setMode("guess")} className="py-2 rounded-lg border border-rule text-sm text-paper/90 hover:border-muted/60 transition-colors">
                        Guess more
                      </button>
                      <button type="button" onClick={() => setMode("draw")} className="py-2 rounded-lg border border-rule text-sm text-paper/90 hover:border-muted/60 transition-colors">
                        Draw one
                      </button>
                    </div>
                    <Countdown />
                    {!hasProfile && (
                      <button type="button" onClick={() => setShowAuth(true)} className="text-xs text-correct hover:underline">
                        Pick a name so players see who drew your doodles
                      </button>
                    )}
                  </>
                }
              />
            </>
          ) : daily.state === "empty" ? (
            <p className="text-sm text-muted text-center py-10">No daily doodle yet — check back soon.</p>
          ) : daily.state === "error" ? (
            <div className="text-center space-y-3 py-10">
              <p className="text-sm text-muted">Couldn't load today's doodle.</p>
              <button type="button" onClick={loadDaily} className="px-4 py-2 rounded-md bg-correct hover:bg-correct-dim text-paper text-sm font-medium transition-colors">
                Try again
              </button>
            </div>
          ) : (
            spinner
          ))}

        {/* ---- Guess ---- */}
        {mode === "guess" &&
          (offline ? (
            needsConnection
          ) : feed.doodle && (feed.state === "ready") ? (
            <>
              <p className="text-xs font-mono text-muted text-center -mb-1">
                {feed.linked ? "A doodle someone shared with you" : save.unlocked ? "Unlimited doodles" : `${guessesLeft} of ${FREE_GUESSES_PER_DAY} free doodles left today`}
              </p>
              <GuessPanel
                key={feed.doodle.id}
                doodle={feed.doodle}
                kind="feed"
                keysEnabled={!modalOpen && mode === "guess"}
                onFinished={onFeedFinished}
                onSkip={nextInFeed}
                onReported={nextInFeed}
                footer={
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <button type="button" onClick={nextInFeed} className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors">
                      Next doodle
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setMode("draw")} className="py-2.5 rounded-lg border border-rule text-sm text-paper/90 hover:border-muted/60 transition-colors">
                      Draw one
                    </button>
                  </div>
                }
              />
            </>
          ) : feed.state === "idle" && limitHit ? (
            <Paywall
              title="That's today's free doodles"
              body={`You've guessed ${FREE_GUESSES_PER_DAY} doodles today. New ones are free again tomorrow, and the daily doodle is always free.`}
              onUnlock={handleUnlock}
            />
          ) : feed.state === "empty" ? (
            <section className="w-full max-w-sm bg-surface border border-rule rounded-xl p-6 text-center space-y-3 mt-2">
              <p className="text-sm text-muted">You've seen every doodle there is right now. Draw one for everyone else!</p>
              <button type="button" onClick={() => setMode("draw")} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-correct hover:bg-correct-dim text-paper text-sm font-medium transition-colors">
                <Brush className="w-4 h-4" />
                Draw a doodle
              </button>
            </section>
          ) : feed.state === "error" ? (
            <div className="text-center space-y-3 py-10">
              <p className="text-sm text-muted">{feed.error ?? "Couldn't load a doodle."}</p>
              <button type="button" onClick={() => loadNext(skip)} className="px-4 py-2 rounded-md bg-correct hover:bg-correct-dim text-paper text-sm font-medium transition-colors">
                {feed.linked ? "Guess other doodles" : "Try again"}
              </button>
            </div>
          ) : (
            spinner
          ))}

        {/* ---- Draw ---- */}
        {mode === "draw" &&
          (draw.posted ? (
            <section className="w-full max-w-[24rem] bg-surface border border-rule rounded-xl p-5 space-y-4 text-center animate-rise-in">
              <h2 className="font-display font-semibold text-xl">Posted!</h2>
              <DoodleCanvas strokes={draw.posted.strokes} label={`Your doodle of ${draw.posted.word}`} />
              <p className="text-sm text-muted">
                Your <span className="text-paper font-mono uppercase">{draw.posted.word}</span> is in the feed. See how many guess it in Gallery.
              </p>
              <button
                type="button"
                onClick={async () => draw.posted && flashShare(await shareResult(buildDoodleShare(draw.posted.id)))}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors"
              >
                {shareState === "copied" ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                {shareLabel("Send it to a friend")}
              </button>
              <button type="button" onClick={() => setDraw((d) => newDraw(d.posted ? [d.posted.word] : []))} className="w-full py-2 rounded-lg border border-rule text-sm text-paper/90 hover:border-muted/60 transition-colors">
                Draw another
              </button>
            </section>
          ) : !draw.word ? (
            !save.unlocked && drawsLeft <= 0 ? (
              <Paywall
                title="That's today's free doodles"
                body={`You've posted ${FREE_DRAWS_PER_DAY} doodles today. You can post more tomorrow.`}
                onUnlock={handleUnlock}
              />
            ) : (
              <section className="w-full max-w-sm bg-surface border border-rule rounded-xl p-6 text-center space-y-4 mt-2 animate-rise-in">
                <div>
                  <h2 className="font-display font-semibold text-xl">What will you draw?</h2>
                  <p className="text-sm text-muted mt-1">Pick a word. Other players will try to guess it from your doodle.</p>
                </div>
                <div className="grid gap-2">
                  {draw.choices.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setDraw((d) => ({ ...d, word: w, strokes: [], error: null }))}
                      className="w-full py-3 rounded-lg border border-rule bg-ink hover:border-correct text-paper font-mono uppercase tracking-widest transition-colors"
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setDraw(newDraw(draw.choices))} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-paper transition-colors">
                  <Shuffle className="w-4 h-4" />
                  Different words
                </button>
                <p className="text-xs font-mono text-muted">{save.unlocked ? "Unlimited posting" : `${drawsLeft} of ${FREE_DRAWS_PER_DAY} free doodles left today`}</p>
              </section>
            )
          ) : (
            <section className="w-full max-w-[24rem] flex flex-col items-center gap-3">
              <div className="w-full flex items-center justify-between gap-2">
                <p className="text-sm">
                  Draw: <span className="font-mono uppercase tracking-widest text-present">{draw.word}</span>
                </p>
                <button type="button" onClick={changeWord} disabled={draw.posting} className="text-xs text-muted hover:text-paper transition-colors">
                  Other word
                </button>
              </div>
              <DrawPad strokes={draw.strokes} onChange={(s) => setDraw((d) => ({ ...d, strokes: s, error: null }))} disabled={draw.posting} />
              <p className="text-[11px] text-muted text-center">No letters or numbers — let the picture do the talking.</p>
              {draw.error && (
                <p className="text-sm text-danger text-center" role="alert">
                  {draw.error}
                </p>
              )}
              <button
                type="button"
                onClick={post}
                disabled={draw.posting || draw.strokes.length === 0}
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium transition-colors disabled:opacity-40"
              >
                {draw.posting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Post doodle
              </button>
              <p className="text-xs text-muted text-center">
                Posting as <span className="text-paper">{hasProfile ? displayName : "Guest"}</span>
                {!hasProfile && (
                  <>
                    {" · "}
                    <button type="button" onClick={() => setShowAuth(true)} className="text-correct hover:underline">
                      pick a name
                    </button>
                  </>
                )}
              </p>
            </section>
          ))}

        {/* ---- Gallery ---- */}
        {mode === "gallery" &&
          (offline ? (
            needsConnection
          ) : (
            <Gallery
              key={galleryKey}
              currentPlayerId={userId}
              onDraw={() => setMode("draw")}
              onMine={(best) => setSave(unlockAchievements(localSave.setBestDoodleSolves(best)))}
            />
          ))}
      </main>

      <footer className="w-full max-w-xl mt-auto pt-6 border-t border-rule/60 text-center space-y-2">
        <p className="text-xs text-muted">More free games on bgameworld</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          {OTHER_GAMES.map((g) => (
            <a key={g.url} href={g.url} className="text-paper/80 hover:text-correct transition-colors">
              {g.name}
            </a>
          ))}
          <a href="https://bgameworld.com/" className="text-muted hover:text-paper transition-colors">
            All games
          </a>
        </nav>
      </footer>
    </div>
  );
};

const Paywall: React.FC<{ title: string; body: string; onUnlock: () => void }> = ({ title, body, onUnlock }) => (
  <section className="w-full max-w-sm bg-surface border border-rule rounded-xl p-6 text-center space-y-4 mt-2">
    <div className="w-12 h-12 rounded-full bg-present-soft border border-present-dim/50 flex items-center justify-center text-present mx-auto">
      <Sparkles className="w-6 h-6" />
    </div>
    <div>
      <h2 className="font-display font-semibold text-lg">{title}</h2>
      <p className="text-sm text-muted mt-1.5">{body}</p>
    </div>
    <button type="button" onClick={onUnlock} className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-md bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors">
      <InfinityIcon className="w-4 h-4" />
      Unlock unlimited for $2
    </button>
    <p className="text-[11px] text-muted inline-flex items-center gap-1">
      <Lock className="w-3 h-3" /> One payment: unlimited guessing and drawing
    </p>
  </section>
);

const Countdown: React.FC = () => {
  const [ms, setMs] = useState(() => msUntilNextPuzzle());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextPuzzle()), 1000);
    return () => clearInterval(id);
  }, []);
  return <p className="text-xs font-mono text-muted">Next daily doodle in {formatCountdown(ms)}</p>;
};

const HelpModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div role="dialog" aria-modal="true" aria-label="How to play" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="w-full max-w-md bg-surface border border-rule rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">How to play</h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-paper transition-colors" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <ul className="text-sm text-paper/80 space-y-2.5 text-left">
        <li>
          <b className="text-paper">Guess:</b> watch a doodle draw itself, then type what it is. The hexagons show how many letters the word has.
        </li>
        <li>
          Every letter you get <b className="text-correct">in the right place turns green</b> and stays, so each guess gets you closer.
        </li>
        <li>
          <b className="text-paper">Daily:</b> one doodle for everyone, every day. Guess it to keep your streak going.
        </li>
        <li>
          <b className="text-paper">Draw:</b> pick a word, draw it, post it. Other players guess it, and you can see how many got it in Gallery.
        </li>
        <li>
          Free every day: the daily, {FREE_GUESSES_PER_DAY} more doodles to guess and {FREE_DRAWS_PER_DAY} to post. Unlimited is a one-time $2.
        </li>
        <li className="text-muted">Keep it friendly and don't write the word. Anything rude can be reported, and three reports take it down.</li>
      </ul>
      <button type="button" onClick={onClose} className="w-full py-2.5 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors">
        Let's play
      </button>
    </div>
  </div>
);
