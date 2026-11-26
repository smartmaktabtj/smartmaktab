'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SmartMaktabWindows', {
  openFile: () => ipcRenderer.invoke('sm:open-file'),
  contentStatus: () => ipcRenderer.invoke('sm:content:get'),
  importContent: () => ipcRenderer.invoke('sm:content:apply', 'file'),
  fetchContent: () => ipcRenderer.invoke('sm:content:apply', 'online'),
  checkContent: () => ipcRenderer.invoke('sm:content:check'),
  autoCheckContent: () => ipcRenderer.invoke('sm:content:autoCheck'),
  checkAppRelease: () => ipcRenderer.invoke('sm:app:checkRelease'),
  openAppDownload: url => ipcRenderer.invoke('sm:app:openDownload', url),
});
