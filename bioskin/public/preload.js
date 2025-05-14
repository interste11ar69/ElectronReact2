// public/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script executing...');

contextBridge.exposeInMainWorld(
  'electronAPI', { // Single object literal starts here
    // --- Authentication ---
    login: (credentials) => {
      console.log('[Preload] Invoking "login"');
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
      console.log('[Preload] Invoking "create-item"');
      return ipcRenderer.invoke('create-item', itemData);
    },
    updateItem: (itemDataWithId) => { // Renderer sends {id, ...otherData}
      console.log('[Preload] Invoking "update-item" with data:', itemDataWithId);
      return ipcRenderer.invoke('update-item', itemDataWithId); // Pass the whole object
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
    getTopSellingProxy: () => {
         console.log('[Preload] Invoking "get-top-selling-proxy"');
         return ipcRenderer.invoke('get-top-selling-proxy');
    },

    // --- File Operations ---
    importInitialItems: (args) => {
      console.log('[Preload] Invoking "import-initial-items"');
      return ipcRenderer.invoke('import-initial-items', args);
    },
    processInventoryFile: (args) => {
      console.log('[Preload] Invoking "process-inventory-file"');
      return ipcRenderer.invoke('process-inventory-file', args);
    },
    exportInventory: () => {
        console.log('[Preload] Invoking "export-inventory"');
        return ipcRenderer.invoke('export-inventory');
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
        console.log('[Preload] Invoking "create-customer"');
        return ipcRenderer.invoke('create-customer', customerData);
    },
    updateCustomer: (customerDataWithId) => { // Renderer sends {id, ...otherData}
        console.log('[Preload] Invoking "update-customer" with data:', customerDataWithId);
        return ipcRenderer.invoke('update-customer', customerDataWithId); // Pass the whole object
    },
    deleteCustomer: (id) => {
        console.log('[Preload] Invoking "delete-customer" with ID:', id);
        return ipcRenderer.invoke('delete-customer', id);
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
        return () => { // Return a cleanup function
            ipcRenderer.removeListener('new-log-entry', handler);
            console.log('[preload.js] Listener removed for "new-log-entry"');
        };
    },

    // --- Returns ---
    processReturn: (returnDetails) => {
         console.log('[Preload] Invoking "process-return"');
         return ipcRenderer.invoke('process-return', returnDetails);
    },
    getReturns: (filters) => {
         console.log('[Preload] Invoking "get-returns" with filters:', filters);
         return ipcRenderer.invoke('get-returns', filters);
    },

    // --- Stock Adjustment ---
    performStockAdjustment: (details) => {
           console.log('[Preload] Invoking "perform-stock-adjustment" with details:', details);
           return ipcRenderer.invoke('perform-stock-adjustment', details);
    }, // <<< Comma needed here to separate from next property

    // --- MODIFICATION START: Bundles, Sales Orders, Inventory Transactions correctly placed ---
    // --- Bundle Management ---
    createBundle: (bundleData) => {
        console.log('[Preload] Invoking "create-bundle"');
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
    updateBundle: (bundleId, bundleData) => { // Changed from (id, bundleData) to (bundleId, bundleData) to match main.js likely
        console.log('[Preload] Invoking "update-bundle" for ID:', bundleId);
        return ipcRenderer.invoke('update-bundle', bundleId, bundleData);
    },
    deleteBundle: (id) => {
        console.log('[Preload] Invoking "delete-bundle" for ID:', id);
        return ipcRenderer.invoke('delete-bundle', id);
    },
    processBundleSale: (bundleId, saleQuantity) => {
        console.log(`[Preload] Invoking "process-bundle-sale" for Bundle ID: ${bundleId}, Qty: ${saleQuantity}`);
        return ipcRenderer.invoke('process-bundle-sale', { bundleId, saleQuantity });
    },

    // --- Sales Order Management ---
    createSalesOrder: (orderData, orderItemsData) => {
        console.log('[Preload] Invoking "create-sales-order"');
        return ipcRenderer.invoke('create-sales-order', { orderData, orderItemsData });
    },
    getSalesOrders: (filters) => {
        console.log('[Preload] Invoking "get-sales-orders" with filters:', filters);
        return ipcRenderer.invoke('get-sales-orders', filters);
    },
    getSalesOrderById: (orderId) => {
        console.log('[Preload] Invoking "get-sales-order-by-id" for Order ID:', orderId);
        return ipcRenderer.invoke('get-sales-order-by-id', orderId);
    },
    updateSalesOrderStatus: (orderId, newStatus) => {
        console.log(`[Preload] Invoking "update-sales-order-status" for Order ID: ${orderId} to Status: ${newStatus}`);
        return ipcRenderer.invoke('update-sales-order-status', { orderId, newStatus });
    },
    generateOrderNumber: () => {
        console.log('[Preload] Invoking "generate-order-number"');
        return ipcRenderer.invoke('generate-order-number');
    },

    // --- Inventory Transactions (Ledger) ---
    getInventoryTransactionsForItem: (itemId, limit, offset) => {
        console.log(`[Preload] Invoking "get-inventory-transactions-for-item". Args:`, { itemId, limit, offset });
        // Always package arguments into a single object for the main process
        return ipcRenderer.invoke('get-inventory-transactions-for-item', { itemId: itemId, limit: limit, offset: offset });
    },
    // --- NEW STOCK TRANSFER FUNCTIONS ---
      createStockTransfer: (transferDetails) => {
        console.log('[Preload] Invoking "create-stock-transfer"', transferDetails);
        return ipcRenderer.invoke('create-stock-transfer', transferDetails);
      },
      getStockTransfers: (filters) => {
        console.log('[Preload] Invoking "get-stock-transfers"', filters);
        return ipcRenderer.invoke('get-stock-transfers', filters);
      },
      unarchiveItem: (itemId) => {
          console.log('[Preload] Invoking "unarchive-item" for ID:', itemId);
          return ipcRenderer.invoke('unarchive-item', itemId);
      },
      getSalesSummary: (period) => {
          console.log('[Preload] Invoking "get-sales-summary" with period:', period);
          return ipcRenderer.invoke('get-sales-summary', period);
        },
        getTopSellingItems: (period, limit) => {
          console.log('[Preload] Invoking "get-top-selling-items" with period:', period, 'limit:', limit);
          return ipcRenderer.invoke('get-top-selling-items', { period, limit }); // Send as an object
        },
        getSalesByStatus: (period) => {
          console.log('[Preload] Invoking "get-sales-by-status" with period:', period);
          return ipcRenderer.invoke('get-sales-by-status', period);
        },
    // --- MODIFICATION END ---
    // No comma after the last property in the object
  } // <--- This is the CORRECT closing brace for the 'electronAPI' object
); // <--- This is the CORRECT closing parenthesis for contextBridge.exposeInMainWorld

console.log('[Preload] Preload script finished exposing electronAPI.');