import { ParsedHttpRequest } from "./httpRequestParser";
import { redactSecrets } from "./secretRedactor";

export function generateCurlFromRequest(request: ParsedHttpRequest): string {
  const url = request.url;
  if (!url) throw new Error("Unable to find URL in the request.");
  const method = request.method?.toUpperCase() || "GET";
  const headers = request.headers.filter(([key]) =>
    !["host", "content-length", "connection"].includes(key.toLowerCase()),
  );

  const lines = [`curl --location --request ${shellQuote(method)} ${shellQuote(url)}`];
  for (const [key, value] of headers) {
    const redacted = redactSecrets(`${key}: ${value}`);
    lines.push(`--header ${shellQuote(redacted)}`);
  }
  if (request.body) {
    let body = request.body;
    try {
      body = JSON.stringify(JSON.parse(body));
    } catch {
      // Keep non-JSON request bodies unchanged.
    }
    lines.push(`--data-raw ${shellQuote(body)}`);
  }
  return lines.join(" \\\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
