import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createDebouncer,
  isIgnoredDevPath,
  isRelevantDevChange,
  registerDevReloadHandler,
  shouldManualReload,
} from "../src/utils/devMode";

const listeners = new Map<string, Set<(event: Event) => void>>();
const fakeWindow = {
  addEventListener: (type: string, listener: (event: Event) => void) => {
    const set = listeners.get(type) ?? new Set();
    set.add(listener);
    listeners.set(type, set);
  },
  removeEventListener: (type: string, listener: (event: Event) => void) => {
    listeners.get(type)?.delete(listener);
  },
  dispatchEvent: (event: Event) => {
    for (const listener of listeners.get(event.type) ?? []) {
      listener(event);
    }
  },
  location: { hostname: "localhost", port: "5173" },
};

describe("dev-mode utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true });
    listeners.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    listeners.clear();
    delete (globalThis as { window?: unknown }).window;
  });

  it("ignores generated and dependency paths", () => {
    expect(isIgnoredDevPath("C:/repo/.git/config")).toBe(true);
    expect(isIgnoredDevPath("C:/repo/node_modules/package/file.js")).toBe(true);
    expect(isIgnoredDevPath("C:/repo/src/app.ts")).toBe(false);
    expect(isIgnoredDevPath("C:/repo/src/cache.pyc")).toBe(true);
  });

  it("keeps relevant source files and ignores dev.py itself", () => {
    expect(isRelevantDevChange("src/main.tsx")).toBe(true);
    expect(isRelevantDevChange("electron/main.ts")).toBe(true);
    expect(isRelevantDevChange("dev.py")).toBe(false);
    expect(isRelevantDevChange("dist/main.js")).toBe(false);
    expect(isIgnoredDevPath("dist/main.js")).toBe(true);
  });

  it("debounces repeated change notifications", () => {
    const callback = vi.fn();
    const debounced = createDebouncer("file.ts", callback, 400);

    debounced("first");
    debounced("second");
    debounced("third");

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("third");
  });

  it("detects the manual reload shortcut", () => {
    expect(
      shouldManualReload({ ctrlKey: true, metaKey: false, shiftKey: true, key: "R" }),
    ).toBe(true);
    expect(
      shouldManualReload({ ctrlKey: false, metaKey: true, shiftKey: true, key: "r" }),
    ).toBe(true);
    expect(
      shouldManualReload({ ctrlKey: true, metaKey: false, shiftKey: false, key: "r" }),
    ).toBe(false);
  });

  it("registers and removes reload keyboard handling", () => {
    const callback = vi.fn();
    const cleanup = registerDevReloadHandler(callback);
    fakeWindow.dispatchEvent({
      type: "keydown",
      key: "r",
      ctrlKey: true,
      shiftKey: true,
      preventDefault: vi.fn(),
    } as unknown as Event);
    expect(callback).toHaveBeenCalledTimes(1);
    cleanup();
    fakeWindow.dispatchEvent({
      type: "keydown",
      key: "r",
      ctrlKey: true,
      shiftKey: true,
      preventDefault: vi.fn(),
    } as unknown as Event);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
