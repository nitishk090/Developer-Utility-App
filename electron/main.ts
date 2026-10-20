import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  nativeImage,
} from "electron";
import path from "node:path";
import { networkInterfaces } from "node:os";
import { performance } from "node:perf_hooks";
import { HttpToolkitBridge } from "./services/httpToolkitBridge";
import { performHttpRequest } from "./services/httpRequest";
import {
  isValidProxyBindAddress,
  NetworkInspectorProxy,
} from "./services/networkInspectorProxy";
import {
  BridgeStatus,
  HttpRequestInput,
  HttpRequestLog,
  HttpResponseResult,
  LiveRequest,
} from "./types";

let windowRef: BrowserWindow | undefined;
let bridge: HttpToolkitBridge | undefined;
let status: BridgeStatus = { state: "stopped" };
let isQuitting = false;
const networkInspector = new NetworkInspectorProxy((request) =>
  windowRef?.webContents.send("network-inspector:request", request),
);
const appIconPath = path.join(
  app.getAppPath(),
  "build",
  "icons",
  "icon.ico",
);
const appIcon = nativeImage.createFromPath(appIconPath);
const publishRequest = (request: LiveRequest) =>
  windowRef?.webContents.send("bridge:request", request);
const publishHttpLog = (log: HttpRequestLog) =>
  windowRef?.webContents.send("http:log", log);
const bridgeStatus = (): BridgeStatus => status;
const REQUEST_TIMEOUT_MS = 30000;
function getLanIpv4Addresses(): string[] {
  return [...new Set(
    Object.values(networkInterfaces())
      .flatMap((addresses) => addresses ?? [])
      .filter((address) =>
        !address.internal &&
        address.family === "IPv4" &&
        !address.address.startsWith("169.254."),
      )
      .map((address) => address.address),
  )];
}
const failedRequest = (error: string): HttpResponseResult => ({
  ok: false,
  status: 0,
  statusText: "",
  headers: [],
  body: "",
  error,
});
function redactRequestUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = "[REDACTED]";
    if (url.password) url.password = "[REDACTED]";
    for (const key of url.searchParams.keys()) {
      if (/(^key$|token|secret|password|authorization|signature)/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return rawUrl.split("?")[0];
  }
}
/**
 * Performs an HTTP request from the main process via Electron's net module.
 * Unlike fetch() in the renderer, this network stack is not subject to CORS,
 * so the API Tester can reach any endpoint from both the dev server and the
 * packaged (file://) app. It resolves with a structured result instead of
 * rejecting so the renderer can always render status information.
 */
async function sendHttpRequest(input: HttpRequestInput): Promise<HttpResponseResult> {
  const startedAt = performance.now();
  const requestHeaders = input.headers ?? {};
  const method = input.method.toUpperCase();
  const requestUrl = redactRequestUrl(input.url);
  console.info(`[network] --> ${method} ${requestUrl}`);
  publishHttpLog({
    phase: "request",
    method,
    url: input.url,
    requestHeaders,
    requestBody: input.body ?? "",
    durationMs: 0,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let result: HttpResponseResult;
  try {
    result = await performHttpRequest(input, controller.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause instanceof Error
      ? `: ${error.cause.message}`
      : "";
    result = failedRequest(
      controller.signal.aborted
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`
        : `${message}${cause}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Math.round(performance.now() - startedAt);
  if (result.error) {
    console.error(`[network] !! ${method} ${requestUrl} (${durationMs} ms): ${result.error}`);
  } else {
    console.info(
      `[network] <-- ${method} ${requestUrl} ${result.status} ${result.statusText} (${durationMs} ms)`,
    );
  }
  publishHttpLog({
    phase: result.ok ? "response" : "error",
    method,
    url: input.url,
    requestHeaders,
    requestBody: input.body ?? "",
    status: result.status,
    statusText: result.statusText,
    responseHeaders: result.headers,
    responseBody: result.body,
    durationMs,
    error: result.error,
  });
  return result;
}
function createWindow(): void {
  windowRef = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: "#0B0D0F",
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  windowRef.setIcon(appIcon);
  if (!app.isPackaged) void windowRef.loadURL("http://localhost:5173");
  else void windowRef.loadFile(path.join(__dirname, "../dist/index.html"));
}
app.setName("Developer Utility");
app.whenReady().then(() => {
  ipcMain.handle("app:mode", () =>
    process.env.DEVELOPER_UTILITY_MODE === "development" ? "development" : "normal",
  );
  ipcMain.handle("app:reload", () => {
    if (!windowRef) return false;
    windowRef.reload();
    return true;
  });
  ipcMain.handle("clipboard:copy", (_event, text: string) => {
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle("clipboard:read", () => clipboard.readText());
  ipcMain.handle("files:open", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Text", extensions: ["txt", "json", "sql", "sh"] }],
    });
    if (result.canceled) return null;
    return (await import("node:fs/promises")).readFile(
      result.filePaths[0],
      "utf8",
    );
  });
  ipcMain.handle(
    "files:save",
    async (_event, content: string, extension: string) => {
      const result = await dialog.showSaveDialog({
        defaultPath: `output${extension}`,
      });
      if (result.canceled || !result.filePath) return false;
      await (
        await import("node:fs/promises")
      ).writeFile(result.filePath, content, "utf8");
      return true;
    },
  );
  ipcMain.handle("bridge:start", async () => {
    bridge ??= new HttpToolkitBridge(publishRequest);
    try {
      status = {
        state: "listening",
        endpoint: await bridge.start(),
        message: "Waiting for an authenticated local integration",
      };
    } catch {
      status = { state: "error", message: "Unable to start the local bridge" };
    }
    return status;
  });
  ipcMain.handle("bridge:stop", async () => {
    await bridge?.stop();
    bridge = undefined;
    status = { state: "stopped" };
    return status;
  });
  ipcMain.handle("bridge:status", bridgeStatus);
  ipcMain.handle("http:request", (_event, input: HttpRequestInput) =>
    sendHttpRequest(input),
  );
  const assertTrustedRenderer = (event: IpcMainInvokeEvent) => {
    if (
      !windowRef ||
      event.sender !== windowRef.webContents ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error("Network Inspector IPC is only available to the application window");
    }
    const frameUrl = event.senderFrame.url;
    const trustedFrame = app.isPackaged
      ? frameUrl.startsWith("file://")
      : frameUrl.startsWith("http://localhost:5173/");
    if (!trustedFrame) throw new Error("Network Inspector IPC rejected an untrusted frame");
  };
  ipcMain.handle("network-inspector:start", (event, port?: unknown, bindAddress?: unknown) => {
    assertTrustedRenderer(event);
    if (
      port !== undefined &&
      (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535)
    ) {
      throw new Error("Proxy port must be an integer between 0 and 65535");
    }
    const host = bindAddress === undefined ? "127.0.0.1" : bindAddress;
    if (!isValidProxyBindAddress(host, getLanIpv4Addresses())) {
      throw new Error("Proxy bind address must be loopback or a current local LAN IPv4 address");
    }
    return networkInspector.start(port, host);
  });
  ipcMain.handle("network-inspector:configure-lan", async (event, port: unknown, bindAddress: unknown) => {
    assertTrustedRenderer(event);
    if (
      typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535 ||
      !isValidProxyBindAddress(bindAddress, getLanIpv4Addresses()) ||
      bindAddress === "127.0.0.1"
    ) {
      throw new Error("Select a valid local LAN IPv4 address and proxy port");
    }
    const current = networkInspector.status();
    const requiresRestart = current.state === "listening" &&
      (current.bindAddress !== bindAddress ||
        (port > 0 && current.port !== port));
    if (!(current.state === "listening" && !requiresRestart)) {
      const confirmation = await dialog.showMessageBox(windowRef!, {
        type: "warning",
        buttons: ["Expose proxy on LAN", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Expose HTTP proxy on your local network?",
        message: "Switch the proxy listener to the selected LAN address?",
        detail:
          "This stops the current listener and its active connections. Other devices on your local network may use this unauthenticated proxy while it is listening. Phone proxy settings are not changed automatically.",
      });
      if (confirmation.response !== 0) return current;
    }
    if (requiresRestart) {
      await networkInspector.stop();
    }
    return networkInspector.start(port, bindAddress);
  });
  ipcMain.handle("network-inspector:stop", (event) => {
    assertTrustedRenderer(event);
    return networkInspector.stop();
  });
  ipcMain.handle("network-inspector:status", (event) => {
    assertTrustedRenderer(event);
    return networkInspector.status();
  });
  ipcMain.handle("network-inspector:lan-addresses", (event) => {
    assertTrustedRenderer(event);
    return getLanIpv4Addresses();
  });
  ipcMain.handle("network-inspector:begin-connectivity-test", (event) => {
    assertTrustedRenderer(event);
    return networkInspector.beginConnectivityTest();
  });
  ipcMain.handle("network-inspector:requests", (event) => {
    assertTrustedRenderer(event);
    return networkInspector.requests();
  });
  ipcMain.handle("network-inspector:clear", (event) => {
    assertTrustedRenderer(event);
    return networkInspector.clear();
  });
  createWindow();
});
app.on("window-all-closed", () => {
  windowRef = undefined;
  void networkInspector.stop();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  void Promise.all([
    bridge?.stop(),
    networkInspector.stop(),
  ]).then(
    () => app.quit(),
    (error: unknown) => {
      console.error(
        `Capture shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      app.quit();
    },
  );
});
