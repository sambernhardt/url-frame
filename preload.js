const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("urlFrame", {
  captureRegion: (rect, options) =>
    ipcRenderer.invoke("capture-region", rect, options || {}),
  getAppTheme: () => ipcRenderer.invoke("get-app-theme"),
  onAppTheme: (cb) => {
    const handler = (_event, theme) => cb(theme);
    ipcRenderer.on("app-theme", handler);
    return () => ipcRenderer.removeListener("app-theme", handler);
  },
  onCopyImage: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("copy-image", handler);
    return () => ipcRenderer.removeListener("copy-image", handler);
  },
});
