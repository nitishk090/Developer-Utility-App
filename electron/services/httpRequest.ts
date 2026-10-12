import type { HttpRequestInput, HttpResponseResult } from "../types";

export async function performHttpRequest(
  input: HttpRequestInput,
  signal: AbortController["signal"],
): Promise<HttpResponseResult> {
  const method = input.method.toUpperCase();
  const response = await fetch(input.url, {
    method,
    headers: input.headers,
    body: method === "GET" || method === "HEAD" ? undefined : input.body,
    redirect: "follow",
    signal,
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers, ([key, value]) => `${key}: ${value}`),
    body: await response.text(),
  };
}