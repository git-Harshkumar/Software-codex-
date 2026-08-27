import json
import os


# ============================================================
# CONFIG
# ============================================================

TRANSCRIPT_FILE = "clean_transcript.json"
OCR_FILE = "ocr_results.json"
VISUAL_FILE = "visual_analysis1.json"

OUTPUT_FILE = "combined_lecture.json"


# ============================================================
# LOAD JSON
# ============================================================

def load_json(filename):

    if not os.path.exists(filename):
        raise FileNotFoundError(
            f"File not found: {filename}"
        )

    with open(
        filename,
        "r",
        encoding="utf-8"
    ) as f:

        return json.load(f)


transcript = load_json(TRANSCRIPT_FILE)
ocr_results = load_json(OCR_FILE)
visual_results = load_json(VISUAL_FILE)


# ============================================================
# FIND TRANSCRIPT FOR TIMESTAMP
# ============================================================

def find_transcript(timestamp):

    best_segment = None
    best_distance = float("inf")

    for segment in transcript:

        start = segment["start"]
        end = segment["end"]

        # Frame occurs inside transcript segment
        if start <= timestamp <= end:
            return segment["text"]

        # Otherwise find closest segment
        distance = min(
            abs(timestamp - start),
            abs(timestamp - end)
        )

        if distance < best_distance:
            best_distance = distance
            best_segment = segment

    if best_segment:
        return best_segment["text"]

    return ""


# ============================================================
# OCR LOOKUP
# ============================================================

ocr_map = {}

for item in ocr_results:

    frame = item.get("frame")

    if frame:
        ocr_map[frame] = item.get(
            "text",
            ""
        )


# ============================================================
# COMBINE
# ============================================================

combined = []


for item in visual_results:

    frame = item.get("frame")

    timestamp = item.get(
        "timestamp",
        0
    )

    analysis = item.get(
        "analysis",
        {}
    )

    transcript_text = find_transcript(
        timestamp
    )

    ocr_text = ocr_map.get(
        frame,
        ""
    )

    combined.append({

        "timestamp": timestamp,

        "frame": frame,

        "transcript": transcript_text,

        "ocr": ocr_text,

        "visual_analysis": analysis

    })


# ============================================================
# SORT BY TIMESTAMP
# ============================================================

combined.sort(
    key=lambda x: x["timestamp"]
)


# ============================================================
# SAVE
# ============================================================

with open(
    OUTPUT_FILE,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        combined,
        f,
        indent=2,
        ensure_ascii=False
    )


# ============================================================
# RESULT
# ============================================================

print("=" * 60)
print("LECTURE DATA COMBINED")
print("=" * 60)

print(
    f"Visual frames : {len(visual_results)}"
)

print(
    f"Combined items: {len(combined)}"
)

print(
    f"Output        : {OUTPUT_FILE}"
)

print("=" * 60)