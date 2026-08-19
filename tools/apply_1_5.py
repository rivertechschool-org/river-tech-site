#!/usr/bin/env python3
"""
Move the schedule source from Semi-Final 1.4 to 1.5 (19 August 2026).

Comparing every text run in both PDFs, the two versions differ in exactly two
places, both on Friday 1:40-2:20:

  Elementary      Fine Arts (MA)              ->  Fine Arts (MA & EM)
  Homeschool UH   Film Making [UH] (LU & EM)  ->  Film Making [UH] (LU & KI)

Emily comes off the Friday afternoon film class and joins Mary on Fine Arts;
Kirsten takes her place alongside Luke.
"""
import sys, io, json
from collections import OrderedDict

EDITS = [
    ("elem", "1:40&ndash;2:20", 3, 0, "Fine Arts (MA) 🎨", "Fine Arts (MA &amp; EM) 🎨"),
    ("home", "1:40&ndash;2:20", 2, 0,
     "Film Making [UH] (LU &amp; EM) 💃", "Film Making [UH] (LU &amp; KI) 💃"),
]

def main():
    path = sys.argv[1]
    src = json.load(io.open(path, encoding="utf-8"), object_pairs_hook=OrderedDict)
    panels = {p["id"]: p for p in src["panels"]}
    for pid, time, ci, li, old, new in EDITS:
        row = next(r for r in panels[pid]["rows"]
                   if r["section"] == "tbody"
                   and r["cells"][0]["lines"][0]["text"] == time)
        line = row["cells"][1 + ci]["lines"][li]
        if line["text"] != old:
            raise SystemExit("panel-%s %s cell%d line%d reads %r, expected %r"
                             % (pid, time, ci, li, line["text"], old))
        line["text"] = new
        print("  panel-%-5s Friday %s:  %s  ->  %s" % (pid, time, old, new))
    src["schedule_version"] = "Q1 Semi-Final 1.5"
    io.open(path, "w", encoding="utf-8").write(json.dumps(src, indent=1, ensure_ascii=False))
    print("  source file updated to %s" % src["schedule_version"])

main()
