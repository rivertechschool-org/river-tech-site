#!/usr/bin/env python3
"""
One command that puts the schedule everywhere it belongs, and shouts if any
page has drifted.

The schedule lives in exactly one place:

    assets/data/schedule-q1-2026-27.json

Change it there, run this, and every page that shows a schedule is rebuilt from
it. Nothing else needs remembering, and no page can quietly fall a version
behind, because the last step re-reads every page and compares it back against
the source.

    python3 tools/build_schedule_everywhere.py .          rebuild everything
    python3 tools/build_schedule_everywhere.py . --check   check only, change nothing

The --check form is the useful one: it exits non-zero and names the page if
anything anywhere disagrees with the source file.
"""
import sys, os, io, re, subprocess

PAGES = [
    "pages/calendar.html",
    "pages/school-start-hub.html",
    "pages/elementary-school.html",
    "pages/middle-school.html",
    "pages/high-school.html",
]

PANEL_ALL = re.compile(
    r'<div class="schedule-panel" id="panel-all">.*?(?=<div class="schedule-panel" id="panel-elem">)',
    re.S)


def run(root, *args):
    return subprocess.run([sys.executable] + list(args), cwd=root,
                          capture_output=True, text=True)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    check_only = "--check" in sys.argv
    schedule = os.path.join("assets", "data", "schedule-q1-2026-27.json")
    failures = []

    if not check_only:
        # 1. the five level panels, straight from the source
        r = run(root, "tools/build_schedule.py", "apply", schedule, *PAGES)
        print(r.stdout.strip() or r.stderr.strip())

        # 2. the All Classes master view, derived from those five
        panel_path = os.path.join(root, "tools", "_panel-all.html")
        r = run(root, "tools/build_all_panel.py", schedule, "tools/_panel-all.html")
        print("  " + r.stdout.strip())
        panel = io.open(panel_path, encoding="utf-8").read()
        os.remove(panel_path)
        for page in PAGES:
            p = os.path.join(root, page)
            s = io.open(p, encoding="utf-8").read()
            if not PANEL_ALL.search(s):
                print("  %s has no All Classes panel - skipped" % page)
                continue
            new = PANEL_ALL.sub(lambda m: panel, s, count=1)
            if new != s:
                io.open(p, "w", encoding="utf-8").write(new)
                print("  %s - All Classes view rebuilt" % page)

        # 3. every teacher's week
        r = run(root, "tools/build_teachers.py", ".")
        print("  " + (r.stdout.strip().splitlines() or ["teachers page failed"])[0])

    # 4. the guard: read every page back and compare it against the source.
    #    Two comparisons, because the five level panels and the derived All
    #    Classes panel can drift independently of each other.
    panel_path = os.path.join(root, "tools", "_panel-check.html")
    run(root, "tools/build_all_panel.py", schedule, "tools/_panel-check.html")
    expected = io.open(panel_path, encoding="utf-8").read()
    os.remove(panel_path)

    print("\nChecking every page against the source file:")
    for page in PAGES:
        r = run(root, "tools/build_schedule.py", "verify", page, schedule)
        ok = "ALL PANELS ROUND-TRIP EXACTLY" in r.stdout
        note = "" if ok else " (a level tab disagrees)"

        s = io.open(os.path.join(root, page), encoding="utf-8").read()
        m = PANEL_ALL.search(s)
        if m and m.group(0) != expected:
            ok = False
            note = " (the All Classes view disagrees)"

        print("  %-34s %s%s" % (page, "matches the source" if ok else "DOES NOT MATCH", note))
        if not ok:
            failures.append(page)
            if "ALL PANELS ROUND-TRIP EXACTLY" not in r.stdout:
                print(r.stdout)

    if failures:
        print("\n%d page(s) disagree with the source file. Run this without "
              "--check to rebuild them." % len(failures))
        sys.exit(1)
    print("\nEvery page agrees with the source file.")


if __name__ == "__main__":
    main()
