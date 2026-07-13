import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSystemUsername: () => ipcRenderer.invoke("get-system-username"),
});
