import { describe, expect, it } from "vitest";
import {
  analyzeHttp,
  convertUnit,
  curlToCode,
  findStatus,
  formatDiff,
  formatSql,
  generateCurl,
  generateTypes,
  jsonDiff,
  jsonPaths,
  jsonStatistics,
  mockJson,
  parseCurl,
  parseRaw,
  replacePlaceholders,
  runRegex,
  validateJson,
} from "../src/utils/developerTools";

describe("request tooling", () => {
  it("parses raw requests and generates safe cURL", () => {
    const request = parseRaw(
      'POST https://example.com/login HTTP/1.1\nHost: example.com\nContent-Type: application/json\n\n{"name":"O\'Reilly"}',
    );
    const curl = generateCurl(request);
    expect(request.method).toBe("POST");
    expect(curl).toContain("--data-raw");
    expect(curl).toContain("'\"'\"'");
    expect(curl).not.toContain("Host:");
  });
  it("parses a cURL body and headers", () => {
    const request = parseCurl(
      "curl -X PATCH 'https://example.com/users/7' -H 'Accept: application/json' -d '{\"a\":1}'",
    );
    expect(request).toMatchObject({
      method: "PATCH",
      url: "https://example.com/users/7",
      body: '{"a":1}',
    });
    expect(request.headers).toEqual([["Accept", "application/json"]]);
  });
  it("parses Windows cURL with headers and body", () => {
    const parsed = parseCurl(
      "curl.exe --request=PATCH --url=https://example.com/users/7 --header='Authorization: Bearer token' --header='Content-Type: application/json' --data-raw='{\"name\":\"Sam\"}'",
    );
    expect(parsed.method).toBe("PATCH");
    expect(parsed.url).toBe("https://example.com/users/7");
    expect(parsed.headers).toEqual([
      ["Authorization", "Bearer token"],
      ["Content-Type", "application/json"],
    ]);
    expect(parsed.body).toBe('{"name":"Sam"}');
  });
  it("parses Windows cmd-escaped cURL with cookies and JSON body", () => {
    // Mirrors "Copy as cURL (cmd)" output: carets escape quotes and braces,
    // lines continue with a trailing caret, cookies use -b, and the body is
    // JSON with escaped quotes (^\^").
    const command = [
      'curl --url ^"https://planaventure-beta.granitestack.io/api/v1/shared_public_ventures/^" ^',
      '  -H ^"accept: application/json^" ^',
      '  -H ^"accept-language: en-US,en;q=0.7^" ^',
      '  -H ^"authorization: Token abc.def.ghi^" ^',
      '  -H ^"client: sample-client-id^" ^',
      '  -H ^"content-type: application/json^" ^',
      '  -b ^"refreshToken=token1; bearerToken=token2^" ^',
      '  -H ^"disable-log: true^" ^',
      '  -H ^"origin: https://planaventure-beta.granitestack.io^" ^',
      '  -H ^"sec-ch-ua: ^\\^"Chromium^\\^";v=^\\^"152^\\^", ^\\^"Brave^\\^";v=^\\^"152^\\^"^" ^',
      '  -H ^"sec-fetch-site: same-origin^" ^',
      '  -H ^"user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)^" ^',
      '  --data-raw ^"^{^\\^"data^\\^":^{^\\^"page^\\^":1,^\\^"page_size^\\^":10^}^}^"',
    ].join("\n");
    const request = parseCurl(command);
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://planaventure-beta.granitestack.io/api/v1/shared_public_ventures/",
    );
    expect(request.body).toBe('{"data":{"page":1,"page_size":10}}');
    const headers = Object.fromEntries(request.headers);
    expect(headers.Cookie).toBe("refreshToken=token1; bearerToken=token2");
    expect(headers.authorization).toBe("Token abc.def.ghi");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["disable-log"]).toBe("true");
    expect(headers["sec-ch-ua"]).toBe('"Chromium";v="152", "Brave";v="152"');
    expect(request.headers.length).toBe(11);
  });
  it("converts -b/--cookie and -u flags into headers", () => {
    const request = parseCurl(
      "curl 'https://example.com/' -b 'a=1; b=2' --user 'sam:s3cret'",
    );
    const headers = Object.fromEntries(request.headers);
    expect(headers.Cookie).toBe("a=1; b=2");
    expect(headers.Authorization).toMatch(/^Basic /);
  });
  it("does not mistake values of unknown flags for the URL", () => {
    const request = parseCurl("curl -o page.json https://example.com/data");
    expect(request.url).toBe("https://example.com/data");
  });
  it("parses multiline cURL with location and JSON body", () => {
    const parsed = parseCurl(
      `curl --location 'https://example.com/sync/' \\\n--header 'accept: application/json' \\\n--header 'authorization: Token secret' \\\n--data '{\n  "name": "Test",\n  "id": 2304\n}'`,
    );
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://example.com/sync/");
    expect(parsed.headers).toEqual([
      ["accept", "application/json"],
      ["authorization", "Token secret"],
    ]);
  });
  it("parses label-per-line requests with values on the next line", () => {
    const request = parseRaw(
      [
        "Method: POST",
        "URL",
        "https://planaventure-beta.granitestack.io/api/v1/milestone_list/",
        "Headers",
        "accept:",
        "application/json, text/plain, */*",
        "Accept-Encoding:",
        "gzip",
        "authorization:",
        "Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.signature",
        "client:",
        "YHl89ujI2uj2pMtvnxXktPDw6hHGntBLD5coGpqf",
        "Connection:",
        "Keep-Alive",
        "Content-Length:",
        "59",
        "Content-Type:",
        "application/json",
        "Host:",
        "planaventure-beta.granitestack.io",
        "mobile:",
        "true",
        "User-Agent:",
        "okhttp/4.9.2",
        "",
        "{",
        '  "data": {',
        '    "page_size": 499,',
        '    "page": 1,',
        '    "pk": 2546,',
        '    "user_pk": 160',
        "  }",
        "}",
      ].join("\n"),
    );
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://planaventure-beta.granitestack.io/api/v1/milestone_list/",
    );
    expect(request.headers).toEqual([
      ["accept", "application/json, text/plain, */*"],
      ["Accept-Encoding", "gzip"],
      ["authorization", "Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.signature"],
      ["client", "YHl89ujI2uj2pMtvnxXktPDw6hHGntBLD5coGpqf"],
      ["Connection", "Keep-Alive"],
      ["Content-Length", "59"],
      ["Content-Type", "application/json"],
      ["Host", "planaventure-beta.granitestack.io"],
      ["mobile", "true"],
      ["User-Agent", "okhttp/4.9.2"],
    ]);
    expect(JSON.parse(request.body)).toEqual({
      data: { page_size: 499, page: 1, pk: 2546, user_pk: 160 },
    });
    const output = generateCurl(request);
    expect(output).toContain("--data-raw");
    expect(output).toContain("'authorization: Token");
    expect(output).toContain("'mobile: true'");
    expect(output).not.toContain("Content-Length");
    expect(output).not.toContain("Host:");
  });
  it("parses Python request log lines with args and headers dicts", () => {
    const body = JSON.stringify({
      data: { pk: 110, organisation_id: 27 },
      name: "Pitch Test_1102026-09-02_06:44:31",
      title: "Pitch Test",
      message:
        '<div><span><img src="https://epsilon.iangroup.vc/documents/public/33b3b329-c2c6-4bf7-a063-916733655344-01-07-2026-06-28-06.png" width="100" style="width: 100px;"></span></div>',
      location: "Gurugram",
      user_ids: [49897, 49898],
      rem_count: null,
      to_emails: [
        "sarthak.hans+011@thoughts2binary.com",
        "drishti.jain+92@thoughts2binary.com",
      ],
      mail_action: false,
      deal_round_id: null,
      end_date_time: "10-Sep-2026 18:30:00",
      updated_title: "[UPDATED] : Pitch Test",
      reminder_title: null,
      organisation_id: 27,
      reminder_1_name: null,
      reminder_2_name: null,
      reminder_3_name: null,
      reminder_4_name: null,
      reminder_5_name: null,
      start_date_time: "02-Sep-2026 07:30:00",
      whatsapp_action: false,
      target_object_id: 110,
      rem_one_date_time: null,
      rem_two_date_time: null,
      rem_five_date_time: null,
      rem_four_date_time: null,
      notification_action: true,
      rem_three_date_time: null,
      notification_content: "push",
    });
    const log =
      "[INFO]    2026-09-02T06:44:31.492Z    5165c244-9029-4888-8819-6c35eb5a5402    " +
      "request args {'method': 'POST', 'url': 'https://epsilon.iangroup.vc/api/v1/get-documents-updated/', 'data': '" +
      body.replaceAll("\\", "\\\\") +
      "'} : headers {'User-Agent': 'python-requests/2.33.0', 'Accept-Encoding': 'gzip, deflate', 'Accept': '/', 'Connection': 'keep-alive', 'Content-type': 'application/json', 'Authorization': 'Bearer kFOAadeTNVjDu3oiOWq3mmt1jAepdo'}";
    const request = parseRaw(log);
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://epsilon.iangroup.vc/api/v1/get-documents-updated/",
    );
    expect(request.body).toBe(body);
    expect(JSON.parse(request.body)).toMatchObject({
      title: "Pitch Test",
      organisation_id: 27,
      target_object_id: 110,
      to_emails: [
        "sarthak.hans+011@thoughts2binary.com",
        "drishti.jain+92@thoughts2binary.com",
      ],
    });
    expect(request.body).toContain(
      'src=\\"https://epsilon.iangroup.vc/documents/public/33b3b329-c2c6-4bf7-a063-916733655344-01-07-2026-06-28-06.png\\"',
    );
    expect(request.headers).toEqual([
      ["User-Agent", "python-requests/2.33.0"],
      ["Accept-Encoding", "gzip, deflate"],
      ["Accept", "/"],
      ["Connection", "keep-alive"],
      ["Content-type", "application/json"],
      ["Authorization", "Bearer kFOAadeTNVjDu3oiOWq3mmt1jAepdo"],
    ]);
    const output = generateCurl(request);
    expect(output).toContain(
      "'Authorization: Bearer kFOAadeTNVjDu3oiOWq3mmt1jAepdo'",
    );
    expect(output).toContain("--data-raw");
    expect(output).not.toContain("Connection:");
  });
  it("parses a bare Python dict request with params and headers", () => {
    const request = parseRaw(
      "{'method': 'GET', 'url': 'https://example.com/search', 'params': {'q': 'dogs', 'page': 2}, 'headers': {'X-Token': 'abc'}}",
    );
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://example.com/search?q=dogs&page=2");
    expect(request.headers).toEqual([["X-Token", "abc"]]);
    expect(request.body).toBe("");
  });
});

describe("cURL generation", () => {
  it("keeps JSON as data not headers", () => {
    const request = parseRaw(
      'Method: POST\nURL: https://example.com/?pk=2234\nContent-Length: 34\nHost: example.com\nUser-Agent: okhttp/4.9.2\nContent-Type: application/json\n\n{"data": {"pk": 2234}}',
    );
    const output = generateCurl(request);
    expect(output).toContain("--header 'User-Agent: okhttp/4.9.2'");
    expect(output).toContain("--data-raw ");
    expect(output).not.toContain("Content-Length");
    expect(output).not.toContain("Host:");
  });
  it("escapes single quotes", () => {
    const request = parseRaw(
      "Method: GET\nURL: https://example.com/o'h\nCookie: a=b",
    );
    expect(generateCurl(request)).toContain("'\"'\"'");
  });
  it("GET with query has no method or data", () => {
    const request = parseRaw(
      "GET https://example.com/users?page=1&limit=20 HTTP/1.1\nAccept: application/json\n",
    );
    const output = generateCurl(request);
    expect(
      output.startsWith("curl 'https://example.com/users?page=1&limit=20'"),
    ).toBe(true);
    expect(output).not.toContain("-X GET");
    expect(output).not.toContain("--data-raw");
  });
});

describe("local utilities", () => {
  it("reports JSON and regex errors without throwing", () => {
    expect(validateJson('{"a":}')).toContain("Invalid JSON");
    expect(runRegex("[", "value")).toContain("Invalid regular expression");
  });
  it("validates correct JSON", () => {
    expect(validateJson('{"a":1, "b": [1,2,3]}')).toBe("Valid JSON");
  });
});

describe("JSON extensions", () => {
  it("explores JSON paths", () => {
    const data = { user: { name: "John" }, items: [{ id: 1 }] };
    const paths = jsonPaths(data);
    expect(paths).toContainEqual(["user.name", "John"]);
    expect(paths.some(([p]) => p === "items[0].id")).toBe(true);
  });
  it("diffs JSON documents", () => {
    const changes = jsonDiff({ a: 1 }, { a: 2 });
    expect(changes[0].kind).toBe("changed");
  });
  it("formats diff output", () => {
    const changes = jsonDiff({ a: 1, b: 2 }, { a: 1, c: 3 });
    const formatted = formatDiff(changes);
    expect(formatted).toContain("REMOVED");
    expect(formatted).toContain("ADDED");
  });
  it("generates mock JSON from schema", () => {
    const schema = { name: "string", age: "number", active: "boolean" };
    const result = mockJson(schema);
    expect(typeof (result as Record<string, unknown>).name).toBe("string");
    expect(typeof (result as Record<string, unknown>).age).toBe("number");
    expect(typeof (result as Record<string, unknown>).active).toBe("boolean");
  });
  it("generates TypeScript interfaces", () => {
    const result = generateTypes({ name: "John" }, "TypeScript", "User");
    expect(result).toContain("interface User");
  });
  it("generates multi-language types", () => {
    const data = { name: "John" };
    expect(generateTypes(data, "Java", "User")).toContain("public class User");
    expect(generateTypes(data, "Kotlin", "User")).toContain("data class User");
    expect(generateTypes(data, "Swift", "User")).toContain("struct User");
    expect(generateTypes(data, "Python", "User")).toContain("@dataclass");
    expect(generateTypes(data, "Go", "User")).toContain("type User struct");
  });
});

describe("request analysis", () => {
  it("analyzes HTTP requests", () => {
    const result = analyzeHttp(
      'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"a":[null]}',
    );
    expect(result.status).toBe("200 OK");
    expect(result.json).toEqual({ a: [null] });
  });
  it("computes JSON statistics", () => {
    const stats = jsonStatistics({ a: { b: 1 }, c: [1, 2] });
    expect(stats.objects).toBe(1);
    expect(stats.arrays).toBe(1);
    expect(stats.keys).toBe(3);
  });
  it("converts cURL to Python requests code", () => {
    const request = parseCurl(
      "curl -X POST 'https://example.com/api' -H 'Content-Type: application/json' -d '{\"name\":\"A\"}'",
    );
    expect(curlToCode(request, "Python requests")).toContain(
      "requests.request",
    );
  });
  it("converts cURL to JavaScript fetch code", () => {
    const request = parseCurl(
      "curl -X POST 'https://example.com/api' -H 'Content-Type: application/json' -d '{\"name\":\"A\"}'",
    );
    expect(curlToCode(request, "JavaScript fetch")).toContain("fetch");
  });
});

describe("PostgreSQL helper", () => {
  it("replaces placeholders with dollar-quoted syntax", () => {
    const result = replacePlaceholders("WHERE user_pk = 4218", {
      "4218": "user_pk",
    });
    expect(result).toContain("$$user_pk$$");
    expect(result).not.toContain("4218");
  });
  it("does not replace partial matches", () => {
    expect(replacePlaceholders("value = 12345", { "123": "x" })).toBe(
      "value = 12345",
    );
  });
});

describe("SQL formatter", () => {
  it("formats SQL keywords on separate lines", () => {
    const result = formatSql("select id, name from users where active = 1");
    expect(result).toContain("SELECT");
    expect(result).toContain("FROM");
    expect(result).toContain("WHERE");
  });
});

describe("HTTP status codes", () => {
  it("finds status by code", () => {
    expect(findStatus("403")[0][0]).toBe(403);
  });
  it("finds status by name", () => {
    expect(findStatus("Forbidden")[0][0]).toBe(403);
  });
  it("returns all statuses for empty query", () => {
    expect(findStatus("").length).toBeGreaterThan(10);
  });
});

describe("mobile utilities", () => {
  it("converts DP to PX using density", () => {
    expect(convertUnit(10, "DP", "PX", 2)).toBe(20);
  });
  it("converts PX to PX as identity", () => {
    expect(convertUnit(100, "PX", "PX")).toBe(100);
  });
  it("converts PT to PX using iOS scale", () => {
    expect(convertUnit(10, "PT", "PX", 1, 2)).toBeCloseTo(26.67, 1);
  });
});
