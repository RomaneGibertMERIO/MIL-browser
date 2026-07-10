"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {});

const { contextBridge, ipcRenderer } = require('electron');

// On utilise un nom unique pour éviter le conflit sur le 'window'
contextBridge.exposeInMainWorld('milBrowserAPI', {
    getBuiltinDatabase: () => ipcRenderer.invoke('get-builtin-database')
});
