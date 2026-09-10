import { useState } from "react";

/**
 * Session-scoped state store keyed by an arbitrary string. Values survive
 * component unmounts so switching between tools preserves their input/output
 * content; the store lives for the lifetime of the app (module scope).
 */
const store = new Map<string, unknown>();

export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (store.has(key)) return store.get(key) as T;
    const resolved =
      typeof initial === "function" ? (initial as () => T)() : initial;
    store.set(key, resolved);
    return resolved;
  });
  const setValuePersist = (next: T | ((previous: T) => T)) => {
    setValue((previous) => {
      const resolved =
        typeof next === "function"
          ? (next as (previousState: T) => T)(previous)
          : next;
      store.set(key, resolved);
      return resolved;
    });
  };
  return [value, setValuePersist];
}