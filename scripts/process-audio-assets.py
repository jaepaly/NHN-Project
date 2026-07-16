"""Trim and peak-normalize INCANT SFX WAV assets without external packages."""

from __future__ import annotations

import argparse
import math
import struct
import wave
from pathlib import Path


TARGET_PEAK_DBFS = {
    "sfx-hit.wav": -8.0,
    "sfx-fizzle.wav": -10.0,
    "sfx-incant-enter.wav": -7.0,
    "sfx-reward-select.wav": -7.0,
}
DEFAULT_TARGET_PEAK_DBFS = -6.0
THRESHOLD_DBFS = -50.0
FRAME_MS = 5
PRE_ROLL_MS = 10
POST_ROLL_MS = 75
FADE_OUT_MS = 20


def dbfs(amplitude: float) -> float:
    return 20.0 * math.log10(max(amplitude, 1e-12))


def process(path: Path) -> tuple[float, float, float, float]:
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        sample_rate = source.getframerate()
        frame_count = source.getnframes()
        compression = source.getcomptype()
        frames = source.readframes(frame_count)

    if sample_width != 2 or compression != "NONE":
        raise ValueError(f"{path.name}: only uncompressed PCM16 WAV is supported")

    samples = list(struct.unpack(f"<{frame_count * channels}h", frames))
    max_sample = 32768.0
    analysis_frames = max(1, round(sample_rate * FRAME_MS / 1000))
    threshold = 10 ** (THRESHOLD_DBFS / 20)
    active: list[int] = []

    for start in range(0, frame_count, analysis_frames):
        end = min(frame_count, start + analysis_frames)
        square_sum = 0.0
        count = (end - start) * channels
        for value in samples[start * channels : end * channels]:
            square_sum += (value / max_sample) ** 2
        if math.sqrt(square_sum / max(1, count)) > threshold:
            active.append(start)

    if not active:
        raise ValueError(f"{path.name}: no active signal found")

    pre_roll = round(sample_rate * PRE_ROLL_MS / 1000)
    post_roll = round(sample_rate * POST_ROLL_MS / 1000)
    trim_start = max(0, active[0] - pre_roll)
    trim_end = min(frame_count, active[-1] + analysis_frames + post_roll)
    trimmed = samples[trim_start * channels : trim_end * channels]
    trimmed_frames = trim_end - trim_start

    peak_before = max(abs(value) for value in trimmed) / max_sample
    target_db = TARGET_PEAK_DBFS.get(path.name, DEFAULT_TARGET_PEAK_DBFS)
    gain = (10 ** (target_db / 20)) / max(peak_before, 1e-12)

    fade_frames = min(round(sample_rate * FADE_OUT_MS / 1000), trimmed_frames)
    output: list[int] = []
    for frame_index in range(trimmed_frames):
        fade = 1.0
        if frame_index >= trimmed_frames - fade_frames:
            fade = (trimmed_frames - 1 - frame_index) / max(1, fade_frames - 1)
        for channel in range(channels):
            value = trimmed[frame_index * channels + channel] * gain * fade
            output.append(max(-32768, min(32767, round(value))))

    with wave.open(str(path), "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(sample_width)
        target.setframerate(sample_rate)
        target.writeframes(struct.pack(f"<{len(output)}h", *output))

    peak_after = max(abs(value) for value in output) / max_sample
    return frame_count / sample_rate, trimmed_frames / sample_rate, dbfs(peak_before), dbfs(peak_after)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_dir", type=Path)
    args = parser.parse_args()

    for path in sorted(args.audio_dir.glob("sfx-*.wav")):
        before_seconds, after_seconds, before_peak, after_peak = process(path)
        print(
            f"{path.name}: {before_seconds:.3f}s -> {after_seconds:.3f}s, "
            f"peak {before_peak:.2f} -> {after_peak:.2f} dBFS"
        )


if __name__ == "__main__":
    main()
