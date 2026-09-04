import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = pathToFileURL(resolve(process.cwd(), 'spanish-tracker.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(file);
await page.waitForTimeout(1200);

const out = await page.evaluate(() => {
  const r = {};
  // 1. C-test shape
  const t = makeCTest(PASSAGES[0]);
  r.gaps = t.gaps;
  const g = t.parts.filter(p => p.gap);
  r.damageOk = g.every(p => p.stub + p.missing === p.t && p.stub.length === Math.ceil(p.t.length/2));
  r.firstSentenceIntact = t.parts.findIndex(p => p.gap) > t.parts.findIndex(p => !p.gap && p.t.includes('.'));
  r.sampleGaps = g.slice(0,4).map(p => p.t + ' -> ' + p.stub + '_'.repeat(p.missing.length));
  r.allPassagesGaps = PASSAGES.map(p => makeCTest(p).gaps);
  // 2. vocab form shape
  const v = makeVocabForm();
  r.vocabTotal = v.items.length;
  r.vocabReal = v.items.filter(i => i.real).length;
  r.vocabPseudo = v.items.filter(i => !i.real).length;
  r.perBandCounts = [1,2,3,4,5,6].map(b => v.items.filter(i => i.band === b).length);
  r.dupes = v.items.length - new Set(v.items.map(i => i.word)).size;
  // 3. scoring: perfect learner
  v.items.forEach(i => i.said_yes = i.real);
  const perfect = scoreVocab(v);
  r.perfect = {corrected: perfect.corrected, size: Math.round(perfect.size), alarms: perfect.alarms};
  // 4. scoring: yes to everything
  const v2 = makeVocabForm(); v2.items.forEach(i => i.said_yes = true);
  const yesman = scoreVocab(v2);
  r.yesman = {corrected: yesman.corrected, size: Math.round(yesman.size), hits: yesman.hits};
  // 5. partial: knows bands 1-3 only, 10% false alarms
  const v3 = makeVocabForm();
  let fa = 0;
  v3.items.forEach(i => { i.said_yes = i.real ? i.band <= 3 : (fa++ < 2); });
  const mid = scoreVocab(v3);
  r.mid = {corrected: Math.round(mid.corrected*1000)/1000, size: Math.round(mid.size), alarms: mid.alarms};
  r.itemRows = mid.rows.length;
  r.pseudoWordsAreUnique = new Set(PSEUDO).size === PSEUDO.length;
  r.realWordsUnique = [1,2,3,4,5,6].every(b => new Set(WORDS[b]).size === WORDS[b].length);
  const all = [].concat(...[1,2,3,4,5,6].map(b => WORDS[b]));
  r.noWordInTwoBands = new Set(all).size === all.length;
  r.noOverlapRealPseudo = all.filter(w => PSEUDO.includes(w)).length === 0;
  return r;
});
console.log(JSON.stringify(out, null, 1));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
