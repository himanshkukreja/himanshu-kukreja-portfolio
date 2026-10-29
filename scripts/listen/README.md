# Listen: natural-voice narration for articles

The **Listen** button (lesson reader, case files, war stories, the mock interview debrief) plays a
recorded narration in the shorts' and lectures' voice (Kokoro `af_heart`, made once on this Mac,
free) when the article has one; otherwise it reads with the browser's speech synthesis, as before. Nothing runs on Vercel: the page stays ISR, and the
player fetches `listen.json` from the media domain in the browser.

```
https://media.himanshukukreja.in/listen/<key>/listen.json     manifest (max-age 60)
https://media.himanshukukreja.in/listen/<key>/narration.mp3   mono MP3, 48 kbps CBR, 24 kHz (?v=<source>)
<key> = quest/<slug>                 side quests
        lesson/<folder>/<slug>       course lessons, interview problems, LLD
        case/<slug>                  case files (/stories/<slug>; the admin CMS, else content/stories/)
        war/<slug>                   war stories (/learn/war-stories/<slug>; resources/war-stories/stories/)
        mock/<slug>                  mock interviews: the debrief's model answers (resources/mock-interviews/)
```

What each player reads:

| kind | page | player root | source file (must equal its repo's `origin/main`) |
|---|---|---|---|
| lessons, quests, problems, LLD | lesson reader | the article | content repo, as the course lists it |
| case files | `StoryReader` (floating controls, toolbar *Read aloud*) | the article body | what `/stories/<slug>` shows (`lib/stories.ts`): the admin CMS's published (live) snapshot for every case file it has (all of them, Oct 2026), else `content/stories/<file>.md` here. Reading the CMS needs the Supabase keys in `.env` (lib.mjs loads it under `.env.local`); a CMS edit changes the text, so run the batch again after one |
| war stories | header *Listen* + `ReadAloudBar` (`components/listen/Listen.tsx`) | the story body | `resources/war-stories/stories/<slug>.md`. War rooms are an interactive game: not voiced |
| mock interviews | debrief header *Listen to the model answers* (opens them all first) | `[data-listen-scope]`: only each phase's heading and its model answer (`[data-listen-part]`), never the learner's notes, curveballs or rubric | `resources/mock-interviews/mock-NN-*.md` |

The player marks its root `data-listen-root="<key>"`. While the recording plays, the case file
controls' settings show "Natural voice" instead of the browser voice picker.

## How it stays in step with the page

`src/lib/listen/extract.ts` decides what is read (one block per paragraph, list item, heading or
table row; code, diagrams, quizzes, explainer animations, hints/solutions, link lists and UI chrome
are skipped; checkpoint answers are read after a pause). The player runs it on the live article and
the generator runs it on the renderer's HTML (`src/lib/listen/html.ts` parses it), so both get the
same blocks. The manifest's `source` is the sha1 (12 hex) of that text: if the article changes,
the hashes differ and the player falls back to the browser voice until the article is voiced again.

`node scripts/listen/parity.mjs` checks the generator's parser against Chrome's for every article
(`--only war/` for one kind; `--page http://localhost:3315 <article>` checks a live page, enhancers
included, reading the player's `[data-listen-root]`; a mock opens on its debrief with every model answer
shown). Run it after changing the renderer, `html.ts` or `extract.ts`. The generator renders war stories
and mock answers with `renderBlockHtml` (`src/lib/course/block-html.ts`), case files with
`renderStoryBody`, exactly as their pages do.

Pronunciation: `say.mjs` applies the lecture narrator's respellings (`SAY_AS` / `speakable` in
`scripts/lecture/export.mjs`, read from that file) after its own pass for article text (arrows,
`×`, `≈`, units glued to numbers, `e.g.`, code-ish words). Each build leaves `say.txt` (exactly what
Kokoro was given, per block) next to the audio for checking.

## Manifest (`listen.json`)

```jsonc
{
  "v": 1,
  "key": "quest/bonus-28-gmail-email-at-scale",
  "source": "fe626ac18b0f",      // sha1 of the readable text, 12 hex
  "voice": "af_heart", "speed": 1,
  "audio": "narration.mp3?v=fe626ac18b0f",   // relative to the manifest
  "duration": 3301.2, "bytes": 19807232,     // seconds, MP3 size
  "blocks": 382,                              // extractBlocks() count
  "chunks": [ { "b": 0, "t": "How Do You Say…", "s": 0, "e": 4.21 } ],  // block index, text, start/end s
  "made": "2026-10-29T…"
}
```

## Setup (once; already done on this Mac)

The lecture setup (`scripts/lecture/README.md`): Kokoro in `~/.cache/kokoro` (venv, model, voices),
`brew install espeak-ng ffmpeg`. `parity.mjs` also needs `npm i --no-save puppeteer-core` and Chrome.
`source ~/.cache/hk-render/env.sh` puts node and ffmpeg on the PATH.

The content repo checkout (`SDM_LOCAL_DIR` in `.env.local`) must have `origin/main` fetched, and so
must this repo for case files kept as files: an article whose file differs from its repo's `origin/main` (local
edits, unpublished `*-next` folders) is skipped, because production would never match it
(`--allow-dirty` voices it anyway). A case file from the admin CMS is its published snapshot, which is
what production shows.

## Use

```sh
source ~/.cache/hk-render/env.sh && cd ~/portfolio-site
git -C ../system-design-mastery fetch origin && git fetch origin

# a few articles; --dev copies them into public/listen-media/ for `next dev`
node --env-file=.env.local scripts/listen/build.mjs quest/bonus-28-gmail-email-at-scale lesson/week-04-caching/day-03-thundering-herd --dev
node --env-file=.env.local scripts/listen/build.mjs quest/bonus-28-gmail-email-at-scale --publish

node --env-file=.env.local scripts/listen/build.mjs case/digipin-scalable-location-service war/gangnam-style-view-counter mock/mock-02-wanderstay-bookings --publish

# everything (resumable; unchanged articles and R2 copies are skipped; it lowers itself to nice 10).
# Order: side quests, course lessons, interview problems, LLD, case files, war stories, mock interviews.
nice -n 10 node --env-file=.env.local scripts/listen/batch.mjs --publish 2>&1 | tee -a out/listen/batch.log
nice -n 10 node --env-file=.env.local scripts/listen/batch.mjs --publish --only war/     # one kind
node scripts/listen/batch.mjs --estimate        # words, hours of audio, MB, Kokoro hours (voices nothing)
```

Output goes to `out/listen/<key>/` (git-ignored): `narration.mp3`, `listen.json`, `say.txt`. The
per-block WAVs are deleted after encoding (`--keep-wav` keeps them). `out/listen/batch.jsonl` logs
words, audio seconds, Kokoro seconds and bytes per voiced article; `--estimate` uses it.

After an article changes, run the batch again: only articles whose text changed are voiced again.
R2 objects of articles that were removed are not deleted.

## Speed and size (measured 29 Oct 2026, M3 Pro, while a lecture render used most of the CPU)

See the numbers in the report of the first run; `--estimate` prints the current ones from
`batch.jsonl`. Roughly: about 150 spoken words a minute, 48 kbps is 0.36 MB per minute of audio.
