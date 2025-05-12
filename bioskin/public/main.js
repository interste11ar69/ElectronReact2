// public/main.js
require('dotenv').config(); // MUST BE THE VERY FIRST LINE

const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs'); // Keep for icon loading, remove if not used elsewhere
const isDev = require('electron-is-dev');

// Only import 'db' which contains your custom login and all other DB operations
const { db } = require('../src/supabaseClient');
// const { authUtils } = require('../src/supabaseClient'); // REMOVE THIS - Not used for custom auth

const XLSX = require('xlsx'); // Keep for file processing
const Papa = require('papaparse'); // Keep for file processing

// const usersFilePath = path.join(app.getAppPath(), 'users.json'); // REMOVE - users are in Supabase DB
let currentUser = null; // In-memory store for the currently logged-in user (custom auth)
let mainWindow;

function createWindow() {
    const iconPath = path.join(__dirname, 'logo.png');
    let windowIcon = null;
    if (fs.existsSync(iconPath)) {
        windowIcon = nativeImage.createFromPath(iconPath);
        console.log(`Window icon loaded from: ${iconPath}`);
    } else {
        console.warn(`Window icon NOT FOUND at: ${iconPath}. Using default Electron icon.`);
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Bioskin Inventory Management System",
        icon: windowIcon,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    Menu.setApplicationMenu(null); // Remove default menu

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../build/index.html')}`;
    mainWindow.loadURL(startUrl);

    // mainWindow.webContents.on('did-finish-load', () => {
    //     // Exposing env vars this way is generally not recommended for security if preload script is used.
    //     // The main process should handle all interactions requiring sensitive keys.
    //     // If React needs non-sensitive env vars, use REACT_APP_ prefix and build process.
    // });

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

app.whenReady().then(createWindow);

app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS ---

// --- Custom Authentication IPC Handlers ---
ipcMain.handle('login', async (event, credentials) => {
    console.log(`[main.js] IPC login attempt for username: ${credentials.username}`);
    const result = await db.login(credentials.username, credentials.password);
    if (result.success && result.user) {
        currentUser = result.user;
        console.log(`[main.js] Login successful. Current user set:`, currentUser);
    } else {
        currentUser = null;
        console.log(`[main.js] Login failed. Reason: ${result.message || 'Unknown (check db.login)'}`);
    }
    return result;
});

ipcMain.handle('get-current-user', async () => {
    console.log(`[main.js] IPC get-current-user. Returning:`, currentUser);
    return currentUser;
});

ipcMain.handle('logout', async () => {
    console.log(`[main.js] IPC logout. Clearing current user.`);
    currentUser = null;
    return { success: true };
});

// --- Database Operation IPC Handlers ---
ipcMain.handle('get-items', async (event, filters) => {
    try {
        console.log('[main.js] IPC get-items called with filters:', filters);
        return await db.getItems(filters);
    } catch (error) {
        console.error('[main.js] Error in get-items handler:', error);
        return { success: false, message: error.message, items: [] }; // Return structured error
    }
});

ipcMain.handle('get-item-by-id', async (event, id) => {
    try {
        return await db.getItemById(id);
    } catch (error) {
        console.error('[main.js] Error getting item by id:', id, error);
        return null; // Or structured error
    }
});

ipcMain.handle('create-item', async (event, itemData) => { // Renamed from 'add-item' to match preload
    try {
        console.log('[main.js] IPC create-item called with data:', itemData);
        return await db.createItem(itemData);
    } catch (error) {
        console.error('[main.js] Error creating item:', itemData, error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('update-item', async (event, itemDataWithId) => { // Expects a single object with 'id'
    try {
        console.log('[main.js] IPC update-item called with data:', itemDataWithId);
        if (!itemDataWithId || !itemDataWithId.id) {
            console.error('[main.js] Update item error: ID missing from itemData.');
            return { success: false, message: "Item ID is required for update." };
        }
        const { id, ...dataToUpdate } = itemDataWithId; // Destructure ID from the rest of the data
        return await db.updateItem(id, dataToUpdate);
    } catch (error) {
        console.error(`[main.js] Error updating item ID ${itemDataWithId?.id}:`, error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('delete-item', async (event, id) => {
    try {
        console.log('[main.js] IPC delete-item called for ID:', id);
        return await db.deleteItem(id);
    } catch (error) {
        console.error(`[main.js] Error deleting item ID ${id}:`, error);
        return { success: false, message: error.message };
    }
});
// --- NEW CUSTOMER IPC HANDLERS ---
ipcMain.handle('get-customers', async (event, filters) => {
  console.log('[Main Process] Received "get-customers" request with filters:', filters);
  try {
    const customers = await db.getCustomers(filters);
    console.log('[Main Process] "get-customers" returning:', customers ? customers.length : 0, 'customers');
    return customers; // Return the array of customers (or an empty array)
  } catch (error) {
    console.error('[Main Process] Error in "get-customers" handler:', error);
    // It's often better to return a structured error object or throw
    // so the renderer can distinguish between an empty result and an error.
    // For now, returning an object with an error property:
    return { error: error.message || 'Failed to fetch customers.' };
  }
});

ipcMain.handle('get-customer-by-id', async (event, id) => {
  console.log('[Main Process] Received "get-customer-by-id" request for ID:', id);
  try {
    const customer = await db.getCustomerById(id);
    return customer;
  } catch (error) {
    console.error('[Main Process] Error in "get-customer-by-id" handler:', error);
    return { error: error.message || 'Failed to fetch customer by ID.' };
  }
});

ipcMain.handle('create-customer', async (event, customerData) => {
  console.log('[Main Process] Received "create-customer" request with data:', customerData);
  try {
    // db.createCustomer should return { success: true/false, customer: data/null, message: '...' }
    return await db.createCustomer(customerData);
  } catch (error) { // This catch is if db.createCustomer itself throws unexpectedly
    console.error('[Main Process] Error in "create-customer" handler:', error);
    return { success: false, message: error.message || 'Unexpected error creating customer.' };
  }
});

ipcMain.handle('update-customer', async (event, customerDataWithId) => {
  console.log('[Main Process] Received "update-customer" request with data:', customerDataWithId);
  try {
    const { id, ...customerData } = customerDataWithId;
    if (!id) {
      return { success: false, message: "Customer ID is missing for update." };
    }
    // db.updateCustomer should return { success: true/false, customer: data/null, message: '...' }
    return await db.updateCustomer(id, customerData);
  } catch (error) { // This catch is if db.updateCustomer itself throws unexpectedly
    console.error('[Main Process] Error in "update-customer" handler:', error);
    return { success: false, message: error.message || 'Unexpected error updating customer.' };
  }
});

ipcMain.handle('delete-customer', async (event, id) => {
  console.log('[Main Process] Received "delete-customer" request for ID:', id);
  try {
    // db.deleteCustomer should return { success: true/false, message: '...' }
    return await db.deleteCustomer(id);
  } catch (error) { // This catch is if db.deleteCustomer itself throws unexpectedly
    console.error('[Main Process] Error in "delete-customer" handler:', error);
    return { success: false, message: error.message || 'Unexpected error deleting customer.' };
  }
});

ipcMain.handle('get-inventory-summary', async () => {
    try {
        return await db.getInventorySummary();
    } catch (error) {
        console.error('[main.js] Error getting inventory summary:', error);
        return { success: false, message: error.message, summary: null };
    }
});

ipcMain.handle('get-low-stock-items', async (event, threshold) => {
    try {
        return await db.getLowStockItems(threshold);
    } catch (error) {
        console.error('[main.js] Error getting low stock items:', error);
        return { success: false, message: error.message, items: [] };
    }
});

ipcMain.handle('import-initial-items', async (event, { fileData }) => { // Destructure fileData from args
    try {
        const { contentBase64, type, name: fileName } = fileData; // Assuming name is part of fileData
        console.log(`[main.js] IPC import-initial-items called for file: ${fileName}`);
        const buffer = Buffer.from(contentBase64, 'base64');
        let itemsToParse = [];

        if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName.endsWith('.xlsx')) {
            const workbook = XLSX.read(buffer, {type: 'buffer'});
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            itemsToParse = XLSX.utils.sheet_to_json(worksheet);
        } else if (type === 'text/csv' || fileName.endsWith('.csv')) {
            const csv = buffer.toString('utf-8');
            const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
            itemsToParse = result.data;
        } else {
            return { success: false, message: `Unsupported file type: ${type || 'unknown'}` };
        }

        const results = {
            fileName: fileName,
            processedCount: itemsToParse.length,
            successCount: 0,
            errors: []
        };

        for (const item of itemsToParse) {
            // Ensure your item properties match the expectedColumns: ['SKU', 'Name', 'Description', 'Cost', 'Quantity']
            const sku = item.SKU || item.sku;
            const name = item.Name || item.name;

            if (!sku || !name) {
                results.errors.push(`Row missing SKU or Name: ${JSON.stringify(item)}`);
                continue;
            }

            try {
                // Check if item with SKU already exists (optional, depends on desired behavior)
                // const existing = await db.getItemBySku(sku); // You'd need to implement getItemBySku
                // if (existing) {
                //    results.errors.push(`Item with SKU ${sku} already exists. Skipped.`);
                //    continue;
                // }

                await db.createItem({ // This is db.createItem from supabaseClient.js
                    name: name,
                    sku: sku,
                    description: item.Description || item.description || '',
                    cost_price: parseFloat(item.Cost || item.cost || item.cost_price) || 0,
                    quantity: parseInt(item.Quantity || item.quantity, 10) || 0,
                    category: item.Category || item.category || 'Uncategorized',
                    storage_location: item.Storage || item.storage || item.storage_location || 'Main Warehouse',
                    status: item.Status || item.status || 'Normal'
                });
                results.successCount++;
            } catch (dbError) {
                results.errors.push(`Failed to import item ${sku} (${name}): ${dbError.message}`);
            }
        }
        console.log('[main.js] Initial import results:', results);
        return { success: true, ...results }; // Ensure result structure matches frontend expectation
    } catch (error) {
        console.error('[main.js] Error processing initial import file:', error);
        return { success: false, message: error.message, processedCount: 0, successCount: 0, errors: [error.message] };
    }
});

ipcMain.handle('process-inventory-file', async (event, { fileData, actionType, columnMapping }) => { // Destructure args
    try {
        const { contentBase64, type, name: fileName } = fileData;
        console.log(`[main.js] IPC process-inventory-file called for file: ${fileName}, action: ${actionType}`);
        const buffer = Buffer.from(contentBase64, 'base64');
        let itemsToParse = [];

        if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName.endsWith('.xlsx')) {
            const workbook = XLSX.read(buffer, {type: 'buffer'});
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            itemsToParse = XLSX.utils.sheet_to_json(worksheet);
        } else if (type === 'text/csv' || fileName.endsWith('.csv')) {
            const csv = buffer.toString('utf-8');
            const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
            itemsToParse = result.data;
        } else {
            return { success: false, message: `Unsupported file type: ${type || 'unknown'}` };
        }

        const results = {
            fileName: fileName,
            processedCount: itemsToParse.length,
            successCount: 0,
            errors: []
        };

        for (const item of itemsToParse) {
            const sku = item[columnMapping.sku]; // e.g., item['SKU']
            const quantityFromFile = parseInt(item[columnMapping.quantity], 10); // e.g., item['Quantity']

            if (!sku) {
                results.errors.push(`Row missing SKU (expected header '${columnMapping.sku}'): ${JSON.stringify(item)}`);
                continue;
            }
            if (isNaN(quantityFromFile)) {
                results.errors.push(`Invalid quantity for SKU ${sku} (expected header '${columnMapping.quantity}'): ${item[columnMapping.quantity]}`);
                continue;
            }

            try {
                // You might need a db.getItemBySku function in supabaseClient.js
                // For now, assuming your items table has SKU as a unique queryable field,
                // or you adjust this to fetch by a unique ID if SKU isn't primary/unique for lookup.
                // Let's assume you have a way to get an item by SKU.
                // This is a placeholder, you'll need to implement db.getItemBySku
                const itemsWithSku = await db.getItems({ searchTerm: sku }); // This might return multiple if SKU is not unique
                let existingItem = null;
                if (itemsWithSku && itemsWithSku.length > 0) {
                    // Find exact SKU match if searchTerm returns partial matches
                    existingItem = itemsWithSku.find(i => i.sku === sku);
                }

                if (!existingItem) {
                    results.errors.push(`Item with SKU ${sku} not found in database.`);
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
                        newQuantity = quantityFromFile;
                        break;
                    default:
                        results.errors.push(`Invalid action type '${actionType}' for SKU ${sku}`);
                        continue; // Skip this item
                }

                await db.updateItem(existingItem.id, { quantity: newQuantity });
                results.successCount++;
            } catch (dbError) {
                results.errors.push(`Failed to process SKU ${sku}: ${dbError.message}`);
            }
        }
        console.log('[main.js] Bulk update results:', results);
        return { success: true, ...results }; // Ensure result structure matches frontend expectation
    } catch (error) {
        console.error('[main.js] Error processing bulk inventory file:', error);
        return { success: false, message: error.message, processedCount: 0, successCount: 0, errors: [error.message] };
    }

});