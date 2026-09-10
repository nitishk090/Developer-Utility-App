export type Header = [string, string];
export interface ParsedRequest {
  method: string;
  url: string;
  headers: Header[];
  body: string;
  protocol?: string;
}
const methods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
const ignored = new Set([
  "host",
  "content-length",
  "connection",
  "proxy-connection",
  "transfer-encoding",
]);
export const quote = (value: string): string =>
  `'${value.replaceAll("'", "'\"'\"'")}'`;
export function generateCurl(request: ParsedRequest, multiline = true): string {
  if (!request.url) throw new Error("A URL is required");
  const parts = [`curl ${quote(request.url)}`];
  if (request.method !== "GET") parts.push(`-X ${request.method}`);
  request.headers
    .filter(([key]) => !ignored.has(key.toLowerCase()))
    .forEach(([key, value]) =>
      parts.push(`--header ${quote(`${key}: ${value}`)}`),
    );
  if (
    request.body &&
    ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(request.method)
  )
    parts.push(`--data-raw ${quote(request.body)}`);
  return parts.join(multiline ? " \\\n  " : " ");
}
/**
 * Flags that always consume the following token even when we do not map it to
 * the request (e.g. "-o page.json"), so their values are never mistaken for
 * the positional URL.
 */
const valueFlags = new Set([
  "-o",
  "--output",
  "-x",
  "--proxy",
  "-m",
  "--max-time",
  "--connect-timeout",
  "--retry",
  "-c",
  "--cookie-jar",
  "-D",
  "--dump-header",
  "-F",
  "--form",
  "--form-string",
  "-T",
  "--upload-file",
  "-K",
  "--config",
  "--resolve",
  "--cert",
  "--key",
  "--cacert",
  "--capath",
  "-P",
  "--ftp-port",
  "-Q",
  "--quote",
]);
export function parseCurl(text: string): ParsedRequest {
  const tokens = tokenize(normalizeShellInput(text));
  const request: ParsedRequest = {
    method: "GET",
    url: "",
    headers: [],
    body: "",
  };
  for (
    let i = tokens[0]?.match(/^curl(?:\.exe)?$/i) ? 1 : 0;
    i < tokens.length;
    i++
  ) {
    const item = tokens[i];
    const next = () => tokens[++i] ?? "";
    const flagValue = () =>
      item.includes("=") ? item.split("=", 2)[1] : next();
    if (["-X", "--request"].includes(item))
      request.method = next().toUpperCase();
    else if (item.startsWith("-X") && item.length > 2)
      request.method = item.slice(2).toUpperCase();
    else if (item.startsWith("--request="))
      request.method = item.split("=", 2)[1].toUpperCase();
    else if (
      ["-H", "--header"].includes(item) ||
      item.startsWith("--header=")
    ) {
      const header = flagValue();
      const [key, ...rest] = header.split(":");
      if (key.trim())
        request.headers.push([key.trim(), rest.join(":").trim()]);
    } else if (
      ["-b", "--cookie"].includes(item) ||
      item.startsWith("--cookie=")
    ) {
      const cookie = flagValue();
      // Only treat the value as a cookie string, not a cookie-jar file name.
      if (cookie.includes("=")) request.headers.push(["Cookie", cookie]);
    } else if (
      ["-A", "--user-agent"].includes(item) ||
      item.startsWith("--user-agent=")
    )
      request.headers.push(["User-Agent", flagValue()]);
    else if (["-e", "--referer"].includes(item) || item.startsWith("--referer="))
      request.headers.push(["Referer", flagValue()]);
    else if (["-u", "--user"].includes(item) || item.startsWith("--user=")) {
      const encoded = encodeBasicAuth(flagValue());
      if (encoded) request.headers.push(["Authorization", `Basic ${encoded}`]);
    } else if (
      [
        "-d",
        "--data",
        "--data-raw",
        "--data-binary",
        "--data-ascii",
        "--data-urlencode",
      ].includes(item) ||
      item.startsWith("--data")
    ) {
      const body = flagValue();
      request.body = request.body ? `${request.body}&${body}` : body;
    } else if (item === "--url" || item.startsWith("--url="))
      request.url = unwrap(flagValue());
    else if (valueFlags.has(item)) next();
    else if (!item.startsWith("-") && !request.url && looksLikeUrl(item))
      request.url = unwrap(item);
  }
  if (!request.url) throw new Error("No URL found");
  if (request.body && request.method === "GET") request.method = "POST";
  return request;
}
function tokenize(text: string): string[] {
  const output: string[] = [];
  let item = "",
    quoteChar = "",
    escape = false;
  for (const char of text.trim()) {
    if (escape) {
      item += char;
      escape = false;
    } else if (char === "\\" && quoteChar !== "'") escape = true;
    else if (
      (char === "'" || char === '"') &&
      (!quoteChar || quoteChar === char)
    )
      quoteChar = quoteChar ? "" : char;
    else if (/\s/.test(char) && !quoteChar) {
      if (item) {
        output.push(item);
        item = "";
      }
    } else item += char;
  }
  if (quoteChar) throw new Error("Unable to parse cURL quoting");
  if (item) output.push(item);
  return output;
}
function unwrap(value: string): string {
  const match = value.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/);
  return match?.[1] ?? value;
}

/**
 * Normalizes cURL input before tokenizing: "Copy as cURL (cmd)" output from
 * Windows terminals escapes quotes and braces with carets (^) and continues
 * lines with a trailing caret, while bash output continues lines with a
 * backslash. Both are decoded into a single logical command here.
 */
function normalizeShellInput(text: string): string {
  const unescaped = usesCmdEscapes(text) ? unescapeCmdCarets(text) : text;
  return unescaped.replace(/\\\r?\n/g, " ");
}

function usesCmdEscapes(text: string): boolean {
  return /\^["\\{}]/.test(text) || /\^[ \t]*$/m.test(text);
}

/**
 * Decodes cmd.exe caret escaping: "^X" becomes the literal character X,
 * "^^" becomes a literal caret, and a caret at the end of a line is a line
 * continuation, so it is dropped together with the following newline.
 */
function unescapeCmdCarets(text: string): string {
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== "^") {
      output += char;
      continue;
    }
    const nextChar = text[index + 1];
    if (nextChar === undefined) break;
    if (nextChar === "\r" || nextChar === "\n") {
      index += nextChar === "\r" && text[index + 2] === "\n" ? 2 : 1;
      continue;
    }
    output += nextChar;
    index += 1;
  }
  return output;
}

/** Guards the positional URL so stray flag values are never taken as one. */
function looksLikeUrl(value: string): boolean {
  return /:\/\//.test(value) || /^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(value);
}

function encodeBasicAuth(value: string): string {
  try {
    return btoa(value);
  } catch {
    return "";
  }
}
function skipWhitespace(text: string, index: number): number {
  while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
  return index;
}
function pythonEscape(character: string): string {
  switch (character) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    case "b":
      return "\b";
    case "f":
      return "\f";
    case "v":
      return "\v";
    case "0":
      return "\0";
    case "\\":
      return "\\";
    case "'":
      return "'";
    case '"':
      return '"';
    default:
      return character;
  }
}
function parsePythonString(
  text: string,
  index: number,
  quote: string,
): [string, number] {
  let value = "";
  let i = index + 1;
  while (i < text.length) {
    const char = text[i] ?? "";
    if (char === "\\") {
      const next = text[i + 1];
      if (next === "u") {
        const hex = text.slice(i + 2, i + 6);
        if (hex.length === 4) {
          value += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          value += "u";
          i += 2;
        }
      } else if (next === "x") {
        const hex = text.slice(i + 2, i + 4);
        if (hex.length === 2) {
          value += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          value += "x";
          i += 2;
        }
      } else if (next !== undefined) {
        value += pythonEscape(next);
        i += 2;
      } else {
        value += "\\";
        i += 1;
      }
    } else if (char === quote) {
      return [value, i + 1];
    } else {
      value += char;
      i += 1;
    }
  }
  throw new Error("Unable to parse Python string");
}
function parsePythonValue(
  text: string,
  index: number,
): [unknown, number] {
  const i = skipWhitespace(text, index);
  const char = text[i] ?? "";
  if (char === "{") return parsePythonDict(text, i);
  if (char === "[") return parsePythonSequence(text, i, "]");
  if (char === "(") return parsePythonSequence(text, i, ")");
  if (char === "'" || char === '"') return parsePythonString(text, i, char);
  let end = i;
  while (end < text.length && !/[\s,}\])]/.test(text[end] ?? "")) end += 1;
  const token = text.slice(i, end).toLowerCase();
  if (token === "true") return [true, end];
  if (token === "false") return [false, end];
  if (token === "null" || token === "none") return [null, end];
  const number = Number(token);
  if (token && !Number.isNaN(number)) return [number, end];
  return [token.toLowerCase(), end];
}
function parsePythonSequence(
  text: string,
  index: number,
  close: string,
): [unknown[], number] {
  const output: unknown[] = [];
  let i = skipWhitespace(text, index + 1);
  if (text[i] === close) return [output, i + 1];
  while (i < text.length) {
    const value = parsePythonValue(text, i);
    output.push(value[0]);
    i = skipWhitespace(text, value[1]);
    if (text[i] === ",") i = skipWhitespace(text, i + 1);
    else if (text[i] === close) return [output, i + 1];
    else throw new Error("Unable to parse Python sequence");
  }
  throw new Error("Unable to parse Python sequence");
}
function parsePythonDict(
  text: string,
  index: number,
): [Record<string, unknown>, number] {
  const result: Record<string, unknown> = {};
  let i = skipWhitespace(text, index + 1);
  if (text[i] === "}") return [result, i + 1];
  while (i < text.length) {
    let key: string;
    if (text[i] === "'" || text[i] === '"') {
      const parsed = parsePythonString(text, i, text[i]);
      key = parsed[0];
      i = skipWhitespace(text, parsed[1]);
    } else {
      let end = i;
      while (end < text.length && !/[\s,:]/.test(text[end] ?? "")) end += 1;
      key = text.slice(i, end).trim();
      i = skipWhitespace(text, end);
    }
    if (text[i] !== ":") throw new Error("Unable to parse Python dict key");
    const value = parsePythonValue(text, i + 1);
    result[key] = value[0];
    i = skipWhitespace(text, value[1]);
    if (text[i] === ",") i = skipWhitespace(text, i + 1);
    else if (text[i] === "}") return [result, i + 1];
    else throw new Error("Unable to parse Python dict");
  }
  throw new Error("Unable to parse Python dict");
}
function requestFromArgs(
  args: Record<string, unknown>,
  headers: Record<string, unknown>,
): ParsedRequest | null {
  if (typeof args.url !== "string" || !args.url) return null;
  if (
    args.method !== undefined &&
    !methods.has(String(args.method).toUpperCase())
  )
    return null;
  let url = args.url;
  if (
    args.params &&
    typeof args.params === "object" &&
    !Array.isArray(args.params)
  ) {
    const search = new URLSearchParams();
    Object.entries(args.params as Record<string, unknown>).forEach(
      ([key, value]) => search.append(key, String(value)),
    );
    const query = search.toString();
    if (query) url += `${url.includes("?") ? "&" : "?"}${query}`;
  }
  let body = "";
  if (typeof args.data === "string") body = args.data;
  else if (typeof args.data === "object" && args.data !== null)
    body = JSON.stringify(args.data);
  else if (typeof args.json === "string") body = args.json;
  else if (typeof args.json === "object" && args.json !== null)
    body = JSON.stringify(args.json);
  else if (typeof args.body === "string") body = args.body;
  else if (typeof args.body === "object" && args.body !== null)
    body = JSON.stringify(args.body);
  let method =
    typeof args.method === "string" && args.method
      ? String(args.method).toUpperCase()
      : "GET";
  if (body && method === "GET") method = "POST";
  return {
    method,
    url,
    headers: Object.entries(headers).map(
      ([key, value]) => [key, String(value)] as Header,
    ),
    body,
  };
}
function tryParsePythonLog(text: string): ParsedRequest | null {
  const marker = text.toLowerCase().indexOf("request args");
  if (marker < 0) return null;
  const open = text.indexOf("{", marker);
  if (open < 0) return null;
  let args: Record<string, unknown>;
  let end: number;
  try {
    const parsed = parsePythonDict(text, open);
    args = parsed[0];
    end = parsed[1];
  } catch {
    return null;
  }
  let headers: Record<string, unknown> = {};
  const headerMarker = text.toLowerCase().indexOf("headers", end);
  if (headerMarker >= 0) {
    const headerOpen = text.indexOf("{", headerMarker);
    if (headerOpen >= 0) {
      try {
        headers = parsePythonDict(text, headerOpen)[0];
      } catch {
        headers = {};
      }
    }
  }
  return requestFromArgs(args, headers);
}
function tryParseAnyDict(text: string): ParsedRequest | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = parsePythonDict(trimmed, 0);
    if (typeof parsed[0].url !== "string" || !parsed[0].url) return null;
    let headers: Record<string, unknown> = {};
    const rawHeaders = parsed[0].headers;
    if (
      rawHeaders &&
      typeof rawHeaders === "object" &&
      !Array.isArray(rawHeaders)
    )
      headers = rawHeaders as Record<string, unknown>;
    return requestFromArgs(parsed[0], headers);
  } catch {
    return null;
  }
}
export function parseRaw(text: string): ParsedRequest {
  if (/^\s*curl(?:\.exe)?\b/i.test(text)) return parseCurl(text);
  const pythonLog = tryParsePythonLog(text);
  if (pythonLog) return pythonLog;
  const pythonDict = tryParseAnyDict(text);
  if (pythonDict) return pythonDict;
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const first = lines.findIndex((line) => line.trim().length > 0);
  const match = lines[first]?.match(
    /^\s*([A-Za-z]+)\s+(\S+)(?:\s+(HTTP\/\d(?:\.\d)?))?\s*$/,
  );
  if (match && methods.has(match[1].toUpperCase())) {
    const split = lines.findIndex(
      (line, index) => index > first && !line.trim(),
    );
    const end = split < 0 ? lines.length : split;
    const headers = lines
      .slice(first + 1, end)
      .filter((line) => line.includes(":"))
      .map((line) => {
        const index = line.indexOf(":");
        return [
          line.slice(0, index).trim(),
          line.slice(index + 1).trim(),
        ] as Header;
      });
    const target = unwrap(match[2]);
    const host = headers.find(([key]) =>
      ["host", ":authority"].includes(key.toLowerCase()),
    )?.[1];
    return {
      method: match[1].toUpperCase(),
      url: /^https?:\/\//.test(target)
        ? target
        : host
          ? `https://${host}${target}`
          : target,
      headers,
      body: split < 0 ? "" : lines.slice(split + 1).join("\n"),
      protocol: match[3],
    };
  }
  const method = (
    text.match(/^Method\s*:\s*(\w+)/im)?.[1] ?? "GET"
  ).toUpperCase();
  if (!methods.has(method))
    throw new Error("Unable to parse request. Include an HTTP method and URL.");
  let url = "";
  let urlIndex = -1;
  for (let i = 0; i < lines.length && !url; i++) {
    const line = lines[i].trim();
    const inline = line.match(/^URL\s*:?\s*(.+)$/i);
    if (inline) {
      url = unwrap(inline[1].trim());
      urlIndex = i;
    } else if (/^URL\s*$/i.test(line)) {
      const offset = lines.slice(i + 1).findIndex((item) => item.trim());
      const nextIndex = offset >= 0 ? i + 1 + offset : -1;
      const next = nextIndex >= 0 ? lines[nextIndex].trim() : "";
      if (next && /^(https?:)?\/\//i.test(next)) {
        url = unwrap(next);
        urlIndex = nextIndex;
      }
    }
  }
  if (!url) throw new Error("Unable to parse request. Include an HTTP method and URL.");
  const isLabel = (line: string) =>
    /^(Method|URL|Headers)\s*:?\s*$/i.test(line) ||
    /^(Method|URL|Headers)\s*:/i.test(line);
  const bodyIndex = lines.findIndex((line) => /^[{[]/.test(line.trim()));
  const split = lines.findIndex(
    (line, index) => index > 0 && !line.trim(),
  );
  const headerEnd =
    bodyIndex >= 0 ? bodyIndex : split >= 0 ? split : lines.length;
  const headers: Header[] = [];
  for (let i = 0; i < headerEnd; i++) {
    const line = lines[i].trim();
    if (!line || i === urlIndex || isLabel(line)) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (!value) {
      const next = lines[i + 1]?.trim() ?? "";
      const isNextHeader =
        !/^https?:\/\//i.test(next) &&
        /^[A-Za-z][A-Za-z0-9._-]*\s*:/.test(next);
      if (next && !isLabel(next) && !/^[{[]/.test(next) && !isNextHeader) {
        value = next;
        i++;
      }
    }
    headers.push([name, value]);
  }
  return {
    method,
    url,
    headers,
    body: bodyIndex >= 0 ? lines.slice(bodyIndex).join("\n") : "",
  };
}
export const formatJson = (value: string) =>
  JSON.stringify(JSON.parse(value), null, 2);
export const minifyJson = (value: string) => JSON.stringify(JSON.parse(value));
export const validateJson = (value: string) => {
  try {
    JSON.parse(value);
    return "Valid JSON";
  } catch (error) {
    return `Invalid JSON: ${(error as Error).message}`;
  }
};
export const base64Encode = (value: string) =>
  btoa(unescape(encodeURIComponent(value)));
export const base64Decode = (value: string) =>
  decodeURIComponent(escape(atob(value)));
export const urlEncode = (value: string) => encodeURIComponent(value);
export const urlDecode = (value: string) => decodeURIComponent(value);
export function runRegex(pattern: string, value: string): string {
  try {
    const expression = new RegExp(pattern, "g");
    const matches = [...value.matchAll(expression)];
    return matches.length
      ? `MATCH\n${matches.map((match) => `${JSON.stringify(match[0])}  start: ${match.index}  end: ${(match.index ?? 0) + match[0].length}`).join("\n")}`
      : "NO MATCH";
  } catch (error) {
    return `Invalid regular expression: ${(error as Error).message}`;
  }
}
export const makeHash = async (value: string, algorithm: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        algorithm.replace("sha", "SHA-").toUpperCase(),
        new TextEncoder().encode(value),
      ),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
export function headersReport(value: string, mask: boolean): string {
  const secret = new Set([
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "proxy-authorization",
  ]);
  return value
    .split("\n")
    .filter((line) => line.includes(":"))
    .map((line) => {
      const [key, ...rest] = line.split(":");
      let result = rest.join(":").trim();
      const sensitive = secret.has(key.trim().toLowerCase());
      if (mask && sensitive)
        result =
          result.length <= 8
            ? "*".repeat(result.length)
            : `${result.slice(0, 4)}${"*".repeat(Math.max(4, result.length - 8))}${result.slice(-4)}`;
      return `${key.trim()}: ${result}${sensitive ? "  ⚠ Sensitive" : "  ✓"}`;
    })
    .join("\n");
}
export function deepLink(
  scheme: string,
  host: string,
  path: string,
  params: string,
): string {
  const query = new URLSearchParams(
    params.split("\n").flatMap((line) => {
      const index = line.indexOf("=");
      return index > 0
        ? [[line.slice(0, index).trim(), line.slice(index + 1).trim()]]
        : [];
    }),
  ).toString();
  return `${scheme}://${host}${path.trim() ? `/${path.replace(/^\/+/, "")}` : ""}${query ? `?${query}` : ""}`;
}

// JSON extensions (migrated from app/core/json_extensions.py)
export function jsonPaths(
  value: unknown,
  prefix = "",
): Array<[string, unknown]> {
  const paths: Array<[string, unknown]> = [];
  if (prefix) paths.push([prefix, value]);
  if (Array.isArray(value))
    value.forEach((child, index) => {
      paths.push(...jsonPaths(child, `${prefix}[${index}]`));
    });
  else if (value !== null && typeof value === "object")
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      paths.push(...jsonPaths(child, prefix ? `${prefix}.${key}` : key));
    });
  return paths;
}
export function jsonDiff(
  before: unknown,
  after: unknown,
  path = "$",
): Array<Record<string, unknown>> {
  const changes: Array<Record<string, unknown>> = [];
  if (
    before !== null &&
    typeof before === "object" &&
    !Array.isArray(before) &&
    after !== null &&
    typeof after === "object" &&
    !Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    for (const key of Object.keys(left))
      if (!(key in right))
        changes.push({
          kind: "removed",
          path: `${path}.${key}`,
          old: left[key],
        });
    for (const key of Object.keys(right))
      if (!(key in left))
        changes.push({
          kind: "added",
          path: `${path}.${key}`,
          new: right[key],
        });
    for (const key of Object.keys(left))
      if (key in right)
        changes.push(...jsonDiff(left[key], right[key], `${path}.${key}`));
  } else if (Array.isArray(before) && Array.isArray(after)) {
    const max = Math.max(before.length, after.length);
    for (let i = 0; i < max; i++) {
      const itemPath = `${path}[${i}]`;
      if (i >= before.length)
        changes.push({ kind: "added", path: itemPath, new: after[i] });
      else if (i >= after.length)
        changes.push({ kind: "removed", path: itemPath, old: before[i] });
      else changes.push(...jsonDiff(before[i], after[i], itemPath));
    }
  } else if (before !== after)
    changes.push({ kind: "changed", path, old: before, new: after });
  return changes;
}
export function formatDiff(changes: Array<Record<string, unknown>>): string {
  const counts = { added: 0, removed: 0, changed: 0 };
  changes.forEach((change) => {
    counts[change.kind as keyof typeof counts]++;
  });
  const lines = [
    `Added: ${counts.added}  Removed: ${counts.removed}  Changed: ${counts.changed}`,
    "",
  ];
  changes.forEach((change) => {
    lines.push(
      `${(change.kind as string).toUpperCase()}: ${change.path as string}`,
    );
    if ("old" in change) lines.push(`  old: ${JSON.stringify(change.old)}`);
    if ("new" in change) lines.push(`  new: ${JSON.stringify(change.new)}`);
  });
  return lines.join("\n");
}
export function mockJson(schema: unknown, records = 1): unknown {
  const names = ["Alex Morgan", "Jordan Patel", "Sam Taylor", "Riley Chen"];
  const words = ["developer", "mobile", "sample", "testing"];
  const make = (value: unknown, field = ""): unknown => {
    if (Array.isArray(value))
      return value.length ? [make(value[0], field)] : [];
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          make(child, key),
        ]),
      );
    if (value === null) return null;
    if (value === "number" || value === "integer")
      return Math.floor(Math.random() * 100) + 1;
    if (value === "boolean") return Math.random() > 0.5;
    if (value === "string")
      return field.toLowerCase().includes("name")
        ? names[Math.floor(Math.random() * names.length)]
        : words[Math.floor(Math.random() * words.length)];
    return value;
  };
  const data = Array.from({ length: records }, () => make(schema));
  return records === 1 ? data[0] : data;
}
export function generateTypes(
  value: unknown,
  language: string,
  rootName = "Root",
): string {
  const lang = language.toLowerCase();
  const definitions: string[] = [];
  const title = (name: string) =>
    name
      .replace(/-/g, "_")
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") || "Item";
  const infer = (item: unknown, name: string): string => {
    if (item === null)
      return (
        {
          typescript: "unknown | null",
          python: "None",
          java: "Object",
          kotlin: "Any?",
          swift: "Any?",
          "c#": "object?",
          go: "interface{}",
        }[lang] ?? "unknown"
      );
    if (typeof item === "boolean")
      return (
        {
          typescript: "boolean",
          python: "bool",
          java: "Boolean",
          kotlin: "Boolean",
          swift: "Bool",
          "c#": "bool",
          go: "bool",
        }[lang] ?? "boolean"
      );
    if (typeof item === "number")
      return Number.isInteger(item)
        ? ({
            typescript: "number",
            python: "int",
            java: "Integer",
            kotlin: "Int",
            swift: "Int",
            "c#": "int",
            go: "int",
          }[lang] ?? "number")
        : ({
            typescript: "number",
            python: "float",
            java: "Double",
            kotlin: "Double",
            swift: "Double",
            "c#": "double",
            go: "float64",
          }[lang] ?? "number");
    if (typeof item === "string")
      return (
        {
          typescript: "string",
          python: "str",
          java: "String",
          kotlin: "String",
          swift: "String",
          "c#": "string",
          go: "string",
        }[lang] ?? "string"
      );
    if (Array.isArray(item)) {
      const inner = item.length ? infer(item[0], title(name) + "Item") : "Any";
      return (
        {
          typescript: `${inner}[]`,
          python: `list[${inner}]`,
          java: `List<${inner}>`,
          kotlin: `List<${inner}>`,
          swift: `[${inner}]`,
          "c#": `List<${inner}>`,
          go: `[]${inner}`,
        }[lang] ?? `${inner}[]`
      );
    }
    if (typeof item === "object") {
      const className = title(name);
      const fields = Object.entries(item as Record<string, unknown>).map(
        ([key, child]) => [key, infer(child, title(key))] as const,
      );
      if (lang === "typescript")
        definitions.push(
          `interface ${className} {\n${fields.map(([k, t]) => `    ${k}: ${t};`).join("\n")}\n}`,
        );
      else if (lang === "python")
        definitions.push(
          `@dataclass\nclass ${className}:\n${fields.map(([k, t]) => `    ${k}: ${t}`).join("\n")}`,
        );
      else if (lang === "kotlin")
        definitions.push(
          `data class ${className}(\n${fields.map(([k, t]) => `    val ${k}: ${t}`).join(",\n")}\n)`,
        );
      else if (lang === "java")
        definitions.push(
          `public class ${className} {\n${fields.map(([k, t]) => `    public ${t} ${k};`).join("\n")}\n}`,
        );
      else if (lang === "swift")
        definitions.push(
          `struct ${className}: Codable {\n${fields.map(([k, t]) => `    let ${k}: ${t}`).join("\n")}\n}`,
        );
      else if (lang === "c#")
        definitions.push(
          `public class ${className} {\n${fields.map(([k, t]) => `    public ${t} ${title(k)} { get; set; }`).join("\n")}\n}`,
        );
      else
        definitions.push(
          `type ${className} struct {\n${fields.map(([k, t]) => `    ${title(k)} ${t} \`json:"${k}"\``).join("\n")}\n}`,
        );
      return className;
    }
    return "Any";
  };
  infer(value, rootName);
  return [...definitions].reverse().join("\n\n");
}

// Request analysis (migrated from app/core/request_tools.py)
export function analyzeHttp(text: string): {
  method: string;
  url: string;
  status: string;
  headers: Header[];
  body: string;
  json: unknown;
} {
  const result: {
    method: string;
    url: string;
    status: string;
    headers: Header[];
    body: string;
    json: unknown;
  } = { method: "", url: "", status: "", headers: [], body: "", json: null };
  try {
    const request = parseRaw(text);
    result.method = request.method;
    result.url = request.url;
    result.headers = request.headers;
    result.body = request.body;
  } catch {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const first = lines[0] ?? "";
    if (first.startsWith("HTTP/")) {
      const match = first.match(/^HTTP\/\S+\s+(.+)$/);
      result.status = match?.[1] ?? "";
      const split = lines.findIndex((line) => !line.trim());
      const end = split < 0 ? lines.length : split;
      result.headers = lines
        .slice(1, end)
        .filter((line) => line.includes(":"))
        .map((line) => {
          const index = line.indexOf(":");
          return [
            line.slice(0, index).trim(),
            line.slice(index + 1).trim(),
          ] as Header;
        });
      result.body = lines.slice(end + 1).join("\n");
    } else throw new Error("Unable to identify an HTTP request or response");
  }
  try {
    result.json = JSON.parse(result.body);
  } catch {
    /* body is not JSON */
  }
  return result;
}
export function jsonStatistics(value: unknown): {
  objects: number;
  arrays: number;
  keys: number;
  nulls: number;
  depth: number;
} {
  const stats = { objects: 0, arrays: 0, keys: 0, nulls: 0, depth: 0 };
  const visit = (item: unknown, depth: number): void => {
    stats.depth = Math.max(stats.depth, depth);
    if (item === null) stats.nulls++;
    else if (Array.isArray(item)) {
      stats.arrays++;
      item.forEach((child) => visit(child, depth + 1));
    } else if (typeof item === "object") {
      stats.objects++;
      stats.keys += Object.keys(item as Record<string, unknown>).length;
      Object.values(item as Record<string, unknown>).forEach((child) =>
        visit(child, depth + 1),
      );
    }
  };
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    stats.keys += Object.keys(value as Record<string, unknown>).length;
    Object.values(value as Record<string, unknown>).forEach((child) =>
      visit(child, 1),
    );
  } else if (Array.isArray(value)) {
    stats.arrays++;
    value.forEach((child) => visit(child, 1));
  } else visit(value, 1);
  return stats;
}
export function curlToCode(request: ParsedRequest, language: string): string {
  const headers = Object.fromEntries(request.headers);
  const body = request.body.trim();
  const lang = language.toLowerCase();
  if (lang === "python requests")
    return `import requests\n\nresponse = requests.request(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)}, headers=${JSON.stringify(headers)}, data=${JSON.stringify(body)})\nprint(response.text)`;
  if (lang === "javascript fetch")
    return `fetch(${JSON.stringify(request.url)}, { method: ${JSON.stringify(request.method)}, headers: ${JSON.stringify(headers)}, body: ${JSON.stringify(body)} })\n  .then(response => response.text()).then(console.log);`;
  if (lang === "axios")
    return `axios({ method: ${JSON.stringify(request.method)}, url: ${JSON.stringify(request.url)}, headers: ${JSON.stringify(headers)}, data: ${JSON.stringify(body)} });`;
  if (lang === "kotlin okhttp")
    return `val request = Request.Builder().url(${JSON.stringify(request.url)}).method(${JSON.stringify(request.method)}, null).build()\nclient.newCall(request).execute()`;
  return `var request = URLRequest(url: URL(string: ${JSON.stringify(request.url)})!)\nrequest.httpMethod = ${JSON.stringify(request.method)}\nURLSession.shared.dataTask(with: request).resume()`;
}

// PostgreSQL placeholder replacement (migrated from app/core/postgres_tools.py)
export function replacePlaceholders(
  sql: string,
  mappings: Record<string, string>,
): string {
  let result = sql;
  for (const [value, name] of Object.entries(mappings)) {
    if (value) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(
        new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, "g"),
        () => `$$${name}$$`,
      );
    }
  }
  return result;
}

// SQL formatting (migrated from app/core/sql_tools.py)
export function formatSql(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(
      /\b(select|from|where|join|left join|right join|order by|group by|insert into|update|delete|values|set|and|or|on|as|in|between|like|limit|offset|having|union|create table|alter table|drop table)\b/gi,
      (match) => `\n${match.toUpperCase()}`,
    )
    .trim();
}

// HTTP status codes (migrated from app/core/http_status.py)
export const STATUS_CODES: Array<[number, string, string]> = [
  [100, "Continue", "Client should continue with the request"],
  [101, "Switching Protocols", "Server is switching protocols per the Upgrade header"],
  [102, "Processing", "Request accepted, processing in progress (WebDAV)"],
  [103, "Early Hints", "Server returns some response headers before the final response"],
  [200, "OK", "Request succeeded"],
  [201, "Created", "A new resource was created"],
  [202, "Accepted", "Request accepted for processing, but processing is incomplete"],
  [203, "Non-Authoritative Information", "Returned meta-information is no longer authoritative"],
  [204, "No Content", "Request succeeded with no response body"],
  [205, "Reset Content", "Client should reset the document view"],
  [206, "Partial Content", "Server delivers only part of the resource (Range request)"],
  [207, "Multi-Status", "Multiple status codes: used by WebDAV"],
  [208, "Already Reported", "Members of a DAV binding were already enumerated ((WebDAV))"],
  [226, "IM Used", "Server fulfilled a GET for an instance manifest"],
  [300, "Multiple Choices", "Resource has multiple representations"],
  [301, "Moved Permanently", "Resource has a permanent new location"],
  [302, "Found", "Temporary redirect"],
  [303, "See Other", "Redirect to another URI using GET"],
  [304, "Not Modified", "Cached response remains valid"],
  [305, "Use Proxy", "Resource must be accessed through a proxy (deprecated)"],
  [307, "Temporary Redirect", "Temporary redirect keeping method and body"],
  [308, "Permanent Redirect", "Permanent redirect keeping method and body"],
  [400, "Bad Request", "Malformed request"],
  [401, "Unauthorized", "Authentication is required or invalid"],
  [402, "Payment Required", "Reserved for future payment requirements"],
  [403, "Forbidden", "Server refuses authorization"],
  [404, "Not Found", "Resource does not exist"],
  [405, "Method Not Allowed", "HTTP method is unsupported for this resource"],
  [406, "Not Acceptable", "No representation matches the acceptable content"],
  [407, "Proxy Authentication Required", "Authentication is required via a proxy"],
  [408, "Request Timeout", "Server timed out waiting for the request"],
  [409, "Conflict", "Request conflicts with current state"],
  [410, "Gone", "Resource is no longer available"],
  [411, "Length Required", "Content-Length header is required"],
  [412, "Precondition Failed", "A precondition in the request failed"],
  [413, "Content Too Large", "Request body is too large"],
  [414, "URI Too Long", "Request URI is longer than the server can process"],
  [415, "Unsupported Media Type", "Media type is not supported"],
  [416, "Range Not Satisfiable", "Requested range cannot be satisfied"],
  [417, "Expectation Failed", "Expectation stated in the request failed"],
  [418, "I'm a Teapot", "Server refuses to brew coffee (hypertext coffee pot"],
  [421, "Misdirected Request", "Request was sent to a server unable to respond"],
  [422, "Unprocessable Content", "Request well-formed but semantic validation failed"],
  [423, "Locked", "Resource is locked ((WebDAV))"],
  [424, "Failed Dependency", "Request failed due to a previous failure (WebDAV"],
  [425, "Too Early", "Server is unwilling to process an early request"],
  [426, "Upgrade Required", "Client should switch to a different protocol"],
  [428, "Precondition Required", "Server requires conditional request headers"],
  [429, "Too Many Requests", "Rate limit exceeded"],
  [431, "Request Header Fields Too Large", "Request headers are too large"],
  [451, "Unavailable For Legal Reasons", "Resource is unavailable for legal reasons"],
  [500, "Internal Server Error", "Unexpected server error"],
  [501, "Not Implemented", "Server does not support the request method"],
  [502, "Bad Gateway", "Upstream service failed"],
  [503, "Service Unavailable", "Service is unavailable or overloaded"],
  [504, "Gateway Timeout", "Upstream service timed out"],
  [505, "HTTP Version Not Supported", "HTTP version used is not supported"],
  [506, "Variant Also Negotiates", "Server has an internal configuration error in content negotiation"],
  [507, "Insufficient Storage", "Server cannot store the representation (WebDAV"],
  [508, "Loop Detected", "Server detected an infinite loop ((WebDAV))"],
  [510, "Not Extended", "Server requires further extensions to fulfill the request"],
  [511, "Network Authentication Required", "Network access authentication is required"],
];

export function findStatus(query: string): Array<[number, string, string]> {
  const q = query.toLowerCase().trim();
  return STATUS_CODES.filter(
    ([code, name, meaning]) =>
      !q ||
      String(code).includes(q) ||
      name.toLowerCase().includes(q) ||
      meaning.toLowerCase().includes(q),
  );
}

// Mobile unit conversion (migrated from app/core/mobile_tools.py)
export function convertUnit(
  value: number,
  source: string,
  target: string,
  density = 1,
  iosScale = 1,
): number {
  const toPx: Record<string, number> = {
    PX: 1,
    DP: density,
    SP: density,
    PT: 1.333333 * iosScale,
  };
  return (value * (toPx[source] ?? 1)) / (toPx[target] ?? 1);
}
