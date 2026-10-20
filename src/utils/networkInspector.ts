import type { NetworkCaptureEntry } from "../../electron/types";

export interface NetworkRequestFilters {
  hostname: string;
  url: string;
  method: string;
  status: string;
  contentType: string;
  failedOnly: boolean;
  timeRange: "all" | "5m" | "1h" | "24h";
}

const SENSITIVE_KEY =
  /authorization|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password/i;

export function filterNetworkRequests(
  requests: NetworkCaptureEntry[],
  filters: NetworkRequestFilters,
  now = Date.now(),
): NetworkCaptureEntry[] {
  const hostname = filters.hostname.trim().toLowerCase();
  const url = filters.url.trim().toLowerCase();
  const status = filters.status.trim();
  const contentType = filters.contentType.trim().toLowerCase();
  const ageByRange = { all: 0, "5m": 5 * 60_000, "1h": 60 * 60_000, "24h": 24 * 60 * 60_000 };
  const maxAge = ageByRange[filters.timeRange];

  return requests.filter((request) => {
    const time = Date.parse(request.timestamp);
    return (
      (!hostname || request.hostname.toLowerCase().includes(hostname)) &&
      (!url || request.url.toLowerCase().includes(url)) &&
      (!filters.method || request.method === filters.method) &&
      (!status ||
        (status === "failed"
          ? Boolean(request.error) || (request.responseStatus ?? 0) >= 400
          : String(request.responseStatus ?? "").startsWith(status))) &&
      (!contentType ||
        (request.contentType ?? "").toLowerCase().includes(contentType)) &&
      (!filters.failedOnly ||
        Boolean(request.error) ||
        (request.responseStatus ?? 0) >= 400) &&
      (!maxAge || (Number.isFinite(time) && now - time <= maxAge))
    );
  });
}

function redactBody(body: string): string {
  if (!body) return body;
  try {
    const parsed: unknown = JSON.parse(body);
    const redactValue = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(redactValue);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactValue(nested),
        ]),
      );
    };
    return JSON.stringify(redactValue(parsed), null, 2);
  } catch {
    if (body.includes("=")) {
      const params = new URLSearchParams(body);
      let matchedSensitiveField = false;
      for (const key of params.keys()) {
        if (SENSITIVE_KEY.test(key)) {
          params.set(key, "[REDACTED]");
          matchedSensitiveField = true;
        }
      }
      if (matchedSensitiveField) return params.toString();
    }
    return body.replace(
      /((?:access[-_]?token|refresh[-_]?token|api[-_]?key|authorization|password|secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^&,\s}]+)/gi,
      '$1"[REDACTED]"',
    );
  }
}

export function redactNetworkRequest(
  request: NetworkCaptureEntry,
): NetworkCaptureEntry {
  let url = request.url;
  let path: string;
  let queryParams: string;
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = "[REDACTED]";
    if (parsed.password) parsed.password = "[REDACTED]";
    for (const [key] of parsed.searchParams) {
      if (SENSITIVE_KEY.test(key)) parsed.searchParams.set(key, "[REDACTED]");
    }
    url = parsed.toString();
    path = `${parsed.pathname}${parsed.search}`;
    queryParams = parsed.search;
  } catch {
    url = request.url.split("?")[0];
    path = request.path.split("?")[0];
    queryParams = "";
  }

  const redactHeaders = (headers: [string, string][]) =>
    headers.map(([name, value]) => [
      name,
      SENSITIVE_KEY.test(name) ? "[REDACTED]" : value,
    ] as [string, string]);
  return {
    ...request,
    url,
    path,
    queryParams,
    requestHeaders: redactHeaders(request.requestHeaders),
    requestBody: redactBody(request.requestBody),
    responseHeaders: redactHeaders(request.responseHeaders),
    responseBody: redactBody(request.responseBody),
    error: request.error ? redactBody(request.error) : undefined,
  };
}
