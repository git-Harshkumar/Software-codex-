"""
generate_pdf.py
===============
Generate a PDF from lecture-notes JSON.

Supports ALL languages including Hindi, Arabic, Japanese, Chinese.

Strategy:
  1. Render notes as a styled HTML document (Google Fonts for Unicode).
  2. Embed keyframe images and LaTeX equations as base64 data URIs.
  3. Use Google Chrome (headless) to convert HTML -> PDF.
     Chrome uses HarfBuzz for text shaping, so every script renders.
  4. If Chrome is not found, save the HTML and open it in the browser.
     Use Ctrl+P -> Save as PDF there.
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import webbrowser
from io import BytesIO
from pathlib import Path

import matplotlib.pyplot as plt
from PIL import Image as PILImage


# ============================================================
# CLI
# ============================================================

def parse_args():

    parser = argparse.ArgumentParser(
        description=(
            "Generate a PDF from a lecture-notes JSON. "
            "Supports all languages via Chrome headless."
        )
    )

    parser.add_argument(
        "--input",
        default="notes.json",
        help="Path to the notes JSON file (default: notes.json).",
    )

    parser.add_argument(
        "--output",
        default=None,
        help=(
            "Path for the output PDF. "
            "Defaults to <input_stem>.pdf in the same folder."
        ),
    )

    parser.add_argument(
        "--keyframe-dir",
        default="keyframes_final",
        help="Folder containing keyframe images (default: keyframes_final).",
    )

    return parser.parse_args()


args = parse_args()

INPUT_FILE = args.input

if args.output:
    OUTPUT_FILE = args.output
else:
    stem = os.path.splitext(os.path.basename(INPUT_FILE))[0]
    out_dir = os.path.dirname(os.path.abspath(INPUT_FILE))
    OUTPUT_FILE = os.path.join(out_dir, f"{stem}.pdf")

KEYFRAME_DIR = args.keyframe_dir


# ============================================================
# LOAD NOTES
# ============================================================

if not os.path.exists(INPUT_FILE):
    raise FileNotFoundError(
        f"\nERROR: {INPUT_FILE} not found.\n"
        "Pass --input <path> to specify a notes JSON file.\n"
    )

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    notes = json.load(f)


# ============================================================
# IMAGE HELPERS
# ============================================================

def image_to_b64(path: str) -> str | None:
    """Read an image file and return a base64 data URI."""
    try:
        with open(path, "rb") as f:
            data = f.read()
        ext = Path(path).suffix.lower().lstrip(".")
        mime = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png"}.get(ext, "png")
        return f"data:image/{mime};base64,{base64.b64encode(data).decode()}"
    except Exception:
        return None


def render_equation_b64(formula: str) -> str | None:
    """
    Render a LaTeX formula using Matplotlib and return
    a base64-encoded PNG data URI.
    """
    formula = formula.strip().strip("$").strip()

    # Normalise
    formula = formula.replace("×", r"\times")
    formula = formula.replace("·", r"\cdot")
    formula = formula.replace("−", "-")

    if formula.startswith(r"\["):
        formula = formula[2:]
    if formula.endswith(r"\]"):
        formula = formula[:-2]

    formula = formula.strip()

    if not formula:
        return None

    try:
        fig = plt.figure(figsize=(8, 0.8))
        fig.patch.set_alpha(0)
        fig.text(
            0.5, 0.5,
            f"${formula}$",
            ha="center", va="center",
            fontsize=14
        )
        buf = BytesIO()
        fig.savefig(
            buf, format="png", dpi=200,
            transparent=True, bbox_inches="tight", pad_inches=0.06
        )
        plt.close(fig)
        buf.seek(0)
        return (
            "data:image/png;base64,"
            + base64.b64encode(buf.read()).decode()
        )
    except Exception as exc:
        print(f"  [WARN] Equation render failed: {formula!r} — {exc}")
        return None


def find_frame(name: str) -> str | None:
    """Locate a keyframe image file."""
    name = os.path.basename(str(name))
    for loc in [os.path.join(KEYFRAME_DIR, name), name]:
        if os.path.exists(loc):
            return loc
    print(f"  [WARN] Frame not found: {name}")
    return None


# ============================================================
# HTML ESCAPE
# ============================================================

def esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# ============================================================
# TEXT → HTML  (inline $math$ → image or italic)
# ============================================================

_SIMPLE_MATH = re.compile(r"^[A-Za-z0-9()\s,+\-*/=]{1,10}$")


def text_to_html(text: str) -> str:
    """
    Convert a plain-text string (possibly containing $math$)
    to HTML. Simple math goes italic inline; complex math
    becomes an <img> rendered by Matplotlib.
    """
    if not text:
        return ""
    text = str(text)

    parts = re.split(r"(\$.*?\$)", text, flags=re.DOTALL)
    out = []

    for part in parts:

        if part.startswith("$") and part.endswith("$") and len(part) > 2:

            formula = part[1:-1].strip()

            if _SIMPLE_MATH.match(formula):
                out.append(f"<i>{esc(formula)}</i>")

            else:
                uri = render_equation_b64(formula)
                if uri:
                    out.append(
                        f'<img class="eq-inline" src="{uri}" '
                        f'alt="{esc(formula)}">'
                    )
                else:
                    out.append(f"<i>{esc(formula)}</i>")

        else:
            out.append(esc(part))

    return "".join(out)


# ============================================================
# CSS
# ============================================================

CSS = """
/* ── Google Fonts: Noto Sans family covers all scripts ── */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,700;1,400&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Arabic:wght@400;700&family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+SC:wght@400;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family:
    'Noto Sans Devanagari',
    'Noto Sans Arabic',
    'Noto Sans JP',
    'Noto Sans SC',
    'Noto Sans',
    Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.65;
  color: #1F2937;
  background: #fff;
}

.page-wrap {
  padding: 18mm 18mm 14mm;
  max-width: 210mm;
  margin: 0 auto;
}

/* ── Title ── */
h1.doc-title {
  font-size: 19pt;
  font-weight: 700;
  text-align: center;
  color: #111827;
  margin-bottom: 7mm;
  line-height: 1.35;
}

/* ── Overview heading ── */
h2.overview-heading {
  font-size: 13pt;
  font-weight: 700;
  color: #1F2937;
  margin-top: 5mm;
  margin-bottom: 2mm;
}

/* ── Section heading ── */
h2.section-heading {
  font-size: 13.5pt;
  font-weight: 700;
  color: #111827;
  margin-top: 8mm;
  margin-bottom: 3mm;
  padding-bottom: 1.5mm;
  border-bottom: 1.5pt solid #D1D5DB;
}

/* ── Subsection ── */
h3.sub {
  font-size: 10.5pt;
  font-weight: 700;
  color: #374151;
  margin-top: 4mm;
  margin-bottom: 2mm;
}

/* ── Body text ── */
p.body-text {
  margin-bottom: 3mm;
  text-align: justify;
}

/* ── Bullet lists ── */
ul.blist {
  margin: 1mm 0 3mm 5mm;
  padding-left: 4mm;
}
ul.blist li {
  margin-bottom: 1.5mm;
}

/* ── Block equations ── */
.eq-block {
  text-align: center;
  margin: 4mm 0;
}
.eq-block img { max-height: 18mm; }

/* ── Inline equations ── */
img.eq-inline {
  max-height: 14mm;
  vertical-align: middle;
  margin: 0 1mm;
}

/* ── Meaning (below equations) ── */
.meaning {
  font-size: 9pt;
  color: #4B5563;
  margin: 0 0 4mm 6mm;
}

/* ── Diagrams ── */
.diagram-wrap {
  text-align: center;
  margin: 5mm 0;
  page-break-inside: avoid;
}
.diagram-wrap img.diagram {
  max-width: 165mm;
  max-height: 90mm;
  display: block;
  margin: 0 auto 2mm;
}
.diagram-caption {
  font-size: 8.5pt;
  color: #6B7280;
}

/* ── Examples ── */
.ex-desc {
  font-weight: 600;
  margin: 3mm 0 1mm;
}

/* ── Page break for final sections ── */
.page-section {
  page-break-before: always;
}

@page {
  margin: 18mm 18mm 14mm;
  @bottom-center {
    content: "Page " counter(page);
    font-family: 'Noto Sans', Arial, sans-serif;
    font-size: 8pt;
    color: #9CA3AF;
  }
}

@media print {
  .page-wrap { padding: 0; }
}
"""


# ============================================================
# HTML BUILDERS
# ============================================================

def build_equations_html(equations: list) -> str:
    if not equations:
        return ""
    parts = ['<h3 class="sub">Mathematical Formulation</h3>']
    for eq in equations:
        if not isinstance(eq, dict):
            continue
        latex = eq.get("latex", "")
        meaning = eq.get("meaning", "")
        if latex:
            uri = render_equation_b64(latex)
            if uri:
                parts.append(
                    f'<div class="eq-block">'
                    f'<img src="{uri}" alt="{esc(latex)}">'
                    f'</div>'
                )
            else:
                parts.append(f'<p class="body-text"><i>{esc(latex)}</i></p>')
        if meaning:
            parts.append(
                f'<p class="meaning">'
                f'<b>Meaning:</b> {text_to_html(meaning)}'
                f'</p>'
            )
    return "\n".join(parts)


def build_diagram_html(diagram: dict) -> str:
    if not isinstance(diagram, dict):
        return ""
    frame_name = diagram.get("frame", "")
    description = diagram.get("description", "")
    explanation = diagram.get("explanation", "")

    path = find_frame(frame_name) if frame_name else None
    uri = image_to_b64(path) if path else None

    parts = ['<div class="diagram-wrap">']
    if uri:
        parts.append(
            f'<img class="diagram" src="{uri}" '
            f'alt="{esc(description)}">'
        )
    if description:
        parts.append(
            f'<p class="diagram-caption">'
            f'<b>Figure:</b> {esc(description)}'
            f'</p>'
        )
    if explanation:
        parts.append(f'<p class="body-text">{text_to_html(explanation)}</p>')
    parts.append('</div>')
    return "\n".join(parts)


def build_examples_html(examples: list) -> str:
    if not examples:
        return ""
    parts = ['<h3 class="sub">Examples</h3>']
    for ex in examples:
        if not isinstance(ex, dict):
            continue
        desc = ex.get("description", "")
        steps = ex.get("steps", [])
        if desc:
            parts.append(f'<p class="ex-desc">{text_to_html(desc)}</p>')
        if steps:
            parts.append('<ul class="blist">')
            for step in steps:
                parts.append(f"<li>{text_to_html(step)}</li>")
            parts.append("</ul>")
    return "\n".join(parts)


def build_html(notes: dict) -> str:
    """Convert the entire notes dict into a complete HTML document."""

    title = notes.get("title", "Lecture Notes")
    overview = notes.get("overview", "")

    body_parts = [
        f'<h1 class="doc-title">{esc(title)}</h1>'
    ]

    if overview:
        body_parts.append('<h2 class="overview-heading">Overview</h2>')
        body_parts.append(f'<p class="body-text">{text_to_html(overview)}</p>')

    # ── Sections ──
    for section in notes.get("sections", []):
        if not isinstance(section, dict):
            continue

        heading = section.get("heading", "")
        explanation = section.get("explanation", "")
        equations = section.get("equations", [])
        diagrams = section.get("diagrams", [])
        examples = section.get("examples", [])
        important_points = section.get("important_points", [])

        if heading:
            body_parts.append(
                f'<h2 class="section-heading">{esc(heading)}</h2>'
            )
        if explanation:
            body_parts.append(
                f'<p class="body-text">{text_to_html(explanation)}</p>'
            )

        eq_html = build_equations_html(equations)
        if eq_html:
            body_parts.append(eq_html)

        if diagrams:
            body_parts.append('<h3 class="sub">Visual Explanation</h3>')
            for d in diagrams:
                body_parts.append(build_diagram_html(d))

        ex_html = build_examples_html(examples)
        if ex_html:
            body_parts.append(ex_html)

        if important_points:
            body_parts.append('<h3 class="sub">Important Points</h3>')
            body_parts.append('<ul class="blist">')
            for pt in important_points:
                body_parts.append(f"<li>{text_to_html(pt)}</li>")
            body_parts.append("</ul>")

    # ── Key takeaways ──
    key_takeaways = notes.get("key_takeaways", [])
    if key_takeaways:
        body_parts.append('<div class="page-section">')
        body_parts.append(
            '<h2 class="section-heading">Key Takeaways</h2>'
        )
        body_parts.append('<ul class="blist">')
        for pt in key_takeaways:
            body_parts.append(f"<li>{text_to_html(pt)}</li>")
        body_parts.append("</ul></div>")

    # ── Exam points ──
    exam_points = notes.get("exam_points", [])
    if exam_points:
        body_parts.append(
            '<h2 class="section-heading">Exam-Focused Points</h2>'
        )
        body_parts.append('<ul class="blist">')
        for pt in exam_points:
            body_parts.append(f"<li>{text_to_html(pt)}</li>")
        body_parts.append("</ul>")

    return f"""<!DOCTYPE html>
<html lang="und">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{esc(title)}</title>
  <style>{CSS}</style>
</head>
<body>
<div class="page-wrap">
{"".join(body_parts)}
</div>
</body>
</html>"""


# ============================================================
# CHROME HEADLESS
# ============================================================

_CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expanduser(
        r"~\AppData\Local\Google\Chrome\Application\chrome.exe"
    ),
    # Edge (Chromium-based, also works)
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
]


def find_chrome() -> str | None:
    for path in _CHROME_PATHS:
        if os.path.isfile(path):
            return path
    return None


def chrome_to_pdf(html_path: str, pdf_path: str, chrome: str) -> bool:
    """Use Chrome headless to convert html_path -> pdf_path."""

    abs_html = os.path.abspath(html_path).replace("\\", "/")
    file_url = f"file:///{abs_html}"

    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--run-all-compositor-stages-before-draw",
        "--no-pdf-header-footer",
        f"--print-to-pdf={os.path.abspath(pdf_path)}",
        file_url,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=90
        )
        return os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0

    except subprocess.TimeoutExpired:
        print("  [WARN] Chrome timed out.")
        return False

    except Exception as exc:
        print(f"  [WARN] Chrome error: {exc}")
        return False


# ============================================================
# MAIN
# ============================================================

print()
print("=" * 65)
print("LECTURE NOTES  —  PDF GENERATOR")
print("=" * 65)
print(f"  Input  : {os.path.abspath(INPUT_FILE)}")
print(f"  Output : {os.path.abspath(OUTPUT_FILE)}")
print()

# ── Build HTML ──────────────────────────────────────────────
print("Rendering HTML...")
html = build_html(notes)

html_path = os.path.splitext(OUTPUT_FILE)[0] + ".html"
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
print(f"  HTML saved → {html_path}")

# ── Chrome → PDF ────────────────────────────────────────────
chrome = find_chrome()

if chrome:
    print(f"\nChrome : {chrome}")
    print("Converting HTML → PDF (this may take ~10s)...")
    ok = chrome_to_pdf(html_path, OUTPUT_FILE, chrome)

    if ok:
        print()
        print("=" * 65)
        print("PDF GENERATED SUCCESSFULLY")
        print("=" * 65)
        print(f"  Output : {os.path.abspath(OUTPUT_FILE)}")
        print("=" * 65)
        sys.exit(0)
    else:
        print("  [WARN] Chrome PDF conversion failed.")
        print("  Trying to open HTML in browser instead...")

# ── Fallback: open HTML in browser ──────────────────────────
abs_html = os.path.abspath(html_path).replace("\\", "/")
file_url = f"file:///{abs_html}"

print()
print("=" * 65)
print("ACTION REQUIRED")
print("=" * 65)
print(f"  Chrome not found or PDF conversion failed.")
print()
print(f"  HTML file: {html_path}")
print()
print("  Steps to generate PDF manually:")
print("    1. Open the HTML file in Chrome or Edge")
print("    2. Press Ctrl+P")
print("    3. Set Destination → Save as PDF")
print("    4. Click Save")
print("=" * 65)

try:
    webbrowser.open(file_url)
    print("\n  Opened in your default browser.")
except Exception:
    pass
