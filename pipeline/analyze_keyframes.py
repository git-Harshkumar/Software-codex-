import os
import json
import time
import re

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai import errors


# ============================================================
# CONFIG
# ============================================================

load_dotenv(r"..\.env")

INPUT_DIR = r"keyframes_final"
OUTPUT_FILE = r"visual_analysis1.json"

MODEL_NAME = "gemini-3.5-flash"

# Wait between requests
REQUEST_DELAY = 1.5

# Retry settings
MAX_RETRIES = 3


# ============================================================
# API KEY
# ============================================================

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise RuntimeError(
        "GEMINI_API_KEY was not found in ..\\.env"
    )

print("Gemini API key loaded successfully.")


# ============================================================
# GEMINI CLIENT
# ============================================================

client = genai.Client(
    api_key=api_key
)


# ============================================================
# TIMESTAMP
# ============================================================

def get_timestamp(filename):

    match = re.search(
        r"frame_(\d+(?:\.\d+)?)\.jpg",
        filename
    )

    if match:
        return float(match.group(1))

    return None


# ============================================================
# PROMPT
# ============================================================

PROMPT = """
Analyze this lecture frame carefully.

This image comes from an educational lecture video.

Your goal is to extract information useful for generating
accurate study notes.

IMPORTANT RULES:

1. Read visible text as accurately as possible.
2. Identify mathematical equations and notation.
3. Preserve mathematical notation using LaTeX where appropriate.
4. Identify graphs, diagrams, arrows, tables, code, or other
   visual structures.
5. Explain what the visual content represents.
6. Do NOT invent information that is not visible.
7. If handwritten content is unclear, write "unclear".
8. Distinguish between what is directly visible and what is
   an interpretation.
9. Focus only on educationally relevant content.
10. Do not describe irrelevant visual details.

Return ONLY valid JSON in exactly this structure:

{
  "title": "",
  "visible_text": [],
  "mathematical_content": [],
  "diagram": "",
  "explanation": "",
  "important_points": [],
  "uncertain_content": []
}
"""


# ============================================================
# PROCESS ONE IMAGE
# ============================================================

def analyze_image(image_path):

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/jpeg"
            ),
            PROMPT
        ]
    )

    text = response.text.strip()

    # --------------------------------------------------------
    # Remove accidental markdown JSON fences
    # --------------------------------------------------------

    if text.startswith("```json"):
        text = text[7:]

    elif text.startswith("```"):
        text = text[3:]

    if text.endswith("```"):
        text = text[:-3]

    text = text.strip()

    # --------------------------------------------------------
    # Convert response into Python dictionary
    # --------------------------------------------------------

    try:
        return json.loads(text)

    except json.JSONDecodeError:

        return {
            "title": "",
            "visible_text": [],
            "mathematical_content": [],
            "diagram": "",
            "explanation": text,
            "important_points": [],
            "uncertain_content": [
                "Gemini returned non-JSON output."
            ]
        }


# ============================================================
# LOAD EXISTING RESULTS
# ============================================================

if os.path.exists(OUTPUT_FILE):

    with open(
        OUTPUT_FILE,
        "r",
        encoding="utf-8"
    ) as f:

        results = json.load(f)

else:

    results = []


# ============================================================
# ALREADY PROCESSED FRAMES
# ============================================================

processed_frames = {
    item["frame"]
    for item in results
    if "frame" in item
}


# ============================================================
# GET KEYFRAMES
# ============================================================

files = [
    f for f in os.listdir(INPUT_DIR)
    if f.lower().endswith(".jpg")
]

files.sort(
    key=lambda x: (
        get_timestamp(x)
        if get_timestamp(x) is not None
        else float("inf")
    )
)


print()
print("=" * 70)
print("GEMINI KEYFRAME ANALYSIS")
print("=" * 70)

print(f"Keyframes found       : {len(files)}")
print(f"Already processed     : {len(processed_frames)}")
print(
    f"Remaining             : "
    f"{len(files) - len(processed_frames)}"
)

print("=" * 70)


# ============================================================
# PROCESS FRAMES
# ============================================================

for index, filename in enumerate(files, start=1):

    # --------------------------------------------------------
    # Skip already processed frames
    # --------------------------------------------------------

    if filename in processed_frames:

        print(
            f"[{index}/{len(files)}] "
            f"SKIP: {filename}"
        )

        continue


    image_path = os.path.join(
        INPUT_DIR,
        filename
    )

    timestamp = get_timestamp(filename)


    # --------------------------------------------------------
    # Retry Gemini request
    # --------------------------------------------------------

    success = False

    for attempt in range(1, MAX_RETRIES + 1):

        try:

            print()
            print(
                f"[{index}/{len(files)}] "
                f"Analyzing {filename}..."
            )

            analysis = analyze_image(
                image_path
            )

            # ------------------------------------------------
            # Add metadata
            # ------------------------------------------------

            result = {
                "frame": filename,
                "timestamp": timestamp,
                "analysis": analysis
            }

            results.append(result)


            # ------------------------------------------------
            # SAVE IMMEDIATELY
            # ------------------------------------------------

            with open(
                OUTPUT_FILE,
                "w",
                encoding="utf-8"
            ) as f:

                json.dump(
                    results,
                    f,
                    indent=2,
                    ensure_ascii=False
                )


            print(
                f"SUCCESS: {filename}"
            )

            success = True

            break


        except errors.ServerError as e:

            print(
                f"Server error "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

            print(e)

            if attempt < MAX_RETRIES:

                wait_time = 5 * attempt

                print(
                    f"Waiting {wait_time} seconds..."
                )

                time.sleep(wait_time)


        except errors.ClientError as e:

            print(
                f"Client/API error "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

            print(e)

            # ------------------------------------------------
            # 429 = quota/rate limit
            # ------------------------------------------------

            if "429" in str(e):

                print(
                    "Gemini quota/rate limit reached."
                )

                print(
                    "Stopping safely. "
                    "Already processed frames "
                    "have been saved."
                )

                break

            # Other client errors shouldn't be retried
            break


        except Exception as e:

            print(
                f"Unexpected error "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

            print(e)

            if attempt < MAX_RETRIES:

                time.sleep(
                    3 * attempt
                )


    # --------------------------------------------------------
    # Stop if quota error occurred
    # --------------------------------------------------------

    if not success:

        print()
        print("=" * 70)
        print("PROCESSING STOPPED")
        print("=" * 70)

        print(
            f"Processed successfully: "
            f"{len(results)}"
        )

        print(
            f"Results saved to: "
            f"{OUTPUT_FILE}"
        )

        print(
            "Run the script again later "
            "to continue from where it stopped."
        )

        break


    # --------------------------------------------------------
    # Delay between requests
    # --------------------------------------------------------

    time.sleep(
        REQUEST_DELAY
    )


# ============================================================
# FINAL RESULT
# ============================================================

print()
print("=" * 70)
print("GEMINI ANALYSIS COMPLETED")
print("=" * 70)

print(
    f"Total results saved : "
    f"{len(results)}"
)

print(
    f"Output              : "
    f"{OUTPUT_FILE}"
)

print("=" * 70)
