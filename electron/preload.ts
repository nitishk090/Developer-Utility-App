import { contextBridge, ipcRenderer } from "electron";
import { DeveloperUtilityApi, HttpRequestInput, LiveRequest } from "./types";
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
  http: {
    request: (input: HttpRequestInput) =>
      ipcRenderer.invoke("http:request", input),
  },
};
contextBridge.exposeInMainWorld("developerUtility", api);
