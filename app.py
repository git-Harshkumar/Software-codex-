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
SHORTS = os.path.join(BASE, "shorts")
STICKY = os.path.join(BASE, "notes", "sticky_notes.json")

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
    print()
    print("=" * 55)
    print("  LECTURE NOTES PLATFORM")
    print("=" * 55)
    print("  Open: http://localhost:5000")
    print("=" * 55)
    print()
    app.run(debug=True, port=5000)
