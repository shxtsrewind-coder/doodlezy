import React from "react";
import { Delete, CornerDownLeft } from "lucide-react";

const HEX = "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)";

type Tone = "earned" | "typed" | "empty" | "next" | "missed";

const TONES: Record<Tone, { edge: string; fill: string; text: string }> = {
  earned: { edge: "#2f9e6e", fill: "#2f9e6e", text: "#f3efe6" },
  typed: { edge: "#978c79", fill: "#1b1915", text: "#f3efe6" },
  empty: { edge: "#2a271f", fill: "#141310", text: "#f3efe6" },
  next: { edge: "#c9922f", fill: "#141310", text: "#f3efe6" },
  missed: { edge: "#c9922f", fill: "rgba(201,146,47,0.18)", text: "#e7c27a" },
};

const Hex: React.FC<{ letter: string; tone: Tone; fontPx: number; pop?: boolean; delay?: number }> = ({ letter, tone, fontPx, pop, delay = 0 }) => {
  const t = TONES[tone];
  return (
    <span
      className={`relative block flex-1 min-w-0 max-w-[46px] aspect-[1.15] ${pop ? "animate-pop" : ""}`}
      style={{ clipPath: HEX, background: t.edge, animationDelay: `${delay}ms` }}
      aria-hidden="true"
    >
      <span className="absolute inset-[2px] flex items-center justify-center font-sans font-extrabold uppercase" style={{ clipPath: HEX, background: t.fill, color: t.text, fontSize: fontPx }}>
        {letter}
      </span>
    </span>
  );
};

/**
 * The answer as a row of hexagons: letters already earned in green, the
 * player's typing in the blanks, and the whole word once it's solved or
 * revealed (letters the player never found in amber).
 */
export const HexWord: React.FC<{
  mask: string;
  typed: string;
  word: string | null;
  status: "playing" | "solved" | "revealed";
  shake: number;
}> = ({ mask, typed, word, status, shake }) => {
  const n = mask.length;
  const fontPx = n <= 5 ? 24 : n <= 8 ? 19 : 15;
  let t = 0;
  const cells = mask.split("").map((m, i) => {
    if (status !== "playing" && word) {
      const found = status === "solved" || m !== "_";
      return { letter: word[i], tone: (found ? "earned" : "missed") as Tone };
    }
    if (m !== "_") return { letter: m, tone: "earned" as Tone };
    const c = typed[t];
    const isNext = t === typed.length;
    t++;
    return { letter: c ?? "", tone: (c ? "typed" : isNext ? "next" : "empty") as Tone };
  });
  const spoken = status === "playing" ? `${n} letters: ${mask.split("").map((m) => (m === "_" ? "blank" : m)).join(", ")}` : `The word is ${word}`;
  return (
    <div className="w-full flex flex-col items-center gap-1">
      <div key={shake} className={`w-full flex justify-center gap-1 ${shake > 0 ? "animate-shake" : ""}`} role="img" aria-label={spoken}>
        {cells.map((c, i) => (
          <Hex key={i} letter={c.letter} tone={c.tone} fontPx={fontPx} pop={status === "solved"} delay={i * 45} />
        ))}
      </div>
      <p className="text-[11px] font-mono text-muted uppercase tracking-wide">{n} letters</p>
    </div>
  );
};

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** On-screen keyboard, so the phone's own keyboard doesn't cover the doodle. */
export const Keyboard: React.FC<{ onKey: (k: string) => void; onBack: () => void; onEnter: () => void; disabled?: boolean; canEnter: boolean }> = ({
  onKey,
  onBack,
  onEnter,
  disabled,
  canEnter,
}) => {
  const key = "h-11 rounded-md border text-paper font-semibold uppercase text-sm flex items-center justify-center transition-colors disabled:opacity-50";
  const plain = `${key} bg-surface-high border-rule active:bg-rule`;
  return (
    <div className="w-full max-w-md space-y-1.5 select-none" aria-label="Keyboard">
      {ROWS.map((row, r) => (
        <div key={row} className="flex justify-center gap-1">
          {r === 2 && (
            <button type="button" onClick={onEnter} disabled={disabled || !canEnter} aria-label="Submit guess" className={`${key} flex-[1.6] min-w-0 bg-correct border-correct-dim active:bg-correct-dim disabled:bg-surface-high disabled:border-rule`}>
              <CornerDownLeft className="w-5 h-5" />
            </button>
          )}
          {row.split("").map((l) => (
            <button key={l} type="button" onClick={() => onKey(l)} disabled={disabled} className={`${plain} flex-1 min-w-0`}>
              {l}
            </button>
          ))}
          {r === 2 && (
            <button type="button" onClick={onBack} disabled={disabled} aria-label="Delete" className={`${plain} flex-[1.6] min-w-0`}>
              <Delete className="w-5 h-5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
