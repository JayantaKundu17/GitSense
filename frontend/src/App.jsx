import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";
import "./AdvancedFeatures.css";

const API_URL = import.meta.env.VITE_API_URL;

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function formatDate(dateString) {
  if (!dateString) {
    return "Unknown";
  }

  const date = new Date(dateString);

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}


/* =========================================================
   AI SUMMARY FORMATTER
   ========================================================= */

function renderInlineMarkdown(text) {
  if (!text) return null;

  /*
   * Gemini occasionally returns Markdown such as:
   * **`torch`**
   * or even `` `torch` ``.
   *
   * Normalize double backticks first, then parse bold/code
   * recursively so Markdown markers never appear literally.
   */
  const normalizedText = String(text).replace(/``/g, "`");

  const parts = [];
  const pattern = /(\*\*[\s\S]+?\*\*|`[^`]*`)/g;

  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = pattern.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        normalizedText
          .slice(lastIndex, match.index)
          .replace(/`/g, "")
      );
    }

    const token = match[0];

    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`bold-${keyIndex++}`}>
          {renderInlineMarkdown(token.slice(2, -2))}
        </strong>
      );
    } else if (
      token.startsWith("`") &&
      token.endsWith("`")
    ) {
      parts.push(
        <code key={`code-${keyIndex++}`}>
          {token.slice(1, -1)}
        </code>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < normalizedText.length) {
    parts.push(
      normalizedText
        .slice(lastIndex)
        .replace(/`/g, "")
    );
  }

  return parts;
}


function renderAISummary(summary) {
  if (!summary) return null;

  return summary.split("\n").map((line, index) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return (
        <div
          className="ai-summary-spacer"
          key={index}
        />
      );
    }

    /* Markdown headings */
    if (
      trimmedLine.startsWith("# ") ||
      trimmedLine.startsWith("## ") ||
      trimmedLine.startsWith("### ")
    ) {
      return (
        <h3
          className="ai-summary-heading"
          key={index}
        >
          {trimmedLine.replace(/^#{1,3}\s*/, "")}
        </h3>
      );
    }

    /* Numbered section headings such as:
       1. Project Overview
       2. Technology Stack
    */
    if (/^\d+\.\s+[^:]+$/.test(trimmedLine)) {
      return (
        <h3
          className="ai-summary-heading"
          key={index}
        >
          {trimmedLine}
        </h3>
      );
    }

    /* Markdown bullet */
    if (
      trimmedLine.startsWith("* ") ||
      trimmedLine.startsWith("- ") ||
      trimmedLine.startsWith("• ")
    ) {
      return (
        <div
          className="ai-summary-bullet"
          key={index}
        >
          <span>•</span>
          <span>
            {renderInlineMarkdown(trimmedLine.substring(2))}
          </span>
        </div>
      );
    }

    /* A line containing only bold text */
    if (
      trimmedLine.startsWith("**") &&
      trimmedLine.endsWith("**") &&
      trimmedLine.slice(2, -2).indexOf("**") === -1
    ) {
      return (
        <p
          className="ai-summary-bold"
          key={index}
        >
          {trimmedLine.slice(2, -2)}
        </p>
      );
    }

    /* Normal paragraph with inline Markdown */
    return (
      <p
        className="ai-summary-paragraph"
        key={index}
      >
        {renderInlineMarkdown(trimmedLine)}
      </p>
    );
  });
}

function renderChatContent(content) {
  if (!content) return null;

  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="chat-markdown-h1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="chat-markdown-h2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="chat-markdown-h3">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="chat-markdown-paragraph">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="chat-markdown-list">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="chat-markdown-list">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="chat-markdown-list-item">{children}</li>
          ),
          code: ({ inline, className, children, ...props }) => {
            if (inline) {
              return (
                <code className="chat-markdown-inline-code" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <pre className="chat-markdown-code-block">
                <code className={className || ""} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="chat-markdown-blockquote">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="chat-markdown-table-wrapper">
              <table className="chat-markdown-table">{children}</table>
            </div>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-markdown-link"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}


/* =========================================================
   MAIN APP
   ========================================================= */

function App() {
  const [repoUrl, setRepoUrl] = useState("");

  const [repoData, setRepoData] = useState(null);

  const [treeData, setTreeData] = useState(null);

  const [statsData, setStatsData] = useState(null);

  const [dependenciesData, setDependenciesData] = useState(null);

  const [activityData, setActivityData] = useState(null);

  const [healthData, setHealthData] = useState(null);

  const [advancedData, setAdvancedData] = useState(null);

  const [aiSummaryData, setAiSummaryData] = useState(null);

  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content:
        "I’m ready to answer questions about this repository. Ask me about the code, architecture, dependencies, files, or how the project works.",
    },
  ]);

  const [chatInput, setChatInput] = useState("");

  const [chatLoading, setChatLoading] = useState(false);

  const [chatError, setChatError] = useState("");

  const [loading, setLoading] = useState(false);

  const [analysisStage, setAnalysisStage] = useState("");

  const [analysisProgress, setAnalysisProgress] = useState(0);

  const [completedStages, setCompletedStages] = useState([]);

  const [error, setError] = useState("");


  /* =======================================================
     ANALYZE REPOSITORY
     ======================================================= */

  const handleAnalyze = async () => {
    if (!repoUrl.trim()) {
      setError("Please enter a GitHub repository URL.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysisStage("Connecting to GitHub...");
    setAnalysisProgress(8);
    setCompletedStages([]);

    setRepoData(null);
    setTreeData(null);
    setStatsData(null);
    setDependenciesData(null);
    setActivityData(null);
    setHealthData(null);
    setAdvancedData(null);
    setAiSummaryData(null);
    setChatMessages([
      {
        role: "assistant",
        content:
          "I’m ready to answer questions about this repository. Ask me about the code, architecture, dependencies, files, or how the project works.",
      },
    ]);
    setChatInput("");
    setChatError("");


    try {
      /* ==================================================
         GET REPOSITORY INFORMATION
         ================================================== */

      setAnalysisStage("Fetching repository information...");
      setAnalysisProgress(8);

      const repositoryResponse = await fetch(
        `${API_URL}/api/repository?url=${encodeURIComponent(
          repoUrl.trim()
        )}`
      );

      if (!repositoryResponse.ok) {
        const errorData = await repositoryResponse
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Repository request failed with status ${repositoryResponse.status}`
        );
      }

      const repositoryResult = await repositoryResponse.json();

      setRepoData(repositoryResult);
      setCompletedStages((prev) => [...prev, "repository"]);
      setAnalysisStage("Mapping repository structure...");
      setAnalysisProgress(22);


      /* ==================================================
         GET REPOSITORY TREE
         ================================================== */

      const treeResponse = await fetch(
        `${API_URL}/api/repository/tree?url=${encodeURIComponent(
          repoUrl.trim()
        )}`
      );

      if (!treeResponse.ok) {
        const errorData = await treeResponse
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Repository tree request failed with status ${treeResponse.status}`
        );
      }

      const treeResult = await treeResponse.json();

      setTreeData(treeResult);
      setCompletedStages((prev) => [...prev, "tree"]);
      setAnalysisStage("Analyzing codebase statistics...");
      setAnalysisProgress(38);


      /* ==================================================
         GET CODE STATISTICS
         ================================================== */

      const statsResponse = await fetch(
        `${API_URL}/api/repository/stats?url=${encodeURIComponent(
          repoUrl.trim()
        )}`
      );

      if (!statsResponse.ok) {
        const errorData = await statsResponse
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Statistics request failed with status ${statsResponse.status}`
        );
      }

      const statsResult = await statsResponse.json();

      setStatsData(statsResult);
      setCompletedStages((prev) => [...prev, "stats"]);
      setAnalysisStage("Detecting technologies and dependencies...");
      setAnalysisProgress(52);


      /* ==================================================
         GET DEPENDENCIES
         ================================================== */

      const dependenciesResponse = await fetch(
        `${API_URL}/api/repository/dependencies?url=${encodeURIComponent(
          repoUrl.trim()
        )}`
      );

      if (!dependenciesResponse.ok) {
        const errorData = await dependenciesResponse
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Dependencies request failed with status ${dependenciesResponse.status}`
        );
      }

      const dependenciesResult =
        await dependenciesResponse.json();

      setDependenciesData(dependenciesResult);
      setCompletedStages((prev) => [...prev, "dependencies"]);
      setAnalysisStage("Analyzing development activity...");
      setAnalysisProgress(66);


      /* ==================================================
         GET GIT ACTIVITY
         ================================================== */

      const activityResponse = await fetch(
        `${API_URL}/api/repository/activity?url=${encodeURIComponent(
          repoUrl.trim()
        )}`
      );

      if (!activityResponse.ok) {
        const errorData = await activityResponse
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Git activity request failed with status ${activityResponse.status}`
        );
      }

      const activityResult =
        await activityResponse.json();

      setActivityData(activityResult);
      setCompletedStages((prev) => [...prev, "activity"]);
      setAnalysisStage("Computing repository health...");
      setAnalysisProgress(78);


      /* ==================================================
         GET REPOSITORY HEALTH
         ================================================== */

      const healthResponse = await fetch(
        `${API_URL}/api/repository/health?url=${encodeURIComponent(
          repoUrl.trim()
        )}`
      );

      if (!healthResponse.ok) {
        const errorData = await healthResponse
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Repository health request failed with status ${healthResponse.status}`
        );
      }

      const healthResult =
        await healthResponse.json();

      setHealthData(healthResult);
      setCompletedStages((prev) => [...prev, "health"]);
      setAnalysisStage("Running security, code quality and GitHub analysis...");
      setAnalysisProgress(84);


      /* ==================================================
         GET ADVANCED DEVELOPER ANALYSIS
         ================================================== */

      const advancedResponse = await fetch(
        `${API_URL}/api/repository/advanced?url=${encodeURIComponent(
          repoUrl.trim()
        )}`
      );

      if (!advancedResponse.ok) {
        const errorData = await advancedResponse
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Advanced analysis request failed with status ${advancedResponse.status}`
        );
      }

      const advancedResult = await advancedResponse.json();
      setAdvancedData(advancedResult);
      setCompletedStages((prev) => [...prev, "advanced"]);
      setAnalysisStage("Generating AI repository insights...");
      setAnalysisProgress(90);


      /* ==================================================
         GET AI REPOSITORY SUMMARY
         ================================================== */

      const aiSummaryResponse = await fetch(
        `${API_URL}/api/repository/ai-summary?url=${encodeURIComponent(
          repoUrl.trim()
        )}`
      );

      if (!aiSummaryResponse.ok) {
        const errorData = await aiSummaryResponse
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `AI summary request failed with status ${aiSummaryResponse.status}`
        );
      }

      const aiSummaryResult = await aiSummaryResponse.json();

      setAiSummaryData(aiSummaryResult);
      setCompletedStages((prev) => [...prev, "ai"]);
      setAnalysisStage("Analysis complete");
      setAnalysisProgress(100);


    } catch (err) {
      console.error(err);

      setError(
        err.message ||
          "Unable to analyze the repository."
      );


    } finally {
      setLoading(false);
    }
  };


  /* =======================================================
     V5 - CHAT WITH YOUR REPOSITORY
     ======================================================= */

  const handleChatSubmit = async () => {
    const message = chatInput.trim();

    if (!message || chatLoading || !repoUrl.trim()) {
      return;
    }

    setChatInput("");
    setChatError("");
    setChatLoading(true);

    const userMessage = {
      role: "user",
      content: message,
    };

    const updatedMessages = [
      ...chatMessages,
      userMessage,
    ];

    setChatMessages(updatedMessages);

    try {
      const response = await fetch(
        `${API_URL}/api/repository/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: repoUrl.trim(),
            message,
            history: chatMessages,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Chat request failed with status ${response.status}`
        );
      }

      const data = await response.json();

      setChatMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content:
            data.answer ||
            "I could not generate an answer.",
          ragUsed: data.rag_used === true,
          ragModel: data.rag_model || "",
          retrievedChunks: data.retrieved_chunks || 0,
          sources: Array.isArray(data.sources)
            ? data.sources
            : [],
        },
      ]);
    } catch (err) {
      console.error(err);

      setChatError(
        err.message ||
          "Unable to contact the repository assistant."
      );
    } finally {
      setChatLoading(false);
    }
  };


  /* =======================================================
     ANALYZE ANOTHER REPOSITORY
     ======================================================= */

  const handleReset = () => {
    setRepoUrl("");

    setRepoData(null);

    setTreeData(null);

    setStatsData(null);

    setDependenciesData(null);

    setActivityData(null);

    setHealthData(null);

    setAiSummaryData(null);

    setChatMessages([
      {
        role: "assistant",
        content:
          "I’m ready to answer questions about this repository. Ask me about the code, architecture, dependencies, files, or how the project works.",
      },
    ]);

    setChatInput("");

    setChatError("");

    setError("");
  };


  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="app" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>


      {/* ==================================================
          NAVBAR
          ================================================== */}

      <nav className="navbar">

        <a className="logo" href="#top" aria-label="GitSense home">
          <span className="logo-icon" style={{ background: "#000000", color: "#ffffff" }}>gs</span>
        </a>

        <div className="nav-links">
          <a href="#overview">Overview</a>
          <a href="#ai-summary">AI Summary</a>
          <a href="#chat">Chat</a>
          <a href="#technology">Technology</a>
          <a href="#details">Details</a>
          <a href="#structure">Structure</a>
          <a href="#statistics">Statistics</a>
          <a href="#dependencies">Dependencies</a>
          <a href="#activity">Activity</a>
          <a href="#health">Health</a>
          <a href="#advanced">Security</a>
          <a href="#github">GitHub</a>
        </div>

      </nav>


      {/* ==================================================
          MAIN
          ================================================== */}

      <main className="hero" id="top" style={{ flex: "1" }}>


        {/* ==================================================
            HERO
            ================================================== */}
        <h1 className="hero-title">
          Understand your GitHub repository
        </h1>
{/* ==================================================
            SEARCH BOX
            ================================================== */}

        <div className="search-box">

          <input
            type="text"
            placeholder="https://github.com/user/repository"
            value={repoUrl}
            onChange={(e) =>
              setRepoUrl(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAnalyze();
              }
            }}
            disabled={loading}
          />


          <button
            onClick={handleAnalyze}
            disabled={loading}
          >

            {loading
              ? "Analyzing..."
              : "Analyze Repository"}

          </button>

        </div>
{loading && (

          <div className="analysis-skeleton" aria-live="polite" aria-label="Analyzing repository">

            <div className="skeleton skeleton-heading"></div>

            <div className="skeleton skeleton-input"></div>

            <div className="skeleton-row">
              <div className="skeleton skeleton-card"></div>
              <div className="skeleton skeleton-card"></div>
              <div className="skeleton skeleton-card"></div>
            </div>

            <div className="skeleton-status">
              {analysisStage || "Analyzing repository..."}
            </div>

          </div>

        )}


        {/* ==================================================
            ERROR MESSAGE
            ================================================== */}

        {error && (

          <div className="error-message">

            {error}

          </div>

        )}


        {/* ==================================================
            RESULTS
            ================================================== */}

        {repoData && (

          <section className="results" id="overview">


            {/* ==================================================
                REPOSITORY OVERVIEW
                ================================================== */}

            <div className="results-header">

              <h2>
                Repository Overview
              </h2>


              <a
                href={repoData.repository.url}
                target="_blank"
                rel="noopener noreferrer"
              >

                View on GitHub ↗

              </a>

            </div>


            <div className="repository-card">


              <h2>
                {repoData.repository.name}
              </h2>


              <p className="repo-full-name">

                {repoData.repository.full_name}

              </p>


              {repoData.repository.description && (

                <p className="repo-description">

                  {repoData.repository.description}

                </p>

              )}


              {/* REPOSITORY STATISTICS */}

              <div className="stats-grid">


                <div className="stat-card">

                  <span>
                    Stars
                  </span>

                  <strong>
                    {repoData.repository.stars}
                  </strong>

                </div>


                <div className="stat-card">

                  <span>
                    Forks
                  </span>

                  <strong>
                    {repoData.repository.forks}
                  </strong>

                </div>


                <div className="stat-card">

                  <span>
                    Open Issues
                  </span>

                  <strong>
                    {repoData.repository.open_issues}
                  </strong>

                </div>


                <div className="stat-card">

                  <span>
                    Watchers
                  </span>

                  <strong>
                    {repoData.repository.watchers}
                  </strong>

                </div>


              </div>

            </div>


            {/* ==================================================
                V2 - AI REPOSITORY SUMMARY
                ================================================== */}

            {aiSummaryData && (

              <div className="repository-card ai-summary-card" id="ai-summary">

                <div className="ai-summary-header">

                  <div>
                    <h2>
                      AI Repository Summary
                    </h2>

                    <p className="repo-description">
                      Technical analysis generated from GitSense repository data.
                    </p>
                  </div>

                  <span className="ai-model-badge">
                    Gemini
                  </span>

                </div>

                <div className="ai-summary-content">
                  {renderAISummary(aiSummaryData.summary)}
                </div>

              </div>

            )}


            {/* ==================================================
                V5 - CHAT WITH YOUR REPOSITORY
                ================================================== */}

            <div className="repository-card repository-chat-card" id="chat">

              <div className="chat-header">

                <div>
                  <h2>
                    Chat with your repository
                  </h2>

                  <p className="repo-description">
                    Ask questions about the codebase and get answers based on the repository.
                  </p>
                </div>

                <span className="chat-badge">
                  Gemini · RAG
                </span>

              </div>

              <div className="chat-window">

                {chatMessages.map((message, index) => (

                  <div
                    className={`chat-message ${
                      message.role === "user"
                        ? "chat-user"
                        : "chat-assistant"
                    }`}
                    key={index}
                  >

                    <div className="chat-avatar">
                      {message.role === "user" ? "You" : "AI"}
                    </div>

                    <div className="chat-bubble">
                      {message.role === "assistant"
                        ? (
                            <>
                              {renderChatContent(message.content)}

                              {message.ragUsed && (
                                <div className="chat-rag-sources">
                                  <div className="chat-rag-label">
                                    RAG · {message.retrievedChunks} retrieved chunks
                                  </div>

                                  {message.sources?.length > 0 && (
                                    <div className="chat-source-list">
                                      {message.sources
                                        .slice(0, 6)
                                        .map((source, sourceIndex) => (
                                          <div
                                            className="chat-source-item"
                                            key={`${source.path}-${source.start_line}-${sourceIndex}`}
                                          >
                                            <code>{source.path}</code>
                                            <span>
                                              lines {source.start_line}–{source.end_line}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )
                        : <p>{message.content}</p>}
                    </div>

                  </div>

                ))}

                {chatLoading && (

                  <div className="chat-message chat-assistant">

                    <div className="chat-avatar">
                      AI
                    </div>

                    <div className="chat-bubble chat-thinking">
                      Thinking about the repository...
                    </div>

                  </div>

                )}

              </div>

              {chatError && (

                <div className="chat-error">
                  {chatError}
                </div>

              )}

              <div className="chat-input-area">

                <input
                  type="text"
                  value={chatInput}
                  placeholder="Ask something about this repository..."
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleChatSubmit();
                    }
                  }}
                  disabled={chatLoading}
                />

                <button
                  onClick={handleChatSubmit}
                  disabled={
                    chatLoading ||
                    !chatInput.trim()
                  }
                >
                  {chatLoading ? "..." : "Send"}
                </button>

              </div>

              <div className="chat-suggestions">

                <button
                  onClick={() =>
                    setChatInput(
                      "Explain how this project works."
                    )
                  }
                >
                  Explain this project
                </button>

                <button
                  onClick={() =>
                    setChatInput(
                      "What are the most important files in this repository?"
                    )
                  }
                >
                  Important files
                </button>

                <button
                  onClick={() =>
                    setChatInput(
                      "Explain the architecture of this project."
                    )
                  }
                >
                  Explain architecture
                </button>

                <button
                  onClick={() =>
                    setChatInput(
                      "What dependencies does this project use and why?"
                    )
                  }
                >
                  Dependencies
                </button>

              </div>

            </div>


            {/* ==================================================
                TECHNOLOGY STACK
                ================================================== */}

            <div className="repository-card" id="technology">

              <h2>
                Technology Stack
              </h2>


              <div className="language-list">

                {Object.entries(
                  repoData.languages || {}
                ).map(
                  ([language, bytes]) => (

                    <div
                      className="language-item"
                      key={language}
                    >

                      <span>
                        {language}
                      </span>

                      <strong>
                        {bytes.toLocaleString()}
                        {" "}bytes
                      </strong>

                    </div>

                  )
                )}

              </div>

            </div>


            {/* ==================================================
                REPOSITORY DETAILS
                ================================================== */}

            <div className="repository-card" id="details">

              <h2>
                Repository Details
              </h2>


              <div className="details-grid">


                <div>

                  <span>
                    Owner
                  </span>

                  <strong>
                    {repoData.repository.owner}
                  </strong>

                </div>


                <div>

                  <span>
                    Default Branch
                  </span>

                  <strong>
                    {repoData.repository.default_branch}
                  </strong>

                </div>


                <div>

                  <span>
                    Size
                  </span>

                  <strong>
                    {repoData.repository.size_kb} KB
                  </strong>

                </div>


                <div>

                  <span>
                    License
                  </span>

                  <strong>

                    {repoData.repository.license ||
                      "None"}

                  </strong>

                </div>


              </div>

            </div>


            {/* ==================================================
                REPOSITORY STRUCTURE
                ================================================== */}

            {treeData && (

              <div className="repository-card" id="structure">

              <h2>
                Repository Structure
              </h2>


                <p className="repo-description">

                  Files and directories detected in the repository.

                </p>


                <div className="stats-grid">


                  <div className="stat-card">

                    <span>
                      Total Files
                    </span>

                    <strong>

                      {treeData.total_files ?? 0}

                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Total Directories
                    </span>

                    <strong>

                      {treeData.total_directories ?? 0}

                    </strong>

                  </div>


                </div>


                {Array.isArray(treeData.files) &&
                  treeData.files.length > 0 && (

                    <div className="tree-section">

                      <h3>
                        Files
                      </h3>


                      <div className="tree-container">

                        {treeData.files.map(
                          (file, index) => (

                            <div
                              className="tree-item"
                              key={index}
                            >

                              <span>
                                📄
                              </span>


                              <span className="tree-path">

                                {file.path}

                              </span>


                              <strong className="tree-size">

                                {formatFileSize(
                                  file.size
                                )}

                              </strong>

                            </div>

                          )
                        )}

                      </div>

                    </div>

                  )}


                {Array.isArray(treeData.directories) &&
                  treeData.directories.length > 0 && (

                    <div className="tree-section">

                      <h3>
                        Directories
                      </h3>


                      <div className="tree-container">

                        {treeData.directories.map(
                          (directory, index) => (

                            <div
                              className="tree-item"
                              key={index}
                            >

                              <span>
                                📁
                              </span>


                              <span className="tree-path">

                                {directory}

                              </span>

                            </div>

                          )
                        )}

                      </div>

                    </div>

                  )}

              </div>

            )}


            {/* ==================================================
                CODE STATISTICS
                ================================================== */}

            {statsData && (

              <div className="repository-card" id="statistics">

              <h2>
                Code Statistics
              </h2>


                <p className="repo-description">

                  Source-code statistics detected from
                  analyzable repository files.

                </p>


                <div className="stats-grid">


                  <div className="stat-card">

                    <span>
                      Files Analyzed
                    </span>

                    <strong>

                      {statsData.total_files_analyzed}

                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Total Lines
                    </span>

                    <strong>

                      {statsData.total_lines.toLocaleString()}

                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Code Lines
                    </span>

                    <strong>

                      {statsData.code_lines.toLocaleString()}

                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Comment Lines
                    </span>

                    <strong>

                      {statsData.comment_lines.toLocaleString()}

                    </strong>

                  </div>


                </div>


                <div className="code-breakdown">


                  <div>

                    <span>
                      Blank Lines
                    </span>

                    <strong>

                      {statsData.blank_lines.toLocaleString()}

                    </strong>

                  </div>


                  <div>

                    <span>
                      Comment Lines
                    </span>

                    <strong>

                      {statsData.comment_lines.toLocaleString()}

                    </strong>

                  </div>


                  <div>

                    <span>
                      Code Lines
                    </span>

                    <strong>

                      {statsData.code_lines.toLocaleString()}

                    </strong>

                  </div>


                </div>


                <div className="tree-section">


                  <h3>
                    Language Breakdown
                  </h3>


                  <div className="language-list">


                    {Object.entries(
                      statsData.languages || {}
                    ).map(
                      ([language, data]) => (

                        <div
                          className="language-item"
                          key={language}
                        >

                          <div>

                            <span>
                              {language}
                            </span>

                            <small>

                              {data.files}
                              {" "}
                              {data.files === 1
                                ? "file"
                                : "files"}

                            </small>

                          </div>


                          <strong>

                            {data.lines.toLocaleString()}
                            {" "}lines

                          </strong>

                        </div>

                      )
                    )}

                  </div>

                </div>


                <div className="tree-section">


                  <h3>
                    Analyzed Files
                  </h3>


                  <div className="tree-container">


                    {Array.isArray(statsData.files) &&
                      statsData.files.map(
                        (file, index) => (

                          <div
                            className="tree-item"
                            key={index}
                          >

                            <span>
                              📄
                            </span>


                            <span className="tree-path">

                              {file.path}

                            </span>


                            <strong className="tree-size">

                              {file.lines.toLocaleString()}
                              {" "}lines

                            </strong>

                          </div>

                        )
                      )}

                  </div>

                </div>


              </div>

            )}


            {/* ==================================================
                DEPENDENCIES
                ================================================== */}

            {dependenciesData && (

              <div className="repository-card" id="dependencies">

              <h2>
                Dependencies
              </h2>


                <p className="repo-description">

                  Detected project dependencies and
                  dependency configuration files.

                </p>


                <div className="stats-grid">


                  <div className="stat-card">

                    <span>
                      Technology
                    </span>

                    <strong>

                      {dependenciesData.detected_technology?.join(
                        ", "
                      ) || "Unknown"}

                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Dependency Count
                    </span>

                    <strong>

                      {dependenciesData.dependency_count}

                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Dependency Files
                    </span>

                    <strong>

                      {dependenciesData.dependency_files?.length || 0}

                    </strong>

                  </div>


                </div>


                <div className="tree-section">


                  <h3>
                    Dependency Files
                  </h3>


                  <div className="language-list">


                    {(
                      dependenciesData.dependency_files || []
                    ).map(
                      (file, index) => (

                        <div
                          className="language-item"
                          key={index}
                        >

                          <span>
                            📄 {file}
                          </span>

                        </div>

                      )
                    )}

                  </div>

                </div>


                <div className="tree-section">


                  <h3>
                    Detected Dependencies
                  </h3>


                  <div className="tree-container">


                    {(
                      dependenciesData.dependencies || []
                    ).map(
                      (dependency, index) => (

                        <div
                          className="tree-item"
                          key={index}
                        >

                          <span>
                            📦
                          </span>


                          <span className="tree-path">

                            {dependency.name}

                          </span>


                          <strong className="tree-size">

                            {dependency.source}

                          </strong>

                        </div>

                      )
                    )}

                  </div>

                </div>


              </div>

            )}


            {/* ==================================================
                GIT ACTIVITY
                ================================================== */}

            {activityData && (

              <div className="repository-card" id="activity">

              <h2>
                Git Activity
              </h2>


                <p className="repo-description">

                  Recent commits and contributor activity
                  detected from the repository.

                </p>


                <div className="stats-grid">


                  <div className="stat-card">

                    <span>
                      Recent Commits
                    </span>

                    <strong>

                      {activityData.recent_commit_count}

                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Contributors
                    </span>

                    <strong>

                      {activityData.recent_contributor_count}

                    </strong>

                  </div>


                </div>


                <div className="tree-section">


                  <h3>
                    Contributors
                  </h3>


                  <div className="language-list">


                    {(activityData.contributors || [])
                      .map(
                        (contributor, index) => (

                          <div
                            className="language-item"
                            key={index}
                          >


                            <div>

                              <span>

                                {contributor.username ||
                                  "Unknown"}

                              </span>

                              <small>

                                {contributor.contributions}
                                {" "}
                                {contributor.contributions === 1
                                  ? "contribution"
                                  : "contributions"}

                              </small>

                            </div>


                            {contributor.profile_url && (

                              <a
                                href={
                                  contributor.profile_url
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                              >

                                View Profile ↗

                              </a>

                            )}

                          </div>

                        )
                      )}

                  </div>

                </div>


                <div className="tree-section">


                  <h3>
                    Recent Commits
                  </h3>


                  <div className="tree-container">


                    {(activityData.recent_commits || [])
                      .map(
                        (commit, index) => (

                          <div
                            className="commit-item"
                            key={index}
                          >


                            <div className="commit-main">


                              <div className="commit-message">

                                {commit.message}

                              </div>


                              <div className="commit-meta">

                                <span>

                                  {commit.author ||
                                    "Unknown"}

                                </span>


                                <span>
                                  •
                                </span>


                                <span>

                                  {formatDate(
                                    commit.date
                                  )}

                                </span>


                                <span>
                                  •
                                </span>


                                <code>

                                  {commit.sha}

                                </code>

                              </div>

                            </div>


                            {commit.url && (

                              <a
                                href={commit.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="commit-link"
                              >

                                ↗

                              </a>

                            )}

                          </div>

                        )
                      )}

                  </div>

                </div>


              </div>

            )}


            {/* ==================================================
                REPOSITORY HEALTH
                ================================================== */}

            {healthData && (

              <div className="repository-card" id="health">

              <h2>
                Repository Health
              </h2>


                <p className="repo-description">

                  A consolidated view of repository size,
                  development activity, technology diversity
                  and codebase metrics.

                </p>


                {/* HEALTH SUMMARY */}

                <div className="stats-grid">


                  <div className="stat-card">

                    <span>
                      Project Size
                    </span>

                    <strong>
                      {healthData.health.project_size}
                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Activity
                    </span>

                    <strong>
                      {healthData.health.activity}
                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Languages
                    </span>

                    <strong>
                      {healthData.health.languages}
                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Dependencies
                    </span>

                    <strong>
                      {healthData.health.dependencies}
                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Contributors
                    </span>

                    <strong>
                      {healthData.health.contributors}
                    </strong>

                  </div>


                  <div className="stat-card">

                    <span>
                      Recent Commits
                    </span>

                    <strong>
                      {healthData.health.recent_commits}
                    </strong>

                  </div>


                </div>


                {/* CODEBASE METRICS */}

                <div className="tree-section">


                  <h3>
                    Codebase Metrics
                  </h3>


                  <div className="code-breakdown">


                    <div>

                      <span>
                        Total Lines
                      </span>

                      <strong>

                        {healthData.metrics.total_lines.toLocaleString()}

                      </strong>

                    </div>


                    <div>

                      <span>
                        Code Lines
                      </span>

                      <strong>

                        {healthData.metrics.code_lines.toLocaleString()}

                      </strong>

                    </div>


                    <div>

                      <span>
                        Comment Lines
                      </span>

                      <strong>

                        {healthData.metrics.comment_lines.toLocaleString()}

                      </strong>

                    </div>


                    <div>

                      <span>
                        Code Percentage
                      </span>

                      <strong>

                        {healthData.metrics.code_percentage}%

                      </strong>

                    </div>


                    <div>

                      <span>
                        Comment Percentage
                      </span>

                      <strong>

                        {healthData.metrics.comment_percentage}%

                      </strong>

                    </div>


                    <div>

                      <span>
                        Total Files
                      </span>

                      <strong>

                        {healthData.metrics.total_files}

                      </strong>

                    </div>


                  </div>

                </div>


                {/* KEY INSIGHTS */}

                <div className="tree-section">


                  <h3>
                    Key Insights
                  </h3>


                  <div className="insights-list">


                    {(healthData.insights || [])
                      .map(
                        (insight, index) => (

                          <div
                            className="insight-item"
                            key={index}
                          >

                            <span className="insight-bullet">
                              •
                            </span>

                            <span>
                              {insight}
                            </span>

                          </div>

                        )
                      )}

                  </div>

                </div>


              </div>

            )}


            {/* ==================================================
                V4 - ADVANCED DEVELOPER ANALYSIS
                ================================================== */}

            {advancedData && (

              <div className="repository-card advanced-analysis-card" id="advanced">

                <div className="advanced-header">
                  <div>
                    <h2>Developer Intelligence</h2>
                    <p className="repo-description">
                      Static analysis, security heuristics, code quality signals and GitHub activity.
                    </p>
                  </div>
                  <span className="advanced-badge">V4</span>
                </div>

                <div className="health-dashboard-grid">
                  <div className="health-dashboard-card">
                    <span>Security</span>
                    <strong>{advancedData.health_dashboard?.security?.status || "Unknown"}</strong>
                    <small>
                      {advancedData.health_dashboard?.security?.findings ?? 0} findings
                    </small>
                  </div>
                  <div className="health-dashboard-card">
                    <span>Dead Code</span>
                    <strong>{advancedData.health_dashboard?.dead_code?.status || "Unknown"}</strong>
                    <small>
                      {advancedData.health_dashboard?.dead_code?.findings ?? 0} potential findings
                    </small>
                  </div>
                  <div className="health-dashboard-card">
                    <span>Duplicate Code</span>
                    <strong>{advancedData.health_dashboard?.duplicate_code?.status || "Unknown"}</strong>
                    <small>
                      {advancedData.health_dashboard?.duplicate_code?.findings ?? 0} potential matches
                    </small>
                  </div>
                  <div className="health-dashboard-card">
                    <span>Open Issues</span>
                    <strong>{advancedData.health_dashboard?.github?.open_issues ?? 0}</strong>
                    <small>
                      {advancedData.health_dashboard?.github?.open_pull_requests ?? 0} open pull requests
                    </small>
                  </div>
                </div>

                <div className="advanced-section" id="security">
                  <div className="advanced-section-header">
                    <div>
                      <h3>Security Scan</h3>
                      <p>Heuristic checks for common security-sensitive patterns.</p>
                    </div>
                    <span>{advancedData.security?.count ?? 0} findings</span>
                  </div>

                  {advancedData.security?.findings?.length ? (
                    <div className="advanced-list">
                      {advancedData.security.findings.slice(0, 30).map((finding, index) => (
                        <div className="advanced-list-item" key={`${finding.path}-${finding.line}-${index}`}>
                          <div className={`severity severity-${String(finding.severity).toLowerCase()}`}>
                            {finding.severity}
                          </div>
                          <div className="advanced-list-main">
                            <strong>{finding.title}</strong>
                            <code>{finding.path}:{finding.line}</code>
                            {finding.snippet && <small>{finding.snippet}</small>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="advanced-empty">No potential security findings detected.</div>
                  )}
                </div>

                <div className="advanced-two-column">
                  <div className="advanced-section">
                    <div className="advanced-section-header">
                      <div>
                        <h3>Potential Dead Code</h3>
                        <p>Unused Python symbols detected through static analysis.</p>
                      </div>
                      <span>{advancedData.dead_code?.count ?? 0}</span>
                    </div>
                    <div className="advanced-list compact-list">
                      {(advancedData.dead_code?.findings || []).slice(0, 25).map((item, index) => (
                        <div className="advanced-list-item" key={`${item.path}-${item.line}-${index}`}>
                          <div className="advanced-list-main">
                            <strong>{item.name}</strong>
                            <code>{item.path}:{item.line}</code>
                          </div>
                        </div>
                      ))}
                      {!advancedData.dead_code?.findings?.length && (
                        <div className="advanced-empty">No potential dead code detected.</div>
                      )}
                    </div>
                  </div>

                  <div className="advanced-section">
                    <div className="advanced-section-header">
                      <div>
                        <h3>Duplicate Code</h3>
                        <p>Repeated six-line normalized blocks across files.</p>
                      </div>
                      <span>{advancedData.duplicate_code?.count ?? 0}</span>
                    </div>
                    <div className="advanced-list compact-list">
                      {(advancedData.duplicate_code?.findings || []).slice(0, 25).map((item, index) => (
                        <div className="advanced-list-item" key={`${item.file_a}-${item.file_b}-${index}`}>
                          <div className="advanced-list-main">
                            <strong>{item.file_a}</strong>
                            <code>line {item.line_a}</code>
                            <small>similar block → {item.file_b}:{item.line_b}</small>
                          </div>
                        </div>
                      ))}
                      {!advancedData.duplicate_code?.findings?.length && (
                        <div className="advanced-empty">No duplicate blocks detected.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="advanced-section">
                  <div className="advanced-section-header">
                    <div>
                      <h3>Most Changed Files</h3>
                      <p>Based on the latest 10 commits available from GitHub.</p>
                    </div>
                  </div>
                  <div className="changed-files-table">
                    <div className="changed-files-row changed-files-head">
                      <span>File</span><span>Commits</span><span>Added</span><span>Deleted</span>
                    </div>
                    {(advancedData.most_changed_files || []).slice(0, 15).map((file, index) => (
                      <div className="changed-files-row" key={`${file.path}-${index}`}>
                        <code>{file.path}</code>
                        <span>{file.commit_changes}</span>
                        <span>+{file.additions}</span>
                        <span>-{file.deletions}</span>
                      </div>
                    ))}
                    {!advancedData.most_changed_files?.length && (
                      <div className="advanced-empty">No file-change history was available.</div>
                    )}
                  </div>
                </div>

                <div className="advanced-section" id="github">
                  <div className="advanced-section-header">
                    <div>
                      <h3>GitHub Issues & Pull Requests</h3>
                      <p>Open issues and pull requests retrieved directly from GitHub.</p>
                    </div>
                    <span>
                      {(advancedData.github?.open_issue_count ?? 0) + (advancedData.github?.open_pr_count ?? 0)} open
                    </span>
                  </div>

                  <div className="github-items">
                    {[...(advancedData.github?.issues || []).map((x) => ({ ...x, kind: "Issue" })),
                      ...(advancedData.github?.pull_requests || []).map((x) => ({ ...x, kind: "PR" }))]
                      .slice(0, 30)
                      .map((item) => (
                        <a className="github-item" href={item.url} target="_blank" rel="noopener noreferrer" key={`${item.kind}-${item.number}`}>
                          <span className="github-item-kind">{item.kind}</span>
                          <div>
                            <strong>#{item.number} {item.title}</strong>
                            <small>{item.user || "Unknown"} · updated {formatDate(item.updated_at)}</small>
                          </div>
                        </a>
                      ))}
                    {!(advancedData.github?.issues?.length || advancedData.github?.pull_requests?.length) && (
                      <div className="advanced-empty">No open issues or pull requests were returned.</div>
                    )}
                  </div>
                </div>

                <div className="advanced-note">
                  Scanned {advancedData.analysis?.files_scanned ?? 0} source/config files. Security, dead-code and duplicate-code results are heuristic and should be manually reviewed.
                </div>

              </div>

            )}


            {/* ==================================================
                ANALYZE ANOTHER REPOSITORY
                ================================================== */}

            <button
              className="analyze-again"
              onClick={handleReset}
            >

              Analyze Another Repository

            </button>


          </section>

        )}

      </main>


      {/* ==================================================
          FOOTER
          ================================================== */}

      <footer className="site-footer">

        <div className="footer-main">

          <div className="footer-brand">
            <div className="footer-brand-title">GitSense</div>
            <div className="footer-tagline">Understand your GitHub repository</div>
          </div>

          <div className="footer-message">
            Made with <span className="footer-heart">♥</span> for developers
          </div>

          <div className="footer-badges">

            <div className="store-badge">
              <svg
                className="store-logo google-play-logo"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="#000000"
                  d="M5 3.5c-.6-.4-1.4 0-1.4.8v15.4c0 .8.8 1.2 1.4.8L19.8 12 5 3.5Z"
                />
              </svg>
              <span>
                <small>GET IT ON</small>
                Google Play
              </span>
            </div>

            <div className="store-badge">
              <svg className="store-logo apple-logo" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M17.1 12.7c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.2-.9-1.6 0-3.1 1-3.9 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.4 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.6-3.8Zm-2.5-7.2c.7-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.3-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.6-1.2Z"/>
              </svg>
              <span>
                <small>DOWNLOAD ON THE</small>
                App Store
              </span>
            </div>

          </div>

          <div className="footer-socials">

            <a className="social-github" href="#top" aria-label="GitHub">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12 .7a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.3-1.3-1.6-1.3-1.6-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.5-2.7 5.5-5.3 5.8.4.3.7 1 .7 2v2.9c0 .3.2.7.8.6A12 12 0 0 0 12 .7Z"/>
              </svg>
            </a>

            <a className="social-linkedin" href="#top" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M5.2 3.4a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6ZM3.2 9h4v11.8h-4V9Zm6.5 0h3.8v1.6h.1c.5-.9 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6v6.2h-4v-5.5c0-1.3 0-3-1.9-3s-2.2 1.4-2.2 2.9v5.6h-4V9Z"/>
              </svg>
            </a>

            <a className="social-discord" href="#top" aria-label="Discord">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M19.5 5.2A16 16 0 0 0 15.6 4l-.5 1a14 14 0 0 0-6.2 0l-.5-1a16 16 0 0 0-3.9 1.2C2.1 9 1.5 12.8 1.8 16.6a15.7 15.7 0 0 0 4.8 2.4l1.1-1.5c-.6-.2-1.2-.5-1.7-.8l.4-.3a11 11 0 0 0 11.2 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.5a15.7 15.7 0 0 0 4.8-2.4c.4-4.4-.7-8.2-2.7-11.4ZM8.5 14.6c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/>
              </svg>
            </a>

            <a className="social-reddit" href="#top" aria-label="Reddit">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M20.7 12.2c0-1.1-.9-2-2-2-.5 0-.9.2-1.3.5-1.5-1-3.2-1.6-5.1-1.7l.9-3.3 2.3.5a1.7 1.7 0 1 0 .2-1.1l-2.7-.6a.6.6 0 0 0-.7.4l-1.1 4.1c-1.9.1-3.7.7-5.1 1.7A2 2 0 1 0 3.3 14c0 2.9 3.7 5.3 8.7 5.3s8.7-2.4 8.7-5.3c0-.2 0-.5-.1-.7.1-.3.1-.7.1-1.1Zm-11 1.9a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm4.8 3c-1.5 1-4.5 1-6 0a.5.5 0 0 1 .6-.8c1.2.8 3.6.8 4.8 0a.5.5 0 0 1 .6.8Zm.3-3a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z"/>
              </svg>
            </a>

          </div>

        </div>

        <div className="footer-divider"></div>

        <div className="footer-bottom">

          <span>© 2026 GitSense. All rights reserved.</span>

          <div className="footer-links">
            <a href="#top">About</a>
            <a href="#technology">Technology</a>
            <a href="#health">Insights</a>
            <a href="#top">Contact</a>
          </div>

        </div>

      </footer>


    </div>
  );
}


export default App;
