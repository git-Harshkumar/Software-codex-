"""
s3_storage.py
=============
AWS S3 Permanent Note Storage Layer

Stores each generated note as a structured JSON object at:
    s3://{BUCKET}/users/{userId}/notes/{noteId}.json

Design principles:
  - User isolation enforced at the storage key level (userId never from frontend)
  - Private bucket only — no public ACLs ever set
  - Graceful local-disk fallback if S3 is unavailable (mirrors cloud_db.py pattern)
  - All credentials via IAM role (EC2) or environment variables — NEVER hardcoded
"""

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
AWS_REGION        = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET_NAME    = os.getenv("S3_NOTES_BUCKET", "ai-lecture-notes-notes-store")

# Local fallback directory (mirrors cloud_db.py local cache pattern)
_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_S3_CACHE_DIR = os.path.join(_BASE, "data", "s3_cache")

# ─────────────────────────────────────────────────────────────────────────────
# boto3 import — optional, graceful degradation if not installed
# ─────────────────────────────────────────────────────────────────────────────
try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False


def _get_s3_client():
    """Returns an authenticated S3 client, or None if unavailable."""
    if not BOTO3_AVAILABLE:
        return None
    try:
        return boto3.client("s3", region_name=AWS_REGION)
    except Exception as e:
        print(f"[S3Storage] Warning: Could not create S3 client: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# S3 Key Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _note_s3_key(user_id: str, note_id: str) -> str:
    """Returns the canonical S3 object key for a note.
    Pattern: users/{userId}/notes/{noteId}.json
    """
    return f"users/{user_id}/notes/{note_id}.json"


def _user_prefix(user_id: str) -> str:
    """Returns the S3 prefix for listing all of a user's notes."""
    return f"users/{user_id}/notes/"


def _pdf_s3_key(level: str, lang: str, filename: str) -> str:
    safe_level = "".join(ch for ch in level.lower() if ch.isalnum() or ch in "-_")
    safe_lang = "".join(ch for ch in lang.lower() if ch.isalnum() or ch in "-_")
    safe_filename = os.path.basename(filename)
    return f"pdf/{safe_level}/{safe_lang}/{safe_filename}"


# ─────────────────────────────────────────────────────────────────────────────
# Local Fallback Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _local_note_path(user_id: str, note_id: str) -> str:
    return os.path.join(LOCAL_S3_CACHE_DIR, user_id, f"{note_id}.json")


def _ensure_local_dirs(user_id: str):
    os.makedirs(os.path.join(LOCAL_S3_CACHE_DIR, user_id), exist_ok=True)


def _save_local(user_id: str, note_id: str, note_obj: dict):
    _ensure_local_dirs(user_id)
    path = _local_note_path(user_id, note_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(note_obj, f, indent=2, ensure_ascii=False)


def _load_local(user_id: str, note_id: str) -> Optional[dict]:
    path = _local_note_path(user_id, note_id)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def _list_local(user_id: str) -> List[dict]:
    user_dir = os.path.join(LOCAL_S3_CACHE_DIR, user_id)
    if not os.path.isdir(user_dir):
        return []
    notes = []
    for fname in os.listdir(user_dir):
        if fname.endswith(".json"):
            try:
                with open(os.path.join(user_dir, fname), "r", encoding="utf-8") as f:
                    notes.append(json.load(f))
            except Exception:
                pass
    return notes


def _delete_local(user_id: str, note_id: str):
    path = _local_note_path(user_id, note_id)
    if os.path.exists(path):
        os.remove(path)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def save_note_to_s3(
    user_id: str,
    note_id: str,
    title: str,
    content: str,
    video_id: str = "",
    channel: str = "",
    level: str = "overview",
    lang: str = "english",
    timeline: Optional[List] = None,
    extra_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Saves a generated note to S3 as the source of truth.

    S3 key pattern: users/{userId}/notes/{noteId}.json

    Note JSON shape:
    {
        "noteId":    "...",
        "userId":    "...",
        "title":     "...",
        "content":   "...",     <- full markdown
        "videoId":   "...",
        "channel":   "...",
        "level":     "...",
        "lang":      "...",
        "timeline":  [...],
        "createdAt": "ISO-8601",
        "updatedAt": "ISO-8601"
    }

    Always persists to local cache first so the app works offline.
    Credentials come from EC2 IAM role or AWS_* env vars, never from code.
    """
    if not user_id or not note_id:
        return {"ok": False, "error": "user_id and note_id are required."}
    if not content:
        return {"ok": False, "error": "Note content cannot be empty."}

    now_iso = datetime.now(timezone.utc).isoformat()

    note_obj: Dict[str, Any] = {
        "noteId":    note_id,
        "userId":    user_id,
        "title":     title or "Lecture Video",
        "content":   content,
        "videoId":   video_id or "",
        "channel":   channel or "",
        "level":     level,
        "lang":      lang,
        "timeline":  timeline or [],
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }
    if extra_metadata:
        note_obj.update(extra_metadata)

    # Always save locally first
    _save_local(user_id, note_id, note_obj)

    # Attempt S3 upload
    s3 = _get_s3_client()
    s3_synced = False
    s3_error  = None

    if s3 and S3_BUCKET_NAME:
        key  = _note_s3_key(user_id, note_id)
        body = json.dumps(note_obj, ensure_ascii=False, indent=2).encode("utf-8")
        try:
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=key,
                Body=body,
                ContentType="application/json",
                # No ACL — bucket is private by design
            )
            s3_synced = True
            print(f"[S3Storage] Saved note {note_id} -> s3://{S3_BUCKET_NAME}/{key}")
        except ClientError as e:
            s3_error = str(e)
            print(f"[S3Storage] S3 put_object notice ({note_id}): {e}")
        except NoCredentialsError:
            s3_error = "No AWS credentials found. Using local cache."
            print(f"[S3Storage] {s3_error}")
        except Exception as e:
            s3_error = str(e)
            print(f"[S3Storage] Unexpected S3 error: {e}")

    return {
        "ok":       True,
        "noteId":   note_id,
        "userId":   user_id,
        "s3Synced": s3_synced,
        "storage":  f"s3://{S3_BUCKET_NAME}/{_note_s3_key(user_id, note_id)}" if s3_synced else "Local S3 Cache",
        "warning":  s3_error if not s3_synced else None,
    }


def save_pdf_to_s3(
    pdf_bytes: bytes,
    level: str,
    lang: str,
    filename: str,
) -> Dict[str, Any]:
    """Stores a complete PDF object in the configured private S3 bucket."""
    if not pdf_bytes:
        return {"ok": False, "error": "PDF content cannot be empty."}
    if not S3_BUCKET_NAME:
        return {"ok": False, "error": "S3_NOTES_BUCKET is not configured."}

    key = _pdf_s3_key(level, lang, filename)
    s3 = _get_s3_client()
    if not s3:
        return {"ok": False, "error": "AWS S3 client is unavailable."}

    try:
        s3.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=key,
            Body=pdf_bytes,
            ContentType="application/pdf",
            ContentDisposition=f'attachment; filename="{os.path.basename(filename)}"',
        )
        stored = s3.head_object(Bucket=S3_BUCKET_NAME, Key=key)
        if int(stored.get("ContentLength", -1)) != len(pdf_bytes):
            return {
                "ok": False,
                "error": "S3 object size does not match the generated PDF.",
            }
        return {
            "ok": True,
            "bucket": S3_BUCKET_NAME,
            "key": key,
            "size": len(pdf_bytes),
            "content_type": "application/pdf",
        }
    except ClientError as error:
        return {"ok": False, "error": str(error)}


def get_note_from_s3(user_id: str, note_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves the complete note JSON from S3.
    Falls back to local cache if S3 is unavailable.

    IMPORTANT: user_id is always the server-side authenticated user.
    The S3 key scoping makes cross-user reads structurally impossible.
    """
    if not user_id or not note_id:
        return None

    s3 = _get_s3_client()

    if s3 and S3_BUCKET_NAME:
        key = _note_s3_key(user_id, note_id)
        try:
            resp = s3.get_object(Bucket=S3_BUCKET_NAME, Key=key)
            body = resp["Body"].read().decode("utf-8")
            return json.loads(body)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("NoSuchKey", "404"):
                return None  # Note doesn't exist for this user
            print(f"[S3Storage] S3 get_object notice ({note_id}): {e}")
        except Exception as e:
            print(f"[S3Storage] Unexpected S3 get error: {e}")

    # Fallback to local cache
    return _load_local(user_id, note_id)


def list_notes_from_s3(user_id: str) -> List[Dict[str, Any]]:
    """
    Lists all notes for a user. Returns lightweight summary objects
    (not full content) suitable for a notes list view.

    S3 LIST is scoped to users/{userId}/notes/ so it cannot leak other users' data.
    """
    if not user_id:
        return []

    s3 = _get_s3_client()
    summaries: List[Dict[str, Any]] = []

    if s3 and S3_BUCKET_NAME:
        prefix = _user_prefix(user_id)
        try:
            paginator = s3.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=S3_BUCKET_NAME, Prefix=prefix)
            keys = [obj["Key"] for page in pages for obj in page.get("Contents", [])]

            for key in keys:
                try:
                    resp = s3.get_object(Bucket=S3_BUCKET_NAME, Key=key)
                    note = json.loads(resp["Body"].read().decode("utf-8"))
                    summaries.append({
                        "noteId":    note.get("noteId"),
                        "userId":    note.get("userId"),
                        "title":     note.get("title"),
                        "videoId":   note.get("videoId"),
                        "channel":   note.get("channel"),
                        "level":     note.get("level"),
                        "lang":      note.get("lang"),
                        "createdAt": note.get("createdAt"),
                        "updatedAt": note.get("updatedAt"),
                    })
                except Exception as e:
                    print(f"[S3Storage] Could not read {key}: {e}")

            if summaries:
                summaries.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
                return summaries

        except ClientError as e:
            print(f"[S3Storage] S3 list_objects notice: {e}")
        except Exception as e:
            print(f"[S3Storage] Unexpected S3 list error: {e}")

    # Fallback to local cache
    local_notes = _list_local(user_id)
    summaries = [
        {
            "noteId":    n.get("noteId"),
            "userId":    n.get("userId"),
            "title":     n.get("title"),
            "videoId":   n.get("videoId"),
            "channel":   n.get("channel"),
            "level":     n.get("level"),
            "lang":      n.get("lang"),
            "createdAt": n.get("createdAt"),
            "updatedAt": n.get("updatedAt"),
        }
        for n in local_notes
    ]
    summaries.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    return summaries


def update_note_in_s3(
    user_id: str,
    note_id: str,
    content: str,
    title: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Updates an existing note in S3 and local cache.
    Preserves original createdAt; sets updatedAt to now.
    """
    existing = get_note_from_s3(user_id, note_id)
    if not existing:
        return {"ok": False, "error": f"Note '{note_id}' not found for this user."}

    existing["content"]   = content
    existing["updatedAt"] = datetime.now(timezone.utc).isoformat()
    if title:
        existing["title"] = title

    _save_local(user_id, note_id, existing)

    s3 = _get_s3_client()
    s3_synced = False
    s3_error  = None

    if s3 and S3_BUCKET_NAME:
        key  = _note_s3_key(user_id, note_id)
        body = json.dumps(existing, ensure_ascii=False, indent=2).encode("utf-8")
        try:
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=key,
                Body=body,
                ContentType="application/json",
            )
            s3_synced = True
        except Exception as e:
            s3_error = str(e)
            print(f"[S3Storage] S3 update notice ({note_id}): {e}")

    return {
        "ok":       True,
        "noteId":   note_id,
        "s3Synced": s3_synced,
        "warning":  s3_error if not s3_synced else None,
    }


def delete_note_from_s3(user_id: str, note_id: str) -> Dict[str, Any]:
    """
    Deletes a note from S3 and local cache.
    S3 key scoping ensures a user can only delete their own notes.
    """
    if not user_id or not note_id:
        return {"ok": False, "error": "user_id and note_id are required."}

    _delete_local(user_id, note_id)

    s3 = _get_s3_client()
    s3_deleted = False
    s3_error   = None

    if s3 and S3_BUCKET_NAME:
        key = _note_s3_key(user_id, note_id)
        try:
            s3.delete_object(Bucket=S3_BUCKET_NAME, Key=key)
            s3_deleted = True
            print(f"[S3Storage] Deleted s3://{S3_BUCKET_NAME}/{key}")
        except Exception as e:
            s3_error = str(e)
            print(f"[S3Storage] S3 delete notice ({note_id}): {e}")

    return {
        "ok":        True,
        "noteId":    note_id,
        "s3Deleted": s3_deleted,
        "warning":   s3_error if not s3_deleted else None,
    }
