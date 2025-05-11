// public/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script executing...');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    // --- Authentication ---
    login: (credentials) => {
      console.log('[Preload] Invoking "login" with:', credentials);
      return ipcRenderer.invoke('login', credentials);
    },
    getCurrentUser: () => {
      console.log('[Preload] Invoking "get-current-user"');
      return ipcRenderer.invoke('get-current-user');
    },
    logout: () => {
      console.log('[Preload] Invoking "logout"');
      return ipcRenderer.invoke('logout');
    },

    // --- Item Management ---
    getItems: (filters) => {
      console.log('[Preload] Invoking "get-items" with filters:', filters);
      return ipcRenderer.invoke('get-items', filters);
    },
    getItemById: (id) => {
      console.log('[Preload] Invoking "get-item-by-id" with ID:', id);
      return ipcRenderer.invoke('get-item-by-id', id);
    },
    // This is what ProductFormPage.js will call as `window.electronAPI.createItem`
    // It invokes the 'create-item' channel, matching main.js
    createItem: (itemData) => {
      console.log('[Preload] Invoking "create-item" with data:', itemData);
      return ipcRenderer.invoke('create-item', itemData);
    },
    // This is what ProductFormPage.js will call as `window.electronAPI.updateItem`
    // It sends a single object (itemDataWithId) and invokes the 'update-item' channel, matching main.js
    updateItem: (itemDataWithId) => {
      console.log('[Preload] Invoking "update-item" with data:', itemDataWithId);
      return ipcRenderer.invoke('update-item', itemDataWithId);
    },
    deleteItem: (id) => {
      console.log('[Preload] Invoking "delete-item" with ID:', id);
      return ipcRenderer.invoke('delete-item', id);
    },

    // --- Analytics ---
    getInventorySummary: () => {
      console.log('[Preload] Invoking "get-inventory-summary"');
      return ipcRenderer.invoke('get-inventory-summary');
    },
    getLowStockItems: (threshold) => {
      console.log('[Preload] Invoking "get-low-stock-items" with threshold:', threshold);
      return ipcRenderer.invoke('get-low-stock-items', threshold);
    },

    // --- File Operations ---
    // These expect a single argument object that contains 'fileData'
    // and other properties if needed, which matches your main.js handlers
    importInitialItems: (args) => { // args will be like { fileData }
      console.log('[Preload] Invoking "import-initial-items" with args:', args);
      return ipcRenderer.invoke('import-initial-items', args);
    },
    processInventoryFile: (args) => { // args will be like { fileData, actionType, columnMapping }
      console.log('[Preload] Invoking "process-inventory-file" with args:', args);
      return ipcRenderer.invoke('process-inventory-file', args);
    }
    // Add any other IPC channels you need
  }
);

console.log('[Preload] Preload script finished exposing electronAPI.');