# Background music for the vertical shorts, by mood, synthesised here (original, no licence questions):
# drums, bass, chords and a hook per mood, with the bass and pads ducking under the kick (the "pumping"
# feel of short-form video) and a light reverb. Each track is a whole number of bars, so it loops cleanly.
#   tension  outages, incidents: minor, pulsing 8th bass, ticking hats, a low drone, risers
#   drive    scale, architecture: four on the floor, off-beat bass, claps, a 16th arpeggio
#   lofi     calm concepts: swung boom-bap, warm electric-piano 9th chords, a little vinyl
#   playful  oddities: bouncy plucks on a pentatonic hook, light clap
#   bright   wins, migrations: uplifting I-V-vi-IV, plucky arps, claps
# usage: python music_moods.py <out dir> [seconds]   → <out dir>/<mood>.wav (convert to mp3 with ffmpeg)
import sys, os
import numpy as np
import soundfile as sf

SR = 44100
OUT = sys.argv[1]
SECONDS = float(sys.argv[2]) if len(sys.argv) > 2 else 96.0
os.makedirs(OUT, exist_ok=True)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, cutoff):  # one-pole low-pass
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_fast(x, cutoff):  # vectorised-ish low-pass via FFT for long signals
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def hp_fast(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (cutoff / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(X, len(x))


rng = np.random.default_rng(11)


def kick(level=1.0):
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 46 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.25
    return (body + click) * level


def snare(level=1.0, clap=False):
    n = int(0.28 * SR)
    t = np.arange(n) / SR
    noise = hp_fast(rng.standard_normal(n), 1400) * np.exp(-t * (16 if clap else 22))
    if clap:  # three quick bursts
        env = np.zeros(n)
        for d in (0.0, 0.011, 0.022):
            i = int(d * SR)
            env[i:] += np.exp(-(t[: n - i]) * 60)
        noise = hp_fast(rng.standard_normal(n), 900) * (env * 0.6 + np.exp(-t * 14) * 0.6)
        return noise * level * 0.55
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return (noise * 0.7 + tone) * level


def hat(level=1.0, open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return hp_fast(rng.standard_normal(n), 7000) * np.exp(-t * (14 if open_ else 90)) * level * 0.35


def tone(midi, dur, kind="sine", level=1.0, attack=0.005, decay=None):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    if kind == "saw":
        x = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 9))
    elif kind == "square":
        x = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 9, 2))
    elif kind == "epiano":  # warm keys: fundamental + soft bell partial, tremolo
        x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 3) + 0.12 * np.sin(2 * np.pi * f * 7.02 * t) * np.exp(-t * 9)
        x *= 1 + 0.08 * np.sin(2 * np.pi * 5.2 * t)
    elif kind == "pluck":
        x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 6) + 0.25 * np.sin(2 * np.pi * f * 3 * t) * np.exp(-t * 10)
    elif kind == "marimba":
        x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 25)
    else:
        x = np.sin(2 * np.pi * f * t)
    env = np.minimum(1, t / max(attack, 1e-4))
    if decay:
        env = env * np.exp(-t * decay)
    rel = int(min(0.03, dur / 3) * SR)
    if rel:
        env[-rel:] *= np.linspace(1, 0, rel)
    return x * env * level


class Track:
    def __init__(self, bpm, bars):
        self.bpm = bpm
        self.beat = 60.0 / bpm
        self.bars = bars
        self.n = int(round(bars * 4 * self.beat * SR))
        self.drums = np.zeros(self.n)
        self.music = np.zeros((self.n, 2))
        self.kicks = []

    def at(self, bar, beat):
        return bar * 4 * self.beat + beat * self.beat

    def add(self, buf, sig, t0, pan=0.0):
        i = int(t0 * SR)
        if i >= self.n:
            return
        j = min(self.n, i + len(sig))
        if buf is self.drums:
            buf[i:j] += sig[: j - i]
        else:
            buf[i:j, 0] += sig[: j - i] * (1 - pan) / 2 * 1.4
            buf[i:j, 1] += sig[: j - i] * (1 + pan) / 2 * 1.4

    def kick(self, bar, beat, level=1.0):
        self.add(self.drums, kick(level), self.at(bar, beat))
        self.kicks.append(self.at(bar, beat))

    def render(self, duck=0.55, reverb=0.18, drum_level=0.9, music_level=0.8):
        # sidechain: the music dips under each kick and swells back
        env = np.ones(self.n)
        for k in self.kicks:
            i = int(k * SR)
            L = min(self.n - i, int(self.beat * SR))
            t = np.arange(L) / SR
            env[i : i + L] = np.minimum(env[i : i + L], 1 - duck * np.exp(-t * 7))
        mus = self.music * env[:, None]
        # light reverb: a few feedback delays per channel
        wet = np.zeros_like(mus)
        for ch in range(2):
            for d, g in ((0.0297, 0.5), (0.0371, 0.45), (0.0411, 0.42), (0.0437, 0.4)):
                D = int(d * SR * (1.03 if ch else 1.0))
                y = np.copy(mus[:, ch])
                for k in range(1, 6):
                    y[D * k :] += mus[: -D * k or None, ch][: self.n - D * k] * (g ** k)
                wet[:, ch] += y
            wet[:, ch] = lp_fast(wet[:, ch], 5000)
        out = mus * music_level + wet * reverb / 4 + np.stack([self.drums, self.drums], 1) * drum_level
        out = out / (np.max(np.abs(out)) + 1e-9) * 0.89
        return out


def chord_stack(root, qual):
    return {"min": [0, 3, 7], "maj": [0, 4, 7], "min7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11], "min9": [0, 3, 7, 10, 14], "maj9": [0, 4, 7, 11, 14], "dom9": [0, 4, 10, 14], "sus2": [0, 2, 7]}[qual]


def pad(tr, bar, root, qual, beats=4, level=0.12, kind="saw", cutoff=1800, octave=0):
    for k, iv in enumerate(chord_stack(root, qual)):
        sig = tone(root + iv + 12 * octave, beats * tr.beat + 0.3, kind, level, attack=0.25)
        sig = lp_fast(sig, cutoff)
        tr.add(tr.music, sig, tr.at(bar, 0), pan=(k - 1.5) * 0.25)


def make(mood):
    if mood == "tension":
        tr = Track(100, 40)
        prog = [(57, "min"), (53, "maj"), (50, "min"), (52, "maj")]  # Am F Dm E
        for b in range(tr.bars):
            root, q = prog[b % 4]
            pad(tr, b, root - 12, q, level=0.07, kind="saw", cutoff=900)
            tr.add(tr.music, lp_fast(tone(root - 24, 4 * tr.beat, "sine", 0.18, attack=0.4), 300), tr.at(b, 0))  # drone
            for e in range(8):  # pulsing 8th bass
                tr.add(tr.music, lp_fast(tone(root - 24, tr.beat / 2 * 0.9, "saw", 0.16, decay=6), 600), tr.at(b, e / 2))
            if b % 8 >= 1:
                tr.kick(b, 0, 0.9)
                tr.kick(b, 2.5 if b % 2 else 2, 0.7)
            for s16 in range(16):
                if b % 8 >= 2:
                    tr.add(tr.drums, hat(0.55 if s16 % 4 == 2 else 0.25), tr.at(b, s16 / 4))
            if b % 8 >= 2:
                tr.add(tr.drums, snare(0.55), tr.at(b, 3))
            if b % 8 == 7:  # riser into the next phrase
                n = int(4 * tr.beat * SR)
                tt = np.arange(n) / SR
                rise = hp_fast(rng.standard_normal(n), 2000) * (tt / tt[-1]) ** 2 * 0.25
                tr.add(tr.drums, rise, tr.at(b, 0))
        return tr.render(duck=0.5, reverb=0.25, drum_level=0.75, music_level=0.9)
    if mood == "drive":
        tr = Track(118, 48)
        prog = [(60, "maj"), (55, "maj"), (57, "min"), (53, "maj")]  # C G Am F
        for b in range(tr.bars):
            root, q = prog[b % 4]
            for beat in range(4):
                tr.kick(b, beat, 1.0)
                tr.add(tr.drums, hat(0.6, open_=True), tr.at(b, beat + 0.5))
            tr.add(tr.drums, snare(0.75, clap=True), tr.at(b, 1))
            tr.add(tr.drums, snare(0.75, clap=True), tr.at(b, 3))
            for beat in range(4):
                tr.add(tr.music, lp_fast(tone(root - 24, tr.beat / 2 * 0.85, "saw", 0.2, decay=5), 700), tr.at(b, beat + 0.5))
            for stab in (0, 1.5, 3):
                for k, iv in enumerate(chord_stack(root, q)):
                    tr.add(tr.music, lp_fast(tone(root + iv, tr.beat * 0.45, "saw", 0.06, decay=7), 2600), tr.at(b, stab), pan=(k - 1) * 0.3)
            notes = [root + iv + 12 for iv in chord_stack(root, q)] + [root + 24]
            for s16 in range(16):
                tr.add(tr.music, tone(notes[s16 % len(notes)], tr.beat / 4 * 0.9, "pluck", 0.07, decay=14), tr.at(b, s16 / 4), pan=0.35 * (1 if s16 % 2 else -1))
        return tr.render(duck=0.6, reverb=0.16, drum_level=0.8, music_level=0.85)
    if mood == "lofi":
        tr = Track(82, 32)
        prog = [(62, "min9"), (55, "dom9"), (60, "maj9"), (57, "min9")]  # Dm9 G9 Cmaj9 Am9
        swing = 0.08
        for b in range(tr.bars):
            root, q = prog[b % 4]
            for k, iv in enumerate(chord_stack(root, q)):
                tr.add(tr.music, lp_fast(tone(root + iv - 12, 4 * tr.beat, "epiano", 0.09, attack=0.01, decay=0.6), 2200), tr.at(b, 0.02 * k), pan=(k - 2) * 0.2)
            tr.add(tr.music, lp_fast(tone(root - 24, 1.6 * tr.beat, "sine", 0.24, decay=1.2), 400), tr.at(b, 0))
            tr.add(tr.music, lp_fast(tone(root - 24 + 7, 1.2 * tr.beat, "sine", 0.18, decay=1.4), 400), tr.at(b, 2.5))
            tr.kick(b, 0, 0.85)
            tr.kick(b, 2.5, 0.65)
            tr.add(tr.drums, lp_fast(snare(0.6), 4500), tr.at(b, 1))
            tr.add(tr.drums, lp_fast(snare(0.6), 4500), tr.at(b, 3))
            for e in range(8):
                tr.add(tr.drums, hat(0.35 if e % 2 == 0 else 0.22), tr.at(b, e / 2 + (swing if e % 2 else 0)))
        out = tr.render(duck=0.3, reverb=0.3, drum_level=0.7, music_level=0.9)
        crackle = (rng.random(len(out)) > 0.9993) * rng.standard_normal(len(out)) * 0.06 + hp_fast(rng.standard_normal(len(out)), 3000) * 0.004
        out += np.stack([crackle, crackle], 1)
        return lp_fast(out[:, 0], 9000)[:, None] * [1, 0] + lp_fast(out[:, 1], 9000)[:, None] * [0, 1]
    if mood == "playful":
        tr = Track(104, 40)
        prog = [(60, "maj"), (57, "min"), (65, "maj"), (67, "maj")]  # C Am F G
        hook = [0, 2, 4, 7, 9, 7, 4, 2]
        for b in range(tr.bars):
            root, q = prog[b % 4]
            tr.kick(b, 0, 0.8)
            tr.kick(b, 2, 0.7)
            tr.add(tr.drums, snare(0.5, clap=True), tr.at(b, 1))
            tr.add(tr.drums, snare(0.5, clap=True), tr.at(b, 3))
            for e in range(8):
                tr.add(tr.drums, hat(0.25), tr.at(b, e / 2 + 0.25))
            tr.add(tr.music, lp_fast(tone(root - 24, tr.beat * 0.8, "sine", 0.24, decay=3), 500), tr.at(b, 0))
            tr.add(tr.music, lp_fast(tone(root - 24 + 7, tr.beat * 0.8, "sine", 0.2, decay=3), 500), tr.at(b, 2))
            for k, iv in enumerate(chord_stack(root, q)):
                tr.add(tr.music, tone(root + iv, tr.beat * 0.5, "pluck", 0.06, decay=8), tr.at(b, 1.5), pan=(k - 1) * 0.4)
                tr.add(tr.music, tone(root + iv, tr.beat * 0.5, "pluck", 0.06, decay=8), tr.at(b, 3.5), pan=(k - 1) * 0.4)
            if b % 2 == 0:
                for e, step in enumerate(hook):
                    tr.add(tr.music, tone(72 + step, tr.beat / 2 * 0.8, "marimba", 0.11, decay=9), tr.at(b, e / 2), pan=0.2)
        return tr.render(duck=0.35, reverb=0.2, drum_level=0.75, music_level=0.9)
    if mood == "bright":
        tr = Track(112, 48)
        prog = [(65, "maj"), (60, "maj"), (62, "min"), (58, "maj")]  # F C Dm Bb (I V vi IV in F)
        for b in range(tr.bars):
            root, q = prog[b % 4]
            for beat in range(4):
                tr.kick(b, beat, 0.9)
            tr.add(tr.drums, snare(0.7, clap=True), tr.at(b, 1))
            tr.add(tr.drums, snare(0.7, clap=True), tr.at(b, 3))
            for s16 in range(16):
                tr.add(tr.drums, hat(0.3 if s16 % 2 else 0.18), tr.at(b, s16 / 4))
            pad(tr, b, root - 12, "sus2" if b % 8 == 7 else q, level=0.06, kind="saw", cutoff=2400)
            tr.add(tr.music, lp_fast(tone(root - 24, 4 * tr.beat * 0.95, "saw", 0.12, decay=0.8), 650), tr.at(b, 0))
            notes = [root + iv + 12 for iv in chord_stack(root, q)]
            pattern = [0, 1, 2, 1, 2, 0, 1, 2]
            for e, p_ in enumerate(pattern):
                tr.add(tr.music, tone(notes[p_] + (12 if e == 4 else 0), tr.beat / 2 * 0.9, "pluck", 0.09, decay=9), tr.at(b, e / 2), pan=0.3 * (1 if e % 2 else -1))
        return tr.render(duck=0.55, reverb=0.2, drum_level=0.8, music_level=0.85)
    raise SystemExit(f"unknown mood {mood}")


for mood in ("tension", "drive", "lofi", "playful", "bright"):
    out = make(mood)
    # trim to the requested length on a bar boundary is already done by the bar count; keep as is
    sf.write(os.path.join(OUT, f"{mood}.wav"), out.astype(np.float32), SR)
    print(mood, f"{len(out) / SR:.1f}s")
