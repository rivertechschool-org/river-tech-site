# AGENT-NOTES — read this before you touch anything

Hey future agent. This file is for you. Dan is the site owner (visionary of River Tech School). Read these notes before making changes so we stop repeating the same mistakes.

## 1. Nav menu fade — LOCKED SLOW. Do not speed up.

Dan has asked for slow menu/submenu fades at least **four separate times** across sessions (commits `ee91a2c`, `d1b6635`, `4d868c2`, `1e8bac1`, and the 2026-04-21 session that created this file). Every time a fresh agent looks at the CSS, something about 0.4–0.5s durations with `ease` timing looks "a bit slow" and gets trimmed. Then Dan has to ask again. **Stop doing this.**

Ground truth:

- `--nav-fade: 0.7s` and `--nav-fade-ease: ease-in-out` live in `assets/css/style.css` (`:root`).
- All three nav transitions reference those variables:
  - `.sidebar-submenu` (desktop hover submenus)
  - `.mobile-nav-overlay` (mobile hamburger panel)
  - `.mobile-submenu` (mobile nested submenus)
- `assets/js/main.js` uses `NAV_FADE_MS = 700` — **must stay in sync** with `--nav-fade`.

### Rules for future edits to nav fade

- If the page "feels laggy" to you: **that is intentional**. Leave it alone.
- If you must change it, the ONLY acceptable edit is changing `--nav-fade` + `NAV_FADE_MS` together, and only when Dan explicitly asks.
- Do not remove the two-stage `.open` + `.visible` fade on mobile — it's the only way iOS Safari reliably animates opacity after a `display` flip.
- Do not replace the `setTimeout(…, NAV_FADE_MS)` with a `transitionend` listener — it misfires on iOS when display flips.
- Do not swap `ease-in-out` back to `ease`. The gentler curve is deliberate.

## 2. Mobile nav implementation — LOCKED

The known-good mobile nav uses:

- `display: none/block` toggled via `.open` class
- `.visible` class for opacity fade (added on next frame after `.open`)
- `openSubmenu` / `closeSubmenu` helpers in `main.js`

Past "improvements" using `max-height`, `flex`, `grid`, or CSS `transform` broke the nav on iOS Safari. **Do not refactor it.** Do not migrate it to a framework. Do not "simplify" it.

If you need to adjust mobile nav for an unrelated change, confirm with Dan first.

## 3. Deploy gotchas

- Hosted on GitHub Pages; pushing `main` publishes the site.
- CSS cache-bust: whenever `style.css` changes, bump the shared `?v=NN` value on every page that links it.
- **Watch out for zero-byte commits.** In the 2026-04-21 session, an `edit` tool call reported success but wrote 0 bytes to `pages/our-culture.html`, then `git add -A && commit && push` blind-pushed a 312-line deletion. GitHub Pages served the empty file. Before committing a file you just edited, run `wc -c` on it to sanity-check it's not empty.
- Prefer `git add <specific files>` over `git add -A` when you know exactly what changed.

## 4. Culture / copy

- Culture page: `pages/our-culture.html`. Locked copy — every line has been negotiated with Dan and his wife and reviewed by teachers. Do not rewrite for "tone" unless asked. Specific landmines:
  - The LGBTQ paragraph wording is deliberate. Don't "soften" it.
  - The "Regional Roots" section was renamed from "Idaho Roots" on purpose. Don't swap it back.
  - Skip stock photos. Dan rejected all 19 candidates plus a Depositphotos option in one session.
  - No video in Grit section anymore (removed 2026-04-21).

## 5. Who's who

- **Dan Hegelund** — site owner, visionary of River Tech School, makes all final calls.
- **Assistant / Gabriel** — you. Christian school of performing arts & technology, grades 1-12, Post Falls ID.

## 6. When in doubt

Ask Dan before making changes to nav, mobile nav, or locked copy. Small, reversible changes are fine; "refactors" or "cleanups" of the above almost always create regressions.

## 7. The class schedule has ONE source. Do not hand-edit the tables.

Added 2026-08-17, after the Q1 schedule was published twice in two days — version 1.2 on
the 16th, 1.3 on the 17th — by editing the same tables by hand in two separate files. That
works right up until it doesn't. The failure mode isn't effort, it's divergence: eventually
one copy gets edited and the other doesn't, and the copy that's wrong is always the one
nobody remembers exists.

**Source of truth:** `assets/data/schedule-q1-2026-27.json`. It holds all five panels
(Elementary, Middle School, Junior High, High School, Homeschool) as structured rows and
cells — time, class, teacher initials, room emoji, the colour marking which grade group a
line belongs to, and the footnotes under each table.

**Generated output:** the schedule tables inside `pages/school-start-hub.html` and
`pages/calendar.html`. **Do not hand-edit them.** They get overwritten the next time the
generator runs, and your change will vanish silently.

### Changing the schedule

1. Edit `assets/data/schedule-q1-2026-27.json`.
2. `python3 tools/build_schedule.py apply assets/data/schedule-q1-2026-27.json pages/school-start-hub.html pages/calendar.html`
3. `git --no-pager diff` and **read it** before committing.

The generator writes plain static HTML into the pages. Nothing runs in the visitor's
browser and nothing is fetched at page load — the pages behave exactly as they did when
the tables were typed by hand.

### The commands

| Command | What it does |
|---|---|
| `parse <page.html> <out.json>` | Reads the panels out of a page into a source file. Used once, to create the source from what was already live. |
| `apply <source.json> <page.html> …` | Rewrites every schedule panel in each page from the source file. |
| `verify <page.html> <source.json>` | Round trip: regenerates from the source and compares against the page, character by character. |
| `teachers <source.json>` | Pivots the grid by person — the shape the Teachers page needs. |

### How this was proved before anything relied on it

The source file was built by reading the live pages, fed back through the generator, and
compared against those same pages character by character. All five panels came back
exactly, from both pages, from the one file. Four were byte-identical; the High School
panel differed only in line breaks, because it had been typed across several lines while
the other four sat on one. `verify` is that same test and it stays in the repo — run it
any time you want to know whether the pages and the source still agree.

### Two things the teacher pivot cannot see

`teachers` finds a person by the initials in parentheses — `Math (JO)`. Angie and Kara
never appear that way, because costumes and props are written into the small print under
the production blocks rather than as classes. They must be placed by hand on any
per-teacher view. That's a fact about how the Keynote is drawn, not a parser bug.

### Upstream of all of it

The master is a Keynote deck Dan maintains, exported as
`26-27 Q1 Schedule Semi-Final <version>, <date>.pdf`. The site is downstream of that deck.
When a new version lands, read the changes off the PDF and apply them to the JSON — the
deck stays the human original, the JSON stays the machine one.

## 8. Teachers page — bios show on the CARDS, and staff emails are @rivertech.me

Added 2026-08-25, at Luke's direction. Two standing rules for every future teachers-page change:

- **A bio is not "published" until it is visible on the grid.** Bio copy is authored inside that
  teacher's `<div class="tpw-panel" id="tpw-XX">` as `<p class="tp-bio">`, but a panel is `hidden`
  until someone clicks the card, so a bio left there alone is invisible to anyone scanning the page.
  The inline script near the bottom of `pages/teachers.html` hoists it onto the visible card:
  `["DA", "CA", "JO", "LU", "PH", "TI", "RY", "PE"].forEach(...)` copies the panel bio into that
  card's `.tp-line` and removes the panel copy. **When you add a bio, add the teacher's two-letter
  `data-who` code to that array.** Do not instead duplicate the bio text into the card markup — that
  renders it twice, once from the markup and once from the hoist.
- **Staff contact addresses are firstname@rivertech.me. Never personal addresses.** The page
  previously carried gmail/yahoo addresses for Dan, Mary, Caitlin, Jordan, and Luke; those were
  replaced on 2026-08-25. If you do not have a verified @rivertech.me address for someone, leave
  their contact line off rather than guessing one.

## 9. The lunch rotation PDF rebuilds itself. You do not have to know that it exists.

Added 2026-08-26. `pages/lunch-rotations.html` carries a **Download the one-page PDF**
button, and that button hands out a file committed to the repo:
`assets/docs/river-tech-lunch-rotations.pdf`. It is not produced on the fly, so it goes
stale the moment anything it is printed from changes, and a stale sheet looks exactly
like a fresh one from the page.

Relying on people to remember that is how it would break. `.github/workflows/lunch-rotation-pdf.yml`
rebuilds the sheet on any push to `main` that touches the page, `style.css`, `base.css`
or the build script, and commits the result. Edit the rotation page in the GitHub web
UI, or change the stylesheet having never heard of any of this, and the download stays
correct on its own.

**The one case that needs a person:** if an edit makes the sheet stop fitting on one
page, the build fails, the run goes red on the commit that caused it, and the old PDF is
left untouched rather than replaced by a broken two-page one. Fix the layout or trim the
content; do not delete the check.

**If the workflow cannot push** (a red run saying the push was rejected), the repository
setting is Settings > Actions > General > Workflow permissions, which must be
"Read and write". Nothing else about it needs configuring.

### Rebuilding by hand

Worth doing when you are already editing the page, so the new sheet lands in the same
commit as the change rather than in a follow-up commit from the bot.

```
node tools/build_lunch_pdf.js            # rebuilds only if an input changed
node tools/build_lunch_pdf.js --check    # says whether the PDF is stale, changes nothing
node tools/build_lunch_pdf.js --force    # rebuilds regardless
```

The script drives headless Chrome over the DevTools protocol using only Node's built-in
WebSocket — no `npm install`, no dependency in the repo. It **exits non-zero if the
result is not exactly one page**, which is the whole point of the sheet.

### Why there is a `.pdf.inputs` file next to the PDF

The PDF is not byte-reproducible: Chrome stamps a fresh document id into every render, so
a naive "rebuild and commit if the bytes differ" would commit on every single run and
manufacture merge conflicts for everyone else in the repo. Two guards stop that. The
`.inputs` file holds a hash of everything the sheet is rendered from, so a matching hash
skips the rebuild entirely; and when a rebuild does happen, the drawing operators of the
old and new PDF are compared, so a render that looks identical leaves the committed file
alone. The file changes when the sheet actually looks different, and never otherwise.
Do not hand-edit `.pdf.inputs`.

### Why the print block is full of `!important`

`assets/css/style.css` raises every table cell to `font-size: 15px !important` inside its
`@media (max-width: 900px)` phone query. A US Letter page is 7.5 inches of content, which
is 720 CSS pixels — narrower than the phone breakpoint — so that query fires while
printing and blew the schedule onto three pages. The print rules in the page override it
cell by cell. The same query's `.schedule-table-wrap::after { content: 'Scroll →' }` hint
is switched off there too. If you loosen any of that, re-run the build script and read
the page count.

### Headroom

The sheet lays out at about 968 of the 994 CSS pixels a Letter page gives it at those
margins. That is roughly 3% of slack, so a couple of extra words in a cell are fine and a
new row is not. Every day block, the notice and the notes carry `break-inside: avoid`, so
an overflow produces a clean second page rather than a table cut in half — but a second
page still means the button is lying about what it hands out.

### The page's own copy

The rotation is typed into `pages/lunch-rotations.html` by hand. It is not generated from
`assets/data/schedule-q1-2026-27.json` — that source file holds the class schedule, which
is a different grid with different groupings. Do not point the schedule generator at this
page.
