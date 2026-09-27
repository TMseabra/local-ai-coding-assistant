// Preload script: runs in a sandboxed context with access to Node/Electron
// APIs, and exposes only the one thing the page needs (saving a file via a
// native dialog) onto window.lacDesktop. Nothing else from Node/Electron is
// reachable from the page's own scripts.
// CommonJS on purpose: Electron's preload loader expects it, regardless of
// the project's "type": "module" setting.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lacDesktop', {
  saveFile: (suggestedName, content) => ipcRenderer.invoke('save-file', { suggestedName, content }),
});
