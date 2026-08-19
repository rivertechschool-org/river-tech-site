#!/usr/bin/env python3
"""
Move the schedule source from Semi-Final 1.3 to 1.4 (19 August 2026).

The only difference between the two Keynote versions, confirmed by comparing
every text run in both PDFs, is on Friday 10:25-11:05, where Mary and Luke
traded classes:

  Middle School   Drill (LU) 💃              ->  P.E. (MA) 💃
  Elementary      Drill (LU) 💃              ->  P.E. (MA) 💃
  Homeschool YH   Film Making [YH] (MA & KI) ->  Film Making [YH] (LU & KI)

The Keynote writes the Middle School line as bare "P.E." with no teacher, while
the Elementary line beside it reads "P.E. (MA)". Version 1.3 named the teacher on
both, so the missing initials look like an editing slip rather than a decision,
and both lines are written here as "P.E. (MA)". Flagged to Dan.

Usage:  python3 apply_1_4.py <schedule.json>
"""
import sys, io, json
from collections import OrderedDict

EDITS = [
    # panel, time row, cell index (after the time cell), line index, old, new
    ("elem", "10:25&ndash;11:05", 4, 0, "Drill (LU) 💃", "P.E. (MA) 💃"),
    ("ms",   "10:25&ndash;11:05", 4, 0, "Drill (LU) 💃", "P.E. (MA) 💃"),
    ("home", "10:25&ndash;11:05", 3, 1,
     "Film Making [YH] (MA &amp; KI) 🎨", "Film Making [YH] (LU &amp; KI) 🎨"),
]

OLD_STAMP = "Q1, as of Aug 17, 2026"
NEW_STAMP = "Q1, as of Aug 19, 2026"


def main():
    path = sys.argv[1]
    src = json.load(io.open(path, encoding="utf-8"), object_pairs_hook=OrderedDict)
    panels = {p["id"]: p for p in src["panels"]}

    for pid, time, ci, li, old, new in EDITS:
        panel = panels[pid]
        row = next(r for r in panel["rows"]
                   if r["section"] == "tbody"
                   and r["cells"][0]["lines"][0]["text"] == time)
        line = row["cells"][1 + ci]["lines"][li]
        if line["text"] != old:
            raise SystemExit("panel-%s %s cell%d line%d reads %r, expected %r"
                             % (pid, time, ci, li, line["text"], old))
        line["text"] = new
        print("  panel-%-5s Friday %s:  %s  ->  %s" % (pid, time, old, new))

    stamped = 0
    for panel in src["panels"]:
        for i, n in enumerate(panel["notes"]):
            if OLD_STAMP in n:
                panel["notes"][i] = n.replace(OLD_STAMP, NEW_STAMP)
                stamped += 1
    print("  date stamp updated on %d panel notes" % stamped)

    src["schedule_version"] = "Q1 Semi-Final 1.4"
    src["as_of"] = "2026-08-19"

    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(src, indent=1, ensure_ascii=False))
    print("  source file updated to %s (%s)" % (src["schedule_version"], src["as_of"]))


if __name__ == "__main__":
    main()
