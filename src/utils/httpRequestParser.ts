export interface ParsedHttpRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body: string;
  queryParams: Record<string, string>;
}

export function extractHttpRequestFromLog(logText: string): ParsedHttpRequest | null {
  if (!logText) return null;

  const argsObject = extractBalancedObject(logText, "request args");
  if (argsObject) {
    const args = parsePythonLikeLiteral(argsObject);
    if (args && typeof args === "object" && !Array.isArray(args)) {
      const record = args as Record<string, unknown>;
      const headersObject = extractBalancedObject(logText, "headers");
      const headers = headersObject ? parsePythonLikeLiteral(headersObject) : {};
      const headersMap = headers && typeof headers === "object" && !Array.isArray(headers)
        ? (headers as Record<string, unknown>)
        : {};
      const urlValue = typeof record.url === "string" ? record.url : "";
      const methodValue = String(record.method ?? "GET");
      const dataValue = record.data ?? record.body ?? record.json ?? "";
      const paramsValue = record.params && typeof record.params === "object" && !Array.isArray(record.params)
        ? (record.params as Record<string, unknown>)
        : {};

      const rawBody = (() => {
        if (typeof dataValue === "string") {
          const trimmed = dataValue.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
              return JSON.stringify(JSON.parse(trimmed), null, 2);
            } catch {
              return trimmed;
            }
          }
          return trimmed;
        }
        if (dataValue === null || dataValue === undefined) return "";
        return JSON.stringify(dataValue, null, 2);
      })();

      let finalUrl = urlValue;
      if (urlValue) {
        try {
          const parsedUrl = new URL(urlValue);
          for (const [key, value] of Object.entries(paramsValue)) {
            parsedUrl.searchParams.set(key, String(value));
          }
          finalUrl = parsedUrl.toString();
        } catch {
          // leave as-is if the URL is malformed
        }
      }

      const headerPairs = Object.entries(headersMap).map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
      ] as [string, string]);

      return {
        method: methodValue.toUpperCase(),
        url: finalUrl,
        headers: headerPairs,
        body: rawBody,
        queryParams: finalUrl ? Object.fromEntries(new URL(finalUrl).searchParams.entries()) : {},
      };
    }
  }

  const fallback = logText.match(/'method'\s*:\s*'([^']+)'[^\n]*'url'\s*:\s*'([^']+)'/i);
  if (!fallback) return null;
  const [, method, url] = fallback;
  return {
    method: method.toUpperCase(),
    url,
    headers: [],
    body: "",
    queryParams: Object.fromEntries(new URL(url).searchParams.entries()),
  };
}

function extractBalancedObject(text: string, keyword: string): string | null {
  const keywordIndex = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (keywordIndex < 0) return null;
  const startIndex = text.indexOf("{", keywordIndex);
  if (startIndex < 0) return null;
  let openDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "{") openDepth += 1;
    if (char === "}") {
      openDepth -= 1;
      if (openDepth === 0) return text.slice(startIndex, index + 1);
    }
  }
  return null;
}

function parsePythonLikeLiteral(input: string): unknown {
  const text = input.trim();
  if (!text) return null;

  let index = 0;
  const parseValue = (): unknown => {
    skipWhitespace();
    if (index >= text.length) return null;
    const char = text[index];
    if (char === "{") return parseObject();
    if (char === "[") return parseArray();
    if (char === '"' || char === "'") return parseString();
    if (char === "-" || /\d/.test(char)) return parseNumber();
    if (text.startsWith("true", index)) {
      index += 4;
      return true;
    }
    if (text.startsWith("false", index)) {
      index += 5;
      return false;
    }
    if (text.startsWith("null", index)) {
      index += 4;
      return null;
    }

    const value = parseBareWord();
    if (value === "{" || value === "[") {
      return value;
    }
    return value;
  };

  const parseObject = (): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    index += 1;
    skipWhitespace();
    while (index < text.length) {
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return result;
      }
      const key = parseKey();
      skipWhitespace();
      if (text[index] !== ":") throw new Error("Expected ':' in object");
      index += 1;
      const value = parseValue();
      result[key] = value;
      skipWhitespace();
      if (text[index] === ",") {
        index += 1;
        continue;
      }
      if (text[index] === "}") {
        index += 1;
        return result;
      }
    }
    return result;
  };

  const parseArray = (): unknown[] => {
    const result: unknown[] = [];
    index += 1;
    skipWhitespace();
    while (index < text.length) {
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return result;
      }
      result.push(parseValue() as unknown);
      skipWhitespace();
      if (text[index] === ",") {
        index += 1;
        continue;
      }
      if (text[index] === "]") {
        index += 1;
        return result;
      }
    }
    return result;
  };

  const parseString = (): string => {
    const quote = text[index];
    index += 1;
    let value = "";
    while (index < text.length) {
      const char = text[index];
      if (char === "\\") {
        index += 1;
        const next = text[index];
        if (next === "n") value += "\n";
        else if (next === "r") value += "\r";
        else if (next === "t") value += "\t";
        else if (next === "u") {
          const code = text.slice(index + 1, index + 5);
          if (/^[0-9a-fA-F]{4}$/.test(code)) {
            value += String.fromCharCode(Number.parseInt(code, 16));
            index += 4;
          } else {
            value += "u";
          }
        } else if (next === quote) value += quote;
        else value += next ?? "";
        index += 1;
        continue;
      }
      if (char === quote) {
        index += 1;
        return value;
      }
      value += char;
      index += 1;
    }
    return value;
  };

  const parseNumber = (): number => {
    if (text[index] === "-") index += 1;
    const start = index;
    while (index < text.length && /\d/.test(text[index])) index += 1;
    if (text[index] === ".") {
      index += 1;
      while (index < text.length && /\d/.test(text[index])) index += 1;
    }
    return Number(text.slice(start, index));
  };

  const parseBareWord = (): string => {
    const start = index;
    while (index < text.length && /[A-Za-z0-9_\-./]/.test(text[index])) {
      index += 1;
    }
    return text.slice(start, index);
  };

  const parseKey = (): string => {
    skipWhitespace();
    if (text[index] === '"' || text[index] === "'") return parseString();
    const start = index;
    while (index < text.length && /[A-Za-z0-9_\-]/.test(text[index])) index += 1;
    return text.slice(start, index);
  };

  const skipWhitespace = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  };

  const value = parseValue();
  skipWhitespace();
  return value;
}
