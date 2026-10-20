import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { networkInterfaces } from "node:os";
import { createServer as createTcpServer, connect as connectTcp } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isValidProxyBindAddress,
  NetworkInspectorProxy,
} from "../electron/services/networkInspectorProxy";
import type { NetworkCaptureEntry } from "../electron/types";

describe("Network Inspector HTTP proxy", () => {
  let targetServer: ReturnType<typeof createHttpServer> | undefined;
  let occupiedServer: ReturnType<typeof createHttpServer> | undefined;
  let tcpServer: ReturnType<typeof createTcpServer> | undefined;
  let proxy: NetworkInspectorProxy | undefined;

  afterEach(async () => {
    await proxy?.stop();
    proxy = undefined;
    for (const server of [targetServer, occupiedServer, tcpServer]) {
      if (!server?.listening) continue;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    targetServer = undefined;
    occupiedServer = undefined;
    tcpServer = undefined;
  });

  async function listen(server: ReturnType<typeof createHttpServer> | ReturnType<typeof createTcpServer>) {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    return address.port;
  }

  function waitForCapture(
    instance: NetworkInspectorProxy,
    predicate: (entry: NetworkCaptureEntry) => boolean,
  ): Promise<NetworkCaptureEntry> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for captured request"));
      }, 3000);
      const unsubscribe = instance.subscribe((entry) => {
        if (!predicate(entry)) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(entry);
      });
    });
  }

  function requestThroughProxy(
    endpoint: string,
    targetUrl: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
    const proxyAddress = new URL(endpoint);
    const target = new URL(targetUrl);
    return new Promise((resolve, reject) => {
      const request = httpRequest({
        hostname: proxyAddress.hostname,
        port: Number(proxyAddress.port),
        path: target.toString(),
        method: options.method ?? "GET",
        headers: { ...options.headers, host: target.host },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      });
      request.once("error", reject);
      request.end(options.body);
    });
  }

  it("captures real HTTP request and response metadata and bodies", async () => {
    targetServer = createHttpServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        response.writeHead(201, { "content-type": "application/json", "x-test": "captured" });
        response.end(JSON.stringify({
          method: request.method,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      });
    });
    const targetPort = await listen(targetServer);
    proxy = new NetworkInspectorProxy(() => {});
    const status = await proxy.start();
    expect(status.state).toBe("listening");
    expect(status.port).toBeGreaterThan(0);
    const endpoint = status.endpoint;
    if (!endpoint) throw new Error("Proxy endpoint was not assigned");
    expect(Number(new URL(endpoint).port)).toBe(status.port);
    const captured = waitForCapture(proxy, (entry) =>
      entry.url.includes("/capture?value=1") && entry.responseStatus === 201,
    );

    const response = await requestThroughProxy(
      endpoint,
      `http://127.0.0.1:${targetPort}/capture?value=1`,
      {
        method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "synthetic-test",
      },
        body: '{"hello":"world"}',
      },
    );
    expect(response.status).toBe(201);
    expect(response.headers["x-test"]).toBe("captured");
    expect(JSON.parse(response.body)).toEqual({
      method: "POST",
      body: '{"hello":"world"}',
    });
    const entry = await captured;
    expect(entry.method).toBe("POST");
    expect(entry.requestHeaders).toContainEqual(["x-request-id", "synthetic-test"]);
    expect(entry.requestBody).toBe('{"hello":"world"}');
    expect(entry.responseHeaders).toContainEqual(["content-type", "application/json"]);
    expect(entry.responseBody).toContain('"body":"{\\"hello\\":\\"world\\"}"');
    expect(entry.requestSize).toBe(17);
    expect(entry.responseStatus).toBe(201);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("caps captured response bodies while forwarding the complete response", async () => {
    const largeBody = "a".repeat(70 * 1024);
    targetServer = createHttpServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(largeBody);
    });
    const targetPort = await listen(targetServer);
    proxy = new NetworkInspectorProxy(() => {});
    const status = await proxy.start();
    if (!status.endpoint) throw new Error("Proxy endpoint was not assigned");
    const captured = waitForCapture(proxy, (entry) =>
      entry.url.includes("/large") && entry.durationMs !== undefined,
    );
    const response = await requestThroughProxy(
      status.endpoint,
      `http://127.0.0.1:${targetPort}/large`,
    );
    expect(response.body.length).toBe(largeBody.length);
    const entry = await captured;
    expect(entry.responseSize).toBe(largeBody.length);
    expect(entry.responseBody.length).toBeLessThan(largeBody.length);
    expect(entry.responseBody).toContain("Capture truncated at 65536 bytes");
  });

  it("does not restore in-flight requests after clearing the session", async () => {
    targetServer = createHttpServer((_request, response) => {
      setTimeout(() => response.end("done"), 30);
    });
    const targetPort = await listen(targetServer);
    proxy = new NetworkInspectorProxy(() => {});
    const status = await proxy.start();
    if (!status.endpoint) throw new Error("Proxy endpoint was not assigned");
    const requestPromise = requestThroughProxy(
      status.endpoint,
      `http://127.0.0.1:${targetPort}/slow`,
    );
    const firstUpdate = waitForCapture(proxy, (entry) => entry.url.endsWith("/slow"));
    await firstUpdate;
    expect(proxy.clear()).toBe(1);
    await requestPromise;
    expect(proxy.requests()).toEqual([]);
  });

  it("returns an explicit gateway error and records upstream connection failures", async () => {
    proxy = new NetworkInspectorProxy(() => {});
    const status = await proxy.start();
    if (!status.endpoint) throw new Error("Proxy endpoint was not assigned");
    const captured = waitForCapture(proxy, (entry) =>
      entry.url.includes(":1/unavailable") && Boolean(entry.error),
    );
    const response = await requestThroughProxy(
      status.endpoint,
      "http://127.0.0.1:1/unavailable",
    );
    expect(response.status).toBe(502);
    expect(response.body).toContain("Proxy connection failed");
    expect((await captured).error).toBeTruthy();
  });

  it("supports repeat starts without creating a second listening proxy", async () => {
    proxy = new NetworkInspectorProxy(() => {});
    const first = await proxy.start();
    const second = await proxy.start();
    expect(first).toEqual(second);
  });

  it("retrieves the actual nonzero port allocated for port zero and stops cleanly", async () => {
    proxy = new NetworkInspectorProxy(() => {});
    const started = await proxy.start(0, "127.0.0.1");
    expect(started.state).toBe("listening");
    expect(started.port).toBeGreaterThan(0);
    expect(started.bindAddress).toBe("127.0.0.1");

    const stopped = await proxy.stop();
    expect(stopped.state).toBe("stopped");
    expect(stopped.port).toBeUndefined();
    expect((await proxy.start(0, "127.0.0.1")).port).toBeGreaterThan(0);
  });

  it("rejects wildcard bind addresses and refuses connectivity tests on loopback", async () => {
    proxy = new NetworkInspectorProxy(() => {});
    await expect(proxy.start(0, "0.0.0.0")).rejects.toThrow("bind address");
    await proxy.start(0, "127.0.0.1");
    expect(() => proxy?.beginConnectivityTest()).toThrow("loopback-only");
  });

  it("allows LAN binding only to an enumerated interface address", () => {
    expect(isValidProxyBindAddress("127.0.0.1", ["192.168.1.10"])).toBe(true);
    expect(isValidProxyBindAddress("192.168.1.10", ["192.168.1.10"])).toBe(true);
    expect(isValidProxyBindAddress("192.168.1.11", ["192.168.1.10"])).toBe(false);
    expect(isValidProxyBindAddress("0.0.0.0", ["192.168.1.10"])).toBe(false);
    expect(isValidProxyBindAddress(1234, ["192.168.1.10"])).toBe(false);
  });

  it("reports a failed mobile connectivity check when the proxy is stopped", async () => {
    proxy = new NetworkInspectorProxy(() => {});
    expect(() => proxy?.beginConnectivityTest()).toThrow("Start the proxy");
  });

  it("reports a timeout when no mobile proxy probe reaches the LAN listener", async () => {
    const lanAddress = Object.values(networkInterfaces())
      .flatMap((addresses) => addresses ?? [])
      .find((address) => !address.internal && address.family === "IPv4")
      ?.address;
    if (!lanAddress) return;
    proxy = new NetworkInspectorProxy(() => {});
    await proxy.start(0, lanAddress);
    vi.useFakeTimers();
    try {
      expect(proxy.beginConnectivityTest().connectivityTest).toBe("waiting");
      vi.advanceTimersByTime(60_000);
      expect(proxy.status().connectivityTest).toBe("failed");
      expect(proxy.status().connectivityTestMessage).toContain("No test request reached");
    } finally {
      vi.useRealTimers();
    }
  });

  it("verifies a mobile proxy connectivity request locally without an external service", async () => {
    const lanAddress = Object.values(networkInterfaces())
      .flatMap((addresses) => addresses ?? [])
      .find((address) =>
        !address.internal &&
        address.family === "IPv4" &&
        !address.address.startsWith("169.254."),
      )?.address;
    if (!lanAddress) return;
    proxy = new NetworkInspectorProxy(() => {});
    const status = await proxy.start(0, lanAddress);
    if (!status.endpoint || !status.port) throw new Error("LAN proxy did not bind");
    expect(proxy.beginConnectivityTest().connectivityTest).toBe("waiting");

    const response = await requestThroughProxy(
      status.endpoint,
      "http://192.0.2.1/__developer-utility-connectivity-check",
    );
    expect(response.status).toBe(200);
    expect(response.body).toContain("connectivity check passed");
    expect(proxy.status().connectivityTest).toBe("passed");
    expect(proxy.status().connectivityTestAt).toBeTruthy();

    await proxy.stop();
    const reset = await proxy.start(0, "127.0.0.1");
    expect(reset.state).toBe("listening");
    expect(reset.bindAddress).toBe("127.0.0.1");
    expect(reset.connectivityTest).toBe("not-started");
  });

  it("reports an occupied port instead of crashing", async () => {
    occupiedServer = createHttpServer();
    const port = await listen(occupiedServer);
    proxy = new NetworkInspectorProxy(() => {});
    const status = await proxy.start(port);
    expect(status.state).toBe("error");
    expect(status.message).toContain("address already in use");
  });

  it("tunnels CONNECT traffic without decrypting it", async () => {
    tcpServer = createTcpServer((socket) => {
      socket.on("data", (chunk) => socket.write(`echo:${chunk.toString("utf8")}`));
    });
    const targetPort = await listen(tcpServer);
    proxy = new NetworkInspectorProxy(() => {});
    const status = await proxy.start();
    if (!status.port) throw new Error("Proxy endpoint was not assigned");
    const captured = waitForCapture(proxy, (entry) =>
      entry.method === "CONNECT" && entry.responseStatus === 200,
    );
    const responseText = await new Promise<string>((resolve, reject) => {
      const socket = connectTcp(status.port!, "127.0.0.1");
      let received = "";
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Timed out waiting for CONNECT tunnel response"));
      }, 3000);
      socket.on("connect", () => {
        socket.write(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`);
      });
      socket.on("data", (chunk) => {
        received += chunk.toString("utf8");
        if (received.includes("\r\n\r\n") && !received.includes("echo:ping")) {
          socket.write("ping");
        }
        if (received.includes("echo:ping")) {
          clearTimeout(timer);
          socket.destroy();
          resolve(received);
        }
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    expect(responseText).toContain("200 Connection Established");
    expect(responseText).toContain("echo:ping");
    const entry = await captured;
    expect(entry.protocol).toBe("https-tunnel");
    expect(entry.url).toContain(`127.0.0.1:${targetPort}`);
    expect(entry.responseBody).toBe("");
  });
});
