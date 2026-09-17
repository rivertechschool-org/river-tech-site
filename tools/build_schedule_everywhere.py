#!/usr/bin/env python3
"""Rebuild every current schedule from assets/data/schedule-q1-2026-27.json.

Run with --check to detect drift without changing files. Includes class tabs,
master grids, teacher weeks, À La Carte day views, and legacy public copies.
"""
import copy
import json
from pathlib import Path
import re
import subprocess
import sys

from build_schedule import render_panel, PANEL_RE, panel_body
from build_all_panel import collect, render, PANEL_ORDER

SOURCE = 'assets/data/schedule-q1-2026-27.json'
LEGACY_SOURCE = 'assets/data/schedule-q1-2026-27 2.json'
DAY_PAGES = {'a-la-carte.html': None, 'monday-performing-arts.html': 'Monday',
             'tuesday-science.html': 'Tuesday', 'thursday-life-skills.html': 'Thursday',
             'friday-technology.html': 'Friday'}
CLASS_PAGES = {'calendar.html', 'school-start-hub.html', 'elementary-school.html',
               'middle-school.html', 'high-school.html'}
BLOCK = re.compile(r'<!-- current-homeschool-schedule:start -->.*?<!-- current-homeschool-schedule:end -->', re.S)
OLD_IMAGE = re.compile(r'<img\b[^>]*src="\.\./assets/images/(?:alacarte-schedule-2026-27\.png|wix/Alacarte_Schedule_2026-27_\d\.jpg)"[^>]*>')
KEYS = re.compile(r'<div class="(?:schedule-legend|schedule-key)[^"]*">.*?</div>', re.S)


def day_panel(home, day):
    """Select a column, retaining rowspan/colspan semantics (Monday rehearsals)."""
    panel = copy.deepcopy(home)
    if day is None:
        return panel
    wanted = ['Monday', 'Tuesday', 'Thursday', 'Friday'].index(day)
    pending = {}
    rows = []
    for row in panel['rows']:
        time = row['cells'][0]
        picked, column = [], 0
        for c in row['cells'][1:]:
            while pending.get(column, 0):
                column += 1
            width = c['colspan']
            if column <= wanted < column + width:
                selected = copy.deepcopy(c)
                selected['colspan'] = 1
                picked.append(selected)
            if c['rowspan'] > 1:
                for j in range(column, column + width):
                    pending[j] = c['rowspan']
            column += width
        row['cells'] = [time] + picked
        if picked:
            if day == 'Monday' and picked[0].get('class') == 'prod':
                picked[0]['rowspan'] = 1
                time_line = next(l for l in picked[0]['lines'] if re.fullmatch(r'[\d:;&a-z–-]+', l['text']))
                time['lines'] = [dict(time_line, role=None)]
            rows.append(row)
        pending = {k: v - 1 for k, v in pending.items() if v > 1}
    panel['rows'] = rows
    return panel


def homeschool_block(data, day):
    panel = day_panel(next(p for p in data['panels'] if p['id'] == 'home'), day)
    table = render_panel(panel).replace('class="schedule-panel" id="panel-home"', 'class="current-day-table"')
    if day:
        table = table.replace('<table class="schedule-table">', '<table class="schedule-table" style="min-width:0">')
    label = (day + ' Schedule') if day else 'À La Carte Schedule'
    used_keys = []
    for kind, content in zip(['teachers', 'rooms'], data['legend']):
        entries = re.findall(r'<span><b>(.*?)</b> (.*?)</span>', content)
        entries = [(code, name) for code, name in entries if code in table]
        used_keys.append('<div class="schedule-legend schedule-key schedule-key--%s">%s</div>' %
                         (kind, ''.join('<span><b>%s</b> %s</span>' % e for e in entries)))
    key = ''.join(used_keys)
    return ('<!-- current-homeschool-schedule:start -->\n'
            '<section class="current-homeschool-schedule" aria-label="%s" style="text-align:left">'
            '<p class="schedule-date">%s</p>'
            '<p>UH: older homeschool group. YH: younger homeschool group.</p>%s%s'
            '<p><a href="calendar.html">View the whole-school schedule</a></p></section>\n'
            '<!-- current-homeschool-schedule:end -->') % (label, data['header'], table, key)


def rebuild_page(page, data, master):
    def replace_panel(m):
        pid, body = m.groups()
        match = next((p for p in data['panels'] if p['id'] == pid), None)
        generated = master if pid == 'all' else render_panel(match) if match else None
        if generated is None:
            return m.group()
        # PANEL_RE ends at the next panel and includes surrounding page content.
        old_body = panel_body(body)
        end = body.find(old_body) + len(old_body)
        closing = re.match(r'\s*</div>', body[end:])
        if not closing:
            raise ValueError('Unclosed schedule panel ' + pid)
        return generated + body[end + closing.end():]
    page = PANEL_RE.sub(replace_panel, page)
    page = re.sub(r'(<p class="schedule-date">).*?(</p>)',
                  lambda m: m[1] + data['header'] + m[2], page, flags=re.S)
    classes = ['schedule-legend schedule-key schedule-key--teachers',
               'schedule-legend schedule-key schedule-key--rooms', 'schedule-key schedule-key--levels']
    matches = list(KEYS.finditer(page))
    if matches:
        keys = '\n'.join('<div class="%s">%s</div>' % (css, content) for css, content in zip(classes, data['legend']))
        page = page[:matches[0].start()] + keys + page[matches[-1].end():]
    return page


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
    check = '--check' in sys.argv
    data = json.loads((root / SOURCE).read_text())
    panels = {p['id']: p for p in data['panels']}
    master = render(*collect([panels[p] for p in PANEL_ORDER]), data)
    expected = {}
    for path in sorted((root / 'pages').glob('*.html')):
        old = path.read_text()
        if path.name in CLASS_PAGES and 'id="panel-elem"' not in old:
            raise ValueError('Missing class schedule on ' + str(path))
        if 'id="panel-elem"' in old:
            expected[path] = rebuild_page(old, data, master)
        elif path.name in DAY_PAGES:
            block = homeschool_block(data, DAY_PAGES[path.name])
            new, count = BLOCK.subn(lambda m: block, old)
            if not count:
                new, count = OLD_IMAGE.subn(lambda m: block, old)
            if count != 1:
                raise ValueError('Expected one schedule on ' + str(path))
            expected[path] = new
    expected[root / LEGACY_SOURCE] = (root / SOURCE).read_text()
    failures = []
    for path, new in expected.items():
        if path.read_text() != new:
            if check:
                failures.append(str(path.relative_to(root)))
            else:
                path.write_text(new)
        print(('Checked ' if check else 'Rebuilt ') + str(path.relative_to(root)))
    args = [sys.executable, 'tools/build_teachers.py', '.'] + (['--check'] if check else [])
    subprocess.run(args, cwd=root, check=True)
    if failures:
        raise SystemExit('Schedule drift: ' + ', '.join(failures))
    print('Every schedule agrees with the source.' if check else 'All schedules rebuilt.')


if __name__ == '__main__':
    main()
