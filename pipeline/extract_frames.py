import cv2
import os

VIDEO_PATH = r"videos\lecture.mp4"
OUTPUT_DIR = r"frames"
INTERVAL = 2

os.makedirs(OUTPUT_DIR, exist_ok=True)

cap = cv2.VideoCapture(VIDEO_PATH)

fps = cap.get(cv2.CAP_PROP_FPS)
frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

duration = frame_count / fps

print("FPS:", fps)
print("Duration:", duration)

current_time = 0

while current_time < duration:

    cap.set(cv2.CAP_PROP_POS_MSEC, current_time * 1000)

    success, frame = cap.read()

    if not success:
        break

    filename = os.path.join(
        OUTPUT_DIR,
        f"frame_{current_time:.2f}.jpg"
    )

    cv2.imwrite(filename, frame)

    print(f"Saved frame at {current_time:.2f}s")

    current_time += INTERVAL

cap.release()

print("Frame extraction completed.")