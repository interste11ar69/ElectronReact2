// public/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script executing...');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    // --- Authentication ---
    login: (credentials) => {
      console.log('[Preload] Invoking "login" with credentials'); // Avoid logging password
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
    createItem: (itemData) => {
      console.log('[Preload] Invoking "create-item" with data:', itemData);
      return ipcRenderer.invoke('create-item', itemData);
    },
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
    getInventoryByCategory: () => {
            console.log('[Preload] Invoking "get-inventory-by-category"');
            return ipcRenderer.invoke('get-inventory-by-category');
        },
        getInventoryByStorage: () => { // Matched main.js handler name
            console.log('[Preload] Invoking "get-inventory-by-storage"');
            return ipcRenderer.invoke('get-inventory-by-storage');
        },
        // For Dashboard Stats
        getTodaysSalesTotal: () => {
             console.log('[Preload] Invoking "get-todays-sales-total"');
             return ipcRenderer.invoke('get-todays-sales-total');
        },
        getNewOrdersCount: () => {
             console.log('[Preload] Invoking "get-new-orders-count"');
             return ipcRenderer.invoke('get-new-orders-count');
        },
        getTopSellingProxy: () => { // For chart
             console.log('[Preload] Invoking "get-top-selling-proxy"');
             return ipcRenderer.invoke('get-top-selling-proxy');
        },

    // --- File Operations ---
    importInitialItems: (args) => { // args is like { fileData }
      console.log('[Preload] Invoking "import-initial-items" with args');
      return ipcRenderer.invoke('import-initial-items', args);
    },
    processInventoryFile: (args) => { // args is like { fileData, actionType, columnMapping }
      console.log('[Preload] Invoking "process-inventory-file" with args');
      return ipcRenderer.invoke('process-inventory-file', args);
    },
    exportInventory: () => { // <--- Moved Here
        console.log('[Preload] Invoking "export-inventory"');
        return ipcRenderer.invoke('export-inventory');
    },

    // --- Customer Management --- // <--- Moved Here
    getCustomers: (filters) => {
        console.log('[Preload] Invoking "get-customers" with filters:', filters);
        return ipcRenderer.invoke('get-customers', filters);
    },
    getCustomerById: (id) => {
        console.log('[Preload] Invoking "get-customer-by-id" with ID:', id);
        return ipcRenderer.invoke('get-customer-by-id', id);
    },
    createCustomer: (customerData) => {
        console.log('[Preload] Invoking "create-customer" with data:', customerData);
        return ipcRenderer.invoke('create-customer', customerData);
    },
    updateCustomer: (customerDataWithId) => {
        console.log('[Preload] Invoking "update-customer" with data:', customerDataWithId);
        return ipcRenderer.invoke('update-customer', customerDataWithId);
    },
    deleteCustomer: (id) => {
        console.log('[Preload] Invoking "delete-customer" with ID:', id);
        return ipcRenderer.invoke('delete-customer', id);
    },

    // --- Activity Log --- // <--- Moved fetch here, listener fixed
     getActivityLog: () => {
        console.log('[Preload] Invoking "get-activity-log"');
        return ipcRenderer.invoke('get-activity-log');
    },
    // --- Returns ---
        processReturn: (returnDetails) => { // For submitting a new return
             console.log('[Preload] Invoking "process-return" with details:', returnDetails);
             return ipcRenderer.invoke('process-return', returnDetails);
        },
        getReturns: (filters) => { // For fetching return history
             console.log('[Preload] Invoking "get-returns" with filters:', filters);
             return ipcRenderer.invoke('get-returns', filters);
        },
    onNewLogEntry: (callback) => {
        // Define the handler function that wraps the callback
        const handler = (event, newEntry) => {
            // You might want to add checks here if needed
            // console.log('[Preload] Received new-log-entry via IPC:', newEntry);
            callback(newEntry); // Call the function provided by the renderer
        };

        // Register the listener
        ipcRenderer.on('new-log-entry', handler);
        console.log('[preload.js] Listener added for "new-log-entry"');

        // Return a cleanup function to remove the listener
        return () => {
            ipcRenderer.removeListener('new-log-entry', handler);
            console.log('[preload.js] Listener removed for "new-log-entry"');
        };
    } // <--- End of onNewLogEntry function definition

    // Add any other IPC channels you need here...
  } // <--- End of the main exposed object
); // <--- End of contextBridge.exposeInMainWorld

console.log('[Preload] Preload script finished exposing electronAPI.');