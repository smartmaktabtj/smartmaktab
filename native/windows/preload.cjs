'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('SmartMaktabWindows',{openFile:()=>ipcRenderer.invoke('sm:open-file')});
