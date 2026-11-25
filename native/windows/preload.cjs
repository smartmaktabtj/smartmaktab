'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('SmartMaktabWindows',{openFile:()=>ipcRenderer.invoke('sm:open-file'),contentStatus:()=>ipcRenderer.invoke('sm:content:get'),importContent:()=>ipcRenderer.invoke('sm:content:apply','file'),fetchContent:()=>ipcRenderer.invoke('sm:content:apply','online')});
