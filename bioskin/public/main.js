// public/main.js
require('dotenv').config(); // MUST BE THE VERY FIRST LINE

const { app, BrowserWindow, ipcMain, Menu, nativeImage, dialog } = require('electron'); // Added dialog
const path = require('path');
const os = require('os'); // Needed for logActivity ID generation (optional)
const fs = require('fs');
const isDev = require('electron-is-dev');
const { db } = require('../src/supabaseClient'); // Correct import
const XLSX = require('xlsx');
const Papa = require('papaparse');

// --- Global Variables ---
let currentUser = null;
let mainWindow;

// --- Central logging function ---
async function logActivity(user, action, details = '') { // Made async
    const userIdentifier = user || 'System'; // Use 'System' if no user provided
    const entryData = {
        user_identifier: userIdentifier,
        action: action,
        details: details || null // Ensure null if empty for DB
    };

    console.log(`[Attempting Log] User: ${userIdentifier}, Action: ${action}, Details: ${details}`);

    try {
        // Add entry to Supabase
        const result = await db.addActivityLogEntry(entryData);

        if (!result.success) {
            // Log failure to console, but don't necessarily stop the original operation
            console.error(`[main.js] Failed to add activity log to Supabase: ${result.message}`);
            // Don't try to send to renderer if DB write failed
            return;
        }

         // If successful, prepare data for the renderer notification
         // Use the data returned from insert if available, otherwise construct it
         const entryForRenderer = {
             id: result.entry?.id || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // Use DB ID or generate fallback
             timestamp: result.entry?.created_at || new Date().toISOString(), // Use DB timestamp or current time
             user: userIdentifier, // Use the identifier we logged with
             action: action,
             details: details || '' // Use empty string for consistency with previous frontend code
         };


        // Notify the renderer process (if window exists)
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
             try {
                 mainWindow.webContents.send('new-log-entry', entryForRenderer); // Send the structured entry
                 console.log('[main.js] Sent new-log-entry to renderer.');
             } catch (sendError) {
                  console.warn('[main.js] Error sending new-log-entry (window might be closing):', sendError.message);
             }
        } else {
            console.warn('[main.js] Could not send new-log-entry: mainWindow not ready or destroyed.');
        }

    } catch (error) {
        // Catch unexpected errors from the db call itself
        console.error('[main.js] Unexpected error during logActivity database operation:', error);
    }
}

// --- CSV Helper Function (Defined Globally) ---
function convertToCSV(data, headers) {
    if (!data || data.length === 0) {
        return '';
    }
    const headerKeys = headers || Object.keys(data[0]);
    const headerString = headerKeys.join(',');
    const rows = data.map(row => {
        return headerKeys.map(key => {
            let cell = row[key] === null || row[key] === undefined ? '' : String(row[key]);
            if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                cell = `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
        }).join(',');
    });
    return [headerString, ...rows].join('\n');
}

// --- Create Window Function ---
function createWindow() {
    const iconPath = path.join(__dirname, 'logo.png');
    let windowIcon = null;
    try {
        if (fs.existsSync(iconPath)) {
            windowIcon = nativeImage.createFromPath(iconPath);
            console.log(`[main.js] Window icon loaded from: ${iconPath}`);
        } else {
            console.warn(`[main.js] Window icon NOT FOUND at: ${iconPath}. Using default Electron icon.`);
        }
    } catch (iconError){
        console.error(`[main.js] Error loading window icon:`, iconError);
    }


    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900, // Optional: Set minimum dimensions
        minHeight: 600,
        title: "Bioskin Inventory Management System",
        icon: windowIcon || undefined, // Use default if loading failed
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, // Keep true (recommended)
            nodeIntegration: false, // Keep false (recommended)
            // spellcheck: false // Optional: disable spellcheck if needed
        },
    });

    Menu.setApplicationMenu(null); // Remove default menu unless you add custom items

    const startUrl = isDev
        ? 'http://localhost:3000' // Ensure this port matches your React dev server
        : `file://${path.join(__dirname, '../build/index.html')}`; // Correct path for production build

    console.log(`[main.js] Loading URL: ${startUrl}`);
    mainWindow.loadURL(startUrl);

    // Optional: Clear currentUser when window is closed
    mainWindow.on('closed', () => {
         console.log('[main.js] Main window closed. Clearing currentUser.');
         mainWindow = null;
         currentUser = null; // Clear user session on window close
    });


    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

// --- App Lifecycle Events ---
app.whenReady().then(() => {
    console.log('[main.js] App Ready. Setting up IPC Handlers...');

    // --- IPC HANDLERS ---
    // (Handlers should be defined here, inside whenReady, or globally before it)

    // --- Custom Authentication ---
    ipcMain.handle('login', async (event, credentials) => {
        console.log(`[main.js] IPC login attempt for username: ${credentials?.username}`);
        if (!credentials || !credentials.username || !credentials.password) {
            return { success: false, message: 'Username and password required.' };
        }
        const result = await db.login(credentials.username, credentials.password);
        if (result.success && result.user) {
            currentUser = result.user;
            logActivity(currentUser.username, 'User logged in'); // Log successful login
            console.log(`[main.js] Login successful. User set:`, { id: currentUser.id, username: currentUser.username, role: currentUser.role });
        } else {
            currentUser = null;
            logActivity('System', 'Failed login attempt', `Username: ${credentials.username}`); // Log failed attempt
            console.log(`[main.js] Login failed. Reason: ${result.message || 'Unknown'}`);
        }
        return result;
    });

    ipcMain.handle('get-current-user', async () => {
        console.log(`[main.js] IPC get-current-user. Returning:`, currentUser ? { id: currentUser.id, username: currentUser.username, role: currentUser.role } : null);
        return currentUser; // Return the stored user object
    });

    ipcMain.handle('logout', async () => {
        const username = currentUser?.username;
        logActivity(username || 'Unknown', 'User logged out'); // Log logout
        console.log(`[main.js] IPC logout. Clearing user: ${username}`);
        currentUser = null;
        return { success: true };
    });

    // --- Item Management ---
   ipcMain.handle('get-items', async (event, filters) => {
       try {
           console.log('[main.js] IPC get-items called with filters (including sort):', filters); // Log will show sort params
           return await db.getItems(filters); // Pass the whole filters object
       } catch (error) {
           console.error('[main.js] Error in get-items handler:', error);
           logActivity(currentUser?.username, 'Error fetching items', error.message);
           return { error: error.message || 'Failed to fetch items.' }; // Ensure consistent error structure
       }
   });

    ipcMain.handle('get-item-by-id', async (event, id) => {
         console.log('[main.js] IPC get-item-by-id called for ID:', id);
        try {
            return await db.getItemById(id);
        } catch (error) {
            console.error('[main.js] Error getting item by id:', id, error);
             logActivity(currentUser?.username, 'Error fetching item by ID', `ID: ${id}, Error: ${error.message}`);
            return { error: error.message || 'Failed to fetch item by ID.' };
        }
    });

    ipcMain.handle('create-item', async (event, itemData) => {
         console.log('[main.js] IPC create-item called with data:', itemData);
        try {
            const result = await db.createItem(itemData);
            if (result.success && result.item) {
                logActivity(currentUser?.username, 'Added inventory item', `Name: ${result.item.name}, SKU: ${result.item.sku || 'N/A'}`);
            } else {
                 logActivity(currentUser?.username, 'Failed to add item', result.message || 'Unknown DB error');
            }
            return result;
        } catch (error) {
            console.error('[main.js] Error creating item:', itemData, error);
             logActivity(currentUser?.username, 'Error creating item', error.message);
            return { success: false, message: error.message || 'Unexpected error creating item.' };
        }
    });

    ipcMain.handle('update-item', async (event, itemDataWithId) => {
        console.log('[main.js] IPC update-item called with data:', itemDataWithId);
        try {
            if (!itemDataWithId || itemDataWithId.id === undefined || itemDataWithId.id === null) {
                throw new Error("Item ID is required and must be valid for update.");
            }
            const id = itemDataWithId.id;
            const { id: removedId, ...dataToUpdate } = itemDataWithId;
            const result = await db.updateItem(id, dataToUpdate);
            if (result.success && result.item) {
                logActivity(currentUser?.username, 'Updated inventory item', `Name: ${result.item.name}, SKU: ${result.item.sku || 'N/A'}, ID: ${id}`);
            } else {
                 logActivity(currentUser?.username, 'Failed to update item', `ID: ${id}, Reason: ${result.message || 'Unknown DB error'}`);
            }
            return result;
        } catch (error) {
            console.error(`[main.js] Error updating item ID ${itemDataWithId?.id}:`, error);
             logActivity(currentUser?.username, 'Error updating item', `ID: ${itemDataWithId?.id}, Error: ${error.message}`);
            return { success: false, message: error.message || 'Unexpected error updating item.' };
        }
    });

    ipcMain.handle('delete-item', async (event, id) => {
        console.log('[main.js] IPC delete-item called for ID:', id);
        let itemDetails = `ID: ${id}`;
        try {
            // Attempt to get details before deleting for better logging
            const item = await db.getItemById(id);
            if (item) {
                 itemDetails = `Name: ${item.name}, SKU: ${item.sku || 'N/A'}, ID: ${id}`;
            }
        } catch (fetchError) {
             console.warn(`[main.js] Could not fetch details before deleting item (ID: ${id}):`, fetchError.message);
        }

        try {
            const result = await db.deleteItem(id);
            if (result.success) {
                logActivity(currentUser?.username, 'Deleted inventory item', itemDetails);
            } else {
                logActivity(currentUser?.username, 'Failed to delete item', `Details: ${itemDetails}, Reason: ${result.message || 'Unknown DB error'}`);
            }
            return result;
        } catch (error) {
            console.error(`[main.js] Error deleting item ID ${id}:`, error);
            logActivity(currentUser?.username, 'Error deleting item', `Details: ${itemDetails}, Error: ${error.message}`);
            return { success: false, message: error.message || 'Unexpected error deleting item.' };
        }
    });

    // --- Customer Management ---
     ipcMain.handle('get-customers', async (event, filters) => {
         console.log('[Main Process] Received "get-customers" with filters:', filters);
         try {
            return await db.getCustomers(filters || {});
         } catch (error) {
            console.error('[Main Process] Error in "get-customers" handler:', error);
             logActivity(currentUser?.username, 'Error fetching customers', error.message);
            return { error: error.message || 'Failed to fetch customers.' };
         }
    });

    ipcMain.handle('get-customer-by-id', async (event, id) => {
         console.log('[Main Process] Received "get-customer-by-id" for ID:', id);
         try {
            return await db.getCustomerById(id);
         } catch (error) {
            console.error('[Main Process] Error in "get-customer-by-id" handler:', error);
             logActivity(currentUser?.username, 'Error fetching customer by ID', `ID: ${id}, Error: ${error.message}`);
            return { error: error.message || 'Failed to fetch customer by ID.' };
         }
    });

    ipcMain.handle('create-customer', async (event, customerData) => {
         console.log('[Main Process] Received "create-customer" with data:', customerData);
         try {
            const result = await db.createCustomer(customerData);
            if (result.success && result.customer) {
                logActivity(currentUser?.username, 'Added customer', `Name: ${result.customer.full_name}, ID: ${result.customer.id}`);
            } else {
                 logActivity(currentUser?.username, 'Failed to add customer', result.message || 'Unknown DB error');
            }
            return result;
         } catch (error) {
            console.error('[Main Process] Error in "create-customer" handler:', error);
             logActivity(currentUser?.username, 'Error creating customer', error.message);
            return { success: false, message: error.message || 'Unexpected error creating customer.' };
         }
    });

    ipcMain.handle('update-customer', async (event, customerDataWithId) => {
        console.log('[Main Process] Received "update-customer" with data:', customerDataWithId);
        try {
             if (!customerDataWithId || customerDataWithId.id === undefined || customerDataWithId.id === null) {
                throw new Error("Customer ID is missing or invalid for update.");
            }
            const id = customerDataWithId.id;
            const { id: removedId, ...customerData } = customerDataWithId;
            const result = await db.updateCustomer(id, customerData);
            if (result.success && result.customer) {
                logActivity(currentUser?.username, 'Updated customer', `Name: ${result.customer.full_name}, ID: ${id}`);
            } else {
                 logActivity(currentUser?.username, 'Failed to update customer', `ID: ${id}, Reason: ${result.message || 'Unknown DB error'}`);
            }
            return result;
        } catch (error) {
            console.error('[Main Process] Error in "update-customer" handler:', error);
             logActivity(currentUser?.username, 'Error updating customer', `ID: ${customerDataWithId?.id}, Error: ${error.message}`);
            return { success: false, message: error.message || 'Unexpected error updating customer.' };
        }
    });

    ipcMain.handle('delete-customer', async (event, id) => {
        console.log('[Main Process] Received "delete-customer" for ID:', id);
        let customerDetails = `ID: ${id}`;
        try {
             const customer = await db.getCustomerById(id);
             if (customer) {
                 customerDetails = `Name: ${customer.full_name}, ID: ${id}`;
             }
        } catch (fetchError) {
             console.warn(`[main.js] Could not fetch details before deleting customer (ID: ${id}):`, fetchError.message);
        }

        try {
            const result = await db.deleteCustomer(id);
            if (result.success) {
                logActivity(currentUser?.username, 'Deleted customer', customerDetails);
            } else {
                 logActivity(currentUser?.username, 'Failed to delete customer', `Details: ${customerDetails}, Reason: ${result.message || 'Unknown DB error'}`);
            }
            return result;
        } catch (error) {
            console.error('[Main Process] Error in "delete-customer" handler:', error);
             logActivity(currentUser?.username, 'Error deleting customer', `Details: ${customerDetails}, Error: ${error.message}`);
            return { success: false, message: error.message || 'Unexpected error deleting customer.' };
        }
    });

    // --- Analytics ---
    ipcMain.handle('get-inventory-summary', async () => {
        console.log('[main.js] IPC get-inventory-summary');
        try {
            return await db.getInventorySummary();
        } catch (error) {
            console.error('[main.js] Error getting inventory summary:', error);
             logActivity(currentUser?.username, 'Error getting inventory summary', error.message);
            return { success: false, message: error.message, summary: null };
        }
    });

    ipcMain.handle('get-low-stock-items', async (event, threshold) => {
         console.log('[main.js] IPC get-low-stock-items with threshold:', threshold);
        try {
            return await db.getLowStockItems(threshold);
        } catch (error) {
            console.error('[main.js] Error getting low stock items:', error);
             logActivity(currentUser?.username, 'Error getting low stock items', error.message);
            return { success: false, message: error.message, items: [] };
        }
    });
    ipcMain.handle('get-inventory-by-category', async () => {
        console.log('[main.js] IPC get-inventory-by-category');
        try {
            return await db.getInventoryByCategory();
        } catch (error) {
            console.error('[main.js] Error getting inventory by category:', error);
            logActivity(currentUser?.username, 'Error getting category analytics', error.message);
            return { success: false, message: error.message, data: [] };
        }
    });

    ipcMain.handle('get-inventory-by-storage', async () => {
        console.log('[main.js] IPC get-inventory-by-storage');
        try {
            return await db.getInventoryByStorageLocation();
        } catch (error) {
            console.error('[main.js] Error getting inventory by storage:', error);
            logActivity(currentUser?.username, 'Error getting storage analytics', error.message);
            return { success: false, message: error.message, data: [] };
        }
    });

    // Handlers for the new dashboard stats (using placeholders from db client for now)
    ipcMain.handle('get-todays-sales-total', async () => {
        console.log('[main.js] IPC get-todays-sales-total');
        try {
            return await db.getTodaysSalesTotal();
        } catch (error) {
            console.error('[main.js] Error in get-todays-sales-total:', error);
            return { success: false, total: 0, message: error.message };
        }
    });
    ipcMain.handle('get-new-orders-count', async () => {
        console.log('[main.js] IPC get-new-orders-count');
        try {
            return await db.getNewOrdersCount();
        } catch (error) {
            console.error('[main.js] Error in get-new-orders-count:', error);
            return { success: false, count: 0, message: error.message };
        }
    });
    ipcMain.handle('get-top-selling-proxy', async () => { // Proxy for top selling
        console.log('[main.js] IPC get-top-selling-proxy');
        try {
            return await db.getTopSellingProductsByQuantity(7); // Get top 7 for chart
        } catch (error) {
            console.error('[main.js] Error in get-top-selling-proxy:', error);
            return { success: false, products: [], message: error.message };
        }
    });

    // --- File Processing ---
    ipcMain.handle('import-initial-items', async (event, { fileData }) => {
        const username = currentUser?.username;
        const fileName = fileData?.name || 'Unknown file';
        logActivity(username, 'Started initial item import', `File: ${fileName}`);
        let result; // Define result outside try-catch to ensure it's available for final logging

        try {
            // --- Start of processing logic ---
            if (!fileData || !fileData.contentBase64) {
                 throw new Error("File data or content is missing.");
            }
            const { contentBase64, type } = fileData;
            console.log(`[main.js] IPC import-initial-items: Processing file ${fileName}`);
            const buffer = Buffer.from(contentBase64, 'base64');
            let itemsToParse = [];

            // Determine file type and parse
            if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName.endsWith('.xlsx')) {
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) throw new Error("XLSX file contains no sheets.");
                const worksheet = workbook.Sheets[sheetName];
                itemsToParse = XLSX.utils.sheet_to_json(worksheet, { defval: null }); // Use defval: null to handle empty cells
            } else if (type === 'text/csv' || fileName.endsWith('.csv')) {
                const csv = buffer.toString('utf-8');
                const parseResult = Papa.parse(csv, { header: true, skipEmptyLines: true });
                if (parseResult.errors.length > 0) {
                     console.warn(`[main.js] CSV parsing errors for ${fileName}:`, parseResult.errors);
                     // Decide if partial processing is okay or throw error
                }
                itemsToParse = parseResult.data;
            } else {
                throw new Error(`Unsupported file type: ${type || 'unknown'}`);
            }
             // --- End of parsing ---

            // Initialize results structure
             result = {
                fileName: fileName,
                processedCount: itemsToParse.length,
                successCount: 0,
                errors: []
            };

            if (itemsToParse.length === 0) {
                 result.errors.push("No data rows found in the file.");
                 // No need to proceed further
            } else {
                const skuSet = new Set(); // Track SKUs in this batch

                for (const [index, item] of itemsToParse.entries()) {
                    const rowNum = index + 2; // Assuming header is row 1
                    const normalizedItem = {};
                    for (const key in item) {
                        // Handle keys with spaces or different casing
                        normalizedItem[key.trim().toLowerCase()] = item[key];
                    }

                    const sku = normalizedItem.sku !== null && normalizedItem.sku !== undefined ? String(normalizedItem.sku).trim() : null;
                    const name = normalizedItem.name !== null && normalizedItem.name !== undefined ? String(normalizedItem.name).trim() : null;

                    if (!sku) {
                        results.errors.push(`Row ${rowNum}: Missing SKU.`);
                        continue;
                    }
                    if (!name) {
                         results.errors.push(`Row ${rowNum} (SKU: ${sku}): Missing Name.`);
                        continue;
                    }
                    if (skuSet.has(sku)) {
                        results.errors.push(`Row ${rowNum}: Duplicate SKU ${sku} found within the import file. Skipped.`);
                        continue;
                    }
                    skuSet.add(sku);

                    // Prepare data for database insertion
                    const itemDbData = {
                        name: name,
                        sku: sku,
                        description: String(normalizedItem.description || '').trim(),
                        cost_price: parseFloat(normalizedItem.cost || normalizedItem.cost_price) || 0,
                        quantity: parseInt(normalizedItem.quantity, 10) || 0,
                        category: String(normalizedItem.category || 'Uncategorized').trim(),
                        storage_location: String(normalizedItem.storage || normalizedItem.storage_location || 'Main Warehouse').trim(),
                        status: String(normalizedItem.status || 'Normal').trim(),
                        variant: String(normalizedItem.variant || '').trim()
                    };

                    // Database interaction within loop
                    try {
                        const existingItems = await db.getItems({ searchTerm: sku }); // Check existence
                        const alreadyExists = existingItems.some(existing => existing.sku === sku);

                        if (alreadyExists) {
                            result.errors.push(`Row ${rowNum}: Item with SKU ${sku} already exists. Skipped.`);
                            continue;
                        }

                        const creationResult = await db.createItem(itemDbData);
                        if (creationResult.success) {
                            result.successCount++;
                        } else {
                            result.errors.push(`Row ${rowNum} (SKU: ${sku}): Failed - ${creationResult.message || 'DB error'}`);
                        }
                    } catch (dbError) {
                        result.errors.push(`Row ${rowNum} (SKU: ${sku}): Processing Error - ${dbError.message}`);
                    }
                } // End of loop
            } // End of else (itemsToParse.length > 0)

            console.log('[main.js] Initial import results:', result);
            logActivity(username, 'Finished initial item import', `File: ${fileName}, Imported: ${result.successCount}, Errors/Skipped: ${result.errors.length}`);
            return { success: true, ...result }; // Return success true overall, with detailed results

        } catch (error) {
            console.error('[main.js] Critical error during initial import:', error);
            logActivity(username, 'Error processing initial import file', `File: ${fileName}, Error: ${error.message}`);
            // Ensure result is defined even in outer catch
             result = {
                fileName: fileName,
                processedCount: 0,
                successCount: 0,
                errors: [`Critical processing error: ${error.message}`]
            };
            return { success: false, ...result }; // Indicate overall failure
        }
    });


    ipcMain.handle('process-inventory-file', async (event, { fileData, actionType, columnMapping }) => {
         const username = currentUser?.username;
         const fileName = fileData?.name || 'Unknown file';
         logActivity(username, `Started bulk stock update (${actionType})`, `File: ${fileName}`);
         let result; // Define outside try

        try {
             // --- Start of processing logic ---
            if (!fileData || !fileData.contentBase64) {
                 throw new Error("File data or content is missing.");
            }
             const { contentBase64, type } = fileData;
             console.log(`[main.js] IPC process-inventory-file: Processing file ${fileName}, Action: ${actionType}`);
             const buffer = Buffer.from(contentBase64, 'base64');
             let itemsToParse = [];

             // Parse file
             if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName.endsWith('.xlsx')) {
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                 if (!sheetName) throw new Error("XLSX file contains no sheets.");
                const worksheet = workbook.Sheets[sheetName];
                itemsToParse = XLSX.utils.sheet_to_json(worksheet, { defval: null });
            } else if (type === 'text/csv' || fileName.endsWith('.csv')) {
                const csv = buffer.toString('utf-8');
                const parseResult = Papa.parse(csv, { header: true, skipEmptyLines: true });
                 if (parseResult.errors.length > 0) {
                     console.warn(`[main.js] CSV parsing errors for ${fileName}:`, parseResult.errors);
                }
                itemsToParse = parseResult.data;
            } else {
                 throw new Error(`Unsupported file type: ${type || 'unknown'}`);
            }
             // --- End of parsing ---

              // Initialize results
              result = {
                 fileName: fileName,
                 processedCount: itemsToParse.length,
                 successCount: 0,
                 errors: []
             };

             if (itemsToParse.length === 0) {
                  result.errors.push("No data rows found in the file.");
             } else {
                  // Validate column mapping headers exist in the first row (if header: true was used)
                  const firstRowKeys = Object.keys(itemsToParse[0] || {});
                  if (!firstRowKeys.includes(columnMapping.sku)) {
                       result.errors.push(`Required header '${columnMapping.sku}' not found in the file.`);
                  }
                  if (!firstRowKeys.includes(columnMapping.quantity)) {
                       result.errors.push(`Required header '${columnMapping.quantity}' not found in the file.`);
                  }

                  // Proceed only if headers are present
                  if (result.errors.length === 0) {
                     for (const [index, item] of itemsToParse.entries()) {
                         const rowNum = index + 2;
                         const sku = item[columnMapping.sku] !== null && item[columnMapping.sku] !== undefined ? String(item[columnMapping.sku]).trim() : null;
                         const quantityFromFileStr = item[columnMapping.quantity];
                         const quantityFromFile = parseInt(quantityFromFileStr, 10);

                         if (!sku) {
                             result.errors.push(`Row ${rowNum}: Missing SKU (header '${columnMapping.sku}').`);
                             continue;
                         }
                         if (isNaN(quantityFromFile)) {
                             result.errors.push(`Row ${rowNum} (SKU: ${sku}): Invalid quantity '${quantityFromFileStr}' (header '${columnMapping.quantity}').`);
                             continue;
                         }

                         // Database update logic
                         try {
                             const itemsWithSku = await db.getItems({ searchTerm: sku });
                             const existingItem = itemsWithSku.find(i => i.sku === sku); // Exact match

                             if (!existingItem) {
                                 result.errors.push(`Row ${rowNum}: Item with SKU ${sku} not found.`);
                                 continue;
                             }

                             let newQuantity;
                             const currentQuantity = parseInt(existingItem.quantity, 10) || 0;

                             switch (actionType) {
                                 case 'add':
                                     newQuantity = currentQuantity + quantityFromFile;
                                     break;
                                 case 'deduct':
                                     newQuantity = Math.max(0, currentQuantity - quantityFromFile);
                                     break;
                                 case 'set':
                                     newQuantity = Math.max(0, quantityFromFile); // Ensure non-negative
                                     break;
                                 default:
                                     result.errors.push(`Row ${rowNum} (SKU: ${sku}): Invalid action type '${actionType}'.`);
                                     continue;
                             }

                             const updateResult = await db.updateItem(existingItem.id, { quantity: newQuantity });
                             if (updateResult.success) {
                                 result.successCount++;
                             } else {
                                 result.errors.push(`Row ${rowNum} (SKU: ${sku}): Update Failed - ${updateResult.message || 'DB error'}`);
                             }
                         } catch (dbError) {
                             result.errors.push(`Row ${rowNum} (SKU: ${sku}): Processing Error - ${dbError.message}`);
                         }
                     } // End of loop
                 } // End if headers are okay
             } // End else (itemsToParse.length > 0)

             console.log('[main.js] Bulk update results:', result);
             logActivity(username, `Finished bulk stock update (${actionType})`, `File: ${fileName}, Updated: ${result.successCount}, Errors: ${result.errors.length}`);
             return { success: true, ...result };

        } catch (error) {
             console.error('[main.js] Critical error during bulk update:', error);
             logActivity(username, `Error processing bulk update file (${actionType})`, `File: ${fileName}, Error: ${error.message}`);
              // Ensure result is defined
              result = {
                 fileName: fileName,
                 processedCount: 0,
                 successCount: 0,
                 errors: [`Critical processing error: ${error.message}`]
             };
             return { success: false, ...result };
        }
    });

    // --- Export Handler ---
    ipcMain.handle('export-inventory', async (event) => {
         const username = currentUser?.username;
         logActivity(username, 'Started inventory export');
         let result; // Define outside try

        try {
            // --- Start export logic ---
             let items;
             try {
                 items = await db.getAllItemsForExport();
                 if (!items || items.length === 0) {
                     console.log('[IPC export-inventory] No items found.');
                     result = { success: true, message: 'No inventory items found to export.' };
                     logActivity(username, 'Finished inventory export', 'Status: Success (No data)');
                     return result; // Exit early
                 }
                 console.log(`[IPC export-inventory] Fetched ${items.length} items.`);
             } catch (fetchError) {
                  console.error('[IPC export-inventory] Error fetching items:', fetchError);
                 throw new Error(`Failed to fetch inventory data: ${fetchError.message}`); // Throw to outer catch
             }

             let csvContent;
             try {
                 const headers = ['sku', 'name', 'variant', 'description', 'category', 'storage_location', 'quantity', 'cost_price', 'status', 'created_at', 'updated_at'];
                 csvContent = convertToCSV(items, headers);
                 console.log('[IPC export-inventory] Formatted data to CSV.');
             } catch (formatError) {
                 console.error('[IPC export-inventory] Error formatting data:', formatError);
                 throw new Error(`Failed to format data: ${formatError.message}`);
             }

             let filePath;
             try {
                 const window = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
                 if (!window) {
                     throw new Error('Could not get window reference for save dialog.');
                 }
                 const { canceled, filePath: chosenPath } = await dialog.showSaveDialog(window, {
                    title: 'Save Inventory Export',
                    defaultPath: `inventory-export-${new Date().toISOString().split('T')[0]}.csv`,
                    filters: [ { name: 'CSV Files', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] } ]
                 });

                 if (canceled || !chosenPath) {
                     console.log('[IPC export-inventory] User cancelled save.');
                     result = { success: true, message: 'Export cancelled by user.' };
                     logActivity(username, 'Finished inventory export', 'Status: Cancelled');
                     return result; // Exit early
                 }
                 filePath = chosenPath;
                 console.log(`[IPC export-inventory] User selected path: ${filePath}`);
             } catch (dialogError) {
                  console.error('[IPC export-inventory] Error showing save dialog:', dialogError);
                 throw new Error(`Failed to show save dialog: ${dialogError.message}`);
             }

             try {
                 fs.writeFileSync(filePath, csvContent, 'utf-8');
                 console.log('[IPC export-inventory] Successfully wrote CSV file.');
                 result = { success: true, message: `Inventory exported successfully to ${path.basename(filePath)}` };
                 logActivity(username, 'Finished inventory export', `Status: Success, File: ${path.basename(filePath)}`);
                 return result;
             } catch (writeError) {
                  console.error('[IPC export-inventory] Error writing CSV file:', writeError);
                 throw new Error(`Failed to save file: ${writeError.message}`);
             }
             // --- End export logic ---

        } catch (error) { // Catch errors from any step within the export process
             console.error('[main.js] Critical error during export inventory:', error);
             logActivity(username, 'Error during inventory export', error.message);
              result = {
                 success: false,
                 message: `Export failed: ${error.message}`
             };
             return result;
        }
    });


     // --- Activity Log Fetch Handler ---
     ipcMain.handle('get-activity-log', async () => {
         console.log('[main.js] IPC get-activity-log called.');
         try {
             // Fetch from Supabase instead of local file
             const logEntries = await db.getActivityLogEntries(50); // Fetch latest 50

              // IMPORTANT: Map the data structure if needed to match frontend expectations
              // Frontend expects: { id, timestamp, user, action, details }
              // DB has: { id, created_at, user_identifier, action, details }
              const formattedLog = logEntries.map(entry => ({
                  id: entry.id,
                  timestamp: entry.created_at,
                  user: entry.user_identifier, // Map DB column name to expected prop name
                  action: entry.action,
                  details: entry.details || '' // Ensure details is at least an empty string
              }));

             return formattedLog;

         } catch(error) {
              console.error('[main.js] Error fetching activity log from DB:', error);
              logActivity('System', 'Error fetching activity log', error.message); // Log the error itself
              return []; // Return empty array on error
         }
     });


    console.log('[main.js] IPC Handlers setup complete.');

    // Create the main application window
    createWindow();
});

// --- Other App Lifecycle Events ---
app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', function () {
    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    if (process.platform !== 'darwin') {
        console.log('[main.js] All windows closed, quitting app.');
        app.quit();
    } else {
         console.log('[main.js] All windows closed on macOS, app stays active.');
    }

});
ipcMain.handle('process-return', async (event, returnDetails) => {
    console.log('[main.js] IPC process-return called with details:', returnDetails);
    const username = currentUser?.username;
    const userId = currentUser?.id; // Assuming your currentUser object has the DB user ID

    // Validate input (basic)
    if (!returnDetails.itemId || !returnDetails.quantityReturned || !returnDetails.reason || !returnDetails.condition) {
        return { success: false, message: "Missing required return details (Item, Quantity, Reason, Condition)." };
    }

    const quantityReturned = parseInt(returnDetails.quantityReturned, 10);
    if (isNaN(quantityReturned) || quantityReturned <= 0) {
         return { success: false, message: "Invalid quantity returned." };
    }

    // 1. Prepare data for the returns table
    const returnRecordData = {
        item_id: returnDetails.itemId,
        quantity_returned: quantityReturned,
        reason: returnDetails.reason,
        condition: returnDetails.condition,
        customer_id: returnDetails.customerId || null, // Optional
        notes: returnDetails.notes || null,           // Optional
        processed_by_user_id: userId || null        // Optional: Log the user ID from DB
        // inventory_adjusted defaults to false
    };

    let createdReturnRecordId = null;
    let itemDetailsForLog = `Item ID: ${returnDetails.itemId}, Qty: ${quantityReturned}`; // Basic log details

    try {
        // 2. Create the return record
        const createResult = await db.createReturnRecord(returnRecordData);
        if (!createResult.success || !createResult.returnRecord) {
            throw new Error(createResult.message || 'Failed to save return record to database.');
        }
        createdReturnRecordId = createResult.returnRecord.id;
        console.log(`[main.js] Return record created: ${createdReturnRecordId}`);

         // Fetch item details *after* saving return record for better logging context
         try {
             const item = await db.getItemById(returnDetails.itemId);
             if(item) itemDetailsForLog = `Item: ${item.name} (SKU: ${item.sku || 'N/A'}), Qty: ${quantityReturned}, Reason: ${returnDetails.reason}, Condition: ${returnDetails.condition}`;
         } catch { /* ignore fetch error for logging */ }


        // 3. Adjust inventory IF resellable
        let adjustmentResult = { success: true }; // Assume success if no adjustment needed
        if (returnDetails.condition === 'Resellable') {
            console.log(`[main.js] Condition is Resellable. Attempting to increment inventory for item ID: ${returnDetails.itemId}`);
            adjustmentResult = await db.incrementItemQuantity(returnDetails.itemId, quantityReturned);

            if (!adjustmentResult.success) {
                // Log the failure but the return record is already saved.
                // This indicates an inventory inconsistency that needs attention.
                 logActivity(username, 'Return Inventory Adjustment FAILED', `Return ID: ${createdReturnRecordId}, ${itemDetailsForLog}, Error: ${adjustmentResult.message}`);
                 console.error(`[main.js] FAILED to adjust inventory for return ${createdReturnRecordId}: ${adjustmentResult.message}`);
                 // Return success false for the overall operation because inventory failed
                 return { success: false, message: `Return recorded (ID: ${createdReturnRecordId}), BUT failed to update inventory: ${adjustmentResult.message}. Please check inventory manually.` };
            } else {
                 console.log(`[main.js] Inventory adjusted successfully for item ID: ${returnDetails.itemId}`);
                 // Optionally mark the return record as adjusted
                 await db.markReturnInventoryAdjusted(createdReturnRecordId); // Fire-and-forget or handle error
            }
        } else {
             console.log(`[main.js] Condition is '${returnDetails.condition}'. No inventory adjustment needed.`);
        }

        // 4. Log successful processing
        logActivity(username, 'Processed product return', `${itemDetailsForLog}${adjustmentResult.success && returnDetails.condition === 'Resellable' ? ' (Inventory Adjusted)' : ''}`);
        return { success: true, message: `Return processed successfully.${adjustmentResult.success && returnDetails.condition === 'Resellable' ? ' Inventory updated.' : ''}`, returnId: createdReturnRecordId };

    } catch (error) {
        console.error('[main.js] Error processing return:', error);
        logActivity(username, 'Error processing return', `Details: ${itemDetailsForLog}, Error: ${error.message}`);
        return { success: false, message: `Failed to process return: ${error.message}` };
    }
});

// Add IPC Handler for fetching return history (optional, for a future list page)
ipcMain.handle('get-returns', async (event, filters) => {
     console.log('[main.js] IPC get-returns called with filters:', filters);
     try {
         return await db.getReturnRecords(filters || {}, 50); // Get latest 50
     } catch (error) {
         console.error('[main.js] Error fetching return records:', error);
         logActivity(currentUser?.username, 'Error fetching return records', error.message);
         return { error: error.message || 'Failed to fetch return records.' };
     }
});

// --- END OF FILE ---