"""Draws Doodlezy's starter doodles in code, so the guessing feed isn't empty on
day one. Each doodle is a list of strokes in the game's format:

    [colour index, size index, x0, y0, x1, y1, ...]   coordinates 0–1000

with a little wobble so they look hand-drawn. Writes:
  - supabase/seed_doodles.sql  (INSERTs, appended to the migration)
  - src/data/seedPreview.json  (for the local test backend)

Usage: seed_doodles.py <repo dir>
"""
import json
import math
import random
import sys
from pathlib import Path

REPO = Path(sys.argv[1])
rng = random.Random(11)

INK, RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, BROWN, PINK = range(9)
THIN, MID, THICK = 0, 1, 2


def wob(points, amount=5):
    out = []
    for x, y in points:
        out += [int(round(min(995, max(5, x + rng.uniform(-amount, amount))))), int(round(min(995, max(5, y + rng.uniform(-amount, amount)))))]
    return out


def line(c, s, pts, amount=4):
    # Fill in long segments so the replay animation draws smoothly.
    dense = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / 40))
        for k in range(n):
            dense.append((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n))
    dense.append(pts[-1])
    return [c, s] + wob(dense, amount)


def ellipse(c, s, cx, cy, rx, ry, a0=0, a1=360, steps=None):
    steps = steps or max(12, int((a1 - a0) / 10))
    pts = [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * k / steps)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * k / steps))) for k in range(steps + 1)]
    return [c, s] + wob(pts, 3)


def circle(c, s, cx, cy, r, **kw):
    return ellipse(c, s, cx, cy, r, r, **kw)


def dot(c, cx, cy, r=14):
    return circle(c, THICK, cx, cy, r, steps=10)


D = {}

D["sun"] = [circle(YELLOW, THICK, 500, 500, 170)] + [
    line(ORANGE, MID, [(500 + 220 * math.cos(math.radians(a)), 500 + 220 * math.sin(math.radians(a))), (500 + 330 * math.cos(math.radians(a)), 500 + 330 * math.sin(math.radians(a)))])
    for a in range(0, 360, 45)
] + [dot(INK, 440, 470, 12), dot(INK, 560, 470, 12), ellipse(INK, MID, 500, 540, 70, 40, 20, 160)]

D["house"] = [
    line(INK, MID, [(250, 450), (250, 820), (750, 820), (750, 450), (250, 450)]),
    line(RED, THICK, [(200, 470), (500, 200), (800, 470)]),
    line(BROWN, MID, [(440, 820), (440, 640), (560, 640), (560, 820)]),
    line(BLUE, MID, [(300, 520), (400, 520), (400, 600), (300, 600), (300, 520)]),
    line(BLUE, MID, [(600, 520), (700, 520), (700, 600), (600, 600), (600, 520)]),
    line(INK, MID, [(650, 330), (650, 230), (710, 230), (710, 380)]),
]

D["fish"] = [
    ellipse(ORANGE, THICK, 470, 500, 240, 140),
    line(ORANGE, THICK, [(700, 500), (850, 380), (850, 620), (700, 500)]),
    dot(INK, 340, 470, 16),
    ellipse(ORANGE, MID, 470, 380, 90, 50, 200, 340),
    line(BLUE, THIN, [(200, 300), (190, 260)]), circle(BLUE, THIN, 180, 230, 18), circle(BLUE, THIN, 160, 170, 26),
]

D["tree"] = [
    line(BROWN, THICK, [(450, 900), (460, 560), (540, 560), (550, 900)]),
    circle(GREEN, THICK, 500, 380, 150), circle(GREEN, THICK, 360, 470, 110), circle(GREEN, THICK, 640, 470, 110),
    dot(RED, 420, 380), dot(RED, 580, 330), dot(RED, 600, 470), dot(RED, 380, 500),
]

D["cat"] = [
    circle(INK, MID, 500, 520, 220),
    line(INK, MID, [(320, 390), (330, 200), (450, 310)]),
    line(INK, MID, [(550, 310), (670, 200), (680, 390)]),
    dot(GREEN, 420, 480, 20), dot(GREEN, 580, 480, 20),
    line(PINK, MID, [(480, 560), (520, 560), (500, 590), (480, 560)]),
    line(INK, THIN, [(470, 600), (300, 570)]), line(INK, THIN, [(470, 615), (300, 640)]),
    line(INK, THIN, [(530, 600), (700, 570)]), line(INK, THIN, [(530, 615), (700, 640)]),
]

D["car"] = [
    line(RED, THICK, [(120, 650), (120, 520), (300, 500), (380, 360), (640, 360), (740, 500), (880, 530), (880, 650), (120, 650)]),
    line(BLUE, MID, [(330, 500), (400, 400), (500, 400), (500, 500), (330, 500)]),
    line(BLUE, MID, [(540, 500), (540, 400), (620, 400), (690, 500), (540, 500)]),
    circle(INK, THICK, 290, 660, 80), circle(INK, THICK, 710, 660, 80),
]

D["boat"] = [
    line(BROWN, THICK, [(180, 600), (820, 600), (700, 740), (300, 740), (180, 600)]),
    line(INK, MID, [(500, 600), (500, 180)]),
    line(RED, MID, [(510, 200), (510, 560), (760, 560), (510, 200)]),
    line(BLUE, MID, [(80, 800), (180, 770), (280, 800), (380, 770), (480, 800), (580, 770), (680, 800), (780, 770), (900, 800)]),
]

D["flower"] = [
    line(GREEN, THICK, [(500, 520), (510, 700), (500, 900)]),
    ellipse(GREEN, MID, 590, 760, 80, 40), ellipse(GREEN, MID, 410, 690, 80, 40),
] + [circle(PINK, MID, 500 + 120 * math.cos(math.radians(a)), 380 + 120 * math.sin(math.radians(a)), 70) for a in range(0, 360, 60)] + [circle(YELLOW, THICK, 500, 380, 60)]

D["moon"] = [
    ellipse(YELLOW, THICK, 480, 500, 260, 280, 70, 290),
    ellipse(YELLOW, THICK, 580, 500, 190, 230, 105, 255),
] + [line(YELLOW, MID, [(x - 30, y), (x + 30, y)]) for x, y in [(780, 220), (800, 600), (220, 160)]] + [line(YELLOW, MID, [(x, y - 30), (x, y + 30)]) for x, y in [(780, 220), (800, 600), (220, 160)]]

D["apple"] = [
    ellipse(RED, THICK, 420, 560, 190, 230, 80, 290), ellipse(RED, THICK, 580, 560, 190, 230, -110, 100),
    line(BROWN, THICK, [(500, 360), (520, 220)]),
    ellipse(GREEN, MID, 600, 250, 80, 40),
]

def heart(c, s, cx, cy, k):
    pts = []
    for t in range(0, 361, 8):
        a = math.radians(t)
        x = 16 * math.sin(a) ** 3
        y = 13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)
        pts.append((cx + k * x, cy - k * y))
    return [c, s] + wob(pts, 3)

D["heart"] = [heart(RED, THICK, 500, 470, 20), heart(PINK, MID, 500, 470, 12)]

D["umbrella"] = [
    ellipse(PURPLE, THICK, 500, 480, 330, 260, 180, 360),
    line(PURPLE, MID, [(170, 480), (280, 440), (390, 480), (500, 440), (610, 480), (720, 440), (830, 480)]),
    line(INK, THICK, [(500, 480), (500, 800)]), ellipse(INK, THICK, 440, 800, 60, 50, 0, 180),
] + [line(BLUE, THIN, [(x, y), (x - 20, y + 60)]) for x, y in [(150, 140), (300, 90), (700, 100), (860, 150)]]

D["cup"] = [
    line(BLUE, THICK, [(260, 380), (300, 800), (640, 800), (680, 380), (260, 380)]),
    ellipse(BLUE, THICK, 700, 560, 110, 120, -80, 100),
    line(INK, THIN, [(380, 320), (360, 260), (390, 200), (370, 140)]),
    line(INK, THIN, [(480, 320), (460, 260), (490, 200), (470, 140)]),
    line(INK, THIN, [(580, 320), (560, 260), (590, 200), (570, 140)]),
]

D["clock"] = [circle(INK, THICK, 500, 500, 330)] + [
    line(INK, MID, [(500 + 270 * math.cos(math.radians(a)), 500 + 270 * math.sin(math.radians(a))), (500 + 310 * math.cos(math.radians(a)), 500 + 310 * math.sin(math.radians(a)))]) for a in range(0, 360, 30)
] + [line(RED, THICK, [(500, 500), (500, 300)]), line(INK, THICK, [(500, 500), (640, 560)]), dot(INK, 500, 500)]

D["snake"] = [
    line(GREEN, THICK, [(120 + k * 25, 600 + 120 * math.sin(k / 3.2)) for k in range(28)]),
    circle(GREEN, THICK, 820, 470, 60), dot(INK, 835, 450, 10),
    line(RED, MID, [(880, 480), (950, 470), (980, 440)]), line(RED, MID, [(950, 470), (980, 500)]),
]

D["cloud"] = [
    ellipse(BLUE, THICK, 500, 420, 260, 130, 180, 360), ellipse(BLUE, THICK, 330, 470, 130, 100, 90, 270),
    ellipse(BLUE, THICK, 680, 470, 130, 100, -90, 90), line(BLUE, THICK, [(330, 570), (680, 570)]),
] + [line(BLUE, MID, [(x, 640), (x - 30, 740)]) for x in (360, 460, 560, 660)]

D["rocket"] = [
    line(INK, MID, [(420, 750), (420, 350), (500, 160), (580, 350), (580, 750), (420, 750)]),
    circle(BLUE, MID, 500, 420, 50),
    line(RED, MID, [(420, 600), (320, 760), (420, 740)]), line(RED, MID, [(580, 600), (680, 760), (580, 740)]),
    line(ORANGE, THICK, [(440, 770), (470, 900), (500, 800), (530, 900), (560, 770)]),
] + [dot(YELLOW, x, y, 8) for x, y in [(200, 200), (800, 300), (250, 600), (780, 650)]]

D["key"] = [
    circle(YELLOW, THICK, 300, 500, 130), circle(YELLOW, MID, 300, 500, 45),
    line(YELLOW, THICK, [(430, 500), (850, 500)]),
    line(YELLOW, THICK, [(760, 500), (760, 600)]), line(YELLOW, THICK, [(680, 500), (680, 580)]),
]

D["ladder"] = [line(BROWN, THICK, [(360, 120), (330, 900)]), line(BROWN, THICK, [(640, 120), (670, 900)])] + [
    line(BROWN, MID, [(360 - k * 4, 200 + k * 110), (640 + k * 4, 200 + k * 110)]) for k in range(7)
]

D["kite"] = [
    line(RED, THICK, [(500, 120), (700, 380), (500, 640), (300, 380), (500, 120)]),
    line(RED, THIN, [(500, 120), (500, 640)]), line(RED, THIN, [(300, 380), (700, 380)]),
    line(INK, THIN, [(500, 640), (460, 720), (540, 800), (480, 900)]),
    line(BLUE, MID, [(440, 700), (500, 740), (440, 760)]), line(YELLOW, MID, [(510, 810), (570, 840), (510, 860)]),
]

D["mountain"] = [
    line(INK, THICK, [(80, 820), (380, 260), (560, 560), (680, 400), (920, 820)]),
    line(BLUE, MID, [(310, 390), (380, 260), (450, 390), (410, 360), (380, 400), (350, 360), (310, 390)]),
    circle(ORANGE, MID, 800, 200, 70),
    line(GREEN, MID, [(80, 820), (920, 820)]),
]

D["glasses"] = [
    circle(INK, THICK, 320, 520, 130), circle(INK, THICK, 680, 520, 130),
    ellipse(INK, MID, 500, 520, 50, 40, 200, 340),
    line(INK, MID, [(190, 500), (90, 420)]), line(INK, MID, [(810, 500), (910, 420)]),
]

D["pizza"] = [
    line(YELLOW, THICK, [(500, 850), (220, 260), (780, 260), (500, 850)]),
    ellipse(BROWN, THICK, 500, 260, 290, 60, 180, 360),
] + [circle(RED, MID, x, y, 40) for x, y in [(420, 380), (570, 400), (500, 540), (470, 680)]]

D["envelope"] = [
    line(INK, THICK, [(150, 300), (850, 300), (850, 720), (150, 720), (150, 300)]),
    line(INK, MID, [(150, 300), (500, 560), (850, 300)]),
    line(RED, MID, [(700, 360), (790, 360), (790, 440), (700, 440), (700, 360)]),
]

D["balloon"] = [
    ellipse(RED, THICK, 500, 360, 190, 230),
    line(RED, MID, [(480, 590), (520, 590), (500, 620), (480, 590)]),
    line(INK, THIN, [(500, 620), (530, 700), (470, 780), (520, 860), (490, 940)]),
    ellipse(PINK, MID, 430, 280, 40, 70, 200, 290),
]

def star(c, s, cx, cy, r):
    pts = []
    for k in range(11):
        rr = r if k % 2 == 0 else r * 0.42
        a = math.radians(-90 + k * 36)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return [c, s] + wob(pts, 3)

D["star"] = [star(YELLOW, THICK, 500, 520, 340), dot(INK, 440, 520, 12), dot(INK, 560, 520, 12)]

D["spider"] = [
    circle(INK, THICK, 500, 520, 90), circle(INK, THICK, 500, 380, 60),
    line(INK, THIN, [(500, 60), (500, 320)]),
] + [line(INK, MID, [(500 + side * 70, 480 + k * 30), (500 + side * 220, 420 + k * 70), (500 + side * 300, 520 + k * 90)]) for side in (-1, 1) for k in range(4)]

D["candle"] = [
    line(PINK, THICK, [(420, 420), (420, 880), (580, 880), (580, 420), (420, 420)]),
    line(INK, MID, [(500, 420), (500, 360)]),
    line(ORANGE, THICK, [(500, 360), (450, 280), (500, 160), (550, 280), (500, 360)]),
    line(YELLOW, MID, [(500, 330), (480, 280), (500, 230), (520, 280), (500, 330)]),
]

D["bicycle"] = [
    circle(INK, THICK, 270, 640, 160), circle(INK, THICK, 730, 640, 160),
    line(RED, THICK, [(270, 640), (440, 440), (640, 440), (730, 640)]),
    line(RED, THICK, [(440, 440), (500, 640), (640, 440)]), line(RED, THICK, [(500, 640), (270, 640)]),
    line(INK, MID, [(430, 400), (480, 400)]), line(INK, MID, [(640, 440), (620, 330), (690, 320)]),
]


def main():
    rows, preview = [], {}
    for word, strokes in D.items():
        js = json.dumps(strokes, separators=(",", ":"))
        assert len(js) < 60000 and len(strokes) <= 400, word
        rows.append(f"  ('{word}', '{js}'::jsonb)")
        preview[word] = strokes
    sql = (
        "-- Starter doodles, drawn in code by scripts/seed_doodles.py so the guessing feed\n"
        "-- isn't empty on day one. Credited to \"Doodlezy\"; inserted once (by word).\n"
        "-- Dated before launch so they can be the doodle of the day from day one.\n"
        "insert into public.doodlezy_doodles (author_id, author_name, word, strokes, stroke_count, seed, created_at)\n"
        "select null, 'Doodlezy', v.word, v.strokes, jsonb_array_length(v.strokes), true, timestamptz '2026-10-01 00:00+00'\n"
        "from (values\n" + ",\n".join(rows) + "\n) as v(word, strokes)\n"
        "where not exists (select 1 from public.doodlezy_doodles d where d.seed and d.word = v.word);\n"
    )
    (REPO / "supabase").mkdir(exist_ok=True)
    (REPO / "supabase/seed_doodles.sql").write_text(sql)  # spliced into the migration
    (REPO / "src/data").mkdir(parents=True, exist_ok=True)
    (REPO / "src/data/seedPreview.json").write_text(json.dumps(preview, separators=(",", ":")))
    print(f"{len(D)} seed doodles, {len(sql) // 1024} KB of SQL")


main()
