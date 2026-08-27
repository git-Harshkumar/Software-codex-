import cv2
import os
import re
from skimage.metrics import structural_similarity as ssim

# ============================================================
# CONFIG
# ============================================================

INPUT_DIR = "frames"
OUTPUT_DIR = "keyframes1"

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# EXTRACT TIMESTAMP FROM FILENAME
# ============================================================

def get_timestamp(filename):
    match = re.search(
        r"frame_(\d+(?:\.\d+)?)\.jpg",
        filename
    )

    if match:
        return float(match.group(1))

    return float("inf")


# ============================================================
# GET ALL FRAMES
# ============================================================

files = [
    f for f in os.listdir(INPUT_DIR)
    if f.lower().endswith(".jpg")
]

files.sort(key=get_timestamp)

print(f"Total frames found: {len(files)}")


# ============================================================
# SETTINGS
# ============================================================

# Higher = LESS sensitive
# Lower  = MORE sensitive
#
# 0.85 -> too sensitive for your lecture
# 0.90 -> moderate
# 0.93 -> good starting point
# 0.95 -> fewer keyframes
# 0.97 -> very few keyframes

# Higher = LESS sensitive
# Lower  = MORE sensitive
THRESHOLD = 0.65
MIN_INTERVAL = 10.0


# ============================================================
# VARIABLES
# ============================================================

previous = None
last_keyframe_time = -999999

keyframe_count = 0


# ============================================================
# PROCESS FRAMES
# ============================================================

for file in files:

    path = os.path.join(INPUT_DIR, file)

    image = cv2.imread(path)

    if image is None:
        continue

    # --------------------------------------------------------
    # Timestamp
    # --------------------------------------------------------

    current_time = get_timestamp(file)

    # --------------------------------------------------------
    # Convert to grayscale
    # --------------------------------------------------------

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    # --------------------------------------------------------
    # Resize for faster SSIM
    # --------------------------------------------------------

    gray = cv2.resize(
        gray,
        (640, 360)
    )

    # --------------------------------------------------------
    # First frame
    # --------------------------------------------------------

    if previous is None:

        output_path = os.path.join(
            OUTPUT_DIR,
            file
        )

        cv2.imwrite(
            output_path,
            image
        )

        previous = gray

        last_keyframe_time = current_time

        keyframe_count += 1

        print(
            f"KEYFRAME: {file} | first frame"
        )

        continue

    # --------------------------------------------------------
    # Calculate SSIM
    # --------------------------------------------------------

    score = ssim(
        previous,
        gray
    )

    # --------------------------------------------------------
    # Check minimum time interval
    # --------------------------------------------------------

    enough_time_passed = (
        current_time - last_keyframe_time
        >= MIN_INTERVAL
    )

    # --------------------------------------------------------
    # Detect significant visual change
    # --------------------------------------------------------

    if score < THRESHOLD and enough_time_passed:

        output_path = os.path.join(
            OUTPUT_DIR,
            file
        )

        cv2.imwrite(
            output_path,
            image
        )

        previous = gray

        last_keyframe_time = current_time

        keyframe_count += 1

        print(
            f"KEYFRAME: {file} "
            f"| time={current_time:.2f}s "
            f"| similarity={score:.3f}"
        )


# ============================================================
# RESULT
# ============================================================

print()
print("================================")
print("Keyframe extraction completed")
print("================================")

print(
    f"Original frames : {len(files)}"
)

print(
    f"Keyframes       : {keyframe_count}"
)

print(
    f"Removed         : "
    f"{len(files) - keyframe_count}"
)