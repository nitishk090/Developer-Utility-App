import { contextBridge, ipcRenderer } from "electron";
import { DeveloperUtilityApi, HttpRequestInput, HttpRequestLog, LiveRequest } from "./types";
const api: DeveloperUtilityApi = {
  clipboard: {
    copy: (text) => ipcRenderer.invoke("clipboard:copy", text),
    read: () => ipcRenderer.invoke("clipboard:read"),
  },
  files: {
    open: () => ipcRenderer.invoke("files:open"),
    save: (content, extension) =>
      ipcRenderer.invoke("files:save", content, extension),
  },
  runtime: {
    mode: () => ipcRenderer.invoke("app:mode"),
    reload: () => ipcRenderer.invoke("app:reload"),
  },
  bridge: {
    start: () => ipcRenderer.invoke("bridge:start"),
    stop: () => ipcRenderer.invoke("bridge:stop"),
    status: () => ipcRenderer.invoke("bridge:status"),
    onRequest: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        request: LiveRequest,
      ) => listener(request);
      ipcRenderer.on("bridge:request", handler);
      return () => ipcRenderer.removeListener("bridge:request", handler);
    },
  },
  networkInspector: {
    start: (port, bindAddress) =>
      ipcRenderer.invoke("network-inspector:start", port, bindAddress),
    configureLan: (port, bindAddress) =>
      ipcRenderer.invoke("network-inspector:configure-lan", port, bindAddress),
    stop: () => ipcRenderer.invoke("network-inspector:stop"),
    status: () => ipcRenderer.invoke("network-inspector:status"),
    lanAddresses: () => ipcRenderer.invoke("network-inspector:lan-addresses"),
    beginConnectivityTest: () =>
      ipcRenderer.invoke("network-inspector:begin-connectivity-test"),
    requests: () => ipcRenderer.invoke("network-inspector:requests"),
    clear: () => ipcRenderer.invoke("network-inspector:clear"),
    onRequest: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        request: Parameters<typeof listener>[0],
      ) => listener(request);
      ipcRenderer.on("network-inspector:request", handler);
      return () => ipcRenderer.removeListener("network-inspector:request", handler);
    },
  },
  http: {
    request: (input: HttpRequestInput) =>
      ipcRenderer.invoke("http:request", input),
    onLog: (listener: (log: HttpRequestLog) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        log: HttpRequestLog,
      ) => listener(log);
      ipcRenderer.on("http:log", handler);
      return () => ipcRenderer.removeListener("http:log", handler);
    },
  },
};
contextBridge.exposeInMainWorld("developerUtility", api);
