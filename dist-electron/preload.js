"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    clipboard: {
        copy: (text) => electron_1.ipcRenderer.invoke("clipboard:copy", text),
        read: () => electron_1.ipcRenderer.invoke("clipboard:read"),
    },
    files: {
        open: () => electron_1.ipcRenderer.invoke("files:open"),
        save: (content, extension) => electron_1.ipcRenderer.invoke("files:save", content, extension),
    },
    runtime: {
        mode: () => electron_1.ipcRenderer.invoke("app:mode"),
        reload: () => electron_1.ipcRenderer.invoke("app:reload"),
    },
    bridge: {
        start: () => electron_1.ipcRenderer.invoke("bridge:start"),
        stop: () => electron_1.ipcRenderer.invoke("bridge:stop"),
        status: () => electron_1.ipcRenderer.invoke("bridge:status"),
        onRequest: (listener) => {
            const handler = (_event, request) => listener(request);
            electron_1.ipcRenderer.on("bridge:request", handler);
            return () => electron_1.ipcRenderer.removeListener("bridge:request", handler);
        },
    },
    networkInspector: {
        start: (port, bindAddress) => electron_1.ipcRenderer.invoke("network-inspector:start", port, bindAddress),
        configureLan: (port, bindAddress) => electron_1.ipcRenderer.invoke("network-inspector:configure-lan", port, bindAddress),
        stop: () => electron_1.ipcRenderer.invoke("network-inspector:stop"),
        status: () => electron_1.ipcRenderer.invoke("network-inspector:status"),
        lanAddresses: () => electron_1.ipcRenderer.invoke("network-inspector:lan-addresses"),
        beginConnectivityTest: () => electron_1.ipcRenderer.invoke("network-inspector:begin-connectivity-test"),
        requests: () => electron_1.ipcRenderer.invoke("network-inspector:requests"),
        clear: () => electron_1.ipcRenderer.invoke("network-inspector:clear"),
        onRequest: (listener) => {
            const handler = (_event, request) => listener(request);
            electron_1.ipcRenderer.on("network-inspector:request", handler);
            return () => electron_1.ipcRenderer.removeListener("network-inspector:request", handler);
        },
    },
    http: {
        request: (input) => electron_1.ipcRenderer.invoke("http:request", input),
        onLog: (listener) => {
            const handler = (_event, log) => listener(log);
            electron_1.ipcRenderer.on("http:log", handler);
            return () => electron_1.ipcRenderer.removeListener("http:log", handler);
        },
    },
};
electron_1.contextBridge.exposeInMainWorld("developerUtility", api);
