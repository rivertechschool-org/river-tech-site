#!/usr/bin/env python3
"""Add a Teachers link under 'Why River Tech?' in every nav on the site.

Only inserts a link. Does not touch the nav's structure, classes, fade timing or
JavaScript — see AGENT-NOTES.md section 1 and 2.

Usage: python3 tools/add_teachers_nav.py <repo_root>
"""
import sys, os, io, re, glob

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
PATTERN = re.compile(r'([ \t]*)<a href="((?:pages/)?)our-culture\.html">Our Culture</a>')

files = sorted(glob.glob(os.path.join(ROOT, "*.html")) + glob.glob(os.path.join(ROOT, "pages", "*.html")))
touched = added = 0

for path in files:
    with io.open(path, encoding="utf-8") as fh:
        text = fh.read()
    if "our-culture.html\">Our Culture</a>" not in text:
        continue
    if re.search(r'<a href="(?:pages/)?teachers\.html">Teachers</a>', text):
        continue

    def ins(m):
        indent, prefix = m.group(1), m.group(2)
        return '%s<a href="%steachers.html">Teachers</a>\n%s' % (indent, prefix, m.group(0))

    new, n = PATTERN.subn(ins, text)
    if n:
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.write(new)
        touched += 1
        added += n

print("Added the Teachers link %d times across %d files." % (added, touched))
