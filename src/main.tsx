import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { usePersistentState } from "./utils/toolState";
import * as tools from "./utils/developerTools";
import {
  analyzeHttp,
  convertUnit,
  curlToCode,
  findStatus,
  formatDiff,
  formatSql,
  generateTypes,
  jsonDiff,
  jsonPaths,
  jsonStatistics,
  mockJson,
  replacePlaceholders,
} from "./utils/developerTools";
import { JsonTree } from "./components/JsonTree";
import type { Header, ParsedRequest } from "./utils/developerTools";

type Tool = { id: string; label: string; group: string };
const navigation: Tool[] = [
  { id: "home", label: "Workspace", group: "" },
  { id: "curl", label: "cURL Workspace", group: "API & Network" },
  { id: "curl-code", label: "cURL → Code", group: "API & Network" },
  { id: "api", label: "API Tester", group: "API & Network" },
  { id: "request-analyzer", label: "Request Analyzer", group: "API & Network" },
  { id: "headers", label: "Headers Analyzer", group: "API & Network" },
  { id: "status", label: "HTTP Status Codes", group: "API & Network" },
  { id: "json", label: "JSON Formatter", group: "JSON" },
  { id: "json-compare", label: "JSON Compare", group: "JSON" },
  { id: "json-paths", label: "JSON Path Explorer", group: "JSON" },
  { id: "json-types", label: "JSON Type Generator", group: "JSON" },
  { id: "mock-json", label: "Mock JSON Generator", group: "JSON" },
  { id: "jwt", label: "JWT Decoder", group: "Data" },
  { id: "encoding", label: "Base64 & URL", group: "Data" },
  { id: "sql", label: "SQL Formatter", group: "Data" },
  { id: "postgres", label: "PostgreSQL Helper", group: "Data" },
  { id: "regex", label: "Regex Tester", group: "Development" },
  { id: "hash", label: "Hash Generator", group: "Development" },
  { id: "uuid", label: "UUID Generator", group: "Development" },
  { id: "time", label: "Timestamp", group: "Development" },
  { id: "mobile", label: "Deep Link Generator", group: "Mobile" },
  { id: "mobile-android", label: "Android Utilities", group: "Mobile" },
  { id: "mobile-ios", label: "iOS Utilities", group: "Mobile" },
  { id: "units", label: "PX / DP / PT", group: "Mobile" },
];
const title = (id: string) =>
  navigation.find((item) => item.id === id)?.label ?? "Developer Utility";
function App() {
  const [active, setActive] = useState("home");
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(
    () => (localStorage.getItem("theme") ?? "dark") === "dark",
  );
  const [notice, setNotice] = useState("Ready");
  useEffect(() => {
    const theme = dark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [dark]);
  return (
    <div
      className={`${dark ? "app dark" : "app"}${collapsed ? " sidebar-collapsed" : ""}`}
    >
      <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand">
          <small>DEVELOPER</small>
          <strong>Utility</strong>
        </div>
        {[...new Set(navigation.map((item) => item.group))].map((group) => (
          <section key={group}>
            {group && <h2>{group}</h2>}
            {navigation
              .filter((item) => item.group === group)
              .map((item) => (
                <button
                  key={item.id}
                  className={active === item.id ? "nav active" : "nav"}
                  onClick={() => setActive(item.id)}
                >
                  <span>›</span>
                  <em>{item.label}</em>
                </button>
              ))}
          </section>
        ))}
      </aside>
      <main>
        <header>
          <button
            className="icon"
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed((value) => !value)}
          >
            ☰
          </button>
          <h1>{title(active)}</h1>
          <button
            className="secondary"
            onClick={() => setDark((value) => !value)}
          >
            Theme
          </button>
        </header>
        <div className="content">
          <Page id={active} notify={setNotice} open={setActive} />
        </div>
        <footer>
          <span className="dot" />
          {notice}
        </footer>
      </main>
    </div>
  );
}
function Page({
  id,
  notify,
  open,
}: {
  id: string;
  notify: (message: string) => void;
  open: (id: string) => void;
}) {
  if (id === "home") return <Home key="home" open={open} />;
  if (id === "json-compare") return <JsonCompare key={id} notify={notify} />;
  if (id === "json-paths") return <JsonPaths key={id} notify={notify} />;
  if (id === "json-types") return <JsonTypes key={id} notify={notify} />;
  if (id === "mock-json") return <MockJson key={id} notify={notify} />;
  if (id === "postgres") return <PostgresHelper key={id} notify={notify} />;
  if (id === "curl-code") return <CurlCode key={id} notify={notify} />;
  if (id === "api") return <ApiTester key={id} notify={notify} />;
  if (id === "request-analyzer")
    return <RequestAnalyzer key={id} notify={notify} />;
  if (id === "mobile-android")
    return <MobileHelper key={id} id={id} platform="Android" notify={notify} />;
  if (id === "mobile-ios")
    return <MobileHelper key={id} id={id} platform="iOS" notify={notify} />;
  if (id === "units") return <UnitsConverter key={id} notify={notify} />;
  return <ToolPage key={id} id={id} notify={notify} />;
}
function Home({ open }: { open: (id: string) => void }) {
  return (
    <>
      <div className="hero">
        <h2>Build, inspect, and transform.</h2>
        <p>A focused local workspace for everyday developer tasks.</p>
      </div>
      <div className="cards">
        {[
          { id: "curl", label: "cURL Workspace" },
          { id: "api", label: "API Tester" },
          { id: "json", label: "JSON Formatter" },
          { id: "regex", label: "Regex Tester" },
          { id: "jwt", label: "JWT Decoder" },
          { id: "hash", label: "Hash Generator" },
        ].map((card) => (
          <article key={card.id}>
            <h3>{card.label}</h3>
            <p>Fast local tooling with no cloud dependency.</p>
            <button onClick={() => open(card.id)}>
              Open tool
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
function tryParseJson(text: string): { ok: boolean; value: unknown } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: undefined };
  }
}

/** Compact labeled editor block used by every tool tab. */
function Field({
  label,
  actions,
  span,
  children,
}: {
  label: string;
  actions?: ReactNode;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={span ? "field span" : "field"}>
      <div className="fieldlabel">
        <em>{label}</em>
        {actions ? <span className="fieldactions">{actions}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "tree" | "raw";
  onChange: (next: "tree" | "raw") => void;
}) {
  return (
    <span className="viewtoggle" role="group" aria-label="JSON view mode">
      <button
        type="button"
        className={view === "tree" ? "on" : ""}
        onClick={() => onChange("tree")}
      >
        Tree
      </button>
      <button
        type="button"
        className={view === "raw" ? "on" : ""}
        onClick={() => onChange("raw")}
      >
        Raw
      </button>
    </span>
  );
}

/** JSON output with a Postman-style tree view, falling back to raw text. */
function JsonOutput({
  label,
  text,
  onChange,
}: {
  label: string;
  text: string;
  onChange?: (value: string) => void;
}) {
  const [view, setView] = useState<"tree" | "raw">("tree");
  const [treeKey, setTreeKey] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const parsed = useMemo(() => tryParseJson(text), [text]);
  const isJson = parsed.ok && text.trim().length > 0;
  return (
    <Field
      label={label}
      actions={
        isJson ? (
          <>
            <ViewToggle view={view} onChange={setView} />
            {view === "tree" ? (
              <span className="treecontrols">
                <button
                  type="button"
                  title="Expand every object and array"
                  onClick={() => {
                    setExpanded(true);
                    setTreeKey((key) => key + 1);
                  }}
                >
                  Expand all
                </button>
                <button
                  type="button"
                  title="Collapse every object and array"
                  onClick={() => {
                    setExpanded(false);
                    setTreeKey((key) => key + 1);
                  }}
                >
                  Collapse all
                </button>
              </span>
            ) : null}
          </>
        ) : null
      }
    >
      {isJson && view === "tree" ? (
        <div className="treewrap">
          <JsonTree
            key={treeKey}
            data={parsed.value}
            defaultExpanded={expanded}
          />
        </div>
      ) : (
        <textarea
          readOnly={!onChange}
          value={text}
          aria-label={label}
          placeholder={label}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        />
      )}
    </Field>
  );
}

function ToolPage({
  id,
  notify,
}: {
  id: string;
  notify: (message: string) => void;
}) {
  const [input, setInput] = usePersistentState(`${id}:input`, "");
  const [output, setOutput] = usePersistentState(`${id}:output`, "");
  const [aux, setAux] = usePersistentState(`${id}:aux`, "");
  const [jwtHeader, setJwtHeader] = usePersistentState("jwt:header", "");
  const [jwtPayload, setJwtPayload] = usePersistentState("jwt:payload", "");
  const copy = async () => {
    const ok = await window.developerUtility.clipboard.copy(output);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  const run = async () => {
    try {
      let value = "";
      if (id === "curl") {
        const request = input.trim().startsWith("curl")
          ? tools.parseCurl(input)
          : tools.parseRaw(input);
        value = `${tools.generateCurl(request)}\n\nParsed request\nMethod: ${request.method}\nURL: ${request.url}\n\nHeaders\n${request.headers.map(([key, item]) => `${key}: ${item}`).join("\n")}\n\nBody\n${request.body}`;
      } else if (id === "json")
        value =
          aux === "minify"
            ? tools.minifyJson(input)
            : aux === "validate"
              ? tools.validateJson(input)
              : tools.formatJson(input);
      else if (id === "encoding")
        value =
          aux === "decode"
            ? tools.base64Decode(input)
            : aux === "url-encode"
              ? tools.urlEncode(input)
              : aux === "url-decode"
                ? tools.urlDecode(input)
                : tools.base64Encode(input);
      else if (id === "regex") value = tools.runRegex(aux, input);
      else if (id === "jwt") {
        const [header, payload] = input.trim().split(".");
        if (!payload)
          throw new Error("JWT must contain header, payload, and signature");
        const decode = (part: string) =>
          JSON.stringify(
            JSON.parse(
              tools.base64Decode(
                part.replaceAll("-", "+").replaceAll("_", "/"),
              ),
            ),
            null,
            2,
          );
        const headerJson = decode(header);
        const payloadJson = decode(payload);
        setJwtHeader(headerJson);
        setJwtPayload(payloadJson);
        value = `Header\n${headerJson}\n\nPayload\n${payloadJson}`;
      } else if (id === "hash")
        value = await tools.makeHash(input, aux || "sha256");
      else if (id === "uuid") value = crypto.randomUUID();
      else if (id === "time") {
        const number = Number(input);
        if (!Number.isFinite(number))
          throw new Error("Enter epoch seconds or milliseconds");
        const date = new Date(Math.abs(number) > 1e10 ? number : number * 1000);
        value = `Local: ${date.toString()}\nUTC: ${date.toUTCString()}`;
      } else if (id === "headers")
        value = tools.headersReport(input, aux === "mask");
      else if (id === "sql") value = formatSql(input);
      else if (id === "status") {
        const query = input.toLowerCase();
        value = findStatus(query)
          .map((row) => row.join("  ·  "))
          .join("\n");
      } else if (id === "mobile")
        value = tools.deepLink(aux || "myapp", "", input, output);
      setOutput(value);
      notify("Completed");
    } catch (error) {
      setOutput(`Error: ${(error as Error).message}`);
      notify("Action failed");
    }
  };
  const clear = () => {
    setInput("");
    setOutput("");
    setJwtHeader("");
    setJwtPayload("");
    notify("Cleared");
  };
  const config = {
    curl: [
      "Raw HTTP request or cURL",
      "Generated cURL and parsed request",
      "Generate cURL",
    ],
    json: ["Input JSON", "Output", "Format JSON"],
    encoding: ["Input", "Output", "Encode Base64"],
    regex: ["Test text", "Matches", "Test regex"],
    jwt: ["JWT token", "Decoded token", "Decode"],
    hash: ["Text", "Digest", "Generate hash"],
    uuid: ["", "UUID v4", "Generate UUID"],
    time: ["Epoch seconds or milliseconds", "Converted time", "Convert"],
    headers: ["Headers", "Analysis", "Analyze"],
    sql: ["SQL", "Formatted SQL", "Format SQL"],
    status: ["Search code or name", "Reference", "Search"],
    mobile: ["Path", "Query parameters (key=value)", "Generate link"],
  }[id] ?? ["Input", "Output", "Run"];
  const auxControl =
    id === "regex" ? (
      <input
        className="pattern"
        placeholder="Regular expression"
        value={aux}
        onChange={(event) => setAux(event.target.value)}
      />
    ) : id === "hash" ? (
      <select
        value={aux || "sha256"}
        onChange={(event) => setAux(event.target.value)}
      >
        <option value="sha256">SHA-256</option>
        <option value="sha1">SHA-1</option>
        <option value="sha512">SHA-512</option>
      </select>
    ) : id === "json" ? (
      <select value={aux} onChange={(event) => setAux(event.target.value)}>
        <option value="format">Format</option>
        <option value="minify">Minify</option>
        <option value="validate">Validate</option>
      </select>
    ) : id === "encoding" ? (
      <select value={aux} onChange={(event) => setAux(event.target.value)}>
        <option value="encode">Base64 encode</option>
        <option value="decode">Base64 decode</option>
        <option value="url-encode">URL encode</option>
        <option value="url-decode">URL decode</option>
      </select>
    ) : id === "headers" ? (
      <label className="check">
        <input
          type="checkbox"
          checked={aux === "mask"}
          onChange={(event) => setAux(event.target.checked ? "mask" : "")}
        />
        Mask secrets
      </label>
    ) : null;
  return (
    <div className="tool">
      <div className="toolhead">
        {auxControl}
        <span className="spacer" />
        <button className="primary" onClick={() => void run()}>
          {config[2]}
        </button>
        <button className="secondary" onClick={() => void copy()}>
          Copy
        </button>
        <button className="secondary" onClick={clear}>
          Clear
        </button>
      </div>
      {id === "jwt" ? (
        <div className="editorgrid three jwt-editor">
          <Field label="JWT token">
            <textarea
              aria-label="JWT token"
              placeholder="Paste a JWT token here"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </Field>
          <JsonOutput label="Header" text={jwtHeader} />
          <JsonOutput label="Payload" text={jwtPayload} />
        </div>
      ) : (
        <>
          {config[0] ? (
            <Field label={config[0]}>
              <textarea
                aria-label={config[0]}
                placeholder={config[0]}
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </Field>
          ) : null}
          {id === "mobile" ? (
            <Field label={config[1]}>
              <textarea
                aria-label={config[1]}
                placeholder={config[1]}
                value={output}
                onChange={(event) => setOutput(event.target.value)}
              />
            </Field>
          ) : (
            <JsonOutput label={config[1]} text={output} />
          )}
        </>
      )}
    </div>
  );
}
function JsonCompare({ notify }: { notify: (message: string) => void }) {
  const [left, setLeft] = usePersistentState("json-compare:left", "");
  const [right, setRight] = usePersistentState("json-compare:right", "");
  const [result, setResult] = usePersistentState("json-compare:result", "");
  const compare = () => {
    try {
      const changes = jsonDiff(JSON.parse(left), JSON.parse(right));
      setResult(formatDiff(changes));
      notify(
        changes.length
          ? "JSON documents differ"
          : "JSON documents are identical",
      );
    } catch (error) {
      setResult(`Error: ${(error as Error).message}`);
      notify("Invalid JSON");
    }
  };
  const copy = async () => {
    const ok = await window.developerUtility.clipboard.copy(result);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>Compare two JSON documents</span>
        <button className="primary" onClick={() => compare()}>
          Compare
        </button>
        <button className="secondary" onClick={() => void copy()}>
          Copy result
        </button>
        <button
          className="secondary"
          onClick={() => {
            setLeft("");
            setRight("");
            setResult("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="editorgrid three">
        <Field label="Original">
          <textarea
            placeholder="Original JSON"
            value={left}
            onChange={(event) => setLeft(event.target.value)}
          />
        </Field>
        <Field label="Modified">
          <textarea
            placeholder="Modified JSON"
            value={right}
            onChange={(event) => setRight(event.target.value)}
          />
        </Field>
        <Field label="Diff summary">
          <textarea placeholder="Diff summary" value={result} readOnly />
        </Field>
      </div>
    </div>
  );
}
function JsonPaths({ notify }: { notify: (message: string) => void }) {
  const [input, setInput] = usePersistentState("json-paths:input", "");
  const [paths, setPaths] = usePersistentState("json-paths:paths", "");
  const [values, setValues] = usePersistentState("json-paths:values", "");
  const explore = () => {
    try {
      const pairs = jsonPaths(JSON.parse(input));
      setPaths(pairs.map(([p]) => p).join("\n"));
      setValues(pairs.map(([p, v]) => `${p}: ${JSON.stringify(v)}`).join("\n"));
      notify(`Found ${pairs.length} paths`);
    } catch (error) {
      setPaths(`Error: ${(error as Error).message}`);
      setValues("");
      notify("Invalid JSON");
    }
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>Explore JSON paths and values</span>
        <button className="primary" onClick={() => explore()}>
          Explore
        </button>
        <button
          className="secondary"
          onClick={() =>
            window.developerUtility.clipboard
              .copy(paths)
              .then(() => notify("Copied paths ✓"))
          }
        >
          Copy Paths
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInput("");
            setPaths("");
            setValues("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="editorgrid three">
        <Field label="Input JSON">
          <textarea
            placeholder="Input JSON"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </Field>
        <Field label="Paths">
          <textarea
            placeholder="Paths (select text to copy)"
            value={paths}
            readOnly
          />
        </Field>
        <Field label="Selected value">
          <textarea placeholder="Selected value" value={values} readOnly />
        </Field>
      </div>
    </div>
  );
}
function JsonTypes({ notify }: { notify: (message: string) => void }) {
  const [input, setInput] = usePersistentState("json-types:input", "");
  const [output, setOutput] = usePersistentState("json-types:output", "");
  const [language, setLanguage] = usePersistentState(
    "json-types:language",
    "TypeScript",
  );
  const [rootName, setRootName] = usePersistentState(
    "json-types:rootName",
    "Root",
  );
  const generate = () => {
    try {
      setOutput(generateTypes(JSON.parse(input), language, rootName || "Root"));
      notify("Types generated");
    } catch (error) {
      setOutput(`Error: ${(error as Error).message}`);
      notify("Invalid JSON");
    }
  };
  const copy = async () => {
    const ok = await window.developerUtility.clipboard.copy(output);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>Generate types from a JSON sample</span>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
        >
          {["TypeScript", "Java", "Kotlin", "Swift", "Python", "C#", "Go"].map(
            (lang) => (
              <option key={lang}>{lang}</option>
            ),
          )}
        </select>
        <input
          placeholder="Root type name"
          value={rootName}
          onChange={(event) => setRootName(event.target.value)}
          style={{ flex: "0 0 120px" }}
        />
        <span className="spacer" />
        <button className="primary" onClick={() => generate()}>
          Generate
        </button>
        <button className="secondary" onClick={() => void copy()}>
          Copy
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInput("");
            setOutput("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="editorgrid">
        <Field label="Input JSON">
          <textarea
            placeholder="Input JSON"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </Field>
        <Field label="Generated types">
          <textarea placeholder="Generated types" value={output} readOnly />
        </Field>
      </div>
    </div>
  );
}
function MockJson({ notify }: { notify: (message: string) => void }) {
  const [input, setInput] = usePersistentState("mock-json:input", "");
  const [output, setOutput] = usePersistentState("mock-json:output", "");
  const [records, setRecords] = usePersistentState("mock-json:records", "1");
  const generate = () => {
    try {
      const result = mockJson(JSON.parse(input), parseInt(records) || 1);
      setOutput(JSON.stringify(result, null, 2));
      notify("Mock JSON generated");
    } catch (error) {
      setOutput(`Error: ${(error as Error).message}`);
      notify("Invalid schema");
    }
  };
  const copy = async () => {
    const ok = await window.developerUtility.clipboard.copy(output);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>Mock data from a schema</span>
        <select
          value={records}
          onChange={(event) => setRecords(event.target.value)}
        >
          {["1", "10", "50", "100", "1000"].map((n) => (
            <option key={n} value={n}>
              {n} record{n !== "1" ? "s" : ""}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="primary" onClick={() => generate()}>
          Generate
        </button>
        <button className="secondary" onClick={() => void copy()}>
          Copy
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInput("");
            setOutput("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="editorgrid">
        <Field label="Schema JSON">
          <textarea
            placeholder='Schema JSON (use "string", "number", "boolean" as type placeholders)'
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </Field>
        <JsonOutput label="Mock JSON" text={output} />
      </div>
    </div>
  );
}
function PostgresHelper({ notify }: { notify: (message: string) => void }) {
  const [sql, setSql] = usePersistentState("postgres:sql", "");
  const [mappings, setMappings] = usePersistentState("postgres:mappings", "");
  const [output, setOutput] = usePersistentState("postgres:output", "");
  const convert = () => {
    try {
      const pairs: Record<string, string> = {};
      mappings.split("\n").forEach((line) => {
        const index = line.indexOf("=");
        if (index > 0)
          pairs[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      });
      setOutput(replacePlaceholders(sql, pairs));
      notify("Placeholders converted");
    } catch (error) {
      setOutput(`Error: ${(error as Error).message}`);
      notify("Conversion failed");
    }
  };
  const copy = async () => {
    const ok = await window.developerUtility.clipboard.copy(output);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>Convert PostgreSQL dollar-quoted placeholders</span>
        <button className="primary" onClick={() => convert()}>
          Convert
        </button>
        <button className="secondary" onClick={() => void copy()}>
          Copy
        </button>
        <button
          className="secondary"
          onClick={() => {
            setSql("");
            setMappings("");
            setOutput("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="editorgrid">
        <Field label="SQL with literal values">
          <textarea
            placeholder="SQL with literal values"
            value={sql}
            onChange={(event) => setSql(event.target.value)}
          />
        </Field>
        <Field label="Mappings (value = placeholder)">
          <textarea
            placeholder="Mappings: value = placeholder name"
            value={mappings}
            onChange={(event) => setMappings(event.target.value)}
          />
        </Field>
        <Field label="Output SQL" span>
          <textarea placeholder="Output SQL" value={output} readOnly />
        </Field>
      </div>
    </div>
  );
}
function CurlCode({ notify }: { notify: (message: string) => void }) {
  const [input, setInput] = usePersistentState("curl-code:input", "");
  const [output, setOutput] = usePersistentState("curl-code:output", "");
  const [language, setLanguage] = usePersistentState(
    "curl-code:language",
    "Python requests",
  );
  const generate = () => {
    try {
      const request = tools.parseCurl(input);
      setOutput(curlToCode(request, language));
      notify("Code generated");
    } catch (error) {
      setOutput(`Error: ${(error as Error).message}`);
      notify("Invalid cURL");
    }
  };
  const copy = async () => {
    const ok = await window.developerUtility.clipboard.copy(output);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>cURL → client code</span>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
        >
          {[
            "Python requests",
            "JavaScript fetch",
            "Axios",
            "Kotlin OkHttp",
            "Swift URLSession",
          ].map((lang) => (
            <option key={lang}>{lang}</option>
          ))}
        </select>
        <span className="spacer" />
        <button className="primary" onClick={() => generate()}>
          Generate
        </button>
        <button className="secondary" onClick={() => void copy()}>
          Copy
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInput("");
            setOutput("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="editorgrid">
        <Field label="cURL command">
          <textarea
            placeholder="cURL command"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </Field>
        <Field label="Generated code">
          <textarea placeholder="Generated code" value={output} readOnly />
        </Field>
      </div>
    </div>
  );
}
type HeaderRow = { id: number; key: string; value: string };
type ParamRow = { id: number; key: string; value: string; description: string };
type ApiTab = {
  id: number;
  label: string;
  method: string;
  url: string;
  params: ParamRow[];
  rows: HeaderRow[];
  bodyMode: "raw" | "json";
  body: string;
  status: string;
  responseHeaders: string;
  response: string;
};
const HEADER_PRESETS: Array<{ key: string; value: string }> = [
  { key: "Content-Type", value: "application/json" },
  { key: "Content-Type", value: "application/x-www-form-urlencoded" },
  { key: "Accept", value: "application/json" },
  { key: "Authorization", value: "Bearer " },
  { key: "X-API-Key", value: "" },
  { key: "User-Agent", value: "DeveloperUtility/1.0" },
  { key: "Cache-Control", value: "no-cache" },
];
function ApiTester({ notify }: { notify: (message: string) => void }) {
  const [requestTab, setRequestTab] = useState<"params" | "headers" | "body">("params");
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  const [method, setMethod] = usePersistentState("api:method", "GET");
  const [url, setUrl] = usePersistentState("api:url", "");
  const [params, setParams] = usePersistentState<ParamRow[]>("api:params", [
    { id: 1, key: "", value: "", description: "" },
  ]);
  const [rows, setRows] = usePersistentState<HeaderRow[]>("api:rows", [
    { id: 1, key: "", value: "" },
  ]);
  const [body, setBody] = usePersistentState("api:body", "");
  const [bodyMode, setBodyMode] = usePersistentState<"raw" | "json">("api:body-mode", "raw");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = usePersistentState("api:status", "");
  const [responseHeaders, setResponseHeaders] = usePersistentState(
    "api:response-headers",
    "",
  );
  const [response, setResponse] = usePersistentState("api:response", "");
  const nextRow = useRef(1000);
  const [tabs, setTabs] = usePersistentState<ApiTab[]>("api:tabs", [
    {
      id: 1,
      label: "Request 1",
      method: "GET",
      url: "",
      params: [{ id: 1, key: "", value: "", description: "" }],
      rows: [{ id: 1, key: "", value: "" }],
      bodyMode: "raw",
      body: "",
      status: "",
      responseHeaders: "",
      response: "",
    },
  ]);
  const [activeId, setActiveId] = usePersistentState<number>("api:active", 1);
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const snapshotActive = (): ApiTab => ({
    id: activeId,
    label: activeTab?.label ?? `Request ${activeId}`,
    method,
    url,
    params,
    rows,
    bodyMode,
    body,
    status,
    responseHeaders,
    response,
  });
  const loadTab = (tab: ApiTab) => {
    const rows = tab.rows ?? [];
    setMethod(tab.method || "GET");
    setUrl(tab.url ?? "");
    setParams(tab.params?.length ? tab.params : [{ id: nextRow.current++, key: "", value: "", description: "" }]);
    setRows(rows.length ? rows : [{ id: nextRow.current++, key: "", value: "" }]);
    setBodyMode(tab.bodyMode ?? "raw");
    setBody(tab.body ?? "");
    setStatus(tab.status ?? "");
    setResponseHeaders(tab.responseHeaders ?? "");
    setResponse(tab.response ?? "");
  };
  const saveActive = () => {
    if (!activeTab) return;
    const snapshot = snapshotActive();
    setTabs((previous) =>
      previous.map((tab) => (tab.id === activeId ? snapshot : tab)),
    );
  };
  const switchTab = (id: number) => {
    if (id === activeId) return;
    saveActive();
    setActiveId(id);
    const target = tabs.find((tab) => tab.id === id);
    if (target) loadTab(target);
  };
  const closeTab = (id: number) => {
    if (tabs.length === 1) {
      saveActive();
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    if (id === activeId) {
      saveActive();
      const neighbor =
        remaining[Math.max(0, Math.min(index, remaining.length - 1))];
      setTabs(remaining);
      setActiveId(neighbor.id);
      loadTab(neighbor);
    } else {
      setTabs(remaining);
    }
  };
  const addTab = () => {
    saveActive();
    const fresh: ApiTab = {
      id: Date.now(),
      label: `Request ${tabs.length + 1}`,
      method: "GET",
      url: "",
      params: [{ id: nextRow.current++, key: "", value: "", description: "" }],
      rows: [{ id: nextRow.current++, key: "", value: "" }],
      bodyMode: "raw",
      body: "",
      status: "",
      responseHeaders: "",
      response: "",
    };
    setTabs((previous) => [...previous, fresh]);
    setActiveId(fresh.id);
    loadTab(fresh);
  };
  const addHeader = () => {
    setRows((previous) => [
      ...previous,
      { id: nextRow.current++, key: "", value: "" },
    ]);
  };
  const addParam = () => {
    setParams((previous) => [
      ...previous,
      { id: nextRow.current++, key: "", value: "", description: "" },
    ]);
  };
  const updateParam = (
    id: number,
    field: "key" | "value" | "description",
    text: string,
  ) => {
    setParams((previous) => {
      const next = previous.map((row) =>
        row.id === id ? { ...row, [field]: text } : row,
      );
      const last = next[next.length - 1];
      if (last && (last.key || last.value || last.description)) {
        next.push({ id: nextRow.current++, key: "", value: "", description: "" });
      }
      return next;
    });
  };
  const removeParam = (id: number) => {
    setParams((previous) => {
      const next = previous.filter((row) => row.id !== id);
      return next.length
        ? next
        : [{ id: nextRow.current++, key: "", value: "", description: "" }];
    });
  };
  useEffect(() => {
    let parsed: URL;
    try {
      parsed = new URL(url || "https://developer-utility.local");
    } catch {
      return;
    }
    parsed.search = "";
    for (const row of params) {
      if (row.key.trim()) parsed.searchParams.append(row.key.trim(), row.value);
    }
    const nextUrl = parsed.origin === "https://developer-utility.local"
      ? url
      : parsed.toString();
    if (nextUrl !== url && params.some((row) => row.key.trim())) setUrl(nextUrl);
  }, [params]);
  // Keep the active tab snapshot in sync with the editor while the user
  // types, so tab labels and stored requests stay current (Postman-style)
  // without requiring an explicit save or tab switch.
  useEffect(() => {
    setTabs((previous) => {
      const current = previous.find((tab) => tab.id === activeId);
      if (!current) return previous;
      if (
        current.method === method &&
        current.url === url &&
        current.params === params &&
        current.rows === rows &&
        current.bodyMode === bodyMode &&
        current.body === body &&
        current.status === status &&
        current.responseHeaders === responseHeaders &&
        current.response === response
      ) {
        return previous;
      }
      return previous.map((tab) =>
        tab.id === activeId
          ? {
              id: activeId,
              label: current.label,
              method,
              url,
              params,
              rows,
              bodyMode,
              body,
              status,
              responseHeaders,
              response,
            }
          : tab,
      );
    });
    // setTabs persists by key and behaves stably across renders, so it is
    // intentionally omitted from the dependency list.
  }, [activeId, method, url, params, rows, bodyMode, body, status, responseHeaders, response]);
  const fill = (request: ParsedRequest) => {
    setMethod(request.method);
    setUrl(request.url);
    setRows([
      ...request.headers.map(([key, value]) => ({
        id: nextRow.current++,
        key,
        value,
      })),
      { id: nextRow.current++, key: "", value: "" },
    ]);
    setBody(request.body);
    setBodyMode("raw");
    setStatus("");
    setResponse("");
    setResponseHeaders("");
  };
  const importText = (text: string) => {
    const trimmed = text.trim();
    if (/^curl(?:\s|$)/i.test(trimmed)) {
      try {
        fill(tools.parseCurl(trimmed));
        notify("Imported cURL from clipboard ✓");
      } catch (error) {
        notify(`Invalid cURL: ${(error as Error).message}`);
      }
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      setUrl(trimmed);
      notify("URL pasted ✓");
      return;
    }
    notify("Clipboard has no cURL command or URL");
  };
  // Import straight from the system clipboard: cURL commands are parsed into
  // method, URL, headers, and body; plain URLs land in the URL field.
  const readClipboard = async (): Promise<string | null> => {
    try {
      return (await window.developerUtility.clipboard.read()) ?? "";
    } catch {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    }
  };
  const pasteFromClipboard = async () => {
    const text = await readClipboard();
    if (text === null) {
      notify("Clipboard unavailable");
      return;
    }
    if (!text.trim()) {
      notify("Clipboard is empty");
      return;
    }
    importText(text);
  };
  // Pasting a cURL command directly into the URL field imports it too.
  const handleUrlPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!/^curl(?:\s|$)/i.test(text.trim())) return;
    event.preventDefault();
    importText(text);
  };
  const applyPreset = (indexText: string) => {
    const preset = HEADER_PRESETS[Number(indexText)];
    if (!preset) return;
    setRows((previous) => {
      const ensureBlank = (list: HeaderRow[]) =>
        list.some((row) => !row.key && !row.value)
          ? list
          : [...list, { id: nextRow.current++, key: "", value: "" }];
      const existing = previous.find(
        (row) => row.key.trim().toLowerCase() === preset.key.toLowerCase(),
      );
      if (existing) {
        return ensureBlank(
          previous.map((row) =>
            row.id === existing.id ? { ...row, value: preset.value } : row,
          ),
        );
      }
      const blank = previous.findIndex((row) => !row.key && !row.value);
      const fresh = {
        id: nextRow.current++,
        key: preset.key,
        value: preset.value,
      };
      if (blank >= 0) {
        const next = [...previous];
        next[blank] = fresh;
        return ensureBlank(next);
      }
      return ensureBlank([...previous, fresh]);
    });
    notify(`${preset.key} header added`);
  };
  const updateRow = (id: number, field: "key" | "value", text: string) => {
    setRows((previous) => {
      const next = previous.map((row) =>
        row.id === id ? { ...row, [field]: text } : row,
      );
      const last = next[next.length - 1];
      if (last && (last.key || last.value)) {
        next.push({ id: nextRow.current++, key: "", value: "" });
      }
      return next;
    });
  };
  const removeRow = (id: number) => {
    setRows((previous) => {
      const next = previous.filter((row) => row.id !== id);
      return next.length
        ? next
        : [{ id: nextRow.current++, key: "", value: "" }];
    });
  };
  const send = async () => {
    const target = url.trim();
    if (!target) {
      notify("Enter a URL first");
      return;
    }
    const active = rows
      .filter((row) => row.key.trim() && row.value.trim())
      .map((row) => [row.key.trim(), row.value.trim()] as Header);
    const requestHeaders = Object.fromEntries(active);
    if (bodyMode === "json" && body.trim()) {
      try {
        JSON.parse(body);
      } catch {
        setStatus("Invalid JSON");
        setResponse("The request body is not valid JSON.");
        notify("Fix invalid JSON before sending");
        return;
      }
    }
    if (
      bodyMode === "json" &&
      body.trim() &&
      !Object.keys(requestHeaders).some((key) => key.toLowerCase() === "content-type")
    ) {
      requestHeaders["Content-Type"] = "application/json";
    }
    const requestBody = ["GET", "HEAD"].includes(method)
      ? undefined
      : body || undefined;
    // Prefer the main-process bridge: the renderer's fetch() is subject to
    // CORS (and fails outright from the file:// origin of the packaged app),
    // while requests sent through the Electron main process are unrestricted.
    const sendViaMain = window.developerUtility?.http?.request;
    setSending(true);
    setStatus("Sending…");
    setResponse("");
    setResponseHeaders("");
    try {
      if (sendViaMain) {
        const result = await sendViaMain({
          method,
          url: target,
          headers: requestHeaders,
          body: requestBody,
        });
        if (!result.ok) {
          setStatus("Error");
          setResponse(`Error: ${result.error ?? "Request failed"}`);
          notify("Request failed");
          return;
        }
        setStatus(`HTTP ${result.status} ${result.statusText}`.trim());
        setResponseHeaders(result.headers.join("\n"));
        setResponse(result.body);
        notify(`Received ${result.status}`);
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(target, {
        method,
        headers: requestHeaders,
        body: requestBody,
        signal: controller.signal,
      });
      clearTimeout(timer);
      setStatus(`HTTP ${response.status} ${response.statusText}`);
      setResponseHeaders(
        [...response.headers]
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n"),
      );
      setResponse(await response.text());
      notify(`Received ${response.status}`);
    } catch (error) {
      setStatus("Error");
      setResponse(`Error: ${(error as Error).message}`);
      notify("Request failed");
    } finally {
      setSending(false);
    }
  };
  const copyResponse = async () => {
    const content = status
      ? `${status}\n\n${responseHeaders}\n\n${response}`
      : response;
    const ok = await window.developerUtility.clipboard.copy(content);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  const metaClass = status.startsWith("HTTP")
    ? "respmeta ok"
    : status === "Error"
      ? "respmeta err"
      : "respmeta";
  const changeBodyMode = (mode: "raw" | "json") => {
    if (mode === bodyMode) return;
    if (mode === "json" && body.trim()) {
      try {
        setBody(JSON.stringify(JSON.parse(body), null, 2));
      } catch {
        notify("JSON mode selected; body still needs valid JSON");
      }
    }
    setBodyMode(mode);
  };
  return (
    <div className="apitester">
      <div className="apitabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const tabMethod = isActive ? method : (tab.method || "GET");
          const tabUrl = isActive ? url : (tab.url || "");
          return (
            <div
              key={tab.id}
              className={isActive ? "apitab active" : "apitab"}
              onClick={() => switchTab(tab.id)}
              title={tabUrl ? `${tabMethod} ${tabUrl}` : "New request"}
            >
              <span className="apitab-method">{tabMethod}</span>
              <span className="apitab-url">{tabUrl || "New request"}</span>
              <button
                className="apitab-close"
                aria-label="Close request"
                title="Close request"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
        <button className="apitab-new" onClick={addTab}>
          + New
        </button>
      </div>
      <section className="panel">
        <div className="reqline">
          <select
            value={method}
            aria-label="HTTP method"
            onChange={(event) => setMethod(event.target.value)}
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
          <input
            placeholder="https://api.example.com/v1/users"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onPaste={handleUrlPaste}
          />
          <button
            className="secondary"
            title="Import a cURL command or URL from the system clipboard"
            onClick={() => void pasteFromClipboard()}
          >
            Paste
          </button>
          <button
            className="send"
            disabled={sending}
            onClick={() => void send()}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        <div className="api-tabs" role="tablist" aria-label="Request options">
          {(["params", "headers", "body"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={requestTab === tab}
              className={requestTab === tab ? "api-tab active" : "api-tab"}
              onClick={() => setRequestTab(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
              {tab === "params" && params.some((row) => row.key.trim()) ? <i /> : null}
              {tab === "headers" && rows.some((row) => row.key.trim() && row.value.trim()) ? <i /> : null}
              {tab === "body" && body ? <i /> : null}
            </button>
          ))}
        </div>
        {requestTab === "params" ? (
          <div className="api-tab-content params-content">
            <div className="sectionrow">
              <label className="panel-label">Query params</label>
              <button className="secondary" onClick={addParam}>+ Add parameter</button>
            </div>
            <div className="paramtable">
              <div className="paramhead"><span>Key</span><span>Value</span><span>Description</span><span /></div>
              {params.map((row) => (
                <div className="paramrow" key={row.id}>
                  <input aria-label="Parameter key" placeholder="Key" value={row.key} onChange={(event) => updateParam(row.id, "key", event.target.value)} />
                  <input aria-label="Parameter value" placeholder="Value" value={row.value} onChange={(event) => updateParam(row.id, "value", event.target.value)} />
                  <input aria-label="Parameter description" placeholder="Description" value={row.description} onChange={(event) => updateParam(row.id, "description", event.target.value)} />
                  <button className="paramremove" aria-label="Remove parameter" title="Remove parameter" onClick={() => removeParam(row.id)}>×</button>
                </div>
              ))}
            </div>
          </div>
        ) : requestTab === "headers" ? (
          <div className="api-tab-content">
            <div className="sectionrow">
              <label className="panel-label">Request headers</label>
              <select
                className="headerpreset"
                value=""
                aria-label="Add a common header"
                onChange={(event) => applyPreset(event.target.value)}
              >
                <option value="">+ Common header…</option>
                {HEADER_PRESETS.map((preset, index) => (
                  <option key={`${preset.key}:${preset.value}`} value={index}>
                    {preset.key}: {preset.value || "…"}
                  </option>
                ))}
              </select>
              <button className="secondary" onClick={addHeader}>+ Add header</button>
            </div>
            <div className="hdrrows">
              {rows.map((row) => (
                <div className="hdrrow" key={row.id}>
                  <input className="key" placeholder="Header name" value={row.key} onChange={(event) => updateRow(row.id, "key", event.target.value)} />
                  <input className="value" placeholder="Value" value={row.value} onChange={(event) => updateRow(row.id, "value", event.target.value)} />
                  <button className="secondary" aria-label="Remove header" title="Remove header" onClick={() => removeRow(row.id)}>×</button>
                </div>
              ))}
            </div>
          </div>
        ) : requestTab === "body" ? (
          <div className="api-tab-content">
            <div className="bodymode" aria-label="Body type">
              <button type="button" className={bodyMode === "raw" ? "bodymode-selected" : ""} onClick={() => changeBodyMode("raw")}>raw</button>
              <button type="button" className={bodyMode === "json" ? "bodymode-selected" : ""} onClick={() => changeBodyMode("json")}>JSON</button>
            </div>
            {bodyMode === "json" ? (
              <JsonOutput label="Request body" text={body} onChange={setBody} />
            ) : (
              <textarea className="bodybox" placeholder='Request body — e.g. { "name": "Sam" }' value={body} onChange={(event) => setBody(event.target.value)} />
            )}
          </div>
        ) : (
          <div className="api-tab-content">
            <div className="bodymode" aria-label="Body type"><span className="bodymode-selected">raw</span><span>JSON</span></div>
            <textarea className="bodybox" placeholder='Request body — e.g. { "name": "Sam" }' value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
        )}
      </section>
      <section className="panel response">
        <div className="responsebar">
          <div className="api-tabs response-tabs" role="tablist" aria-label="Response options">
            {(["body", "headers"] as const).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={responseTab === tab} className={responseTab === tab ? "api-tab active" : "api-tab"} onClick={() => setResponseTab(tab)}>
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          {status ? <span className={metaClass}>{status}</span> : null}
          <button className="secondary" title="Copy response" onClick={() => void copyResponse()}>Copy</button>
        </div>
        {responseTab === "body" ? <div className="response-body"><JsonOutput label="Body" text={response} /></div> : <div className="response-headers"><Field label="Response headers"><textarea placeholder="Response headers" value={responseHeaders} readOnly /></Field></div>}
      </section>
    </div>
  );
}
function RequestAnalyzer({ notify }: { notify: (message: string) => void }) {
  const [input, setInput] = usePersistentState("request-analyzer:input", "");
  const [output, setOutput] = usePersistentState("request-analyzer:output", "");
  const analyze = () => {
    try {
      const data = analyzeHttp(input);
      const lines = [
        `Method: ${data.method}`,
        `URL: ${data.url}`,
        `Status: ${data.status}`,
        `Authorization: ${data.headers.some(([k]) => k.toLowerCase() === "authorization") ? "Present" : "Not present"}`,
        `Content-Type: ${data.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "Not specified"}`,
        `Response/body size: ${data.body.length} bytes`,
        `Body: ${data.json !== null ? "JSON" : "Text/none"}`,
      ];
      if (data.json !== null) {
        const stats = jsonStatistics(data.json);
        lines.push(
          `Objects: ${stats.objects}`,
          `Arrays: ${stats.arrays}`,
          `Keys: ${stats.keys}`,
          `Max depth: ${stats.depth}`,
        );
      }
      setOutput(lines.join("\n"));
      notify("HTTP content analyzed");
    } catch (error) {
      setOutput(`Error: ${(error as Error).message}`);
      notify("Analysis failed");
    }
  };
  const copy = async () => {
    const ok = await window.developerUtility.clipboard.copy(output);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>HTTP request, response, or log</span>
        <span className="spacer" />
        <button className="primary" onClick={() => analyze()}>
          Analyze
        </button>
        <button className="secondary" onClick={() => void copy()}>
          Copy
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInput("");
            setOutput("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="editorgrid">
        <Field label="HTTP request, response, or log">
          <textarea
            placeholder="HTTP request, response, or log"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </Field>
        <Field label="Analysis">
          <textarea placeholder="Analysis" value={output} readOnly />
        </Field>
      </div>
    </div>
  );
}
function MobileHelper({
  id,
  platform,
  notify,
}: {
  id: string;
  platform: string;
  notify: (message: string) => void;
}) {
  const [input, setInput] = usePersistentState(`${id}:input`, "");
  const [output, setOutput] = usePersistentState(`${id}:output`, "");
  const generate = () => {
    const value = input.trim();
    const result = `Package / Bundle ID: ${value}\nVersion code/build: 1\nVersion name: 1.0.0\n${platform === "Android" ? `Intent URI: intent://${value}#Intent;scheme=https;end` : `URL scheme: ${value}\nUniversal link: https://example.com/${value}`}`;
    setOutput(result);
    notify(`${platform} helper generated`);
  };
  const copy = async () => {
    const ok = await window.developerUtility.clipboard.copy(output);
    notify(ok ? "Copied to clipboard ✓" : "Clipboard unavailable");
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>{platform} identifier → deep link details</span>
        <span className="spacer" />
        <button className="primary" onClick={() => generate()}>
          Generate
        </button>
        <button className="secondary" onClick={() => void copy()}>
          Copy
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInput("");
            setOutput("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="editorgrid">
        <Field label={`${platform} identifier`}>
          <textarea
            placeholder={`${platform} identifier / version / URL scheme input`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </Field>
        <Field label="Output">
          <textarea placeholder="Output" value={output} readOnly />
        </Field>
      </div>
    </div>
  );
}
function UnitsConverter({ notify }: { notify: (message: string) => void }) {
  const [value, setValue] = usePersistentState("units:value", "1");
  const [source, setSource] = usePersistentState("units:source", "DP");
  const [target, setTarget] = usePersistentState("units:target", "PX");
  const [density, setDensity] = usePersistentState("units:density", "1");
  const [scale, setScale] = usePersistentState("units:scale", "1");
  const [result, setResult] = usePersistentState("units:result", "");
  const convert = () => {
    try {
      const converted = convertUnit(
        parseFloat(value) || 0,
        source,
        target,
        parseFloat(density) || 1,
        parseFloat(scale) || 1,
      );
      setResult(`${converted.toFixed(2)} ${target}`);
      notify("Conversion is density/scale dependent");
    } catch {
      notify("Enter valid numeric values");
    }
  };
  return (
    <div className="tool">
      <div className="toolhead">
        <span>Convert between PX, DP, SP, and PT</span>
      </div>
      <div className="units-form">
        <label>
          Value
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <label>
          Source
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            {["PX", "DP", "SP", "PT"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Target
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            {["PX", "DP", "SP", "PT"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Android density
          <input
            value={density}
            onChange={(event) => setDensity(event.target.value)}
          />
        </label>
        <label>
          iOS scale
          <input
            value={scale}
            onChange={(event) => setScale(event.target.value)}
          />
        </label>
        <button className="primary" onClick={() => convert()}>
          Convert
        </button>
        <button
          className="secondary"
          onClick={() => {
            setValue("1");
            setSource("DP");
            setTarget("PX");
            setDensity("1");
            setScale("1");
            setResult("");
            notify("Cleared");
          }}
        >
          Clear
        </button>
      </div>
      <div className="units-result">{result && <strong>{result}</strong>}</div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
