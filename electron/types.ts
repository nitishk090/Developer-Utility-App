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
}
