from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from urllib.parse import urlparse

import requests
import os
import base64
import json
import re

from dotenv import load_dotenv
from google import genai

# RAG is imported lazily inside the repository chat endpoint so
# the rest of the API can still start if the optional RAG
# dependencies have not been installed yet.


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

# Cache successful GitHub API responses for this backend process.
GITHUB_CACHE = {}


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="GitSense API",
    description="GitHub repository intelligence and code analysis platform",
    version="2.0.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# BASIC ROUTES
# ============================================================

@app.get("/")
def root():
    return {
        "message": "GitSense API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


# ============================================================
# GITHUB URL PARSER
# ============================================================

def parse_github_url(url: str):

    parsed = urlparse(url)

    if parsed.netloc.lower() not in [
        "github.com",
        "www.github.com"
    ]:
        raise ValueError(
            "URL must be a GitHub repository URL"
        )

    parts = parsed.path.strip("/").split("/")

    if len(parts) < 2:
        raise ValueError(
            "Invalid GitHub repository URL"
        )

    owner = parts[0]
    repo = parts[1]

    repo = repo.removesuffix(".git")

    return owner, repo


# ============================================================
# GITHUB API
# ============================================================

def github_request(endpoint: str):

    if endpoint in GITHUB_CACHE:
        return GITHUB_CACHE[endpoint]

    url = f"https://api.github.com{endpoint}"

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "GitSense",
    }

    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = requests.get(
        url,
        headers=headers,
        timeout=15
    )

    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="GitHub repository not found"
        )

    if response.status_code == 403:
        remaining = response.headers.get("X-RateLimit-Remaining", "unknown")
        reset = response.headers.get("X-RateLimit-Reset", "unknown")
        raise HTTPException(
            status_code=403,
            detail=(
                "GitHub API rate limit reached or access was denied. "
                f"Remaining requests: {remaining}. Reset timestamp: {reset}."
            )
        )

    if response.status_code != 200:
        try:
            github_error = response.json().get("message", "GitHub API request failed")
        except Exception:
            github_error = "GitHub API request failed"
        raise HTTPException(
            status_code=response.status_code,
            detail=github_error
        )

    data = response.json()
    GITHUB_CACHE[endpoint] = data
    return data


# ============================================================
# REPOSITORY OVERVIEW
# ============================================================

@app.get("/api/repository")
def get_repository(url: str):

    try:

        owner, repo = parse_github_url(url)

        repository = github_request(
            f"/repos/{owner}/{repo}"
        )

        languages = github_request(
            f"/repos/{owner}/{repo}/languages"
        )

        return {
            "repository": {
                "name": repository["name"],
                "full_name": repository["full_name"],
                "owner": repository["owner"]["login"],
                "description": repository["description"],
                "url": repository["html_url"],
                "stars": repository["stargazers_count"],
                "forks": repository["forks_count"],
                "open_issues": repository["open_issues_count"],
                "watchers": repository["watchers_count"],
                "size_kb": repository["size"],
                "default_branch": repository["default_branch"],
                "created_at": repository["created_at"],
                "updated_at": repository["updated_at"],
                "license": (
                    repository["license"]["name"]
                    if repository["license"]
                    else None
                )
            },
            "languages": languages
        }

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


# ============================================================
# REPOSITORY FILE TREE
# ============================================================

@app.get("/api/repository/tree")
def get_repository_tree(url: str):

    try:

        owner, repo = parse_github_url(url)

        repository = github_request(
            f"/repos/{owner}/{repo}"
        )

        default_branch = repository["default_branch"]

        tree = github_request(
            f"/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"
        )

        files = []
        directories = []

        for item in tree.get("tree", []):

            if item["type"] == "blob":

                files.append({
                    "path": item["path"],
                    "size": item.get("size", 0)
                })

            elif item["type"] == "tree":

                directories.append(
                    item["path"]
                )

        extensions = {}

        for file in files:

            path = file["path"]

            if "." in path.split("/")[-1]:

                extension = "." + path.split(".")[-1].lower()

            else:

                extension = "no_extension"

            extensions[extension] = (
                extensions.get(extension, 0) + 1
            )

        return {

            "repository": f"{owner}/{repo}",

            "default_branch": default_branch,

            "total_files": len(files),

            "total_directories": len(directories),

            "files": files,

            "directories": directories,

            "file_extensions": extensions
        }

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


# ============================================================
# CODE STATISTICS
# ============================================================

@app.get("/api/repository/stats")
def get_repository_stats(url: str):

    try:

        owner, repo = parse_github_url(url)

        repository = github_request(
            f"/repos/{owner}/{repo}"
        )

        default_branch = repository["default_branch"]

        tree = github_request(
            f"/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"
        )

        file_paths = [
            item["path"]
            for item in tree.get("tree", [])
            if item["type"] == "blob"
        ]

        language_map = {

            ".py": "Python",
            ".js": "JavaScript",
            ".jsx": "JavaScript",
            ".ts": "TypeScript",
            ".tsx": "TypeScript",
            ".java": "Java",
            ".cpp": "C++",
            ".cc": "C++",
            ".cxx": "C++",
            ".c": "C",
            ".h": "C/C++ Header",
            ".hpp": "C++ Header",
            ".cs": "C#",
            ".go": "Go",
            ".rs": "Rust",
            ".php": "PHP",
            ".rb": "Ruby",
            ".swift": "Swift",
            ".kt": "Kotlin",
            ".kts": "Kotlin",
            ".html": "HTML",
            ".css": "CSS",
            ".scss": "SCSS",
            ".sql": "SQL",
            ".sh": "Shell",
            ".bash": "Shell",
            ".r": "R",
            ".ipynb": "Jupyter Notebook",
            ".md": "Markdown",
            ".json": "JSON",
            ".yaml": "YAML",
            ".yml": "YAML",
            ".xml": "XML"
        }

        total_lines = 0
        blank_lines = 0
        comment_lines = 0
        code_lines = 0

        language_stats = {}
        analyzed_files = []

        def read_github_file(path):

            data = github_request(
                f"/repos/{owner}/{repo}/contents/{path}"
            )

            if "content" not in data:
                return ""

            try:

                return base64.b64decode(
                    data["content"]
                ).decode(
                    "utf-8",
                    errors="ignore"
                )

            except Exception:

                return ""

        for path in file_paths:

            filename = path.split("/")[-1]

            if "." not in filename:
                continue

            extension = "." + filename.split(
                "."
            )[-1].lower()

            language = language_map.get(extension)

            if language is None:
                continue

            if extension in [
                ".png",
                ".jpg",
                ".jpeg",
                ".gif",
                ".webp",
                ".pth",
                ".zip"
            ]:
                continue

            content = read_github_file(path)

            if not content:
                continue

            lines = content.splitlines()

            file_total = len(lines)
            file_blank = 0
            file_comment = 0
            file_code = 0

            for line in lines:

                stripped = line.strip()

                if not stripped:

                    file_blank += 1
                    continue

                if (
                    stripped.startswith("#")
                    or stripped.startswith("//")
                    or stripped.startswith("/*")
                    or stripped.startswith("*")
                    or stripped.startswith("<!--")
                ):

                    file_comment += 1
                    continue

                file_code += 1

            total_lines += file_total
            blank_lines += file_blank
            comment_lines += file_comment
            code_lines += file_code

            if language not in language_stats:

                language_stats[language] = {
                    "files": 0,
                    "lines": 0
                }

            language_stats[language]["files"] += 1

            language_stats[language]["lines"] += file_total

            analyzed_files.append({
                "path": path,
                "language": language,
                "lines": file_total
            })

        language_stats = dict(
            sorted(
                language_stats.items(),
                key=lambda item: item[1]["lines"],
                reverse=True
            )
        )

        return {

            "repository": f"{owner}/{repo}",

            "total_files_analyzed": len(
                analyzed_files
            ),

            "total_lines": total_lines,

            "blank_lines": blank_lines,

            "comment_lines": comment_lines,

            "code_lines": code_lines,

            "languages": language_stats,

            "files": analyzed_files
        }

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


# ============================================================
# DEPENDENCY & TECH STACK ANALYSIS
# ============================================================

@app.get("/api/repository/dependencies")
def get_repository_dependencies(url: str):

    try:

        owner, repo = parse_github_url(url)

        repository = github_request(
            f"/repos/{owner}/{repo}"
        )

        default_branch = repository["default_branch"]

        tree = github_request(
            f"/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"
        )

        file_paths = [
            item["path"]
            for item in tree.get("tree", [])
            if item["type"] == "blob"
        ]

        detected_files = []
        technologies = []
        dependencies = []

        def read_github_file(path):

            data = github_request(
                f"/repos/{owner}/{repo}/contents/{path}"
            )

            if "content" not in data:
                return ""

            return base64.b64decode(
                data["content"]
            ).decode(
                "utf-8",
                errors="ignore"
            )

        # ----------------------------------------------------
        # PYTHON
        # ----------------------------------------------------

        if "requirements.txt" in file_paths:

            detected_files.append(
                "requirements.txt"
            )

            technologies.append(
                "Python"
            )

            content = read_github_file(
                "requirements.txt"
            )

            for line in content.splitlines():

                line = line.strip()

                if (
                    line
                    and not line.startswith("#")
                ):

                    package = (
                        line.split("==")[0]
                        .split(">=")[0]
                        .split("<=")[0]
                        .strip()
                    )

                    if package:

                        dependencies.append({
                            "name": package,
                            "source": "requirements.txt"
                        })

        # ----------------------------------------------------
        # NODE.JS
        # ----------------------------------------------------

        if "package.json" in file_paths:

            detected_files.append(
                "package.json"
            )

            technologies.append(
                "Node.js"
            )

            content = read_github_file(
                "package.json"
            )

            try:

                package_data = json.loads(
                    content
                )

                for name in package_data.get(
                    "dependencies",
                    {}
                ):

                    dependencies.append({
                        "name": name,
                        "source": "package.json"
                    })

                for name in package_data.get(
                    "devDependencies",
                    {}
                ):

                    dependencies.append({
                        "name": name,
                        "source": "package.json",
                        "type": "development"
                    })

            except json.JSONDecodeError:

                pass

        # ----------------------------------------------------
        # JAVA - MAVEN
        # ----------------------------------------------------

        if "pom.xml" in file_paths:

            detected_files.append(
                "pom.xml"
            )

            technologies.append(
                "Java"
            )

            content = read_github_file(
                "pom.xml"
            )

            matches = re.findall(
                r"<artifactId>(.*?)</artifactId>",
                content
            )

            for dependency in matches:

                dependencies.append({
                    "name": dependency,
                    "source": "pom.xml"
                })

        # ----------------------------------------------------
        # JAVA - GRADLE
        # ----------------------------------------------------

        for gradle_file in [
            "build.gradle",
            "build.gradle.kts"
        ]:

            if gradle_file in file_paths:

                detected_files.append(
                    gradle_file
                )

                technologies.append(
                    "Java"
                )

        # ----------------------------------------------------
        # GO
        # ----------------------------------------------------

        if "go.mod" in file_paths:

            detected_files.append(
                "go.mod"
            )

            technologies.append(
                "Go"
            )

            content = read_github_file(
                "go.mod"
            )

            inside_require_block = False

            for line in content.splitlines():

                line = line.strip()

                if line == "require (":

                    inside_require_block = True
                    continue

                if inside_require_block:

                    if line == ")":

                        inside_require_block = False
                        continue

                    parts = line.split()

                    if parts:

                        dependencies.append({
                            "name": parts[0],
                            "source": "go.mod"
                        })

        # ----------------------------------------------------
        # RUST
        # ----------------------------------------------------

        if "Cargo.toml" in file_paths:

            detected_files.append(
                "Cargo.toml"
            )

            technologies.append(
                "Rust"
            )

            content = read_github_file(
                "Cargo.toml"
            )

            in_dependencies = False

            for line in content.splitlines():

                line = line.strip()

                if line == "[dependencies]":

                    in_dependencies = True
                    continue

                if (
                    line.startswith("[")
                    and line != "[dependencies]"
                ):

                    in_dependencies = False

                if in_dependencies and "=" in line:

                    name = line.split(
                        "=",
                        1
                    )[0].strip()

                    if name:

                        dependencies.append({
                            "name": name,
                            "source": "Cargo.toml"
                        })

        # ----------------------------------------------------
        # C / C++
        # ----------------------------------------------------

        for indicator in [
            "CMakeLists.txt",
            "Makefile"
        ]:

            if indicator in file_paths:

                detected_files.append(
                    indicator
                )

                technologies.append(
                    "C/C++"
                )

        # ----------------------------------------------------
        # JAVASCRIPT / TYPESCRIPT
        # ----------------------------------------------------

        if any(
            path.endswith(".js")
            or path.endswith(".jsx")
            or path.endswith(".ts")
            or path.endswith(".tsx")
            for path in file_paths
        ):

            technologies.append(
                "JavaScript/TypeScript"
            )

        # ----------------------------------------------------
        # PYTHON FILE DETECTION
        # ----------------------------------------------------

        if any(
            path.endswith(".py")
            for path in file_paths
        ):

            if "Python" not in technologies:

                technologies.append(
                    "Python"
                )

        # ----------------------------------------------------
        # REMOVE DUPLICATES
        # ----------------------------------------------------

        technologies = list(
            dict.fromkeys(
                technologies
            )
        )

        detected_files = list(
            dict.fromkeys(
                detected_files
            )
        )

        return {

            "repository": f"{owner}/{repo}",

            "detected_technology": technologies,

            "dependency_files": detected_files,

            "dependency_count": len(
                dependencies
            ),

            "dependencies": dependencies
        }

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


# ============================================================
# GIT ACTIVITY
# ============================================================

@app.get("/api/repository/activity")
def get_repository_activity(url: str):

    try:

        owner, repo = parse_github_url(url)

        commits = github_request(
            f"/repos/{owner}/{repo}/commits?per_page=20"
        )

        contributors = github_request(
            f"/repos/{owner}/{repo}/contributors?per_page=20"
        )

        contributor_data = []

        for contributor in contributors:

            contributor_data.append({
                "login": contributor.get("login"),
                "contributions": contributor.get(
                    "contributions",
                    0
                ),
                "avatar_url": contributor.get(
                    "avatar_url"
                ),
                "html_url": contributor.get(
                    "html_url"
                )
            })

        recent_commits = []

        for commit in commits:

            commit_data = commit.get(
                "commit",
                {}
            )

            author = commit_data.get(
                "author",
                {}
            )

            recent_commits.append({

                "sha": commit.get(
                    "sha",
                    ""
                )[:7],

                "message": commit_data.get(
                    "message",
                    ""
                ).split("\n")[0],

                "author": author.get(
                    "name",
                    "Unknown"
                ),

                "date": author.get(
                    "date"
                ),

                "url": commit.get(
                    "html_url"
                )
            })

        return {

            "repository": f"{owner}/{repo}",

            "recent_commit_count": len(
                recent_commits
            ),

            "recent_contributor_count": len(
                contributor_data
            ),

            "contributors": contributor_data,

            "recent_commits": recent_commits
        }

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


# ============================================================
# REPOSITORY HEALTH
# ============================================================

@app.get("/api/repository/health")
def get_repository_health(url: str):

    try:

        owner, repo = parse_github_url(url)

        tree_data = get_repository_tree(url)
        stats_data = get_repository_stats(url)
        dependencies_data = get_repository_dependencies(url)
        activity_data = get_repository_activity(url)

        total_files = tree_data["total_files"]
        total_lines = stats_data["total_lines"]
        code_lines = stats_data["code_lines"]
        comment_lines = stats_data["comment_lines"]

        language_count = len(
            stats_data["languages"]
        )

        dependency_count = dependencies_data[
            "dependency_count"
        ]

        contributor_count = activity_data[
            "recent_contributor_count"
        ]

        recent_commit_count = activity_data[
            "recent_commit_count"
        ]

        # ----------------------------------------------------
        # PROJECT SIZE
        # ----------------------------------------------------

        if total_files < 50:
            project_size = "Small"

        elif total_files < 200:
            project_size = "Medium"

        else:
            project_size = "Large"

        # ----------------------------------------------------
        # ACTIVITY
        # ----------------------------------------------------

        if recent_commit_count >= 10:
            activity = "Active"

        elif recent_commit_count >= 3:
            activity = "Moderately Active"

        else:
            activity = "Low Activity"

        # ----------------------------------------------------
        # TECHNOLOGY DIVERSITY
        # ----------------------------------------------------

        if language_count <= 2:
            technology_diversity = "Low"

        elif language_count <= 5:
            technology_diversity = "Moderate"

        else:
            technology_diversity = "High"

        # ----------------------------------------------------
        # CODE PERCENTAGE
        # ----------------------------------------------------

        if total_lines > 0:

            code_percentage = round(
                (code_lines / total_lines) * 100,
                1
            )

            comment_percentage = round(
                (comment_lines / total_lines) * 100,
                1
            )

        else:

            code_percentage = 0
            comment_percentage = 0

        # ----------------------------------------------------
        # INSIGHTS
        # ----------------------------------------------------

        insights = []

        insights.append(
            f"The repository has {recent_commit_count} "
            f"recent commits available for analysis."
        )

        if contributor_count == 1:

            insights.append(
                "Recent repository activity is associated "
                "with a single contributor."
            )

        elif contributor_count > 1:

            insights.append(
                f"Recent repository activity includes "
                f"{contributor_count} contributors."
            )

        else:

            insights.append(
                "No recent contributors were detected."
            )

        insights.append(
            f"The codebase contains {language_count} "
            f"detected programming language(s)."
        )

        insights.append(
            f"{dependency_count} dependencies were detected "
            f"from project configuration files."
        )

        insights.append(
            f"The analyzed codebase contains "
            f"{comment_percentage}% comment lines."
        )

        return {

            "repository": f"{owner}/{repo}",

            "health": {

                "project_size": project_size,

                "activity": activity,

                "technology_diversity": technology_diversity,

                "languages": language_count,

                "dependencies": dependency_count,

                "contributors": contributor_count,

                "recent_commits": recent_commit_count
            },

            "metrics": {

                "total_files": total_files,

                "total_directories": tree_data[
                    "total_directories"
                ],

                "total_lines": total_lines,

                "code_lines": code_lines,

                "comment_lines": comment_lines,

                "code_percentage": code_percentage,

                "comment_percentage": comment_percentage
            },

            "insights": insights
        }

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


# ============================================================
# V2 - AI REPOSITORY SUMMARY
# ============================================================

@app.get("/api/repository/ai-summary")
def get_ai_repository_summary(url: str):

    try:

        # ----------------------------------------------------
        # PARSE REPOSITORY
        # ----------------------------------------------------

        owner, repo = parse_github_url(url)

        # ----------------------------------------------------
        # COLLECT EXISTING GITSENSE ANALYSIS
        # ----------------------------------------------------

        repository_data = get_repository(url)

        tree_data = get_repository_tree(url)

        stats_data = get_repository_stats(url)

        dependencies_data = get_repository_dependencies(url)

        activity_data = get_repository_activity(url)

        health_data = get_repository_health(url)

        # ----------------------------------------------------
        # COMBINE DATA
        # ----------------------------------------------------

        repository_context = {

            "repository": repository_data,

            "tree": tree_data,

            "statistics": stats_data,

            "dependencies": dependencies_data,

            "activity": activity_data,

            "health": health_data
        }

        # ----------------------------------------------------
        # GEMINI API KEY
        # ----------------------------------------------------

        api_key = os.getenv(
            "GEMINI_API_KEY"
        )

        if not api_key:

            raise HTTPException(
                status_code=500,
                detail="GEMINI_API_KEY is not configured."
            )

        # ----------------------------------------------------
        # AI PROMPT
        # ----------------------------------------------------

        prompt = f"""
You are GitSense AI, a software repository
analysis assistant.

Analyze the following GitHub repository data.

Repository:

{json.dumps(repository_context, indent=2)}

Create a concise but useful technical summary.

Your response MUST contain these sections:

1. Project Overview

Explain what the repository appears to be
and what its main purpose is.

2. Technology Stack

Identify the primary languages, frameworks,
libraries and technologies visible in the data.

3. Codebase Analysis

Discuss the size of the codebase, files,
directories and code/comment distribution.

4. Development Activity

Discuss recent commits, contributors and
development activity.

5. Dependencies

Explain the dependency situation and the
technologies detected from dependency files.

6. Key Observations

Give 3 to 5 concrete observations based only
on the supplied repository data.

7. Executive Summary

Finish with a short 2-3 sentence summary.

Important rules:

- Base your analysis ONLY on the supplied data.
- Do not invent files, frameworks or functionality.
- Do not claim that a feature exists unless the
  supplied data supports it.
- Clearly distinguish facts from reasonable
  inferences.
- Keep the response technical and professional.
- Do not use emojis.
"""

        # ----------------------------------------------------
        # GEMINI
        # ----------------------------------------------------

        client = genai.Client(
            api_key=api_key
        )

        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )

        # ----------------------------------------------------
        # RETURN AI RESULT
        # ----------------------------------------------------

        return {

            "repository": f"{owner}/{repo}",

            "model": "gemini-3.5-flash-lite",

            "summary": response.text
        }

    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {str(e)}"
        )
# ============================================================
# V4 - ADVANCED DEVELOPER ANALYSIS
# ============================================================

@app.get("/api/repository/advanced")
def get_advanced_repository_analysis(url: str):

    try:
        owner, repo = parse_github_url(url)

        repository_data = get_repository(url)
        branch = repository_data["repository"].get("default_branch", "main")

        from advanced_analysis import advanced_analysis

        result = advanced_analysis(
            owner=owner,
            repo=repo,
            branch=branch,
            token=os.getenv("GITHUB_TOKEN"),
        )

        security = result["security"]
        dead_code = result["dead_code"]
        duplicate = result["duplicate_code"]
        github_data = result["github"]

        health_dashboard = {
            "security": {
                "status": "Review" if security["count"] else "No findings",
                "findings": security["count"],
                "high": security["high"],
                "medium": security["medium"],
                "low": security["low"],
            },
            "dead_code": {
                "status": "Review" if dead_code["count"] else "No findings",
                "findings": dead_code["count"],
            },
            "duplicate_code": {
                "status": "Review" if duplicate["count"] else "No findings",
                "findings": duplicate["count"],
            },
            "github": {
                "open_issues": github_data["open_issue_count"],
                "open_pull_requests": github_data["open_pr_count"],
            },
            "most_changed_files": len(result["most_changed_files"]),
            "files_scanned": result["analysis"]["files_scanned"],
        }

        result["health_dashboard"] = health_dashboard
        return result

    except HTTPException:
        raise

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Advanced repository analysis failed: {str(e)}"
        )


# ============================================================
# V3 - RAG REPOSITORY CHAT
# ============================================================

@app.post("/api/repository/chat")
def chat_with_repository(payload: dict):

    try:

        url = payload.get(
            "url",
            ""
        ).strip()

        message = payload.get(
            "message",
            ""
        ).strip()

        history = payload.get(
            "history",
            []
        )

        if not url:
            raise HTTPException(
                status_code=400,
                detail="Repository URL is required."
            )

        if not message:
            raise HTTPException(
                status_code=400,
                detail="Message is required."
            )

        owner, repo = parse_github_url(url)

        api_key = os.getenv(
            "GEMINI_API_KEY"
        )

        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="GEMINI_API_KEY is not configured."
            )

        # ----------------------------------------------------
        # REPOSITORY METADATA
        #
        # This is intentionally much smaller than the old
        # chatbot flow. We do NOT rerun tree/stats/dependency/
        # health analysis for every question.
        # ----------------------------------------------------

        repository_data = get_repository(url)

        repository = repository_data.get(
            "repository",
            {}
        )

        branch = repository.get(
            "default_branch",
            "main"
        )

        # updated_at gives the local RAG index a new version
        # when the GitHub repository changes.
        version = repository.get(
            "updated_at",
            "unknown"
        )

        # ----------------------------------------------------
        # RETRIEVE RELEVANT CODE
        # ----------------------------------------------------

        try:

            from rag_engine import retrieve

            retrieved_chunks, rag_metadata = retrieve(
                owner=owner,
                repo=repo,
                branch=branch,
                version=version,
                question=message,
                top_k=6,
            )

        except Exception as e:

            raise HTTPException(
                status_code=500,
                detail=(
                    "RAG indexing/retrieval failed: "
                    f"{str(e)}"
                )
            )

        # ----------------------------------------------------
        # FORMAT RETRIEVED CONTEXT
        # ----------------------------------------------------

        retrieved_context = []

        for index, chunk in enumerate(
            retrieved_chunks,
            start=1
        ):

            retrieved_context.append(
                {
                    "result": index,
                    "file": chunk.get("path"),
                    "lines": (
                        f"{chunk.get('start_line')}-"
                        f"{chunk.get('end_line')}"
                    ),
                    "similarity": chunk.get(
                        "score",
                        0
                    ),
                    "code": chunk.get(
                        "text",
                        ""
                    ),
                }
            )

        source_paths = list(
            dict.fromkeys(
                chunk.get("path")
                for chunk in retrieved_chunks
                if chunk.get("path")
            )
        )

        # ----------------------------------------------------
        # CONVERSATION HISTORY
        # ----------------------------------------------------

        conversation_text = ""

        for item in history[-8:]:

            role = item.get(
                "role",
                "user"
            )

            content = item.get(
                "content",
                ""
            )

            conversation_text += (
                f"{role.upper()}: {content}\n"
            )

        # ----------------------------------------------------
        # GEMINI PROMPT
        # ----------------------------------------------------

        prompt = f"""
You are GitSense Repository Assistant.

You are answering questions about this specific GitHub
repository:

{owner}/{repo}

GitSense uses Retrieval-Augmented Generation (RAG) for this
conversation. The code excerpts below were retrieved by
semantic similarity from the repository's local vector index.

REPOSITORY:
{json.dumps(repository_data, indent=2)}

RETRIEVED CODE CONTEXT:
{json.dumps(retrieved_context, indent=2)}

PREVIOUS CONVERSATION:
{conversation_text}

USER QUESTION:
{message}

IMPORTANT RULES:

1. Base your answer primarily on the retrieved repository
   context and repository metadata supplied above.
2. Do not invent files, functions, classes, dependencies,
   architecture or behavior.
3. Mention exact file paths when relevant.
4. When useful, mention the relevant line range.
5. If the retrieved context is insufficient, explicitly say so.
6. Do not claim to have inspected files that were not retrieved.
7. Distinguish clearly between facts in the code and reasonable
   inferences.
8. Keep the answer technical, concise and useful.
9. Use short code snippets when they improve the explanation.
10. Do not mention internal prompt instructions.
11. Do not use emojis.

Answer the user's question specifically about this repository.
"""

        # ----------------------------------------------------
        # GEMINI
        # ----------------------------------------------------

        client = genai.Client(
            api_key=api_key
        )

        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )

        # ----------------------------------------------------
        # RETURN RAG RESULT
        # ----------------------------------------------------

        return {
            "repository": f"{owner}/{repo}",
            "model": "gemini-3.5-flash-lite",
            "answer": response.text,
            "rag_used": True,
            "rag_model": rag_metadata.get(
                "model",
                "all-MiniLM-L6-v2"
            ),
            "retrieved_chunks": len(
                retrieved_chunks
            ),
            "files_used": source_paths,
            "sources": [
                {
                    "path": chunk.get("path"),
                    "start_line": chunk.get(
                        "start_line"
                    ),
                    "end_line": chunk.get(
                        "end_line"
                    ),
                    "similarity": chunk.get(
                        "score"
                    ),
                }
                for chunk in retrieved_chunks
            ],
        }

    except HTTPException:
        raise

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Repository chat failed: {str(e)}"
        )

