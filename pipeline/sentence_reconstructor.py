import json
import spacy

INPUT_FILE = r"normalized_transcript.json"
OUTPUT_FILE = r"reconstructed_transcript.json"

nlp = spacy.load("en_core_web_sm")


with open(INPUT_FILE, "r", encoding="utf-8") as f:
    transcript = json.load(f)


# Combine all caption text
full_text = " ".join(segment["text"] for segment in transcript)

# Run NLP sentence segmentation
doc = nlp(full_text)


# Build character-position mapping
char_positions = []

current_position = 0

for segment in transcript:
    start_pos = current_position
    end_pos = start_pos + len(segment["text"])

    char_positions.append({
        "start": start_pos,
        "end": end_pos,
        "timestamp_start": segment["start"],
        "timestamp_end": segment["end"]
    })

    current_position = end_pos + 1


def get_timestamp(sentence_start, sentence_end):

    overlapping = []

    for item in char_positions:

        if (
            sentence_start < item["end"]
            and sentence_end > item["start"]
        ):
            overlapping.append(item)

    if not overlapping:
        return None, None

    start_time = overlapping[0]["timestamp_start"]
    end_time = overlapping[-1]["timestamp_end"]

    return start_time, end_time


reconstructed = []


for sentence in doc.sents:

    text = sentence.text.strip()

    if not text:
        continue

    start_time, end_time = get_timestamp(
        sentence.start_char,
        sentence.end_char
    )

    if start_time is None:
        continue

    reconstructed.append({
        "start": start_time,
        "end": end_time,
        "text": text
    })


with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(
        reconstructed,
        f,
        indent=2,
        ensure_ascii=False
    )


print("Original caption segments:", len(transcript))
print("Reconstructed sentences:", len(reconstructed))
print("Saved to:", OUTPUT_FILE)