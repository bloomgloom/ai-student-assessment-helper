const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assessmentDesktop', {
  setDisplaySleepPrevention: (enabled) => ipcRenderer.invoke('display-sleep-prevention', Boolean(enabled)),
});
