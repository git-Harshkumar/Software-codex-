import os
import json
import whisper

# ============================================================
# CONFIGURATION
# ============================================================

VIDEO_FILE = r"videos\lecture.mp4"
OUTPUT_FILE = r"raw_transcript.json"

# Whisper model:
# tiny  -> fastest, lowest accuracy
# base  -> fast
# small -> better accuracy
# medium -> high accuracy, slower
# large -> highest accuracy, very slow/heavy
MODEL_NAME = "small"


# ============================================================
# CHECK INPUT VIDEO
# ============================================================

if not os.path.exists(VIDEO_FILE):
    print("=" * 60)
    print("ERROR: Video file not found!")
    print("=" * 60)
    print(f"Expected video: {VIDEO_FILE}")
    print()
    print("Make sure your folder looks like:")
    print()
    print("notes_gen/")
    print("└── video3/")
    print("    └── new_lecture.mp4")
    print()
    exit(1)


# ============================================================
# CREATE OUTPUT DIRECTORY
# ============================================================

output_dir = os.path.dirname(OUTPUT_FILE)

if output_dir:
    os.makedirs(output_dir, exist_ok=True)


# ============================================================
# LOAD WHISPER
# ============================================================

print("=" * 60)
print("Loading Whisper model...")
print("=" * 60)

model = whisper.load_model(MODEL_NAME)

print(f"Model loaded: {MODEL_NAME}")
print()


# ============================================================
# TRANSCRIBE VIDEO
# ============================================================

print("=" * 60)
print("Transcribing video...")
print("=" * 60)

result = model.transcribe(
    VIDEO_FILE,
    language="en",
    task="transcribe",
    verbose=True,
    fp16=False
)


# ============================================================
# EXTRACT TIMESTAMPED SEGMENTS
# ============================================================

transcript = []

for segment in result["segments"]:

    text = segment["text"].strip()

    if not text:
        continue

    transcript.append({
        "start": round(segment["start"], 3),
        "end": round(segment["end"], 3),
        "text": text
    })


# ============================================================
# SAVE RAW TRANSCRIPT
# ============================================================

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:

    json.dump(
        transcript,
        f,
        indent=2,
        ensure_ascii=False
    )


# ============================================================
# RESULT
# ============================================================

print()
print("=" * 60)
print("WHISPER TRANSCRIPTION COMPLETED")
print("=" * 60)

print(f"Video              : {VIDEO_FILE}")
print(f"Whisper model      : {MODEL_NAME}")
print(f"Transcript segments : {len(transcript)}")
print(f"Output              : {OUTPUT_FILE}")

print("=" * 60)