import { describe, expect, it } from "vitest";
import { buildMetricsUrl, normalizeLogEntry } from "../src/utils/logStreamService";
import {
  extractHttpRequestFromLog,
  type ParsedHttpRequest,
} from "../src/utils/httpRequestParser";
import { generateCurlFromRequest } from "../src/utils/curlGenerator";
import { redactSecrets } from "../src/utils/secretRedactor";

describe("log stream utilities", () => {
  it("builds the GraniteStack metrics URL from project selections", () => {
    expect(
      buildMetricsUrl({
        poolId: "gpool812642",
        projectPk: "1720",
        logGroup: "source",
        timePeriod: "12h",
        pageSize: 100,
      }),
    ).toBe(
      "https://shop.vendis.com.au/metrics/?pool_id=gpool812642&project_pk=1720&metric=LogStream&log_group=source&page_size=100&timePeriod=12h",
    );
  });

  it("extracts a POST request from a Python-style log line", () => {
    const body = JSON.stringify({
      data: { page: 1, page_size: 99999 },
      user_id: 42,
    });
    const log =
      "[INFO] request args {'method': 'POST', 'url': 'https://shop.vendis.com.au/aggregate/v2/queries/execute/184/', 'data': '" +
      body.replaceAll('\\', '\\\\') +
      "'} : headers {'Content-type': 'application/json', 'Authorization': 'Bearer secret-token'}";

    const request = extractHttpRequestFromLog(log);
    expect(request).toBeTruthy();
    expect((request as ParsedHttpRequest).method).toBe("POST");
    expect((request as ParsedHttpRequest).url).toBe(
      "https://shop.vendis.com.au/aggregate/v2/queries/execute/184/",
    );
    expect((request as ParsedHttpRequest).body).toContain('"user_id": 42');
    expect((request as ParsedHttpRequest).headers).toEqual(
      expect.arrayContaining([
        ["Content-type", "application/json"],
        ["Authorization", "Bearer secret-token"],
      ]),
    );
  });

  it("extracts a GET request with params and headers", () => {
    const log =
      "[INFO] request args {'method': 'GET', 'url': 'https://example.com/search', 'params': {'q': 'dogs', 'page': 2}, 'headers': {'X-Token': 'abc'}}";
    const request = extractHttpRequestFromLog(log);
    expect(request).toBeTruthy();
    expect((request as ParsedHttpRequest).method).toBe("GET");
    expect((request as ParsedHttpRequest).url).toBe(
      "https://example.com/search?q=dogs&page=2",
    );
    expect((request as ParsedHttpRequest).headers).toEqual([
      ["X-Token", "abc"],
    ]);
  });

  it("returns null when no HTTP request is present", () => {
    expect(extractHttpRequestFromLog("[INFO] lambda invoked with no request")).toBeNull();
  });

  it("generates cURL output from a parsed request while redacting secrets", () => {
    const request: ParsedHttpRequest = {
      method: "POST",
      url: "https://example.com/submit",
      headers: [
        ["Content-Type", "application/json"],
        ["Authorization", "Bearer super-secret-value"],
      ],
      body: '{"data":{"page":1}}',
      queryParams: {},
    };
    const curl = generateCurlFromRequest(request);
    expect(curl).toContain("curl --location --request 'POST' 'https://example.com/submit'");
    expect(curl).toContain(`--data-raw '{"data":{"page":1}}'`);
    expect(curl).toContain("Authorization: Bearer");
    expect(curl).not.toContain("super-secret-value");
    expect(redactSecrets("Authorization: Bearer secret-value")).toContain("••••");
  });

  it("requires a URL when generating cURL", () => {
    expect(() =>
      generateCurlFromRequest({
        method: "GET",
        url: "",
        headers: [],
        body: "",
        queryParams: {},
      }),
    ).toThrow("Unable to find URL in the request.");
  });

  it("normalizes log entries for the viewer", () => {
    const log = {
      timestamp: "2026-09-10T06:44:31.492Z",
      message: "[INFO] request args {'method': 'POST'}",
      level: "INFO",
      source: "source",
      log_group: "source",
    };
    const normalized = normalizeLogEntry(log);
    expect(normalized.category).toBe("REQUEST ARGS");
    expect(normalized.message).toContain("request args");
  });
});
