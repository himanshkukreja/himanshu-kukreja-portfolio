# Side-quest lectures → MP4 (experimental)

A lecture is `resources/lectures/<quest slug>.json` in the content repo: scenes (title, numbers,
flowchart, sequence, state) whose diagrams light up or build up step by step while a narrator reads
each step's `say` line. The site plays it at `/learn/lectures/<slug>` (unlisted, noindex); these
scripts turn it into a 1080p MP4 with a free local voice.

## One-time setup

```sh
brew install espeak-ng ffmpeg
mkdir -p ~/.cache/kokoro && cd ~/.cache/kokoro
python3 -m venv venv && venv/bin/pip install kokoro-onnx soundfile faster-whisper
# model files from https://github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0)
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
# puppeteer-core isn't a site dependency: add it to node_modules only
cd <site repo> && npm i --no-save puppeteer-core
```

## Make a video

```sh
node scripts/lecture/check.mjs ../system-design-mastery/resources/lectures/<slug>.json   # structure, highlights, symbols
npx next dev -p 3100                                                                       # the exporter screenshots this
node scripts/lecture/export.mjs \
  ../system-design-mastery/resources/lectures/<slug>.json out/<slug> http://localhost:3100 af_heart 1.0
python3 scripts/lecture/synccheck.py out/<slug>                                             # every step's frame vs its audio window
~/.cache/kokoro/venv/bin/python scripts/lecture/asrcheck.py out/<slug>                      # transcribes the voice, flags dropped or garbled words
```

How it works: Kokoro voices every step (acronyms like UPI are spelled out, decimals read as
"3 point 5"); the page in record mode (`?record=1`) shows one step at a time via
`window.__LECTURE_GOTO(i)`; one screenshot per step is held for exactly that step's audio, so picture
and voice can't drift (a live screen recording did). About a minute per video once the voice exists.

Writing tips (learned on UPI, WhatsApp, BookMyShow): no symbols in `say`; flowcharts left to right
with one-line labels (tall or long-labelled diagrams turn unreadable at 16:9); sequences up to about
10 messages. Voice `af_heart` is the default; samples of others were compared on 25 Oct 2026.
