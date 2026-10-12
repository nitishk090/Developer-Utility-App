"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_perf_hooks_1 = require("node:perf_hooks");
const httpToolkitBridge_1 = require("./services/httpToolkitBridge");
const httpRequest_1 = require("./services/httpRequest");
let windowRef;
let bridge;
let status = { state: "stopped" };
const appIconPath = node_path_1.default.join(electron_1.app.getAppPath(), "build", "icons", "icon.ico");
const appIcon = electron_1.nativeImage.createFromPath(appIconPath);
const publishRequest = (request) => windowRef?.webContents.send("bridge:request", request);
const publishHttpLog = (log) => windowRef?.webContents.send("http:log", log);
const bridgeStatus = () => status;
const REQUEST_TIMEOUT_MS = 30000;
const failedRequest = (error) => ({
    ok: false,
    status: 0,
    statusText: "",
    headers: [],
    body: "",
    error,
});
function redactRequestUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.username)
            url.username = "[REDACTED]";
        if (url.password)
            url.password = "[REDACTED]";
        for (const key of url.searchParams.keys()) {
            if (/(^key$|token|secret|password|authorization|signature)/i.test(key)) {
                url.searchParams.set(key, "[REDACTED]");
            }
        }
        return url.toString();
    }
    catch {
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
async function sendHttpRequest(input) {
    const startedAt = node_perf_hooks_1.performance.now();
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
    let result;
    try {
        result = await (0, httpRequest_1.performHttpRequest)(input, controller.signal);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const cause = error instanceof Error && error.cause instanceof Error
            ? `: ${error.cause.message}`
            : "";
        result = failedRequest(controller.signal.aborted
            ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`
            : `${message}${cause}`);
    }
    finally {
        clearTimeout(timer);
    }
    const durationMs = Math.round(node_perf_hooks_1.performance.now() - startedAt);
    if (result.error) {
        console.error(`[network] !! ${method} ${requestUrl} (${durationMs} ms): ${result.error}`);
    }
    else {
        console.info(`[network] <-- ${method} ${requestUrl} ${result.status} ${result.statusText} (${durationMs} ms)`);
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
function createWindow() {
    windowRef = new electron_1.BrowserWindow({
        width: 1280,
        height: 760,
        minWidth: 640,
        minHeight: 420,
        backgroundColor: "#0B0D0F",
        icon: appIcon,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: node_path_1.default.join(__dirname, "preload.js"),
        },
    });
    windowRef.setIcon(appIcon);
    if (!electron_1.app.isPackaged)
        void windowRef.loadURL("http://localhost:5173");
    else
        void windowRef.loadFile(node_path_1.default.join(__dirname, "../dist/index.html"));
}
electron_1.app.setName("Developer Utility");
electron_1.app.whenReady().then(() => {
    electron_1.ipcMain.handle("app:mode", () => process.env.DEVELOPER_UTILITY_MODE === "development" ? "development" : "normal");
    electron_1.ipcMain.handle("app:reload", () => {
        if (!windowRef)
            return false;
        windowRef.reload();
        return true;
    });
    electron_1.ipcMain.handle("clipboard:copy", (_event, text) => {
        electron_1.clipboard.writeText(text);
        return true;
    });
    electron_1.ipcMain.handle("clipboard:read", () => electron_1.clipboard.readText());
    electron_1.ipcMain.handle("files:open", async () => {
        const result = await electron_1.dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "Text", extensions: ["txt", "json", "sql", "sh"] }],
        });
        if (result.canceled)
            return null;
        return (await Promise.resolve().then(() => __importStar(require("node:fs/promises")))).readFile(result.filePaths[0], "utf8");
    });
    electron_1.ipcMain.handle("files:save", async (_event, content, extension) => {
        const result = await electron_1.dialog.showSaveDialog({
            defaultPath: `output${extension}`,
        });
        if (result.canceled || !result.filePath)
            return false;
        await (await Promise.resolve().then(() => __importStar(require("node:fs/promises")))).writeFile(result.filePath, content, "utf8");
        return true;
    });
    electron_1.ipcMain.handle("bridge:start", async () => {
        bridge ??= new httpToolkitBridge_1.HttpToolkitBridge(publishRequest);
        try {
            status = {
                state: "listening",
                endpoint: await bridge.start(),
                message: "Waiting for an authenticated local integration",
            };
        }
        catch {
            status = { state: "error", message: "Unable to start the local bridge" };
        }
        return status;
    });
    electron_1.ipcMain.handle("bridge:stop", async () => {
        await bridge?.stop();
        bridge = undefined;
        status = { state: "stopped" };
        return status;
    });
    electron_1.ipcMain.handle("bridge:status", bridgeStatus);
    electron_1.ipcMain.handle("http:request", (_event, input) => sendHttpRequest(input));
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
electron_1.app.on("before-quit", () => {
    void bridge?.stop();
});
