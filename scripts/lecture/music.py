# Soft background music for the lectures, synthesised here (original, no licence questions):
# a slow four-chord ambient pad, a quiet plucked arpeggio and a soft low note, through a gentle
# low-pass and a long reverb. The end crossfades into the start so it loops without a seam.
# usage: python music.py <out.wav> [seconds] [seed]
import sys
import numpy as np
import soundfile as sf  # needs: pip install numpy scipy soundfile

SR = 44100
out = sys.argv[1]
LEN = float(sys.argv[2]) if len(sys.argv) > 2 else 192.0
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 7)

def hz(m):  # midi note to frequency
    return 440.0 * 2 ** ((m - 69) / 12)

# Cmaj9, Am9, Fmaj9, G6/9: warm, unresolved, calm
CHORDS = [[48, 55, 64, 67, 71, 74], [45, 52, 60, 64, 67, 71], [41, 48, 57, 60, 64, 67], [43, 50, 59, 62, 64, 69]]
BAR = 8.0
n = int(LEN * SR)
t = np.arange(n) / SR
mix = np.zeros((n, 2))

def env(length, a, r):
    e = np.ones(length)
    ai, ri = int(a * SR), int(r * SR)
    e[:ai] = np.linspace(0, 1, ai) ** 2
    e[-ri:] *= np.linspace(1, 0, ri) ** 2
    return e

# pad: detuned sines per chord note, slow swell, panned a little
bars = int(np.ceil(LEN / BAR)) + 1
for b in range(bars):
    start = int(b * BAR * SR)
    length = int((BAR + 3.0) * SR)
    if start >= n:
        break
    seg = np.arange(length) / SR
    e = env(length, 2.6, 3.4)
    chord = CHORDS[b % len(CHORDS)]
    for k, m in enumerate(chord):
        f = hz(m)
        v = 0.045 if m < 52 else 0.03
        tone = sum(np.sin(2 * np.pi * f * (1 + d) * seg + rng.uniform(0, 6.28)) for d in (-0.0018, 0, 0.0021)) / 3
        tone += 0.25 * np.sin(2 * np.pi * 2 * f * seg)  # a touch of the octave for air
        lfo = 1 + 0.12 * np.sin(2 * np.pi * (0.07 + 0.01 * k) * seg)
        pan = 0.5 + 0.35 * np.sin(k * 1.7)
        s = tone * e * lfo * v
        end = min(n, start + length)
        mix[start:end, 0] += s[: end - start] * (1 - pan)
        mix[start:end, 1] += s[: end - start] * pan

# pluck: a soft arpeggio, two notes a beat at 70 bpm, upper chord tones
beat = 60 / 70
for j in range(int(LEN / (beat / 2))):
    if rng.random() < 0.35:
        continue
    at = j * beat / 2
    chord = CHORDS[int(at // BAR) % len(CHORDS)]
    m = chord[rng.integers(2, len(chord))] + 12
    length = int(2.2 * SR)
    start = int(at * SR)
    if start >= n:
        break
    seg = np.arange(length) / SR
    f = hz(m)
    s = (np.sin(2 * np.pi * f * seg) + 0.3 * np.sin(2 * np.pi * 2 * f * seg) * np.exp(-seg * 6)) * np.exp(-seg * 2.4) * 0.022
    s *= np.minimum(1, seg / 0.008)
    pan = rng.uniform(0.25, 0.75)
    end = min(n, start + length)
    mix[start:end, 0] += s[: end - start] * (1 - pan)
    mix[start:end, 1] += s[: end - start] * pan

# soft low note on each bar's root
for b in range(bars):
    start = int(b * BAR * SR)
    if start >= n:
        break
    length = int(BAR * SR)
    seg = np.arange(length) / SR
    f = hz(CHORDS[b % len(CHORDS)][0] - 12)
    s = np.sin(2 * np.pi * f * seg) * env(length, 1.5, 2.5) * 0.05
    end = min(n, start + length)
    mix[start:end] += s[: end - start, None]

# gentle low-pass (one pole, ~2.5 kHz)
from scipy.signal import lfilter
a = np.exp(-2 * np.pi * 2500 / SR)
mix = lfilter([1 - a], [1, -a], mix, axis=0)

# long, dark reverb: exponentially decaying filtered noise, convolved by FFT
ir_len = int(3.2 * SR)
irt = np.arange(ir_len) / SR
ir = rng.standard_normal((ir_len, 2)) * np.exp(-irt * 2.1)[:, None]
ir[:, 0] = np.convolve(ir[:, 0], np.ones(24) / 24, mode="same")
ir[:, 1] = np.convolve(ir[:, 1], np.ones(24) / 24, mode="same")
size = 1 << int(np.ceil(np.log2(n + ir_len)))
wet = np.stack([np.fft.irfft(np.fft.rfft(mix[:, c], size) * np.fft.rfft(ir[:, c], size), size)[:n] for c in range(2)], axis=1)
wet /= np.max(np.abs(wet)) + 1e-9
dry = mix / (np.max(np.abs(mix)) + 1e-9)
y = 0.55 * dry + 0.6 * wet

# seamless loop: crossfade the last 4 s into the first 4 s
xf = int(4 * SR)
fade = np.linspace(0, 1, xf)[:, None]
y[:xf] = y[:xf] * fade + y[-xf:] * (1 - fade)
y = y[:-xf]
y *= 0.5 / (np.max(np.abs(y)) + 1e-9)
sf.write(out, y.astype(np.float32), SR)
print(f"{out}: {len(y) / SR:.1f} s")
