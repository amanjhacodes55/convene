#!/usr/bin/env python3
"""Text on stdin -> natural-sounding wav, via Kokoro (https://github.com/thewh1teagle/kokoro-onnx).

  echo "Hello there." | KOKORO_DIR=~/.local/share/kokoro-tts venv/bin/python tts.py out.wav

KOKORO_DIR holds kokoro-v1.0.onnx and voices-v1.0.bin. VOICE / SPEED tune the read.
"""
import os, sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

DIR = os.path.expanduser(os.environ.get("KOKORO_DIR", "~/.local/share/kokoro-tts"))
VOICE = os.environ.get("VOICE", "af_heart")
SPEED = float(os.environ.get("SPEED", "0.98"))

text = sys.stdin.read().strip()
kokoro = Kokoro(os.path.join(DIR, "kokoro-v1.0.onnx"), os.path.join(DIR, "voices-v1.0.bin"))
samples, rate = kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-us")
# Trim the model's leading/trailing near-silence so beat timing is driven by the words.
loud = np.flatnonzero(np.abs(samples) > 0.01)
if loud.size:
    pad = int(rate * 0.05)
    samples = samples[max(0, loud[0] - pad): loud[-1] + pad]
sf.write(sys.argv[1], samples, rate)
