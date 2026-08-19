#!/usr/bin/env python3
"""
Step 1 of the one-source schedule.

parse    : read the five schedule panels out of a live page into a structured JSON source file
verify   : parse -> render -> compare against the original, normalised, and report any difference
teachers : per-teacher pivot, which is what the Teachers page needs

Usage:
  python3 schedule_source.py parse    <page.html> <out.json>
  python3 schedule_source.py verify   <page.html> <out.json>
  python3 schedule_source.py teachers <out.json>
"""
import sys, re, json, io
from collections import OrderedDict, defaultdict

PANEL_RE = re.compile(r'<div class="schedule-panel" id="panel-([a-z]+)">(.*?)(?=<div class="schedule-panel" id="panel-|<script>|\Z)', re.S)
TABLE_RE = re.compile(r'<table class="schedule-table">(.*?)</table>', re.S)
TR_RE = re.compile(r'<tr([^>]*)>(.*?)</tr>', re.S)
CELL_RE = re.compile(r'<(td|th)([^>]*)>(.*?)</\1>', re.S)
ATTR_RE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')
SFOOT_RE = re.compile(r'<p class="sfoot">(.*?)</p>', re.S)
# A panel's own content is its table plus the sfoot notes that follow it. The last
# panel on a page runs on into the rest of the page, so trim to that boundary.
BODY_RE = re.compile(r'<div class="schedule-table-wrap">.*?</table>\s*</div>\s*(?:<p class="sfoot">.*?</p>\s*)*', re.S)


def panel_body(body):
    m = BODY_RE.search(body)
    return m.group(0) if m else body


def attrs(s):
    return dict(ATTR_RE.findall(s or ""))


def parse_lines(inner):
    parts = re.split(r'<br\s*/?>', inner)
    lines = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        color = None
        m = re.match(r'^<span style="color:([^"]+)">(.*)</span>$', part, re.S)
        if m:
            color, part = m.group(1), m.group(2)
        role = None
        m = re.match(r'^<small>(.*)</small>$', part, re.S)
        if m:
            role, part = "small", m.group(1)
        else:
            m = re.match(r'^<b>(.*)</b>$', part, re.S)
            if m:
                role, part = "bold", m.group(1)
        lines.append(OrderedDict([("text", part.strip()), ("color", color), ("role", role)]))
    return lines


def parse_page(path):
    with io.open(path, encoding="utf-8") as fh:
        page = fh.read()
    panels = []
    for pid, body in PANEL_RE.findall(page):
        body = panel_body(body)
        tbl = TABLE_RE.search(body)
        if not tbl:
            continue
        rows = []
        table = tbl.group(1)
        sections = []
        for name in ("thead", "tbody"):
            m = re.search(r'<%s>(.*?)</%s>' % (name, name), table, re.S)
            if m:
                sections.append((name, m.group(1)))
        if not sections:
            sections = [(None, table)]
        for section, chunk in sections:
            for trattr, trbody in TR_RE.findall(chunk):
                cells = []
                for tag, cattr, inner in CELL_RE.findall(trbody):
                    a = attrs(cattr)
                    cells.append(OrderedDict([
                        ("tag", tag),
                        ("class", a.get("class")),
                        ("rowspan", int(a.get("rowspan", 1))),
                        ("colspan", int(a.get("colspan", 1))),
                        ("lines", parse_lines(inner)),
                    ]))
                rows.append(OrderedDict([("section", section),
                                         ("class", attrs(trattr).get("class")),
                                         ("cells", cells)]))
        notes = [n.strip() for n in SFOOT_RE.findall(body)]
        panels.append(OrderedDict([("id", pid), ("rows", rows), ("notes", notes)]))
    legend = re.findall(r'<div class="schedule-legend">(.*?)</div>', page, re.S)
    header = re.search(r'<p class="schedule-date">(.*?)</p>', page, re.S)
    return OrderedDict([
        ("schedule_version", "Q1 Semi-Final 1.3"),
        ("as_of", "2026-08-17"),
        ("header", header.group(1).strip() if header else None),
        ("legend", [l.strip() for l in legend]),
        ("panels", panels),
    ])


def render_lines(lines):
    out = []
    for ln in lines:
        t = ln["text"]
        if ln["role"] == "small":
            t = "<small>%s</small>" % t
        elif ln["role"] == "bold":
            t = "<b>%s</b>" % t
        if ln["color"]:
            t = '<span style="color:%s">%s</span>' % (ln["color"], t)
        out.append(t)
    return "<br>".join(out)


def render_panel(panel):
    out = ['<div class="schedule-panel" id="panel-%s">' % panel["id"]]
    out.append('<div class="schedule-table-wrap"><table class="schedule-table">')
    body = []
    section = "start"
    for row in panel["rows"]:
        want = row.get("section")
        if want != section:
            if section not in ("start", None):
                body.append("</%s>" % section)
            if want:
                body.append("<%s>" % want)
            section = want
        rc = ' class="%s"' % row["class"] if row["class"] else ""
        cells = []
        for c in row["cells"]:
            a = ""
            if c["class"]:
                a += ' class="%s"' % c["class"]
            if c["rowspan"] != 1:
                a += ' rowspan="%d"' % c["rowspan"]
            if c["colspan"] != 1:
                a += ' colspan="%d"' % c["colspan"]
            cells.append("<%s%s>%s</%s>" % (c["tag"], a, render_lines(c["lines"]), c["tag"]))
        body.append("<tr%s>%s</tr>" % (rc, "".join(cells)))
    if section not in ("start", None):
        body.append("</%s>" % section)
    out.append("".join(body))
    out.append("</table></div>")
    for n in panel["notes"]:
        out.append('<p class="sfoot">%s</p>' % n)
    out.append("</div>")
    return "".join(out)


def normalise(s):
    s = re.sub(r'<br\s*/?>', '<br>', s)
    s = re.sub(r'>\s+<', '><', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def verify(path, jpath):
    with io.open(path, encoding="utf-8") as fh:
        page = fh.read()
    src = json.load(io.open(jpath, encoding="utf-8"), object_pairs_hook=OrderedDict)
    bad = 0
    for pid, body in PANEL_RE.findall(page):
        original = normalise('<div class="schedule-panel" id="panel-%s">%s</div>' % (pid, panel_body(body)))
        match = [p for p in src["panels"] if p["id"] == pid]
        if not match:
            # panel-all is derived from the five level panels by
            # tools/build_all_panel.py, so it is not in the source file and has
            # nothing to round-trip against. Skip it rather than crash.
            print("  panel-%-5s derived, not a source panel - skipped" % pid)
            continue
        panel = match[0]
        regenerated = normalise(render_panel(panel))
        if original == regenerated:
            print("  panel-%-5s OK   %d chars round-tripped exactly" % (pid, len(original)))
        else:
            bad += 1
            print("  panel-%-5s DIFFERS" % pid)
            for i in range(min(len(original), len(regenerated))):
                if original[i] != regenerated[i]:
                    print("    first difference at char %d" % i)
                    print("    original    ...%s..." % original[max(0, i-60):i+60])
                    print("    regenerated ...%s..." % regenerated[max(0, i-60):i+60])
                    break
            else:
                print("    lengths differ: %d vs %d" % (len(original), len(regenerated)))
    return bad


def apply_to_page(path, jpath):
    """Rewrite every schedule panel in a page from the source file."""
    src = json.load(io.open(jpath, encoding="utf-8"), object_pairs_hook=OrderedDict)
    with io.open(path, encoding="utf-8") as fh:
        page = fh.read()
    changed = 0
    for panel in src["panels"]:
        head = '<div class="schedule-panel" id="panel-%s">' % panel["id"]
        i = page.find(head)
        if i < 0:
            continue
        body = panel_body(page[i + len(head):])
        j = i + len(head) + len(body)
        m = re.match(r'\s*</div>', page[j:])
        if not m:
            raise SystemExit("panel-%s in %s does not close where expected" % (panel["id"], path))
        original = page[i:j + m.end()]
        generated = render_panel(panel)
        if original != generated:
            page = page[:i] + generated + page[j + m.end():]
            changed += 1
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(page)
    return changed


PANEL_LABEL = {"elem": "Elementary", "ms": "Middle School", "jh": "Junior High",
               "hs": "High School", "home": "Homeschool"}
INITIALS = re.compile(r'\(([A-Z]{2})(?:\s*(?:&amp;|&)\s*([A-Z]{2}))?\)')


def teacher_pivot(jpath):
    src = json.load(io.open(jpath, encoding="utf-8"), object_pairs_hook=OrderedDict)
    byteacher = defaultdict(list)
    for panel in src["panels"]:
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        if panel["id"] == "home":
            days = ["Monday", "Tuesday", "Thursday", "Friday"]
        for row in panel["rows"]:
            cells = row["cells"]
            if not cells or cells[0].get("class") != "time-cell":
                continue
            time = " ".join(l["text"] for l in cells[0]["lines"])
            di = 0
            for c in cells[1:]:
                day = days[di] if di < len(days) else "?"
                di += c["colspan"]
                for ln in c["lines"]:
                    text = ln["text"]
                    for m in INITIALS.finditer(text):
                        subject = re.sub(r'\s+', ' ', INITIALS.sub("", text)).strip()
                        for who in m.groups():
                            if who:
                                byteacher[who].append(OrderedDict([
                                    ("day", day), ("time", time),
                                    ("group", PANEL_LABEL.get(panel["id"], panel["id"])),
                                    ("what", subject),
                                ]))
    return byteacher


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "parse":
        data = parse_page(sys.argv[2])
        with io.open(sys.argv[3], "w", encoding="utf-8") as fh:
            fh.write(json.dumps(data, indent=1, ensure_ascii=False))
        print("Wrote %s - %d panels" % (sys.argv[3], len(data["panels"])))
    elif cmd == "verify":
        print("Round-trip check: page -> source file -> HTML -> compare")
        bad = verify(sys.argv[2], sys.argv[3])
        print("RESULT: %s" % ("ALL PANELS ROUND-TRIP EXACTLY" if bad == 0 else "%d panel(s) differ" % bad))
        sys.exit(1 if bad else 0)
    elif cmd == "apply":
        jpath = sys.argv[2]
        for page in sys.argv[3:]:
            n = apply_to_page(page, jpath)
            print("  %s - %d panel(s) rewritten from the source file" % (page, n))
    elif cmd == "teachers":
        piv = teacher_pivot(sys.argv[2])
        for who in sorted(piv, key=lambda w: -len(piv[w])):
            print("%-4s %3d slots" % (who, len(piv[who])))
