#!/usr/bin/env python3
"""
Put the current schedule on the three grade pages.

pages/elementary-school.html, middle-school.html and high-school.html each carry
a schedule block dated "Updated April 13, 2026" from a previous school year. It
uses a retired set of tabs and names a teacher who has left. All three pages are
linked from School Resources, so a family can land on a schedule that has been
wrong for a year.

This lifts the current block out of pages/calendar.html -- the same one source
file every other schedule view is built from -- and drops it into all three,
each opening on the tab that page is about.

Usage:  python3 refresh_grade_pages.py <repo_root>
"""
import sys, os, io

SOURCE = "pages/calendar.html"
CSS_START = '<style>\n.schedule-tabs-container .schedule-table td:not(.time-cell){font-weight:600}'
SCRIPT = "\n<script>\ndocument.addEventListener('DOMContentLoaded', function() {"
CONTAINER = '<div class="schedule-tabs-container" data-default-tab="'

# page -> the tab it should open on, in the current five-level taxonomy
TARGETS = {
    "pages/elementary-school.html": "elem",
    "pages/middle-school.html": "ms",
    "pages/high-school.html": "hs",
}


def cut(text, start, end, what):
    i = text.find(start)
    j = text.find(end, i)
    if i < 0 or j < 0:
        raise SystemExit("could not find %s" % what)
    return i, j


def main():
    root = sys.argv[1]
    src = io.open(os.path.join(root, SOURCE), encoding="utf-8").read()
    i, j = cut(src, CSS_START, SCRIPT, "the schedule block in calendar.html")
    block = src[i:j]
    print("  lifted %d characters of schedule from %s" % (len(block), SOURCE))

    for page, tab in TARGETS.items():
        path = os.path.join(root, page)
        s = io.open(path, encoding="utf-8").read()
        if 'data-tab="all"' in s and "Aug 19, 2026" in s:
            print("  %s already current" % page)
            continue
        i, j = cut(s, CONTAINER, SCRIPT, "the old schedule block in %s" % page)
        fresh = block.replace('data-default-tab="all"', 'data-default-tab="%s"' % tab)
        # the old block on these pages is not preceded by its own <style>, so the
        # replacement carries calendar's styling with it
        io.open(path, "w", encoding="utf-8").write(s[:i] + fresh + s[j:])
        print("  %s rewritten, opens on the %s tab" % (page, tab))


if __name__ == "__main__":
    main()
