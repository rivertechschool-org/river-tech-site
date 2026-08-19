#!/usr/bin/env python3
"""
Build the "All Classes" master panel from the five level panels in
assets/data/schedule-q1-2026-27.json.

The master panel is a derived view, never a second source. Re-run this whenever
the schedule JSON changes; do not hand-edit the generated panel.

Usage:  python3 build_all_panel.py <schedule.json> <out.html>
"""
import sys, json, re
from collections import OrderedDict

# Level colours, in the reading order used by the Keynote master grid.
DEFAULT_COLOR = {
    "hs":   "#B03A2E",   # High School
    "jh":   "#8A6D1B",   # Junior High
    "ms":   "#7D3C98",   # Middle School
    "elem": "#2471A3",   # Elementary 1st-4th
    "home": "#333333",   # Homeschool, upper half [UH]
}
LEVEL_ORDER = ["#B03A2E", "#8A6D1B", "#7D3C98", "#2471A3",
               "#1E8449", "#CA6F1E", "#333333", "#9AA0A6"]
PANEL_ORDER = ["hs", "jh", "ms", "elem", "home"]

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

# Canonical time rows for the merged grid, in order.
# The homeschool 2:20-2:30 clean-up row is deliberately left out: it applies to
# homeschool days only, and stating it school-wide would be wrong. It stays on
# the Homeschoolers tab, where it is true.
TIMES = ["8:30&ndash;8:45", "8:45&ndash;9:35", "9:35&ndash;10:25",
         "10:25&ndash;11:05", "11:05&ndash;11:45", "Lunch",
         "1:00&ndash;1:40", "1:40&ndash;2:20"]

ROW_CLASS = {"8:30&ndash;8:45": "assembly-row", "Lunch": "lunch-row"}


def norm_time(t):
    """Panels disagree on dash characters; fold them to one spelling."""
    t = re.sub(r"&ndash;|&mdash;|[–—]", "&ndash;", t)
    return t.strip()


def key_of(text):
    """Dedup key. The panels spell the same class two ways -- one writes the
    room emoji literally, another writes it as a numeric entity -- so the same
    class must be folded to one string before comparing."""
    k = html_unescape(text)
    k = re.sub(r"\s+", " ", k).strip().lower()
    return k


def html_unescape(s):
    import html as _h
    return _h.unescape(s)


def rank(color):
    return LEVEL_ORDER.index(color) if color in LEVEL_ORDER else len(LEVEL_ORDER)


def collect(panels):
    """grid[time][day] -> list of (text, color, role); plus prod-cell spans."""
    grid = {t: {d: OrderedDict() for d in DAYS} for t in TIMES}
    prod = {}          # (time, day) -> (lines, rowspan)  for production cells
    full = {}          # time -> lines, for rows that span every day
    notes = OrderedDict()

    for panel in panels:
        pid = panel["id"]
        base = DEFAULT_COLOR[pid]
        # This panel's day columns, read from its own header row.
        head = next(r for r in panel["rows"] if r["section"] == "thead")
        pdays = [c["lines"][0]["text"] for c in head["cells"][1:]]

        body = [r for r in panel["rows"] if r["section"] == "tbody"]
        occupied = set()      # (row_index, column_index) already taken by a rowspan

        for ri, row in enumerate(body):
            cells = list(row["cells"])
            time = norm_time(cells[0]["lines"][0]["text"])
            if time not in grid:
                continue

            col = 0
            for cell in cells[1:]:
                while col < len(pdays) and (ri, col) in occupied:
                    col += 1
                if col >= len(pdays):
                    break
                span = int(cell.get("colspan") or 1)
                rspan = int(cell.get("rowspan") or 1)
                is_prod = (cell.get("class") or "") == "prod"
                lines = [(l["text"], l["color"] or base, l.get("role"))
                         for l in cell["lines"]]

                if span >= len(pdays):
                    full.setdefault(time, lines)
                    break

                for k in range(span):
                    if col + k >= len(pdays):
                        break
                    day = pdays[col + k]
                    if is_prod:
                        prod.setdefault((time, day), (lines, rspan))
                    else:
                        # A rowspan cell belongs to every row it covers.
                        for rr in range(ri, min(ri + rspan, len(body))):
                            tt = norm_time(body[rr]["cells"][0]["lines"][0]["text"])
                            if tt in grid:
                                for txt, color, role in lines:
                                    grid[tt][day].setdefault(
                                        (key_of(txt), color), (txt, role))
                    for rr in range(ri, ri + rspan):
                        occupied.add((rr, col + k))
                col += span

        for n in panel.get("notes", []):
            notes.setdefault(n, True)

    return grid, prod, full, notes


def join_lines(lines):
    """Render a plain list of (text, colour, role) tuples, keeping <small>."""
    parts = []
    for txt, _, role in lines:
        parts.append("<small>%s</small>" % txt if role == "small" else txt)
    return "<br>".join(parts)


def render(grid, prod, full, notes, meta):
    out = ['<div class="schedule-panel" id="panel-all">',
           '<div class="schedule-table-wrap"><table class="schedule-table">',
           '<thead><tr><th>Time</th>' +
           "".join("<th>%s</th>" % d for d in DAYS) + '</tr></thead><tbody>']

    skip = {}   # (time_index, day) -> True when covered by a rowspan above
    for i, time in enumerate(TIMES):
        cls = ROW_CLASS.get(time)
        out.append('<tr%s>' % (' class="%s"' % cls if cls else ""))
        out.append('<td class="time-cell">%s</td>' % time)

        if time in full:
            out.append('<td colspan="5">%s</td>' % join_lines(full[time]))
            out.append("</tr>")
            continue

        for d in DAYS:
            if skip.get((i, d)):
                continue
            if (time, d) in prod:
                lines, rspan = prod[(time, d)]
                for k in range(1, rspan):
                    skip[(i + k, d)] = True
                out.append('<td class="prod"%s>%s</td>' %
                           (' rowspan="%d"' % rspan if rspan > 1 else "",
                            join_lines(lines)))
                continue
            items = sorted(grid[time][d].items(), key=lambda kv: rank(kv[0][1]))
            if not items:
                out.append("<td></td>")
                continue
            parts = []
            for (_, color), (txt, role) in items:
                if role == "small":
                    txt = "<small>%s</small>" % txt
                parts.append('<span style="color:%s">%s</span>' % (color, txt))
            out.append("<td>%s</td>" % "<br>".join(parts))
        out.append("</tr>")

    out.append("</tbody></table></div>")
    out.append('<p class="sfoot"><strong>Every class, every level, side by side.</strong> '
               'Colour shows the level: <span style="color:#B03A2E">High School</span> &middot; '
               '<span style="color:#8A6D1B">Junior High</span> &middot; '
               '<span style="color:#7D3C98">Middle School</span> &middot; '
               '<span style="color:#2471A3">Elementary</span> '
               '(<span style="color:#1E8449">3rd&ndash;4th</span>, '
               '<span style="color:#CA6F1E">1st&ndash;2nd</span>) &middot; '
               '<span style="color:#333">Homeschool [UH]</span> &middot; '
               '<span style="color:#9AA0A6">Homeschool [YH]</span>. '
               'The table is wide &mdash; scroll it sideways to reach Friday, '
               'or pick a level tab above to see that level on its own.</p>')
    for n in notes:
        out.append('<p class="sfoot">%s</p>' % n)
    out.append("</div>")
    return "".join(out)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    data = json.load(open(src))
    panels = {p["id"]: p for p in data["panels"]}
    ordered = [panels[p] for p in PANEL_ORDER if p in panels]
    grid, prod, full, notes = collect(ordered)
    html = render(grid, prod, full, notes, data)
    open(dst, "w").write(html)
    print("wrote %s (%d bytes)" % (dst, len(html)))


if __name__ == "__main__":
    main()
