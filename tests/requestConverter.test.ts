import { describe, expect, it } from "vitest";
import { generateCurl, parseCurl } from "../src/utils/developerTools";
import {
  detectInputFormat,
  parseAnyRequest,
  requestToCurl,
  validateRequest,
} from "../src/utils/requestConverter";

describe("request format detection and normalization", () => {
  it("detects cURL, raw HTTP, JSON, Fetch, Axios, and HAR", () => {
    expect(detectInputFormat("curl -X GET https://example.com")).toBe("curl");
    expect(detectInputFormat("GET https://example.com HTTP/1.1\n\n")).toBe("raw-http");
    expect(detectInputFormat('{"method":"GET","url":"https://example.com"}')).toBe("json");
    expect(detectInputFormat("fetch('https://example.com')")).toBe("fetch");
    expect(detectInputFormat("axios({ url: 'https://example.com' })")).toBe("axios");
    expect(detectInputFormat('{"log":{"entries":[]}}')).toBe("har");
  });

  it("normalizes JSON request configuration with query, headers, and JSON body", () => {
    const result = parseAnyRequest(JSON.stringify({
      method: "POST",
      url: "https://example.com/users",
      params: { page: 2 },
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: { name: "John", age: 25 },
    }));
    expect(result.request).toMatchObject({
      method: "POST",
      url: "https://example.com/users?page=2",
      bodyType: "json",
    });
    expect(requestToCurl(result.request)).toContain("--data-raw");
  });

  it("normalizes Fetch and Axios request code", () => {
    const fetchRequest = parseAnyRequest("fetch('https://example.com/api', { method: 'PUT', headers: { 'X-Test': 'yes' }, body: '{\"a\": 1}' })");
    expect(fetchRequest.request.method).toBe("PUT");
    expect(fetchRequest.request.headers).toEqual([["X-Test", "yes"]]);
    const axiosRequest = parseAnyRequest("axios({ method: 'DELETE', url: 'https://example.com/users/1', headers: { Authorization: 'Bearer token' }, data: '{\"remove\":true}' })");
    expect(axiosRequest.request.method).toBe("DELETE");
    expect(requestToCurl(axiosRequest.request)).toContain("Authorization: Bearer token");
  });

  it("normalizes HAR request data", () => {
    const result = parseAnyRequest(JSON.stringify({
      log: { entries: [{ request: {
        method: "POST",
        url: "https://example.com/search",
        queryString: [{ name: "q", value: "two words" }],
        headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
        postData: { params: [{ name: "page", value: "1" }] },
      } }] },
    }));
    expect(result.request.url).toContain("q=two+words");
    expect(result.request.bodyType).toBe("form");
    expect(requestToCurl(result.request)).toContain("--data-urlencode");
  });

  it("preserves cURL auth, cookies, forms, options, and request target", () => {
    const input = "curl --request POST --url 'https://example.com/upload?ready=1' --user 'sam:secret' --cookie 'sid=abc; theme=dark' --form 'file=@report.txt' --form 'kind=full' --compressed --insecure --location --request-target '/upload?ready=1'";
    const request = parseCurl(input);
    expect(request.auth).toEqual({ type: "basic", value: "sam:secret" });
    expect(request.cookies).toEqual([["sid", "abc"], ["theme", "dark"]]);
    expect(request.bodyType).toBe("multipart");
    expect(request.options).toEqual(["compressed", "insecure", "location"]);
    const output = generateCurl(request);
    expect(output).toContain("--form 'file=@report.txt'");
    expect(output).toContain("--cookie 'sid=abc; theme=dark'");
    expect(output).toContain("--request-target");
  });

  it("reports missing, invalid, and malformed request data", () => {
    expect(validateRequest({ method: "GET", url: "", headers: [], body: "" })).toContain("A request URL is required.");
    expect(validateRequest({ method: "TRACE", url: "https://example.com", headers: [], body: "" })[0]).toContain("Unsupported HTTP method");
    expect(validateRequest({ method: "POST", url: "https://example.com", headers: [], body: "{bad", bodyType: "json" })[0]).toContain("malformed");
  });
});
