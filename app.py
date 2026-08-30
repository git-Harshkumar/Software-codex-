"""
app.py
======
Lecture Notes Learning Platform — Flask Backend

Run:
    pip install flask markdown
    python app.py
Then open: http://localhost:5000
"""

import glob
import json
import os
import uuid
from datetime import datetime

from flask import Flask, abort, jsonify, render_template, request, send_file, Response

# ── Optional markdown renderer ──────────────────────────────
try:
    import markdown as md_lib

    def md_to_html(text: str) -> str:
        return md_lib.markdown(
            text,
            extensions=["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"],
        )

except ImportError:

    def md_to_html(text: str) -> str:
        import re
        html = text
        html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
        html = re.sub(r"\*(.+?)\*",     r"<em>\1</em>",         html)
        html = re.sub(r"`(.+?)`",       r"<code>\1</code>",     html)
        html = re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
        html = re.sub(r"^### (.+)$",r"<h3>\1</h3>", html, flags=re.MULTILINE)
        html = re.sub(r"^# (.+)$",  r"<h1>\1</h1>", html, flags=re.MULTILINE)
        html = "\n".join(
            f"<p>{l}</p>" if l.strip() and not l.strip().startswith("<") else l
            for l in html.split("\n")
        )
        return html


# ── App setup ───────────────────────────────────────────────
app = Flask(__name__)
BASE   = os.path.dirname(os.path.abspath(__file__))
SHORTS  = os.path.join(BASE, "shorts")
SUMMARY = os.path.join(BASE, "summary", "summary.mp4")
STICKY  = os.path.join(BASE, "notes", "sticky_notes.json")

# Map level + lang → markdown filename
NOTE_MD_DIR = os.path.join(BASE, "notes", "markdown")
NOTE_PATTERNS = {
    "overview": "notes_overview_{lang}.md",
    "summary":  "notes_summary_{lang}.md",
    "detailed": "notes_detailed_notes_{lang}.md",
}
LANG_SLUGS = {
    "english":  "english",
    "hindi":    "hindi",
    "hinglish": "hinglish",
}

CLI_LEVEL = {"overview": "1", "summary": "2", "detailed": "3"}


# ── Routes ──────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/favicon.ico")
def favicon():
    return Response(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>',
        mimetype="image/svg+xml",
    )


@app.route("/api/notes/<level>/<lang>")
def get_notes(level, lang):
    pattern  = NOTE_PATTERNS.get(level.lower())
    if not pattern:
        return jsonify({"error": "Invalid level"}), 400

    lang_slug = LANG_SLUGS.get(lang.lower(), lang.lower())
    filename  = pattern.format(lang=lang_slug)
    filepath  = os.path.join(NOTE_MD_DIR, filename)

    if not os.path.exists(filepath):
        cmd = (
            f"python generators/generate_notes_v2.py "
            f"--level {CLI_LEVEL.get(level,'2')} "
            f"--lang {lang.title()} "
            f"--examples --formulas --exam"
        )
        return jsonify({
            "html": (
                f'<div class="not-generated">'
                f'<span class="ng-icon">📄</span>'
                f'<h3>Notes not yet generated</h3>'
                f'<p>Run this command in your terminal:</p>'
                f'<pre><code>{cmd}</code></pre>'
                f'</div>'
            ),
        })

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    return jsonify({"html": md_to_html(content), "filename": filename})


@app.route("/api/notes/<level>/<lang>/download")
def download_notes(level, lang):
    """Download the raw markdown file."""
    pattern  = NOTE_PATTERNS.get(level.lower())
    if not pattern:
        return jsonify({"error": "Invalid level"}), 400

    lang_slug = LANG_SLUGS.get(lang.lower(), lang.lower())
    filename  = pattern.format(lang=lang_slug)
    filepath  = os.path.join(NOTE_MD_DIR, filename)

    if not os.path.exists(filepath):
        abort(404)

    return send_file(
        filepath,
        as_attachment=True,
        download_name=filename,
        mimetype="text/markdown",
    )


@app.route("/api/notes/<level>/<lang>/print")
def print_notes(level, lang):
    """Return a standalone printable HTML page (for Save as PDF)."""
    pattern  = NOTE_PATTERNS.get(level.lower())
    if not pattern:
        return jsonify({"error": "Invalid level"}), 400

    lang_slug = LANG_SLUGS.get(lang.lower(), lang.lower())
    filename  = pattern.format(lang=lang_slug)
    filepath  = os.path.join(NOTE_MD_DIR, filename)

    if not os.path.exists(filepath):
        abort(404)

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    level_names = {"overview": "Overview", "summary": "Summary", "detailed": "Detailed Notes"}
    lang_names  = {"english": "English", "hindi": "Hindi", "hinglish": "Hinglish"}
    title = f"{level_names.get(level, level).title()} · {lang_names.get(lang, lang).title()}"
    body_html = md_to_html(content)

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title} — Lecture Notes</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script>
    window.MathJax = {{
      tex: {{ inlineMath: [['$','$'],['\\\\(','\\\\)']], displayMath: [['$$','$$'],['\\\\[','\\\\]']], processEscapes: true }},
      options: {{ skipHtmlTags: ['script','noscript','style','textarea','pre'] }}
    }};
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async></script>
  <style>
    :root {{
      --primary: #1d4ed8; --accent: #2563eb; --light: #eff6ff;
      --text: #1e293b; --muted: #64748b; --border: #e2e8f0;
      --code-bg: #1e293b; --code-fg: #e2e8f0;
    }}
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Inter', 'Noto Sans Devanagari', Arial, sans-serif;
      font-size: 10.5pt; line-height: 1.8; color: var(--text); background: #fff;
    }}
    .page {{ max-width: 820px; margin: 0 auto; padding: 0 0 40px; }}
    .title-banner {{
      background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
      color: white; padding: 32px 40px; margin-bottom: 32px;
      border-radius: 0 0 16px 16px;
    }}
    .title-banner h1 {{ font-size: 22pt; font-weight: 700; line-height: 1.3; }}
    .title-banner .meta {{ margin-top: 10px; font-size: 9pt; opacity: .85; display: flex; gap: 16px; flex-wrap: wrap; }}
    .badge {{
      background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3);
      border-radius: 20px; padding: 2px 10px; font-size: 8.5pt; font-weight: 500;
    }}
    .print-bar {{
      display: flex; gap: 10px; padding: 10px 40px;
      background: #f8fafc; border-bottom: 1px solid var(--border);
    }}
    .print-bar button {{
      padding: 8px 20px; border-radius: 8px; font-size: .85rem; font-weight: 600;
      cursor: pointer; border: none;
    }}
    .btn-print {{ background: var(--primary); color: white; }}
    .btn-close {{ background: #e2e8f0; color: var(--text); }}
    .content {{ padding: 0 40px; }}
    h1 {{ display: none; }}
    h2 {{
      font-size: 14pt; font-weight: 700; color: var(--primary);
      margin: 32px 0 10px; padding: 10px 14px;
      background: var(--light); border-left: 4px solid var(--accent);
      border-radius: 0 8px 8px 0;
    }}
    h3 {{
      font-size: 11.5pt; font-weight: 600; color: var(--primary);
      margin: 20px 0 6px; padding-bottom: 3px;
      border-bottom: 1.5px dashed var(--border);
    }}
    h4 {{ font-size: 10.5pt; font-weight: 600; color: #7c3aed; margin: 14px 0 6px; }}
    p {{ margin-bottom: 10px; }}
    ul, ol {{ margin: 8px 0 12px 22px; }}
    li {{ margin-bottom: 5px; }}
    code {{
      font-family: 'JetBrains Mono', monospace; font-size: .82em;
      background: #f1f5f9; color: #c2410c; padding: 2px 6px; border-radius: 4px;
    }}
    pre {{
      background: var(--code-bg); color: var(--code-fg);
      border-radius: 10px; padding: 18px; overflow-x: auto;
      margin: 12px 0 18px; font-family: 'JetBrains Mono', monospace;
      font-size: .82em; line-height: 1.6;
    }}
    pre code {{ background: none; color: inherit; padding: 0; }}
    blockquote {{
      border-left: 3px solid #7c3aed; background: #faf5ff;
      padding: 10px 16px; border-radius: 0 8px 8px 0; margin: 12px 0;
    }}
    hr {{ border: none; border-top: 1px solid var(--border); margin: 24px 0; }}
    table {{ width: 100%; border-collapse: collapse; margin: 14px 0; font-size: .88em; }}
    th {{ background: #f1f5f9; padding: 9px 14px; text-align: left; font-weight: 600; }}
    td {{ padding: 8px 14px; border-bottom: 1px solid var(--border); }}
    tr:nth-child(even) td {{ background: rgba(0,0,0,.02); }}
    @media print {{
      .print-bar {{ display: none !important; }}
      body {{ font-size: 9pt; }}
      .title-banner {{ border-radius: 0; }}
      pre {{ white-space: pre-wrap; word-break: break-word; }}
      h2 {{ page-break-after: avoid; }}
      h3 {{ page-break-after: avoid; }}
    }}
  </style>
</head>
<body>
  <div class="page">
    <div class="print-bar">
      <button class="btn-print" onclick="window.print()">🖨 Save as PDF / Print</button>
      <button class="btn-close" onclick="window.close()">✕ Close</button>
    </div>
    <div class="title-banner">
      <h1>{title}</h1>
      <div class="meta">
        <span class="badge">MIT 6.006 · Lecture 13</span>
        <span class="badge">Graph Search &amp; BFS</span>
        <span class="badge">{lang_names.get(lang, lang).title()}</span>
      </div>
    </div>
    <div class="content">
      {body_html}
    </div>
  </div>
  <script>window.addEventListener('load', () => {{ if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise(); }});</script>
</body>
</html>"""
    return page, 200, {"Content-Type": "text/html; charset=utf-8"}


@app.route("/api/shorts")
def get_shorts():
    if not os.path.isdir(SHORTS):
        return jsonify({"clips": []})

    clips = []
    manifest = os.path.join(SHORTS, "clips_manifest.json")

    if os.path.exists(manifest):
        with open(manifest, "r", encoding="utf-8") as f:
            raw = json.load(f)
        for c in raw:
            if c.get("status") != "ok":
                continue
            fname = os.path.basename(c["file"])
            dur   = c.get("duration", 0)
            m, s  = divmod(int(dur), 60)
            clips.append({
                "filename": fname,
                "heading":  c.get("heading", fname),
                "duration": f"{m}m {s:02d}s",
                "size_mb":  c.get("size_mb", 0),
                "url":      f"/video/{fname}",
            })
    else:
        for mp4 in sorted(glob.glob(os.path.join(SHORTS, "*.mp4"))):
            fname = os.path.basename(mp4)
            clips.append({
                "filename": fname,
                "heading":  fname.replace("clip_", "").replace(".mp4", "").replace("_", " "),
                "duration": "—",
                "size_mb":  round(os.path.getsize(mp4) / 1_048_576, 1),
                "url":      f"/video/{fname}",
            })

    return jsonify({"clips": clips})


# ── Summary Video ────────────────────────────────────────────

@app.route("/api/summary-video")
def summary_video_meta():
    """Return metadata for the summary video."""
    if not os.path.exists(SUMMARY):
        return jsonify({"available": False}), 404
    size_mb = round(os.path.getsize(SUMMARY) / 1_048_576, 1)
    return jsonify({"available": True, "url": "/summary-video", "size_mb": size_mb})


@app.route("/summary-video")
def serve_summary_video():
    """Stream the summary MP4 with range-request support for seeking."""
    if not os.path.exists(SUMMARY):
        abort(404)

    file_size    = os.path.getsize(SUMMARY)
    range_header = request.headers.get("Range")

    if range_header:
        byte1, byte2 = 0, None
        m = __import__("re").search(r"bytes=(\d+)-(\d*)", range_header)
        if m:
            byte1 = int(m.group(1))
            byte2 = int(m.group(2)) if m.group(2) else file_size - 1
        length = byte2 - byte1 + 1

        with open(SUMMARY, "rb") as f:
            f.seek(byte1)
            data = f.read(length)

        resp = Response(
            data, 206,
            mimetype="video/mp4",
            direct_passthrough=True,
        )
        resp.headers["Content-Range"]  = f"bytes {byte1}-{byte2}/{file_size}"
        resp.headers["Accept-Ranges"]  = "bytes"
        resp.headers["Content-Length"] = length
        return resp

    return send_file(SUMMARY, mimetype="video/mp4")


@app.route("/video/<path:filename>")
def serve_video(filename):
    filepath = os.path.join(SHORTS, filename)
    if not os.path.exists(filepath):
        abort(404)

    # Range request support for HTML5 video seek
    file_size = os.path.getsize(filepath)
    range_header = request.headers.get("Range")

    if range_header:
        byte1, byte2 = 0, None
        m = __import__("re").search(r"bytes=(\d+)-(\d*)", range_header)
        if m:
            byte1 = int(m.group(1))
            byte2 = int(m.group(2)) if m.group(2) else file_size - 1
        length = byte2 - byte1 + 1

        with open(filepath, "rb") as f:
            f.seek(byte1)
            data = f.read(length)

        resp = Response(
            data,
            206,
            mimetype="video/mp4",
            direct_passthrough=True,
        )
        resp.headers["Content-Range"]  = f"bytes {byte1}-{byte2}/{file_size}"
        resp.headers["Accept-Ranges"]  = "bytes"
        resp.headers["Content-Length"] = length
        return resp

    return send_file(filepath, mimetype="video/mp4")


# ── Sticky Notes API ────────────────────────────────────────

def _load_sticky() -> list:
    if os.path.exists(STICKY):
        with open(STICKY, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def _save_sticky(notes: list) -> None:
    with open(STICKY, "w", encoding="utf-8") as f:
        json.dump(notes, f, indent=2, ensure_ascii=False)


@app.route("/api/sticky", methods=["GET"])
def sticky_list():
    return jsonify(_load_sticky())


@app.route("/api/sticky", methods=["POST"])
def sticky_add():
    data  = request.json or {}
    notes = _load_sticky()
    note  = {
        "id":      str(uuid.uuid4()),
        "text":    data.get("text", "").strip(),
        "color":   data.get("color", "#fef08a"),
        "created": datetime.now().strftime("%d %b %Y, %H:%M"),
    }
    notes.append(note)
    _save_sticky(notes)
    return jsonify(note), 201


@app.route("/api/sticky/<note_id>", methods=["PUT"])
def sticky_update(note_id):
    data  = request.json or {}
    notes = _load_sticky()
    for n in notes:
        if n["id"] == note_id:
            n["text"]  = data.get("text",  n["text"])
            n["color"] = data.get("color", n["color"])
    _save_sticky(notes)
    return jsonify({"ok": True})


@app.route("/api/sticky/<note_id>", methods=["DELETE"])
def sticky_delete(note_id):
    notes = [n for n in _load_sticky() if n["id"] != note_id]
    _save_sticky(notes)
    return jsonify({"ok": True})


# ── Run ─────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print()
    print("=" * 55)
    print("  LECTURE NOTES PLATFORM")
    print("=" * 55)
    print(f"  Open: http://localhost:{port}")
    print("=" * 55)
    print()
    app.run(host="0.0.0.0", port=port, debug=False)

