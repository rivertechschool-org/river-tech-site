#!/usr/bin/env node
/*
 * build_lunch_pdf.js — render pages/lunch-rotations.html to the one-page PDF
 * that the page's download button hands out.
 *
 *   node tools/build_lunch_pdf.js [path/to/chrome]
 *
 * The sheet is the page's own @media print block, nothing else: whatever the
 * browser shows under File > Print is what lands in assets/docs/. Run this
 * after ANY edit to the rotation tables or the print styles, or the download
 * button will keep handing out the old schedule.
 *
 * It drives a headless Chrome or Chromium over the DevTools protocol using
 * nothing but Node's built-in WebSocket, so there is nothing to npm install.
 * Point it at a browser with the argument, the CHROME env var, or let it try
 * the usual locations.
 *
 * It fails if the result is not exactly one page.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'pages', 'lunch-rotations.html');
const OUT = path.join(ROOT, 'assets', 'docs', 'river-tech-lunch-rotations.pdf');

const CANDIDATES = [
  process.argv[2],
  process.env.CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chrome = CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!chrome) {
  console.error('No Chrome or Chromium found. Pass the path:\n  node tools/build_lunch_pdf.js /path/to/chrome');
  process.exit(1);
}

const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lunchpdf-'));
const proc = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not listening yet */ }
    await sleep(250);
  }
  throw new Error('Chrome never opened its debugging port');
}

(async () => {
  const ws = new WebSocket(await targetWs());
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });

  let id = 0;
  const pending = new Map();
  const events = new Map();
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, no } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? no(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method && events.has(msg.method)) {
      events.get(msg.method)();
      events.delete(msg.method);
    }
  };
  const send = (method, params) => new Promise((ok, no) => {
    const n = ++id;
    pending.set(n, { ok, no });
    ws.send(JSON.stringify({ id: n, method, params: params || {} }));
  });
  const once = method => new Promise(ok => events.set(method, ok));

  await send('Page.enable');
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: 'file://' + PAGE });
  await loaded;
  await sleep(400); // let webfonts settle before measuring the sheet

  const { data } = await send('Page.printToPDF', {
    printBackground: true,      // the colour coding is the point of the sheet
    preferCSSPageSize: true,    // @page in the print block owns size and margins
    displayHeaderFooter: false, // no browser date stamp or URL across the top
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const pdf = Buffer.from(data, 'base64');
  fs.writeFileSync(OUT, pdf);

  ws.close();
  proc.kill();
  fs.rmSync(profile, { recursive: true, force: true });

  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`${path.relative(ROOT, OUT)} — ${pages} page(s), ${(pdf.length / 1024).toFixed(0)} KB`);
  if (pages !== 1) {
    console.error('EXPECTED ONE PAGE. Tighten the @media print block in pages/lunch-rotations.html.');
    process.exit(1);
  }
})().catch(err => { console.error(err); proc.kill(); process.exit(1); });
