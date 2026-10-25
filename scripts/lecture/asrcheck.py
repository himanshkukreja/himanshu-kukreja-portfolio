# transcribe each step's audio and compare with the script: flags dropped / garbled words
import sys, json, re, difflib
from faster_whisper import WhisperModel
d = sys.argv[1]
items = json.load(open(f"{d}/items.json"))
m = WhisperModel("base.en", device="cpu", compute_type="int8")
UNITS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split())}
TENS = {w: 10 * i for i, w in enumerate("_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()) if w != "_"}
SCALE = {"hundred": 100, "thousand": 1000, "million": 10**6, "billion": 10**9, "trillion": 10**12}
ORD = {"first": "1", "second": "2", "third": "3", "twelfth": "12", "fifth": "5"}
def words2num(ws):
    out, cur, tot, num = [], 0, 0, False
    def flush():
        nonlocal cur, tot, num
        if num: out.append(str(tot + cur))
        cur = tot = 0; num = False
    for w in ws:
        if w in UNITS: cur += UNITS[w]; num = True
        elif w in TENS: cur += TENS[w]; num = True
        elif w == "hundred" and num: cur *= 100
        elif w in SCALE and num: tot += cur * SCALE[w]; cur = 0
        elif w == "and" and num: continue
        else:
            flush(); out.append(ORD.get(w, w))
    flush()
    return out
def norm(s):
    s = s.lower().replace("%", " percent").replace("-", " ")
    s = re.sub(r"(\d),(\d)", r"\1\2", s)
    s = re.sub(r"\b(\d+)(st|nd|rd|th)\b", r"\1", s)
    s = re.sub(r"[^a-z0-9 ']", " ", s).replace("'s", "s").replace("'", "")
    ws = s.split()
    # spaced letters ("u p i") read as one word
    j = []
    for w in ws:
        if len(w) == 1 and w not in ("a",) and j and re.fullmatch(r"[a-z]+", j[-1]) and getattr(norm, "_l", 0):
            j[-1] += w
        else:
            j.append(w)
        norm._l = len(w) == 1 and w != "a" or (len(j[-1]) > 1 and len(w) == 1 and w != "a")
    return words2num(j)
bad = 0
for it in items:
    segs, _ = m.transcribe(it["out"], beam_size=5, language="en")
    heard = " ".join(s.text for s in segs)
    a, b = norm(it["text"]), norm(heard)
    r = difflib.SequenceMatcher(None, a, b).ratio()
    missing = len(a) - sum(x.size for x in difflib.SequenceMatcher(None, a, b).get_matching_blocks())
    if r < 0.85 or missing > 3:
        bad += 1
        print(f"\n[{r:.2f}, {missing} words unmatched]\n  script: {it['text']}\n  heard : {heard.strip()}")
print(f"\n{d}: {len(items)} steps, {bad} flagged")
