# Word timings for a short's Reels-style captions: transcribe each step's narration with faster-whisper
# (word timestamps), then align the recognised words to the script's own words, so every script word gets
# [start, end] in seconds from the start of its step. Words whisper missed or merged are interpolated
# between their neighbours. Writes <out dir>/words.json: [[[start, end], ...] per script word] per step.
# usage: python words.py <out dir>   (reads <out dir>/items.json and each step's .raw.wav, from export.mjs)
import sys, json, re, difflib, wave, contextlib
from faster_whisper import WhisperModel

d = sys.argv[1]
items = json.load(open(f"{d}/items.json"))
script = json.load(open(f"{d}/script-words.json"))  # the script's words per step (what the captions show)
m = WhisperModel("base.en", device="cpu", compute_type="int8")


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def seconds(path):
    with contextlib.closing(wave.open(path)) as f:
        return f.getnframes() / float(f.getframerate())


out = []
for it, words in zip(items, script):
    total = seconds(it["out"])
    segs, _ = m.transcribe(it["out"], word_timestamps=True, beam_size=1, vad_filter=False)
    heard = [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or [])]
    a = [norm(w) for w in words]
    b = [norm(w) for w, _, _ in heard]
    times = [None] * len(words)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            times[blk.a + k] = [heard[blk.b + k][1], heard[blk.b + k][2]]
    # fill gaps: spread unmatched words evenly between the matched ones around them (by length)
    k = 0
    while k < len(words):
        if times[k] is not None:
            k += 1
            continue
        j = k
        while j < len(words) and times[j] is None:
            j += 1
        lo = times[k - 1][1] if k > 0 else 0.0
        hi = times[j][0] if j < len(words) else total
        span = max(0.05, hi - lo)
        lens = [max(1, len(words[x])) for x in range(k, j)]
        acc = lo
        for x, L in zip(range(k, j), lens):
            dd = span * L / sum(lens)
            times[x] = [acc, acc + dd]
            acc += dd
        k = j
    out.append([[round(s, 3), round(e, 3)] for s, e in times])

json.dump(out, open(f"{d}/words.json", "w"))
print(f"words: {sum(len(x) for x in out)} timed over {len(out)} steps")
