"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpToolkitBridge = void 0;
const node_http_1 = require("node:http");
const node_crypto_1 = require("node:crypto");
class HttpToolkitBridge {
    onExchange;
    server;
    token = (0, node_crypto_1.randomUUID)();
    port;
    constructor(onExchange, port = 0) {
        this.onExchange = onExchange;
        this.port = port;
    }
    endpoint() {
        const address = this.server?.address();
        return address && typeof address !== "string"
            ? `http://127.0.0.1:${address.port}/requests`
            : undefined;
    }
    async start() {
        if (this.server)
            return this.endpoint();
        this.server = (0, node_http_1.createServer)((request, response) => this.handle(request, response));
        await new Promise((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(this.port, "127.0.0.1", resolve);
        });
        return this.endpoint();
    }
    async stop() {
        if (!this.server)
            return;
        const server = this.server;
        this.server = undefined;
        await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    handle(request, response) {
        if (request.method !== "POST" ||
            request.url !== "/requests" ||
            !this.validToken(request.headers["x-developer-utility-token"])) {
            response.writeHead(401).end("Unauthorized");
            return;
        }
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => (body += chunk));
        request.on("end", () => {
            try {
                const input = JSON.parse(body);
                if (!input.url)
                    throw new Error("url is required");
                this.onExchange(this.normalize(input));
                response.writeHead(202).end();
            }
            catch {
                response.writeHead(400).end("Invalid exchange");
            }
        });
    }
    validToken(value) {
        if (typeof value !== "string")
            return false;
        const actual = Buffer.from(value);
        const expected = Buffer.from(this.token);
        return (actual.length === expected.length && (0, node_crypto_1.timingSafeEqual)(actual, expected));
    }
    normalize(input) {
        const url = new URL(input.url);
        return {
            id: (0, node_crypto_1.randomUUID)(),
            timestamp: new Date().toISOString(),
            method: (input.method ?? "GET").toUpperCase(),
            url: url.toString(),
            hostname: url.hostname,
            path: url.pathname,
            queryParams: url.search,
            requestHeaders: input.requestHeaders ?? [],
            requestBody: input.requestBody ?? "",
            responseStatus: input.responseStatus,
            responseHeaders: input.responseHeaders ?? [],
            responseBody: input.responseBody ?? "",
        };
    }
}
exports.HttpToolkitBridge = HttpToolkitBridge;
