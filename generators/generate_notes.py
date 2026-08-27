import json
import os
import re

from google import genai


# ============================================================
# CONFIG
# ============================================================

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set."
    )


client = genai.Client(
    api_key=API_KEY
)

MODEL = "gemini-3.5-flash"

TRANSCRIPT_FILE = "clean_transcript.json"
VISUAL_FILE = "visual_analysis.json"
OUTPUT_FILE = "notes3.json"


# ============================================================
# LOAD JSON
# ============================================================

def load_json(path):

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"File not found: {path}"
        )

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as f:

        return json.load(f)


transcript = load_json(
    TRANSCRIPT_FILE
)

visual_analysis = load_json(
    VISUAL_FILE
)


# ============================================================
# TRANSCRIPT
# ============================================================

def transcript_to_text(data):

    lines = []

    if not isinstance(data, list):
        return ""

    for segment in data:

        if not isinstance(segment, dict):
            continue

        text = segment.get(
            "text",
            ""
        )

        start = segment.get(
            "start",
            0
        )

        end = segment.get(
            "end",
            0
        )

        if text:

            lines.append(
                f"[{start:.2f}s - {end:.2f}s] {text}"
            )

    return "\n".join(lines)


transcript_text = transcript_to_text(
    transcript
)


# ============================================================
# NORMALIZE VISUAL ANALYSIS
# ============================================================

def get_visual_items(data):

    if isinstance(data, list):

        return data


    if isinstance(data, dict):

        if isinstance(
            data.get("results"),
            list
        ):

            return data["results"]


        if isinstance(
            data.get("frames"),
            list
        ):

            return data["frames"]


    return []


visual_items = get_visual_items(
    visual_analysis
)


# ============================================================
# CREATE VISUAL TEXT
# ============================================================

def visual_to_text(items):

    blocks = []

    for item in items:

        if not isinstance(item, dict):
            continue


        # ----------------------------------------------------
        # IMPORTANT:
        # Preserve exact frame filename
        # ----------------------------------------------------

        frame = item.get(
            "frame",
            item.get(
                "filename",
                item.get(
                    "image",
                    ""
                )
            )
        )


        if not frame:
            continue


        frame = os.path.basename(
            str(frame)
        )


        title = item.get(
            "title",
            ""
        )


        visible_text = item.get(
            "visible_text",
            ""
        )


        mathematical = item.get(
            "mathematical_content",
            ""
        )


        diagram = item.get(
            "diagram",
            item.get(
                "diagrams",
                ""
            )
        )


        explanation = item.get(
            "explanation",
            ""
        )


        important = item.get(
            "important_points",
            ""
        )


        block = f"""
============================================================
FRAME: {frame}
============================================================

TITLE:
{title}

VISIBLE TEXT:
{visible_text}

MATHEMATICAL CONTENT:
{mathematical}

DIAGRAM:
{diagram}

EXPLANATION:
{explanation}

IMPORTANT POINTS:
{important}
"""


        blocks.append(
            block
        )


    return "\n".join(
        blocks
    )


visual_text = visual_to_text(
    visual_items
)


# ============================================================
# AVAILABLE FRAMES
# ============================================================

available_frames = []


for item in visual_items:

    if not isinstance(item, dict):
        continue


    frame = item.get(
        "frame",
        item.get(
            "filename",
            item.get(
                "image",
                ""
            )
        )
    )


    if frame:

        available_frames.append(
            os.path.basename(
                str(frame)
            )
        )


available_frames = sorted(
    list(
        set(
            available_frames
        )
    )
)


print()
print(
    "=" * 65
)
print(
    "VISUAL FRAMES AVAILABLE TO GEMINI:",
    len(available_frames)
)
print(
    "=" * 65
)


for frame in available_frames:

    print(
        frame
    )


# ============================================================
# PROMPT
# ============================================================

prompt = f"""
You are an expert lecture-note generator.

Create detailed, accurate study notes from the lecture transcript
and visual frame analysis.

The output will be converted into a PDF.

============================================================
IMPORTANT DIAGRAM RULE
============================================================

The visual analysis contains actual lecture frames.

Every visual-analysis block starts with:

FRAME: filename.jpg

When a graph, diagram, table, important slide, visual example,
or handwritten derivation is relevant to a section, associate
that exact frame with that section.

YOU MUST PRESERVE THE FRAME FILENAME.

For example, if the visual analysis says:

FRAME: frame_274.00.jpg

then your output must use exactly:

"frame": "frame_274.00.jpg"

Do NOT rename it.

Do NOT invent another filename.

Do NOT remove the frame field.

============================================================
DIAGRAM PLACEMENT
============================================================

A diagram must be placed in the section where the topic is
actually discussed.

For example:

Section:
"Fundamentals of Graphs"

Diagram:
"Undirected and Directed Graphs"

Then the diagram should be inside that section.

Do NOT create one global diagram section.

============================================================
IMPORTANT
============================================================

Only use frames that actually appear in the visual analysis.

Available frames:

{json.dumps(available_frames, indent=2)}

============================================================
MATHEMATICS
============================================================

All mathematical content must be returned in LaTeX.

Examples:

G = (V,E)

should be:

"G = (V,E)"

and:

V = {{a,b,c,d}}

should be returned as:

"V = \\\\{{a,b,c,d\\\\}}"

Do not replace mathematical notation with plain prose.

============================================================
OUTPUT FORMAT
============================================================

Return ONLY valid JSON.

Use exactly this structure:

{{
  "title": "...",

  "overview": "...",

  "sections": [

    {{
      "heading": "...",

      "explanation": "...",

      "equations": [

        {{
          "latex": "...",
          "meaning": "..."
        }}

      ],

      "examples": [

        {{
          "description": "...",
          "steps": [
            "..."
          ]
        }}

      ],

      "diagrams": [

        {{
          "frame": "EXACT_FRAME_FILENAME.jpg",
          "description": "...",
          "explanation": "..."
        }}

      ],

      "important_points": [
        "..."
      ]

    }}

  ],

  "key_takeaways": [
    "..."
  ],

  "exam_points": [
    "..."
  ]
}}

============================================================
DIAGRAM RULES
============================================================

1. Use an empty array if no useful diagram exists:

   "diagrams": []

2. If a diagram exists, include its exact frame.

3. The frame MUST come from the visual analysis.

4. Never invent a frame filename.

5. Do not remove the frame field.

6. A frame can only be assigned if it is actually relevant
   to the section.

7. Keep the diagram description and explanation from the
   visual analysis accurate.

8. Do not put every diagram into the first section.

============================================================
LECTURE TRANSCRIPT
============================================================

{transcript_text}

============================================================
VISUAL FRAME ANALYSIS
============================================================

{visual_text}

============================================================

Return JSON only.
"""


# ============================================================
# GEMINI
# ============================================================

print()
print(
    "=" * 65
)
print(
    "GENERATING STRUCTURED LECTURE NOTES"
)
print(
    "=" * 65
)
print()


response = client.models.generate_content(

    model=MODEL,

    contents=prompt

)


result_text = response.text.strip()


# ============================================================
# REMOVE MARKDOWN CODE BLOCK
# ============================================================

result_text = re.sub(

    r"^```json\s*",

    "",

    result_text,

    flags=re.IGNORECASE

)


result_text = re.sub(

    r"\s*```$",

    "",

    result_text

)


# ============================================================
# PARSE JSON
# ============================================================

try:

    notes = json.loads(
        result_text
    )

except json.JSONDecodeError as e:

    print()
    print(
        "ERROR: Gemini returned invalid JSON."
    )

    print()
    print(
        result_text
    )

    raise e


# ============================================================
# VALIDATE / REPAIR DIAGRAM FRAME REFERENCES
# ============================================================

valid_frames = set(
    available_frames
)


diagram_count = 0

repaired_count = 0


for section in notes.get(
    "sections",
    []
):

    if not isinstance(
        section,
        dict
    ):

        continue


    diagrams = section.get(
        "diagrams",
        []
    )


    if not isinstance(
        diagrams,
        list
    ):

        section["diagrams"] = []

        continue


    cleaned_diagrams = []


    for diagram in diagrams:

        if not isinstance(
            diagram,
            dict
        ):

            continue


        frame = diagram.get(
            "frame",
            ""
        )


        # ----------------------------------------------------
        # If Gemini provided a valid frame
        # ----------------------------------------------------

        if frame:

            frame = os.path.basename(
                str(frame)
            )


        if frame in valid_frames:

            diagram["frame"] = frame

            cleaned_diagrams.append(
                diagram
            )

            diagram_count += 1

            continue


        # ----------------------------------------------------
        # Gemini forgot the frame.
        #
        # We don't invent one here.
        # ----------------------------------------------------

        if not frame:

            print(
                "[WARNING] Diagram has no frame in section:",
                section.get(
                    "heading",
                    "Unknown"
                )
            )

        else:

            print(
                "[WARNING] Invalid frame:",
                frame
            )


    section["diagrams"] = cleaned_diagrams


# ============================================================
# SAVE
# ============================================================

with open(

    OUTPUT_FILE,

    "w",

    encoding="utf-8"

) as f:

    json.dump(

        notes,

        f,

        indent=2,

        ensure_ascii=False

    )


# ============================================================
# FINAL REPORT
# ============================================================

print()
print(
    "=" * 65
)
print(
    "NOTES GENERATED SUCCESSFULLY"
)
print(
    "=" * 65
)

print(
    "Output:",
    os.path.abspath(
        OUTPUT_FILE
    )
)

print(
    "Sections:",
    len(
        notes.get(
            "sections",
            []
        )
    )
)

print(
    "Valid diagrams assigned:",
    diagram_count
)

print(
    "Available visual frames:",
    len(
        available_frames
    )
)

print(
    "=" * 65
)