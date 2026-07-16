"""Create a one-shot intro and seamless PCM16 WAV loop from a source track."""

from __future__ import annotations

import argparse
import math
import struct
import wave
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--intro-target", type=Path)
    parser.add_argument("--preview-target", type=Path)
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--crossfade", type=float, required=True)
    parser.add_argument("--target-peak", type=float, default=-6.0)
    args = parser.parse_args()

    with wave.open(str(args.source), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        sample_rate = source.getframerate()
        frame_count = source.getnframes()
        compression = source.getcomptype()
        raw = source.readframes(frame_count)

    if sample_width != 2 or compression != "NONE":
        raise ValueError("only uncompressed PCM16 WAV is supported")

    start_frame = round(args.start * sample_rate)
    end_frame = round(args.end * sample_rate)
    crossfade_frames = round(args.crossfade * sample_rate)
    if not (0 <= start_frame < end_frame <= frame_count):
        raise ValueError("invalid loop range")
    if crossfade_frames <= 0 or crossfade_frames * 2 >= end_frame - start_frame:
        raise ValueError("invalid crossfade duration")

    samples = struct.unpack(f"<{frame_count * channels}h", raw)
    segment = samples[start_frame * channels : end_frame * channels]
    segment_frames = end_frame - start_frame
    output: list[int] = list(segment[crossfade_frames * channels : -crossfade_frames * channels])

    # Append a tail-to-head blend. The next playback iteration starts at the first
    # unblended frame after the head portion used here.
    for frame in range(crossfade_frames):
        phase = frame / max(1, crossfade_frames - 1)
        fade_in = math.sin(phase * math.pi / 2)
        fade_out = math.cos(phase * math.pi / 2)
        for channel in range(channels):
            head = segment[frame * channels + channel]
            tail_frame = segment_frames - crossfade_frames + frame
            tail = segment[tail_frame * channels + channel]
            value = head * fade_in + tail * fade_out
            output.append(max(-32768, min(32767, round(value))))

    intro_end_frame = start_frame + crossfade_frames
    intro = list(samples[: intro_end_frame * channels])

    peak = max(max(abs(value) for value in output), max(abs(value) for value in intro))
    target_amplitude = 32767 * (10 ** (args.target_peak / 20))
    gain = target_amplitude / peak if peak else 1.0
    output = [max(-32768, min(32767, round(value * gain))) for value in output]
    intro = [max(-32768, min(32767, round(value * gain))) for value in intro]

    output_frames = len(output) // channels

    args.target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(args.target), "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(sample_width)
        target.setframerate(sample_rate)
        target.writeframes(struct.pack(f"<{len(output)}h", *output))

    if args.intro_target:
        args.intro_target.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(args.intro_target), "wb") as target:
            target.setnchannels(channels)
            target.setsampwidth(sample_width)
            target.setframerate(sample_rate)
            target.writeframes(struct.pack(f"<{len(intro)}h", *intro))

    if args.preview_target:
        preview_frames = min(round(6 * sample_rate), output_frames // 2)
        preview = output[-preview_frames * channels :] + output[: preview_frames * channels]
        args.preview_target.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(args.preview_target), "wb") as target:
            target.setnchannels(channels)
            target.setsampwidth(sample_width)
            target.setframerate(sample_rate)
            target.writeframes(struct.pack(f"<{len(preview)}h", *preview))

    print(
        f"created {args.target}: {output_frames / sample_rate:.3f}s "
        f"from {args.start:.3f}-{args.end:.3f}s with {args.crossfade:.3f}s crossfade; "
        f"intro {intro_end_frame / sample_rate:.3f}s; peak {args.target_peak:.1f} dBFS"
    )


if __name__ == "__main__":
    main()
