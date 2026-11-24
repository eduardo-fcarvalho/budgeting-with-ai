"""Normalize each paired clip to the same PCM format accepted by the PWA."""
import subprocess
import wave
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / "target/voice-cases"
out.mkdir(parents=True, exist_ok=True)
samples = sorted((root / "poc/src/test/resources/audio").glob("recording-*.mp3"))
samples.extend(sorted((root / "benchmark").glob("*.wav")))
for sample in samples:
    pcm = subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", str(sample),
                                   "-ac", "1", "-ar", "16000", "-f", "s16le", "-"])
    if not 0 < len(pcm) <= 960000:
        raise ValueError(sample.name)
    with wave.open(str(out / (sample.stem + ".wav")), "wb") as target:
        target.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        target.writeframes(pcm)
print(f"{len(samples)} gravações preparadas em {out}")
