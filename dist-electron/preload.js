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
    http: {
        request: (input) => electron_1.ipcRenderer.invoke("http:request", input),
    },
};
electron_1.contextBridge.exposeInMainWorld("developerUtility", api);
