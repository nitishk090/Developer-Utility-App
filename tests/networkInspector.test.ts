import { describe, expect, it } from "vitest";
import type { NetworkCaptureEntry } from "../electron/types";
import {
  filterNetworkRequests,
  redactNetworkRequest,
  type NetworkRequestFilters,
} from "../src/utils/networkInspector";

const baseRequest: NetworkCaptureEntry = {
  id: "request-1",
  timestamp: "2026-10-20T10:00:00.000Z",
  method: "GET",
  url: "http://api.example.test/items?access_token=secret&limit=2",
  hostname: "api.example.test",
  path: "/items?access_token=secret&limit=2",
  queryParams: "?access_token=secret&limit=2",
  protocol: "http",
  requestHeaders: [
    ["Authorization", "Bearer synthetic-secret"],
    ["Accept", "application/json"],
  ],
  requestBody: "",
  responseStatus: 200,
  responseHeaders: [["Content-Type", "application/json"]],
  responseBody: '{"access_token":"synthetic-token","name":"item"}',
  durationMs: 12,
  requestSize: 0,
  responseSize: 52,
  contentType: "application/json",
};

const emptyFilters: NetworkRequestFilters = {
  hostname: "",
  url: "",
  method: "",
  status: "",
  contentType: "",
  failedOnly: false,
  timeRange: "all",
};

describe("network inspector request helpers", () => {
  it("combines filters against captured request data", () => {
    const failed: NetworkCaptureEntry = {
      ...baseRequest,
      id: "request-2",
      method: "POST",
      responseStatus: 503,
      contentType: "text/plain",
    };
    expect(
      filterNetworkRequests(
        [baseRequest, failed],
        {
          ...emptyFilters,
          hostname: "EXAMPLE",
          method: "POST",
          status: "5",
          contentType: "text/",
          failedOnly: true,
        },
        Date.parse("2026-10-20T10:01:00.000Z"),
      ),
    ).toEqual([failed]);
  });

  it("redacts credentials in URLs, headers, and JSON bodies", () => {
    const redacted = redactNetworkRequest(baseRequest);
    expect(redacted.url).toContain("access_token=%5BREDACTED%5D");
    expect(redacted.path).toContain("access_token=%5BREDACTED%5D");
    expect(redacted.queryParams).not.toContain("secret");
    expect(redacted.requestHeaders[0][1]).toBe("[REDACTED]");
    expect(redacted.responseBody).toContain('"access_token": "[REDACTED]"');
    expect(JSON.stringify(redacted)).not.toContain("synthetic");
  });

  it("redacts sensitive form fields and retains other values", () => {
    const redacted = redactNetworkRequest({
      ...baseRequest,
      requestBody: "password=synthetic&name=developer",
    });
    expect(redacted.requestBody).toContain("password=%5BREDACTED%5D");
    expect(redacted.requestBody).toContain("name=developer");
  });
});
