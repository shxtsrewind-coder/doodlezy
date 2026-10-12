import React, { useEffect, useState } from "react";
import { Crown, Share2, Check, LoaderCircle, EyeOff, Brush } from "lucide-react";
import { DoodleCanvas } from "./DoodleCanvas.tsx";
import { getCollection, getMine, getTopArtists, type Artist, type CollectedDoodle, type MyDoodle } from "../lib/api.ts";
import { buildDoodleShare, shareResult } from "../lib/share.ts";

type Loaded = { mine: MyDoodle[]; collection: CollectedDoodle[]; artists: Artist[] };

/** Your doodles and how they're doing, the doodles you've guessed, and the top artists. */
export const Gallery: React.FC<{ currentPlayerId: string | null; onMine: (best: number) => void; onDraw: () => void }> = ({ currentPlayerId, onMine, onDraw }) => {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [shared, setShared] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getMine(), getCollection(), getTopArtists()])
      .then(([mine, collection, artists]) => {
        if (!live) return;
        setData({ mine, collection, artists });
        onMine(mine.reduce((m, d) => Math.max(m, d.solves), 0));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return <p className="text-sm text-muted text-center py-8">Couldn't load the gallery right now.</p>;
  if (!data) return <LoaderCircle className="w-6 h-6 animate-spin text-muted my-10" aria-label="Loading" />;

  const share = async (id: string) => {
    const r = await shareResult(buildDoodleShare(id));
    if (r !== "failed") {
      setShared(id);
      setTimeout(() => setShared(null), 2200);
    }
  };

  return (
    <div className="w-full space-y-7">
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg">Your doodles</h2>
        {data.mine.length === 0 ? (
          <div className="rounded-xl border border-rule bg-surface p-5 text-center space-y-3">
            <p className="text-sm text-muted">Nothing posted yet. Draw something and see who guesses it.</p>
            <button type="button" onClick={onDraw} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-correct hover:bg-correct-dim text-paper text-sm font-medium transition-colors">
              <Brush className="w-4 h-4" />
              Draw a doodle
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.mine.map((d) => (
              <li key={d.id} className="rounded-xl border border-rule bg-surface p-2 space-y-1.5">
                <DoodleCanvas strokes={d.strokes} label={`Your doodle of ${d.word}`} />
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="font-mono text-sm uppercase truncate">{d.word}</p>
                    <p className="text-[11px] text-muted">
                      {d.hidden ? (
                        <span className="inline-flex items-center gap-1 text-danger">
                          <EyeOff className="w-3 h-3" /> Taken down
                        </span>
                      ) : d.plays === 0 ? (
                        "No guesses yet"
                      ) : (
                        `${d.solves} of ${d.plays} got it`
                      )}
                    </p>
                  </div>
                  {!d.hidden && (
                    <button type="button" onClick={() => share(d.id)} className="p-1.5 rounded-md text-muted hover:text-paper transition-colors shrink-0" aria-label={`Share your ${d.word} doodle`}>
                      {shared === d.id ? <Check className="w-4 h-4 text-correct" /> : <Share2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg">Doodles you guessed</h2>
        {data.collection.length === 0 ? (
          <p className="text-sm text-muted">Every doodle you guess lands here.</p>
        ) : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {data.collection.map((d) => (
              <li key={d.id} className="rounded-lg border border-rule bg-surface p-1.5 space-y-1">
                <DoodleCanvas strokes={d.strokes} label={`${d.word}, by ${d.authorName}`} className="rounded-md" />
                <p className="font-mono text-[11px] uppercase truncate">{d.word}</p>
                <p className="text-[10px] text-muted truncate">by {d.authorName}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg">Top artists</h2>
        {data.artists.length === 0 ? (
          <p className="text-sm text-muted">No one yet — an artist joins the list once someone guesses their doodle.</p>
        ) : (
          <ol className="rounded-xl border border-rule bg-surface divide-y divide-rule" aria-label="Top artists">
            {data.artists.map((a, i) => (
              <li key={a.authorId} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${a.authorId === currentPlayerId ? "bg-correct-soft" : ""}`}>
                <span className="w-5 text-right font-mono text-muted">{i === 0 ? <Crown className="w-4 h-4 text-present inline" /> : i + 1}</span>
                <span className="flex-1 truncate">
                  {a.name}
                  {a.authorId === currentPlayerId && <span className="text-correct"> (you)</span>}
                </span>
                <span className="font-mono text-xs text-muted">
                  {a.solves} guessed · {a.doodles} doodle{a.doodles === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};
