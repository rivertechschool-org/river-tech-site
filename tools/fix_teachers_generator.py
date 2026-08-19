#!/usr/bin/env python3
"""
Bring tools/build_teachers.py and assets/data/teachers.json back level with the
live pages/teachers.html.

Why this is needed: teachers.html was edited by hand after it was last
generated. It gained the 2026-27 team photograph, the 2026-27 portraits, five
approved biographies and a script that lifts each biography onto its teacher
card. The generator knew none of that, so simply re-running it -- which is how
a schedule change reaches the page -- would have silently deleted all of it.

This script teaches the generator those four things and fills the portrait and
biography fields in the data file, so that regenerating reproduces the live page
exactly, apart from whatever genuinely changed in the schedule.

Usage:  python3 fix_teachers_generator.py <repo_root> <live_teachers.html>
"""
import sys, os, io, re, json
from collections import OrderedDict

TEAM_PHOTO_CSS = (
    ".tp-team-photo{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;"
    "border-radius:12px;margin:24px 0 34px;box-shadow:0 2px 10px rgba(39,36,67,.12)}"
)

TEAM_PHOTO_IMG = (
    '<img class="tp-team-photo" src="../assets/images/teachers/2026-27/group-normal.jpg" '
    'alt="River Tech School teaching team for the 2026–27 school year">'
)

BIO_SCRIPT = """
  /* Approved biographies belong on the visible teacher cards. */
  %(who)s.forEach(function(who){
    var bio = document.querySelector("#tpw-" + who + " .tp-bio");
    var summary = document.querySelector('.tp-face[data-who="' + who + '"] .tp-line');
    if(!bio || !summary) return;
    summary.innerHTML = bio.innerHTML;
    bio.remove();
  });
"""


def read(p):
    return io.open(p, encoding="utf-8").read()


def write(p, s):
    io.open(p, "w", encoding="utf-8").write(s)


def harvest(live):
    """Pull the portraits and biographies out of the hand-edited page."""
    s = read(live)
    bios = {}
    for m in re.finditer(r'id="tpw-([A-Z]{2})"(?: hidden)?>\s*<p class="tp-bio">(.*?)</p>',
                         s, re.S):
        bios[m.group(1)] = re.sub(r"\s+", " ", m.group(2)).strip()
    photos = {}
    for m in re.finditer(
            r'<img src="\.\./assets/images/teachers/([^"]+)" alt="([^"]+)" loading="lazy">', s):
        photos[m.group(2)] = m.group(1)
    return bios, photos


def patch_data(root, bios, photos):
    p = os.path.join(root, "assets", "data", "teachers.json")
    data = json.load(io.open(p, encoding="utf-8"), object_pairs_hook=OrderedDict)
    changed = []
    for person in data["people"]:
        want = photos.get(person["name"])
        if want and person.get("photo") != want:
            changed.append("%s photo %s -> %s" % (person["name"], person.get("photo"), want))
            person["photo"] = want
        bio = bios.get(person["initials"])
        if bio and not person.get("bio"):
            changed.append("%s biography restored (%d characters)" % (person["name"], len(bio)))
            person["bio"] = bio
    write(p, json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    for c in changed:
        print("  data:", c)
    return data


def patch_generator(root, data):
    p = os.path.join(root, "tools", "build_teachers.py")
    s = read(p)

    # 1. the team photograph, styled and placed
    anchor = (".tp-answer{font-family:var(--font-body);font-style:italic;color:#55516d;"
              "min-height:1.6em;margin:6px 0 22px}")
    if TEAM_PHOTO_CSS not in s:
        assert anchor in s, "CSS anchor not found"
        s = s.replace(anchor, anchor + "\n" + TEAM_PHOTO_CSS, 1)
        print("  generator: team photograph styling added")

    anchor = ('    <p style="font-style: italic; text-align: center; margin-top: 30px;">'
              "Small classes exist so that every teacher knows every child by name.</p>")
    if "tp-team-photo" not in s.split("</style>")[1]:
        assert anchor in s, "body anchor not found"
        s = s.replace(anchor, anchor + "\n\n    " + TEAM_PHOTO_IMG, 1)
        print("  generator: team photograph placed on the page")

    # 2. the heading wording the page actually carries
    s = s.replace(
        '    <h2 class="tp-h2">Every teacher&rsquo;s week</h2>\n'
        '    <p class="tp-sub">Choose a name to see that teacher&rsquo;s whole week '
        "&mdash; when they teach, which class, and which room.</p>",
        '    <h2 class="tp-h2">About our teachers &amp; their week</h2>\n'
        '    <p class="tp-sub">Choose a name to read their biography and see their whole week '
        "&mdash; when they teach, which class, and which room.</p>", 1)

    # 3. the biography, emitted into the teacher's own panel
    old = ("            '<div class=\"tpw-panel\" id=\"tpw-%s\"%s><div class=\"schedule-table-wrap\">'")
    new = ("            '<div class=\"tpw-panel\" id=\"tpw-%s\"%s>%s<div class=\"schedule-table-wrap\">'")
    if old in s:
        s = s.replace(old, new, 1)
        s = s.replace(
            '            % (ini, "" if first else " hidden", "".join(rows), '
            'p["name"].split()[0], schedule["as_of"]))',
            '            % (ini, "" if first else " hidden",\n'
            '               (\'<p class="tp-bio">%s</p>\' % p["bio"]) if p.get("bio") else "",\n'
            '               "".join(rows), p["name"].split()[0], schedule["as_of"]))', 1)
        print("  generator: biographies emitted into each teacher panel")

    # 4. the script that lifts each biography onto its card
    if "Approved biographies" not in s:
        who = json.dumps([p["initials"] for p in data["people"] if p.get("bio")])
        anchor = ('  document.querySelectorAll(".tp-face").forEach(function(btn){\n'
                  '    btn.addEventListener("click", function(){ showWeek(btn.dataset.who, true); });\n'
                  "  });\n")
        assert anchor in s, "script anchor not found"
        s = s.replace(anchor, anchor + (BIO_SCRIPT % {"who": who}), 1)
        print("  generator: biography-to-card script restored for %s" % who)

    write(p, s)


def main():
    root, live = sys.argv[1], sys.argv[2]
    bios, photos = harvest(live)
    print("  harvested %d biographies and %d portraits from the live page"
          % (len(bios), len(photos)))
    data = patch_data(root, bios, photos)
    patch_generator(root, data)


if __name__ == "__main__":
    main()
