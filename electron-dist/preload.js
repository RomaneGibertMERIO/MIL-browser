"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const { contextBridge, ipcRenderer } = require('electron');

// On utilise un nom unique pour éviter le conflit sur le 'window'
contextBridge.exposeInMainWorld('milBrowserAPI', {
    getBuiltinDatabase: () => ipcRenderer.invoke('get-builtin-database')
});
