"""
GitSense local RAG engine.

Uses:
- GitHub codeload ZIP to fetch a public repository in one download
- Sentence Transformers for local embeddings
- NumPy for persistent vector storage + cosine similarity

No paid embedding API is required.
"""

from __future__ import annotations

import io
import json
import re
import shutil
import zipfile
from pathlib import Path
from typing import Any

import numpy as np
import requests
from sentence_transformers import SentenceTransformer


MODEL_NAME = "all-MiniLM-L6-v2"
INDEX_ROOT = Path(__file__).resolve().parent / "rag_indexes"
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200
MAX_FILE_BYTES = 300_000
MAX_REPO_DOWNLOAD_BYTES = 60 * 1024 * 1024

TEXT_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx",
    ".java", ".cpp", ".cc", ".cxx", ".c",
    ".h", ".hpp", ".cs", ".go", ".rs", ".php",
    ".rb", ".swift", ".kt", ".kts",
    ".html", ".css", ".scss", ".sql",
    ".sh", ".bash", ".md", ".txt",
    ".json", ".yaml", ".yml", ".xml",
    ".toml", ".ini", ".cfg",
    ".ipynb",
}

SKIP_PARTS = {
    ".git", "node_modules", "venv", ".venv",
    "__pycache__", "dist", "build",
    ".next", ".vite", "target",
}

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".ico", ".pdf", ".zip", ".tar", ".gz",
    ".7z", ".rar", ".pth", ".pt", ".onnx",
    ".mp3", ".wav", ".mp4", ".mov",
    ".exe", ".dll", ".so", ".dylib",
}


_model: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    global _model

    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)

    return _model


def _safe_repo_key(owner: str, repo: str, version: str) -> str:
    raw = f"{owner}__{repo}__{version}"
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", raw)


def _is_text_file(path: str) -> bool:
    lower = path.lower()
    parts = set(Path(lower).parts)

    if parts & SKIP_PARTS:
        return False

    suffix = Path(lower).suffix

    if suffix in SKIP_EXTENSIONS:
        return False

    return suffix in TEXT_EXTENSIONS


def _decode_bytes(data: bytes, path: str) -> str:
    if path.lower().endswith(".ipynb"):
        try:
            notebook = json.loads(data.decode("utf-8", errors="ignore"))
            pieces = []

            for cell in notebook.get("cells", []):
                source = cell.get("source", [])
                if isinstance(source, list):
                    pieces.extend(source)
                elif isinstance(source, str):
                    pieces.append(source)

            return "\n".join(pieces)
        except Exception:
            return ""

    return data.decode("utf-8", errors="ignore")


def _chunk_text(text: str, path: str) -> list[dict[str, Any]]:
    lines = text.splitlines()

    if not lines:
        return []

    chunks: list[dict[str, Any]] = []
    start = 0

    while start < len(lines):
        current: list[str] = []
        current_chars = 0
        end = start

        while end < len(lines):
            line = lines[end]

            if current and current_chars + len(line) + 1 > CHUNK_SIZE:
                break

            current.append(line)
            current_chars += len(line) + 1
            end += 1

        chunk_text = "\n".join(current).strip()

        if chunk_text:
            chunks.append({
                "path": path,
                "start_line": start + 1,
                "end_line": end,
                "text": chunk_text,
            })

        if end >= len(lines):
            break

        next_start = end
        overlap_chars = 0

        while next_start > start and overlap_chars < CHUNK_OVERLAP:
            next_start -= 1
            overlap_chars += len(lines[next_start]) + 1

        start = max(next_start, start + 1)

    return chunks


def _download_repository_zip(
    owner: str,
    repo: str,
    branch: str,
) -> bytes:
    url = (
        f"https://codeload.github.com/"
        f"{owner}/{repo}/zip/refs/heads/{branch}"
    )

    response = requests.get(
        url,
        timeout=60,
        stream=True,
        headers={"User-Agent": "GitSense-RAG"},
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"Could not download repository archive "
            f"(HTTP {response.status_code})."
        )

    chunks: list[bytes] = []
    total = 0

    for piece in response.iter_content(chunk_size=1024 * 1024):
        if not piece:
            continue

        total += len(piece)

        if total > MAX_REPO_DOWNLOAD_BYTES:
            raise RuntimeError(
                "Repository archive is larger than the "
                "60 MB GitSense RAG limit."
            )

        chunks.append(piece)

    return b"".join(chunks)


def _build_index(
    owner: str,
    repo: str,
    branch: str,
    version: str,
    index_dir: Path,
) -> dict[str, Any]:
    archive = _download_repository_zip(owner, repo, branch)

    chunks: list[dict[str, Any]] = []

    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        for member in zf.infolist():
            if member.is_dir():
                continue

            # The ZIP normally contains owner-repo-branch/... .
            relative_parts = Path(member.filename).parts

            if len(relative_parts) < 2:
                continue

            path = "/".join(relative_parts[1:])

            if not _is_text_file(path):
                continue

            if member.file_size > MAX_FILE_BYTES:
                continue

            try:
                data = zf.read(member)
            except Exception:
                continue

            text = _decode_bytes(data, path)

            if not text.strip():
                continue

            chunks.extend(_chunk_text(text, path))

    if not chunks:
        raise RuntimeError(
            "No indexable source files were found in the repository."
        )

    model = get_embedding_model()

    texts = [
        f"FILE: {item['path']}\n{item['text']}"
        for item in chunks
    ]

    embeddings = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
    ).astype("float32")

    index_dir.mkdir(parents=True, exist_ok=True)

    np.save(index_dir / "embeddings.npy", embeddings)

    with open(index_dir / "chunks.json", "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False)

    metadata = {
        "owner": owner,
        "repo": repo,
        "branch": branch,
        "version": version,
        "model": MODEL_NAME,
        "chunk_count": len(chunks),
    }

    with open(index_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return metadata


def _load_index(index_dir: Path):
    embeddings_path = index_dir / "embeddings.npy"
    chunks_path = index_dir / "chunks.json"
    metadata_path = index_dir / "metadata.json"

    if not (
        embeddings_path.exists()
        and chunks_path.exists()
        and metadata_path.exists()
    ):
        return None

    embeddings = np.load(embeddings_path)

    with open(chunks_path, "r", encoding="utf-8") as f:
        chunks = json.load(f)

    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    return embeddings, chunks, metadata


def get_or_build_index(
    owner: str,
    repo: str,
    branch: str,
    version: str,
):
    INDEX_ROOT.mkdir(parents=True, exist_ok=True)

    key = _safe_repo_key(owner, repo, version)
    index_dir = INDEX_ROOT / key

    loaded = _load_index(index_dir)

    if loaded is not None:
        return loaded

    # Keep the local folder from accumulating obsolete versions.
    prefix = f"{owner}__{repo}__"
    for old_dir in INDEX_ROOT.iterdir():
        if old_dir.name.startswith(prefix) and old_dir != index_dir:
            shutil.rmtree(old_dir, ignore_errors=True)

    metadata = _build_index(
        owner,
        repo,
        branch,
        version,
        index_dir,
    )

    return (
        np.load(index_dir / "embeddings.npy"),
        json.loads(
            (index_dir / "chunks.json").read_text(
                encoding="utf-8"
            )
        ),
        metadata,
    )


def search_index(
    embeddings: np.ndarray,
    chunks: list[dict[str, Any]],
    question: str,
    top_k: int = 6,
):
    model = get_embedding_model()

    query_embedding = model.encode(
        [question],
        convert_to_numpy=True,
        normalize_embeddings=True,
    )[0].astype("float32")

    scores = embeddings @ query_embedding

    top_indices = np.argsort(scores)[::-1][:top_k]

    results = []

    for index in top_indices:
        score = float(scores[index])

        results.append({
            **chunks[int(index)],
            "score": round(score, 4),
        })

    return results


def retrieve(
    owner: str,
    repo: str,
    branch: str,
    version: str,
    question: str,
    top_k: int = 6,
):
    embeddings, chunks, metadata = get_or_build_index(
        owner,
        repo,
        branch,
        version,
    )

    results = search_index(
        embeddings,
        chunks,
        question,
        top_k=top_k,
    )

    return results, metadata
