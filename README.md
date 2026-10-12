# Doodlezy

A draw-and-guess word game for [bgameworld.com](https://bgameworld.com), alongside the Wordezy games, Letterezy, Mergezy, Warmezy and When & Where.

Players draw a word and everyone else guesses it from the doodle. The doodle replays itself stroke by stroke, the answer shows as a row of hexagons, and every letter a guess gets in the right place turns green and stays.

- **Daily**: one doodle for everyone each day, free. Guessing it keeps your streak going. Results share spoiler-free: one square per guess (🟩 right, 🟨 earned letters, 🟥 nothing new).
- **Guess**: other players' doodles. 10 a day free, plus any doodle someone sends you a link to (`?d=<id>`). Skip or report any doodle.
- **Draw**: pick one of three words, draw it with 9 colours, 3 brush sizes, an eraser and undo, and post it. 3 a day free. After posting you get a link to send to friends.
- **Gallery**: your doodles with how many players got them, every doodle you've guessed, and the top artists.
- **Unlimited**: one $2 unlock for unlimited guessing and drawing. It's a stub until payments are set up (same as the other games). The server caps everyone at 30 posts a day.
- **Achievements, streaks**: stored on the device.

## How it's kept fair and safe

The answer word never reaches a player before they solve the doodle or give up. None of the doodle tables can be read directly; everything goes through `doodlezy_*` functions that hand out only the word's length and the letters a player has earned, and check guesses on the server.

- Doodles can only be of words on the drawing list (`doodlezy_words`, from `scripts/draw_words.py`).
- Drawings are size-capped (400 strokes, 40,000 numbers).
- Three reports from different players hide a doodle. To take one down by hand: `update public.doodlezy_doodles set hidden = true where id = '...';`

29 starter doodles (`scripts/seed_doodles.py`, drawn in code) make sure there's something to guess on day one. The doodle of the day comes from the starter doodles and from player doodles at least three people have solved.

Drawings are stored as `[colour, size, x0, y0, x1, y1, ...]` per stroke on a 1000 × 1000 grid (`src/lib/doodle.ts`), so they look the same at any size.

## Run it locally

```bash
npm install
npm run dev
```

It uses the shared bgameworld Supabase project by default. To point it elsewhere, copy `.env.example` to `.env.local` and fill it in.

## Database

Run `supabase/migrations/20261011_doodlezy.sql` once in the Supabase SQL editor for the shared project. It only creates new `doodlezy_*` objects, adds the word list and starter doodles, and is safe to run twice. Doodlezy needs it to work: guessing and posting both go through these functions.

## Deploy (Cloudflare)

Same setup as the other games:

1. Push this repo to GitHub.
2. In Cloudflare, create a Worker from the repo. Build command `npm run build`, deploy command `npx wrangler deploy` (see `wrangler.jsonc`).
3. Optional: the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` build variables. Without them the game uses the shared bgameworld project (its URL and publishable key are built in).
4. The custom domain `doodlezy.bgameworld.com` is set in `wrangler.jsonc`, so the first deploy attaches it.
5. In Google Search Console, submit `https://doodlezy.bgameworld.com/sitemap.xml`.

## SEO

`index.html` has the title and description, canonical URL, Open Graph and X/Twitter cards with `public/og-image.jpg`, `VideoGame` structured data, a `<noscript>` description, icons and a web manifest. `public/robots.txt` and `public/sitemap.xml` point at the subdomain.
