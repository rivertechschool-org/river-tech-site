import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const file = pathToFileURL(resolve(process.cwd(), 'spanish-tracker.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type()==='error' && !m.text().includes('ERR_TUNNEL')) errors.push('console: '+m.text()); });

// Fake Supabase client, installed before the page's own scripts run.
await page.addInitScript(() => {
  window.__db = {sessions:[], items:[], scores:[], forms:[]};
  const ok = (data) => Promise.resolve({data, error:null});
  function builder(table){
    const b = {
      _rows: null,
      select(){ return b; }, eq(){ return b; }, in(){ return b; },
      order(){ return b; }, limit(){ return b; },
      single(){ return ok(b._single); },
      insert(rows){
        const arr = Array.isArray(rows) ? rows : [rows];
        if (table === 'spanish_test_sessions'){
          const row = Object.assign({id:'11111111-2222-3333-4444-555555555555', taken_on:'2026-09-04'}, arr[0]);
          window.__db.sessions.push(row); b._single = row;
        }
        if (table === 'spanish_test_items') window.__db.items.push(...arr);
        if (table === 'spanish_scores')     window.__db.scores.push(...arr);
        const p = ok(arr); p.select = () => b; return p;
      },
      upsert(row){ window.__db.forms.push(row); return ok([row]); },
      then(res, rej){
        let data = [];
        if (table === 'spanish_forms') data = window.__db.forms.map(f => ({form_id:f.form_id, times_used:f.times_used, first_used_on:f.first_used_on})).filter(f => true);
        if (table === 'spanish_test_sessions') data = window.__db.sessions;
        if (table === 'spanish_scores') data = window.__db.scores;
        return Promise.resolve({data, error:null}).then(res, rej);
      }
    };
    return b;
  }
  window.supabase = { createClient: () => ({
    from: (t) => builder(t),
    auth: {
      getSession: () => ok({session:{user:{id:'u'}}}),
      signInWithPassword: () => ok({session:{}}),
      signOut: () => ok(null)
    }
  })};
  window.ST_CONFIG_FORCE = true;
});
await page.goto(file);
// supply a config so boot() builds the client
await page.evaluate(() => { localStorage.setItem('spanish_tracker_config', JSON.stringify({url:'https://x.supabase.co', key:'sb_publishable_test'})); });
await page.reload();
await page.waitForTimeout(600);

const homeVisible = await page.isVisible('#view-home');
await page.click('#btn-start');
await page.waitForTimeout(400);
const ctestVisible = await page.isVisible('#view-ctest');
const inputCount = await page.locator('#ctest-body input').count();

// answer the C-test: fill every gap correctly except the last five
const filled = await page.evaluate(() => {
  const ins = ctestInputs();
  ins.forEach((inp, n) => {
    const test = sitting.ctests[Number(inp.dataset.test)];
    const part = test.parts.find(p => p.gap && p.index === Number(inp.dataset.gap));
    inp.value = (n < ins.length - 5) ? part.missing : '';
  });
  return ins.length;
});
page.on('dialog', d => d.accept());
await page.click('#btn-ctest-done');
await page.waitForTimeout(300);
const vocabVisible = await page.isVisible('#view-vocab');

// answer the vocabulary run with the keyboard: yes to real words and to two fakes
let fakeYes = 0;
for (let i = 0; i < 80; i++){
  const isReal = await page.evaluate(() => sitting.vocab.items[sitting.vocab.pos].real);
  let say = isReal;
  if (!isReal && fakeYes < 2){ say = true; fakeYes++; }
  await page.keyboard.press(say ? 'y' : 'n');
}
await page.waitForTimeout(600);
const resultsVisible = await page.isVisible('#view-results');
const summary = await page.evaluate(() => ({
  msg: document.getElementById('results-msg').innerText.trim(),
  body: document.getElementById('results-body').innerText.trim().split('\n').slice(0,14),
  db: {
    sessions: window.__db.sessions.length,
    items: window.__db.items.length,
    scores: window.__db.scores.map(s => s.metric + '=' + s.value),
    forms: window.__db.forms.map(f => f.form_id + '/' + f.item_type),
    sessionRow: window.__db.sessions[0],
    sampleItem: window.__db.items[0],
    vocabItem: window.__db.items.find(i => i.item_type.startsWith('vocab')),
    pending: localStorage.getItem('spanish_tracker_pending')
  }
}));
await page.click('#btn-review');
await page.waitForTimeout(200);
const reviewShown = await page.isVisible('#review-card');
const reviewHasAnswers = await page.locator('#review-body .answer').count();
await page.click('#btn-home');
await page.waitForTimeout(400);
const historyText = await page.evaluate(() => document.getElementById('history').innerText.trim().split('\n').slice(0,3));
const beatText = await page.evaluate(() => document.getElementById('beat').innerText.trim());

console.log(JSON.stringify({homeVisible, ctestVisible, inputCount, filled, vocabVisible, resultsVisible, summary, reviewShown, reviewHasAnswers, historyText, beatText}, null, 1));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
