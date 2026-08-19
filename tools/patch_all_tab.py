#!/usr/bin/env python3
"""
Add the "All Classes" master tab to every page that carries the schedule tab
block. Idempotent: running it twice changes nothing the second time.

Usage:  python3 patch_all_tab.py <repo_root> <all-panel.html>
"""
import sys, os, re

TAB_BTN = ('<button class="schedule-tab active" data-tab="all">All Classes'
           '<br><small>whole school</small></button>')

CSS = """
#panel-all .schedule-table{min-width:1000px;font-size:11.5px;line-height:1.4}
#panel-all .schedule-table td{padding:6px 5px;vertical-align:top}
#panel-all .schedule-table td:not(.time-cell){font-weight:600}
#panel-all .schedule-table .time-cell{white-space:nowrap;font-size:12px}
#panel-all .schedule-table td.prod{font-size:11px}
"""

PAGES = ["pages/calendar.html", "pages/school-start-hub.html"]


def patch(path, panel_html):
    s = open(path, encoding="utf-8").read()
    if 'data-tab="all"' in s:
        print("  already patched:", path)
        return False
    orig = s

    # 1. The new tab goes first, and the old first tab loses "active".
    s = s.replace('<div class="schedule-tabs"><button class="schedule-tab active" '
                  'data-tab="elem">',
                  '<div class="schedule-tabs">' + TAB_BTN +
                  '<button class="schedule-tab" data-tab="elem">', 1)

    # 2. The new panel goes immediately before the Elementary panel.
    s = s.replace('<div class="schedule-panel" id="panel-elem">',
                  panel_html + '<div class="schedule-panel" id="panel-elem">', 1)

    # 3. Open on the master view.
    s = s.replace('data-default-tab="elem"', 'data-default-tab="all"')

    # 4. Styling for the wider master table.
    s = s.replace('.schedule-tabs-container .schedule-table td:not(.time-cell)'
                  '{font-weight:600}',
                  '.schedule-tabs-container .schedule-table td:not(.time-cell)'
                  '{font-weight:600}' + CSS, 1)

    # 5. The sentence above the tabs no longer describes what the page does.
    s = s.replace('Select your grade level below to see only the classes '
                  'relevant to your student.',
                  'The master view shows every class at every level side by '
                  'side; the tabs below narrow it to one level at a time.')

    if s == orig:
        print("  NOTHING MATCHED:", path)
        return False
    open(path, "w", encoding="utf-8").write(s)
    print("  patched:", path)
    return True


def main():
    root, panel = sys.argv[1], sys.argv[2]
    panel_html = open(panel, encoding="utf-8").read()
    for p in PAGES:
        full = os.path.join(root, p)
        if os.path.exists(full):
            patch(full, panel_html)
        else:
            print("  missing:", full)


if __name__ == "__main__":
    main()
