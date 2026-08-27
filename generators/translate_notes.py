"""
translate_notes.py
==================
Translate a lecture-notes JSON into one or more target languages.

Usage
-----
    python translate_notes.py --lang Hindi Spanish French
    python translate_notes.py --input notes3.json --lang Japanese Chinese
    python translate_notes.py --lang Hindi --output-dir translations/

Rules
-----
- Frame filenames are NEVER translated.
- LaTeX equations (the "latex" field) are NEVER translated.
- All other text fields are translated.
- The JSON structure is preserved exactly.
"""

import argparse
import json
import os
import re
import sys

from google import genai


# ============================================================
# SUPPORTED LANGUAGES (default list shown in --help)
# ============================================================

SUPPORTED_LANGUAGES = [
    "Hindi",
    "Spanish",
    "French",
    "German",
    "Japanese",
    "Chinese (Simplified)",
    "Arabic",
]


# ============================================================
# API
# ============================================================

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. "
        "Export it or add it to your .env file."
    )

client = genai.Client(api_key=API_KEY)

MODEL = "gemini-2.5-flash"


# ============================================================
# CLI
# ============================================================

def parse_args():

    parser = argparse.ArgumentParser(
        description=(
            "Translate lecture notes JSON into one or more languages "
            "using Gemini. Frame filenames and LaTeX equations are "
            "preserved verbatim."
        )
    )

    parser.add_argument(
        "--input",
        default="notes.json",
        help="Path to the source notes JSON file (default: notes.json).",
    )

    parser.add_argument(
        "--lang",
        nargs="+",
        default=["Hindi"],
        metavar="LANGUAGE",
        help=(
            "One or more target languages. "
            "Supported: Hindi, Spanish, French, German, "
            "Japanese, Chinese (Simplified), Arabic. "
            "You can pass any language name."
        ),
    )

    parser.add_argument(
        "--output-dir",
        default=".",
        help=(
            "Directory where translated JSON files are saved "
            "(default: current directory)."
        ),
    )

    parser.add_argument(
        "--model",
        default=MODEL,
        help=f"Gemini model to use (default: {MODEL}).",
    )

    return parser.parse_args()


# ============================================================
# LOAD / SAVE JSON
# ============================================================

def load_json(path: str) -> dict:

    if not os.path.exists(path):
        raise FileNotFoundError(f"Input file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(data: dict, path: str) -> None:

    os.makedirs(
        os.path.dirname(os.path.abspath(path)),
        exist_ok=True
    )

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  Saved -> {os.path.abspath(path)}")


# ============================================================
# OUTPUT FILENAME
# ============================================================

def output_path(
    output_dir: str,
    language: str,
    source_stem: str = "notes"
) -> str:

    lang_slug = language.replace(" ", "_")
    filename = f"{source_stem}_{lang_slug}.json"
    return os.path.join(output_dir, filename)


# ============================================================
# TRANSLATION PROMPT
# ============================================================

TRANSLATE_PROMPT = """\
You are a precise, expert technical translator.

Your task: Translate the following lecture-notes JSON from English into {language}.

=== STRICT RULES ===

1. PRESERVE JSON STRUCTURE EXACTLY.
   - Return only valid JSON.
   - Do NOT add, remove, or rename any keys.
   - Do NOT wrap the output in markdown code fences.

2. NEVER TRANSLATE these fields - copy them verbatim:
   - "frame"       (filenames like "frame_116.00.jpg")
   - "latex"       (LaTeX math like "G = (V, E)")

3. TRANSLATE all other string values, including:
   - "title"
   - "overview"
   - "heading"
   - "explanation"
   - "meaning"
   - "description"
   - "important_points" (array of strings)
   - "key_takeaways"    (array of strings)
   - "exam_points"      (array of strings)
   - "steps"            (array of strings inside examples)

4. Inside text fields, if a LaTeX expression appears inline
   (surrounded by $ ... $), KEEP the LaTeX verbatim; translate
   only the surrounding natural-language text.

5. Use natural, fluent {language} appropriate for university students.

6. Do NOT add translation notes, footnotes, or commentary.

=== SOURCE JSON ===

{json_content}

=== OUTPUT ===

Return only the translated JSON. No markdown. No preamble.
"""


# ============================================================
# TRANSLATE
# ============================================================

def translate_notes(
    notes: dict,
    language: str,
    model: str
) -> dict:

    json_content = json.dumps(notes, indent=2, ensure_ascii=False)

    prompt = TRANSLATE_PROMPT.format(
        language=language,
        json_content=json_content
    )

    print(f"  Calling Gemini ({model}) for language: {language} ...")

    response = client.models.generate_content(
        model=model,
        contents=prompt
    )

    result_text = response.text.strip()

    # Remove accidental markdown code fences
    result_text = re.sub(
        r"^```(?:json)?\s*",
        "",
        result_text,
        flags=re.IGNORECASE
    )

    result_text = re.sub(r"\s*```$", "", result_text)

    try:
        translated = json.loads(result_text)

    except json.JSONDecodeError as exc:
        print()
        print(f"[ERROR] Gemini returned invalid JSON for language: {language}")
        print()
        print(result_text[:2000])
        raise exc

    return translated


# ============================================================
# HELPERS: collect field values
# ============================================================

def collect_values(obj, key):
    items = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key and isinstance(v, str):
                items.append(v)
            else:
                items.extend(collect_values(v, key))
    elif isinstance(obj, list):
        for item in obj:
            items.extend(collect_values(item, key))
    return items


# ============================================================
# VALIDATE: frame filenames preserved
# ============================================================

def validate_frames(original: dict, translated: dict, language: str) -> None:

    orig_frames = collect_values(original, "frame")
    trans_frames = collect_values(translated, "frame")

    if orig_frames != trans_frames:
        print(
            f"  [WARNING] Frame filenames changed during "
            f"translation to {language}!"
        )
        for o, t in zip(orig_frames, trans_frames):
            if o != t:
                print(f"    Original  : {o}")
                print(f"    Translated: {t}")
    else:
        print(
            f"  OK - All {len(orig_frames)} frame filename(s) preserved."
        )


# ============================================================
# VALIDATE: latex fields preserved
# ============================================================

def validate_latex(original: dict, translated: dict, language: str) -> None:

    orig_latex = collect_values(original, "latex")
    trans_latex = collect_values(translated, "latex")

    changed = 0

    for o, t in zip(orig_latex, trans_latex):
        if o.strip() != t.strip():
            changed += 1
            print(
                f"  [WARNING] LaTeX changed during {language} translation:"
            )
            print(f"    Original  : {o}")
            print(f"    Translated: {t}")

    if changed == 0:
        print(
            f"  OK - All {len(orig_latex)} LaTeX equation(s) preserved."
        )


# ============================================================
# MAIN
# ============================================================

def main():

    args = parse_args()

    print()
    print("=" * 65)
    print("MULTILINGUAL NOTES TRANSLATOR")
    print("=" * 65)
    print()

    print(f"Input   : {os.path.abspath(args.input)}")

    notes = load_json(args.input)

    source_stem = os.path.splitext(os.path.basename(args.input))[0]

    print(f"Sections: {len(notes.get('sections', []))}")
    print(f"Languages: {', '.join(args.lang)}")
    print()

    results = {}

    for language in args.lang:

        print("-" * 65)
        print(f"Language: {language}")
        print("-" * 65)

        try:

            translated = translate_notes(notes, language, args.model)

            validate_frames(notes, translated, language)
            validate_latex(notes, translated, language)

            out = output_path(args.output_dir, language, source_stem)

            save_json(translated, out)

            results[language] = {"status": "ok", "output": out}

        except Exception as exc:
            print(f"  [FAILED] {language}: {exc}")
            results[language] = {"status": "failed", "error": str(exc)}

        print()

    # --------------------------------------------------------
    # Final report
    # --------------------------------------------------------

    print("=" * 65)
    print("TRANSLATION SUMMARY")
    print("=" * 65)

    ok_count = 0
    fail_count = 0

    for lang, info in results.items():
        status = info["status"]
        if status == "ok":
            ok_count += 1
            print(f"  OK  {lang:30s} -> {info['output']}")
        else:
            fail_count += 1
            print(f"  FAIL {lang:30s}  FAILED: {info['error']}")

    print()
    print(f"  Completed: {ok_count} / {len(args.lang)} language(s).")
    print("=" * 65)
    print()

    if fail_count:
        sys.exit(1)


if __name__ == "__main__":
    main()
