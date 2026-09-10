const IGNORED_PATH_PARTS = [
  "/.git/",
  "/node_modules/",
  "/dist/",
  "/dist-electron/",
  "/release/",
  "/release-installer/",
  "/release-layout/",
  "/release-new/",
  "/__pycache__/",
  "/.pytest_cache/",
  "/.venv/",
  "/venv/",
  "/env/",
  "/.idea/",
  "/.vscode/",
  "/.next/",
  "/coverage/",
];

const RELEVANT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".html",
  ".json",
  ".py",
]);

export function isIgnoredDevPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  if (normalized.endsWith(".pyc")) return true;

  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => IGNORED_PATH_PARTS.includes(`/${part}/`))) {
    return true;
  }
  if (parts.includes(".git") || parts.includes("node_modules") || parts.includes("dist")) {
    return true;
  }

  for (const segment of IGNORED_PATH_PARTS) {
    if (normalized.includes(segment)) return true;
  }

  return false;
}

export function isRelevantDevChange(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");

  if (isIgnoredDevPath(normalized)) return false;
  if (normalized === "dev.py") return false;

  const ext = normalized.includes(".")
    ? normalized.slice(normalized.lastIndexOf("."))
    : "";

  return RELEVANT_EXTENSIONS.has(ext.toLowerCase());
}

export function createDebouncer<T>(
  key: string,
  callback: (value: T) => void,
  waitMs = 400,
): (value: T) => void {
  const timestamps = new Map<string, number>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  return (value: T) => {
    const now = Date.now();
    const previous = timestamps.get(key);
    const active = pending.get(key);

    if (active && previous && now - previous < waitMs) {
      globalThis.clearTimeout(active);
      pending.delete(key);
    }

    timestamps.set(key, now);
    const timeout = globalThis.setTimeout(() => {
      timestamps.delete(key);
      pending.delete(key);
      callback(value);
    }, waitMs);
    pending.set(key, timeout);
  };
}

export function isDevelopmentMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.port === "5173";
}

export function shouldManualReload(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "key">): boolean {
  const key = event.key.toLowerCase();
  return (event.ctrlKey || event.metaKey) && event.shiftKey && key === "r";
}

export function registerDevReloadHandler(onReload: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!shouldManualReload(event)) return;
    event.preventDefault();
    onReload();
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}
