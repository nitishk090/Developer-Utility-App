import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  net,
} from "electron";
import path from "node:path";
import { HttpToolkitBridge } from "./services/httpToolkitBridge";
import {
  BridgeStatus,
  HttpRequestInput,
  HttpResponseResult,
  LiveRequest,
} from "./types";

let windowRef: BrowserWindow | undefined;
let bridge: HttpToolkitBridge | undefined;
let status: BridgeStatus = { state: "stopped" };
const appIconPath = path.join(
  app.getAppPath(),
  "build",
  "icons",
  "icon.ico",
);
const appIcon = nativeImage.createFromPath(appIconPath);
const publishRequest = (request: LiveRequest) =>
  windowRef?.webContents.send("bridge:request", request);
const bridgeStatus = (): BridgeStatus => status;
const REQUEST_TIMEOUT_MS = 30000;
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const failedRequest = (error: string): HttpResponseResult => ({
  ok: false,
  status: 0,
  statusText: "",
  headers: [],
  body: "",
  error,
});
/**
 * Performs an HTTP request from the main process via Electron's net module.
 * Unlike fetch() in the renderer, this network stack is not subject to CORS,
 * so the API Tester can reach any endpoint from both the dev server and the
 * packaged (file://) app. It resolves with a structured result instead of
 * rejecting so the renderer can always render status information.
 */
function sendHttpRequest(input: HttpRequestInput): Promise<HttpResponseResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: Electron.ClientRequest | undefined;
    const finish = (result: HttpResponseResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    timer = setTimeout(() => {
      request?.abort();
      finish(
        failedRequest(
          `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`,
        ),
      );
    }, REQUEST_TIMEOUT_MS);
    try {
      request = net.request({ method: input.method, url: input.url });
    } catch (error) {
      finish(failedRequest(`Invalid request URL: ${(error as Error).message}`));
      return;
    }
    request.on("error", (error) => finish(failedRequest(error.message)));
    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
      });
      response.on("error", (error: Error) =>
        finish(failedRequest(error.message)),
      );
      response.on("end", () => {
        const headers = Object.entries(response.headers).flatMap(
          ([key, value]) =>
            Array.isArray(value)
              ? value.map((entry) => `${key}: ${entry}`)
              : [`${key}: ${value}`],
        );
        finish({
          ok: true,
          status: response.statusCode ?? 0,
          statusText: response.statusMessage ?? "",
          headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    for (const [key, value] of Object.entries(input.headers ?? {})) {
      try {
        request.setHeader(key, value);
      } catch {
        // Skip headers the network stack refuses to set.
      }
    }
    if (input.body && !BODYLESS_METHODS.has(input.method.toUpperCase())) {
      request.write(input.body, "utf8");
    }
    request.end();
  });
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
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", () => {
  void bridge?.stop();
});
