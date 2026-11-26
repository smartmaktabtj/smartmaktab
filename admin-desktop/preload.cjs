'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SmartMaktabAdmin', {
  init: () => ipcRenderer.invoke('sm-admin:init'),
  saveSettings: patch => ipcRenderer.invoke('sm-admin:saveSettings', patch),
  pickKeyFile: () => ipcRenderer.invoke('sm-admin:pickKeyFile'),
  generateKeys: () => ipcRenderer.invoke('sm-admin:generateKeys'),
  validatePack: payload => ipcRenderer.invoke('sm-admin:validatePack', payload),
  openSmupdate: () => ipcRenderer.invoke('sm-admin:openSmupdate'),
  saveSmupdate: payload => ipcRenderer.invoke('sm-admin:saveSmupdate', payload),
  publishGithub: data => ipcRenderer.invoke('sm-admin:publishGithub', data),
  slugId: (text, fallback) => ipcRenderer.invoke('sm-admin:slugId', text, fallback),
});
