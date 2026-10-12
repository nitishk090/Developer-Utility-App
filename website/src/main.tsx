import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const repoUrl = import.meta.env.VITE_GITHUB_REPOSITORY_URL || "https://github.com/nitishkumar-t2b/Developer-Utility";
const releasesUrl = import.meta.env.VITE_GITHUB_RELEASES_URL || "";
const windowsDownloadUrl = import.meta.env.VITE_WINDOWS_DOWNLOAD_URL || "";
const macDownloadUrl = import.meta.env.VITE_MAC_DOWNLOAD_URL || "";

const featureCards = [
  {
    icon: "⌘",
    title: "cURL Workspace",
    description: "Turn raw HTTP requests into readable API requests and generate cURL safely from parsed payloads.",
  },
  {
    icon: "{}",
    title: "JSON Utilities",
    description: "Format, validate, compare, inspect paths, and generate mock data for API and data-heavy workflows.",
  },
  {
    icon: "🔐",
    title: "JWT & Encoding",
    description: "Decode JWT payloads and switch between base64, URL-safe, and common developer encoding tasks instantly.",
  },
  {
    icon: "↔",
    title: "HTTP Request Tools",
    description: "Analyze requests, inspect headers, and work with status codes without leaving your desktop workflow.",
  },
  {
    icon: "⚙",
    title: "Developer Utilities",
    description: "Use SQL formatting, regex, hash generation, UUID creation, timestamp utilities, and more in one place.",
  },
  {
    icon: "🧪",
    title: "HTTP Toolkit Live",
    description: "Bridge local request inspection when a supported local integration is available for live traffic visibility.",
  },
];

const tools = [
  { icon: "⇄", title: "cURL Workspace", description: "Parse and generate requests from raw cURL commands." },
  { icon: "🧾", title: "JSON Formatter", description: "Pretty-print and validate JSON on the fly." },
  { icon: "🔍", title: "JSON Compare", description: "Diff and inspect structural JSON changes." },
  { icon: "🧭", title: "JSON Path Explorer", description: "Find and inspect values by path." },
  { icon: "🧩", title: "JSON Type Generator", description: "Create typed JSON structures for tests and mocks." },
  { icon: "🧪", title: "API Tester", description: "Send requests and inspect response details quickly." },
  { icon: "📡", title: "Request Analyzer", description: "Break down headers, bodies, and request structure." },
  { icon: "🔐", title: "JWT Decoder", description: "Inspect decoded JWT header and payload content." },
  { icon: "🧬", title: "Base64 & URL", description: "Encode and decode common text transformations." },
  { icon: "📊", title: "SQL Formatter", description: "Clean up and format database queries." },
  { icon: "⌨", title: "Regex Tester", description: "Evaluate regular expressions faster." },
  { icon: "#", title: "Hash Generator", description: "Create common hashes without switching tools." },
];

const faqs = [
  {
    question: "What is Developer Utility?",
    answer:
      "Developer Utility is a desktop application that brings common developer utilities together in one local, focused workspace for requests, JSON, encoding, timestamps, and other daily tasks.",
  },
  {
    question: "Is Developer Utility free?",
    answer:
      "The project is open source and can be used and modified in accordance with the repository license. The desktop app is not presented here as a paid SaaS product.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "The project is configured to build Windows and macOS desktop installers. The repository includes Windows NSIS packaging and macOS disk image packaging scripts, but platform availability depends on the builds you publish.",
  },
  {
    question: "Does it require Python?",
    answer:
      "The current desktop app is a React + TypeScript + Electron application. The repository README notes a Python-based development runner, but the app itself is a local Electron app and does not require Python for normal use.",
  },
  {
    question: "Where can I download it?",
    answer:
      "Use the download buttons on this site to point to your configured Windows or macOS installer URLs. If a URL is not configured, the related button is disabled until you add the release link.",
  },
  {
    question: "Is the project open source?",
    answer:
      "Yes. The project is published in the open on GitHub and the website links directly to the repository for source, issues, and releases.",
  },
];

function App() {
  return (
    <div className="page-shell">
      <Navbar />
      <main>
        <Hero />
        <TrustStrip />
        <FeaturesSection />
        <ProductShowcase />
        <ToolsGrid />
        <WhySection />
        <DownloadSection />
        <OpenSourceSection />
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}

function Navbar() {
  return (
    <header className="topbar">
      <div className="container nav-inner">
        <a href="#home" className="brand" aria-label="Developer Utility home">
          <LogoMark />
          <span>Developer Utility</span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#tools">Tools</a>
          <a href="#download">Download</a>
          <a href={repoUrl} target="_blank" rel="noreferrer">GitHub</a>
        </nav>

        <div className="nav-actions">
          <a
            href={windowsDownloadUrl || "#download"}
            className="button button-primary"
            onClick={(event) => {
              if (!windowsDownloadUrl) event.preventDefault();
            }}
          >
            Download
          </a>
          <a href={repoUrl} target="_blank" rel="noreferrer" className="icon-button" aria-label="Developer Utility on GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5A12 12 0 0 0 8.21 23.4c.6.11.82-.26.82-.58 0-.29-.01-1.08-.02-2.12-3.34.72-4.04-1.6-4.04-1.6-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.72.08-.72 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.92 0-1.31.47-2.38 1.24-3.21-.12-.3-.54-1.52.12-3.16 0 0 1-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.29-1.55 3.29-1.23 3.29-1.23.66 1.64.24 2.86.12 3.16.77.83 1.24 1.9 1.24 3.21 0 4.6-2.8 5.61-5.47 5.91.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.21.7.82.58A12 12 0 0 0 12 .5Z" /></svg>
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="home" className="hero section">
      <div className="container hero-grid">
        <div className="hero-content reveal">
          <div className="eyebrow">Built for developers</div>
          <h1>Developer tools.<br />One powerful desktop utility.</h1>
          <p>
            Developer Utility brings everyday development utilities into one fast, focused desktop application — so you spend less time switching between tools and more time building.
          </p>
          <div className="cta-row">
            <a
              href={windowsDownloadUrl || "#download"}
              className="button button-primary"
              onClick={(event) => {
                if (!windowsDownloadUrl) event.preventDefault();
              }}
            >
              Download for Windows
            </a>
            <a href={repoUrl} target="_blank" rel="noreferrer" className="button button-secondary">
              View on GitHub
            </a>
          </div>
          <ul className="mini-stats" aria-label="Developer Utility highlights">
            <li>HTTP tools</li>
            <li>cURL generation</li>
            <li>JSON utilities</li>
          </ul>
        </div>

        <div className="mockup-wrap reveal delay-1">
          <div className="browser-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="mockup-window">
            <aside className="mock-sidebar">
              <div className="mock-brand">
                <LogoMark compact />
                <span>Utility</span>
              </div>
              <div className="mock-nav active">cURL Workspace</div>
              <div className="mock-nav">JSON Formatter</div>
              <div className="mock-nav">JWT Decoder</div>
              <div className="mock-nav">Request Analyzer</div>
            </aside>
            <div className="mock-content">
              <div className="mock-pane-header">
                <div className="mock-header-pill">Request</div>
                <div className="mock-header-pill accent">Generate cURL</div>
              </div>
              <div className="request-box">
                <div className="line method">POST</div>
                <div className="line url">https://api.example.com/v1/users</div>
                <div className="line key">Authorization</div>
                <div className="line value">Bearer token</div>
                <div className="line key">Content-Type</div>
                <div className="line value">application/json</div>
                <div className="line body">{"\"name\":\"Ava\",\"role\":\"builder\""}</div>
              </div>
              <div className="mock-response">
                <span>curl</span>
                <small>{"--header 'Content-Type: application/json'"}</small>
                <small>{"--data-raw '{\"name\":\"Ava\",\"role\":\"builder\"}'"}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    "Built for developers",
    "Fast and lightweight",
    "Desktop-first",
    "Open development",
    "Privacy-focused local utilities",
  ];

  return (
    <section className="trust-strip section-sm">
      <div className="container trust-grid">
        {items.map((item) => (
          <div key={item} className="trust-item reveal">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="section">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">Features</span>
          <h2>Everything you need. In one place.</h2>
        </div>
        <div className="feature-grid">
          {featureCards.map((feature, index) => (
            <article key={feature.title} className="feature-card reveal" style={{ transitionDelay: `${index * 60}ms` }}>
              <div className="feature-icon" aria-hidden="true">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductShowcase() {
  return (
    <section className="section showcase-block">
      <div className="container showcase-stack">
        <ShowcaseRow
          flipped={false}
          title="Build requests faster"
          description="Turn raw HTTP payloads and cURL commands into clear, actionable requests without breaking your flow. Developer Utility helps you inspect headers, bodies, and structure without hunting across browser tabs or different tools."
          badges={["cURL parse", "HTTP headers", "request generation"]}
        >
          <div className="showcase-panel narrow">
            <div className="showcase-toolbar">
              <span />
              <span />
              <span />
            </div>
            <div className="showcase-middle">
              <div className="showcase-card">
                <strong>Raw request</strong>
                <code>curl -X POST https://api.example.com/v1/users</code>
                <span>--header 'Authorization: Bearer token'</span>
              </div>
              <div className="showcase-card dark">
                <strong>Generated cURL</strong>
                <code>{"curl 'https://api.example.com/v1/users'"}</code>
                <code>{"--header 'Authorization: Bearer token'"}</code>
                <code>{"--data-raw '{\"name\":\"Ava\"}'"}</code>
              </div>
            </div>
          </div>
        </ShowcaseRow>

        <ShowcaseRow
          flipped={true}
          title="Inspect and debug HTTP traffic"
          description="Work with live request data, response details, and analysis tools in a desktop-first environment that keeps local workflows fast and focused."
          badges={["live inspection", "status codes", "API debugging"]}
        >
          <div className="showcase-panel">
            <div className="showcase-toolbar">
              <span />
              <span />
              <span />
            </div>
            <div className="showcase-log">
              <div className="log-row"><em>GET</em><strong>https://api.example.com/users</strong><span>200 OK</span></div>
              <div className="log-row"><em>POST</em><strong>https://api.example.com/login</strong><span>201 Created</span></div>
              <div className="log-row"><em>PATCH</em><strong>https://api.example.com/profile</strong><span>204 No Content</span></div>
            </div>
            <div className="response-block">
              <div className="response-header">Headers</div>
              <div>content-type: application/json</div>
              <div>x-request-id: abc123</div>
            </div>
          </div>
        </ShowcaseRow>

        <ShowcaseRow
          flipped={false}
          title="Utilities without browser tabs"
          description="Keep JSON, JWT, SQL, regex, and hashing tools in the same place so you can move from debugging to formatting to validating without leaving the app."
          badges={["JSON", "JWT", "SQL", "regex", "hashing"]}
        >
          <div className="showcase-panel mini-grid">
            <div className="mini-card">JSON Compare</div>
            <div className="mini-card">JWT Decode</div>
            <div className="mini-card">Base64</div>
            <div className="mini-card">UUID</div>
            <div className="mini-card">SQL</div>
            <div className="mini-card">Hash</div>
          </div>
        </ShowcaseRow>
      </div>
    </section>
  );
}

function ShowcaseRow({
  title,
  description,
  badges,
  children,
  flipped,
}: {
  title: string;
  description: string;
  badges: string[];
  children: React.ReactNode;
  flipped: boolean;
}) {
  return (
    <div className={`showcase-row ${flipped ? "reverse" : ""}`}>
      <div className="showcase-copy reveal">
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="badge-row">
          {badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      </div>
      <div className="showcase-visual reveal">{children}</div>
    </div>
  );
}

function ToolsGrid() {
  return (
    <section id="tools" className="section tool-section">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">Developer Toolkit</span>
          <h2>Everything you need for everyday development work.</h2>
        </div>

        <div className="tool-grid">
          {tools.map((tool, index) => (
            <article key={tool.title} className="tool-card reveal" style={{ transitionDelay: `${index * 40}ms` }}>
              <div className="tool-badge" aria-hidden="true">{tool.icon}</div>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
            </article>
          ))}
        </div>

        <div className="centered-cta reveal">
          <a href="#download" className="button button-primary">Explore Developer Utility</a>
        </div>
      </div>
    </section>
  );
}

function WhySection() {
  const points = [
    "Faster workflow for everyday API and data work",
    "A centralized toolkit instead of scattered browser tabs",
    "Desktop experience built for quick iteration and local-first work",
    "Developer-focused interface designed to stay out of the way",
  ];

  return (
    <section className="section why-section">
      <div className="container">
        <div className="section-heading reveal narrow">
          <span className="eyebrow">Why Developer Utility</span>
          <h2>Stop switching between 10 browser tabs.</h2>
        </div>
        <div className="benefit-grid">
          {points.map((point) => (
            <div key={point} className="benefit-item reveal">
              <div className="checkmark">✓</div>
              <p>{point}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DownloadSection() {
  const windowsDisabled = !windowsDownloadUrl;
  const macDisabled = !macDownloadUrl;

  return (
    <section id="download" className="section download-section">
      <div className="container download-panel reveal">
        <div>
          <span className="eyebrow">Download</span>
          <h2>Ready to simplify your development workflow?</h2>
          <p>Download Developer Utility and keep your everyday development tools in one place.</p>
        </div>
        <div className="download-actions">
          <a
            href={windowsDownloadUrl || "#download"}
            className={`button button-primary ${windowsDisabled ? "disabled" : ""}`}
            aria-disabled={windowsDisabled}
            onClick={(event) => {
              if (windowsDisabled) event.preventDefault();
            }}
          >
            {windowsDisabled ? "Windows download coming soon" : "Download for Windows"}
          </a>
          <a
            href={macDownloadUrl || "#download"}
            className={`button button-secondary ${macDisabled ? "disabled" : ""}`}
            aria-disabled={macDisabled}
            onClick={(event) => {
              if (macDisabled) event.preventDefault();
            }}
          >
            {macDisabled ? "macOS download coming soon" : "Download for macOS"}
          </a>
          <a href={releasesUrl || repoUrl} target="_blank" rel="noreferrer" className="button button-ghost">
            View Releases
          </a>
        </div>
      </div>
    </section>
  );
}

function OpenSourceSection() {
  return (
    <section className="section open-source">
      <div className="container open-source-panel reveal">
        <div>
          <span className="eyebrow">Open source</span>
          <h2>Built in the open.</h2>
        </div>
        <div className="source-actions">
          <a href={repoUrl} target="_blank" rel="noreferrer" className="button button-primary">Star on GitHub</a>
          <a href={repoUrl} target="_blank" rel="noreferrer" className="button button-secondary">View source</a>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="section faq-section">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">FAQ</span>
          <h2>Common questions.</h2>
        </div>
        <div className="faq-list">
          {faqs.map((item) => (
            <details key={item.question} className="faq-item reveal" open={item.question === "What is Developer Utility?"}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <a href="#home" className="brand footer-brand" aria-label="Developer Utility home">
            <LogoMark />
            <span>Developer Utility</span>
          </a>
          <p className="footer-copy">A desktop toolkit for developers who want everyday utilities in one focused place.</p>
        </div>

        <nav aria-label="Footer navigation" className="footer-nav">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#tools">Tools</a>
          <a href="#download">Download</a>
          <a href={repoUrl} target="_blank" rel="noreferrer">GitHub</a>
        </nav>

        <div className="footer-meta">
          <a href={repoUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a href={releasesUrl || repoUrl} target="_blank" rel="noreferrer">Releases</a>
        </div>
      </div>
      <div className="container footer-bottom">© 2026 Developer Utility. Built for developers.</div>
    </footer>
  );
}

function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo-mark ${compact ? "compact" : ""}`} aria-hidden="true">
      <span className="logo-bracket left">&lt;</span>
      <span className="logo-slash">/</span>
      <span className="logo-bracket right">&gt;</span>
    </span>
  );
}

function revealOnScroll() {
  const elements = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    { threshold: 0.14 },
  );

  elements.forEach((element) => observer.observe(element));
}

if (typeof window !== "undefined") {
  revealOnScroll();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
