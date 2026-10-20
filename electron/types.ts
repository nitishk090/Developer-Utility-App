export type Header = [string, string];
export interface LiveRequest {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  hostname: string;
  path: string;
  queryParams: string;
  requestHeaders: Header[];
  requestBody: string;
  responseStatus?: number;
  responseHeaders: Header[];
  responseBody: string;
}
export interface BridgeStatus {
  state: "stopped" | "listening" | "error";
  endpoint?: string;
  message?: string;
}
export interface HttpExchangeInput {
  method?: string;
  url?: string;
  requestHeaders?: Header[];
  requestBody?: string;
  responseStatus?: number;
  responseHeaders?: Header[];
  responseBody?: string;
}
export interface HttpRequestInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}
export interface HttpResponseResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: string[];
  body: string;
  error?: string;
}
export interface HttpRequestLog {
  phase: "request" | "response" | "error";
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  status?: number;
  statusText?: string;
  responseHeaders?: string[];
  responseBody?: string;
  durationMs: number;
  error?: string;
}
export interface NetworkCaptureEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  hostname: string;
  path: string;
  queryParams: string;
  protocol: "http" | "https-tunnel";
  requestHeaders: Header[];
  requestBody: string;
  responseStatus?: number;
  responseHeaders: Header[];
  responseBody: string;
  durationMs?: number;
  requestSize: number;
  responseSize: number;
  contentType?: string;
  error?: string;
}
export interface NetworkCaptureStatus {
  state: "stopped" | "starting" | "listening" | "error";
  host?: string;
  bindAddress?: string;
  port?: number;
  endpoint?: string;
  connectivityTest: "not-started" | "waiting" | "passed" | "failed";
  connectivityTestAt?: string;
  connectivityTestMessage?: string;
  message?: string;
}
export interface NetworkInspectorApi {
  start(port?: number, bindAddress?: string): Promise<NetworkCaptureStatus>;
  configureLan(port: number, bindAddress: string): Promise<NetworkCaptureStatus>;
  stop(): Promise<NetworkCaptureStatus>;
  status(): Promise<NetworkCaptureStatus>;
  lanAddresses(): Promise<string[]>;
  beginConnectivityTest(): Promise<NetworkCaptureStatus>;
  requests(): Promise<NetworkCaptureEntry[]>;
  clear(): Promise<number>;
  onRequest(listener: (request: NetworkCaptureEntry) => void): () => void;
}
export interface DeveloperUtilityApi {
  clipboard: {
    copy(text: string): Promise<boolean>;
    read(): Promise<string>;
  };
  files: {
    open(): Promise<string | null>;
    save(content: string, extension: string): Promise<boolean>;
  };
  http?: {
    request(input: HttpRequestInput): Promise<HttpResponseResult>;
    onLog(listener: (log: HttpRequestLog) => void): () => void;
  };
  runtime: {
    mode(): Promise<"normal" | "development">;
    reload(): Promise<boolean>;
  };
  bridge: {
    start(): Promise<BridgeStatus>;
    stop(): Promise<BridgeStatus>;
    status(): Promise<BridgeStatus>;
    onRequest(listener: (request: LiveRequest) => void): () => void;
  };
  networkInspector: NetworkInspectorApi;
}
