"""Regression checks for schedule column alignment and derived teacher/day views."""
import copy
import json
from pathlib import Path
import unittest

from build_schedule_everywhere import day_panel, homeschool_block, rebuild_page
from build_all_panel import collect, render, PANEL_ORDER
from build_teachers import build_slots, per_teacher

ROOT = Path(__file__).resolve().parents[1]

class ScheduleViews(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((ROOT / 'assets/data/schedule-q1-2026-27.json').read_text())
        cls.people = json.loads((ROOT / 'assets/data/teachers.json').read_text())
        cls.panels = {p['id']: p for p in cls.source['panels']}
        cls.slots = build_slots(cls.source, cls.people['grades'])

    def test_each_row_fills_exactly_its_weekdays(self):
        for panel in self.source['panels']:
            width = len(panel['rows'][0]['cells']) - 1
            pending = {}
            for row in panel['rows']:
                filled = {col for col, left in pending.items() if left}
                col = 0
                for c in row['cells'][1:]:
                    while col in filled:
                        col += 1
                    for target in range(col, col + c['colspan']):
                        self.assertNotIn(target, filled)
                        filled.add(target)
                        pending[target] = c['rowspan']
                    col += c['colspan']
                self.assertEqual(filled, set(range(width)), panel['id'])
                pending = {c: n - 1 for c, n in pending.items() if n > 1}

    def test_day_extraction_handles_monday_rowspans(self):
        home = self.panels['home']
        original = copy.deepcopy(home)
        monday = day_panel(home, 'Monday')
        self.assertEqual(home, original, 'Day extraction must not mutate the source')
        self.assertEqual(len(monday['rows']), 5)  # heading, AM, lunch, PM, clean up
        self.assertTrue(all(len(r['cells']) == 2 for r in monday['rows']))
        self.assertEqual(monday['rows'][1]['cells'][0]['lines'][0]['text'], '10:25&ndash;12:00')
        self.assertEqual(monday['rows'][3]['cells'][0]['lines'][0]['text'], '12:45&ndash;2:20')
        for day in ['Tuesday', 'Thursday', 'Friday']:
            extracted = day_panel(home, day)
            self.assertEqual(len(extracted['rows']), 7)
            self.assertTrue(all(len(r['cells']) == 2 for r in extracted['rows']))

    def test_pivot_uses_explicit_rehearsal_and_activity_times(self):
        rehearsals = [s for s in self.slots if s['day'] == 'Monday' and s['room'] == '🎤']
        self.assertEqual({tuple(s['span']) for s in rehearsals}, {(625, 720), (765, 860)})
        activities = [s for s in self.slots if s['group'].endswith('non-performers') and s['span'][0] >= 780]
        self.assertEqual(len(activities), 5, 'Activities repeated on tabs must pivot only once')
        self.assertEqual({tuple(s['span']) for s in activities}, {(780, 825), (825, 860)})
        self.assertTrue(all(not s['grades'] for s in activities), 'The PDF does not define ages for younger/older')

    def test_new_teacher_and_split_wednesday_survive_pivot(self):
        weeks = per_teacher(self.slots, self.people['people'])
        self.assertEqual([(s['day'],s['span'],s['room']) for s in weeks['RY']],
                         [('Tuesday',(780,820),'💃'),('Tuesday',(820,860),'💃')])
        morning = [s for s in weeks['CH'] if s['day']=='Wednesday' and s['span'][0]<625]
        self.assertEqual([(s['what'],s['grades'],s['room']) for s in morning],
                         [('Math',['y-elem'],'💡'),('English',['y-elem'],'💡')])
        # The Today view attributes every line to its panel. Foreign-coloured
        # copied lines must not make high-school/elementary lessons appear as MS.
        for row in self.panels['ms']['rows'][2:4]:
            for cell in row['cells'][1:]:
                self.assertTrue(all(l['color'] in (None, '#7D3C98') for l in cell['lines']))

    def test_page_rebuild_preserves_surrounding_content(self):
        source = (ROOT / 'pages/calendar.html').read_text()
        master = render(*collect([self.panels[p] for p in PANEL_ORDER]), self.source)
        rebuilt = rebuild_page(source, self.source, master)
        self.assertEqual(rebuilt, source)
        self.assertEqual(rebuild_page('before'+source+'after', self.source, master), 'before'+source+'after')
        self.assertIn('Coding [YH] (LU &amp; EM)', homeschool_block(self.source, 'Friday'))
        self.assertNotIn('Critical Thinking', homeschool_block(self.source, 'Friday'))

if __name__ == '__main__':
    unittest.main()
