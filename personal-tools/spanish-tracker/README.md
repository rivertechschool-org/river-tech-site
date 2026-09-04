# Spanish self-test tracker

> **Staging copy.** This belongs in `lukehegelund/life-os`, at the repository root
> (`spanish-tracker.html`, `README.md`, `tests/`). It is parked here only because the
> session that built it could not reach a personal repository. Once it has been copied
> across, delete the branch `claude/spanish-b2-c1-tracker-7j73w1` from this repository.
> Never merge that branch into `main`: pushing `main` publishes to www.rivertechschool.com.

> It signs in to the Personal Assistant Supabase project on its own. It does not use
> LifeOS's `js/supabase.js`, its db-proxy or its auth-guard, and its scores do not go in
> the LifeOS database. That was the call on Fri Sep 4 2026: the tables and the build plan
> already live in the PA project, and the assistant reads them there.

One HTML file that measures my Spanish the same way every time, scores it without
any judgment involved, and stores every sitting in Supabase so each new score has
an old score to beat.

It is not a course and not a certificate. It is a ruler.

## Running it

Open `spanish-tracker.html` in a browser, from disk or from any local server.

The first time, it asks for the Supabase project URL and the publishable key, and
keeps them in that browser. Then sign in with the owner account. The five
`spanish_*` tables have row-level security, so the key can read nothing at all
until you are signed in. The service_role key must never go anywhere near this file.

## What a sitting is

About fifteen minutes, two parts, both scored by the page itself.

**C-test.** Two short Spanish passages. The first sentence is left whole; after
that the second half of every second word is deleted and you put it back. Twenty
gaps per passage, forty in total. Cheap, fast, and it tracks overall proficiency
closely, which is why it is the spine of the whole thing. Scored twice: strict,
where accents count, and lenient, where they do not.

**Vocabulary size.** Eighty words, one at a time, yes or no. Sixty are real, ten
from each of six frequency bands; twenty are invented. Saying yes to an invented
word is a false alarm, and the score is corrected for it:

    corrected = (hits - false alarms) / (1 - false alarms)

so claiming everything scores zero. The word estimate adds up the corrected rate
for each band times the slice of the language that band stands for. It tops out
at 12,000 words; treat the direction as the signal, not the digits.

## What it writes

| Table | Rows per sitting |
|---|---|
| `spanish_test_sessions` | 1 |
| `spanish_test_items` | 120, one per gap and per word |
| `spanish_scores` | 7 auto-scored metrics |
| `spanish_forms` | 3, so those items are never served again |

A sitting that cannot reach the database is parked in the browser and offered
again the next time the page opens. Nothing is lost to a dropped connection.

## The rules it follows

1. Objective auto-scoring is the spine. There is no AI in this file. AI ratings,
   when they come, sit on top and never overrule the measured numbers.
2. Fresh items every sitting. Used forms are retired in `spanish_forms`, because
   reusing items makes the score climb without the Spanish climbing.
3. Fixed difficulty. Every passage is written to one recipe: about 85 words of
   upper-B2 journalistic prose, no proper nouns, no numbers, no dialogue.
4. Every raw response is kept, so the whole history can be re-scored in one pass
   if the method ever changes.
5. English interface. Spanish only inside the items.

## Keeping it fed

Ten passages, two per sitting, so five sittings before the pool is spent. After
that the page still runs, but it flags the sitting as inflated and says so in the
session notes. Add more to the `PASSAGES` array, same recipe, before you get there.

The invented words are in `PSEUDO`. If one turns out to be a real Spanish word,
delete it: a real word hiding in that list quietly deflates every score.

## Tests

    npm install playwright
    node tests/logic.test.mjs           # generator and scoring maths
    node tests/flow.test.mjs            # a whole sitting, against a fake database
    node tests/exhausted-pool.test.mjs  # what happens when the passages run out

The flow tests stub Supabase, so they touch nothing real.

## Still to build

- Speaking: record two minutes, transcribe, compute speech rate, pause ratio and
  lexical diversity. No grading, just the objective metrics.
- Reading and listening from the free Cervantes DELE papers, scored against their
  published answer keys.
- Writing: a timed DELE task graded against the official rating scale.
- Trend charts, one per skill.
