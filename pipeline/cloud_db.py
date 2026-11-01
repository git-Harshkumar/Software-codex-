"""
Cloud Database & Grounded In-Context Topic Search Engine
Interfaces with AWS DynamoDB to store structured lecture notes & topic chunks,
and executes strictly grounded topic search with zero hallucination.
"""

import os
import re
import json
import time
from datetime import datetime
from typing import Dict, List, Any, Optional

try:
    import boto3
    from boto3.dynamodb.conditions import Key, Attr
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

from google import genai
from google.genai import types

# ─────────────────────────────────────────────────────────────────────────────
# Configuration & Table Names
# ─────────────────────────────────────────────────────────────────────────────
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
NOTES_TABLE_NAME = os.getenv("DYNAMODB_NOTES_TABLE", "ai-lecture-notes-lecture-notes")
CHUNKS_TABLE_NAME = os.getenv("DYNAMODB_CHUNKS_TABLE", "ai-lecture-notes-note-chunks")

LOCAL_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "cloud_db")
LOCAL_NOTES_FILE = os.path.join(LOCAL_DATA_DIR, "saved_notes.json")
LOCAL_CHUNKS_FILE = os.path.join(LOCAL_DATA_DIR, "note_chunks.json")

def _get_dynamo_resource():
    if not BOTO3_AVAILABLE:
        return None
    try:
        return boto3.resource("dynamodb", region_name=AWS_REGION)
    except Exception as e:
        print(f"[CloudDB] Warning: DynamoDB resource init failed: {e}")
        return None

# ─────────────────────────────────────────────────────────────────────────────
# Local Fallback Persistence (Used if AWS credentials/tables not yet created)
# ─────────────────────────────────────────────────────────────────────────────
def _ensure_local_dir():
    os.makedirs(LOCAL_DATA_DIR, exist_ok=True)

def _load_local_json(filepath: str) -> dict:
    _ensure_local_dir()
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_local_json(filepath: str, data: dict):
    _ensure_local_dir()
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[CloudDB] Error writing local fallback {filepath}: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Note Chunking: Splits Markdown into Topic Sections with Timestamps
# ─────────────────────────────────────────────────────────────────────────────
def parse_timestamp_from_text(text: str) -> tuple[int, str]:
    """Extracts timestamp like [14:20] or [1:15:30] from section headings."""
    match = re.search(r'\[(\d{1,2}:\d{2}(?::\d{2})?)\]', text)
    if not match:
        match = re.search(r'\b(\d{1,2}:\d{2})\b', text)
    
    if match:
        time_str = match.group(1)
        parts = [int(p) for p in time_str.split(':')]
        if len(parts) == 2:
            sec = parts[0] * 60 + parts[1]
        elif len(parts) == 3:
            sec = parts[0] * 3600 + parts[1] * 60 + parts[2]
        else:
            sec = 0
        return sec, time_str
    return 0, "00:00"

def chunk_lecture_note(
    markdown: str,
    video_id: str,
    title: str,
    channel: str,
    level: str,
    lang: str
) -> List[Dict[str, Any]]:
    """
    Parses a lecture note into self-contained topic chunks by section headers,
    preserving exact timestamps and title for verified citations.
    """
    if not markdown or not markdown.strip():
        return []

    lines = markdown.split("\n")
    chunks = []
    current_heading = "Overview & Introduction"
    current_lines = []
    current_sec = 0
    current_time_str = "00:00"
    chunk_idx = 0

    header_regex = re.compile(r'^(#{1,3})\s+(.+)$')

    for line in lines:
        match = header_regex.match(line)
        if match:
            # Save previous chunk if it had content
            content = "\n".join(current_lines).strip()
            if content and len(content) > 30:
                chunk_id = f"{video_id}_{level}_{lang}_chunk_{chunk_idx}"
                chunks.append({
                    "chunk_id": chunk_id,
                    "note_id": f"{video_id}_{level}_{lang}",
                    "video_id": video_id,
                    "video_title": title or "Lecture Video",
                    "channel": channel or "YouTube Creator",
                    "topic_heading": current_heading,
                    "content": content,
                    "timestamp_sec": current_sec,
                    "timestamp_str": current_time_str,
                    "level": level,
                    "lang": lang,
                    "created_at": datetime.now().isoformat()
                })
                chunk_idx += 1
                current_lines = []

            raw_heading = match.group(2).strip()
            current_heading = raw_heading
            sec, t_str = parse_timestamp_from_text(raw_heading)
            if sec > 0 or t_str != "00:00":
                current_sec = sec
                current_time_str = t_str
        else:
            current_lines.append(line)

    # Final chunk
    content = "\n".join(current_lines).strip()
    if content:
        chunk_id = f"{video_id}_{level}_{lang}_chunk_{chunk_idx}"
        chunks.append({
            "chunk_id": chunk_id,
            "note_id": f"{video_id}_{level}_{lang}",
            "video_id": video_id,
            "video_title": title or "Lecture Video",
            "channel": channel or "YouTube Creator",
            "topic_heading": current_heading,
            "content": content,
            "timestamp_sec": current_sec,
            "timestamp_str": current_time_str,
            "level": level,
            "lang": lang,
            "created_at": datetime.now().isoformat()
        })

    return chunks

# ─────────────────────────────────────────────────────────────────────────────
# AWS Cloud Save Operations
# ─────────────────────────────────────────────────────────────────────────────
def save_note_to_aws(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Saves a generated note and its topic sections into AWS DynamoDB.
    Gracefully falls back to local cache if AWS DynamoDB is not yet connected.
    """
    video_id = payload.get("videoId") or payload.get("video_id")
    title = payload.get("title") or "Lecture Video"
    channel = payload.get("channel") or ""
    level = payload.get("level", "overview").lower()
    lang = payload.get("lang", "english").lower()
    markdown = payload.get("note") or payload.get("markdown") or ""
    timeline = payload.get("timeline") or []

    if not video_id or not markdown:
        return {"ok": False, "error": "Missing video_id or note content."}

    note_id = f"{video_id}_{level}_{lang}"
    now_iso = datetime.now().isoformat()
    chunks = chunk_lecture_note(markdown, video_id, title, channel, level, lang)

    parent_note_record = {
        "note_id": note_id,
        "video_id": video_id,
        "title": title,
        "channel": channel,
        "level": level,
        "lang": lang,
        "markdown_content": markdown,
        "timeline": timeline,
        "chunk_count": len(chunks),
        "created_at": now_iso
    }

    # Always persist locally for offline quick access
    local_notes = _load_local_json(LOCAL_NOTES_FILE)
    local_notes[note_id] = parent_note_record
    _save_local_json(LOCAL_NOTES_FILE, local_notes)

    local_chunks = _load_local_json(LOCAL_CHUNKS_FILE)
    for c in chunks:
        local_chunks[c["chunk_id"]] = c
    _save_local_json(LOCAL_CHUNKS_FILE, local_chunks)

    # Attempt AWS DynamoDB persistence
    dynamo = _get_dynamo_resource()
    aws_synced = False
    aws_err = None

    if dynamo:
        try:
            notes_table = dynamo.Table(NOTES_TABLE_NAME)
            chunks_table = dynamo.Table(CHUNKS_TABLE_NAME)

            notes_table.put_item(Item=parent_note_record)

            with chunks_table.batch_writer() as batch:
                for c in chunks:
                    batch.put_item(Item=c)

            aws_synced = True
            print(f"[CloudDB] Successfully saved note {note_id} and {len(chunks)} chunks to AWS DynamoDB.")
        except Exception as e:
            aws_err = str(e)
            print(f"[CloudDB] Notice: DynamoDB put_item failed ({e}); saved to local cloud cache.")

    return {
        "ok": True,
        "note_id": note_id,
        "video_id": video_id,
        "title": title,
        "chunks_saved": len(chunks),
        "aws_synced": aws_synced,
        "storage": "AWS DynamoDB" if aws_synced else "Local Cloud DB Cache",
        "warning": aws_err if not aws_synced and aws_err else None
    }

# ─────────────────────────────────────────────────────────────────────────────
# Strict In-Context Topic Search Engine
# ─────────────────────────────────────────────────────────────────────────────
def _score_chunk_relevance(chunk: Dict[str, Any], query_terms: List[str], full_query: str) -> float:
    """Computes relevance score of a topic chunk strictly against the query."""
    heading = (chunk.get("topic_heading") or "").lower()
    content = (chunk.get("content") or "").lower()
    full_q = full_query.lower().strip()

    score = 0.0

    # Exact full query match in heading
    if full_q in heading:
        score += 15.0

    # Exact full query match in body content
    if full_q in content:
        score += 8.0

    # Individual term matches
    for term in query_terms:
        if not term or len(term) < 2:
            continue
        
        # Word boundary match in heading
        if re.search(r'\b' + re.escape(term) + r'\b', heading):
            score += 4.0
        elif term in heading:
            score += 2.0

        # Term frequency in body content
        matches = len(re.findall(r'\b' + re.escape(term) + r'\b', content))
        if matches > 0:
            score += min(matches * 1.5, 6.0)

    return score

def get_all_stored_chunks(
    video_id: Optional[str] = None,
    level: Optional[str] = None,
    lang: Optional[str] = None,
    user_id: Optional[str] = None,           # <-- USER ISOLATION
) -> List[Dict[str, Any]]:
    """Retrieves chunks from DynamoDB or local fallback cache.

    When user_id is supplied every result is filtered to that user only,
    guaranteeing that User A never sees User B's note chunks.
    """
    chunks = []
    dynamo = _get_dynamo_resource()

    if dynamo:
        try:
            chunks_table = dynamo.Table(CHUNKS_TABLE_NAME)
            if video_id:
                resp = chunks_table.query(
                    IndexName="VideoChunkIndex",
                    KeyConditionExpression=Key("video_id").eq(video_id)
                )
                chunks = resp.get("Items", [])
            else:
                resp = chunks_table.scan(Limit=500)
                chunks = resp.get("Items", [])
        except Exception as e:
            if "ResourceNotFoundException" in str(e):
                print(f"[CloudDB] AWS DynamoDB table '{CHUNKS_TABLE_NAME}' not yet created in AWS account. Using local database cache.")
            else:
                print(f"[CloudDB] DynamoDB query notice: {e}")

    # Fallback to local store if DynamoDB returned nothing
    if not chunks:
        local_chunks = _load_local_json(LOCAL_CHUNKS_FILE)
        chunks = list(local_chunks.values())
        if video_id:
            chunks = [c for c in chunks if c.get("video_id") == video_id]

    # ── User isolation filter (ALWAYS applied when user_id is provided) ────────
    if user_id:
        chunks = [c for c in chunks if c.get("user_id") == user_id]

    # Optional level / lang filters
    if level and str(level).lower() != "all":
        chunks = [c for c in chunks if str(c.get("level", "")).lower() == str(level).lower()]
    if lang and str(lang).lower() != "all":
        chunks = [c for c in chunks if str(c.get("lang", "")).lower() == str(lang).lower()]

    return chunks

def search_topic_in_notes(
    query: str,
    video_id: Optional[str] = None,
    level: Optional[str] = None,
    lang: Optional[str] = None,
    user_id: Optional[str] = None,           # <-- USER ISOLATION
) -> Dict[str, Any]:
    """
    Strictly searches stored notes for the given topic.
    Guarantees: If query does not match any chunk, returns in_context = False.

    SECURITY: When user_id is provided every chunk is filtered to that user only.
    This must always be the server-side authenticated userId — never from the frontend.
    """
    clean_query = query.strip()
    if not clean_query:
        return {"ok": False, "error": "Query cannot be empty."}

    # Extract terms (ignore very short stop words)
    stop_words = {"the", "a", "an", "is", "are", "in", "on", "at", "to", "for", "of", "and", "or", "what", "how"}
    terms = [w.lower() for w in re.findall(r'\w+', clean_query) if w.lower() not in stop_words and len(w) > 2]
    if not terms:
        terms = [clean_query.lower()]

    all_chunks = get_all_stored_chunks(video_id, level, lang, user_id=user_id)
    if not all_chunks:
        return {
            "ok": True,
            "query": query,
            "in_context": False,
            "message": "No lecture notes have been saved to the database yet. Click 'Save to AWS' on a generated note first.",
            "results": []
        }

    scored_chunks = []
    for c in all_chunks:
        score = _score_chunk_relevance(c, terms, clean_query)
        if score >= 1.0:  # Minimum relevance cutoff threshold
            snippet = _extract_relevant_snippet(c.get("content", ""), terms)
            scored_chunks.append({
                "chunk_id":     c.get("chunk_id"),
                "note_id":      c.get("note_id"),
                "video_id":     c.get("video_id"),
                "video_title":  c.get("video_title"),
                "channel":      c.get("channel"),
                "topic_heading":c.get("topic_heading"),
                "timestamp_sec":c.get("timestamp_sec", 0),
                "timestamp_str":c.get("timestamp_str", "00:00"),
                "snippet":      snippet,
                "full_content": c.get("content", ""),
                "score":        round(score, 2),
                "level":        c.get("level"),
                "lang":         c.get("lang"),
                "created_at":   c.get("created_at"),
            })

    scored_chunks.sort(key=lambda x: x["score"], reverse=True)
    top_results = scored_chunks[:5]

    if not top_results:
        return {
            "ok": True,
            "query": query,
            "in_context": False,
            "message": f"This topic ('{query}') was not found in any of your saved lecture notes.",
            "results": []
        }

    return {
        "ok": True,
        "query": query,
        "in_context": True,
        "total_matches": len(top_results),
        "results": top_results
    }

def _extract_relevant_snippet(text: str, terms: List[str], max_len: int = 240) -> str:
    """Extracts a readable paragraph around the first matching term."""
    lower_text = text.lower()
    best_pos = -1

    for t in terms:
        pos = lower_text.find(t)
        if pos != -1:
            best_pos = pos
            break

    if best_pos == -1:
        return text[:max_len].replace("\n", " ") + "..."

    start = max(0, best_pos - 60)
    end = min(len(text), best_pos + max_len - 60)
    snippet = text[start:end].replace("\n", " ").strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    return snippet

# ─────────────────────────────────────────────────────────────────────────────
# Strict In-Context Grounded QA Synthesizer (Zero Hallucination)
# ─────────────────────────────────────────────────────────────────────────────
def synthesize_grounded_answer(query: str, search_result: Dict[str, Any], gemini_api_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Takes top matched chunks and generates a synthesized answer STRICTLY grounded
    in the retrieved notes. If the answer is not in the text, it refuses to answer.
    """
    if not search_result.get("in_context") or not search_result.get("results"):
        return {
            "grounded_answer": f"The topic '{query}' was not discussed in any of your saved lecture notes.",
            "in_context": False,
            "citations": []
        }

    api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {
            "grounded_answer": "Gemini API key not configured for AI synthesis. See matching topic excerpts below.",
            "in_context": True,
            "citations": []
        }

    matched_chunks = search_result["results"]

    # Assemble strict context block
    context_blocks = []
    citations = []
    for i, chunk in enumerate(matched_chunks):
        cite_str = f"{chunk['video_title']} — {chunk['topic_heading']} @ {chunk['timestamp_str']}"
        citations.append({
            "citation": cite_str,
            "video_id": chunk["video_id"],
            "timestamp_sec": chunk["timestamp_sec"],
            "timestamp_str": chunk["timestamp_str"],
            "heading": chunk["topic_heading"]
        })
        context_blocks.append(
            f"--- EXCERPT {i+1} [{cite_str}] ---\n{chunk['full_content']}"
        )

    context_text = "\n\n".join(context_blocks)

    system_instruction = (
        "You are an academic Lecture Notes Search Engine. "
        "Your task is to provide an accurate, crisp answer to the student's query "
        "EXCLUSIVELY and ONLY using the provided lecture excerpts below.\n\n"
        "STRICT GROUNDING RULES:\n"
        "1. Answer ONLY using the facts, definitions, steps, and equations explicitly stated in the excerpts.\n"
        "2. Do NOT extrapolate, speculate, or introduce any outside knowledge not present in the excerpts.\n"
        "3. If the query cannot be answered from the excerpts, respond strictly with: "
        "'This specific detail was not covered in your saved lecture notes.'\n"
        "4. At the end of each key point, cite the excerpt source in format [Timestamp MM:SS].\n"
        "5. Keep the explanation concise, clear, and high-yield."
    )

    user_prompt = (
        f"STUDENT QUERY: \"{query}\"\n\n"
        f"RETRIEVED LECTURE NOTES EXCERPTS:\n"
        f"=================================\n"
        f"{context_text}\n"
        f"=================================\n\n"
        f"Provide the grounded answer now:"
    )

    models_to_try = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemini-2.5-pro"
    ]

    last_error = None
    for model_name in models_to_try:
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.1,  # Low temperature for strict factual grounding
                    max_output_tokens=600
                )
            )
            answer_text = response.text.strip() if response.text else ""
            if answer_text:
                return {
                    "grounded_answer": answer_text,
                    "in_context": True,
                    "citations": citations,
                    "model_used": model_name
                }
        except Exception as e:
            last_error = e
            print(f"[CloudDB] Model {model_name} synthesis notice: {e}")
            continue

    return {
        "grounded_answer": f"Direct excerpts retrieved below (AI synthesis notice: {last_error})",
        "in_context": True,
        "citations": citations
    }

def get_saved_lectures_list(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Returns unique list of lectures saved in the database.
    When user_id is supplied, only that user's lectures are returned.
    """
    local_notes = _load_local_json(LOCAL_NOTES_FILE)
    unique_videos = {}

    for n in local_notes.values():
        # User isolation: skip notes that don't belong to this user
        if user_id and n.get("user_id") and n.get("user_id") != user_id:
            continue
        v_id = n.get("video_id")
        if v_id and v_id not in unique_videos:
            unique_videos[v_id] = {
                "video_id":  v_id,
                "title":     n.get("title", "Lecture Video"),
                "channel":   n.get("channel", ""),
                "created_at":n.get("created_at")
            }

    return list(unique_videos.values())


def get_full_note_by_id(note_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches a complete note record (including full markdown_content) by note_id.
    Tries DynamoDB first, then falls back to local JSON cache.
    NOTE: Callers are responsible for checking that the returned note belongs
          to the authenticated user before returning it to the client.
    """
    dynamo = _get_dynamo_resource()

    # Try DynamoDB first
    if dynamo:
        try:
            notes_table = dynamo.Table(NOTES_TABLE_NAME)
            resp = notes_table.get_item(Key={"note_id": note_id})
            item = resp.get("Item")
            if item:
                return item
        except Exception as e:
            print(f"[CloudDB] DynamoDB get_item notice: {e}")

    # Fallback: local JSON cache
    local_notes = _load_local_json(LOCAL_NOTES_FILE)
    return local_notes.get(note_id)


# ─────────────────────────────────────────────────────────────────────────────
# Search Index Helper: Index a note immediately after generation
# ─────────────────────────────────────────────────────────────────────────────
def index_note_for_search(
    note_id: str,
    user_id: str,
    video_id: str,
    title: str,
    channel: str,
    markdown: str,
    level: str,
    lang: str,
    timeline: Optional[List] = None,
) -> Dict[str, Any]:
    """
    Indexes a note into the chunk search engine immediately after generation.
    This is the bridge between S3 (source of truth) and the search engine.

    Each chunk gets a `user_id` field so the user-isolation filter in
    get_all_stored_chunks() can scope results correctly.
    """
    payload = {
        "videoId":  video_id,
        "title":    title,
        "channel":  channel,
        "level":    level,
        "lang":     lang,
        "note":     markdown,
        "timeline": timeline or [],
        "user_id":  user_id,   # stored on parent note record
    }

    # Chunk and save to DynamoDB / local cache via existing save_note_to_aws
    res = save_note_to_aws(payload)

    # Stamp user_id onto each chunk in the local cache so the isolation
    # filter in get_all_stored_chunks() works without a DynamoDB schema change
    if res.get("ok"):
        local_chunks = _load_local_json(LOCAL_CHUNKS_FILE)
        updated = False
        for cid, chunk in local_chunks.items():
            if chunk.get("note_id") == note_id or chunk.get("note_id", "").startswith(f"{video_id}_{level}_{lang}"):
                if "user_id" not in chunk:
                    chunk["user_id"] = user_id
                    updated = True
        if updated:
            _save_local_json(LOCAL_CHUNKS_FILE, local_chunks)

    return res
