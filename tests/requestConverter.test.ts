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
    const curl = requestToCurl(result.request);
    expect(curl).toContain("curl --location --request 'POST' 'https://example.com/users?page=2'");
    expect(curl).toContain(`--data-raw '{"name":"John","age":25}'`);
  });

  it("parses multiline cURL with a redundant Method header", () => {
    const input = [
      "curl --location --request POST https://example.com/api/v1/milestone_list/ \\",
      "--header 'Method: POST' \\",
      "--header 'accept: application/json, text/plain, */*' \\",
      "--header 'authorization: Token placeholder-token' \\",
      "--header 'Content-Type: application/json' \\",
      `--data-raw '{"data":{"page_size":499,"page":1,"pk":2781,"user_pk":267}}'`,
    ].join("\n");
    const result = parseAnyRequest(input);

    expect(result.request).toMatchObject({
      method: "POST",
      url: "https://example.com/api/v1/milestone_list/",
      body: '{"data":{"page_size":499,"page":1,"pk":2781,"user_pk":267}}',
    });
    expect(result.request.headers).toEqual([
      ["accept", "application/json, text/plain, */*"],
      ["authorization", "Token placeholder-token"],
      ["Content-Type", "application/json"],
    ]);
    expect(requestToCurl(result.request)).not.toContain("Method: POST");
  });

  it("parses labeled OkHttp request data and extracts compact JSON bodies", () => {
    const input = [
      "Method",
      "POST",
      "URL",
      "https://example.com/submit",
      "Headers",
      "User-Agent:",
      'okhttp/4.9.2{"message":"literal { brace }"}',
    ].join("\n");
    const result = parseAnyRequest(input);

    expect(result.format).toBe("raw-http");
    expect(result.request).toMatchObject({
      method: "POST",
      url: "https://example.com/submit",
      headers: [["User-Agent", "okhttp/4.9.2"]],
      body: '{"message":"literal { brace }"}',
    });
    expect(requestToCurl(result.request)).toContain(
      `--data-raw '{"message":"literal { brace }"}'`,
    );
  });

  it("accepts TRACE and CONNECT methods from raw HTTP requests", () => {
    for (const method of ["TRACE", "CONNECT"]) {
      const result = parseAnyRequest(`${method} https://example.com HTTP/1.1`);
      expect(result.request.method).toBe(method);
      expect(requestToCurl(result.request)).toContain(`--request '${method}'`);
    }
  });

  it("extracts a request from a JSON-wrapped log record", () => {
    const log = "request args {'method': 'POST', 'url': 'https://beta.example.com/api/v1/skill-list/', 'data': '{\"data\": {\"page\": 1}}'} : headers {'Content-type': 'application/json', 'Authorization': 'Bearer placeholder-token'}";
    const result = parseAnyRequest(JSON.stringify({
      Timestamp: "2026-10-06 09:12:51",
      Message: log,
      CleanMessage: log,
      LogStreamName: "service/stream",
    }));

    expect(result.request).toMatchObject({
      method: "POST",
      url: "https://beta.example.com/api/v1/skill-list/",
      body: '{"data": {"page": 1}}',
    });
    expect(result.request.headers).toEqual([
      ["Content-type", "application/json"],
      ["Authorization", "Bearer placeholder-token"],
    ]);
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
    expect(validateRequest({ method: "CUSTOM", url: "https://example.com", headers: [], body: "" })[0]).toContain("Unsupported HTTP method");
    expect(validateRequest({ method: "POST", url: "https://example.com", headers: [], body: "{bad", bodyType: "json" })[0]).toContain("malformed");
  });
});
