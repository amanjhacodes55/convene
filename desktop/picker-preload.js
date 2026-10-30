// The screen picker's only way to talk to the app: read the sources, choose one.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("picker", {
  sources: () => ipcRenderer.invoke("picker:sources"),
  choose: (id) => ipcRenderer.send("picker:choose", id),
});
