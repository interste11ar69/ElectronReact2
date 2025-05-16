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
    createItem: (itemPayload) => { // itemPayload is { itemData, initialStockEntries }
      console.log('[Preload] Invoking "create-item" with payload:', itemPayload);
      return ipcRenderer.invoke('create-item', itemPayload);
    },
    updateItem: (itemDataWithId) => {
      console.log('[Preload] Invoking "update-item" with data:', itemDataWithId);
      return ipcRenderer.invoke('update-item', itemDataWithId);
    },
    archiveItem: (itemId) => { // Renamed from deleteItem for clarity if it's soft delete
      console.log('[Preload] Invoking "archive-item" with ID:', itemId);
      return ipcRenderer.invoke('delete-item', itemId); // Main process still uses 'delete-item' for archive
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
    deleteCustomer: (id) => {
      console.log('[Preload] Invoking "delete-customer" with ID:', id);
      return ipcRenderer.invoke('delete-customer', id);
    },

    // --- Bundle Management ---
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
    deleteBundle: (id) => {
      console.log('[Preload] Invoking "delete-bundle" for ID:', id);
      return ipcRenderer.invoke('delete-bundle', id);
    },
    processBundleSale: (args) => { // args is { bundleId, quantitySold }
      console.log('[Preload] Invoking "process-bundle-sale" with args:', args);
      return ipcRenderer.invoke('process-bundle-sale', args);
    },

    // --- Sales Order Management ---
    createSalesOrder: (orderPayload, orderItemsPayload) => {
      console.log('[Preload] Invoking "create-sales-order" with orderPayload:', orderPayload, 'and orderItemsPayload:', orderItemsPayload);
      return ipcRenderer.invoke('create-sales-order', { orderData: orderPayload, orderItemsData: orderItemsPayload });
    },
    getSalesOrders: (filters) => {
      console.log('[Preload] Invoking "get-sales-orders" with filters:', filters);
      return ipcRenderer.invoke('get-sales-orders', filters);
    },
    getSalesOrderById: (orderId) => {
      console.log('[Preload] Invoking "get-sales-order-by-id" for Order ID:', orderId);
      return ipcRenderer.invoke('get-sales-order-by-id', orderId);
    },
    updateSalesOrderStatus: (orderId, newStatus) => { // Frontend sends two args
      console.log(`[Preload] Invoking "update-sales-order-status" for Order ID: ${orderId} to Status: ${newStatus}`);
      return ipcRenderer.invoke('update-sales-order-status', { orderId, newStatus }); // Package as object for main
    },
    generateOrderNumber: () => {
      console.log('[Preload] Invoking "generate-order-number"');
      return ipcRenderer.invoke('generate-order-number');
    },

    // --- Returns Processing ---
    processReturn: (returnDetails) => {
      console.log('[Preload] Invoking "process-return" with details:', returnDetails);
      return ipcRenderer.invoke('process-return', returnDetails);
    },
    getReturns: (filters) => {
      console.log('[Preload] Invoking "get-returns" with filters:', filters);
      return ipcRenderer.invoke('get-returns', filters);
    },

    // --- Stock Operations ---
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

    // --- Analytics & Reporting Data Fetching ---
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
    getTodaysSalesTotal: () => {
      console.log('[Preload] Invoking "get-todays-sales-total"');
      return ipcRenderer.invoke('get-todays-sales-total');
    },
    getNewOrdersCount: () => {
      console.log('[Preload] Invoking "get-new-orders-count"');
      return ipcRenderer.invoke('get-new-orders-count');
    },
    getSalesSummary: (period) => { // Used by AnalyticsPage
      console.log('[Preload] Invoking "get-sales-summary" with period:', period);
      return ipcRenderer.invoke('get-sales-summary', period);
    },
    getTopSellingItems: (params) => { // params is { period, limit }, used by AnalyticsPage
      console.log('[Preload] Invoking "get-top-selling-items" with params:', params);
      return ipcRenderer.invoke('get-top-selling-items', params);
    },
    getSalesByStatus: (period) => { // Used by AnalyticsPage
      console.log('[Preload] Invoking "get-sales-by-status" with period:', period);
      return ipcRenderer.invoke('get-sales-by-status', period);
    },
    getDetailedStockReport: (filters) => { // Used by AnalyticsPage
      console.log('[Preload] Invoking "get-detailed-stock-report" with filters:', filters);
      return ipcRenderer.invoke('get-detailed-stock-report', filters);
    },
    getSalesDetailReport: (filters) => { // Used by AnalyticsPage
      console.log('[Preload] Invoking "get-sales-detail-report" with filters:', filters);
      return ipcRenderer.invoke('get-sales-detail-report', filters);
    },
    generateReport: (params) => { // Used by new ReportsPage.js; params is { reportType, filters }
        console.log('[Preload] Invoking "generate-report" with params:', params);
        return ipcRenderer.invoke('generate-report', params);
    },


    // --- Data Management (File Operations) ---
    importInitialItems: (args) => { // args is { fileData }
      console.log('[Preload] Invoking "import-initial-items" with args:', args);
      return ipcRenderer.invoke('import-initial-items', args);
    },
    processInventoryFile: (args) => { // args is { fileData, actionType, columnMapping }
      console.log('[Preload] Invoking "process-inventory-file" with args:', args);
      return ipcRenderer.invoke('process-inventory-file', args);
    },
    exportGenericData: (params) => { // Used by DataManagementPage & AnalyticsPage/ReportsPage; params: { exportType?, reportData?, format?, fileNamePrefix }
        console.log('[Preload] Invoking "export-generic-data" with params:', params);
        return ipcRenderer.invoke('export-generic-data', params);
    },
    // Note: The old 'exportInventory' can be removed if 'exportGenericData' with type 'comprehensive_inventory' replaces it.
    // If you keep both, ensure they call different or appropriately parameterized IPC handlers in main.js.
    // For simplicity, I'm assuming 'exportGenericData' will be the primary export mechanism.


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
    // No comma after the last property in the object
  }
);

console.log('[Preload] Preload script finished exposing electronAPI.');