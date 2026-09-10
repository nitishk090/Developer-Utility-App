import { createServer, IncomingMessage, Server } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { HttpExchangeInput, LiveRequest } from "../types";

export class HttpToolkitBridge {
  private server?: Server;
  readonly token = randomUUID();
  readonly port: number;
  constructor(
    private readonly onExchange: (request: LiveRequest) => void,
    port = 0,
  ) {
    this.port = port;
  }
  endpoint(): string | undefined {
    const address = this.server?.address();
    return address && typeof address !== "string"
      ? `http://127.0.0.1:${address.port}/requests`
      : undefined;
  }
  async start(): Promise<string> {
    if (this.server) return this.endpoint()!;
    this.server = createServer((request, response) =>
      this.handle(request, response),
    );
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, "127.0.0.1", resolve);
    });
    return this.endpoint()!;
  }
  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  private handle(
    request: IncomingMessage,
    response: import("node:http").ServerResponse,
  ): void {
    if (
      request.method !== "POST" ||
      request.url !== "/requests" ||
      !this.validToken(request.headers["x-developer-utility-token"])
    ) {
      response.writeHead(401).end("Unauthorized");
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      try {
        const input = JSON.parse(body) as HttpExchangeInput;
        if (!input.url) throw new Error("url is required");
        this.onExchange(this.normalize(input));
        response.writeHead(202).end();
      } catch {
        response.writeHead(400).end("Invalid exchange");
      }
    });
  }
  private validToken(value: string | string[] | undefined): boolean {
    if (typeof value !== "string") return false;
    const actual = Buffer.from(value);
    const expected = Buffer.from(this.token);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
  private normalize(input: HttpExchangeInput): LiveRequest {
    const url = new URL(input.url!);
    return {
      id: randomUUID(),
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
