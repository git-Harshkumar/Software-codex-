"""
generate_shorts.py
==================
Split a lecture video into one short clip per topic section.

Pipeline:
  1. Load notes.json  -> section headings
  2. Load transcript  -> timestamped text
  3. Gemini           -> map each section to [start_sec, end_sec]
  4. ffmpeg           -> cut one clip per section  (no re-encode)
  5. Report           -> print clip table

Usage
-----
    python generate_shorts.py
    python generate_shorts.py --notes notes3.json
    python generate_shorts.py --output-dir my_shorts/
    python generate_shorts.py --timestamps shorts_timestamps.json  # skip Gemini
"""

import argparse
import json
import os
import re
import subprocess
import sys


# ============================================================
# LOAD .env
# ============================================================

def _load_dotenv(path: str = ".env") -> None:
    env_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), path
    )
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()


# ============================================================
# CLI
# ============================================================

def parse_args():

    parser = argparse.ArgumentParser(
        description=(
            "Split a lecture video into one short clip per topic section."
        )
    )

    parser.add_argument(
        "--notes",
        default="notes.json",
        help="Notes JSON file (default: notes.json).",
    )

    parser.add_argument(
        "--transcript",
        default="clean_transcript.json",
        help="Transcript JSON file (default: clean_transcript.json).",
    )

    parser.add_argument(
        "--video",
        default=os.path.join("videos", "lecture.mp4"),
        help="Source video file (default: videos/lecture.mp4).",
    )

    parser.add_argument(
        "--output-dir",
        default="shorts",
        help="Folder for output clips (default: shorts/).",
    )

    parser.add_argument(
        "--timestamps",
        default=None,
        metavar="FILE",
        help=(
            "Path to an existing shorts_timestamps.json to skip "
            "the Gemini mapping step and go straight to cutting."
        ),
    )

    parser.add_argument(
        "--model",
        default="gemini-3.5-flash",
        help="Gemini model to use (default: gemini-3.5-flash).",
    )

    return parser.parse_args()


args = parse_args()


# ============================================================
# VALIDATE INPUTS
# ============================================================

for label, path in [
    ("notes",      args.notes),
    ("transcript", args.transcript),
    ("video",      args.video),
]:
    if not os.path.exists(path):
        print(f"[ERROR] {label} file not found: {path}")
        sys.exit(1)


# ============================================================
# CHECK ffmpeg
# ============================================================

def check_ffmpeg() -> str:
    """
    Return the ffmpeg executable path, or exit with a helpful message.
    """
    candidates = ["ffmpeg"]

    # Common Windows install locations
    win_paths = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        os.path.expanduser(r"~\ffmpeg\bin\ffmpeg.exe"),
    ]
    candidates.extend(win_paths)

    for exe in candidates:
        try:
            result = subprocess.run(
                [exe, "-version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return exe
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    print()
    print("=" * 65)
    print("ERROR: ffmpeg not found")
    print("=" * 65)
    print()
    print("ffmpeg is required to cut video clips.")
    print()
    print("Install it from: https://ffmpeg.org/download.html")
    print()
    print("Windows quick install (winget):")
    print("  winget install Gyan.FFmpeg")
    print()
    print("After installing, restart your terminal and try again.")
    print("=" * 65)
    sys.exit(1)


FFMPEG = check_ffmpeg()
print(f"ffmpeg   : {FFMPEG}")


# ============================================================
# LOAD JSON
# ============================================================

def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


notes      = load_json(args.notes)
transcript = load_json(args.transcript)


# ============================================================
# TRANSCRIPT → FLAT TEXT WITH TIMESTAMPS
# ============================================================

def transcript_to_text(data: list) -> str:
    lines = []
    for seg in data:
        if not isinstance(seg, dict):
            continue
        start = seg.get("start", 0)
        end   = seg.get("end",   0)
        text  = seg.get("text",  "").strip()
        if text:
            lines.append(f"[{start:.2f}s - {end:.2f}s] {text}")
    return "\n".join(lines)


transcript_text = transcript_to_text(transcript)

# Total video duration (last segment end)
total_duration = max(
    (seg.get("end", 0) for seg in transcript if isinstance(seg, dict)),
    default=0
)


# ============================================================
# SECTION HEADINGS
# ============================================================

sections = notes.get("sections", [])
headings = [
    s.get("heading", f"Section {i+1}")
    for i, s in enumerate(sections)
    if isinstance(s, dict)
]

print(f"Sections : {len(headings)}")
for h in headings:
    print(f"  • {h}")
print()


# ============================================================
# STEP 1 — GEMINI TIMESTAMP MAPPING
# ============================================================

TIMESTAMP_PROMPT = """\
You are an expert at analysing lecture transcripts.

I have a lecture transcript with timestamps and a list of topic sections
from the same lecture. Your job is to identify the exact start and end
time (in seconds) in the transcript where each section is discussed.

=== SECTION HEADINGS ===

{headings_json}

=== TRANSCRIPT (format: [start_sec - end_sec] text) ===

{transcript_text}

=== INSTRUCTIONS ===

1. For EACH section heading, find:
   - "start": the transcript timestamp (in seconds, as a float) where
     this topic BEGINS being discussed.
   - "end":   the timestamp where this topic ENDS (i.e., where the next
     topic begins, or the end of the lecture).

2. Sections are ordered, so:
   - section[i].end  ==  section[i+1].start  (approximately)
   - The last section ends at or near the end of the transcript.

3. Do NOT overlap sections.

4. Return ONLY valid JSON — an array with one object per section:

[
  {{
    "heading": "exact heading text",
    "start":   <float seconds>,
    "end":     <float seconds>
  }},
  ...
]

No markdown. No explanation. JSON only.

Total transcript duration: {total_duration:.2f} seconds.
"""


def get_timestamps_from_gemini(model: str) -> list:

    from google import genai

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[ERROR] GEMINI_API_KEY not set in .env")
        sys.exit(1)

    client = genai.Client(api_key=api_key)

    prompt = TIMESTAMP_PROMPT.format(
        headings_json=json.dumps(headings, indent=2),
        transcript_text=transcript_text,
        total_duration=total_duration
    )

    print("Calling Gemini to map sections to timestamps...")
    print(f"  Model    : {model}")
    print(f"  Duration : {total_duration:.1f}s")
    print()

    response = client.models.generate_content(
        model=model,
        contents=prompt
    )

    raw = response.text.strip()

    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        print("[ERROR] Gemini returned invalid JSON:")
        print(raw[:1000])
        raise exc

    return result


# ============================================================
# LOAD OR GENERATE TIMESTAMPS
# ============================================================

TIMESTAMPS_FILE = args.timestamps or os.path.join(
    os.path.dirname(os.path.abspath(args.notes)),
    "shorts_timestamps.json"
)

if args.timestamps and os.path.exists(args.timestamps):

    print(f"Loading timestamps from: {args.timestamps}")
    timestamps = load_json(args.timestamps)

else:

    timestamps = get_timestamps_from_gemini(args.model)

    # Save for reuse / inspection
    with open(TIMESTAMPS_FILE, "w", encoding="utf-8") as f:
        json.dump(timestamps, f, indent=2, ensure_ascii=False)

    print(f"Timestamps saved -> {TIMESTAMPS_FILE}")
    print()

# Validate
if not isinstance(timestamps, list) or not timestamps:
    print("[ERROR] Timestamps result is empty or invalid.")
    sys.exit(1)


# ============================================================
# DISPLAY MAPPED SECTIONS
# ============================================================

print("=" * 65)
print("SECTION → TIMESTAMP MAPPING")
print("=" * 65)

for entry in timestamps:
    h     = entry.get("heading", "?")
    start = entry.get("start", 0)
    end   = entry.get("end",   0)
    dur   = end - start
    print(
        f"  [{start:7.1f}s – {end:7.1f}s]  ({dur:5.1f}s)  {h}"
    )

print()


# ============================================================
# FILENAME SLUGIFIER
# ============================================================

def slugify(text: str, max_len: int = 50) -> str:
    """Convert a heading into a safe filename component."""
    # Remove leading numbering like "1. " or "2. "
    text = re.sub(r"^\d+\.\s*", "", text)
    # Keep alphanumeric and spaces
    text = re.sub(r"[^\w\s-]", "", text)
    # Collapse whitespace to underscores
    text = re.sub(r"\s+", "_", text.strip())
    return text[:max_len]


# ============================================================
# STEP 2 — CUT CLIPS WITH ffmpeg
# ============================================================

os.makedirs(args.output_dir, exist_ok=True)

video_path = os.path.abspath(args.video)

print("=" * 65)
print("CUTTING CLIPS")
print("=" * 65)
print()

clip_results = []

for i, entry in enumerate(timestamps, start=1):

    heading = entry.get("heading", f"Section_{i}")
    start   = float(entry.get("start", 0))
    end     = float(entry.get("end",   0))
    dur     = end - start

    if dur <= 0:
        print(f"  [SKIP] {heading!r}: invalid duration ({dur:.1f}s)")
        clip_results.append({
            "index":   i,
            "heading": heading,
            "status":  "skipped",
            "reason":  f"duration {dur:.1f}s",
        })
        continue

    slug     = slugify(heading)
    filename = f"clip_{i:02d}_{slug}.mp4"
    out_path = os.path.join(args.output_dir, filename)

    print(f"  [{i:02d}] {heading}")
    print(f"        {start:.1f}s → {end:.1f}s  ({dur:.1f}s)")
    print(f"        → {out_path}")

    cmd = [
        FFMPEG,
        "-y",                  # overwrite without asking
        "-ss", str(start),     # seek BEFORE input (fast)
        "-to", str(end),       # end time
        "-i", video_path,      # source video
        "-c", "copy",          # stream copy — no re-encode
        "-avoid_negative_ts", "make_zero",
        out_path
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode == 0 and os.path.exists(out_path):
            size_mb = os.path.getsize(out_path) / 1_048_576
            print(f"        OK  ({size_mb:.1f} MB)")
            clip_results.append({
                "index":    i,
                "heading":  heading,
                "status":   "ok",
                "file":     out_path,
                "start":    start,
                "end":      end,
                "duration": dur,
                "size_mb":  round(size_mb, 1),
            })
        else:
            print(f"        [FAILED] ffmpeg exit code {result.returncode}")
            if result.stderr:
                # Show last 3 lines of ffmpeg stderr
                lines = result.stderr.strip().splitlines()
                for line in lines[-3:]:
                    print(f"        {line}")
            clip_results.append({
                "index":   i,
                "heading": heading,
                "status":  "failed",
                "reason":  f"ffmpeg exit {result.returncode}",
            })

    except subprocess.TimeoutExpired:
        print("        [FAILED] timed out after 300s")
        clip_results.append({
            "index":   i,
            "heading": heading,
            "status":  "failed",
            "reason":  "timeout",
        })

    except Exception as exc:
        print(f"        [FAILED] {exc}")
        clip_results.append({
            "index":   i,
            "heading": heading,
            "status":  "failed",
            "reason":  str(exc),
        })

    print()


# ============================================================
# SAVE CLIP MANIFEST
# ============================================================

manifest_path = os.path.join(args.output_dir, "clips_manifest.json")
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(clip_results, f, indent=2, ensure_ascii=False)


# ============================================================
# FINAL REPORT
# ============================================================

ok_clips   = [c for c in clip_results if c["status"] == "ok"]
fail_clips = [c for c in clip_results if c["status"] == "failed"]
skip_clips = [c for c in clip_results if c["status"] == "skipped"]

print()
print("=" * 65)
print("SHORTS GENERATION COMPLETE")
print("=" * 65)
print()

# Summary table
print(f"  {'#':>2}  {'Duration':>8}  {'Size':>7}  Clip")
print(f"  {'─'*2}  {'─'*8}  {'─'*7}  {'─'*40}")

for c in clip_results:
    idx = c["index"]
    if c["status"] == "ok":
        dur_s = c["duration"]
        m, s  = divmod(int(dur_s), 60)
        dur_f = f"{m}m {s:02d}s"
        sz    = f"{c['size_mb']:.1f} MB"
        name  = os.path.basename(c["file"])
        print(f"  {idx:>2}  {dur_f:>8}  {sz:>7}  {name}")
    else:
        reason = c.get("reason", "?")
        print(f"  {idx:>2}  {'—':>8}  {'—':>7}  [{c['status'].upper()}] {reason}")

print()
print(
    f"  Clips created  : {len(ok_clips)} / {len(clip_results)}"
)

if ok_clips:
    total_dur = sum(c["duration"] for c in ok_clips)
    total_sz  = sum(c["size_mb"]  for c in ok_clips)
    m, s = divmod(int(total_dur), 60)
    print(f"  Total duration : {m}m {s:02d}s")
    print(f"  Total size     : {total_sz:.1f} MB")
    print(f"  Output folder  : {os.path.abspath(args.output_dir)}/")

if fail_clips:
    print(f"\n  Failed clips   : {len(fail_clips)}")

print()
print(f"  Manifest       : {manifest_path}")
print("=" * 65)
