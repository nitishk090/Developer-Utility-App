import {
  generateCurl,
  parseCurl,
  parseRaw,
  type Header,
  type ParsedRequest,
  type RequestBodyType,
} from "./developerTools";

export type InputFormat = "curl" | "json" | "har" | "fetch" | "axios" | "raw-http" | "unknown";

const supportedMethods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

export function detectInputFormat(input: string): InputFormat {
  const text = input.trim();
  if (!text) return "unknown";
  if (/^curl(?:\.exe)?\b/i.test(text)) return "curl";
  if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+HTTP\/\d/i.test(text)) return "raw-http";
  if (/\bfetch\s*\(/i.test(text)) return "fetch";
  if (/\b(?:axios|axios\.(?:get|post|put|patch|delete|request))\s*\(/i.test(text)) return "axios";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (Array.isArray((parsed as { log?: { entries?: unknown[] } }).log?.entries)) return "har";
    return "json";
  } catch {
    return "unknown";
  }
}

export function parseAnyRequest(input: string): { format: InputFormat; request: ParsedRequest } {
  const format = detectInputFormat(input);
  if (format === "curl") return { format, request: parseCurl(input) };
  if (format === "raw-http") return { format, request: parseRaw(input) };
  if (format === "json") return { format, request: parseJsonRequest(JSON.parse(input) as Record<string, unknown>) };
  if (format === "har") return { format, request: parseHar(JSON.parse(input) as Record<string, unknown>) };
  if (format === "fetch") return { format, request: parseFetch(input) };
  if (format === "axios") return { format, request: parseAxios(input) };
  throw new Error("Unable to detect a supported request format. Paste cURL, JSON, HAR, Fetch, Axios, or a raw HTTP request.");
}

export function validateRequest(request: ParsedRequest): string[] {
  const errors: string[] = [];
  if (!request.url) errors.push("A request URL is required.");
  else {
    try {
      const url = new URL(request.url);
      if (!/^https?:$/.test(url.protocol)) errors.push("The URL must use http or https.");
    } catch {
      errors.push("The request URL is invalid.");
    }
  }
  if (!supportedMethods.has(request.method.toUpperCase())) errors.push(`Unsupported HTTP method: ${request.method}`);
  request.headers.forEach(([key, value]) => {
    if (!key.trim()) errors.push("Header names cannot be empty.");
    if (/\r|\n/.test(key) || /\r|\n/.test(value)) errors.push(`Invalid header: ${key}`);
  });
  if (request.bodyType === "json" && request.body) {
    try {
      JSON.parse(request.body);
    } catch {
      errors.push("The JSON request body is malformed.");
    }
  }
  return errors;
}

export function requestToCurl(request: ParsedRequest): string {
  const errors = validateRequest(request);
  if (errors.length) throw new Error(errors.join(" "));
  return generateCurl(request);
}

function parseJsonRequest(value: Record<string, unknown>): ParsedRequest {
  if (value.request && typeof value.request === "object") return parseJsonRequest(value.request as Record<string, unknown>);
  const method = String(value.method ?? "GET").toUpperCase();
  const url = typeof value.url === "string"
    ? value.url
    : isRecord(value.url) && typeof value.url.raw === "string"
      ? value.url.raw
      : "";
  const headers = parseHeaders(value.headers ?? value.header);
  const query = parsePairs(value.query ?? value.params);
  const bodyValue = value.body ?? value.data ?? value.json;
  const body = typeof bodyValue === "string" ? bodyValue : bodyValue == null ? "" : JSON.stringify(bodyValue);
  const bodyType = inferBodyType(body, headers, value.bodyType);
  const request: ParsedRequest = {
    method,
    url: appendQuery(url, query),
    headers,
    body,
    query,
    cookies: parsePairs(value.cookies),
    bodyType,
    formData: parsePairs(value.formData ?? value.formdata),
    options: [],
  };
  const auth = value.auth;
  if (isRecord(auth)) {
    const type = String(auth.type ?? "").toLowerCase();
    const authValue = String(auth.value ?? auth.token ?? auth.username ?? "");
    if (type === "basic") request.auth = { type: "basic", value: authValue };
    else if (type === "bearer") request.auth = { type: "bearer", value: authValue };
  }
  return request;
}

function parseHar(value: Record<string, unknown>): ParsedRequest {
  const entry = isRecord(value.log) && Array.isArray(value.log.entries) ? value.log.entries[0] : undefined;
  if (!isRecord(entry) || !isRecord(entry.request)) throw new Error("HAR does not contain a request entry.");
  const raw = entry.request;
  const query = parsePairs(raw.queryString);
  const headers = parseHeaders(raw.headers);
  const postData = isRecord(raw.postData) ? raw.postData : {};
  const params = parsePairs(postData.params);
  const body = typeof postData.text === "string" ? postData.text : params.map(([key, item]) => `${key}=${item}`).join("&");
  return {
    method: String(raw.method ?? "GET").toUpperCase(),
    url: appendQuery(String(raw.url ?? ""), query),
    headers,
    body,
    query,
    bodyType: params.length ? "form" : inferBodyType(body, headers),
    formData: params,
    cookies: parsePairs(raw.cookies),
    options: [],
  };
}

function parseFetch(input: string): ParsedRequest {
  const url = extractString(input, /fetch\s*\(\s*(["'`])([\s\S]*?)\1/i);
  const options = extractObject(input, /fetch\s*\([\s\S]*?,\s*\{/i);
  const method = (extractString(options, /method\s*:\s*(["'`])([\s\S]*?)\1/i) || "GET").toUpperCase();
  const headers = parseJsObject(extractObject(options, /headers\s*:\s*\{/i));
  const body = extractString(options, /body\s*:\s*(["'`])([\s\S]*?)\1/i);
  return { method, url, headers, body, bodyType: inferBodyType(body, headers), query: [], cookies: [], options: [] };
}

function parseAxios(input: string): ParsedRequest {
  const methodMatch = input.match(/method\s*:\s*["'`]([^"'`]+)["'`]/i);
  const url = extractString(input, /(?:url|axios\.(?:get|post|put|patch|delete))\s*[:(]\s*(["'`])([\s\S]*?)\1/i);
  const options = extractObject(input, /axios\s*\(\s*\{/i);
  const method = (methodMatch?.[1] ?? input.match(/axios\.(get|post|put|patch|delete)/i)?.[1] ?? "GET").toUpperCase();
  const headers = parseJsObject(extractObject(input, /headers\s*:\s*\{/i));
  const dataText = extractString(options, /(?:data|body)\s*:\s*(["'`])([\s\S]*?)\1/i);
  return { method, url, headers, body: dataText, bodyType: inferBodyType(dataText, headers), query: [], cookies: [], options: [] };
}

function parseHeaders(value: unknown): Header[] {
  if (Array.isArray(value)) return value.flatMap((item) => isRecord(item) && typeof item.name === "string" ? [[item.name, String(item.value ?? "")]] : Array.isArray(item) ? [[String(item[0]), String(item[1] ?? "")]] : []);
  if (isRecord(value)) return Object.entries(value).map(([key, item]) => [key, String(item)]);
  return [];
}

function parsePairs(value: unknown): Header[] {
  if (!value) return [];
  if (typeof value === "string") return value.split("&").filter(Boolean).map((item) => { const separator = item.indexOf("="); return [decodeURIComponent(separator < 0 ? item : item.slice(0, separator)), decodeURIComponent(separator < 0 ? "" : item.slice(separator + 1))]; });
  return parseHeaders(value);
}

function parseJsObject(value: string): Header[] {
  return Array.from(value.matchAll(/(?:(["'`])([^"'`]+)\1|([A-Za-z_$][\w$-]*))\s*:\s*(["'`])([\s\S]*?)\4/g), (match) => [match[2] ?? match[3], match[5]]);
}

function extractString(input: string, pattern: RegExp): string {
  return input.match(pattern)?.[2] ?? "";
}

function extractObject(input: string, start: RegExp): string {
  const match = input.match(start);
  if (!match || match.index === undefined) return "";
  const open = input.indexOf("{", match.index);
  let depth = 0;
  for (let index = open; index < input.length; index += 1) {
    if (input[index] === "{") depth += 1;
    if (input[index] === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(open + 1, index);
    }
  }
  return "";
}

function inferBodyType(body: string, headers: Header[], explicit?: unknown): RequestBodyType {
  if (explicit === "json" || explicit === "form" || explicit === "multipart" || explicit === "raw") return explicit;
  if (!body) return "none";
  const contentType = headers.find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  if (contentType.includes("json")) return "json";
  return "raw";
}

function appendQuery(url: string, query: Header[]): string {
  if (!query.length) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams(query).toString()}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
