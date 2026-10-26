# usage: python tts.py <items.json> <voice> [speed] [kokoro dir]   items: [{"text": "...", "out": "/path.wav", "voice"?: "am_michael"}]
# needs: pip install kokoro-onnx soundfile; brew install espeak-ng; kokoro-v1.0.onnx + voices-v1.0.bin in the kokoro dir
import sys, json, soundfile as sf
from kokoro_onnx import Kokoro, EspeakConfig
D = (sys.argv[4] if len(sys.argv) > 4 else sys.path[0]).rstrip("/")
k = Kokoro(D + "/kokoro-v1.0.onnx", D + "/voices-v1.0.bin", espeak_config=EspeakConfig(lib_path="/opt/homebrew/lib/libespeak-ng.dylib", data_path="/opt/homebrew/share/espeak-ng-data"))
items = json.load(open(sys.argv[1]))
voice = sys.argv[2]
speed = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
for i, it in enumerate(items):
    v = it.get("voice") or voice  # an item may name its own voice (two-person mock interviews)
    lang = "en-gb" if v[0] == "b" else "en-us"
    audio, sr = k.create(it["text"], voice=v, speed=speed, lang=lang)
    sf.write(it["out"], audio, sr)
    print(f"{i + 1}/{len(items)}", flush=True)
