// public/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script executing...');

contextBridge.exposeInMainWorld(
  'electronAPI',
  {
    // --- Authentication ---
    login: (credentials) => {
      console.log('[Preload] Invoking "login" with credentials:', credentials);
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
    checkSkuExists: (sku) => { // New function exposed
          console.log('[Preload] Invoking "check-sku-exists" with SKU:', sku);
          return ipcRenderer.invoke('check-sku-exists', sku);
        },
        createItem: (itemPayload) => { // itemPayload is { itemData, initialStockEntries }
          console.log('[Preload] Invoking "create-item" with payload:', itemPayload);
          return ipcRenderer.invoke('create-item', itemPayload); // Pass itemPayload directly
        },
    updateItem: (itemDataWithId) => {
      console.log('[Preload] Invoking "update-item" with data:', itemDataWithId);
      return ipcRenderer.invoke('update-item', itemDataWithId);
    },
    archiveItem: (itemId) => {
      console.log('[Preload] Invoking "archive-item" with ID:', itemId);
      // Assuming main.js 'delete-item' handler is now for archiving items
      return ipcRenderer.invoke('delete-item', itemId);
    },
    unarchiveItem: (itemId) => {
      console.log('[Preload] Invoking "unarchive-item" for ID:', itemId);
      return ipcRenderer.invoke('unarchive-item', itemId);
    },

    // --- Customer Management ---
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
    archiveCustomer: (customerId, archiveStatus) => { // New function exposed
      console.log(`[Preload] Invoking "archive-customer" for ID: ${customerId}, Status: ${archiveStatus}`);
      return ipcRenderer.invoke('archive-customer', customerId, archiveStatus);
    },

    createBundle: (bundleData) => {
      console.log('[Preload] Invoking "create-bundle" with data:', bundleData);
      return ipcRenderer.invoke('create-bundle', bundleData);
    },
    getBundles: (filters) => {
      console.log('[Preload] Invoking "get-bundles" with filters:', filters);
      return ipcRenderer.invoke('get-bundles', filters);
    },
    getBundleById: (id) => {
      console.log('[Preload] Invoking "get-bundle-by-id" for ID:', id);
      return ipcRenderer.invoke('get-bundle-by-id', id);
    },
    updateBundle: (bundleId, bundleData) => {
      console.log('[Preload] Invoking "update-bundle" for ID:', bundleId, 'with data:', bundleData);
      return ipcRenderer.invoke('update-bundle', bundleId, bundleData);
    },
    archiveBundle: (bundleId, archiveStatus) => { // New function exposed
          console.log(`[Preload] Invoking "archive-bundle" for ID: ${bundleId}, Status: ${archiveStatus}`);
          return ipcRenderer.invoke('archive-bundle', bundleId, archiveStatus);
        },

    // --- Returns Processing (Kept) ---
    processReturn: (returnDetails) => {
      console.log('[Preload] Invoking "process-return" with details:', returnDetails);
      return ipcRenderer.invoke('process-return', returnDetails);
    },
    getReturns: (filters) => {
      console.log('[Preload] Invoking "get-returns" with filters:', filters);
      return ipcRenderer.invoke('get-returns', filters);
    },

    // --- Stock Operations (Kept) ---
    performStockAdjustment: (details) => {
      console.log('[Preload] Invoking "perform-stock-adjustment" with details:', details);
      return ipcRenderer.invoke('perform-stock-adjustment', details);
    },
    createStockTransfer: (transferDetails) => {
      console.log('[Preload] Invoking "create-stock-transfer" with details:', transferDetails);
      return ipcRenderer.invoke('create-stock-transfer', transferDetails);
    },
    getStockTransfers: (filters) => {
      console.log('[Preload] Invoking "get-stock-transfers" with filters:', filters);
      return ipcRenderer.invoke('get-stock-transfers', filters);
    },
    getInventoryTransactionsForItem: (itemId, limit, offset) => {
      console.log(`[Preload] Invoking "get-inventory-transactions-for-item". Args:`, { itemId, limit, offset });
      return ipcRenderer.invoke('get-inventory-transactions-for-item', { itemId, limit, offset });
    },
    getItemQuantityAtLocation: (itemId, locationId) => {
      console.log(`[Preload] Invoking "get-item-quantity-at-location" for item ${itemId}, loc ${locationId}`);
      return ipcRenderer.invoke('get-item-quantity-at-location', itemId, locationId);
    },
    getStorageLocations: () => {
      console.log('[Preload] Invoking "get-storage-locations"');
      return ipcRenderer.invoke('get-storage-locations');
    },
    getStoreLocationId: () => {
      console.log('[Preload] Invoking "get-store-location-id"');
      return ipcRenderer.invoke('get-store-location-id');
    },

    // --- Analytics & Reporting Data Fetching (Inventory Focused) ---
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
    getInventoryByStorage: () => {
      console.log('[Preload] Invoking "get-inventory-by-storage"');
      return ipcRenderer.invoke('get-inventory-by-storage');
    },

    getDetailedStockReport: (filters) => { // Kept for inventory analytics
      console.log('[Preload] Invoking "get-detailed-stock-report" with filters:', filters);
      return ipcRenderer.invoke('get-detailed-stock-report', filters);
    },
    generateReport: (params) => { // Kept, assuming it can generate non-sales reports
        console.log('[Preload] Invoking "generate-report" with params:', params);
        return ipcRenderer.invoke('generate-report', params);
    },

    // --- Data Management (File Operations) ---
    importInitialItems: (args) => {
      console.log('[Preload] Invoking "import-initial-items" with args:', args);
      return ipcRenderer.invoke('import-initial-items', args);
    },
    processInventoryFile: (args) => {
      console.log('[Preload] Invoking "process-inventory-file" with args:', args);
      return ipcRenderer.invoke('process-inventory-file', args);
    },
    exportGenericData: (params) => {
        console.log('[Preload] Invoking "export-generic-data" with params:', params);
        return ipcRenderer.invoke('export-generic-data', params);
    },

    // --- Activity Log ---
    getActivityLog: () => {
      console.log('[Preload] Invoking "get-activity-log"');
      return ipcRenderer.invoke('get-activity-log');
    },
    onNewLogEntry: (callback) => {
      const handler = (event, newEntry) => {
        callback(newEntry);
      };
      ipcRenderer.on('new-log-entry', handler);
      console.log('[preload.js] Listener added for "new-log-entry"');
      return () => {
        ipcRenderer.removeListener('new-log-entry', handler);
        console.log('[preload.js] Listener removed for "new-log-entry"');
      };
    }
  }
);

console.log('[Preload] Preload script finished exposing electronAPI.');