import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { performHttpRequest } from "../electron/services/httpRequest";

describe("Electron HTTP request transport", () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    if (!server) return;
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      current.close((error) => error ? reject(error) : resolve());
    });
  });

  it("preserves an HTTP 401 response, headers, and body", async () => {
    server = createServer((_request, response) => {
      response.writeHead(401, "Unauthorized", {
        "Content-Type": "application/json",
        "WWW-Authenticate": "Bearer",
      });
      response.end('{"detail":"Invalid token"}');
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");

    const result = await performHttpRequest({
      method: "GET",
      url: `http://127.0.0.1:${address.port}/private`,
      headers: { Authorization: "Bearer invalid" },
    }, new AbortController().signal);

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      body: '{"detail":"Invalid token"}',
    });
    expect(result.headers).toContain("www-authenticate: Bearer");
  });
});