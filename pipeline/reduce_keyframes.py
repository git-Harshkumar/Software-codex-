import cv2
import os
import re
import shutil
from skimage.metrics import structural_similarity as ssim

INPUT_DIR = "keyframes1"
OUTPUT_DIR = "keyframes_final"

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------

# Higher = more similar frames are considered duplicates
SSIM_THRESHOLD = 0.92

# Minimum time between final keyframes
MIN_INTERVAL = 15.0


# ------------------------------------------------------------
# TIMESTAMP
# ------------------------------------------------------------

def get_timestamp(filename):
    match = re.search(
        r"frame_(\d+(?:\.\d+)?)\.jpg",
        filename
    )

    if match:
        return float(match.group(1))

    return float("inf")


# ------------------------------------------------------------
# GET KEYFRAMES
# ------------------------------------------------------------

files = [
    f for f in os.listdir(INPUT_DIR)
    if f.lower().endswith(".jpg")
]

files.sort(key=get_timestamp)

print("=" * 60)
print("SECOND-STAGE KEYFRAME REDUCTION")
print("=" * 60)

print(f"Candidate keyframes : {len(files)}")


# ------------------------------------------------------------
# VARIABLES
# ------------------------------------------------------------

previous = None
last_selected_time = -999999

selected = []


# ------------------------------------------------------------
# PROCESS
# ------------------------------------------------------------

for file in files:

    path = os.path.join(INPUT_DIR, file)

    image = cv2.imread(path)

    if image is None:
        continue

    timestamp = get_timestamp(file)

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    gray = cv2.resize(
        gray,
        (640, 360)
    )

    # --------------------------------------------------------
    # Always keep first frame
    # --------------------------------------------------------

    if previous is None:

        selected.append(file)

        previous = gray
        last_selected_time = timestamp

        print(
            f"KEEP: {file} | first frame"
        )

        continue


    # --------------------------------------------------------
    # Minimum time check
    # --------------------------------------------------------

    if timestamp - last_selected_time < MIN_INTERVAL:
        continue


    # --------------------------------------------------------
    # Compare with previous selected frame
    # --------------------------------------------------------

    score = ssim(
        previous,
        gray
    )


    # --------------------------------------------------------
    # Keep only meaningful visual changes
    # --------------------------------------------------------

    if score < SSIM_THRESHOLD:

        selected.append(file)

        previous = gray
        last_selected_time = timestamp

        print(
            f"KEEP: {file} | "
            f"time={timestamp:.2f}s | "
            f"SSIM={score:.3f}"
        )


# ------------------------------------------------------------
# COPY SELECTED FRAMES
# ------------------------------------------------------------

print()
print("Copying final keyframes...")

for file in selected:

    source = os.path.join(
        INPUT_DIR,
        file
    )

    destination = os.path.join(
        OUTPUT_DIR,
        file
    )

    shutil.copy2(
        source,
        destination
    )


# ------------------------------------------------------------
# RESULT
# ------------------------------------------------------------

print()
print("=" * 60)
print("REDUCTION COMPLETED")
print("=" * 60)

print(f"Candidate frames : {len(files)}")
print(f"Final keyframes  : {len(selected)}")
print(
    f"Removed          : "
    f"{len(files) - len(selected)}"
)

print(f"Output folder    : {OUTPUT_DIR}")
print("=" * 60)