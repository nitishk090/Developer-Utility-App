import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import httpProxy from "http-proxy";
import { connect, isIP, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Duplex } from "node:stream";
import type {
  Header,
  NetworkCaptureEntry,
  NetworkCaptureStatus,
} from "../types";

const MAX_ENTRIES = 1000;
const MAX_CAPTURED_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const CONNECTIVITY_TEST_TIMEOUT_MS = 60_000;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function isValidProxyBindAddress(
  bindAddress: unknown,
  lanAddresses: string[],
): bindAddress is string {
  return bindAddress === "127.0.0.1" ||
    (typeof bindAddress === "string" && lanAddresses.includes(bindAddress));
}

function headersFromRaw(rawHeaders: string[]): Header[] {
  const headers: Header[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    headers.push([rawHeaders[index], rawHeaders[index + 1] ?? ""]);
  }
  return headers;
}

function headersFromObject(headers: IncomingHttpHeaders): Header[] {
  return Object.entries(headers).flatMap(([name, value]) =>
    value === undefined
      ? []
      : (Array.isArray(value) ? value : [value]).map(
          (headerValue) => [name, headerValue] as Header,
        ),
  );
}

function isTextContentType(contentType: string | undefined): boolean {
  return Boolean(
    contentType &&
      (/^text\//i.test(contentType) ||
        /^application\/(json|[^;]+\+json|xml|[^;]+\+xml|javascript|x-www-form-urlencoded)/i.test(
          contentType,
        )),
  );
}

function displayBody(
  chunks: Buffer[],
  capturedBytes: number,
  totalBytes: number,
  contentType: string | undefined,
): string {
  if (!isTextContentType(contentType)) {
    return totalBytes > 0 ? `[Binary data: ${totalBytes} bytes]` : "";
  }
  const body = Buffer.concat(chunks, capturedBytes).toString("utf8");
  return totalBytes > capturedBytes
    ? `${body}\n[Capture truncated at ${MAX_CAPTURED_BODY_BYTES} bytes]`
    : body;
}

function forwardHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const connectionTokens = (headers.connection ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const blocked = new Set([...HOP_BY_HOP_HEADERS, ...connectionTokens]);
  return Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      value === undefined || blocked.has(name.toLowerCase())
        ? []
        : [[name, value]],
    ),
  );
}

interface CaptureContext {
  entry: NetworkCaptureEntry;
  generation: number;
  startedAt: number;
  requestChunks: Buffer[];
  capturedRequestBytes: number;
  requestBytes: number;
  finalized: boolean;
  finalize(error?: string): void;
}

export class NetworkInspectorProxy {
  private server?: Server;
  private proxyEngine?: httpProxy;
  private starting?: Promise<NetworkCaptureStatus>;
  private readonly sockets = new Set<Socket>();
  private readonly listeners = new Set<(request: NetworkCaptureEntry) => void>();
  private contexts = new WeakMap<IncomingMessage, CaptureContext>();
  private generation = 0;
  private entries: NetworkCaptureEntry[] = [];
  private statusValue: NetworkCaptureStatus = {
    state: "stopped",
    connectivityTest: "not-started",
  };
  private connectivityTestRequested = false;
  private lastConnectivityTestAt?: string;
  private connectivityTestTimer?: ReturnType<typeof setTimeout>;

  constructor(
    onRequest: (request: NetworkCaptureEntry) => void,
  ) {
    this.listeners.add(onRequest);
  }

  subscribe(listener: (request: NetworkCaptureEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status(): NetworkCaptureStatus {
    return {
      ...this.statusValue,
      ...(this.lastConnectivityTestAt
        ? { connectivityTestAt: this.lastConnectivityTestAt }
        : {}),
    };
  }

  requests(): NetworkCaptureEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      requestHeaders: [...entry.requestHeaders],
      responseHeaders: [...entry.responseHeaders],
    }));
  }

  clear(): number {
    const cleared = this.entries.length;
    this.entries = [];
    this.generation += 1;
    return cleared;
  }

  async start(port = 0, bindAddress = "127.0.0.1"): Promise<NetworkCaptureStatus> {
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error("Proxy port must be an integer between 0 and 65535");
    }
    if (
      isIP(bindAddress) === 0 ||
      bindAddress === "0.0.0.0" ||
      bindAddress === "::"
    ) {
      throw new Error("Proxy bind address must be loopback or a validated local interface address");
    }
    if (this.server?.listening) {
      if (
        this.statusValue.bindAddress === bindAddress &&
        (port === 0 || this.statusValue.port === port)
      ) return this.status();
      return {
        ...this.status(),
        state: "error",
        message: "Stop the current proxy before changing its bind address or port",
      };
    }
    if (this.starting) return this.starting;
    this.connectivityTestRequested = false;
    clearTimeout(this.connectivityTestTimer);
    this.connectivityTestTimer = undefined;
    this.lastConnectivityTestAt = undefined;
    this.statusValue = {
      state: "starting",
      host: bindAddress,
      bindAddress,
      port: port || undefined,
      connectivityTest: "not-started",
    };
    this.starting = this.listen(port, bindAddress);
    try {
      return await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  async stop(): Promise<NetworkCaptureStatus> {
    if (this.starting) await this.starting;
    const server = this.server;
    this.server = undefined;
    this.proxyEngine = undefined;
    this.connectivityTestRequested = false;
    clearTimeout(this.connectivityTestTimer);
    this.connectivityTestTimer = undefined;
    this.statusValue = { state: "stopped", connectivityTest: "not-started" };
    if (server) {
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server.closeAllConnections();
      for (const socket of this.sockets) socket.destroy();
      this.sockets.clear();
      await closed;
    }
    return this.status();
  }

  beginConnectivityTest(): NetworkCaptureStatus {
    if (!this.server?.listening || this.statusValue.state !== "listening") {
      throw new Error("Start the proxy before testing mobile connectivity");
    }
    if (
      this.statusValue.bindAddress?.startsWith("127.") ||
      this.statusValue.bindAddress === "::1"
    ) {
      throw new Error("The proxy is loopback-only; enable LAN access before testing a phone");
    }
    this.connectivityTestRequested = true;
    this.lastConnectivityTestAt = undefined;
    this.statusValue.connectivityTest = "waiting";
    delete this.statusValue.connectivityTestAt;
    delete this.statusValue.connectivityTestMessage;
    clearTimeout(this.connectivityTestTimer);
    this.connectivityTestTimer = setTimeout(() => {
      if (!this.connectivityTestRequested) return;
      this.connectivityTestRequested = false;
      this.statusValue.connectivityTest = "failed";
      this.statusValue.connectivityTestMessage =
        "No test request reached the proxy before timeout. Confirm the phone and PC share a LAN, check the PC firewall, and verify the saved Wi-Fi proxy address and port.";
      this.connectivityTestTimer = undefined;
    }, CONNECTIVITY_TEST_TIMEOUT_MS);
    return this.status();
  }

  private async listen(port: number, bindAddress: string): Promise<NetworkCaptureStatus> {
    const server = createServer((request, response) => {
      this.handleHttpRequest(request, response);
    });
    const proxyEngine = httpProxy.createProxyServer({});
    this.proxyEngine = proxyEngine;
    this.contexts = new WeakMap();
    proxyEngine.on("proxyRes", (incomingResponse, request, response) => {
      this.handleProxyResponse(
        incomingResponse as IncomingMessage,
        request,
        response,
      );
    });
    this.server = server;
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
    });
    server.on("connect", (request, socket, head) => {
      this.handleConnect(request, socket, head);
    });
    server.on("upgrade", (_request, socket) => {
      socket.end(
        "HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\nWebSocket capture is not supported",
      );
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const onInitialError = (error: Error) => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener("error", onInitialError);
          resolve();
        };
        server.once("error", onInitialError);
        server.once("listening", onListening);
        server.listen(port, bindAddress);
      });
      server.on("error", (error) => {
        this.statusValue = {
          state: "error",
          host: bindAddress,
          bindAddress,
          port: this.statusValue.port,
          connectivityTest: this.statusValue.connectivityTest,
          message: error.message,
        };
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("The proxy did not bind to a TCP address");
      }
      this.statusValue = {
        state: "listening",
        host: bindAddress,
        bindAddress,
        port: address.port,
        endpoint: `http://${bindAddress.includes(":") ? `[${bindAddress}]` : bindAddress}:${address.port}`,
        connectivityTest: "not-started",
        message: "HTTP forwarding and HTTPS CONNECT tunneling are active",
      };
    } catch (error) {
      this.server = undefined;
      this.proxyEngine = undefined;
      this.statusValue = {
        state: "error",
        host: bindAddress,
        bindAddress,
        port,
        connectivityTest: "not-started",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    return this.status();
  }

  private createEntry(
    request: IncomingMessage,
    method: string,
    url: URL,
    protocol: NetworkCaptureEntry["protocol"],
  ): NetworkCaptureEntry {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      method,
      url: url.toString(),
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      queryParams: url.search,
      protocol,
      requestHeaders: headersFromRaw(request.rawHeaders),
      requestBody: "",
      responseHeaders: [],
      responseBody: "",
      requestSize: 0,
      responseSize: 0,
      contentType: undefined,
    };
  }

  private saveEntry(entry: NetworkCaptureEntry): void {
    const existing = this.entries.findIndex((item) => item.id === entry.id);
    if (existing >= 0) this.entries[existing] = entry;
    else this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    for (const listener of this.listeners) listener({ ...entry });
  }

  private handleHttpRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    let target: URL;
    try {
      target = new URL(
        request.url ?? "",
        `http://${request.headers.host ?? ""}`,
      );
    } catch {
      response.writeHead(400).end("Invalid proxy request URL");
      return;
    }
    if (
      this.connectivityTestRequested &&
      request.method === "GET" &&
      target.pathname === "/__developer-utility-connectivity-check"
    ) {
      this.connectivityTestRequested = false;
      clearTimeout(this.connectivityTestTimer);
      this.connectivityTestTimer = undefined;
      this.lastConnectivityTestAt = new Date().toISOString();
      this.statusValue.connectivityTest = "passed";
      this.statusValue.connectivityTestAt = this.lastConnectivityTestAt;
      delete this.statusValue.connectivityTestMessage;
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      }).end("Developer Utility mobile proxy connectivity check passed");
      return;
    }
    if (
      target.protocol !== "http:" ||
      !target.hostname ||
      target.username ||
      target.password
    ) {
      response.writeHead(400).end("Only plain HTTP proxy requests are supported; use CONNECT for HTTPS");
      return;
    }

    const startedAt = performance.now();
    const entry = this.createEntry(request, request.method ?? "GET", target, "http");
    const context: CaptureContext = {
      entry,
      generation: this.generation,
      startedAt,
      requestChunks: [],
      capturedRequestBytes: 0,
      requestBytes: 0,
      finalized: false,
      finalize: () => {},
    };
    context.finalize = (error?: string) => {
      if (context.finalized) return;
      context.finalized = true;
      if (context.generation !== this.generation) return;
      entry.requestSize = context.requestBytes;
      entry.requestBody = displayBody(
        context.requestChunks,
        context.capturedRequestBytes,
        context.requestBytes,
        request.headers["content-type"],
      );
      entry.durationMs = Math.round(performance.now() - startedAt);
      if (error) entry.error = error;
      this.saveEntry(entry);
    };
    this.contexts.set(request, context);
    this.saveEntry(entry);

    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      context.requestBytes += buffer.length;
      const remaining = MAX_CAPTURED_BODY_BYTES - context.capturedRequestBytes;
      if (remaining > 0) {
        const captured = buffer.subarray(0, remaining);
        context.requestChunks.push(captured);
        context.capturedRequestBytes += captured.length;
      }
    });
    request.once("aborted", () => context.finalize("Client aborted the request"));

    request.headers = forwardHeaders(request.headers);
    request.url = `${target.pathname}${target.search}`;
    const proxyEngine = this.proxyEngine;
    if (!proxyEngine) {
      context.finalize("Proxy engine is unavailable");
      response.writeHead(503).end("Proxy engine is unavailable");
      return;
    }
    proxyEngine.web(
      request,
      response,
      {
        target: target.origin,
        changeOrigin: true,
        selfHandleResponse: true,
        proxyTimeout: UPSTREAM_TIMEOUT_MS,
      },
      (error) => {
        if (!error) return;
        context.finalize(error.message);
        if (!response.headersSent && !response.destroyed) {
          response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
          response.end(`Proxy connection failed: ${error.message}`);
        } else if (!response.destroyed) {
          response.destroy(error);
        }
      },
    );
    response.once("close", () => {
      if (!response.writableEnded && !request.destroyed) {
        context.finalize("Client closed the response");
        request.destroy();
      }
    });
  }

  private handleProxyResponse(
    upstreamResponse: IncomingMessage,
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    const context = this.contexts.get(request);
    if (!context) {
      upstreamResponse.destroy();
      response.writeHead(500).end("Capture context unavailable");
      return;
    }
    const { entry } = context;
    entry.responseStatus = upstreamResponse.statusCode;
    entry.responseHeaders = headersFromObject(upstreamResponse.headers);
    entry.contentType =
      typeof upstreamResponse.headers["content-type"] === "string"
        ? upstreamResponse.headers["content-type"]
        : undefined;
    const responseChunks: Buffer[] = [];
    let capturedResponseBytes = 0;
    let responseBytes = 0;
    upstreamResponse.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      responseBytes += buffer.length;
      const remaining = MAX_CAPTURED_BODY_BYTES - capturedResponseBytes;
      if (remaining > 0) {
        const captured = buffer.subarray(0, remaining);
        responseChunks.push(captured);
        capturedResponseBytes += captured.length;
      }
    });
    upstreamResponse.once("end", () => {
      entry.responseSize = responseBytes;
      entry.responseBody = displayBody(
        responseChunks,
        capturedResponseBytes,
        responseBytes,
        entry.contentType,
      );
      context.finalize();
    });
    upstreamResponse.once("error", (error) => {
      context.finalize(`Upstream response failed: ${error.message}`);
      response.destroy(error);
    });
    if (response.destroyed) {
      context.finalize("Client closed the response");
      upstreamResponse.destroy();
      return;
    }
    response.writeHead(
      upstreamResponse.statusCode ?? 502,
      upstreamResponse.statusMessage,
      forwardHeaders(upstreamResponse.headers),
    );
    upstreamResponse.pipe(response);
  }

  private handleConnect(
    request: IncomingMessage,
    clientSocket: Duplex,
    head: Buffer,
  ): void {
    let target: URL;
    try {
      target = new URL(`http://${request.url ?? ""}`);
    } catch {
      clientSocket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      return;
    }
    const port = Number(target.port || 443);
    if (!target.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
      clientSocket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      return;
    }
    const hostname = target.hostname.replace(/^\[|\]$/g, "");

    const entry = this.createEntry(
      request,
      "CONNECT",
      new URL(`https://${target.hostname}:${port}`),
      "https-tunnel",
    );
    const startedAt = performance.now();
    const generation = this.generation;
    let connected = false;
    let finalized = false;
    this.saveEntry(entry);
    const upstreamSocket = connect(port, hostname);
    this.sockets.add(upstreamSocket);
    upstreamSocket.once("close", () => this.sockets.delete(upstreamSocket));
    const connectTimer = setTimeout(
      () => upstreamSocket.destroy(new Error("CONNECT target timed out")),
      UPSTREAM_TIMEOUT_MS,
    );

    const finalize = (error?: string) => {
      if (finalized) return;
      finalized = true;
      if (generation !== this.generation) return;
      entry.durationMs = Math.round(performance.now() - startedAt);
      if (connected) entry.responseStatus = 200;
      if (error) entry.error = error;
      this.saveEntry(entry);
    };

    upstreamSocket.once("connect", () => {
      clearTimeout(connectTimer);
      connected = true;
      entry.responseStatus = 200;
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstreamSocket.write(head);
      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
    });
    upstreamSocket.once("error", (error) => {
      clearTimeout(connectTimer);
      finalize(error.message);
      if (!connected) {
        clientSocket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      } else {
        clientSocket.destroy(error);
      }
    });
    clientSocket.once("error", (error) => finalize(error.message));
    clientSocket.once("close", () => {
      finalize();
      upstreamSocket.destroy();
    });
    upstreamSocket.once("close", () => finalize());
  }
}
