import os
import re
import cv2
import pytesseract
import json

# ============================================================
# CONFIG
# ============================================================

INPUT_DIR = "keyframes1"
OUTPUT_DIR = "ocr"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# If Tesseract is not in PATH, use this:
pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
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
# OCR PREPROCESSING
# ============================================================

def preprocess_image(image):

    # Upscale image
    image = cv2.resize(
        image,
        None,
        fx=2,
        fy=2,
        interpolation=cv2.INTER_CUBIC
    )

    # Convert to grayscale
    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    # Reduce noise
    gray = cv2.GaussianBlur(
        gray,
        (3, 3),
        0
    )

    # Adaptive threshold
    thresh = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        8
    )

    return thresh


# ============================================================
# GET KEYFRAMES
# ============================================================

files = [
    f for f in os.listdir(INPUT_DIR)
    if f.lower().endswith(".jpg")
]

files.sort(
    key=lambda x: get_timestamp(x) or float("inf")
)


print("=" * 60)
print("OCR PROCESSING")
print("=" * 60)

print(f"Keyframes found: {len(files)}")


# ============================================================
# STORE ALL OCR RESULTS
# ============================================================

all_results = []


# ============================================================
# PROCESS EACH KEYFRAME
# ============================================================

for index, file in enumerate(files, start=1):

    path = os.path.join(
        INPUT_DIR,
        file
    )

    image = cv2.imread(path)

    if image is None:
        continue

    timestamp = get_timestamp(file)

    # --------------------------------------------------------
    # PREPROCESS
    # --------------------------------------------------------

    processed = preprocess_image(image)

    # --------------------------------------------------------
    # OCR
    # --------------------------------------------------------

    text = pytesseract.image_to_string(
        processed,
        config="--psm 6"
    )

    text = text.strip()

    # --------------------------------------------------------
    # SAVE INDIVIDUAL OCR
    # --------------------------------------------------------

    txt_name = os.path.splitext(file)[0] + ".txt"

    txt_path = os.path.join(
        OUTPUT_DIR,
        txt_name
    )

    with open(
        txt_path,
        "w",
        encoding="utf-8"
    ) as f:

        f.write(text)

    # --------------------------------------------------------
    # STORE JSON RESULT
    # --------------------------------------------------------

    all_results.append({
        "frame": file,
        "timestamp": timestamp,
        "text": text
    })

    print(
        f"[{index}/{len(files)}] "
        f"{file} → OCR completed"
    )


# ============================================================
# SAVE COMBINED JSON
# ============================================================

with open(
    "ocr_results.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        all_results,
        f,
        indent=2,
        ensure_ascii=False
    )


# ============================================================
# DONE
# ============================================================

print()
print("=" * 60)
print("OCR COMPLETED")
print("=" * 60)

print(f"Processed : {len(all_results)} frames")
print("Output    : ocr/")
print("JSON      : ocr_results.json")