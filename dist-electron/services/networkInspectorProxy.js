"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkInspectorProxy = void 0;
exports.isValidProxyBindAddress = isValidProxyBindAddress;
const node_http_1 = require("node:http");
const http_proxy_1 = __importDefault(require("http-proxy"));
const node_net_1 = require("node:net");
const node_crypto_1 = require("node:crypto");
const node_perf_hooks_1 = require("node:perf_hooks");
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
function isValidProxyBindAddress(bindAddress, lanAddresses) {
    return bindAddress === "127.0.0.1" ||
        (typeof bindAddress === "string" && lanAddresses.includes(bindAddress));
}
function headersFromRaw(rawHeaders) {
    const headers = [];
    for (let index = 0; index < rawHeaders.length; index += 2) {
        headers.push([rawHeaders[index], rawHeaders[index + 1] ?? ""]);
    }
    return headers;
}
function headersFromObject(headers) {
    return Object.entries(headers).flatMap(([name, value]) => value === undefined
        ? []
        : (Array.isArray(value) ? value : [value]).map((headerValue) => [name, headerValue]));
}
function isTextContentType(contentType) {
    return Boolean(contentType &&
        (/^text\//i.test(contentType) ||
            /^application\/(json|[^;]+\+json|xml|[^;]+\+xml|javascript|x-www-form-urlencoded)/i.test(contentType)));
}
function displayBody(chunks, capturedBytes, totalBytes, contentType) {
    if (!isTextContentType(contentType)) {
        return totalBytes > 0 ? `[Binary data: ${totalBytes} bytes]` : "";
    }
    const body = Buffer.concat(chunks, capturedBytes).toString("utf8");
    return totalBytes > capturedBytes
        ? `${body}\n[Capture truncated at ${MAX_CAPTURED_BODY_BYTES} bytes]`
        : body;
}
function forwardHeaders(headers) {
    const connectionTokens = (headers.connection ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    const blocked = new Set([...HOP_BY_HOP_HEADERS, ...connectionTokens]);
    return Object.fromEntries(Object.entries(headers).flatMap(([name, value]) => value === undefined || blocked.has(name.toLowerCase())
        ? []
        : [[name, value]]));
}
class NetworkInspectorProxy {
    server;
    proxyEngine;
    starting;
    sockets = new Set();
    listeners = new Set();
    contexts = new WeakMap();
    generation = 0;
    entries = [];
    statusValue = {
        state: "stopped",
        connectivityTest: "not-started",
    };
    connectivityTestRequested = false;
    lastConnectivityTestAt;
    connectivityTestTimer;
    constructor(onRequest) {
        this.listeners.add(onRequest);
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    status() {
        return {
            ...this.statusValue,
            ...(this.lastConnectivityTestAt
                ? { connectivityTestAt: this.lastConnectivityTestAt }
                : {}),
        };
    }
    requests() {
        return this.entries.map((entry) => ({
            ...entry,
            requestHeaders: [...entry.requestHeaders],
            responseHeaders: [...entry.responseHeaders],
        }));
    }
    clear() {
        const cleared = this.entries.length;
        this.entries = [];
        this.generation += 1;
        return cleared;
    }
    async start(port = 0, bindAddress = "127.0.0.1") {
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
            throw new Error("Proxy port must be an integer between 0 and 65535");
        }
        if ((0, node_net_1.isIP)(bindAddress) === 0 ||
            bindAddress === "0.0.0.0" ||
            bindAddress === "::") {
            throw new Error("Proxy bind address must be loopback or a validated local interface address");
        }
        if (this.server?.listening) {
            if (this.statusValue.bindAddress === bindAddress &&
                (port === 0 || this.statusValue.port === port))
                return this.status();
            return {
                ...this.status(),
                state: "error",
                message: "Stop the current proxy before changing its bind address or port",
            };
        }
        if (this.starting)
            return this.starting;
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
        }
        finally {
            this.starting = undefined;
        }
    }
    async stop() {
        if (this.starting)
            await this.starting;
        const server = this.server;
        this.server = undefined;
        this.proxyEngine = undefined;
        this.connectivityTestRequested = false;
        clearTimeout(this.connectivityTestTimer);
        this.connectivityTestTimer = undefined;
        this.statusValue = { state: "stopped", connectivityTest: "not-started" };
        if (server) {
            const closed = new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
            server.closeAllConnections();
            for (const socket of this.sockets)
                socket.destroy();
            this.sockets.clear();
            await closed;
        }
        return this.status();
    }
    beginConnectivityTest() {
        if (!this.server?.listening || this.statusValue.state !== "listening") {
            throw new Error("Start the proxy before testing mobile connectivity");
        }
        if (this.statusValue.bindAddress?.startsWith("127.") ||
            this.statusValue.bindAddress === "::1") {
            throw new Error("The proxy is loopback-only; enable LAN access before testing a phone");
        }
        this.connectivityTestRequested = true;
        this.lastConnectivityTestAt = undefined;
        this.statusValue.connectivityTest = "waiting";
        delete this.statusValue.connectivityTestAt;
        delete this.statusValue.connectivityTestMessage;
        clearTimeout(this.connectivityTestTimer);
        this.connectivityTestTimer = setTimeout(() => {
            if (!this.connectivityTestRequested)
                return;
            this.connectivityTestRequested = false;
            this.statusValue.connectivityTest = "failed";
            this.statusValue.connectivityTestMessage =
                "No test request reached the proxy before timeout. Confirm the phone and PC share a LAN, check the PC firewall, and verify the saved Wi-Fi proxy address and port.";
            this.connectivityTestTimer = undefined;
        }, CONNECTIVITY_TEST_TIMEOUT_MS);
        return this.status();
    }
    async listen(port, bindAddress) {
        const server = (0, node_http_1.createServer)((request, response) => {
            this.handleHttpRequest(request, response);
        });
        const proxyEngine = http_proxy_1.default.createProxyServer({});
        this.proxyEngine = proxyEngine;
        this.contexts = new WeakMap();
        proxyEngine.on("proxyRes", (incomingResponse, request, response) => {
            this.handleProxyResponse(incomingResponse, request, response);
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
            socket.end("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\nWebSocket capture is not supported");
        });
        try {
            await new Promise((resolve, reject) => {
                const onInitialError = (error) => {
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
        }
        catch (error) {
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
    createEntry(request, method, url, protocol) {
        return {
            id: (0, node_crypto_1.randomUUID)(),
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
    saveEntry(entry) {
        const existing = this.entries.findIndex((item) => item.id === entry.id);
        if (existing >= 0)
            this.entries[existing] = entry;
        else
            this.entries.unshift(entry);
        if (this.entries.length > MAX_ENTRIES)
            this.entries.length = MAX_ENTRIES;
        for (const listener of this.listeners)
            listener({ ...entry });
    }
    handleHttpRequest(request, response) {
        let target;
        try {
            target = new URL(request.url ?? "", `http://${request.headers.host ?? ""}`);
        }
        catch {
            response.writeHead(400).end("Invalid proxy request URL");
            return;
        }
        if (this.connectivityTestRequested &&
            request.method === "GET" &&
            target.pathname === "/__developer-utility-connectivity-check") {
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
        if (target.protocol !== "http:" ||
            !target.hostname ||
            target.username ||
            target.password) {
            response.writeHead(400).end("Only plain HTTP proxy requests are supported; use CONNECT for HTTPS");
            return;
        }
        const startedAt = node_perf_hooks_1.performance.now();
        const entry = this.createEntry(request, request.method ?? "GET", target, "http");
        const context = {
            entry,
            generation: this.generation,
            startedAt,
            requestChunks: [],
            capturedRequestBytes: 0,
            requestBytes: 0,
            finalized: false,
            finalize: () => { },
        };
        context.finalize = (error) => {
            if (context.finalized)
                return;
            context.finalized = true;
            if (context.generation !== this.generation)
                return;
            entry.requestSize = context.requestBytes;
            entry.requestBody = displayBody(context.requestChunks, context.capturedRequestBytes, context.requestBytes, request.headers["content-type"]);
            entry.durationMs = Math.round(node_perf_hooks_1.performance.now() - startedAt);
            if (error)
                entry.error = error;
            this.saveEntry(entry);
        };
        this.contexts.set(request, context);
        this.saveEntry(entry);
        request.on("data", (chunk) => {
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
        proxyEngine.web(request, response, {
            target: target.origin,
            changeOrigin: true,
            selfHandleResponse: true,
            proxyTimeout: UPSTREAM_TIMEOUT_MS,
        }, (error) => {
            if (!error)
                return;
            context.finalize(error.message);
            if (!response.headersSent && !response.destroyed) {
                response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
                response.end(`Proxy connection failed: ${error.message}`);
            }
            else if (!response.destroyed) {
                response.destroy(error);
            }
        });
        response.once("close", () => {
            if (!response.writableEnded && !request.destroyed) {
                context.finalize("Client closed the response");
                request.destroy();
            }
        });
    }
    handleProxyResponse(upstreamResponse, request, response) {
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
        const responseChunks = [];
        let capturedResponseBytes = 0;
        let responseBytes = 0;
        upstreamResponse.on("data", (chunk) => {
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
            entry.responseBody = displayBody(responseChunks, capturedResponseBytes, responseBytes, entry.contentType);
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
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.statusMessage, forwardHeaders(upstreamResponse.headers));
        upstreamResponse.pipe(response);
    }
    handleConnect(request, clientSocket, head) {
        let target;
        try {
            target = new URL(`http://${request.url ?? ""}`);
        }
        catch {
            clientSocket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
            return;
        }
        const port = Number(target.port || 443);
        if (!target.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
            clientSocket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
            return;
        }
        const hostname = target.hostname.replace(/^\[|\]$/g, "");
        const entry = this.createEntry(request, "CONNECT", new URL(`https://${target.hostname}:${port}`), "https-tunnel");
        const startedAt = node_perf_hooks_1.performance.now();
        const generation = this.generation;
        let connected = false;
        let finalized = false;
        this.saveEntry(entry);
        const upstreamSocket = (0, node_net_1.connect)(port, hostname);
        this.sockets.add(upstreamSocket);
        upstreamSocket.once("close", () => this.sockets.delete(upstreamSocket));
        const connectTimer = setTimeout(() => upstreamSocket.destroy(new Error("CONNECT target timed out")), UPSTREAM_TIMEOUT_MS);
        const finalize = (error) => {
            if (finalized)
                return;
            finalized = true;
            if (generation !== this.generation)
                return;
            entry.durationMs = Math.round(node_perf_hooks_1.performance.now() - startedAt);
            if (connected)
                entry.responseStatus = 200;
            if (error)
                entry.error = error;
            this.saveEntry(entry);
        };
        upstreamSocket.once("connect", () => {
            clearTimeout(connectTimer);
            connected = true;
            entry.responseStatus = 200;
            clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            if (head.length > 0)
                upstreamSocket.write(head);
            clientSocket.pipe(upstreamSocket);
            upstreamSocket.pipe(clientSocket);
        });
        upstreamSocket.once("error", (error) => {
            clearTimeout(connectTimer);
            finalize(error.message);
            if (!connected) {
                clientSocket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
            }
            else {
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
exports.NetworkInspectorProxy = NetworkInspectorProxy;
