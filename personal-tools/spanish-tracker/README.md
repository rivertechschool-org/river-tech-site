# Spanish self-test tracker

Personal tool, nothing to do with the River Tech website. It lives on the branch
`claude/spanish-b2-c1-tracker-7j73w1` because that is where the session that built
it was told to work.

**Do not merge this branch into `main`.** Pushing `main` publishes the whole
repository to www.rivertechschool.com, and this page has no business being there.
It belongs in its own home; moving it out is a one-line `git mv` once that home exists.

## What it is

One HTML file. Open `spanish-tracker.html` in a browser, from disk or from a local
server. It runs a sitting of two tests, scores them without any AI, and stores the
result in the Supabase Personal Assistant project.

- **C-test.** Two short Spanish passages. The first sentence is left whole; after
  that the second half of every second word is deleted and you restore it. Twenty
  gaps per passage, forty in total. This is the spine of the tracker: it is fast,
  it is scored by string comparison, and it tracks overall proficiency closely.
- **Vocabulary size.** Eighty words, one at a time, yes or no. Sixty are real and
  spread evenly across six frequency bands; twenty are invented. Saying yes to an
  invented word is a false alarm, and the score is corrected for it, so claiming
  everything gets you zero.

Roughly fifteen minutes. Nothing is graded by judgment, so two sittings a month
apart are directly comparable.

## First run

The published copy in this repository carries no Supabase key. The first time you
open it, paste the project URL and the publishable key; the browser keeps them.
Then sign in with the owner account email and password. The five `spanish_*` tables
are row-level-secured, so the key sees nothing at all until you are signed in.

## What it writes

| Table | Rows per sitting |
|---|---|
| `spanish_test_sessions` | 1 |
| `spanish_test_items` | 120, one per gap and per word |
| `spanish_scores` | 7 auto-scored metrics |
| `spanish_forms` | 3, so those items are never served again |

If the save fails, the whole sitting is held in the browser and a "try again"
button appears; it is also offered the next time you open the page.

## Rules this page follows

From the build plan note in Supabase, *Spanish self-test tracker - build plan,
findings & guidelines*:

- Objective auto-scoring only. No AI in this file (G1).
- Fresh items every sitting; used forms are retired in `spanish_forms` (G2).
- Passages are written to one recipe, about 85 words of upper-B2 journalistic
  prose, no proper nouns and no numbers, so difficulty does not drift (G3).
- Interface in English; Spanish only inside the items (G7).

## Keeping it going

There are ten passages, two per sitting, so five sittings before the pool is
spent. After that the page still runs but flags the sitting as inflated and says
so in the session notes. Add more passages to the `PASSAGES` array in the file,
same recipe, before you get there.

The invented words are in the `PSEUDO` array. If one of them turns out to be a
real Spanish word, delete it; a real word sitting in that list quietly deflates
every score.
