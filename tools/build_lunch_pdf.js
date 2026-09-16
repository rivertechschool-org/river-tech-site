#!/usr/bin/env node
/*
 * build_lunch_pdf.js — render pages/lunch-rotations.html to the one-page PDF
 * that the page's download button hands out.
 *
 *   node tools/build_lunch_pdf.js            rebuild only if the inputs changed
 *   node tools/build_lunch_pdf.js --check    say whether the PDF is stale, change nothing
 *   node tools/build_lunch_pdf.js --force    rebuild regardless
 *   node tools/build_lunch_pdf.js /path/to/chrome
 *
 * The sheet is the page's own @media print block, nothing else: whatever the
 * browser shows under File > Print is what lands in assets/docs/.
 *
 * You do not have to remember to run this. .github/workflows/lunch-rotation-pdf.yml
 * runs it on every push that touches an input, and commits the result. Running it
 * by hand just gets the new sheet into the same commit as the change.
 *
 * WHY THE STAMP FILE: the PDF is not byte-reproducible. Chrome stamps a fresh
 * document id into every render, so "rebuild and commit if the bytes differ"
 * would commit on every run and manufacture conflicts for anyone else working in
 * the repo. Two guards instead:
 *   1. A hash of the inputs lives next to the PDF. Matching hash, no rebuild.
 *   2. After a rebuild, the drawing operators of the old and new PDF are
 *      compared. Same picture, the existing file is kept.
 * So the file changes when the sheet actually looks different, and not otherwise.
 *
 * It drives a headless Chrome or Chromium over the DevTools protocol using
 * nothing but Node's built-in WebSocket, so there is nothing to npm install.
 *
 * Exit codes: 0 fine, 1 the sheet is no longer one page or the build failed,
 * 2 (--check only) the PDF is stale.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'pages', 'lunch-rotations.html');
const OUT = path.join(ROOT, 'assets', 'docs', 'river-tech-lunch-rotations.pdf');
const STAMP = OUT + '.inputs';

/* Everything the printed sheet is rendered from. The shared stylesheets are in
 * here on purpose: a change to style.css can move the print layout even though
 * nobody touched the rotation page. The script hashes itself too. */
const INPUTS = [
  'pages/lunch-rotations.html',
  'assets/css/base.css',
  'assets/css/style.css',
  'tools/build_lunch_pdf.js',
];

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const FORCE = args.includes('--force');
const rel = p => path.relative(ROOT, p);

function inputsHash() {
  const h = crypto.createHash('sha256');
  for (const f of INPUTS) {
    h.update(f);
    h.update(fs.readFileSync(path.join(ROOT, f)));
  }
  return h.digest('hex');
}

function stampBody(hash) {
  return `${hash}\n${INPUTS.join('\n')}\n`;
}

function currentStamp() {
  try {
    return fs.readFileSync(STAMP, 'utf8').split('\n')[0].trim();
  } catch {
    return null;
  }
}

/* A fingerprint of what the PDF DRAWS. The document id and the creation date
 * live outside the compressed streams, so two renders of an unchanged page
 * fingerprint the same even though the files differ byte for byte. */
function fingerprint(pdf) {
  const h = crypto.createHash('sha256');
  let found = 0;
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(pdf.toString('latin1'))) !== null) {
    const start = m.index + m[0].length;
    const end = pdf.indexOf('endstream', start, 'latin1');
    if (end < 0) continue;
    try {
      h.update(zlib.inflateSync(pdf.subarray(start, end)));
      found++;
    } catch { /* not a flate stream; the drawing operators are, so skip it */ }
  }
  return found ? h.digest('hex') : null;
}

function pageCount(pdf) {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
}

const wanted = inputsHash();
const fresh = currentStamp() === wanted && fs.existsSync(OUT);

if (CHECK) {
  console.log(fresh
    ? `${rel(OUT)} is current.`
    : `${rel(OUT)} is STALE: an input changed since it was built. Run: node tools/build_lunch_pdf.js`);
  process.exit(fresh ? 0 : 2);
}

if (fresh && !FORCE) {
  console.log(`${rel(OUT)} is current; nothing to rebuild.`);
  process.exit(0);
}

const CANDIDATES = [
  args.find(a => !a.startsWith('--')),
  process.env.CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
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

  ws.close();

  // Chrome is still writing to its profile directory as it shuts down, so wait
  // for it to exit and treat the cleanup as best effort. A leftover temp
  // directory must never fail a build that produced a good PDF: the exit code
  // belongs to the page count, nothing else.
  proc.kill();
  await new Promise(ok => { proc.once('exit', ok); setTimeout(ok, 3000); });
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    console.warn(`(left ${profile} behind; harmless)`);
  }

  const pdf = Buffer.from(data, 'base64');
  const pages = pageCount(pdf);

  // The page count is checked on what was just rendered, whether or not the
  // file ends up being replaced. A layout that broke must fail even when the
  // stale PDF on disk still happens to be one page.
  if (pages !== 1) {
    console.error(`Rendered ${pages} pages. EXPECTED ONE.`);
    console.error('Tighten the @media print block in pages/lunch-rotations.html, then run this again.');
    process.exit(1);
  }

  let existing = null;
  try { existing = fs.readFileSync(OUT); } catch { /* first build */ }
  const same = existing && fingerprint(existing) && fingerprint(existing) === fingerprint(pdf);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (!same) fs.writeFileSync(OUT, pdf);
  fs.writeFileSync(STAMP, stampBody(wanted));

  console.log(same
    ? `${rel(OUT)} — 1 page, unchanged; stamp refreshed.`
    : `${rel(OUT)} — 1 page, ${(pdf.length / 1024).toFixed(0)} KB, rebuilt.`);
})().catch(err => { console.error(err); proc.kill(); process.exit(1); });
