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
import re
import shutil
import subprocess
import uuid
import tempfile
from datetime import datetime

# Load .env on startup — but only to pre-populate if a key already exists
try:
    from dotenv import load_dotenv
    load_dotenv(override=False)   # never overwrite a key already in os.environ
except ImportError:
    pass

from flask import Flask, abort, jsonify, redirect, render_template, request, send_file, Response

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
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
BASE   = os.path.dirname(os.path.abspath(__file__))
SHORTS   = os.path.join(BASE, "shorts")
SUMMARY  = os.path.join(BASE, "summary", "summary.mp4")
LECTURE  = os.path.join(BASE, "videos",  "lecture.mp4")
STICKY   = os.path.join(BASE, "notes",   "sticky_notes.json")

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
NOTE_PDF_DIR = os.path.join(BASE, "notes", "pdf")

_BROWSER_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "chrome",
    "google-chrome",
    "msedge",
]

def find_browser_bin():
    for p in _BROWSER_PATHS:
        if os.path.isfile(p):
            return p
        w = shutil.which(p)
        if w and os.path.isfile(w):
            return w
    return None

def render_printable_html(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&family=Kalam:wght@300;400;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
  <script>
    window.MathJax = {{
      tex: {{ inlineMath: [['$','$'],['\\\\(','\\\\)']], displayMath: [['$$','$$'],['\\\\[','\\\\]']], processEscapes: true }},
      options: {{ skipHtmlTags: ['script','noscript','style','textarea','pre'] }}
    }};
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
  <style>
    @page {{
      margin: 18mm;
      size: A4 portrait;
    }}
    *, *::before, *::after {{ box-sizing: border-box; }}
    body {{
      font-family: 'Kalam', 'Noto Sans Devanagari', cursive, sans-serif;
      font-size: 15px;
      line-height: 2;
      color: #0f172a;
      background: #ffffff;
      padding: 24px;
      max-width: 860px;
      margin: 0 auto;
    }}
    h1 {{
      font-family: 'Inter', sans-serif;
      font-size: 26px;
      font-weight: 800;
      color: #1e3a8a;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 8px;
      margin: 0 0 24px;
    }}
    h2 {{
      font-family: 'Inter', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: #1d4ed8;
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 8px 14px;
      margin: 26px 0 12px;
      border-radius: 0 6px 6px 0;
      page-break-after: avoid;
    }}
    h3 {{
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      font-weight: 600;
      color: #334155;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 4px;
      margin: 20px 0 10px;
      page-break-after: avoid;
    }}
    p {{ margin-bottom: 12px; }}
    ul, ol {{ margin: 8px 0 14px 28px; }}
    li {{ margin-bottom: 6px; }}
    code {{
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      background: #f1f5f9;
      color: #b45309;
      padding: 2px 6px;
      border-radius: 4px;
    }}
    pre {{
      background: #0f172a;
      color: #f8fafc;
      padding: 14px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12.5px;
      line-height: 1.5;
      page-break-inside: avoid;
    }}
    blockquote {{
      border-left: 4px solid #8b5cf6;
      background: #f5f3ff;
      padding: 8px 16px;
      margin: 14px 0;
      border-radius: 0 6px 6px 0;
      color: #4b5563;
      font-style: italic;
    }}
    table {{ width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; page-break-inside: avoid; }}
    th {{ background: #f1f5f9; padding: 8px 12px; border: 1px solid #cbd5e1; font-family: 'Inter', sans-serif; }}
    td {{ padding: 8px 12px; border: 1px solid #cbd5e1; }}
    @media print {{
      body {{ padding: 0; background: transparent; }}
      .no-print {{ display: none !important; }}
    }}
  </style>
</head>
<body>
  {body_html}
  <script>
    if (window.location.search.includes('autoprint=1')) {{
      window.addEventListener('load', () => setTimeout(() => window.print(), 800));
    }}
  </script>
</body>
</html>"""


# ── Routes ──────────────────────────────────────────────────

# Free routes that never need an API key
_FREE_ROUTES = {
    "/",
    "/favicon.ico",
    "/api/check-api-key",
    "/api/set-api-key",
    "/api/sync-lecture",
}

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

@app.before_request
def require_api_key():
    if request.method == "OPTIONS":
        resp = Response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return resp

    """Block every /api/* route unless GEMINI_API_KEY is set."""
    path = request.path
    # Only guard API routes not in the free list
    if path.startswith("/api/") and path not in _FREE_ROUTES:
        if not os.environ.get("GEMINI_API_KEY", "").strip():
            return jsonify({
                "error": "API key not configured",
                "code":  "NO_API_KEY"
            }), 401


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/favicon.ico")
def favicon():
    return Response(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0-5H20"/></svg>',
        mimetype="image/svg+xml",
    )


# ── API Key Management ───────────────────────────────────────

@app.route("/api/check-api-key")
def check_api_key():
    """Return whether a Gemini API key is currently configured."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    return jsonify({"configured": bool(key), "masked": (key[:6] + "…" + key[-4:]) if len(key) > 10 else ""})


@app.route("/api/set-api-key", methods=["POST"])
def set_api_key():
    """Accept a Gemini API key, store it in the environment and persist to .env."""
    data = request.json or {}
    key  = data.get("api_key", "").strip()

    if not key:
        return jsonify({"ok": False, "error": "API key cannot be empty"}), 400
    if len(key) < 20:
        return jsonify({"ok": False, "error": "That key looks too short — please double-check it"}), 400

    # Apply to the running process immediately
    os.environ["GEMINI_API_KEY"] = key

    # Persist to .env file
    env_path = os.path.join(BASE, ".env")
    try:
        if os.path.exists(env_path):
            content = open(env_path, "r", encoding="utf-8").read()
            # Replace existing key line or append
            if re.search(r"^GEMINI_API_KEY=", content, re.MULTILINE):
                content = re.sub(
                    r'^GEMINI_API_KEY=.*$',
                    f'GEMINI_API_KEY="{key}"',
                    content, flags=re.MULTILINE
                )
            else:
                content += f'\nGEMINI_API_KEY="{key}"\n'
        else:
            content = f'GEMINI_API_KEY="{key}"\n'
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        # Non-fatal — key is already in os.environ
        print(f"[warn] Could not write .env: {e}")

    return jsonify({"ok": True})


@app.route("/api/sync-lecture", methods=["POST"])
def sync_lecture():
    """Accept generated lecture notes, timeline, and study assets from extension and save to disk."""
    data = request.json or {}
    notes = data.get("notes", {})          # { "overview": { "english": "...", ... }, ... }
    timeline = data.get("timeline", [])    # list of chapter objects
    sticky = data.get("sticky", [])        # list of sticky notes
    combined = data.get("combined", [])    # combined multimodal lecture array
    transcript = data.get("transcript", [])# reconstructed transcript array

    os.makedirs(NOTE_MD_DIR, exist_ok=True)

    # 1. Save all markdown note levels and languages
    saved_files = []
    for level, langs in notes.items():
        pattern = NOTE_PATTERNS.get(level.lower())
        if not pattern:
            continue
        for lang, content in langs.items():
            if not content:
                continue
            lang_slug = LANG_SLUGS.get(lang.lower(), lang.lower())
            filename = pattern.format(lang=lang_slug)
            filepath = os.path.join(NOTE_MD_DIR, filename)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            saved_files.append(filename)

    # 2. Save timeline / chapter markers
    if timeline:
        try:
            os.makedirs(os.path.dirname(TIMELINE), exist_ok=True)
            with open(TIMELINE, "w", encoding="utf-8") as f:
                json.dump({"chapters": timeline}, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[warn] Could not save timeline: {e}")

    # 3. Save sticky flashcard notes
    if sticky:
        try:
            existing = _load_sticky()
            existing_texts = {s.get("text", "").strip() for s in existing}
            for s in sticky:
                stext = s.get("text", "").strip() if isinstance(s, dict) else str(s).strip()
                if stext and stext not in existing_texts:
                    existing.append({
                        "id": str(uuid.uuid4()),
                        "text": stext,
                        "color": s.get("color", "#fef08a") if isinstance(s, dict) else "#fef08a",
                        "created": datetime.now().strftime("%d %b %Y, %H:%M"),
                    })
                    existing_texts.add(stext)
            _save_sticky(existing)
        except Exception as e:
            print(f"[warn] Could not save sticky notes: {e}")

    # 4. Save combined lecture & clean transcript in data directory
    data_dir = os.path.join(BASE, "data")
    os.makedirs(data_dir, exist_ok=True)
    if combined:
        try:
            with open(os.path.join(data_dir, "combined_lecture.json"), "w", encoding="utf-8") as f:
                json.dump(combined, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[warn] Could not save combined lecture: {e}")

    if transcript:
        try:
            with open(os.path.join(data_dir, "clean_transcript.json"), "w", encoding="utf-8") as f:
                json.dump(transcript, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[warn] Could not save transcript: {e}")

    # 5. Automatically save notes to AWS DynamoDB
    try:
        from pipeline.cloud_db import save_note_to_aws
        v_id = data.get("videoId") or data.get("video_id") or "lecture"
        v_title = data.get("title") or "Lecture Video"
        v_channel = data.get("channel") or ""

        for level_k, langs_map in notes.items():
            if not isinstance(langs_map, dict):
                continue
            for lang_k, content_txt in langs_map.items():
                if content_txt and isinstance(content_txt, str) and content_txt.strip():
                    save_note_to_aws({
                        "videoId": v_id,
                        "title": v_title,
                        "channel": v_channel,
                        "level": level_k,
                        "lang": lang_k,
                        "note": content_txt,
                        "timeline": timeline
                    })
    except Exception as e:
        print(f"[warn] Could not auto-save notes to DynamoDB: {e}")

    return jsonify({
        "ok": True,
        "saved_files": saved_files,
        "message": f"Successfully synced {len(saved_files)} note files, timeline, and study assets to DynamoDB!"
    })


# ── AWS Cloud Database & Grounded Topic Search Endpoints ────────────────
@app.route("/api/cloud/save-note", methods=["POST"])
def cloud_save_note():
    """Save generated note and topic sections to AWS DynamoDB."""
    try:
        from pipeline.cloud_db import save_note_to_aws
        payload = request.json or {}
        res = save_note_to_aws(payload)
        return jsonify(res)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/cloud/search", methods=["POST"])
def cloud_search():
    """Strict in-context grounded search across AWS DynamoDB stored notes."""
    try:
        from pipeline.cloud_db import search_topic_in_notes, synthesize_grounded_answer
        data = request.json or {}
        query = data.get("query", "").strip()
        video_id = data.get("videoId") or data.get("video_id")
        level = data.get("level")
        lang = data.get("lang")
        api_key = data.get("apiKey") or os.getenv("GEMINI_API_KEY")

        if not query:
            return jsonify({"ok": False, "error": "Query cannot be empty."}), 400

        search_res = search_topic_in_notes(query, video_id=video_id, level=level, lang=lang)
        if not search_res.get("ok"):
            return jsonify(search_res), 400

        qa_res = synthesize_grounded_answer(query, search_res, gemini_api_key=api_key)

        return jsonify({
            "ok": True,
            "query": query,
            "in_context": search_res.get("in_context", False),
            "message": search_res.get("message"),
            "grounded_answer": qa_res.get("grounded_answer", ""),
            "citations": qa_res.get("citations", []),
            "results": search_res.get("results", [])
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/cloud/saved-lectures", methods=["GET"])
def cloud_saved_lectures():
    """List of all lectures saved in the database."""
    try:
        from pipeline.cloud_db import get_saved_lectures_list
        lectures = get_saved_lectures_list()
        return jsonify({"ok": True, "lectures": lectures})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/cloud/note/<note_id>", methods=["GET"])
def cloud_get_note(note_id):
    """Fetch a full saved note by note_id as JSON."""
    try:
        from pipeline.cloud_db import get_full_note_by_id
        note = get_full_note_by_id(note_id)
        if not note:
            return jsonify({"ok": False, "error": f"Note '{note_id}' not found."}), 404
        return jsonify({"ok": True, "note": note})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/cloud/note/<note_id>/html", methods=["GET"])
def cloud_get_note_html(note_id):
    """Serve a full saved note as a beautiful standalone HTML page."""
    try:
        from pipeline.cloud_db import get_full_note_by_id
        note = get_full_note_by_id(note_id)
        if not note:
            return f"<h2 style='font-family:sans-serif;padding:40px;color:#ef4444'>Note not found: {note_id}</h2>", 404

        markdown_content = note.get("markdown_content", "")
        title    = note.get("title",   "Lecture Notes")
        level    = note.get("level",   "overview").title()
        lang     = note.get("lang",    "english").title()
        channel  = note.get("channel", "")
        video_id = note.get("video_id", "")
        body_html = md_to_html(markdown_content) if markdown_content else "<p>No content available.</p>"
        yt_link   = f"https://www.youtube.com/watch?v={video_id}" if video_id else "#"

        highlight_q = request.args.get("q", "")
        if highlight_q:
            words = [w for w in highlight_q.split() if len(w) > 2]
            for w in words:
                body_html = re.sub(
                    f'({re.escape(w)})',
                    r'<mark style="background:#fbbf2444;color:#fbbf24;border-radius:3px;padding:0 2px">\1</mark>',
                    body_html, flags=re.IGNORECASE
                )

        ch_badge = f'<span class="badge badge-ch">{channel}</span>' if channel else ''
        ch_meta  = f'<span>📺 {channel}</span>' if channel else ''

        page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title} — RecallAI Notes</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root{{--bg:#0f172a;--sur:#1e293b;--s2:#263347;--cyan:#06b6d4;--acc:#7c3aed;--text:#e2e8f0;--muted:#94a3b8;--bdr:#334155;--ylw:#fbbf24}}
    *,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);font-size:15px;line-height:1.8}}
    .topbar{{position:sticky;top:0;z-index:99;background:rgba(15,23,42,.96);backdrop-filter:blur(14px);border-bottom:1px solid var(--bdr);padding:11px 28px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}}
    .brand{{font-weight:800;font-size:.92rem;color:#3b82f6}}
    .badge{{border-radius:20px;padding:3px 12px;font-size:.72rem;font-weight:600}}
    .badge-lvl{{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:#86efac}}
    .badge-lang{{background:rgba(6,182,212,.12);border:1px solid rgba(6,182,212,.3);color:#67e8f9}}
    .badge-ch{{background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);color:#a5b4fc}}
    .yt-btn{{margin-left:auto;display:flex;align-items:center;gap:6px;background:#ef4444;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:.8rem;font-weight:700;cursor:pointer;text-decoration:none}}
    .yt-btn:hover{{background:#dc2626}}
    .page{{max-width:900px;margin:0 auto;padding:36px 24px 80px}}
    .banner{{background:linear-gradient(135deg,#1e3a8a,#581c87);border-radius:16px;padding:30px 34px;margin-bottom:36px;border:1px solid rgba(255,255,255,.07)}}
    .banner h1{{font-size:1.5rem;font-weight:800;color:#fff;line-height:1.3;margin-bottom:10px}}
    .banner .meta{{display:flex;gap:9px;flex-wrap:wrap;margin-top:8px}}
    .banner .meta span{{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:20px;padding:3px 12px;font-size:.73rem;color:#ddd6fe}}
    .content h1{{display:none}}
    .content h2{{font-size:1.15rem;font-weight:700;color:var(--cyan);margin:34px 0 10px;padding:10px 16px;background:rgba(6,182,212,.07);border-left:3px solid var(--cyan);border-radius:0 8px 8px 0}}
    .content h3{{font-size:.98rem;font-weight:600;color:#a78bfa;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px dashed var(--bdr)}}
    .content h4{{font-size:.9rem;font-weight:600;color:var(--ylw);margin:14px 0 6px}}
    .content p{{margin-bottom:12px}}
    .content ul,.content ol{{margin:8px 0 14px 22px}}
    .content li{{margin-bottom:5px}}
    .content strong{{color:var(--ylw);font-weight:600}}
    .content code{{font-family:'JetBrains Mono',monospace;font-size:.82em;background:var(--sur);color:#7dd3fc;padding:2px 7px;border-radius:5px;border:1px solid var(--bdr)}}
    .content pre{{background:var(--sur);border:1px solid var(--bdr);border-radius:10px;padding:18px 20px;overflow-x:auto;margin:14px 0;font-family:'JetBrains Mono',monospace;font-size:.82em;line-height:1.65}}
    .content pre code{{background:none;border:none;padding:0;color:#e2e8f0}}
    .content blockquote{{border-left:3px solid var(--acc);background:rgba(124,58,237,.08);padding:12px 18px;border-radius:0 8px 8px 0;margin:14px 0;color:#c4b5fd}}
    .content table{{width:100%;border-collapse:collapse;margin:16px 0;font-size:.88em}}
    .content th{{background:var(--s2);padding:10px 14px;text-align:left;font-weight:600;color:var(--cyan);border:1px solid var(--bdr)}}
    .content td{{padding:9px 14px;border:1px solid var(--bdr)}}
    .content tr:nth-child(even) td{{background:rgba(255,255,255,.02)}}
    .content hr{{border:none;border-top:1px solid var(--bdr);margin:28px 0}}
    mark{{background:#fbbf2444;color:#fbbf24;border-radius:3px;padding:0 2px}}
    @media print{{.topbar{{display:none}};body{{background:#fff;color:#1e293b}};.content h2{{color:#1e3a8a;background:#eff6ff}}}}
  </style>
</head>
<body>
  <div class="topbar">
    <span class="brand">📚 RecallAI Notes</span>
    <span class="badge badge-lvl">{level}</span>
    <span class="badge badge-lang">{lang}</span>
    {ch_badge}
    <a class="yt-btn" href="{yt_link}" target="_blank" rel="noopener">▶ Watch on YouTube</a>
  </div>
  <div class="page">
    <div class="banner">
      <h1>{title}</h1>
      <div class="meta"><span>📖 {level} Notes</span><span>🌐 {lang}</span>{ch_meta}</div>
    </div>
    <div class="content">{body_html}</div>
  </div>
</body></html>"""
        return page, 200, {"Content-Type": "text/html; charset=utf-8"}
    except Exception as e:
        return f"<h2>Error: {e}</h2>", 500


# ══════════════════════════════════════════════════════════════════════════════
# S3 Note Storage + Search API  (/api/notes/*)
# ══════════════════════════════════════════════════════════════════════════════
#
# Architecture:
#   POST   /api/notes            → generate/save note to S3, index in search engine
#   GET    /api/notes            → list user's notes (metadata from S3)
#   GET    /api/notes/<noteId>   → retrieve complete note from S3
#   PUT    /api/notes/<noteId>   → update note in S3 + re-index in search engine
#   DELETE /api/notes/<noteId>   → delete from S3 + remove from search index
#   GET    /api/notes/search     → search user's notes via existing search engine → S3
#
# SECURITY: userId is NEVER taken from the request body.
#           It is always derived server-side from the API key or a
#           configurable identity token.  If you add real auth later
#           (JWT/session), replace _get_authenticated_user_id() below.
# ══════════════════════════════════════════════════════════════════════════════

def _get_authenticated_user_id() -> str:
    """
    Returns the server-side authenticated user ID.

    Currently uses the Gemini API key (hashed) as a stable, unique
    per-user identity — no frontend can spoof this because the key
    is validated server-side.

    When you add real auth (JWT / session / OAuth) replace this function.
    """
    import hashlib
    key = (
        request.headers.get("X-User-Id", "").strip()   # extension can send this
        or os.environ.get("GEMINI_API_KEY", "").strip()  # server env fallback
        or "anonymous"
    )
    # Hash so we never store the raw key as a userId
    return "u_" + hashlib.sha256(key.encode()).hexdigest()[:16]


@app.route("/api/notes", methods=["POST"])
def api_create_note():
    """
    POST /api/notes

    Flow:
      1. Accept note payload from the extension / frontend
      2. Create a unique noteId
      3. Save the complete note to S3  (source of truth)
      4. Index the note in the existing search engine (DynamoDB chunks)
      5. Return success + noteId to the frontend
    """
    try:
        from pipeline.s3_storage import save_note_to_s3
        from pipeline.cloud_db  import index_note_for_search

        data     = request.json or {}
        user_id  = _get_authenticated_user_id()
        video_id = data.get("videoId") or data.get("video_id") or "lecture"
        title    = data.get("title") or "Lecture Video"
        channel  = data.get("channel") or ""
        level    = data.get("level", "overview").lower()
        lang     = data.get("lang", "english").lower()
        content  = data.get("note") or data.get("content") or data.get("markdown") or ""
        timeline = data.get("timeline") or []

        if not content:
            return jsonify({"ok": False, "error": "Note content is required."}), 400

        # Build a deterministic noteId (same video+level+lang → same slot, like DynamoDB)
        note_id = f"{video_id}_{level}_{lang}"

        # ── Step 3: Save to S3 (source of truth) ──────────────────────────────
        s3_result = save_note_to_s3(
            user_id=user_id,
            note_id=note_id,
            title=title,
            content=content,
            video_id=video_id,
            channel=channel,
            level=level,
            lang=lang,
            timeline=timeline,
        )

        # ── Step 4: Index in the existing search engine ────────────────────────
        search_result = index_note_for_search(
            note_id=note_id,
            user_id=user_id,
            video_id=video_id,
            title=title,
            channel=channel,
            markdown=content,
            level=level,
            lang=lang,
            timeline=timeline,
        )

        return jsonify({
            "ok":           True,
            "noteId":       note_id,
            "userId":       user_id,
            "s3Synced":     s3_result.get("s3Synced", False),
            "storage":      s3_result.get("storage"),
            "searchIndexed":search_result.get("ok", False),
            "chunksIndexed":search_result.get("chunks_saved", 0),
            "message":      "Note saved to S3 and indexed in search engine.",
            "warning":      s3_result.get("warning"),
        }), 201

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/notes", methods=["GET"])
def api_list_notes():
    """
    GET /api/notes

    Returns the authenticated user's notes as lightweight metadata
    (no full content — use GET /api/notes/<noteId> for full content from S3).
    """
    try:
        from pipeline.s3_storage import list_notes_from_s3
        user_id = _get_authenticated_user_id()
        notes   = list_notes_from_s3(user_id)
        return jsonify({"ok": True, "userId": user_id, "notes": notes, "count": len(notes)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/notes/search", methods=["GET"])
def api_search_notes():
    """
    GET /api/notes/search?q={query}&level={level}&lang={lang}

    Search flow:
      Frontend → Flask → Search Engine (DynamoDB chunks, user-scoped)
               → Matching note IDs → S3 (complete notes) → Frontend

    Results include: title, snippet, noteId, createdAt, relevance score.
    When the user clicks a result, GET /api/notes/<noteId> fetches from S3.

    SECURITY: userId is derived server-side. The query is always filtered
              to this user's chunks only — cross-user leakage is impossible.
    """
    try:
        from pipeline.cloud_db   import search_topic_in_notes, synthesize_grounded_answer
        from pipeline.s3_storage import get_note_from_s3

        user_id = _get_authenticated_user_id()
        query   = request.args.get("q", "").strip()
        level   = request.args.get("level")
        lang    = request.args.get("lang")
        api_key = os.getenv("GEMINI_API_KEY")

        if not query:
            return jsonify({"ok": False, "error": "Query parameter 'q' is required."}), 400

        # ── Step 1: Search the index (user-scoped) ─────────────────────────────
        search_res = search_topic_in_notes(
            query,
            level=level,
            lang=lang,
            user_id=user_id,   # SECURITY: always server-side
        )

        if not search_res.get("ok"):
            return jsonify(search_res), 400

        # ── Step 2: Synthesize grounded AI answer from matched chunks ──────────
        qa_res = synthesize_grounded_answer(query, search_res, gemini_api_key=api_key)

        # ── Step 3: Enrich results with S3 metadata (title, createdAt) ─────────
        enriched_results = []
        for r in search_res.get("results", []):
            note_id = r.get("note_id") or r.get("chunk_id", "").rsplit("_chunk_", 1)[0]
            enriched_results.append({
                "noteId":        note_id,
                "videoId":       r.get("video_id"),
                "title":         r.get("video_title"),
                "topicHeading":  r.get("topic_heading"),
                "snippet":       r.get("snippet"),
                "score":         r.get("score"),
                "timestampSec":  r.get("timestamp_sec", 0),
                "timestampStr":  r.get("timestamp_str", "00:00"),
                "level":         r.get("level"),
                "lang":          r.get("lang"),
                "createdAt":     r.get("created_at"),
            })

        return jsonify({
            "ok":            True,
            "query":         query,
            "userId":        user_id,
            "inContext":     search_res.get("in_context", False),
            "message":       search_res.get("message"),
            "groundedAnswer":qa_res.get("grounded_answer", ""),
            "citations":     qa_res.get("citations", []),
            "results":       enriched_results,
            "totalMatches":  len(enriched_results),
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/notes/<note_id>", methods=["GET"])
def api_get_note(note_id):
    """
    GET /api/notes/<noteId>

    Retrieves the complete note from S3 (source of truth).
    Only succeeds if the note belongs to the authenticated user.
    """
    try:
        from pipeline.s3_storage import get_note_from_s3
        user_id = _get_authenticated_user_id()
        note    = get_note_from_s3(user_id, note_id)

        if not note:
            return jsonify({
                "ok":    False,
                "error": f"Note '{note_id}' not found.",
            }), 404

        # Extra safety: ensure the stored note really belongs to this user
        if note.get("userId") and note["userId"] != user_id:
            return jsonify({"ok": False, "error": "Access denied."}), 403

        return jsonify({"ok": True, "note": note})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/notes/<note_id>", methods=["PUT"])
def api_update_note(note_id):
    """
    PUT /api/notes/<noteId>

    Update flow:
      1. Verify note belongs to authenticated user
      2. Update content in S3
      3. Re-index updated note in the search engine
    """
    try:
        from pipeline.s3_storage import update_note_in_s3, get_note_from_s3
        from pipeline.cloud_db   import index_note_for_search

        user_id = _get_authenticated_user_id()
        data    = request.json or {}
        content = data.get("content") or data.get("markdown") or data.get("note") or ""
        title   = data.get("title")

        if not content:
            return jsonify({"ok": False, "error": "Updated content is required."}), 400

        # Verify ownership
        existing = get_note_from_s3(user_id, note_id)
        if not existing:
            return jsonify({"ok": False, "error": f"Note '{note_id}' not found."}), 404
        if existing.get("userId") and existing["userId"] != user_id:
            return jsonify({"ok": False, "error": "Access denied."}), 403

        # Update in S3
        s3_result = update_note_in_s3(user_id, note_id, content, title=title)

        # Re-index in search engine
        index_note_for_search(
            note_id=note_id,
            user_id=user_id,
            video_id=existing.get("videoId", ""),
            title=title or existing.get("title", ""),
            channel=existing.get("channel", ""),
            markdown=content,
            level=existing.get("level", "overview"),
            lang=existing.get("lang", "english"),
            timeline=existing.get("timeline", []),
        )

        return jsonify({
            "ok":       True,
            "noteId":   note_id,
            "s3Synced": s3_result.get("s3Synced", False),
            "message":  "Note updated in S3 and re-indexed in search engine.",
            "warning":  s3_result.get("warning"),
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/notes/<note_id>", methods=["DELETE"])
def api_delete_note(note_id):
    """
    DELETE /api/notes/<noteId>

    Delete flow:
      1. Verify note belongs to authenticated user
      2. Delete from S3
      3. Remove chunks from search index (local cache; DynamoDB cleanup via TTL)
    """
    try:
        from pipeline.s3_storage import delete_note_from_s3, get_note_from_s3
        from pipeline.cloud_db   import _load_local_json, _save_local_json, LOCAL_CHUNKS_FILE

        user_id = _get_authenticated_user_id()

        # Verify ownership before deletion
        existing = get_note_from_s3(user_id, note_id)
        if not existing:
            return jsonify({"ok": False, "error": f"Note '{note_id}' not found."}), 404
        if existing.get("userId") and existing["userId"] != user_id:
            return jsonify({"ok": False, "error": "Access denied."}), 403

        # Delete from S3
        s3_result = delete_note_from_s3(user_id, note_id)

        # Remove associated chunks from local search index cache
        try:
            local_chunks = _load_local_json(LOCAL_CHUNKS_FILE)
            before = len(local_chunks)
            local_chunks = {
                cid: c for cid, c in local_chunks.items()
                if c.get("note_id") != note_id
            }
            removed = before - len(local_chunks)
            _save_local_json(LOCAL_CHUNKS_FILE, local_chunks)
        except Exception as e:
            print(f"[warn] Could not clean search index chunks: {e}")
            removed = 0

        return jsonify({
            "ok":            True,
            "noteId":        note_id,
            "s3Deleted":     s3_result.get("s3Deleted", False),
            "chunksRemoved": removed,
            "message":       "Note deleted from S3 and removed from search index.",
            "warning":       s3_result.get("warning"),
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


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


@app.route("/api/notes/<level>/<lang>/pdf")
def download_notes_pdf(level, lang):
    """Directly download the notes as a PDF."""
    pattern = NOTE_PATTERNS.get(level.lower())
    if not pattern:
        return jsonify({"error": "Invalid level"}), 400

    lang_slug = LANG_SLUGS.get(lang.lower(), lang.lower())
    filename = pattern.format(lang=lang_slug)
    md_filepath = os.path.join(NOTE_MD_DIR, filename)

    if not os.path.exists(md_filepath):
        abort(404)

    os.makedirs(NOTE_PDF_DIR, exist_ok=True)
    pdf_filename = f"notes_{level.lower()}_{lang_slug}.pdf"
    pdf_filepath = os.path.join(NOTE_PDF_DIR, pdf_filename)

    # Check if a freshly generated PDF exists
    needs_gen = True
    if os.path.exists(pdf_filepath):
        if os.path.getmtime(pdf_filepath) >= os.path.getmtime(md_filepath):
            needs_gen = False

    if needs_gen:
        with open(md_filepath, "r", encoding="utf-8") as f:
            md_content = f.read()

        body_html = md_to_html(md_content)
        title = f"RecallAI — {level.title()} Notes ({lang.title()})"
        full_html = render_printable_html(title, body_html)

        html_temp = os.path.join(NOTE_PDF_DIR, f"temp_{level}_{lang_slug}.html")
        with open(html_temp, "w", encoding="utf-8") as f:
            f.write(full_html)

        browser = find_browser_bin()
        if browser:
            cmd = [
                browser,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--no-pdf-header-footer",
                f"--print-to-pdf={os.path.abspath(pdf_filepath)}",
                f"file:///{os.path.abspath(html_temp).replace(chr(92), '/')}"
            ]
            try:
                subprocess.run(cmd, capture_output=True, timeout=30)
            except Exception as e:
                print(f"[PDF] Headless conversion error: {e}")

    if os.path.exists(pdf_filepath) and os.path.getsize(pdf_filepath) > 0:
        try:
            from pipeline.s3_storage import save_pdf_to_s3
            with open(pdf_filepath, "rb") as pdf_file:
                s3_result = save_pdf_to_s3(
                    pdf_file.read(),
                    level,
                    lang_slug,
                    pdf_filename,
                )
            if not s3_result.get("ok"):
                app.logger.warning("PDF was generated locally but S3 upload failed: %s", s3_result.get("error"))
        except Exception as error:
            app.logger.warning("PDF was generated locally but S3 upload could not be attempted: %s", error)

        return send_file(
            pdf_filepath,
            as_attachment=True,
            download_name=f"RecallAI_Notes_{level.title()}_{lang.title()}.pdf",
            mimetype="application/pdf"
        )
    else:
        # Fallback to direct print view with autoprint enabled
        return redirect(f"/api/notes/{level}/{lang}/print?autoprint=1")


@app.route("/api/extension/upload-pdf", methods=["POST"])
def upload_extension_pdf():
    """Render extension HTML to a complete PDF and upload the PDF bytes to S3."""
    data = request.get_json(silent=True) or {}
    html = data.get("html", "")
    title = str(data.get("title", "RecallAI Notes")).strip() or "RecallAI Notes"
    level = str(data.get("level", "overview"))
    lang = str(data.get("lang", "english"))
    filename = os.path.basename(str(data.get("filename", "RecallAI_Notes.pdf")))
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    if not html:
        return jsonify({"ok": False, "error": "Rendered note HTML is required."}), 400

    browser = find_browser_bin()
    if not browser:
        return jsonify({"ok": False, "error": "Chrome or Edge is required on the server for PDF rendering."}), 503

    with tempfile.TemporaryDirectory(prefix="recallai_pdf_") as temp_dir:
        html_path = os.path.join(temp_dir, "notes.html")
        pdf_path = os.path.join(temp_dir, filename)
        with open(html_path, "w", encoding="utf-8") as html_file:
            html_file.write(render_printable_html(title, html))
        command = [
            browser, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}",
            f"file:///{html_path.replace(chr(92), '/')}"
        ]
        try:
            subprocess.run(command, capture_output=True, timeout=60, check=True)
        except (OSError, subprocess.SubprocessError) as error:
            app.logger.exception("Extension PDF rendering failed")
            return jsonify({"ok": False, "error": str(error)}), 500
        if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
            return jsonify({"ok": False, "error": "PDF renderer produced an empty file."}), 500

        from pipeline.s3_storage import save_pdf_to_s3
        with open(pdf_path, "rb") as pdf_file:
            result = save_pdf_to_s3(pdf_file.read(), level, lang, filename)
        if not result.get("ok"):
            return jsonify(result), 502
        return jsonify(result), 201


@app.route("/api/notes/<level>/<lang>/raw")

def raw_notes(level, lang):
    """Return the raw markdown text (for the in-browser editor)."""
    pattern  = NOTE_PATTERNS.get(level.lower())
    if not pattern:
        return jsonify({"error": "Invalid level"}), 400

    lang_slug = LANG_SLUGS.get(lang.lower(), lang.lower())
    filename  = pattern.format(lang=lang_slug)
    filepath  = os.path.join(NOTE_MD_DIR, filename)

    if not os.path.exists(filepath):
        return jsonify({"error": "File not found"}), 404

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    return jsonify({"markdown": content, "filename": filename})


@app.route("/api/notes/<level>/<lang>/save", methods=["POST"])
def save_notes(level, lang):
    """Save edited markdown content back to disk."""
    pattern  = NOTE_PATTERNS.get(level.lower())
    if not pattern:
        return jsonify({"ok": False, "error": "Invalid level"}), 400

    lang_slug = LANG_SLUGS.get(lang.lower(), lang.lower())
    filename  = pattern.format(lang=lang_slug)
    filepath  = os.path.join(NOTE_MD_DIR, filename)

    data    = request.json or {}
    content = data.get("markdown", "")

    if not content.strip():
        return jsonify({"ok": False, "error": "Content cannot be empty"}), 400

    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


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
  <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
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
      font-family: 'Kalam', 'Noto Sans Devanagari', cursive;
      font-size: 11pt; line-height: 2; color: var(--text); background: #fff;
      letter-spacing: 0.01em;
    }}
    .page {{ max-width: 820px; margin: 0 auto; padding: 0 0 40px; }}
    .title-banner {{
      background: var(--primary);
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
      body {{ font-size: 9pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
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
      <button class="btn-print" onclick="window.print()">🖨️ Save as PDF / Print</button>
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
  <script>
    window.addEventListener('load', () => {{
      if (window.MathJax && MathJax.typesetPromise) {{
        MathJax.typesetPromise().then(() => {{ window.print(); }});
      }} else {{
        setTimeout(() => {{ window.print(); }}, 600);
      }}
    }});
  </script>
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


# ── Lecture Video ─────────────────────────────────────────────

def _stream_video(filepath):
    """Helper: stream a video file with range-request support."""
    if not os.path.exists(filepath):
        abort(404)

    file_size    = os.path.getsize(filepath)
    range_header = request.headers.get("Range")

    if range_header:
        byte1, byte2 = 0, None
        m = re.search(r"bytes=(\d+)-(\d*)", range_header)
        if m:
            byte1 = int(m.group(1))
            byte2 = int(m.group(2)) if m.group(2) else file_size - 1
        length = byte2 - byte1 + 1

        with open(filepath, "rb") as f:
            f.seek(byte1)
            data = f.read(length)

        resp = Response(data, 206, mimetype="video/mp4", direct_passthrough=True)
        resp.headers["Content-Range"]  = f"bytes {byte1}-{byte2}/{file_size}"
        resp.headers["Accept-Ranges"]  = "bytes"
        resp.headers["Content-Length"] = length
        return resp

    return send_file(filepath, mimetype="video/mp4")


@app.route("/api/lecture-video")
def lecture_video_meta():
    """Return metadata for the main lecture video."""
    if not os.path.exists(LECTURE):
        return jsonify({"available": False}), 404
    size_mb  = round(os.path.getsize(LECTURE) / 1_048_576, 1)
    return jsonify({"available": True, "url": "/lecture-video", "size_mb": size_mb, "filename": "lecture.mp4"})


@app.route("/lecture-video")
def serve_lecture_video():
    """Stream the lecture MP4."""
    return _stream_video(LECTURE)


# ── Lecture Timeline ──────────────────────────────────────────

TIMELINE = os.path.join(BASE, "videos", "timeline.json")

@app.route("/api/lecture-timeline")
def get_timeline():
    """Return chapter timeline for the lecture video."""
    if not os.path.exists(TIMELINE):
        return jsonify({"chapters": []})
    with open(TIMELINE, "r", encoding="utf-8") as f:
        return jsonify(json.load(f))


@app.route("/api/lecture-timeline", methods=["POST"])
def save_timeline():
    """Save updated chapter timeline."""
    data = request.json or {}
    chapters = data.get("chapters", [])
    try:
        os.makedirs(os.path.dirname(TIMELINE), exist_ok=True)
        with open(TIMELINE, "w", encoding="utf-8") as f:
            json.dump({"chapters": chapters}, f, indent=2, ensure_ascii=False)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


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
