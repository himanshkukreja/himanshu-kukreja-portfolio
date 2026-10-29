# Listen: natural-voice narration for articles

The **Listen** button in the lesson reader plays a recorded narration in the shorts' and lectures'
voice (Kokoro `af_heart`, made once on this Mac, free) when the article has one; otherwise it reads
with the browser's speech synthesis, as before. Nothing runs on Vercel: the page stays ISR, and the
player fetches `listen.json` from the media domain in the browser.

```
https://media.himanshukukreja.in/listen/<key>/listen.json     manifest (max-age 60)
https://media.himanshukukreja.in/listen/<key>/narration.mp3   mono MP3, 48 kbps CBR, 24 kHz (?v=<source>)
<key> = quest/<slug>                 side quests
        lesson/<folder>/<slug>       course lessons, interview problems, LLD
        case/, war/, mock/<slug>     reserved (those readers don't play recordings yet)
```

## How it stays in step with the page

`src/lib/listen/extract.ts` decides what is read (one block per paragraph, list item, heading or
table row; code, diagrams, quizzes, explainer animations, hints/solutions, link lists and UI chrome
are skipped; checkpoint answers are read after a pause). The player runs it on the live article and
the generator runs it on the renderer's HTML (`src/lib/listen/html.ts` parses it), so both get the
same blocks. The manifest's `source` is the sha1 (12 hex) of that text: if the article changes,
the hashes differ and the player falls back to the browser voice until the article is voiced again.

`node scripts/listen/parity.mjs` checks the generator's parser against Chrome's for every article
(`--page http://localhost:3313 <article>` checks a live page, enhancers included). Run it after
changing the renderer or `html.ts`.

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

The content repo checkout (`SDM_LOCAL_DIR` in `.env.local`) must have `origin/main` fetched: an
article whose file differs from `origin/main` (local edits, unpublished `*-next` folders) is skipped,
because production would never match it (`--allow-dirty` voices it anyway).

## Use

```sh
source ~/.cache/hk-render/env.sh && cd ~/portfolio-site
git -C ../system-design-mastery fetch origin

# a few articles; --dev copies them into public/listen-media/ for `next dev`
node --env-file=.env.local scripts/listen/build.mjs quest/bonus-28-gmail-email-at-scale lesson/week-04-caching/day-03-thundering-herd --dev
node --env-file=.env.local scripts/listen/build.mjs quest/bonus-28-gmail-email-at-scale --publish

# everything (resumable; unchanged articles and R2 copies are skipped). Run it when the Mac is free:
nice -n 10 node --env-file=.env.local scripts/listen/batch.mjs --publish 2>&1 | tee -a out/listen/batch.log
nice -n 10 node --env-file=.env.local scripts/listen/batch.mjs --publish --only quest/     # side quests first
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
