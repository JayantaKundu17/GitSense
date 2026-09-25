from __future__ import annotations

import ast
import io
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import requests

TEXT_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".cpp", ".cc", ".cxx", ".c",
    ".h", ".hpp", ".cs", ".go", ".rs", ".php", ".rb", ".swift", ".kt", ".kts",
    ".html", ".css", ".scss", ".sql", ".sh", ".bash", ".md", ".txt", ".json",
    ".yaml", ".yml", ".xml", ".toml", ".ini", ".cfg",
}
SKIP_PARTS = {".git", "node_modules", "venv", ".venv", "__pycache__", "dist", "build", ".next", ".vite", "target"}
SKIP_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar", ".pth", ".pt", ".onnx", ".mp3", ".wav", ".mp4", ".mov", ".exe", ".dll", ".so", ".dylib"}
MAX_FILE_BYTES = 300_000
MAX_REPO_DOWNLOAD_BYTES = 60 * 1024 * 1024


def _is_text(path: str) -> bool:
    p = Path(path.lower())
    if set(p.parts) & SKIP_PARTS:
        return False
    if p.suffix in SKIP_EXTENSIONS:
        return False
    return p.suffix in TEXT_EXTENSIONS


def _download_zip(owner: str, repo: str, branch: str) -> bytes:
    url = f"https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}"
    response = requests.get(url, timeout=60, stream=True, headers={"User-Agent": "GitSense-Advanced-Analysis"})
    if response.status_code != 200:
        raise RuntimeError(f"Could not download repository archive (HTTP {response.status_code}).")
    chunks, total = [], 0
    for piece in response.iter_content(chunk_size=1024 * 1024):
        if not piece:
            continue
        total += len(piece)
        if total > MAX_REPO_DOWNLOAD_BYTES:
            raise RuntimeError("Repository archive is larger than the 60 MB analysis limit.")
        chunks.append(piece)
    return b"".join(chunks)


def load_source_files(owner: str, repo: str, branch: str) -> dict[str, str]:
    archive = _download_zip(owner, repo, branch)
    files: dict[str, str] = {}
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        for member in zf.infolist():
            if member.is_dir() or member.file_size > MAX_FILE_BYTES:
                continue
            parts = Path(member.filename).parts
            if len(parts) < 2:
                continue
            path = "/".join(parts[1:])
            if not _is_text(path):
                continue
            try:
                text = zf.read(member).decode("utf-8", errors="ignore")
            except Exception:
                continue
            if text.strip():
                files[path] = text
    return files


def security_scan(files: dict[str, str]) -> list[dict[str, Any]]:
    patterns = [
        ("HIGH", "Potential hardcoded secret", re.compile(r"(?i)(api[_-]?key|secret[_-]?key|access[_-]?token|password)\s*[:=]\s*[\"'][^\"']{8,}[\"']")),
        ("HIGH", "Potential private key material", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
        ("HIGH", "Potential SQL injection pattern", re.compile(r"(?i)(execute|cursor\.execute|query)\s*\([^\n]*(%s|\{\}|\+\s*[A-Za-z_]|f[\"'])")),
        ("MEDIUM", "Potential command injection pattern", re.compile(r"(?i)(os\.system|subprocess\.(?:run|Popen|call)|child_process\.exec)\s*\([^\n]*(input|request|params|argv|query)")),
        ("MEDIUM", "TLS certificate verification disabled", re.compile(r"(?i)verify\s*=\s*False")),
        ("MEDIUM", "Potential unsafe deserialization", re.compile(r"(?i)(pickle\.loads|yaml\.load\s*\(|marshal\.loads)")),
        ("LOW", "Debug logging may expose sensitive data", re.compile(r"(?i)(print|console\.log|logger\.(?:debug|info))\s*\([^\n]*(password|token|secret|api[_-]?key)")),
    ]
    findings = []
    for path, text in files.items():
        for line_no, line in enumerate(text.splitlines(), 1):
            for severity, title, pattern in patterns:
                if pattern.search(line):
                    findings.append({"severity": severity, "title": title, "path": path, "line": line_no, "snippet": line.strip()[:220]})
                    break
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    findings.sort(key=lambda x: (order[x["severity"]], x["path"], x["line"]))
    return findings[:100]


def _normalized_lines(text: str) -> list[str]:
    lines = []
    for line in text.splitlines():
        s = re.sub(r"\s+", " ", line.strip())
        if not s or s.startswith("#") or s.startswith("//") or s.startswith("/*") or s.startswith("*"):
            continue
        lines.append(s)
    return lines


def duplicate_code_scan(files: dict[str, str]) -> list[dict[str, Any]]:
    block_map: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for path, text in files.items():
        lines = text.splitlines()
        normalized = _normalized_lines(text)
        if len(normalized) < 6:
            continue
        # Consecutive normalized blocks. Approximate source line is located by searching first line.
        for i in range(len(normalized) - 5):
            block = "\n".join(normalized[i:i + 6])
            key = str(hash(block))
            original_line = 1
            first = normalized[i]
            for n, raw in enumerate(lines, 1):
                if re.sub(r"\s+", " ", raw.strip()) == first:
                    original_line = n
                    break
            block_map[key].append((path, original_line))
    results = []
    seen_pairs = set()
    for occurrences in block_map.values():
        unique = list(dict.fromkeys(occurrences))
        if len({p for p, _ in unique}) < 2:
            continue
        for i in range(len(unique)):
            for j in range(i + 1, len(unique)):
                a, b = unique[i], unique[j]
                pair = tuple(sorted([a[0], b[0]]))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                results.append({"file_a": a[0], "line_a": a[1], "file_b": b[0], "line_b": b[1], "matching_lines": 6})
    return results[:50]


def dead_code_scan(files: dict[str, str]) -> list[dict[str, Any]]:
    findings = []
    py_defs: dict[str, list[tuple[str, int]]] = defaultdict(list)
    py_calls = Counter()
    for path, text in files.items():
        if Path(path).suffix != ".py":
            continue
        try:
            tree = ast.parse(text)
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                py_defs[node.name].append((path, node.lineno))
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                py_calls[node.func.id] += 1
    for name, defs in py_defs.items():
        if name.startswith("_") or name in {"main", "setup"}:
            continue
        if py_calls[name] == 0:
            for path, line in defs:
                findings.append({"type": "unused_python_symbol", "name": name, "path": path, "line": line})
    return findings[:100]


def _github_request(endpoint: str, token: str | None = None):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "GitSense"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    response = requests.get(f"https://api.github.com{endpoint}", headers=headers, timeout=15)
    if response.status_code != 200:
        try:
            msg = response.json().get("message", "GitHub API request failed")
        except Exception:
            msg = "GitHub API request failed"
        raise RuntimeError(f"{msg} (HTTP {response.status_code})")
    return response.json()


def github_issues(owner: str, repo: str, token: str | None = None) -> dict[str, Any]:
    items = _github_request(f"/repos/{owner}/{repo}/issues?state=open&per_page=30", token)
    issues, prs = [], []
    for item in items:
        data = {"number": item.get("number"), "title": item.get("title"), "state": item.get("state"), "url": item.get("html_url"), "user": (item.get("user") or {}).get("login"), "created_at": item.get("created_at"), "updated_at": item.get("updated_at"), "labels": [x.get("name") for x in item.get("labels", [])]}
        if item.get("pull_request"):
            prs.append(data)
        else:
            issues.append(data)
    return {"issues": issues, "pull_requests": prs, "open_issue_count": len(issues), "open_pr_count": len(prs)}


def most_changed_files(owner: str, repo: str, token: str | None = None, limit: int = 10) -> list[dict[str, Any]]:
    commits = _github_request(f"/repos/{owner}/{repo}/commits?per_page={limit}", token)
    counts = Counter()
    additions = Counter()
    deletions = Counter()
    commit_touch = Counter()
    for commit in commits:
        sha = commit.get("sha")
        if not sha:
            continue
        try:
            detail = _github_request(f"/repos/{owner}/{repo}/commits/{sha}", token)
        except Exception:
            continue
        for file in detail.get("files", []):
            path = file.get("filename")
            if not path:
                continue
            counts[path] += 1
            additions[path] += file.get("additions", 0) or 0
            deletions[path] += file.get("deletions", 0) or 0
            commit_touch[path] += 1
    result = []
    for path, touches in counts.most_common(20):
        result.append({"path": path, "commit_changes": touches, "additions": additions[path], "deletions": deletions[path], "total_changed_lines": additions[path] + deletions[path]})
    return result


def advanced_analysis(owner: str, repo: str, branch: str, token: str | None = None) -> dict[str, Any]:
    files = load_source_files(owner, repo, branch)
    security = security_scan(files)
    dead_code = dead_code_scan(files)
    duplicate = duplicate_code_scan(files)
    issues = github_issues(owner, repo, token)
    changed = most_changed_files(owner, repo, token, limit=10)
    return {
        "security": {"findings": security, "count": len(security), "high": sum(x["severity"] == "HIGH" for x in security), "medium": sum(x["severity"] == "MEDIUM" for x in security), "low": sum(x["severity"] == "LOW" for x in security)},
        "dead_code": {"findings": dead_code, "count": len(dead_code)},
        "duplicate_code": {"findings": duplicate, "count": len(duplicate)},
        "most_changed_files": changed,
        "github": issues,
        "analysis": {"files_scanned": len(files), "note": "Security and dead-code findings are heuristic and should be manually reviewed."},
    }
