"""
generate_notes_v2.py
====================
AI Lecture Note Generator — structured, multi-level, multilingual.

Usage
-----
    # Level 1 overview in English
    python generate_notes_v2.py --level 1

    # Level 2 summary in Hindi with exam focus
    python generate_notes_v2.py --level 2 --lang Hindi --exam

    # Level 3 detailed notes in Hinglish with examples + formulas
    python generate_notes_v2.py --level 3 --lang Hinglish --examples --formulas

    # Custom transcript file and output
    python generate_notes_v2.py --level 2 --transcript clean_transcript.json --output notes_summary.md

    # Also generate PDF
    python generate_notes_v2.py --level 3 --pdf
"""

import argparse
import json
import os
import re
import sys


# ============================================================
# LOAD .env
# ============================================================

def _load_dotenv(path: str = ".env") -> None:
    env_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), path
    )
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()


# ============================================================
# CLI
# ============================================================

LEVEL_NAMES = {
    "1": "OVERVIEW",
    "2": "SUMMARY",
    "3": "DETAILED NOTES",
    "overview":  "OVERVIEW",
    "summary":   "SUMMARY",
    "detailed":  "DETAILED NOTES",
}

LANG_NAMES = {
    "english":  "ENGLISH",
    "hindi":    "HINDI",
    "hinglish": "HINGLISH",
    "en":       "ENGLISH",
    "hi":       "HINDI",
}


def parse_args():

    parser = argparse.ArgumentParser(
        description=(
            "Generate structured lecture notes from a transcript "
            "using Gemini. Supports 3 note levels and 3 languages."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Note Levels:
  1 / overview   — Quick overview (2-5 min read)
  2 / summary    — Revision summary (5-15 min read)
  3 / detailed   — Full detailed notes

Languages:
  English / Hindi / Hinglish

Examples:
  python generate_notes_v2.py --level 1
  python generate_notes_v2.py --level 2 --lang Hindi --exam
  python generate_notes_v2.py --level 3 --lang Hinglish --examples --formulas --pdf
        """
    )

    parser.add_argument(
        "--level",
        default="2",
        choices=["1", "2", "3", "overview", "summary", "detailed"],
        help="Note depth level (default: 2 / summary).",
    )

    parser.add_argument(
        "--lang",
        default="English",
        metavar="LANGUAGE",
        help="Output language: English, Hindi, Hinglish (default: English).",
    )

    parser.add_argument(
        "--examples",
        action="store_true",
        help="Include examples from the lecture.",
    )

    parser.add_argument(
        "--formulas",
        action="store_true",
        help="Include mathematical formulas.",
    )

    parser.add_argument(
        "--exam",
        action="store_true",
        help="Add an Exam-Focused Points section.",
    )

    parser.add_argument(
        "--transcript",
        default="clean_transcript.json",
        help="Transcript JSON file (default: clean_transcript.json).",
    )

    parser.add_argument(
        "--output",
        default=None,
        help=(
            "Output markdown file. "
            "Defaults to notes_level<N>_<lang>.md"
        ),
    )

    parser.add_argument(
        "--pdf",
        action="store_true",
        help="Also generate a PDF from the markdown output.",
    )

    parser.add_argument(
        "--model",
        default="gemini-3.5-flash",
        help="Gemini model (default: gemini-3.5-flash).",
    )

    return parser.parse_args()


args = parse_args()


# ============================================================
# RESOLVE LEVEL AND LANGUAGE
# ============================================================

level_key = args.level.lower()
NOTE_LEVEL = LEVEL_NAMES.get(level_key, "SUMMARY")
level_num  = {"OVERVIEW": 1, "SUMMARY": 2, "DETAILED NOTES": 3}[NOTE_LEVEL]

lang_key = args.lang.lower()
LANGUAGE = LANG_NAMES.get(lang_key, args.lang.upper())

INCLUDE_EXAMPLES = "YES" if args.examples else "NO"
INCLUDE_FORMULAS = "YES" if args.formulas else "NO"
EXAM_FOCUSED     = "YES" if args.exam     else "NO"


# ============================================================
# OUTPUT FILE
# ============================================================

if args.output:
    OUTPUT_FILE = args.output
else:
    lang_slug  = LANGUAGE.replace(" ", "_").lower()
    level_slug = NOTE_LEVEL.replace(" ", "_").lower()
    OUTPUT_FILE = f"notes_{level_slug}_{lang_slug}.md"


# ============================================================
# LOAD TRANSCRIPT
# ============================================================

if not os.path.exists(args.transcript):
    print(f"[ERROR] Transcript file not found: {args.transcript}")
    sys.exit(1)

with open(args.transcript, "r", encoding="utf-8") as f:
    raw = json.load(f)

# Flatten to plain text with timestamps
def transcript_to_text(data: list) -> str:
    lines = []
    for seg in data:
        if not isinstance(seg, dict):
            continue
        text  = seg.get("text", "").strip()
        start = seg.get("start", 0)
        end   = seg.get("end",   0)
        if text:
            lines.append(f"[{start:.1f}s] {text}")
    return "\n".join(lines)

transcript_text = transcript_to_text(raw)
word_count      = len(transcript_text.split())

print()
print("=" * 65)
print("LECTURE NOTE GENERATOR")
print("=" * 65)
print(f"  Level      : {level_num} — {NOTE_LEVEL}")
print(f"  Language   : {LANGUAGE}")
print(f"  Examples   : {INCLUDE_EXAMPLES}")
print(f"  Formulas   : {INCLUDE_FORMULAS}")
print(f"  Exam focus : {EXAM_FOCUSED}")
print(f"  Transcript : {args.transcript}  ({word_count:,} words)")
print(f"  Output     : {OUTPUT_FILE}")
print()


# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """You are an AI Lecture Note Generator.

Your task is to convert a lecture/video transcript into high-quality study notes.

Your most important rule is:

GENERATE ALL NOTE LEVELS FROM THE SAME SOURCE MATERIAL.

Do not add information that is not supported by the lecture transcript unless the user explicitly asks for external explanations.

Do not silently invent examples, definitions, formulas, facts, or conclusions.

Preserve the terminology, concepts, sequence, mathematical notation, examples, and important points presented in the lecture.

==================================================
NOTE LEVELS
==================================================

LEVEL 1 — OVERVIEW

Purpose:
Give the learner a very quick understanding of what the lecture is about.

Requirements:
- Keep it short and highly focused.
- Identify the main topic of the lecture.
- List the major concepts discussed.
- Give a brief explanation of each concept.
- Include only the most important formulas/definitions.
- Include the most important example only when necessary.
- Do not explain every subtopic.
- Do not include unnecessary details.

Target: 2–5 minute read.

Recommended structure:

# Lecture Overview
## Main Idea
## Key Concepts
## Important Formula / Definition
## Takeaway

--------------------------------------------------
LEVEL 2 — SUMMARY

Purpose:
Provide enough information for a student to revise the lecture without watching the entire video again.

Requirements:
- Cover all major concepts.
- Explain concepts clearly but concisely.
- Include important definitions.
- Include important formulas.
- Include significant examples from the lecture.
- Include relationships between concepts.
- Remove repetition and unnecessary conversational content.

Target: 5–15 minute read.

Recommended structure:

# Lecture Summary
## 1. Introduction
## 2. Main Concepts
### Concept A
### Concept B
## 3. Examples
## 4. Formulas / Mathematical Concepts
## 5. Important Points
## 6. Final Takeaways

--------------------------------------------------
LEVEL 3 — DETAILED NOTES

Purpose:
Create comprehensive study notes that closely represent the entire lecture.

Requirements:
- Cover essentially all meaningful educational content from the transcript.
- Follow the lecture's original logical sequence.
- Explain concepts thoroughly.
- Include definitions, formulas, examples, and demonstrations.
- Include important edge cases or observations mentioned in the lecture.
- Preserve technical terminology.
- Clearly distinguish definitions, examples, formulas, and important points.
- Remove filler, repetition, greetings, and irrelevant conversation.

Do NOT unnecessarily expand the lecture using your own knowledge.

If the lecturer gives an example, preserve that example.

If a section is unclear because the transcript is incomplete, explicitly mark it as:
[Transcript unclear/incomplete]

Recommended structure:

# Detailed Lecture Notes
## 1. Topic / Introduction
### Concept
### Definition
### Example
## 2. Main Topic
...
## Mathematical Formulation
## Example / Application
## Important Points
## Key Takeaways

==================================================
LANGUAGE RULES
==================================================

ENGLISH: Write natural academic English.

HINDI: Explain in clear Hindi while preserving technical terminology in English where appropriate. Do not translate mathematical notation. For technical terms, prefer "Breadth-First Search (BFS)" rather than forcing an unnatural translation.

HINGLISH: Explain naturally using Hindi + English technical terminology, similar to how an Indian student would explain the concept.

==================================================
OPTIONAL USER PREFERENCES
==================================================

If INCLUDE_EXAMPLES = YES:
Include relevant examples from the lecture.

If INCLUDE_EXAMPLES = NO:
Keep examples to the minimum necessary.

If INCLUDE_FORMULAS = YES:
Include important formulas using LaTeX notation (wrap in $ or $$).

If INCLUDE_FORMULAS = NO:
Only include formulas that are essential for understanding.

If EXAM_FOCUSED = YES:
Add a final section:

## Exam-Focused Points

Include:
- Definitions likely to be asked
- Important formulas
- Important distinctions/comparisons
- Concepts that require memorization
- Important problem-solving ideas

==================================================
SOURCE FIDELITY
==================================================

Before generating notes:
1. Identify the lecture structure.
2. Identify the major concepts.
3. Identify definitions, formulas, examples, and important conclusions.
4. Remove irrelevant conversational content.
5. Generate notes according to the selected depth.

Overview, Summary, and Detailed Notes must contain the SAME CORE INFORMATION.
The difference is DEPTH, not different facts.

==================================================
OUTPUT QUALITY
==================================================

Use:
- Clear headings and subheadings
- Bullet points and numbered lists
- **Bold** for important terms
- LaTeX for mathematical expressions (inline: $formula$, block: $$formula$$)
- Tables for comparisons when useful

Avoid:
- Unnecessary repetition
- Generic filler
- Information unrelated to the lecture
- Unsupported claims
- Invented examples

At the end, always provide:

## Quick Revision
5–10 of the most important points from the lecture.
"""

USER_PROMPT = f"""
NOTE LEVEL:
{NOTE_LEVEL}

LANGUAGE:
{LANGUAGE}

INCLUDE EXAMPLES:
{INCLUDE_EXAMPLES}

INCLUDE FORMULAS:
{INCLUDE_FORMULAS}

EXAM FOCUSED:
{EXAM_FOCUSED}

LECTURE TRANSCRIPT:
{transcript_text}
"""


# ============================================================
# CALL GEMINI
# ============================================================

from google import genai
from google.genai import types

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("[ERROR] GEMINI_API_KEY not set.")
    sys.exit(1)

client = genai.Client(api_key=api_key)

print(f"Calling Gemini ({args.model})...")
print()

response = client.models.generate_content(
    model=args.model,
    contents=[
        types.Content(
            role="user",
            parts=[types.Part(text=SYSTEM_PROMPT + "\n\n" + USER_PROMPT)]
        )
    ]
)

notes_markdown = response.text.strip()


# ============================================================
# SAVE MARKDOWN
# ============================================================

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(notes_markdown)

print("=" * 65)
print("NOTES GENERATED")
print("=" * 65)
print(f"  Level    : {level_num} — {NOTE_LEVEL}")
print(f"  Language : {LANGUAGE}")
print(f"  Markdown : {os.path.abspath(OUTPUT_FILE)}")
print()

# Word count of output
out_words = len(notes_markdown.split())
print(f"  Output   : {out_words:,} words")
print()


# ============================================================
# BEAUTIFUL HTML RENDERER
# ============================================================

LEVEL_COLORS = {
    1: ("#0f4c75", "#1b98e0", "#e8f4fd"),   # blue  — overview
    2: ("#1a472a", "#2d6a4f", "#e8f5e9"),   # green — summary
    3: ("#4a1942", "#7b2d8b", "#f3e5f5"),   # purple — detailed
}

_PRIMARY, _ACCENT, _LIGHT = LEVEL_COLORS.get(level_num, LEVEL_COLORS[2])

NOTES_CSS = f"""
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {{
  --primary:  {_PRIMARY};
  --accent:   {_ACCENT};
  --light:    {_LIGHT};
  --text:     #1a1a2e;
  --muted:    #64748b;
  --border:   #e2e8f0;
  --code-bg:  #1e293b;
  --code-fg:  #e2e8f0;
  --warn-bg:  #fffbeb;
  --warn-border: #f59e0b;
}}

*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

body {{
  font-family: 'Inter', 'Noto Sans Devanagari', 'Noto Sans', Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.8;
  color: var(--text);
  background: #ffffff;
}}

.page {{
  max-width: 820px;
  margin: 0 auto;
  padding: 0 0 40px;
}}

/* ── Title Banner ── */
.title-banner {{
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
  color: white;
  padding: 32px 40px;
  margin-bottom: 32px;
  border-radius: 0 0 16px 16px;
}}
.title-banner h1 {{
  font-size: 22pt;
  font-weight: 700;
  line-height: 1.3;
  margin: 0;
}}
.title-banner .meta {{
  margin-top: 10px;
  font-size: 9pt;
  font-weight: 400;
  opacity: 0.85;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}}
.badge {{
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 8.5pt;
  font-weight: 500;
}}

/* ── Content padding ── */
.content {{ padding: 0 40px; }}

/* ── Headings ── */
h1 {{ display: none; }}   /* shown via banner */

h2 {{
  font-size: 14pt;
  font-weight: 700;
  color: var(--primary);
  margin: 32px 0 10px;
  padding: 10px 14px;
  background: var(--light);
  border-left: 4px solid var(--accent);
  border-radius: 0 8px 8px 0;
  page-break-after: avoid;
}}

h3 {{
  font-size: 11.5pt;
  font-weight: 600;
  color: var(--primary);
  margin: 20px 0 6px;
  padding-bottom: 3px;
  border-bottom: 1.5px dashed var(--border);
  page-break-after: avoid;
}}

h4 {{
  font-size: 10.5pt;
  font-weight: 600;
  color: var(--accent);
  margin: 14px 0 4px;
}}

/* ── Body text ── */
p {{
  margin: 0 0 10px;
  text-align: justify;
}}

/* ── Lists ── */
ul, ol {{
  margin: 6px 0 12px 22px;
  padding: 0;
}}
li {{
  margin-bottom: 5px;
  padding-left: 2px;
}}
ul li::marker {{ color: var(--accent); }}

/* ── Bold / italic ── */
strong {{ color: var(--primary); font-weight: 600; }}
em     {{ color: #4b5563; font-style: italic; }}

/* ── Code ── */
code {{
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 9pt;
  background: var(--code-bg);
  color: var(--code-fg);
  padding: 1px 5px;
  border-radius: 4px;
}}
pre {{
  background: var(--code-bg);
  color: var(--code-fg);
  padding: 14px 18px;
  border-radius: 10px;
  overflow-x: auto;
  margin: 10px 0 16px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 9pt;
  line-height: 1.6;
}}
pre code {{
  background: none;
  padding: 0;
  font-size: inherit;
  color: inherit;
}}

/* ── Blockquotes / callouts ── */
blockquote {{
  border-left: 4px solid var(--accent);
  background: var(--light);
  margin: 10px 0 14px;
  padding: 10px 16px;
  border-radius: 0 8px 8px 0;
  font-style: normal;
  color: var(--text);
}}

/* ── Horizontal rule ── */
hr {{
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}}

/* ── Tables ── */
table {{
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 18px;
  font-size: 9.5pt;
}}
th {{
  background: var(--primary);
  color: white;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
}}
td {{
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
}}
tr:nth-child(even) td {{
  background: var(--light);
}}
tr:hover td {{
  background: #f1f5f9;
}}

/* ── Special section cards ── */
.section-quick-revision {{
  background: linear-gradient(135deg, #fff9c4 0%, #fff3cd 100%);
  border: 2px solid #f59e0b;
  border-radius: 12px;
  padding: 20px 24px;
  margin: 24px 0 8px;
}}
.section-quick-revision h2 {{
  background: none;
  border: none;
  padding: 0;
  margin: 0 0 12px;
  color: #92400e;
  font-size: 13pt;
}}

.section-exam {{
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border: 2px solid #ef4444;
  border-radius: 12px;
  padding: 20px 24px;
  margin: 24px 0 8px;
}}
.section-exam h2 {{
  background: none;
  border: none;
  padding: 0;
  margin: 0 0 12px;
  color: #991b1b;
  font-size: 13pt;
}}

/* ── Math ── */
.math-block {{
  text-align: center;
  margin: 14px 0;
  overflow-x: auto;
}}

/* ── Page breaks ── */
@media print {{
  .page {{ padding: 0; }}
  .title-banner {{ border-radius: 0; }}
  h2, h3, h4 {{ page-break-after: avoid; }}
  pre, blockquote, table {{ page-break-inside: avoid; }}
  .section-quick-revision, .section-exam {{ page-break-inside: avoid; }}
}}

@page {{
  margin: 14mm 16mm;
  @bottom-center {{
    content: counter(page);
    font-family: 'Inter', sans-serif;
    font-size: 8pt;
    color: #9ca3af;
  }}
}}
"""


def _md_to_html_body(md: str) -> tuple[str, str]:
    """
    Convert markdown to HTML body.
    Returns (title, html_body).
    Uses the 'markdown' library if available, else falls back
    to a simple regex converter.
    """
    try:
        import markdown as md_lib
        extensions = ["tables", "fenced_code", "toc", "nl2br", "sane_lists"]
        html = md_lib.markdown(md, extensions=extensions)
        # Extract title from first h1
        title_match = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.IGNORECASE)
        title = re.sub(r"<[^>]+>", "", title_match.group(1)) if title_match else "Lecture Notes"
        html = re.sub(r"<h1[^>]*>.*?</h1>", "", html, flags=re.IGNORECASE)
        return title, html

    except ImportError:
        pass

    # ── Fallback: manual converter ──
    lines   = md.split("\n")
    title   = "Lecture Notes"
    out     = []
    in_code = False
    in_ul   = False
    in_ol   = False

    def flush_list():
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False

    def inline(s: str) -> str:
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"\*(.+?)\*",     r"<em>\1</em>", s)
        s = re.sub(r"`(.+?)`",       r"<code>\1</code>", s)
        # escape HTML entities that aren't already tags
        return s

    for line in lines:
        stripped = line.strip()

        # Code fence
        if stripped.startswith("```"):
            if in_code:
                out.append("</code></pre>")
                in_code = False
            else:
                flush_list()
                out.append("<pre><code>")
                in_code = True
            continue

        if in_code:
            # escape in code block
            out.append(
                stripped
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )
            continue

        # Headings
        if stripped.startswith("#### "):
            flush_list()
            out.append(f"<h4>{inline(stripped[5:])}</h4>")
        elif stripped.startswith("### "):
            flush_list()
            out.append(f"<h3>{inline(stripped[4:])}</h3>")
        elif stripped.startswith("## "):
            flush_list()
            out.append(f"<h2>{inline(stripped[3:])}</h2>")
        elif stripped.startswith("# "):
            flush_list()
            title = stripped[2:].strip()
        elif stripped.startswith("---") or stripped.startswith("***"):
            flush_list()
            out.append("<hr>")
        elif stripped.startswith(("* ", "- ", "+ ")):
            if not in_ul:
                flush_list()
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{inline(stripped[2:])}</li>")
        elif re.match(r"^\d+\.\s", stripped):
            if not in_ol:
                flush_list()
                out.append("<ol>")
                in_ol = True
            out.append(f"<li>{inline(re.sub(r'^\d+\.\s', '', stripped))}</li>")
        elif stripped.startswith("> "):
            flush_list()
            out.append(f"<blockquote>{inline(stripped[2:])}</blockquote>")
        elif stripped == "":
            flush_list()
            out.append("")
        else:
            flush_list()
            out.append(f"<p>{inline(stripped)}</p>")

    flush_list()
    if in_code:
        out.append("</code></pre>")

    return title, "\n".join(out)


def _wrap_special_sections(html: str) -> str:
    """
    Wrap 'Quick Revision' and 'Exam-Focused' sections in styled cards.
    """
    # Quick Revision card
    html = re.sub(
        r"(<h2[^>]*>)(.*?Quick Revision.*?)(</h2>)",
        r'</div><div class="section-quick-revision">\1\2\3',
        html,
        flags=re.IGNORECASE
    )
    # Exam-Focused card
    html = re.sub(
        r"(<h2[^>]*>)(.*?Exam[- ]Focused.*?)(</h2>)",
        r'</div><div class="section-exam">\1\2\3',
        html,
        flags=re.IGNORECASE
    )
    return html


def build_notes_html(markdown_text: str, level: int, language: str,
                     include_examples: str, include_formulas: str,
                     exam_focused: str) -> str:
    """Convert markdown notes to a beautiful, print-ready HTML document."""

    title, body_html = _md_to_html_body(markdown_text)
    body_html = _wrap_special_sections(body_html)

    level_labels = {1: "Level 1 — Overview", 2: "Level 2 — Summary", 3: "Level 3 — Detailed"}
    level_label  = level_labels.get(level, "Summary")

    badges = [
        f'<span class="badge">📚 {level_label}</span>',
        f'<span class="badge">🌐 {language}</span>',
    ]
    if include_examples == "YES":
        badges.append('<span class="badge">✏️ Examples</span>')
    if include_formulas == "YES":
        badges.append('<span class="badge">📐 Formulas</span>')
    if exam_focused == "YES":
        badges.append('<span class="badge">🎯 Exam Focused</span>')

    badges_html = "".join(badges)

    return f"""<!DOCTYPE html>
<html lang="und">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title}</title>
  <style>{NOTES_CSS}</style>

  <!-- MathJax for LaTeX rendering -->
  <script>
    window.MathJax = {{
      tex: {{
        inlineMath:  [['$','$'], ['\\\\(','\\\\)']],
        displayMath: [['$$','$$'], ['\\\\[','\\\\]']],
        processEscapes: true
      }},
      options: {{ skipHtmlTags: ['script','noscript','style','textarea','pre'] }},
      startup: {{ typeset: true }}
    }};
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"
          id="MathJax-script" async></script>
</head>
<body>
<div class="page">

  <!-- Title Banner -->
  <div class="title-banner">
    <h1>{title}</h1>
    <div class="meta">{badges_html}</div>
  </div>

  <!-- Main Content -->
  <div class="content">
    <div>{body_html}</div>
  </div>

</div>
</body>
</html>"""


def render_pdf_from_markdown(
    markdown_text: str,
    pdf_path: str,
    level: int,
    language: str,
    include_examples: str,
    include_formulas: str,
    exam_focused: str,
) -> bool:
    """
    Convert markdown notes to a beautiful PDF via Chrome headless.
    Returns True on success.
    """
    import subprocess

    html = build_notes_html(
        markdown_text, level, language,
        include_examples, include_formulas, exam_focused
    )

    # Save HTML alongside PDF
    html_path = pdf_path.replace(".pdf", ".html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  HTML     : {html_path}")

    # Find Chrome / Edge
    chrome_candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    chrome = next((p for p in chrome_candidates if os.path.isfile(p)), None)

    if not chrome:
        print("  [INFO] Chrome not found — open the HTML file in Chrome → Ctrl+P → Save as PDF")
        return False

    abs_html = os.path.abspath(html_path).replace("\\", "/")
    abs_pdf  = os.path.abspath(pdf_path)

    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-extensions",
        "--disable-web-security",           # allows loading Google Fonts + MathJax CDN
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=8000",       # wait 8s for MathJax to render
        "--no-pdf-header-footer",
        f"--print-to-pdf={abs_pdf}",
        f"file:///{abs_html}",
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return os.path.exists(abs_pdf) and os.path.getsize(abs_pdf) > 1000
    except Exception as exc:
        print(f"  [WARN] Chrome error: {exc}")
        return False


# ============================================================
# SAVE MARKDOWN
# ============================================================

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(notes_markdown)

print("=" * 65)
print("NOTES GENERATED")
print("=" * 65)
print(f"  Level    : {level_num} — {NOTE_LEVEL}")
print(f"  Language : {LANGUAGE}")
print(f"  Markdown : {os.path.abspath(OUTPUT_FILE)}")

out_words = len(notes_markdown.split())
print(f"  Words    : {out_words:,}")
print()


# ============================================================
# PDF GENERATION (always — not just --pdf)
# ============================================================

pdf_output = OUTPUT_FILE.replace(".md", ".pdf")
print("Generating beautiful PDF...")

ok = render_pdf_from_markdown(
    notes_markdown,
    pdf_output,
    level_num,
    LANGUAGE,
    INCLUDE_EXAMPLES,
    INCLUDE_FORMULAS,
    EXAM_FOCUSED,
)

if ok:
    print(f"  PDF      : {os.path.abspath(pdf_output)}")
else:
    print("  [INFO] PDF not generated — see HTML file above.")

print()


# ============================================================
# PREVIEW
# ============================================================

print("=" * 65)
print("PREVIEW (first 15 lines)")
print("=" * 65)
for line in notes_markdown.split("\n")[:15]:
    print(line)
print()
print("  ...")
print("=" * 65)
print()
print(f"Markdown → {os.path.abspath(OUTPUT_FILE)}")
if ok:
    print(f"PDF      → {os.path.abspath(pdf_output)}")
print()


