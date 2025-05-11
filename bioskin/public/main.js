// public/main.js
   const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require('electron');
   const path = require('path');
   const fs = require('fs');
   const isDev = require('electron-is-dev');
   const { db } = require('../src/supabaseClient');
   const bcrypt = require('bcrypt');
   const XLSX = require('xlsx');
   const Papa = require('papaparse');

   // Load environment variables
   require('dotenv').config();

   // Path to users file (adjust if needed)
   // Use app.getAppPath() for reliability, especially after packaging
   const usersFilePath = path.join(app.getAppPath(), 'users.json');

   // Variable to hold the currently logged-in user's info (simple session)
   let currentUser = null;

   let mainWindow;

   // --- Electron App Lifecycle ---
   function createWindow() {
       // ---> SECTION TO SET UP THE ICON <---
       const iconPath = path.join(__dirname, 'logo.png'); // Path to your icon in the 'public' folder
       let windowIcon = null;

       if (fs.existsSync(iconPath)) {
           windowIcon = nativeImage.createFromPath(iconPath);
           console.log(`Window icon loaded from: ${iconPath}`);
       } else {
           console.warn(`Window icon NOT FOUND at: ${iconPath}. Using default Electron icon.`);
       }
       // ---> END OF ICON SETUP SECTION <---

       mainWindow = new BrowserWindow({
           width: 1200,
           height: 800,
           title: "Bioskin Inventory Management System",
           icon: windowIcon,
           webPreferences: {
               preload: path.join(__dirname, 'preload.js'), // Assumes preload.js is in public/
               contextIsolation: true,
               nodeIntegration: false,
           },
       });

       Menu.setApplicationMenu(null);

       const startUrl = isDev
           ? 'http://localhost:3000'
           : `file://${path.join(__dirname, '../build/index.html')}`; // For production
       mainWindow.loadURL(startUrl);

       mainWindow.webContents.on('did-finish-load', () => {
           mainWindow.webContents.executeJavaScript(`
               window.env = {
                   REACT_APP_SUPABASE_URL: "${process.env.REACT_APP_SUPABASE_URL}",
                   REACT_APP_SUPABASE_ANON_KEY: "${process.env.REACT_APP_SUPABASE_ANON_KEY}"
               };
           `);
       });

       if (isDev) {
           mainWindow.webContents.openDevTools({ mode: 'detach' });
       }
   }

   // --- App Ready Event ---
   app.whenReady().then(() => {
       createWindow(); // Create the application window

       app.on('activate', function () {
           // Re-create window on macOS dock click if none are open
           if (BrowserWindow.getAllWindows().length === 0) createWindow();
       });
   });

   // --- App Window Closed Event ---
   app.on('window-all-closed', function () {
       // Quit the app on all platforms except macOS
       if (process.platform !== 'darwin') app.quit();
   });

   // --- IPC Handlers (Backend Logic for Frontend Requests) ---

   // Handle request to get all items
   ipcMain.handle('get-items', async (event, filters) => {
       try {
           return await db.getItems(filters);
       } catch (error) {
           console.error('Error getting items:', error);
           throw error;
       }
   });

   ipcMain.handle('get-item-by-id', async (event, id) => {
       try {
           return await db.getItemById(id);
       } catch (error) {
           console.error('Error getting item by id:', error);
           throw error;
       }
   });

   // Handle request to add a new item
   ipcMain.handle('create-item', async (event, itemData) => {
       try {
           return await db.createItem(itemData);
       } catch (error) {
           console.error('Error creating item:', error);
           throw error;
       }
   });

   // Handle request to update an existing item
   ipcMain.handle('update-item', async (event, id, itemData) => {
       try {
           return await db.updateItem(id, itemData);
       } catch (error) {
           console.error('Error updating item:', error);
           throw error;
       }
   });

   ipcMain.handle('delete-item', async (event, id) => {
       try {
           return await db.deleteItem(id);
    } catch (error) {
           console.error('Error deleting item:', error);
           throw error;
    }
   });

   // --- Authentication IPC Handlers ---

   function readUsers() {
     try {
       // Check if file exists before reading
       if (fs.existsSync(usersFilePath)) {
         const data = fs.readFileSync(usersFilePath, 'utf-8');
         return JSON.parse(data);
       }
       console.warn(`Users file not found at: ${usersFilePath}`);
       return []; // Return empty array if file doesn't exist
     } catch (error) {
       console.error("Error reading users file:", error);
       return []; // Return empty on error
     }
   }

   ipcMain.handle('login', async (event, credentials) => {
       try {
           return await db.login(credentials.username, credentials.password);
     } catch (error) {
           console.error('Error during login:', error);
           throw error;
     }
   });

   ipcMain.handle('logout', async () => {
       try {
           await db.logout();
           return { success: true };
       } catch (error) {
           console.error('Error during logout:', error);
           throw error;
       }
   });

   // Allows the frontend to check who is logged in when it starts up
   ipcMain.handle('get-current-user', async () => {
       try {
           return await db.getCurrentUser();
       } catch (error) {
           console.error('Error getting current user:', error);
           throw error;
       }
   });

   // --- End Authentication IPC Handlers ---
   // REPLACE the existing 'get-inventory-summary' handler's try...catch block with this:
   ipcMain.handle('get-inventory-summary', async () => {
       try {
           return await db.getInventorySummary();
     } catch (error) {
           console.error('Error getting inventory summary:', error);
           throw error;
     }
   });

   // REPLACE the existing 'get-low-stock-items' handler's try...catch block with this:
   ipcMain.handle('get-low-stock-items', async (event, threshold) => {
       try {
           return await db.getLowStockItems(threshold);
     } catch (error) {
           console.error('Error getting low stock items:', error);
           throw error;
       }
   });

   ipcMain.handle('import-initial-items', async (event, fileData) => {
       try {
           const { contentBase64, type } = fileData;
           const buffer = Buffer.from(contentBase64, 'base64');
           let items = [];

           if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
               const workbook = XLSX.read(buffer);
               const sheetName = workbook.SheetNames[0];
               const worksheet = workbook.Sheets[sheetName];
               items = XLSX.utils.sheet_to_json(worksheet);
           } else if (type === 'text/csv') {
               const csv = buffer.toString();
               const result = Papa.parse(csv, { header: true });
               items = result.data;
           }

           const results = {
               processedCount: items.length,
               successCount: 0,
               errors: []
           };

           for (const item of items) {
               try {
                   await db.createItem({
                       name: item.Name,
                       sku: item.SKU,
                       description: item.Description,
                       cost_price: parseFloat(item.Cost) || 0,
                       quantity: parseInt(item.Quantity, 10) || 0,
                       category: 'Uncategorized', // Default category
                       storage_location: 'Main Warehouse', // Default storage
                       status: 'Normal'
                   });
                   results.successCount++;
               } catch (error) {
                   results.errors.push(`Failed to import item ${item.SKU || item.Name}: ${error.message}`);
               }
           }

           return results;
       } catch (error) {
           console.error('Error processing initial import:', error);
           throw error;
       }
   });

   ipcMain.handle('process-inventory-file', async (event, fileData) => {
       try {
           const { contentBase64, type, actionType, columnMapping } = fileData;
           const buffer = Buffer.from(contentBase64, 'base64');
           let items = [];

           if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
               const workbook = XLSX.read(buffer);
               const sheetName = workbook.SheetNames[0];
               const worksheet = workbook.Sheets[sheetName];
               items = XLSX.utils.sheet_to_json(worksheet);
           } else if (type === 'text/csv') {
               const csv = buffer.toString();
               const result = Papa.parse(csv, { header: true });
               items = result.data;
           }

           const results = {
               processedCount: items.length,
               successCount: 0,
               errors: []
           };

           for (const item of items) {
               try {
                   const sku = item[columnMapping.sku];
                   const quantity = parseInt(item[columnMapping.quantity], 10) || 0;
                   
                   if (!sku) {
                       results.errors.push('Missing SKU in row');
                       continue;
                   }

                   const existingItem = await db.getItemById(sku);
                   if (!existingItem) {
                       results.errors.push(`Item with SKU ${sku} not found`);
                       continue;
                   }

                   let newQuantity;
                   switch (actionType) {
                       case 'add':
                           newQuantity = existingItem.quantity + quantity;
                           break;
                       case 'deduct':
                           newQuantity = Math.max(0, existingItem.quantity - quantity);
                           break;
                       case 'set':
                           newQuantity = quantity;
                           break;
                       default:
                           throw new Error('Invalid action type');
                   }

                   await db.updateItem(existingItem.id, { quantity: newQuantity });
                   results.successCount++;
               } catch (error) {
                   results.errors.push(`Failed to process item: ${error.message}`);
               }
           }

           return results;
       } catch (error) {
           console.error('Error processing inventory file:', error);
           throw error;
       }
   });

