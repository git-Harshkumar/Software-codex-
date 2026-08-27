import json
import re

INPUT_FILE = r"raw_transcript.json"
OUTPUT_FILE = r"normalized_transcript.json"


def normalize_text(text):
    # Replace newline and tabs with spaces
    text = re.sub(r"[\n\r\t]+", " ", text)

    # Remove multiple spaces
    text = re.sub(r"\s+", " ", text)

    return text.strip()


with open(INPUT_FILE, "r", encoding="utf-8") as f:
    transcript = json.load(f)


normalized = []

for segment in transcript:
    text = normalize_text(segment["text"])

    if not text:
        continue

    normalized.append({
        "start": segment["start"],
        "end": segment["end"],
        "text": text
    })


with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(normalized, f, indent=2, ensure_ascii=False)


print(f"Original segments: {len(transcript)}")
print(f"Normalized segments: {len(normalized)}")
print(f"Saved to {OUTPUT_FILE}")