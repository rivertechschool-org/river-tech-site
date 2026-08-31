#!/usr/bin/env python3
"""
Build pages/teachers.html from two source files and one existing page.

  assets/data/schedule-q1-2026-27.json   the class schedule (single source of truth)
  assets/data/teachers.json              the people, their roles and their photographs
  pages/why-river-tech.html              borrowed for the head, nav and footer, so the
                                         page cannot drift from the rest of the site

Usage:  python3 tools/build_teachers.py <repo_root>
"""
import sys, os, io, re, json, html as htmlmod
from collections import OrderedDict, defaultdict

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SHELL_PAGE = os.path.join(ROOT, "pages", "why-river-tech.html")
SCHEDULE = os.path.join(ROOT, "assets", "data", "schedule-q1-2026-27.json")
PEOPLE = os.path.join(ROOT, "assets", "data", "teachers.json")
OUT = os.path.join(ROOT, "pages", "teachers.html")

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
PANEL_LABEL = {"elem": "Elementary", "ms": "Middle School", "jh": "Junior High",
               "hs": "High School", "home": "Homeschool"}
INITIALS = re.compile(r'\(((?:[A-Z]{2})(?:\s*(?:,|&amp;|&)\s*[A-Z]{2})*)\)')
ROOM_CHARS = "☕🚀🌳☀💡🎨📚🎻💃🤖🎤"

# ---------------------------------------------------------------- helpers

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)


def parse_time(label):
    """'10:25&ndash;11:05' -> (625, 665) minutes from midnight. None if not a clock."""
    t = strip_tags(label).replace("&ndash;", "–").replace("&mdash;", "–")
    m = re.match(r'\s*(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})', t)
    if not m:
        return None
    h1, m1, h2, m2 = (int(x) for x in m.groups())
    def to24(h):
        return h + 12 if h < 8 else h
    return to24(h1) * 60 + m1, to24(h2) * 60 + m2


def room_of(text):
    for ch in text:
        if ch in ROOM_CHARS:
            return ch
    return ""


def clean_subject(text):
    text = strip_tags(text)
    for ch in ROOM_CHARS:
        text = text.replace(ch, "")
    for ent in ("&#9749;", "&#128131;", "&#127908;", "&#127950;", "&#127925;"):
        text = text.replace(ent, "")
    text = INITIALS.sub("", text)
    return re.sub(r'\s+', ' ', text).strip(" ,")


def plain_subject(text):
    """The subject as a parent would say it: no elective letters, no group markers."""
    text = clean_subject(text)
    text = re.sub(r'^\([ABC]\)\s*', '', text)
    text = re.sub(r'^Elective:\s*', '', text)
    text = re.sub(r'\s*\[(UH|YH)\]', '', text)
    return text.strip(" ,")

# ---------------------------------------------------------------- the pivot

def build_slots(schedule, grades):
    """Every scheduled line, attributed to the grade groups it actually belongs to."""
    by_panel_color = defaultdict(list)
    for g in grades:
        for c in g["colors"]:
            by_panel_color[(g["panel"], c)].append(g["id"])

    slots = []
    for panel in schedule["panels"]:
        pid = panel["id"]
        days = DAYS if pid != "home" else ["Monday", "Tuesday", "Thursday", "Friday"]
        pending = defaultdict(int)   # column -> rows still covered by a rowspan above
        # A cell with rowspan runs to the end of the last row it covers, so work out
        # every row's own span first — otherwise a two-row rehearsal looks 40 minutes long.
        row_span = []
        for r in panel["rows"]:
            cs = r["cells"]
            row_span.append(parse_time(" ".join(l["text"] for l in cs[0]["lines"]).replace("\u2013", "&ndash;"))
                            if cs and cs[0].get("class") == "time-cell" else None)
        for ri, row in enumerate(panel["rows"]):
            cells = row["cells"]
            if not cells or cells[0].get("class") != "time-cell":
                for k in list(pending):
                    if pending[k] > 0:
                        pending[k] -= 1
                continue
            time_label = " ".join(l["text"] for l in cells[0]["lines"])
            # Some panels were typed with a literal en dash and some with &ndash;.
            # Normalise, or the same slot appears as two different rows.
            time_label = time_label.replace("\u2013", "&ndash;")
            span = parse_time(time_label)
            di = 0
            for c in cells[1:]:
                # A cell higher up the table with rowspan still occupies its column,
                # so the day a cell lands on is not simply its position in the row.
                while pending.get(di, 0) > 0:
                    di += 1
                day = days[di] if di < len(days) else None
                width = c["colspan"]
                cell_span = span
                if c["rowspan"] > 1:
                    for k in range(di, di + width):
                        pending[k] = c["rowspan"]
                    last = None
                    for j in range(ri, min(ri + c["rowspan"], len(row_span))):
                        if row_span[j]:
                            last = row_span[j]
                    if span and last:
                        cell_span = (span[0], last[1])
                di += width
                if day is None:
                    continue
                dayset = days if width > 1 else [day]
                for idx, ln in enumerate(c["lines"]):
                    text = ln["text"]
                    if ln.get("role") == "small":
                        continue
                    m = INITIALS.search(text)
                    if not m:
                        continue
                    who = re.split(r'\s*(?:,|&amp;|&)\s*', m.group(1))
                    gids = by_panel_color.get((pid, ln.get("color")), [])
                    if not gids:
                        continue
                    what = clean_subject(text)
                    room = room_of(text)
                    if not what:
                        # A line that is only initials — e.g. "(CH, EV & DA)" under a
                        # production title. The subject is the title at the top of the
                        # cell, and the room is wherever the cell says it is.
                        above = c["lines"][:idx]
                        for prev in above:
                            cand = clean_subject(prev["text"])
                            if cand:
                                what = cand
                                break
                        for prev in above:
                            room = room or room_of(prev["text"])
                    if c.get("class") == "prod":
                        room = room or "\U0001F3A4"
                    if not what:
                        continue
                    for d in dayset:
                        slots.append(OrderedDict([
                            ("who", who), ("day", d), ("time", time_label), ("span", cell_span),
                            ("group", PANEL_LABEL.get(pid, pid)), ("grades", gids),
                            ("what", what), ("plain", plain_subject(text) or plain_subject(what)),
                            ("room", room), ("duty", row.get("class") == "lunch-row"),
                        ]))
            for k in list(pending):
                if pending[k] > 0:
                    pending[k] -= 1
    return slots


def per_teacher(slots, people):
    out = defaultdict(dict)
    for s in slots:
        for w in s["who"]:
            key = (s["day"], s["time"], s["what"])
            entry = out[w].get(key)
            if entry:
                entry["grades"] = sorted(set(entry["grades"]) | set(s["grades"]))
                if s["group"] not in entry["groups"]:
                    entry["groups"].append(s["group"])
            else:
                out[w][key] = {"day": s["day"], "time": s["time"], "span": s["span"],
                               "what": s["what"], "plain": s.get("plain") or s["what"],
                               "room": s["room"], "duty": s["duty"],
                               "grades": list(s["grades"]), "groups": [s["group"]]}
    for p in people:
        for ms in p.get("manual_slots", []):
            key = (ms["day"], ms["time"], ms["what"])
            out[p["initials"]].setdefault(key, {
                "day": ms["day"], "time": ms["time"], "span": parse_time(ms["time"]),
                "what": ms["what"], "plain": plain_subject(ms["what"]),
                "room": "\U0001F3A4", "duty": False,
                "grades": [g["id"] for g in []], "groups": [ms["group"]]})
    return {k: sorted(v.values(), key=lambda e: (DAYS.index(e["day"]) if e["day"] in DAYS else 9,
                                                 e["span"][0] if e["span"] else 9999)) for k, v in out.items()}

# ---------------------------------------------------------------- page

CSS = """
<style>
/* ---- Teachers page. Uses the site's own colours, fonts and spacing. ---- */
.tp-now{font-family:var(--font-body);font-size:1.05rem;line-height:1.75;background:#fff;
  border-left:4px solid var(--color-teacher-bg);border-radius:0 8px 8px 0;padding:18px 22px;
  margin:26px 0 34px;box-shadow:0 1px 4px rgba(39,36,67,.08)}
.tp-now .tp-clock{display:block;font-family:var(--font-display);font-size:.72rem;letter-spacing:.14em;
  text-transform:uppercase;color:var(--color-teacher-bg);margin-bottom:8px}
.tp-controls{margin:0 0 10px}
.tp-controls h2{font-family:var(--font-display);font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;
  color:#6b6780;margin:0 0 10px}
.tp-grades{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.tp-grades button{font-family:var(--font-body);font-size:.95rem;color:var(--color-text);background:#fff;
  border:1px solid #ddd8cd;border-radius:999px;padding:7px 16px;cursor:pointer;
  transition:background .3s ease-in-out,color .3s ease-in-out,border-color .3s ease-in-out}
.tp-grades button:hover{border-color:var(--color-teacher-bg)}
.tp-grades button[aria-pressed="true"]{background:var(--color-teacher-bg);border-color:var(--color-teacher-bg);color:#fff}
.tp-search{width:100%;max-width:420px;font-family:var(--font-body);font-size:1rem;color:var(--color-text);
  background:#fff;border:1px solid #ddd8cd;border-radius:999px;padding:9px 18px;margin-bottom:6px}
.tp-answer{font-family:var(--font-body);font-style:italic;color:#55516d;min-height:1.6em;margin:6px 0 22px}
.tp-team-photo{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;margin:24px 0 34px;box-shadow:0 2px 10px rgba(39,36,67,.12)}
.tp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:22px;margin:0 0 40px;padding:0;list-style:none}
.tp-card{margin:0}
.tp-card[hidden]{display:none}
.tp-card button.tp-face{display:block;width:100%;text-align:left;background:none;border:0;padding:0;cursor:pointer;font:inherit;color:inherit}
.tp-portrait{position:relative;width:100%;aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:#e9e4da}
.tp-portrait img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.72) contrast(1.02);
  transition:filter .5s ease-in-out,transform .5s ease-in-out}
.tp-card:hover .tp-portrait img,.tp-card:focus-within .tp-portrait img{filter:saturate(1) contrast(1);transform:scale(1.03)}
.tp-portrait.tp-pending{display:flex;align-items:center;justify-content:center;
  background:repeating-linear-gradient(135deg,#efeae1,#efeae1 9px,#e9e4da 9px,#e9e4da 18px)}
.tp-portrait.tp-pending span{font-family:var(--font-display);font-size:.66rem;letter-spacing:.13em;
  text-transform:uppercase;color:#8f8a7d}
.tp-name{font-family:var(--font-body);font-size:1.12rem;margin:12px 0 2px;color:var(--color-text)}
.tp-role{font-family:var(--font-display);font-size:.7rem;letter-spacing:.11em;text-transform:uppercase;
  color:var(--color-teacher-bg);margin:0 0 6px}
.tp-line{font-family:var(--font-body);font-size:.92rem;line-height:1.55;color:#55516d;margin:0}
.tp-teaches{font-family:var(--font-body);font-size:.88rem;font-style:italic;color:#7a7590;margin:8px 0 0}
.tp-week{margin-top:14px;border-top:1px solid #e3ded4;padding-top:12px}
.tp-week[hidden]{display:none}
.tp-week h4{font-family:var(--font-display);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;
  color:#6b6780;margin:12px 0 4px}
.tp-week h4:first-child{margin-top:0}
.tp-week ul{list-style:none;margin:0;padding:0}
.tp-week li{font-family:var(--font-body);font-size:.9rem;line-height:1.5;color:var(--color-text);
  display:flex;gap:10px;padding:2px 0}
.tp-week li.tp-duty{color:#8b8799}
.tp-week .tp-t{flex:0 0 92px;color:#8b8799;font-variant-numeric:tabular-nums}
.tp-open{font-family:var(--font-display);font-size:.68rem;letter-spacing:.11em;text-transform:uppercase;
  color:var(--color-teacher-bg);margin-top:10px;display:inline-block}
.tp-h2{font-family:var(--font-display);font-size:1.25rem;color:var(--color-text);margin:8px 0 4px}
.tp-sub{font-family:var(--font-body);color:#55516d;margin:0 0 4px}
.tpw .schedule-tabs{justify-content:flex-start}
.tpw .schedule-tab{font-size:13px;padding:8px 13px}
.tpw-panel[hidden]{display:none}
.tpw .schedule-table td{vertical-align:top}
.tpw .schedule-table td.tpw-duty{color:#8b8799;font-weight:400}
.tp-wfoot{font-size:.8rem;color:#666;font-style:italic;text-align:center;margin:.4rem 0 2.2rem}
.tp-contact{background:#fff;border:1px solid #e3ded4;border-radius:10px;padding:22px 26px;margin:0 0 34px}
.tp-contact h3{margin-top:0}
.tp-key{display:flex;flex-wrap:wrap;gap:6px 18px;font-family:var(--font-body);font-size:.86rem;color:#6b6780;margin:0 0 40px}
.tp-empty{font-family:var(--font-body);font-style:italic;color:#7a7590}
.tp-empty[hidden]{display:none}
@media (prefers-reduced-motion: reduce){.tp-portrait img{transition:none}.tp-card:hover .tp-portrait img{transform:none}}
@media print{.sidebar,.top-bar,.mobile-header,.site-footer,.tp-controls,.tp-now,.scroll-top{display:none!important}
  .tp-grid{grid-template-columns:1fr 1fr}.tp-week{display:block!important}}
</style>
"""

JS = """
<script>
(function(){
  var SLOTS = %(slots)s;
  var NAMES = %(names)s;
  var DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  /* ---- Right now at River Tech ---------------------------------------- */
  function list(a){ if(a.length===1) return a[0];
    if(a.length===2) return a[0]+" and "+a[1];
    return a.slice(0,-1).join(", ")+" and "+a[a.length-1]; }

  function nowLine(){
    var el = document.getElementById("tp-now-text"), clock = document.getElementById("tp-now-clock");
    if(!el) return;
    var d = new Date(), day = DAYS[d.getDay()], mins = d.getHours()*60 + d.getMinutes();
    var hh = d.getHours()%%12; if(hh===0) hh=12;
    var stamp = hh + ":" + String(d.getMinutes()).padStart(2,"0") + " " + (d.getHours()<12?"a.m.":"p.m.") + " on " + day;
    clock.textContent = stamp;
    var live = SLOTS.filter(function(s){ return s.d===day && s.a<=mins && mins<s.b && !s.duty; });
    if(!live.length){
      var next = SLOTS.filter(function(s){ return s.d===day && s.a>mins; }).sort(function(x,y){return x.a-y.a;})[0];
      if(next){
        var nh = Math.floor(next.a/60)%%12 || 12, nm = String(next.a%%60).padStart(2,"0");
        el.textContent = "The halls are quiet just now. The next thing on today\\u2019s timetable is at " + nh + ":" + nm + " \\u2014 " + next.w + ".";
      } else if(day==="Saturday" || day==="Sunday"){
        el.textContent = "It is the weekend, and the school is resting. On Monday morning the week begins at 8:30 with Assembly, and the whole school is in one room.";
      } else {
        el.textContent = "The school day is over and the building is quiet. Tomorrow begins at 8:30 with Assembly, and the whole school is in one room.";
      }
      return;
    }
    var seen = {}, phrases = [];
    live.forEach(function(s){
      var who = s.p.map(function(i){ return NAMES[i] || i; });
      var key = who.join("+") + "|" + s.w;
      if(seen[key]) return; seen[key] = 1;
      var verb = who.length>1 ? "are" : "is";
      phrases.push(s.stage
        ? list(who) + " " + verb + " rehearsing " + s.w
        : list(who) + " " + verb + " teaching " + s.w + " to the " + s.g.toLowerCase());
    });
    if(phrases.length > 5) phrases = phrases.slice(0,5).concat(["and more besides"]);
    el.textContent = "Right now " + list(phrases) + ".";
  }
  nowLine(); setInterval(nowLine, 30000);

  /* ---- Show me my child's teachers ------------------------------------ */
  var cards = Array.prototype.slice.call(document.querySelectorAll(".tp-card"));
  var empty = document.getElementById("tp-empty");
  var grade = null, term = "";

  function apply(){
    var shown = 0;
    cards.forEach(function(c){
      var okG = !grade || (c.dataset.grades||"").split(" ").indexOf(grade) > -1;
      var okT = !term || (c.dataset.search||"").indexOf(term) > -1;
      c.hidden = !(okG && okT);
      if(!c.hidden) shown++;
    });
    if(empty) empty.hidden = shown > 0;
    say();
  }

  function say(){
    var answer = document.getElementById("tp-answer");
    if(!answer) return;
    if(!term){ answer.textContent = ""; return; }
    var who = cards.filter(function(c){ return !c.hidden; }).map(function(c){ return c.dataset.first; });
    answer.textContent = who.length
      ? (term.charAt(0).toUpperCase()+term.slice(1)) + " is taught by " + list(who) + "."
      : "Nobody teaches that yet \u2014 try \u201ccoding\u201d, \u201cdance\u201d, \u201cSpanish\u201d or \u201crobotics\u201d.";
  }

  document.querySelectorAll(".tp-grades button").forEach(function(b){
    b.addEventListener("click", function(){
      var g = b.dataset.grade || null;
      grade = (grade === g) ? null : g;
      document.querySelectorAll(".tp-grades button").forEach(function(o){
        o.setAttribute("aria-pressed", String(o.dataset.grade === grade));
      });
      apply();
    });
  });

  /* ---- Ask it a question ---------------------------------------------- */
  var box = document.getElementById("tp-search"), answer = document.getElementById("tp-answer");
  if(box) box.addEventListener("input", function(){
    term = box.value.trim().toLowerCase();
    apply();
    if(!term){ answer.textContent = ""; return; }
    var who = cards.filter(function(c){ return !c.hidden; })
                   .map(function(c){ return c.dataset.first; });
    answer.textContent = who.length
      ? (term.charAt(0).toUpperCase()+term.slice(1)) + " is taught by " + list(who) + "."
      : "Nobody teaches that yet \\u2014 try \\u201ccoding\\u201d, \\u201cdance\\u201d, \\u201cSpanish\\u201d or \\u201crobotics\\u201d.";
  });

  /* ---- Teachers as tabs: choose a name, see that week ------------------ */
  function showWeek(who, scroll){
    var panel = document.getElementById("tpw-" + who);
    if(!panel) return false;
    document.querySelectorAll(".tpw-panel").forEach(function(p){ p.hidden = (p !== panel); });
    document.querySelectorAll(".tpw .schedule-tab").forEach(function(t){
      t.classList.toggle("active", t.dataset.who === who);
    });
    if(scroll) panel.parentNode.scrollIntoView({behavior:"smooth", block:"start"});
    return true;
  }

  document.querySelectorAll(".tpw .schedule-tab").forEach(function(t){
    t.addEventListener("click", function(){ showWeek(t.dataset.who, false); });
  });

  document.querySelectorAll(".tp-face").forEach(function(btn){
    btn.addEventListener("click", function(){ showWeek(btn.dataset.who, true); });
  });

  /* Approved biographies belong on the visible teacher cards. */
  ["DA", "MA", "CA", "JO", "LU", "PH", "CR"].forEach(function(who){
    var bio = document.querySelector("#tpw-" + who + " .tp-bio");
    var summary = document.querySelector('.tp-face[data-who="' + who + '"] .tp-line');
    if(!bio || !summary) return;
    summary.innerHTML = bio.innerHTML;
    bio.remove();
  });

})();
</script>
"""


def build():
    schedule = json.load(io.open(SCHEDULE, encoding="utf-8"), object_pairs_hook=OrderedDict)
    data = json.load(io.open(PEOPLE, encoding="utf-8"), object_pairs_hook=OrderedDict)
    people, grades, rooms = data["people"], data["grades"], data["rooms"]

    slots = build_slots(schedule, grades)
    weeks = per_teacher(slots, people)

    # ---- cards
    cards = []
    for p in people:
        if p.get("hidden"):
            continue
        ini = p["initials"]
        mine = weeks.get(ini, [])
        gids = sorted({g for e in mine for g in e["grades"]})
        uniq = {}
        for e in mine:
            if e["duty"]:
                continue
            raw = e.get("plain") or e["what"]
            key = htmlmod.unescape(strip_tags(raw)).replace("\u2014", "-").replace("&", "and").lower()
            key = re.sub(r'[^a-z0-9 ]', '', key).strip()
            if key and key not in uniq:
                uniq[key] = raw
        subjects = [uniq[k] for k in sorted(uniq)]
        searchable = " ".join([p["name"], p["role"], strip_tags(p["line"])] + subjects).lower()

        if p.get("photo"):
            portrait = ('<div class="tp-portrait"><img src="../assets/images/teachers/%s" alt="%s" loading="lazy"></div>'
                        % (p["photo"], p["name"]))
        else:
            portrait = '<div class="tp-portrait tp-pending"><span>portrait coming</span></div>'

        week_html = ""

        teaches = ""
        if subjects:
            shown = subjects[:6]
            teaches = '<p class="tp-teaches">%s%s</p>' % (
                ", ".join(shown), "…" if len(subjects) > len(shown) else "")

        cards.append(
            '<li class="tp-card" data-grades="%s" data-search="%s" data-first="%s">'
            '<button class="tp-face" data-who="%s">%s'
            '<h3 class="tp-name">%s</h3><p class="tp-role">%s</p><p class="tp-line">%s</p>%s'
            '%s</button>%s</li>'
            % (" ".join(gids), searchable.replace('"', ""), p["name"].split()[0],
               ini, portrait, p["name"], p["role"], p["line"], teaches,
               '<span class="tp-open">See their week ↓</span>' if mine else "",
               week_html))

    # ---- every teacher's week, as tabs
    tabs, panels = [], []
    first = True
    for p in people:
        if p.get("hidden"):
            continue
        ini, mine = p["initials"], weeks.get(p["initials"], [])
        if not mine:
            continue
        times = OrderedDict()
        for e in mine:
            times.setdefault(e["time"], e["span"][0] if e["span"] else 9999)
        order = sorted(times, key=lambda t: times[t])
        grid = defaultdict(list)
        for e in mine:
            grid[(e["time"], e["day"])].append(e)

        rows = []
        for t in order:
            cells = []
            for day in DAYS:
                items = grid.get((t, day), [])
                if not items:
                    cells.append("<td></td>")
                    continue
                bits = []
                for e in items:
                    label = "%s%s" % (e["what"], (" " + e["room"]) if e["room"] else "")
                    groups = ", ".join(e["groups"])
                    bits.append('%s<br><small style="font-weight:400;opacity:.62">%s</small>'
                                % (label, groups))
                cells.append('<td%s>%s</td>' % (' class="tpw-duty"' if items[0]["duty"] else "",
                                                "<br>".join(bits)))
            rows.append('<tr><td class="time-cell">%s</td>%s</tr>' % (t, "".join(cells)))

        tabs.append('<button class="schedule-tab%s" type="button" data-who="%s">%s<br><small>%s</small></button>'
                    % (" active" if first else "", ini, p["name"].split()[0], p["role"]))
        panels.append(
            '<div class="tpw-panel" id="tpw-%s"%s>%s<div class="schedule-table-wrap">'
            '<table class="schedule-table"><thead><tr><th>Time</th><th>Monday</th><th>Tuesday</th>'
            '<th>Wednesday</th><th>Thursday</th><th>Friday</th></tr></thead><tbody>%s</tbody></table></div>'
            '<p class="tp-wfoot">%s&rsquo;s week &mdash; Quarter 1, as of %s. The same source as the '
            '<a href="calendar.html">Schedule &amp; Calendar</a> page, so the two can never disagree.</p></div>'
            % (ini, "" if first else " hidden",
               ('<p class="tp-bio">%s</p>' % p["bio"]) if p.get("bio") else "",
               "".join(rows), p["name"].split()[0], schedule["as_of"]))
        first = False

    # ---- filter buttons
    buttons = "".join('<button type="button" data-grade="%s" aria-pressed="false">%s</button>'
                      % (g["id"], g["label"]) for g in grades)

    key = "".join('<span>%s %s</span>' % (sym, name) for sym, name in rooms)

    # ---- slots for the live line
    def plain_text(x):
        return htmlmod.unescape(strip_tags(x)).replace("\u2013", "-").strip()

    js_slots = [{"d": e["day"], "a": e["span"][0], "b": e["span"][1],
                 "p": e["who"], "w": plain_text(e.get("plain") or e["what"]),
                 "g": e["group"], "duty": bool(e["duty"]),
                 "stage": e["room"] == "\U0001F3A4"}
                for e in slots if e["span"]]
    names = {p["initials"]: p["name"].split()[0] for p in people}

    body = """
    <div class="page-hero-inner">
      <h1>Our Teachers</h1>
    </div>

    <p style="font-style: italic; text-align: center; margin-top: 30px;">Small classes exist so that every teacher knows every child by name.</p>

    <img class="tp-team-photo" src="../assets/images/teachers/2026-27/group-normal.jpg" alt="River Tech School teaching team for the 2026–27 school year">

    <p class="tp-now"><span class="tp-clock" id="tp-now-clock">At River Tech today</span><span id="tp-now-text">%(fallback)s</span></p>

    <div class="tp-controls">
      <h2>Show me the teachers for&hellip;</h2>
      <div class="tp-grades">%(buttons)s</div>
      <label class="sr-only" for="tp-search">What does your child love?</label>
      <input class="tp-search" id="tp-search" type="search" placeholder="What does your child love? Try &ldquo;coding&rdquo;&hellip;" autocomplete="off">
      <p class="tp-answer" id="tp-answer"></p>
    </div>

    <ul class="tp-grid">%(cards)s</ul>
    <p class="tp-empty" id="tp-empty" hidden>No one matches that just yet. Clear the filters and try another word.</p>

    <h2 class="tp-h2">About our teachers &amp; their week</h2>
    <p class="tp-sub">Choose a name to read their biography and see their whole week &mdash; when they teach, which class, and which room.</p>
    <div class="schedule-tabs-container tpw">
      <div class="schedule-tabs">%(tabs)s</div>
      %(panels)s
    </div>

    <div class="tp-contact">
      <h3>Reaching a teacher</h3>
      <p>Write to <a href="mailto:learn@rivertech.me">learn@rivertech.me</a>, say which teacher you would like to reach, and Brooke passes your message straight to them. We keep teachers&rsquo; addresses off the public web so their inboxes stay for families rather than for strangers.</p>
      <p>If something is unresolved after speaking with a teacher, write to the Principal and copy the teacher. That ladder is set out in full on the <a href="school-start-hub.html">School Start Hub</a>.</p>
    </div>

    <h3>The rooms</h3>
    <div class="tp-key">%(key)s</div>
""" % {"fallback": "Choose a class below to see the adults who will know your child by name.",
       "buttons": buttons, "cards": "".join(cards), "key": key,
       "tabs": "".join(tabs), "panels": "".join(panels)}

    # ---- shell
    shell = io.open(SHELL_PAGE, encoding="utf-8").read()
    head_end = shell.index('<div class="content-area">') + len('<div class="content-area">')
    tail_start = shell.index('<!-- Footer -->')
    head, tail = shell[:head_end], shell[tail_start:]

    head = head.replace("Why River Tech? | Christian School in Post Falls, ID",
                        "Our Teachers | River Tech School, Post Falls, ID")
    head = re.sub(r'(<meta name="description" content=")[^"]*(")',
                  r'\1Meet the teachers of River Tech School in Post Falls, Idaho. See who teaches your child, what they teach, and their week — and how to reach them.\2', head, count=1)
    head = re.sub(r'(<meta property="og:description" content=")[^"]*(")',
                  r'\1Meet the teachers of River Tech School — who teaches your child, what they teach, and their week.\2', head, count=1)
    head = head.replace('content="Why River Tech? | Christian School in Post Falls, ID"',
                        'content="Our Teachers | River Tech School, Post Falls, ID"')
    head = head.replace("https://www.rivertechschool.com/why-river-tech",
                        "https://www.rivertechschool.com/pages/teachers.html")
    head = head.replace("https://www.rivertechschool.com/pages/why-river-tech.html",
                        "https://www.rivertechschool.com/pages/teachers.html")
    head = head.replace('"name": "Why River Tech? | Christian School in Post Falls, ID"',
                        '"name": "Our Teachers | River Tech School, Post Falls, ID"')
    head = head.replace("</head>", CSS + "</head>")
    head = head.replace('<a href="why-river-tech.html" class="active">', '<a href="why-river-tech.html">')

    js = JS % {"slots": json.dumps(js_slots, ensure_ascii=False),
               "names": json.dumps(names, ensure_ascii=False)}
    tail = tail.replace("</body>", js + "</body>")

    with io.open(OUT, "w", encoding="utf-8") as fh:
        fh.write(head + body + tail)

    print("Wrote %s" % OUT)
    print("  %d people, %d with a scheduled week, %d portraits, %d timed slots for the live line"
          % (len([p for p in people if not p.get("hidden")]),
             len([p for p in people if weeks.get(p["initials"]) and not p.get("hidden")]),
             len([p for p in people if p.get("photo") and not p.get("hidden")]), len(js_slots)))
    missing = [p["name"] for p in people if not p.get("photo") and not p.get("hidden")]
    print("  portraits still needed (%d): %s" % (len(missing), ", ".join(missing)))


if __name__ == "__main__":
    build()
