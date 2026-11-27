'use strict';
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('SmartMaktabAdminDesktop', {
  isDesktop: true,
});
