import json
import os
import re


# ============================================================
# FILES
# ============================================================

NOTES_FILE = "notes.json"
VISUAL_FILE = "visual_analysis.json"
OUTPUT_FILE = "linked_notes.json"


# ============================================================
# LOAD JSON
# ============================================================

with open(
    NOTES_FILE,
    "r",
    encoding="utf-8"
) as f:

    notes = json.load(f)


with open(
    VISUAL_FILE,
    "r",
    encoding="utf-8"
) as f:

    visual_data = json.load(f)


# ============================================================
# GET VISUAL ITEMS
# ============================================================

if isinstance(visual_data, list):

    visual_items = visual_data

elif isinstance(visual_data, dict):

    visual_items = visual_data.get(
        "results",
        visual_data.get(
            "frames",
            []
        )
    )

else:

    visual_items = []


print()
print("=" * 70)
print("LINKING DIAGRAMS TO KEYFRAMES")
print("=" * 70)
print()

print(
    "Visual frames found:",
    len(visual_items)
)


# ============================================================
# NORMALIZE TEXT
# ============================================================

def normalize(text):

    if text is None:
        return ""

    text = str(text).lower()

    # Remove latex symbols
    text = text.replace(
        "\\",
        " "
    )

    # Remove punctuation
    text = re.sub(
        r"[^a-z0-9\s]",
        " ",
        text
    )

    # Normalize spaces
    text = re.sub(
        r"\s+",
        " ",
        text
    ).strip()

    return text


# ============================================================
# EXTRACT VISUAL INFORMATION
# ============================================================

visual_frames = []


for item in visual_items:

    if not isinstance(
        item,
        dict
    ):
        continue


    frame = item.get(
        "frame",
        ""
    )


    if not frame:
        continue


    frame = os.path.basename(
        str(frame)
    )


    analysis = item.get(
        "analysis",
        {}
    )


    if not isinstance(
        analysis,
        dict
    ):

        analysis = {}


    title = analysis.get(
        "title",
        ""
    )


    visible_text = analysis.get(
        "visible_text",
        []
    )


    mathematical_content = analysis.get(
        "mathematical_content",
        []
    )


    diagram = analysis.get(
        "diagram",
        ""
    )


    explanation = analysis.get(
        "explanation",
        ""
    )


    important_points = analysis.get(
        "important_points",
        []
    )


    # --------------------------------------------------------
    # Convert lists to strings
    # --------------------------------------------------------

    if isinstance(
        visible_text,
        list
    ):

        visible_text = " ".join(
            str(x)
            for x in visible_text
        )


    if isinstance(
        mathematical_content,
        list
    ):

        mathematical_content = " ".join(
            str(x)
            for x in mathematical_content
        )


    if isinstance(
        important_points,
        list
    ):

        important_points = " ".join(
            str(x)
            for x in important_points
        )


    combined = " ".join([

        str(title),

        str(visible_text),

        str(mathematical_content),

        str(diagram),

        str(explanation),

        str(important_points)

    ])


    visual_frames.append({

        "frame": frame,

        "title": title,

        "diagram": diagram,

        "explanation": explanation,

        "text": combined,

        "normalized": normalize(
            combined
        )

    })


print(
    "Usable visual frames:",
    len(visual_frames)
)


# ============================================================
# KEYWORD EXTRACTION
# ============================================================

STOP_WORDS = {

    "the",
    "and",
    "or",
    "of",
    "to",
    "a",
    "an",
    "is",
    "are",
    "in",
    "on",
    "for",
    "with",
    "from",
    "this",
    "that",
    "shows",
    "show",
    "graph",
    "diagram",
    "figure",
    "lecture",
    "concept"

}


def keywords(text):

    text = normalize(
        text
    )

    words = text.split()

    result = []

    for word in words:

        if len(word) < 3:
            continue

        if word in STOP_WORDS:
            continue

        result.append(
            word
        )

    return set(
        result
    )


# ============================================================
# MATCH SCORE
# ============================================================

def similarity_score(

    description,

    explanation,

    visual

):

    note_text = " ".join([

        str(description),

        str(explanation)

    ])


    note_words = keywords(
        note_text
    )


    visual_words = keywords(
        visual["text"]
    )


    if not note_words:
        return 0


    common = (
        note_words
        &
        visual_words
    )


    score = len(
        common
    )


    # --------------------------------------------------------
    # Bonus for exact title/important concepts
    # --------------------------------------------------------

    note_normalized = normalize(
        note_text
    )

    visual_normalized = visual[
        "normalized"
    ]


    # --------------------------------------------------------
    # Strong phrase matches
    # --------------------------------------------------------

    important_phrases = [

        "undirected",

        "directed",

        "graph search",

        "configuration graph",

        "pocket cube",

        "breadth first",

        "backward search",

        "state space",

        "reachability",

        "garbage collection",

        "model checking"

    ]


    for phrase in important_phrases:

        if phrase in note_normalized:

            if phrase in visual_normalized:

                score += 8


    return score


# ============================================================
# MANUAL HIGH-CONFIDENCE MAPPINGS
# ============================================================

# These are useful for known lecture visuals.
#
# Your frame_274 image was explicitly verified:
#
# "Undirected and Directed Graphs"
#
# Therefore we can safely force this association.

MANUAL_MAPPINGS = {

    "undirected directed": "frame_274.00.jpg",

    "undirected and directed graphs":
        "frame_274.00.jpg"

}


# ============================================================
# PROCESS SECTIONS
# ============================================================

total_diagrams = 0

linked_diagrams = 0


for section in notes.get(
    "sections",
    []
):

    if not isinstance(
        section,
        dict
    ):
        continue


    heading = section.get(
        "heading",
        ""
    )


    section_text = " ".join([

        str(heading),

        str(
            section.get(
                "explanation",
                ""
            )
        )

    ])


    print()
    print(
        "SECTION:",
        heading
    )


    diagrams = section.get(
        "diagrams",
        []
    )


    if not isinstance(
        diagrams,
        list
    ):

        continue


    for diagram in diagrams:

        if not isinstance(
            diagram,
            dict
        ):
            continue


        total_diagrams += 1


        # ====================================================
        # Already has frame
        # ====================================================

        existing_frame = diagram.get(
            "frame",
            ""
        )


        if existing_frame:

            print(
                "  Already linked:",
                existing_frame
            )

            linked_diagrams += 1

            continue


        description = diagram.get(
            "description",
            ""
        )


        explanation = diagram.get(
            "explanation",
            ""
        )


        diagram_text = " ".join([

            str(heading),

            str(description),

            str(explanation)

        ])


        normalized_diagram = normalize(
            diagram_text
        )


        # ====================================================
        # MANUAL HIGH-CONFIDENCE CHECK
        # ====================================================

        selected_frame = None


        if (

            "undirected"

            in normalized_diagram

            and

            "directed"

            in normalized_diagram

        ):

            # We verified this frame manually.
            selected_frame = (
                "frame_274.00.jpg"
            )


            print(
                "  HIGH-CONFIDENCE MATCH:"
            )

            print(
                "  ",
                selected_frame
            )


        # ====================================================
        # AUTOMATIC MATCH
        # ====================================================

        if selected_frame is None:

            best_score = 0

            best_visual = None


            for visual in visual_frames:

                score = similarity_score(

                    description,

                    explanation,

                    visual

                )


                if score > best_score:

                    best_score = score

                    best_visual = visual


            # ------------------------------------------------
            # Only accept reasonably strong matches
            # ------------------------------------------------

            if (

                best_visual is not None

                and

                best_score >= 3

            ):

                selected_frame = (
                    best_visual["frame"]
                )


                print(
                    "  Automatic match:",
                    selected_frame
                )

                print(
                    "  Score:",
                    best_score
                )


        # ====================================================
        # ASSIGN FRAME
        # ====================================================

        if selected_frame:

            diagram["frame"] = (
                selected_frame
            )

            linked_diagrams += 1

        else:

            print(
                "  WARNING: No confident frame found."
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

        notes,

        f,

        indent=2,

        ensure_ascii=False

    )


# ============================================================
# REPORT
# ============================================================

print()
print("=" * 70)
print("DIAGRAM LINKING COMPLETED")
print("=" * 70)

print(
    "Total diagrams:",
    total_diagrams
)

print(
    "Linked diagrams:",
    linked_diagrams
)

print(
    "Unlinked diagrams:",
    total_diagrams - linked_diagrams
)

print(
    "Updated:",
    os.path.abspath(
        OUTPUT_FILE
    )
)

print("=" * 70)