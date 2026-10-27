export type TimeRange =
  | "1m"
  | "2m"
  | "5m"
  | "10m"
  | "15m"
  | "30m"
  | "1h"
  | "12h"
  | "1d"
  | "custom";

export interface LogStreamProject {
  id: string;
  name: string;
  projectPk: string;
  poolId: string;
  environments: LogStreamEnvironment[];
}

export interface LogStreamEnvironment {
  id: string;
  name: string;
  lambdaTargets: LogStreamLambdaTarget[];
}

export interface LogStreamLambdaTarget {
  id: string;
  label: string;
  logGroup: string;
}

export interface LogStreamRequestParams {
  poolId: string;
  projectPk: string;
  logGroup: string;
  timePeriod: string;
  pageSize?: number;
  metric?: string;
  baseUrl?: string;
}

export interface LogStreamErrorResult {
  code: number;
  message: string;
}

export interface LogStreamResponse {
  results?: LogStreamRecord[];
  items?: LogStreamRecord[];
  events?: LogStreamRecord[];
  total?: number;
  count?: number;
  page?: number;
  page_size?: number;
  next?: string | null;
  previous?: string | null;
  data?: unknown;
}

export interface LogStreamRecord {
  id?: string;
  timestamp?: string;
  message?: string;
  log?: string;
  raw?: string;
  level?: string;
  source?: string;
  log_group?: string;
  stream?: string;
  [key: string]: unknown;
}

export type LogTimestampTimeZone = "local" | "utc";

export function formatLogTimestamp(
  timestamp: string,
  timeZone: LogTimestampTimeZone,
): string {
  const normalizedTimestamp = timestamp.trim();
  if (!normalizedTimestamp) return "--";

  const isNumericTimestamp = /^-?\d+(?:\.\d+)?$/.test(normalizedTimestamp);
  const numericTimestamp = Number(normalizedTimestamp);
  const hasExplicitTimeZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(normalizedTimestamp);
  const timezoneFreeIsoTimestamp =
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)?$/.test(normalizedTimestamp);
  const parsedTimestamp = isNumericTimestamp
    ? new Date(Math.abs(numericTimestamp) < 1e12
      ? numericTimestamp * 1000
      : numericTimestamp)
    : new Date(
        timezoneFreeIsoTimestamp && !hasExplicitTimeZone
          ? `${normalizedTimestamp.replace(" ", "T")}Z`
          : normalizedTimestamp,
      );
  if (Number.isNaN(parsedTimestamp.getTime())) return timestamp;

  return parsedTimestamp.toLocaleString(
    undefined,
    timeZone === "utc" ? { timeZone: "UTC" } : undefined,
  );
}

export const DEFAULT_PROJECTS: LogStreamProject[] = [
  {
    id: "ryze-fund",
    name: "RyZe Fund",
    projectPk: "1720",
    poolId: "gpool812642",
    environments: [
      {
        id: "beta",
        name: "BETA",
        lambdaTargets: [
          { id: "source", label: "source", logGroup: "source" },
          { id: "webapi_handler", label: "webapi_handler", logGroup: "webapi_handler" },
          { id: "konnect", label: "konnect", logGroup: "konnect" },
        ],
      },
      {
        id: "production",
        name: "PRODUCTION",
        lambdaTargets: [
          { id: "source", label: "source", logGroup: "source" },
          { id: "webapi_handler", label: "webapi_handler", logGroup: "webapi_handler" },
        ],
      },
    ],
  },
  {
    id: "vendi",
    name: "Vendis",
    projectPk: "1001",
    poolId: "gpool900acf",
    environments: [
      {
        id: "beta",
        name: "BETA",
        lambdaTargets: [{ id: "source", label: "source", logGroup: "source" }],
      },
    ],
  },
];

export function buildMetricsUrl({
  poolId,
  projectPk,
  logGroup,
  timePeriod,
  pageSize = 100,
  metric = "LogStream",
  baseUrl = "https://shop.vendis.com.au/metrics/",
}: LogStreamRequestParams): string {
  const url = new URL(baseUrl);
  url.searchParams.set("pool_id", poolId);
  url.searchParams.set("project_pk", projectPk);
  url.searchParams.set("metric", metric);
  url.searchParams.set("log_group", logGroup);
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("timePeriod", timePeriod);
  return url.toString();
}

export function normalizeLogEntry(entry: Record<string, unknown>): {
  timestamp: string;
  category: string;
  message: string;
  raw: string;
  source?: string;
  logGroup?: string;
  stream?: string;
} {
  const raw = String(entry.raw ?? entry.message ?? entry.log ?? "");
  const message = String(entry.message ?? entry.log ?? entry.raw ?? "");
  const timestamp = String(entry.timestamp ?? new Date().toISOString());
  const category = classifyLogMessage(message);
  return {
    timestamp,
    category,
    message,
    raw,
    source: typeof entry.source === "string" ? entry.source : undefined,
    logGroup:
      typeof entry.log_group === "string" ? entry.log_group : undefined,
    stream: typeof entry.stream === "string" ? entry.stream : undefined,
  };
}

export function classifyLogMessage(message: string): string {
  const text = message.toUpperCase();
  if (/REQUEST ARGS|REQUEST KWARGS|ARGS/.test(text)) return "REQUEST ARGS";
  if (/REQUEST/.test(text)) return "REQUEST";
  if (/SOURCE DATA/.test(text)) return "SOURCE DATA";
  if (/SOURCE/.test(text)) return "SOURCE";
  if (/ERROR|EXCEPTION|FAILURE/.test(text)) return "ERROR";
  if (/WARN|WARNING/.test(text)) return "WARNING";
  if (/INFO/.test(text)) return "INFO";
  return "LOG";
}

export function extractLogEntries(payload: unknown): LogStreamRecord[] {
  if (!payload || typeof payload !== "object") return [];
  const source = payload as Record<string, unknown>;
  for (const key of ["results", "items", "events", "data"]) {
    const value = source[key];
    if (Array.isArray(value)) return value as LogStreamRecord[];
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const arr = nested.results ?? nested.items ?? nested.events;
      if (Array.isArray(arr)) return arr as LogStreamRecord[];
    }
  }
  return [];
}

export async function fetchLogStream({
  authToken,
  project,
  target,
  timePeriod,
  signal,
}: {
  authToken: string;
  project: LogStreamProject;
  target: LogStreamLambdaTarget;
  timePeriod: string;
  signal?: AbortSignal;
}): Promise<LogStreamResponse> {
  const url = buildMetricsUrl({
    poolId: project.poolId,
    projectPk: project.projectPk,
    logGroup: target.logGroup,
    timePeriod,
    pageSize: 100,
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Token ${authToken}`,
      Accept: "application/json",
    },
    signal,
  });

  if (response.status === 401) {
    throw new Error("Authentication expired. Please sign in again.");
  }
  if (response.status === 403) {
    throw new Error("You don't have permission to access these logs.");
  }
  if (response.status === 404) {
    throw new Error("Log endpoint or resource was not found.");
  }
  if (response.status === 429) {
    throw new Error("Too many requests. Please wait and try again.");
  }
  if (response.status >= 500) {
    throw new Error("The log service is temporarily unavailable.");
  }
  if (!response.ok) {
    throw new Error("Unable to reach the log service.");
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new Error("Received an unexpected response from the log service.");
  }

  return payload as LogStreamResponse;
}

export function resolveLogStreamError(status: number): LogStreamErrorResult {
  const map: Record<number, LogStreamErrorResult> = {
    401: { code: 401, message: "Authentication expired. Please sign in again." },
    403: { code: 403, message: "You don't have permission to access these logs." },
    404: { code: 404, message: "Log endpoint or resource was not found." },
    429: { code: 429, message: "Too many requests. Please wait and try again." },
    500: { code: 500, message: "The log service is temporarily unavailable." },
    502: { code: 502, message: "The log service is temporarily unavailable." },
    503: { code: 503, message: "The log service is temporarily unavailable." },
  };
  return map[status] ?? { code: status, message: "Unable to reach the log service." };
}
