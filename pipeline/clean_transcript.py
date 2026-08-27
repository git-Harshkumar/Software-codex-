import json
import re

INPUT_FILE = r"raw_transcript.json"
OUTPUT_FILE = r"clean_transcript.json"

FILLER_WORDS = [
    "um",
    "uh",
    "umm",
    "hmm",
    "you know"
]


def clean_text(text):
    text = re.sub(r"\s+", " ", text).strip()

    for word in FILLER_WORDS:
        text = re.sub(
            rf"\b{re.escape(word)}\b",
            "",
            text,
            flags=re.IGNORECASE
        )

    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.!?])", r"\1", text)

    if text:
        text = text[0].upper() + text[1:]

    if text and text[-1] not in ".!?":
        text += "."

    return text


with open(INPUT_FILE, "r", encoding="utf-8") as f:
    transcript = json.load(f)

clean_transcript = []

for segment in transcript:
    cleaned = clean_text(segment["text"])

    if cleaned:
        clean_transcript.append({
            "start": segment["start"],
            "end": segment["end"],
            "text": cleaned
        })

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(
        clean_transcript,
        f,
        indent=2,
        ensure_ascii=False
    )

print("=" * 50)
print("TRANSCRIPT CLEANING COMPLETED")
print("=" * 50)
print(f"Original segments : {len(transcript)}")
print(f"Cleaned segments  : {len(clean_transcript)}")
print(f"Output            : {OUTPUT_FILE}")