// public/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script executing...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI', {
    // Items
    getItems: (filters) => ipcRenderer.invoke('get-items', filters),
    getItemById: (id) => ipcRenderer.invoke('get-item-by-id', id),
    createItem: (itemData) => ipcRenderer.invoke('create-item', itemData),
    updateItem: (id, itemData) => ipcRenderer.invoke('update-item', id, itemData),
    deleteItem: (id) => ipcRenderer.invoke('delete-item', id),

    // Analytics
    getInventorySummary: () => ipcRenderer.invoke('get-inventory-summary'),
    getLowStockItems: (threshold) => ipcRenderer.invoke('get-low-stock-items', threshold),

    // Users
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
    logout: () => ipcRenderer.invoke('logout'),

    // File operations
    importInitialItems: (fileData) => ipcRenderer.invoke('import-initial-items', fileData),
    processInventoryFile: (fileData) => ipcRenderer.invoke('process-inventory-file', fileData)
  }
);

console.log('Preload script finished exposing electronAPI.');