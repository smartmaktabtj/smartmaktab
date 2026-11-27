'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SmartMaktabWindows', {
  openFile: () => ipcRenderer.invoke('sm:open-file'),
  checkAppRelease: () => ipcRenderer.invoke('sm:app:checkRelease'),
  openAppDownload: url => ipcRenderer.invoke('sm:app:openDownload', url),
});
