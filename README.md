# GitSense

> AI-powered GitHub repository intelligence and codebase analysis platform.

## 🚀 Demo :[https://gitsense.pages.dev](https://gitsense.pages.dev)


**GitHub Repository:** [github.com/JayantaKundu17/GitSense](https://github.com/JayantaKundu17/GitSense)

---

## 📌 Overview

GitSense is a web application that helps developers understand and analyze GitHub repositories without manually going through every file.

Simply provide a public GitHub repository URL and GitSense analyzes the codebase to provide insights into:

- Repository structure
- Technology stack
- Programming languages
- Code statistics
- Dependencies
- Development activity
- Repository health
- AI-generated project summaries
- AI-powered repository chat
- Relevant code retrieval using RAG

The goal is to turn a GitHub repository into an understandable technical overview within seconds.

---

## ✨ Features

### 📊 Repository Overview

Get a high-level overview of a GitHub repository including:

- Repository name
- Description
- Owner
- Default branch
- Stars
- Forks
- Open issues
- Repository metadata

### 🧠 AI Summary

GitSense uses Google's Gemini API to generate a structured technical analysis of the repository.

The AI analysis includes:

1. Project Overview
2. Technology Stack
3. Codebase Analysis
4. Development Activity
5. Dependencies
6. Key Observations
7. Executive Summary

### 💬 Repository AI Chat

Ask questions directly about a repository.

Examples:

- What are the most important files in this repository?
- What dependencies does this project use and why?
- Explain the architecture of this project.
- How does the backend work?
- Where is the main entry point?
- Which files are responsible for database operations?

GitSense retrieves relevant repository code before generating the answer.

### 🔎 RAG-Based Code Retrieval

GitSense implements lightweight local retrieval for repository chat.


GitHub Repository
       ↓
Repository Download
       ↓
Source File Extraction
       ↓
Code Chunking
       ↓
Local Relevance Retrieval
       ↓
Relevant Code Context
       ↓
Gemini
       ↓
AI Answer

### 🧑‍💻 Technology Detection

GitSense detects technologies and dependencies used by a repository, including:

* Python
* JavaScript
* TypeScript
* Java
* C/C++
* Go
* Rust
* PHP
* React
* Node.js
* Maven
* Gradle
* Cargo
* Python requirements
* npm packages

### 📈 Code Statistics

GitSense analyzes source files and calculates:

* Total files
* Total directories
* Total lines
* Code lines
* Comment lines
* Blank lines
* Code percentage
* Comment percentage
* Programming language distribution

### 🌳 Repository Structure

Explore:

* Files
* Directories
* File extensions
* Source-code structure

### 📅 Development Activity

Analyze:

* Recent commits
* Contributors
* Commit history
* Development activity level

### ❤️ Repository Health

GitSense combines repository metrics into a high-level health analysis based on:

* Project size
* Development activity
* Technology diversity
* Number of dependencies
* Contributors
* Codebase statistics

---

## 🏗️ Architecture

```text
                         ┌──────────────────────┐
                         │        User          │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   GitSense Frontend  │
                         │     React + Vite     │
                         └──────────┬───────────┘
                                    │
                                    │ REST API
                                    ▼
                         ┌──────────────────────┐
                         │   FastAPI Backend    │
                         │        Python        │
                         └───────┬───────┬──────┘
                                 │       │
                    ┌────────────┘       └─────────────┐
                    ▼                                  ▼
           ┌─────────────────┐                ┌─────────────────┐
           │   GitHub API    │                │  Google Gemini  │
           └─────────────────┘                └─────────────────┘
                    │                                  │
                    └────────────┬─────────────────────┘
                                 ▼
                         ┌──────────────────────┐
                         │ Repository Analysis  │
                         │        + RAG         │
                         └──────────────────────┘
```

---

## 🛠️ Tech Stack

### Frontend

* React
* Vite
* JavaScript
* CSS
* React Markdown
* Remark GFM

### Backend

* Python
* FastAPI
* Uvicorn
* Requests
* Pydantic
* Python-dotenv

### AI

* Google Gemini API
* `google-genai`

### Repository Intelligence

* GitHub REST API
* GitHub repository archives
* Lightweight local RAG
* Source-code chunking
* Relevance-based retrieval

### Deployment

* Cloudflare Pages
* Render
* GitHub

---

## 📁 Project Structure

```text
GitSense/
│
├── backend/
│   ├── main.py
│   ├── rag_engine.py
│   ├── advanced_analysis.py
│   ├── requirements.txt
│   └── .gitignore
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── AdvancedFeatures.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── public/
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

---

## 🚀 Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/JayantaKundu17/GitSense.git
cd GitSense
```

### 2. Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create:

```text
backend/.env
```

Add:

```env
GEMINI_API_KEY=your_gemini_api_key
GITHUB_TOKEN=your_github_token
```

### 4. Start the Backend

```bash
uvicorn main:app --reload --port 8000
```

Backend:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

### 5. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create:

```text
frontend/.env.local
```

Add:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Start the frontend:

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

## 🔌 API Endpoints

| Endpoint                           | Purpose              |
| ---------------------------------- | -------------------- |
| `GET /`                            | Backend status       |
| `GET /health`                      | Health check         |
| `GET /api/repository`              | Repository metadata  |
| `GET /api/repository/tree`         | Repository structure |
| `GET /api/repository/stats`        | Code statistics      |
| `GET /api/repository/dependencies` | Dependency analysis  |
| `GET /api/repository/activity`     | Development activity |
| `GET /api/repository/health`       | Repository health    |
| `GET /api/repository/advanced`     | Advanced analysis    |
| `GET /api/repository/ai-summary`   | AI-generated summary |
| `POST /api/repository/chat`        | AI repository chat   |

---

## ☁️ Deployment

GitSense uses a separate frontend and backend architecture.

```text
GitHub
   │
   ├── frontend/
   │       ↓
   │   Cloudflare Pages
   │       ↓
   │   gitsense.pages.dev
   │
   └── backend/
           ↓
        Render
           ↓
       FastAPI
```

### Frontend

**Cloudflare Pages**

### Backend

**Render**

### AI

**Google Gemini**

---

## 🎯 Use Cases

GitSense can be used for:

* Understanding unfamiliar GitHub repositories
* Reviewing student projects
* Developer onboarding
* Technical interview preparation
* Understanding open-source projects
* Reviewing project architecture
* Finding important source files
* Understanding project dependencies
* AI-assisted codebase exploration

---

## 🔮 Future Improvements

* Advanced semantic code search
* Persistent vector database
* Authentication
* Private repository support
* Repository comparison
* Pull request analysis
* Issue analysis
* Commit-level code explanations
* Dependency vulnerability analysis
* Automated architecture diagrams
* GitHub OAuth
* Improved caching
* Production rate limiting
* Custom domain support

---

## 👨‍💻 Author

**Jayanta Kundu**

Computer Science & Engineering

[GitHub](https://github.com/JayantaKundu17)

---

