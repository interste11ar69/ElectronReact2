// public/main.js
require("dotenv").config(); // MUST BE THE VERY FIRST LINE

const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  dialog,
} = require("electron"); // Added dialog
const path = require("path");
const os = require("os"); // Needed for logActivity ID generation (optional)
const fs = require("fs");
const isDev = require("electron-is-dev");
const { db } = require("../src/supabaseClient"); // Correct import
const XLSX = require("xlsx");
const Papa = require("papaparse");
const TRANSACTION_TYPES = {
  CYCLE_COUNT: "ADJUSTMENT_CYCLE_COUNT",
  DAMAGED: "ADJUSTMENT_DAMAGED",
  EXPIRED: "ADJUSTMENT_EXPIRED",
  MARKETING: "ADJUSTMENT_MARKETING",
  GIFT: "ADJUSTMENT_GIFT",
  INTERNAL_USE: "ADJUSTMENT_INTERNAL_USE",
  TRANSFER_ERROR: "ADJUSTMENT_TRANSFER_ERROR",
  FOUND_STOCK: "ADJUSTMENT_FOUND_STOCK",
  OTHER: "MANUAL_ADJUSTMENT_OTHER",
  UNKNOWN: "MANUAL_ADJUSTMENT_UNKNOWN",
  GOODS_RECEIVED_FACTORY: "ADJUSTMENT_GOODS_RECEIVED_FACTORY",
  // Add other transaction types used elsewhere (e.g., SALE_ITEM, RETURN_RESELLABLE) if this function might be used more broadly,
  // or keep it specific to stock adjustments.
};

// --- Global Variables ---
let currentUser = null;
let mainWindow;

// --- Central logging function ---
async function logActivity(user, action, details = "") {
  // Made async
  const userIdentifier = user || "System"; // Use 'System' if no user provided
  const entryData = {
    user_identifier: userIdentifier,
    action: action,
    details: details || null, // Ensure null if empty for DB
  };

  console.log(
    `[Attempting Log] User: ${userIdentifier}, Action: ${action}, Details: ${details}`
  );

  try {
    // Add entry to Supabase
    const result = await db.addActivityLogEntry(entryData);

    if (!result.success) {
      // Log failure to console, but don't necessarily stop the original operation
      console.error(
        `[main.js] Failed to add activity log to Supabase: ${result.message}`
      );
      // Don't try to send to renderer if DB write failed
      return;
    }

    // If successful, prepare data for the renderer notification
    // Use the data returned from insert if available, otherwise construct it
    const entryForRenderer = {
      id:
        result.entry?.id ||
        `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // Use DB ID or generate fallback
      timestamp: result.entry?.created_at || new Date().toISOString(), // Use DB timestamp or current time
      user: userIdentifier, // Use the identifier we logged with
      action: action,
      details: details || "", // Use empty string for consistency with previous frontend code
    };

    // Notify the renderer process (if window exists)
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send("new-log-entry", entryForRenderer); // Send the structured entry
        console.log("[main.js] Sent new-log-entry to renderer.");
      } catch (sendError) {
        console.warn(
          "[main.js] Error sending new-log-entry (window might be closing):",
          sendError.message
        );
      }
    } else {
      console.warn(
        "[main.js] Could not send new-log-entry: mainWindow not ready or destroyed."
      );
    }
  } catch (error) {
    // Catch unexpected errors from the db call itself
    console.error(
      "[main.js] Unexpected error during logActivity database operation:",
      error
    );
  }
}

// --- CSV Helper Function (Defined Globally) ---
        function convertToCSV(data, explicitHeaders) { // Modified to accept explicitHeaders
            if (!data || data.length === 0) {
                console.warn("[convertToCSV] No data provided to convert.");
                return '';
            }
            // Use provided explicitHeaders or infer from the first object's keys
            const headerKeys = explicitHeaders || Object.keys(data[0]);
            const headerString = headerKeys.join(',');

            const rows = data.map(row => {
                return headerKeys.map(key => {
                    let cell = row[key];
                    if (cell === null || cell === undefined) {
                        cell = '';
                    } else {
                        cell = String(cell);
                    }
                    if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                        cell = `"${cell.replace(/"/g, '""')}"`;
                    }
                    return cell;
                }).join(',');
            });
            return [headerString, ...rows].join('\n');
        }


        function mapReasonToTransactionType(reasonString) {
          if (!reasonString) return TRANSACTION_TYPES.UNKNOWN; // Fallback if reason is somehow empty

          const reasonLower = String(reasonString).toLowerCase().trim(); // Ensure it's a string before toLowerCase

          // More specific matches first
          if (reasonLower === "goods received from factory")
            return TRANSACTION_TYPES.GOODS_RECEIVED_FACTORY;
          if (reasonLower === "cycle count adjustment")
            return TRANSACTION_TYPES.CYCLE_COUNT;
          if (reasonLower === "damaged goods write-off")
            return TRANSACTION_TYPES.DAMAGED;
          if (reasonLower === "expired stock write-off")
            return TRANSACTION_TYPES.EXPIRED;
          if (reasonLower === "internal use") return TRANSACTION_TYPES.INTERNAL_USE;
          if (reasonLower === "stock transfer error correction")
            return TRANSACTION_TYPES.TRANSFER_ERROR;
          if (reasonLower === "found inventory") return TRANSACTION_TYPES.FOUND_STOCK;
          if (reasonLower === "other (specify in notes)")
            return TRANSACTION_TYPES.OTHER; // Exact match for this specific "Other"

          // Broader includes (be careful with order if keywords overlap)
          if (reasonLower.includes("sample") || reasonLower.includes("marketing"))
            return TRANSACTION_TYPES.MARKETING;
          if (reasonLower.includes("gift") || reasonLower.includes("giveaway"))
            return TRANSACTION_TYPES.GIFT;

          // If no specific keyword match, log a warning and use a generic fallback.
          console.warn(
            `[mapReasonToTransactionType] Unmapped reason: '${reasonString}'. Defaulting to ${TRANSACTION_TYPES.UNKNOWN}. Consider adding a specific mapping if this reason is common.`
          );
          return TRANSACTION_TYPES.UNKNOWN;
        }

// --- Create Window Function ---
function createWindow() {
  const iconPath = path.join(__dirname, "logo.png");
  let windowIcon = null;
  try {
    if (fs.existsSync(iconPath)) {
      windowIcon = nativeImage.createFromPath(iconPath);
      console.log(`[main.js] Window icon loaded from: ${iconPath}`);
    } else {
      console.warn(
        `[main.js] Window icon NOT FOUND at: ${iconPath}. Using default Electron icon.`
      );
    }
  } catch (iconError) {
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // Keep true (recommended)
      nodeIntegration: false, // Keep false (recommended)
      // spellcheck: false // Optional: disable spellcheck if needed
    },
  });

  Menu.setApplicationMenu(null); // Remove default menu unless you add custom items

  const startUrl = isDev
    ? "http://localhost:3000" // Ensure this port matches your React dev server
    : `file://${path.join(__dirname, "../build/index.html")}`; // Correct path for production build

  console.log(`[main.js] Loading URL: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  // Optional: Clear currentUser when window is closed
  mainWindow.on("closed", () => {
    console.log("[main.js] Main window closed. Clearing currentUser.");
    mainWindow = null;
    currentUser = null; // Clear user session on window close
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

// --- App Lifecycle Events ---
app.whenReady().then(() => {
  console.log("[main.js] App Ready. Setting up IPC Handlers...");

  // --- IPC HANDLERS ---
  // (Handlers should be defined here, inside whenReady, or globally before it)

  // --- Custom Authentication ---
  ipcMain.handle("login", async (event, credentials) => {
    console.log(
      `[main.js] IPC login attempt for username: ${credentials?.username}`
    );
    if (!credentials || !credentials.username || !credentials.password) {
      return { success: false, message: "Username and password required." };
    }
    const result = await db.login(credentials.username, credentials.password);
    if (result.success && result.user) {
      currentUser = result.user;
      logActivity(currentUser.username, "User logged in"); // Log successful login
      console.log(`[main.js] Login successful. User set:`, {
        id: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
      });
    } else {
      currentUser = null;
      logActivity(
        "System",
        "Failed login attempt",
        `Username: ${credentials.username}`
      ); // Log failed attempt
      console.log(
        `[main.js] Login failed. Reason: ${result.message || "Unknown"}`
      );
    }
    return result;
  });

  ipcMain.handle("get-current-user", async () => {
    console.log(
      `[main.js] IPC get-current-user. Returning:`,
      currentUser
        ? {
            id: currentUser.id,
            username: currentUser.username,
            role: currentUser.role,
          }
        : null
    );
    return currentUser; // Return the stored user object
  });

  ipcMain.handle("logout", async () => {
    const username = currentUser?.username;
    logActivity(username || "Unknown", "User logged out"); // Log logout
    console.log(`[main.js] IPC logout. Clearing user: ${username}`);
    currentUser = null;
    return { success: true };
  });

  // --- Item Management ---
  ipcMain.handle("get-items", async (event, filters) => {
    try {
      console.log(
        "[main.js] IPC get-items called with filters (including sort):",
        filters
      ); // Log will show sort params
      return await db.getItems(filters); // Pass the whole filters object
    } catch (error) {
      console.error("[main.js] Error in get-items handler:", error);
      logActivity(currentUser?.username, "Error fetching items", error.message);
      return { error: error.message || "Failed to fetch items." }; // Ensure consistent error structure
    }
  });

  ipcMain.handle("get-item-by-id", async (event, id) => {
    console.log("[main.js] IPC get-item-by-id called for ID:", id);
    try {
      return await db.getItemById(id);
    } catch (error) {
      console.error("[main.js] Error getting item by id:", id, error);
      logActivity(
        currentUser?.username,
        "Error fetching item by ID",
        `ID: ${id}, Error: ${error.message}`
      );
      return { error: error.message || "Failed to fetch item by ID." };
    }
  });

  ipcMain.handle("create-item", async (event, itemPayload) => {
    // itemPayload from frontend should now be:
    // { itemData: {name, sku, ...}, initialStockEntries: [{locationId, quantity, locationName}, ...] }
    console.log(
      "[main.js] IPC create-item called with payload:",
      JSON.stringify(itemPayload, null, 2)
    );
    const user = currentUser;
    if (!user) {
      return { success: false, message: "User not authenticated." };
    }

    try {
      // Destructure the payload from the frontend
      const { itemData, initialStockEntries } = itemPayload;

      if (!itemData || !itemData.name) {
        // Basic validation
        return { success: false, message: "Item name is required." };
      }

      // Pass user details for logging initial stock
      const result = await db.createItem(
        itemData,
        initialStockEntries || [],
        user.id,
        user.username
      );

      if (result.success && result.item) {
        logActivity(
          user.username,
          "Added inventory item",
          `Name: ${result.item.name}, SKU: ${result.item.sku || "N/A"}, ID: ${
            result.item.id
          }`
        );
      } else {
        logActivity(
          user.username,
          "Failed to add item",
          result.message || "Unknown DB error"
        );
      }
      return result;
    } catch (error) {
      console.error("[main.js] Error creating item:", itemPayload, error);
      logActivity(currentUser?.username, "Error creating item", error.message);
      return {
        success: false,
        message: error.message || "Unexpected error creating item.",
      };
    }
  });

  ipcMain.handle("update-item", async (event, itemData) => {
    // --- CORRECTED: Use the global currentUser variable ---
    const user = currentUser;

    // --- BACKEND VALIDATION ---
    // Ensure user is authenticated before proceeding
    if (!user) {
      logActivity(
        "System",
        "Update Item Error",
        `Attempt to update item without authenticated user. Item ID: ${
          itemData?.id || "Unknown"
        }`
      );
      return {
        success: false,
        message: "Authentication error: No user session found.",
      };
    }

    // Role-based validation for SKU and price changes
    if (user.role !== "admin") {
      // Ensure itemData.id exists before trying to fetch the original item
      if (itemData.id === undefined || itemData.id === null) {
        logActivity(
          user.username,
          "Update Item Error",
          `Missing ID in itemData for update.`
        );
        return { success: false, message: "Item ID is missing for update." };
      }
      const originalItem = await db.getItemById(itemData.id);
      if (!originalItem) {
        logActivity(
          user.username,
          "Update Item Error",
          `Item not found for ID: ${itemData.id}`
        );
        return { success: false, message: "Item not found for update." };
      }
      if (itemData.sku !== originalItem.sku) {
        logActivity(
          user.username,
          "Update Item Denied",
          `Attempt to change SKU for item ${originalItem.name} (ID: ${itemData.id})`
        );
        return {
          success: false,
          message: "Authorization denied: Employees cannot change SKU.",
        };
      }
      // Ensure cost_price from itemData and originalItem are compared as numbers
      const currentPrice = parseFloat(itemData.cost_price);
      const originalPrice = parseFloat(originalItem.cost_price);
      if (isNaN(currentPrice)) {
        // Check if conversion to float failed
        logActivity(
          user.username,
          "Update Item Error",
          `Invalid price format for item ${originalItem.name} (ID: ${itemData.id})`
        );
        return { success: false, message: "Invalid product price format." };
      }
      if (currentPrice !== originalPrice) {
        logActivity(
          user.username,
          "Update Item Denied",
          `Attempt to change Price for item ${originalItem.name} (ID: ${itemData.id})`
        );
        return {
          success: false,
          message: "Authorization denied: Employees cannot change Price.",
        };
      }
    }
    // Price validation for admins (or when creating) is handled on the frontend,
    // but an additional backend check for admins could be added here if desired.

    // --- PREPARE DATA FOR UPDATE ---
    const itemIdForLog = itemData?.id || "Unknown ID";
    const itemNameForLog = itemData?.name || `Item ID ${itemIdForLog}`;

    // Destructure to exclude 'quantity' as it's not updated here.
    // 'id' will be used in the WHERE clause of the update, not in the SET payload.
    const { quantity, id, ...dataToUpdate } = itemData;

    try {
      if (id === undefined || id === null) {
        logActivity(
          user.username,
          "Update Item Error",
          `Missing ID in itemData for item ${itemNameForLog}`
        );
        return { success: false, message: "Item ID is missing for update." };
      }
      // db.updateItem expects (id, fieldsToUpdate)
      const result = await db.updateItem(id, dataToUpdate);

      if (result.success && result.item) {
        logActivity(
          user.username,
          `Updated item details`,
          `Item: ${result.item.name || itemNameForLog} (ID: ${id})`
        );
      } else {
        logActivity(
          user.username,
          `Failed to update item`,
          `Item: ${itemNameForLog} (ID: ${id}). Reason: ${
            result.message || "Unknown DB error"
          }`
        );
      }
      return result;
    } catch (error) {
      console.error(
        `[main.js] Error handling update-item for ID ${itemIdForLog}:`,
        error
      );
      logActivity(
        user.username,
        `Error updating item`,
        `Item: ${itemNameForLog} (ID: ${itemIdForLog}). Error: ${error.message}`
      );
      return {
        success: false,
        message: error.message || "Failed to update item on server.",
      };
    }
  });

  ipcMain.handle("delete-item", async (event, itemId) => {
    // 'itemId' is the ID of the item to archive
    console.log(
      '[main.js] IPC "delete-item" (acting as ARCHIVE) called for ID:',
      itemId
    );
    const username = currentUser?.username;
    let itemDetailsForLog = `ID: ${itemId}`;

    try {
      const item = await db.getItemById(itemId); // Fetch item to check its current status and for logging
      if (!item) {
        logActivity(
          username,
          "Archive Item Error",
          `Item with ID ${itemId} not found.`
        );
        return { success: false, message: `Item with ID ${itemId} not found.` };
      }
      itemDetailsForLog = `Name: ${item.name}, SKU: ${
        item.sku || "N/A"
      }, ID: ${itemId}`;

      if (item.is_archived) {
        logActivity(
          username,
          "Archive Item Info",
          `Item ${itemDetailsForLog} is already archived.`
        );
        // Optionally, you could make this toggle and call db.archiveItem(itemId, false) here.
        // For now, it just informs. If you want "Archive" button to also unarchive if clicked again on an archived item,
        // you'd change the logic here.
        return {
          success: true,
          message: `Item "${item.name}" is already archived. No action taken.`,
        };
      }

      // Optional: Add back checks for bundle components or open sales orders if you want to prevent
      // archiving items that are actively in use, even if it's a soft delete.
      // For now, we'll allow archiving.
      /*
            const { data: componentsInBundles, error: bundleCheckError } = await supabase
                .from('bundle_components')
                .select('bundle_id', { count: 'exact', head: true })
                .eq('item_id', itemId);
            if (bundleCheckError) { // ... handle error ... }
            if (componentsInBundles && componentsInBundles.count > 0) {
                logActivity(username, 'Archive Item Denied', `Item ${itemDetailsForLog} is part of bundles.`);
                return { success: false, message: `Cannot archive item "${item.name}". It is used in bundles.` };
            }
            */

      const result = await db.archiveItem(itemId, true); // Call with true to archive

      if (result.success) {
        logActivity(username, "Archived inventory item", itemDetailsForLog);
      } else {
        logActivity(
          username,
          "Failed to archive item",
          `Details: ${itemDetailsForLog}, Reason: ${
            result.message || "Unknown DB error"
          }`
        );
      }
      return result;
    } catch (error) {
      console.error(
        `[main.js delete-item/archive] Critical error for item ID ${itemId}:`,
        error
      );
      logActivity(
        username,
        "Error archiving item",
        `Details: ${itemDetailsForLog}, Error: ${error.message}`
      );
      return {
        success: false,
        message: error.message || "Unexpected error archiving item.",
      };
    }
  });

  ipcMain.handle("unarchive-item", async (event, itemId) => {
    console.log('[main.js] IPC "unarchive-item" called for ID:', itemId);
    const username = currentUser?.username;
    let itemDetailsForLog = `ID: ${itemId}`;

    try {
      const item = await db.getItemById(itemId); // Fetch item for logging and to check status
      if (!item) {
        logActivity(
          username,
          "Unarchive Item Error",
          `Item with ID ${itemId} not found.`
        );
        return { success: false, message: `Item with ID ${itemId} not found.` };
      }
      itemDetailsForLog = `Name: ${item.name}, SKU: ${
        item.sku || "N/A"
      }, ID: ${itemId}`;

      if (!item.is_archived) {
        logActivity(
          username,
          "Unarchive Item Info",
          `Item ${itemDetailsForLog} is already active (not archived).`
        );
        return {
          success: true,
          message: `Item "${item.name}" is already active.`,
        };
      }

      const result = await db.archiveItem(itemId, false); // Call with false to unarchive

      if (result.success) {
        logActivity(
          username,
          "Restored (Unarchived) inventory item",
          itemDetailsForLog
        );
      } else {
        logActivity(
          username,
          "Failed to unarchive item",
          `Details: ${itemDetailsForLog}, Reason: ${
            result.message || "Unknown DB error"
          }`
        );
      }
      return result;
    } catch (error) {
      console.error(
        `[main.js unarchive-item] Critical error for item ID ${itemId}:`,
        error
      );
      logActivity(
        username,
        "Error unarchiving item",
        `Details: ${itemDetailsForLog}, Error: ${error.message}`
      );
      return {
        success: false,
        message: error.message || "Unexpected error unarchiving item.",
      };
    }
  });

  // --- Customer Management ---
  ipcMain.handle("get-customers", async (event, filters) => {
    console.log(
      '[Main Process] Received "get-customers" with filters:',
      filters
    );
    try {
      return await db.getCustomers(filters || {});
    } catch (error) {
      console.error('[Main Process] Error in "get-customers" handler:', error);
      logActivity(
        currentUser?.username,
        "Error fetching customers",
        error.message
      );
      return { error: error.message || "Failed to fetch customers." };
    }
  });

  ipcMain.handle("get-customer-by-id", async (event, id) => {
    console.log('[Main Process] Received "get-customer-by-id" for ID:', id);
    try {
      return await db.getCustomerById(id);
    } catch (error) {
      console.error(
        '[Main Process] Error in "get-customer-by-id" handler:',
        error
      );
      logActivity(
        currentUser?.username,
        "Error fetching customer by ID",
        `ID: ${id}, Error: ${error.message}`
      );
      return { error: error.message || "Failed to fetch customer by ID." };
    }
  });

  ipcMain.handle("create-customer", async (event, customerData) => {
    console.log(
      '[Main Process] Received "create-customer" with data:',
      customerData
    );
    try {
      const result = await db.createCustomer(customerData);
      if (result.success && result.customer) {
        logActivity(
          currentUser?.username,
          "Added customer",
          `Name: ${result.customer.full_name}, ID: ${result.customer.id}`
        );
      } else {
        logActivity(
          currentUser?.username,
          "Failed to add customer",
          result.message || "Unknown DB error"
        );
      }
      return result;
    } catch (error) {
      console.error(
        '[Main Process] Error in "create-customer" handler:',
        error
      );
      logActivity(
        currentUser?.username,
        "Error creating customer",
        error.message
      );
      return {
        success: false,
        message: error.message || "Unexpected error creating customer.",
      };
    }
  });

  ipcMain.handle("update-customer", async (event, customerDataWithId) => {
    console.log(
      '[Main Process] Received "update-customer" with data:',
      customerDataWithId
    );
    try {
      if (
        !customerDataWithId ||
        customerDataWithId.id === undefined ||
        customerDataWithId.id === null
      ) {
        throw new Error("Customer ID is missing or invalid for update.");
      }
      const id = customerDataWithId.id;
      const { id: removedId, ...customerData } = customerDataWithId;
      const result = await db.updateCustomer(id, customerData);
      if (result.success && result.customer) {
        logActivity(
          currentUser?.username,
          "Updated customer",
          `Name: ${result.customer.full_name}, ID: ${id}`
        );
      } else {
        logActivity(
          currentUser?.username,
          "Failed to update customer",
          `ID: ${id}, Reason: ${result.message || "Unknown DB error"}`
        );
      }
      return result;
    } catch (error) {
      console.error(
        '[Main Process] Error in "update-customer" handler:',
        error
      );
      logActivity(
        currentUser?.username,
        "Error updating customer",
        `ID: ${customerDataWithId?.id}, Error: ${error.message}`
      );
      return {
        success: false,
        message: error.message || "Unexpected error updating customer.",
      };
    }
  });

  ipcMain.handle("delete-customer", async (event, id) => {
    console.log('[Main Process] Received "delete-customer" for ID:', id);
    let customerDetails = `ID: ${id}`;
    try {
      const customer = await db.getCustomerById(id);
      if (customer) {
        customerDetails = `Name: ${customer.full_name}, ID: ${id}`;
      }
    } catch (fetchError) {
      console.warn(
        `[main.js] Could not fetch details before deleting customer (ID: ${id}):`,
        fetchError.message
      );
    }

    try {
      const result = await db.deleteCustomer(id);
      if (result.success) {
        logActivity(currentUser?.username, "Deleted customer", customerDetails);
      } else {
        logActivity(
          currentUser?.username,
          "Failed to delete customer",
          `Details: ${customerDetails}, Reason: ${
            result.message || "Unknown DB error"
          }`
        );
      }
      return result;
    } catch (error) {
      console.error(
        '[Main Process] Error in "delete-customer" handler:',
        error
      );
      logActivity(
        currentUser?.username,
        "Error deleting customer",
        `Details: ${customerDetails}, Error: ${error.message}`
      );
      return {
        success: false,
        message: error.message || "Unexpected error deleting customer.",
      };
    }
  });

  // --- Analytics ---
  ipcMain.handle("get-inventory-summary", async () => {
    console.log("[main.js] IPC get-inventory-summary");
    try {
      return await db.getInventorySummary();
    } catch (error) {
      console.error("[main.js] Error getting inventory summary:", error);
      logActivity(
        currentUser?.username,
        "Error getting inventory summary",
        error.message
      );
      return { success: false, message: error.message, summary: null };
    }
  });

  ipcMain.handle("get-low-stock-items", async (event, threshold) => {
    console.log("[main.js] IPC get-low-stock-items with threshold:", threshold);
    try {
      return await db.getLowStockItems(threshold);
    } catch (error) {
      console.error("[main.js] Error getting low stock items:", error);
      logActivity(
        currentUser?.username,
        "Error getting low stock items",
        error.message
      );
      return { success: false, message: error.message, items: [] };
    }
  });
  ipcMain.handle("get-inventory-by-category", async () => {
    console.log("[main.js] IPC get-inventory-by-category");
    try {
      return await db.getInventoryByCategory();
    } catch (error) {
      console.error("[main.js] Error getting inventory by category:", error);
      logActivity(
        currentUser?.username,
        "Error getting category analytics",
        error.message
      );
      return { success: false, message: error.message, data: [] };
    }
  });

  ipcMain.handle("get-inventory-by-storage", async () => {
    console.log("[main.js] IPC get-inventory-by-storage");
    try {
      return await db.getInventoryByStorageLocation();
    } catch (error) {
      console.error("[main.js] Error getting inventory by storage:", error);
      logActivity(
        currentUser?.username,
        "Error getting storage analytics",
        error.message
      );
      return { success: false, message: error.message, data: [] };
    }
  });

  ipcMain.handle("get-todays-sales-total", async () => {
    console.log("[main.js] IPC get-todays-sales-total"); // Now calling the real function
    try {
      return await db.getTodaysSalesTotal();
    } catch (error) {
      console.error("[main.js] Error in get-todays-sales-total:", error);
      return { success: false, total: 0, message: error.message };
    }
  });
  ipcMain.handle("get-new-orders-count", async () => {
    console.log("[main.js] IPC get-new-orders-count"); // Now calling the real function
    try {
      return await db.getNewOrdersCount();
    } catch (error) {
      console.error("[main.js] Error in get-new-orders-count:", error);
      return { success: false, count: 0, message: error.message };
    }
  });

  ipcMain.handle("get-top-selling-proxy", async () => {
    // Proxy for top selling
    console.log("[main.js] IPC get-top-selling-proxy");
    try {
      return await db.getTopSellingProductsByQuantity(7); // Get top 7 for chart
    } catch (error) {
      console.error("[main.js] Error in get-top-selling-proxy:", error);
      return { success: false, products: [], message: error.message };
    }
  });
  ipcMain.handle("get-sales-summary", async (event, period) => {
    console.log(`[main.js] IPC get-sales-summary for period: ${period}`);
    try {
      return await db.getSalesSummary(period);
    } catch (error) {
      console.error("[main.js] Error in get-sales-summary:", error);
      // Log activity for errors might be too noisy for analytics calls
      return { success: false, summary: null, message: error.message };
    }
  });

  ipcMain.handle("get-top-selling-items", async (event, { period, limit }) => {
    console.log(
      `[main.js] IPC get-top-selling-items for period: ${period}, limit: ${limit}`
    );
    try {
      return await db.getTopSellingItems(period, limit);
    } catch (error) {
      console.error("[main.js] Error in get-top-selling-items:", error);
      return { success: false, items: [], message: error.message };
    }
  });

  ipcMain.handle("get-sales-by-status", async (event, period) => {
    console.log(`[main.js] IPC get-sales-by-status for period: ${period}`);
    try {
      return await db.getSalesByStatus(period);
    } catch (error) {
      console.error("[main.js] Error in get-sales-by-status:", error);
      return { success: false, data: [], message: error.message };
    }
  });

  // --- File Processing ---
  ipcMain.handle("import-initial-items", async (event, { fileData }) => {
    const username = currentUser?.username;
    const fileName = fileData?.name || "Unknown file";
    logActivity(username, "Started initial item import", `File: ${fileName}`);
    let result; // Define result outside try-catch to ensure it's available for final logging

    try {
      // --- Start of processing logic ---
      if (!fileData || !fileData.contentBase64) {
        throw new Error("File data or content is missing.");
      }
      const { contentBase64, type } = fileData;
      console.log(
        `[main.js] IPC import-initial-items: Processing file ${fileName}`
      );
      const buffer = Buffer.from(contentBase64, "base64");
      let itemsToParse = [];

      // Determine file type and parse
      if (
        type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        fileName.endsWith(".xlsx")
      ) {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("XLSX file contains no sheets.");
        const worksheet = workbook.Sheets[sheetName];
        itemsToParse = XLSX.utils.sheet_to_json(worksheet, { defval: null }); // Use defval: null to handle empty cells
      } else if (type === "text/csv" || fileName.endsWith(".csv")) {
        const csv = buffer.toString("utf-8");
        const parseResult = Papa.parse(csv, {
          header: true,
          skipEmptyLines: true,
        });
        if (parseResult.errors.length > 0) {
          console.warn(
            `[main.js] CSV parsing errors for ${fileName}:`,
            parseResult.errors
          );
          // Decide if partial processing is okay or throw error
        }
        itemsToParse = parseResult.data;
      } else {
        throw new Error(`Unsupported file type: ${type || "unknown"}`);
      }
      // --- End of parsing ---

      // Initialize results structure
      result = {
        fileName: fileName,
        processedCount: itemsToParse.length,
        successCount: 0,
        errors: [],
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

          const sku =
            normalizedItem.sku !== null && normalizedItem.sku !== undefined
              ? String(normalizedItem.sku).trim()
              : null;
          const name =
            normalizedItem.name !== null && normalizedItem.name !== undefined
              ? String(normalizedItem.name).trim()
              : null;

          if (!sku) {
            results.errors.push(`Row ${rowNum}: Missing SKU.`);
            continue;
          }
          if (!name) {
            results.errors.push(`Row ${rowNum} (SKU: ${sku}): Missing Name.`);
            continue;
          }
          if (skuSet.has(sku)) {
            results.errors.push(
              `Row ${rowNum}: Duplicate SKU ${sku} found within the import file. Skipped.`
            );
            continue;
          }
          skuSet.add(sku);

          // Prepare data for database insertion
          const itemDbData = {
            name: name,
            sku: sku,
            description: String(normalizedItem.description || "").trim(),
            cost_price:
              parseFloat(normalizedItem.cost || normalizedItem.cost_price) || 0,
            quantity: parseInt(normalizedItem.quantity, 10) || 0,
            category: String(normalizedItem.category || "Uncategorized").trim(),
            storage_location: String(
              normalizedItem.storage ||
                normalizedItem.storage_location ||
                "Main Warehouse"
            ).trim(),
            status: String(normalizedItem.status || "Normal").trim(),
            variant: String(normalizedItem.variant || "").trim(),
          };

          // Database interaction within loop
          try {
            const existingItems = await db.getItems({ searchTerm: sku }); // Check existence
            const alreadyExists = existingItems.some(
              (existing) => existing.sku === sku
            );

            if (alreadyExists) {
              result.errors.push(
                `Row ${rowNum}: Item with SKU ${sku} already exists. Skipped.`
              );
              continue;
            }

            const creationResult = await db.createItem(itemDbData);
            if (creationResult.success) {
              result.successCount++;
            } else {
              result.errors.push(
                `Row ${rowNum} (SKU: ${sku}): Failed - ${
                  creationResult.message || "DB error"
                }`
              );
            }
          } catch (dbError) {
            result.errors.push(
              `Row ${rowNum} (SKU: ${sku}): Processing Error - ${dbError.message}`
            );
          }
        } // End of loop
      } // End of else (itemsToParse.length > 0)

      console.log("[main.js] Initial import results:", result);
      logActivity(
        username,
        "Finished initial item import",
        `File: ${fileName}, Imported: ${result.successCount}, Errors/Skipped: ${result.errors.length}`
      );
      return { success: true, ...result }; // Return success true overall, with detailed results
    } catch (error) {
      console.error("[main.js] Critical error during initial import:", error);
      logActivity(
        username,
        "Error processing initial import file",
        `File: ${fileName}, Error: ${error.message}`
      );
      // Ensure result is defined even in outer catch
      result = {
        fileName: fileName,
        processedCount: 0,
        successCount: 0,
        errors: [`Critical processing error: ${error.message}`],
      };
      return { success: false, ...result }; // Indicate overall failure
    }
  });

  ipcMain.handle(
    "process-inventory-file",
    async (event, { fileData, actionType, columnMapping }) => {
      const username = currentUser?.username;
      const fileName = fileData?.name || "Unknown file";
      logActivity(
        username,
        `Started bulk stock update (${actionType})`,
        `File: ${fileName}`
      );
      let result; // Define outside try

      try {
        // --- Start of processing logic ---
        if (!fileData || !fileData.contentBase64) {
          throw new Error("File data or content is missing.");
        }
        const { contentBase64, type } = fileData;
        console.log(
          `[main.js] IPC process-inventory-file: Processing file ${fileName}, Action: ${actionType}`
        );
        const buffer = Buffer.from(contentBase64, "base64");
        let itemsToParse = [];

        // Parse file
        if (
          type ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          fileName.endsWith(".xlsx")
        ) {
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error("XLSX file contains no sheets.");
          const worksheet = workbook.Sheets[sheetName];
          itemsToParse = XLSX.utils.sheet_to_json(worksheet, { defval: null });
        } else if (type === "text/csv" || fileName.endsWith(".csv")) {
          const csv = buffer.toString("utf-8");
          const parseResult = Papa.parse(csv, {
            header: true,
            skipEmptyLines: true,
          });
          if (parseResult.errors.length > 0) {
            console.warn(
              `[main.js] CSV parsing errors for ${fileName}:`,
              parseResult.errors
            );
          }
          itemsToParse = parseResult.data;
        } else {
          throw new Error(`Unsupported file type: ${type || "unknown"}`);
        }
        // --- End of parsing ---

        // Initialize results
        result = {
          fileName: fileName,
          processedCount: itemsToParse.length,
          successCount: 0,
          errors: [],
        };

        if (itemsToParse.length === 0) {
          result.errors.push("No data rows found in the file.");
        } else {
          // Validate column mapping headers exist in the first row (if header: true was used)
          const firstRowKeys = Object.keys(itemsToParse[0] || {});
          if (!firstRowKeys.includes(columnMapping.sku)) {
            result.errors.push(
              `Required header '${columnMapping.sku}' not found in the file.`
            );
          }
          if (!firstRowKeys.includes(columnMapping.quantity)) {
            result.errors.push(
              `Required header '${columnMapping.quantity}' not found in the file.`
            );
          }

          // Proceed only if headers are present
          if (result.errors.length === 0) {
            for (const [index, item] of itemsToParse.entries()) {
              const rowNum = index + 2;
              const sku =
                item[columnMapping.sku] !== null &&
                item[columnMapping.sku] !== undefined
                  ? String(item[columnMapping.sku]).trim()
                  : null;
              const quantityFromFileStr = item[columnMapping.quantity];
              const quantityFromFile = parseInt(quantityFromFileStr, 10);

              if (!sku) {
                result.errors.push(
                  `Row ${rowNum}: Missing SKU (header '${columnMapping.sku}').`
                );
                continue;
              }
              if (isNaN(quantityFromFile)) {
                result.errors.push(
                  `Row ${rowNum} (SKU: ${sku}): Invalid quantity '${quantityFromFileStr}' (header '${columnMapping.quantity}').`
                );
                continue;
              }

              // Database update logic
              try {
                const itemsWithSku = await db.getItems({ searchTerm: sku });
                const existingItem = itemsWithSku.find((i) => i.sku === sku); // Exact match

                if (!existingItem) {
                  result.errors.push(
                    `Row ${rowNum}: Item with SKU ${sku} not found.`
                  );
                  continue;
                }

                let newQuantity;
                const currentQuantity =
                  parseInt(existingItem.quantity, 10) || 0;

                switch (actionType) {
                  case "add":
                    newQuantity = currentQuantity + quantityFromFile;
                    break;
                  case "deduct":
                    newQuantity = Math.max(
                      0,
                      currentQuantity - quantityFromFile
                    );
                    break;
                  case "set":
                    newQuantity = Math.max(0, quantityFromFile); // Ensure non-negative
                    break;
                  default:
                    result.errors.push(
                      `Row ${rowNum} (SKU: ${sku}): Invalid action type '${actionType}'.`
                    );
                    continue;
                }

                const updateResult = await db.updateItem(existingItem.id, {
                  quantity: newQuantity,
                });
                if (updateResult.success) {
                  result.successCount++;
                } else {
                  result.errors.push(
                    `Row ${rowNum} (SKU: ${sku}): Update Failed - ${
                      updateResult.message || "DB error"
                    }`
                  );
                }
              } catch (dbError) {
                result.errors.push(
                  `Row ${rowNum} (SKU: ${sku}): Processing Error - ${dbError.message}`
                );
              }
            } // End of loop
          } // End if headers are okay
        } // End else (itemsToParse.length > 0)

        console.log("[main.js] Bulk update results:", result);
        logActivity(
          username,
          `Finished bulk stock update (${actionType})`,
          `File: ${fileName}, Updated: ${result.successCount}, Errors: ${result.errors.length}`
        );
        return { success: true, ...result };
      } catch (error) {
        console.error("[main.js] Critical error during bulk update:", error);
        logActivity(
          username,
          `Error processing bulk update file (${actionType})`,
          `File: ${fileName}, Error: ${error.message}`
        );
        // Ensure result is defined
        result = {
          fileName: fileName,
          processedCount: 0,
          successCount: 0,
          errors: [`Critical processing error: ${error.message}`],
        };
        return { success: false, ...result };
      }
    }
  );

  // --- Export Handler ---
  ipcMain.handle('export-inventory', async (event) => {
          const username = currentUser?.username; // Assuming currentUser is globally available
          // Call your global logActivity function
          if (typeof logActivity === 'function') {
              await logActivity(username, 'Started inventory export');
          } else {
              console.warn("logActivity function not available for 'Started inventory export'");
          }

          let result;

          try {
              let itemsData;
              try {
                  itemsData = await db.getAllItemsForExport(); // This calls the updated function
                  if (!itemsData || itemsData.length === 0) {
                      console.log('[IPC export-inventory] No item-location records found.');
                      result = { success: true, message: 'No inventory data found to export.' };
                      if (typeof logActivity === 'function') await logActivity(username, 'Finished inventory export', 'Status: Success (No data)');
                      return result;
                  }
                  console.log(`[IPC export-inventory] Fetched ${itemsData.length} item-location records.`);
              } catch (fetchError) {
                  console.error('[IPC export-inventory] Error fetching items:', fetchError);
                  throw new Error(`Failed to fetch inventory data: ${fetchError.message}`);
              }

              let csvContent;
              try {
                  const headers = [
                      'item_id', 'sku', 'item_name', 'variant', 'description', 'category',
                      'cost_price', 'item_status', 'is_archived', 'low_stock_threshold',
                      'item_created_at', 'item_updated_at',
                      'location_id', 'location_name', 'location_description', 'location_is_active',
                      'quantity_at_location'
                  ];
                  csvContent = convertToCSV(itemsData, headers);
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
                     title: 'Save Comprehensive Inventory Export',
                     defaultPath: `comprehensive-inventory-export-${new Date().toISOString().split('T')[0]}.csv`,
                     filters: [ { name: 'CSV Files', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] } ]
                  });

                  if (canceled || !chosenPath) {
                      console.log('[IPC export-inventory] User cancelled save.');
                      result = { success: true, message: 'Export cancelled by user.' };
                      if (typeof logActivity === 'function') await logActivity(username, 'Finished inventory export', 'Status: Cancelled');
                      return result;
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
                  if (typeof logActivity === 'function') await logActivity(username, 'Finished inventory export', `Status: Success, File: ${path.basename(filePath)}`);
                  return result;
              } catch (writeError) {
                   console.error('[IPC export-inventory] Error writing CSV file:', writeError);
                  throw new Error(`Failed to save file: ${writeError.message}`);
              }

          } catch (error) {
              console.error('[main.js] Critical error during export inventory:', error);
              if (typeof logActivity === 'function') await logActivity(username, 'Error during inventory export', error.message);
              result = {
                  success: false,
                  message: `Export failed: ${error.message}`
              };
              return result;
          }
      });

  // --- Activity Log Fetch Handler ---
  ipcMain.handle("get-activity-log", async () => {
    console.log("[main.js] IPC get-activity-log called.");
    try {
      // Fetch from Supabase instead of local file
      const logEntries = await db.getActivityLogEntries(50); // Fetch latest 50

      // IMPORTANT: Map the data structure if needed to match frontend expectations
      // Frontend expects: { id, timestamp, user, action, details }
      // DB has: { id, created_at, user_identifier, action, details }
      const formattedLog = logEntries.map((entry) => ({
        id: entry.id,
        timestamp: entry.created_at,
        user: entry.user_identifier, // Map DB column name to expected prop name
        action: entry.action,
        details: entry.details || "", // Ensure details is at least an empty string
      }));

      return formattedLog;
    } catch (error) {
      console.error("[main.js] Error fetching activity log from DB:", error);
      logActivity("System", "Error fetching activity log", error.message); // Log the error itself
      return []; // Return empty array on error
    }
  });

  console.log("[main.js] IPC Handlers setup complete.");

  // Create the main application window
  createWindow();
});

// --- Other App Lifecycle Events ---
app.on("activate", function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", function () {
  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  if (process.platform !== "darwin") {
    console.log("[main.js] All windows closed, quitting app.");
    app.quit();
  } else {
    console.log("[main.js] All windows closed on macOS, app stays active.");
  }
});
ipcMain.handle("process-return", async (event, frontendReturnDetails) => {
  // Log the details received from the frontend
  console.log(
    "[Main Process] IPC: process-return invoked. Received details:",
    JSON.stringify(frontendReturnDetails, null, 2)
  );
  const user = currentUser;

  if (!user) {
    console.error(
      "[Main Process] Error processing return: User not authenticated."
    );
    return {
      success: false,
      message: "User not authenticated to process returns.",
    };
  }

  // Basic validation of incoming details
  if (
    !frontendReturnDetails ||
    !frontendReturnDetails.itemId ||
    !frontendReturnDetails.quantityReturned ||
    !frontendReturnDetails.reason ||
    !frontendReturnDetails.condition
  ) {
    console.error(
      "[Main Process] Error processing return: Missing required fields in frontendReturnDetails."
    );
    return {
      success: false,
      message:
        "Missing required return details (item, quantity, reason, or condition).",
    };
  }
  if (parseInt(frontendReturnDetails.quantityReturned, 10) <= 0) {
    console.error(
      "[Main Process] Error processing return: Invalid quantityReturned."
    );
    return {
      success: false,
      message: "Quantity returned must be a positive number.",
    };
  }

  try {
    // 1. Create the main return record in 'returns' table
    const returnRecordData = {
      item_id: frontendReturnDetails.itemId,
      quantity_returned: parseInt(frontendReturnDetails.quantityReturned, 10),
      reason: frontendReturnDetails.reason,
      condition: frontendReturnDetails.condition,
      customer_id: frontendReturnDetails.customerId || null,
      notes: frontendReturnDetails.notes || null,
      processed_by_user_id: user.id,
      inventory_adjusted: false, // Default to false, will be set true if restocked
    };

    console.log(
      "[Main Process] Creating return record with data:",
      JSON.stringify(returnRecordData, null, 2)
    );
    const createReturnResult = await db.createReturnRecord(returnRecordData);

    if (!createReturnResult.success || !createReturnResult.returnRecord) {
      console.error(
        "[Main Process] Failed to create return record in DB:",
        createReturnResult.message
      );
      return {
        success: false,
        message:
          createReturnResult.message || "Failed to create return record.",
      };
    }

    const returnRecord = createReturnResult.returnRecord;
    let message = `Return ID ${returnRecord.id} processed.`;
    let restockSuccessful = false;

    console.log(
      `[Main Process] Condition check: frontendReturnDetails.condition is "${frontendReturnDetails.condition}"`
    );

    // 2. If item is 'Resellable', adjust stock and log movement
    if (frontendReturnDetails.condition === "Resellable") {
      console.log(
        `[Main Process] Item is "Resellable". Proceeding with restock logic.`
      );
      console.log(
        `[Main Process]   - Item ID for restock: ${frontendReturnDetails.itemId}`
      );
      console.log(
        `[Main Process]   - Target Location ID for restock: ${frontendReturnDetails.returnToLocationId}`
      );
      console.log(
        `[Main Process]   - Target Location Name for restock: ${frontendReturnDetails.returnToLocationName}`
      );
      console.log(
        `[Main Process]   - Quantity to restock: ${frontendReturnDetails.quantityReturned}`
      );

      if (!frontendReturnDetails.returnToLocationId) {
        message += ` WARNING: Failed to restock item. Reason: Target location for resellable item was not specified.`;
        console.error(
          `[Main Process] CRITICAL (Resellable): Cannot restock. Target location ID is MISSING for return ${returnRecord.id}. Item ID: ${frontendReturnDetails.itemId}`
        );
        // inventory_adjusted remains false for the return record
      } else {
        const transactionDetailsForDB = {
          transactionType: "RETURN_RESTOCK",
          referenceId: String(returnRecord.id),
          referenceType: "SALES_RETURN",
          userId: user.id,
          usernameSnapshot: user.username,
          notes: `Restocked from Return ID: ${
            returnRecord.id
          }. Original reason: "${
            frontendReturnDetails.reason
          }". Returned to: "${
            frontendReturnDetails.returnToLocationName ||
            `Location ID ${frontendReturnDetails.returnToLocationId}`
          }"`,
        };

        console.log(
          `[Main Process] Attempting to call db.adjustStockQuantity for restock with details:`,
          JSON.stringify(
            {
              itemId: frontendReturnDetails.itemId,
              locationId: frontendReturnDetails.returnToLocationId,
              quantity: parseInt(frontendReturnDetails.quantityReturned, 10),
              transactionDetails: transactionDetailsForDB,
            },
            null,
            2
          )
        );

        const restockResult = await db.adjustStockQuantity(
          frontendReturnDetails.itemId,
          frontendReturnDetails.returnToLocationId, // Corrected: Location ID
          parseInt(frontendReturnDetails.quantityReturned, 10), // Corrected: Quantity (ensure it's a number)
          transactionDetailsForDB
        );

        console.log(
          "[Main Process] db.adjustStockQuantity result for restock:",
          JSON.stringify(restockResult, null, 2)
        );

        if (restockResult.success) {
          console.log(
            `[Main Process] Restock successful for return ${returnRecord.id}. Attempting to mark inventory_adjusted.`
          );
          const markAdjustedResult = await db.markReturnInventoryAdjusted(
            returnRecord.id
          );
          if (!markAdjustedResult.success) {
            console.error(
              `[Main Process] WARNING: Failed to mark return ${returnRecord.id} as inventory_adjusted. Error: ${markAdjustedResult.message}`
            );
            message += ` Item restocked, but failed to update return record's adjusted status.`;
          } else {
            message += ` Item restocked to "${
              frontendReturnDetails.returnToLocationName ||
              `Location ID ${frontendReturnDetails.returnToLocationId}`
            }".`;
            if (
              restockResult.newQuantityAtLocation !== undefined &&
              restockResult.newQuantityAtLocation !== null
            ) {
              message += ` New quantity at location: ${restockResult.newQuantityAtLocation}.`;
            }
          }
          restockSuccessful = true;
        } else {
          message += ` WARNING: Failed to restock item to "${
            frontendReturnDetails.returnToLocationName ||
            `Location ID ${frontendReturnDetails.returnToLocationId}`
          }". Error: ${restockResult.message}`;
          console.error(
            `[Main Process] CRITICAL: Return ${returnRecord.id} processed but item restock failed for item ${frontendReturnDetails.itemId} to location ${frontendReturnDetails.returnToLocationId}. Error: ${restockResult.message}`
          );
        }
      }
    } else {
      message += " Item not restocked due to condition.";
      console.log(
        `[Main Process] Item condition is "${frontendReturnDetails.condition}", not "Resellable". Skipping restock.`
      );
    }

    // 3. General Activity Log
    let itemNameForLog = `ID ${frontendReturnDetails.itemId}`;
    try {
      const itemInfo = await db.getItemById(frontendReturnDetails.itemId);
      if (itemInfo && itemInfo.name) {
        itemNameForLog = `${itemInfo.name} (ID: ${frontendReturnDetails.itemId})`;
      }
    } catch (itemFetchError) {
      console.warn(
        `[Main Process] Could not fetch item details for activity log: ${itemFetchError.message}`
      );
    }

    const activityLogDetails = `Return processed for item ${itemNameForLog}. Return ID: ${
      returnRecord.id
    }. Condition: ${frontendReturnDetails.condition}. ${
      restockSuccessful ? "Item restocked." : "Item not restocked."
    }`;

    // Call logActivity (your global logging function)
    await logActivity(
      user.username,
      "Product Return Processed",
      activityLogDetails
    );
    // The logActivity function itself handles sending 'new-log-entry' to the renderer if mainWindow is available.

    console.log(
      `[Main Process] Final message for return ${returnRecord.id}: "${message}"`
    );
    return { success: true, message: message, returnId: returnRecord.id };
  } catch (error) {
    console.error("[Main Process] Error in process-return IPC handler:", error);
    // Log the error using your global logActivity function as well
    await logActivity(
      user?.username || "System",
      "Error Processing Return",
      `Details: ${JSON.stringify(frontendReturnDetails)}. Error: ${
        error.message
      }`
    );
    return {
      success: false,
      message: error.message || "Server error during return processing.",
    };
  }
});

// Add IPC Handler for fetching return history (optional, for a future list page)
ipcMain.handle("get-returns", async (event, filters) => {
  console.log("[main.js] IPC get-returns called with filters:", filters);
  try {
    return await db.getReturnRecords(filters || {}, 50); // Get latest 50
  } catch (error) {
    console.error("[main.js] Error fetching return records:", error);
    logActivity(
      currentUser?.username,
      "Error fetching return records",
      error.message
    );
    return { error: error.message || "Failed to fetch return records." };
  }
});
// --- Stock Adjustment Handler ---
ipcMain.handle("perform-stock-adjustment", async (event, adjustmentDetails) => {
  // Expected adjustmentDetails: { itemId, locationId, adjustmentQuantity, reason, notes, userId, username }
  console.log(
    `[Main Process] perform-stock-adjustment handler invoked with details:`,
    JSON.stringify(adjustmentDetails, null, 2)
  );
  const username = currentUser?.username;
  let itemNameForLog = `ID ${adjustmentDetails?.itemId || "Unknown"}`;
  let locationNameForLog = `ID ${adjustmentDetails?.locationId || "Unknown"}`; // For logging

  try {
    // --- VALIDATION: Now includes locationId ---
    if (
      !adjustmentDetails ||
      adjustmentDetails.itemId === undefined ||
      adjustmentDetails.itemId === null ||
      adjustmentDetails.locationId === undefined ||
      adjustmentDetails.locationId === null || // Check for locationId
      typeof adjustmentDetails.adjustmentQuantity !== "number"
    ) {
      const errorMsg = `Invalid details (itemId/locationId/qty). Provided: ${JSON.stringify(
        adjustmentDetails
      )}`;
      logActivity(username, "Stock Adjustment Error", errorMsg);
      return {
        success: false,
        message:
          "Invalid adjustment details: Item ID, Location ID, and numerical Quantity are required.",
      };
    }
    if (
      !adjustmentDetails.reason ||
      String(adjustmentDetails.reason).trim() === ""
    ) {
      const errorMsg = `Reason missing for item ${itemNameForLog} at location ${locationNameForLog}.`;
      logActivity(username, "Stock Adjustment Error", errorMsg);
      return { success: false, message: "Reason for adjustment is required." };
    }
    if (
      String(adjustmentDetails.reason).toLowerCase().includes("other") &&
      (!adjustmentDetails.notes ||
        String(adjustmentDetails.notes).trim() === "")
    ) {
      const errorMsg = `Notes missing for "Other" reason for item ${itemNameForLog} at location ${locationNameForLog}.`;
      logActivity(username, "Stock Adjustment Error", errorMsg);
      return {
        success: false,
        message:
          'Notes are required when the reason is "Other (Specify in Notes)".',
      };
    }
    // --- END VALIDATION ---

    // Fetch item name and location name for more descriptive logging
    try {
      const item = await db.getItemById(adjustmentDetails.itemId); // Assuming getItemById can provide item name
      if (item && item.name) {
        itemNameForLog = `${item.name} (ID: ${adjustmentDetails.itemId})`;
      }
      // To get location name, you might need a db.getStorageLocationById(id) or fetch it if not already in adjustmentDetails
      // For now, we'll assume adjustmentDetails might send locationName, or we just use ID.
      // If your Select on frontend sends { value: id, label: name } for location,
      // then adjustmentDetails.selectedLocation.label would be the name.
      // For simplicity, let's assume we log the location ID for now, or if you pass locationName from frontend.
      if (adjustmentDetails.locationName) {
        // If frontend sends locationName
        locationNameForLog = `${adjustmentDetails.locationName} (ID: ${adjustmentDetails.locationId})`;
      }
    } catch (fetchError) {
      console.warn(
        `[main.js perform-stock-adjustment] Could not fetch item/location details for logging: ${fetchError.message}`
      );
    }

    const mappedTransactionType = mapReasonToTransactionType(
      adjustmentDetails.reason
    );
    console.log(
      `[main.js perform-stock-adjustment] User Reason: '${adjustmentDetails.reason}', Mapped Type: '${mappedTransactionType}' for ${itemNameForLog} at ${locationNameForLog}`
    );

    const transactionContext = {
      transactionType: mappedTransactionType,
      referenceId: null, // No specific reference for manual adjustments unless provided
      referenceType: "MANUAL_STOCK_ADJUSTMENT",
      userId: adjustmentDetails.userId, // Should be currentUser.id
      usernameSnapshot: adjustmentDetails.username, // Should be currentUser.username
      notes: `User Reason: ${adjustmentDetails.reason}. Details: ${
        adjustmentDetails.notes || "N/A"
      }`,
    };

    console.log(
      `[main.js perform-stock-adjustment] Calling db.adjustStockQuantity for ${itemNameForLog} at LocID ${adjustmentDetails.locationId} with Qty ${adjustmentDetails.adjustmentQuantity}`
    );

    const adjustmentResult = await db.adjustStockQuantity(
      adjustmentDetails.itemId,
      adjustmentDetails.locationId, // <<< PASS locationId HERE
      adjustmentDetails.adjustmentQuantity, // This is the numeric value
      transactionContext
    );
    console.log(
      "[main.js perform-stock-adjustment] db.adjustStockQuantity result:",
      adjustmentResult
    );

    if (adjustmentResult.success) {
      logActivity(
        username,
        "Performed Stock Adjustment",
        `Item: ${itemNameForLog}, At Location: ${locationNameForLog}, Type: ${mappedTransactionType}, Adj By: ${adjustmentDetails.adjustmentQuantity}, New Qty@Loc: ${adjustmentResult.newQuantityAtLocation}, Reason: ${adjustmentDetails.reason}`
      );
      // Return newQuantityAtLocation
      return {
        success: true,
        message: "Stock adjusted successfully!",
        newQuantityAtLocation: adjustmentResult.newQuantityAtLocation,
      };
    } else {
      console.error(
        "[main.js perform-stock-adjustment] Stock adjustment failed in db client:",
        adjustmentResult.message
      );
      logActivity(
        username,
        "Stock Adjustment Failed",
        `Item: ${itemNameForLog}, At Location: ${locationNameForLog}, DB Error: ${
          adjustmentResult.message || "Unknown DB error"
        }`
      );
      return {
        success: false,
        message: adjustmentResult.message || "Failed to adjust stock.",
      };
    }
  } catch (error) {
    console.error(
      "[main.js perform-stock-adjustment] Critical error during stock adjustment:",
      error
    );
    logActivity(
      username,
      "Stock Adjustment Error",
      `Item: ${itemNameForLog}, At Location: ${locationNameForLog}, Critical Error: ${error.message}`
    );
    return {
      success: false,
      message: `An unexpected error occurred: ${error.message}`,
    };
  }
});

ipcMain.handle("get-bundles", async (event, filters) => {
  console.log(
    "[Main Process] get-bundles handler invoked with filters:",
    filters
  );
  try {
    // The filters object from frontend might now contain storeLocationId
    const bundles = await db.getBundles(filters || {});
    return bundles;
  } catch (error) {
    console.error("[Main Process] Error in get-bundles handler:", error);
    throw error;
  }
});

ipcMain.handle("get-bundle-by-id", async (event, bundleId) => {
  console.log(
    "[Main Process] get-bundle-by-id handler invoked with ID:",
    bundleId
  );
  // Add authorization if needed
  try {
    const bundle = await db.getBundleById(bundleId);
    return bundle;
  } catch (error) {
    console.error("[Main Process] Error in get-bundle-by-id handler:", error);
    throw error;
  }
});

ipcMain.handle("create-bundle", async (event, bundleData) => {
  console.log("[Main Process] create-bundle handler invoked.");
  const user = currentUser;
  if (!user || user.role !== "admin") {
    // Example authorization
    return { success: false, message: "Unauthorized to create bundles." };
  }
  try {
    const result = await db.createBundle(bundleData);
    if (result.success && result.bundle) {
      await db.addActivityLogEntry({
        user_identifier: user.username,
        action: "Created Bundle",
        details: `Bundle: ${result.bundle.name} (ID: ${
          result.bundle.id
        }, SKU: ${result.bundle.bundle_sku || "N/A"})`,
      });
      // Consider sending 'new-log-entry' if needed
    }
    return result;
  } catch (error) {
    console.error("[Main Process] Error in create-bundle handler:", error);
    return {
      success: false,
      message: `Failed to create bundle: ${error.message}`,
    };
  }
});

ipcMain.handle("update-bundle", async (event, bundleId, bundleData) => {
  console.log("[Main Process] update-bundle handler invoked for ID:", bundleId);
  const user = currentUser;
  if (!user || user.role !== "admin") {
    return { success: false, message: "Unauthorized to update bundles." };
  }
  try {
    // The db.updateBundle in supabaseClient.js expects (bundleId, bundleData)
    const result = await db.updateBundle(bundleId, bundleData);
    if (result.success && result.bundle) {
      await db.addActivityLogEntry({
        user_identifier: user.username,
        action: "Updated Bundle",
        details: `Bundle: ${result.bundle.name} (ID: ${result.bundle.id})`,
      });
    }
    return result;
  } catch (error) {
    console.error("[Main Process] Error in update-bundle handler:", error);
    return {
      success: false,
      message: `Failed to update bundle: ${error.message}`,
    };
  }
});

ipcMain.handle("delete-bundle", async (event, bundleId) => {
  console.log("[Main Process] delete-bundle handler invoked for ID:", bundleId);
  const user = currentUser;
  if (!user || user.role !== "admin") {
    return { success: false, message: "Unauthorized to delete bundles." };
  }
  try {
    // Fetch bundle info before deleting for logging purposes (optional)
    const bundleInfo = await db.getBundleById(bundleId);
    const result = await db.deleteBundle(bundleId);
    if (result.success && bundleInfo) {
      await db.addActivityLogEntry({
        user_identifier: user.username,
        action: "Deleted Bundle",
        details: `Bundle: ${bundleInfo.name} (ID: ${bundleInfo.id})`,
      });
    }
    return result;
  } catch (error) {
    console.error("[Main Process] Error in delete-bundle handler:", error);
    return {
      success: false,
      message: `Failed to delete bundle: ${error.message}`,
    };
  }
});

ipcMain.handle("process-bundle-sale", async (event, args) => {
  // args is { bundleId, quantitySold }
  const { bundleId, quantitySold } = args; // Destructure here
  console.log(
    `[Main Process] process-bundle-sale handler invoked for Bundle ID: ${bundleId}, Quantity: ${quantitySold}`
  );
  const user = currentUser;
  if (!user) {
    return {
      success: false,
      message: "User not authenticated for bundle sale.",
    };
  }

  // CRITICAL: We need the storeLocationId to tell db.processBundleSale WHERE to deduct components from.
  // The db.processBundleSale function itself will need to know this.
  // Let's assume your db.getStoreLocationId() is working and accessible.
  let currentStoreLocationId;
  try {
    currentStoreLocationId = await db.getStoreLocationId();
    if (!currentStoreLocationId) {
      throw new Error(
        "STORE location ID could not be determined. Bundle sale cannot proceed."
      );
    }
    console.log(
      `[Main Process] Using STORE Location ID for component deduction: ${currentStoreLocationId}`
    );
  } catch (e) {
    console.error(
      "[Main Process] Error fetching STORE location ID for bundle sale:",
      e
    );
    return { success: false, message: `Configuration error: ${e.message}` };
  }

  try {
    // Pass bundleId, quantitySold, user info, AND the storeLocationId to the db function
    const saleContext = {
      userId: user.id,
      usernameSnapshot: user.username,
      storeLocationId: currentStoreLocationId, // <<< PASS THE STORE LOCATION ID
    };
    // db.processBundleSale now needs to accept this saleContext or specifically storeLocationId
    const result = await db.processBundleSale(
      bundleId,
      quantitySold,
      saleContext
    );

    if (result.success) {
      const bundleInfo = await db.getBundleById(bundleId); // For logging
      await logActivity(
        // Use your global logActivity
        user.username,
        "Processed Bundle Sale",
        `Bundle: ${
          bundleInfo?.name || `ID ${bundleId}`
        } sold. Qty: ${quantitySold}. Components deducted from STORE.`
      );
    } else {
      await logActivity(
        user.username,
        "Failed Bundle Sale",
        `Bundle ID: ${bundleId}, Qty: ${quantitySold}. Error: ${result.message}`
      );
    }
    return result;
  } catch (error) {
    console.error(
      "[Main Process] Error in process-bundle-sale handler:",
      error
    );
    await logActivity(
      user.username,
      "Error Processing Bundle Sale",
      `Bundle ID: ${bundleId}, Qty: ${quantitySold}. System Error: ${error.message}`
    );
    return {
      success: false,
      message: `Failed to process bundle sale: ${error.message}`,
    };
  }
});
ipcMain.handle("generate-order-number", async () => {
  try {
    return await db.generateOrderNumber();
  } catch (e) {
    return "SO-ERR";
  }
});

ipcMain.handle('create-sales-order', async (event, { orderData, orderItemsData }) => {
    const user = currentUser;
    console.log('[Main Process] IPC create-sales-order received. User:', user?.username, 'OrderData:', orderData);

    if (!user) {
        console.error('[Main Process] Create Sales Order: Unauthorized - No user.');
        return { success: false, message: "Unauthorized: User not logged in." }; // Ensure return
    }
    if (!orderData || !orderItemsData || orderItemsData.length === 0) {
        console.error('[Main Process] Create Sales Order: Invalid payload - Missing orderData or orderItemsData.');
        return { success: false, message: "Invalid order data: Order details or items are missing." }; // Ensure return
    }

    try {
        const fullOrderData = {
            ...orderData,
            created_by_user_id: user.id
        };
        console.log('[Main Process] Calling db.createSalesOrder with fullOrderData and orderItemsData.');
        const result = await db.createSalesOrder(fullOrderData, orderItemsData); // This calls supabaseClient

        console.log('[Main Process] db.createSalesOrder result:', result); // <<< IMPORTANT LOG

        if (result && result.success) { // Check if result and result.success exist
            if (typeof logActivity === 'function') {
                await logActivity(user.username, 'Created Sales Order', `Order ID: ${result.order?.id} (No: ${result.order?.order_number || ''}), Total: ${result.order?.total_amount}`);
            }
        } else {
            // If result is defined but success is false, or result is undefined
            if (typeof logActivity === 'function') {
                await logActivity(user.username, 'Failed to Create Sales Order', result?.message || 'Unknown DB error during creation');
            }
        }
        return result || { success: false, message: "Sales order creation failed with an undefined result from DB layer." }; // Ensure a return

    } catch (error) {
        console.error("[Main Process] Critical error in create-sales-order IPC handler:", error);
        if (typeof logActivity === 'function') {
            await logActivity(user.username, 'Error Creating Sales Order', `System Error: ${error.message}`);
        }
        // Ensure a structured error object is returned
        return { success: false, message: `Server error during sales order creation: ${error.message}` };
    }
});

ipcMain.handle("get-sales-orders", async (event, filters) => {
  try {
    return await db.getSalesOrders(filters || {});
  } catch (error) {
    console.error("Error in get-sales-orders IPC:", error);
    throw error;
  }
});

ipcMain.handle("get-sales-order-by-id", async (event, orderId) => {
  try {
    return await db.getSalesOrderById(orderId);
  } catch (error) {
    console.error("Error in get-sales-order-by-id IPC:", error);
    throw error;
  }
});

ipcMain.handle(
  "update-sales-order-status",
  async (event, { orderId, newStatus }) => {
    const user = currentUser;
    if (!user) return { success: false, message: "Unauthorized" };
    try {
      const result = await db.updateSalesOrderStatus(
        orderId,
        newStatus,
        user.id
      ); // user.id is passed as performingUserId

      if (result.success) {
        // --- MODIFICATION FOR ACTIVITY LOG ---
        let logDetails = `Order ID: ${orderId}.`;
        if (
          newStatus === "Fulfilled" &&
          result.order &&
          result.order.status === "Fulfilled"
        ) {
          // We can be more confident deductions occurred if the final status is indeed Fulfilled
          logDetails += ` Stock deductions processed.`;
        } else if (newStatus === "Fulfilled") {
          // This case might happen if the update to Fulfilled failed for some reason after stock deduction attempt.
          // The db function itself throws an error if deduction fails, so result.success would be false.
          // So, if result.success is true and newStatus is Fulfilled, deductions are implied.
          logDetails += ` Stock deductions were processed.`;
        }
        // --- END MODIFICATION ---
        logActivity(
          user.username,
          `Updated Sales Order Status to ${newStatus}`,
          logDetails
        );
      } else {
        // Log the failure more explicitly if needed, though db.updateSalesOrderStatus itself might log errors
        logActivity(
          user.username,
          `Failed to Update Sales Order Status to ${newStatus}`,
          `Order ID: ${orderId}. Error: ${result.message}`
        );
      }
      return result;
    } catch (error) {
      console.error("Error in update-sales-order-status IPC:", error);
      // Ensure error details are logged if an exception occurs before logActivity inside try
      logActivity(
        user.username,
        "Error updating Sales Order Status",
        `Order ID: ${orderId}. System Error: ${error.message}`
      );
      return { success: false, message: error.message };
    }
  }
);
ipcMain.handle(
  "get-inventory-transactions-for-item",
  async (event, argsObject) => {
    // argsObject will be { itemId, limit, offset }
    // Destructure from argsObject
    const { itemId, limit, offset } = argsObject;

    console.log(
      `[main.js] IPC get-inventory-transactions-for-item received argsObject:`,
      argsObject
    );
    try {
      // The itemId received here IS the actual ID value from selectedItem.value
      if (itemId === undefined || itemId === null) {
        throw new Error("Item ID is required to fetch transactions.");
      }
      // No need for the 'actualItemId' extraction logic if preload sends the primitive ID correctly.
      // typeof itemId should be 'number' or 'string' (if it's a UUID) here.

      // Add a type check to be safe, because the log shows [object Object]
      if (typeof itemId === "object") {
        console.error(
          `[main.js] ERROR: itemId is still an object in main.js: ${JSON.stringify(
            itemId
          )}. This should not happen with the corrected preload.`
        );
        throw new Error(
          `Received an object for itemId instead of a primitive value.`
        );
      }

      const effectiveLimit = limit === undefined ? 15 : parseInt(limit, 10);
      const effectiveOffset = offset === undefined ? 0 : parseInt(offset, 10);

      return await db.getInventoryTransactionsForItem(
        itemId,
        effectiveLimit,
        effectiveOffset
      );
    } catch (error) {
      console.error(
        `[main.js] Error in get-inventory-transactions-for-item handler for item ${itemId}:`,
        error
      );
      logActivity(
        currentUser?.username,
        "Error fetching inventory ledger",
        `Item ID: ${itemId}, Error: ${error.message}`
      );
      return {
        error:
          error.message || `Failed to fetch transactions for item ${itemId}.`,
      };
    }
  }
);
// --- NEW STOCK TRANSFER IPC HANDLERS ---
ipcMain.handle(
  "create-stock-transfer",
  async (event, transferDetailsFrontend) => {
    // transferDetailsFrontend should include:
    // itemId, quantityTransferred, sourceLocationId, destinationLocationId,
    // sourceLocationName, destinationLocationName, notes, referenceNumber
    const user = currentUser;
    if (!user) return { success: false, message: "User not authenticated." };

    const transferDetailsForDB = {
      ...transferDetailsFrontend,
      userId: user.id,
      usernameSnapshot: user.username,
    };
    // Log with names for better readability in activity log
    logActivity(
      user.username,
      "Initiated Stock Transfer",
      `Item ID: ${transferDetailsForDB.itemId}, Qty: ${transferDetailsForDB.quantityTransferred}, From Loc: ${transferDetailsForDB.sourceLocationName}(${transferDetailsForDB.sourceLocationId}), To Loc: ${transferDetailsForDB.destinationLocationName}(${transferDetailsForDB.destinationLocationId})`
    );
    try {
      const result = await db.createStockTransferAndAdjustInventory(
        transferDetailsForDB
      );
      if (result.success) {
        /* ... log success ... */
      } else {
        /* ... log failure ... */
      }
      return result;
    } catch (error) {
      /* ... error handling ... */
    }
  }
);

ipcMain.handle("get-stock-transfers", async (event, filters) => {
  try {
    return await db.getStockTransfers(filters || {});
  } catch (error) {
    console.error("[main.js] Error in get-stock-transfers handler:", error);
    // logActivity might be noisy here if it's just fetching a list
    throw error; // Let preload/renderer handle promise rejection
  }
});

ipcMain.handle("get-storage-locations", async () => {
  console.log("[main.js] IPC get-storage-locations");
  try {
    return await db.getStorageLocations();
  } catch (error) {
    /* ... error handling ... */
  }
});
ipcMain.handle("get-store-location-id", async () => {
  console.log("[main.js] IPC get-store-location-id");
  try {
    // Ensure db object is accessible here
    const id = await db.getStoreLocationId(); // Call the helper in supabaseClient
    return id;
  } catch (error) {
    console.error("[main.js] Error getting store location ID:", error);
    return null; // Return null on error
  }
});
ipcMain.handle(
  "get-item-quantity-at-location",
  async (event, itemId, locationId) => {
    console.log(
      `[main.js] IPC get-item-quantity-at-location for item ${itemId}, loc ${locationId}`
    );
    try {
      return await db.getItemQuantityAtLocation(itemId, locationId);
    } catch (error) {
      console.error(
        "[main.js] Error in get-item-quantity-at-location handler:",
        error
      );
      return 0; // Return 0 on error
    }
  }
);
ipcMain.handle("get-detailed-stock-report", async (event, filters) => {
  console.log(
    "[Main Process] get-detailed-stock-report called with filters:",
    filters
  );
  try {
    return await db.getDetailedStockReport(filters || {});
  } catch (error) {
    console.error(
      "[Main Process] Error in get-detailed-stock-report handler:",
      error
    );
    // LogActivity if needed
    return { success: false, message: error.message, data: [] };
  }
});

ipcMain.handle("get-sales-detail-report", async (event, filters) => {
  console.log(
    "[Main Process] get-sales-detail-report called with filters:",
    filters
  );
  try {
    return await db.getSalesDetailReport(filters || {});
  } catch (error) {
    console.error(
      "[Main Process] Error in get-sales-detail-report handler:",
      error
    );
    // LogActivity if needed
    return { success: false, message: error.message, data: [] };
  }
});

ipcMain.handle(
  "export-report-data",
  async (event, { reportData, format, fileNamePrefix }) => {
    console.log(
      `[Main Process] IPC export-report-data received. Format: ${format}, Prefix: ${fileNamePrefix}, Data length: ${reportData?.length}`
    ); // <<< ADD THIS
    const user = currentUser;
    if (!user) {
      console.error("[Main Process] Export failed: User not authenticated.");
      return { success: false, message: "User not authenticated." };
    }

    const defaultFileName = `${fileNamePrefix || "report"}-${
      new Date().toISOString().split("T")[0]
    }`;
    let fileExtension, fileContentBuffer; // Changed fileContent to fileContentBuffer for XLSX

    try {
      if (!reportData || reportData.length === 0) {
        console.warn("[Main Process] Export warning: No report data provided.");
        return { success: false, message: "No data to export." };
      }

      console.log("[Main Process] Preparing file content for format:", format); // <<< ADD THIS

      if (format === "csv") {
        fileExtension = "csv";
        // fileContent is a string for CSV
        fileContentBuffer = convertToCSV(reportData); // Assuming convertToCSV returns a string
        if (typeof fileContentBuffer !== "string") {
          console.error("[Main Process] convertToCSV did not return a string!");
          throw new Error("Internal error: CSV formatting failed.");
        }
        console.log(
          "[Main Process] CSV content generated. Length:",
          fileContentBuffer.length
        ); // <<< ADD THIS
      } else if (format === "xlsx") {
        fileExtension = "xlsx";
        const worksheet = XLSX.utils.json_to_sheet(reportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "ReportData");
        fileContentBuffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "buffer",
        }); // type: 'buffer' is important
        console.log(
          "[Main Process] XLSX content (buffer) generated. Length:",
          fileContentBuffer?.length
        ); // <<< ADD THIS
      } else {
        console.error(`[Main Process] Unsupported export format: ${format}`);
        return {
          success: false,
          message: `Unsupported export format: ${format}`,
        };
      }

      const window =
        BrowserWindow.fromWebContents(event.sender) ||
        BrowserWindow.getFocusedWindow();
      if (!window) {
        console.error(
          "[Main Process] Could not get window reference for save dialog."
        );
        throw new Error("Could not get window reference for save dialog.");
      }

      console.log("[Main Process] Showing save dialog..."); // <<< ADD THIS
      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: `Save ${format.toUpperCase()} Report`,
        defaultPath: `${defaultFileName}.${fileExtension}`,
        filters: [
          {
            name: `${format.toUpperCase()} Files`,
            extensions: [fileExtension],
          },
        ],
      });

      if (canceled || !filePath) {
        console.log("[Main Process] User cancelled save dialog.");
        return { success: true, message: "Export cancelled by user." };
      }
      console.log(`[Main Process] User selected path: ${filePath}`); // <<< ADD THIS

      console.log("[Main Process] Writing file to path..."); // <<< ADD THIS
      fs.writeFileSync(filePath, fileContentBuffer); // Works for both string (CSV) and buffer (XLSX)

      console.log("[Main Process] File written successfully."); // <<< ADD THIS
      await logActivity(
        user.username,
        `Exported Report (${format.toUpperCase()})`,
        `File: ${path.basename(filePath)}`
      );
      return {
        success: true,
        message: `Report exported successfully to ${path.basename(filePath)}`,
      };
    } catch (error) {
      console.error(
        `[Main Process] Critical error exporting report data (format: ${format}):`,
        error
      );
      await logActivity(
        user.username,
        `Error Exporting Report (${format.toUpperCase()})`,
        `Error: ${error.message}`
      );
      return {
        success: false,
        message: `Failed to export report: ${error.message}`,
      };
    }
  }
);

ipcMain.handle('export-generic-data', async (event, { exportType, fileNamePrefix }) => {
    const username = currentUser?.username; // User performing the export
    console.log(`[Main Process] IPC export-generic-data. Type: ${exportType}, Prefix: ${fileNamePrefix}`);
    if (typeof logActivity === 'function') await logActivity(username, `Started Data Export: ${exportType}`);

    let dataToExport;
    let headers; // Define headers based on exportType

    try {
        switch (exportType) {
            case 'comprehensive_inventory':
                dataToExport = await db.getAllItemsForExport(); // This calls your detailed inventory export function
                headers = [
                    'item_id', 'sku', 'item_name', 'variant', 'description', 'category',
                    'cost_price', 'item_status', 'is_archived', 'low_stock_threshold',
                    'item_created_at', 'item_updated_at',
                    'location_id', 'location_name', 'location_description', 'location_is_active',
                    'quantity_at_location'
                ];
                break;
            case 'customers':
                dataToExport = await db.getCustomers({}); // Fetches all customer fields by default
                // Define headers for customers, or let convertToCSV infer if all fields are desired and simple
                headers = ['id', 'full_name', 'email', 'phone', 'address', 'notes', 'created_at', 'updated_at'];
                break;
            case 'sales_orders':
                const rawSalesOrders = await db.getSalesOrders({}); // Fetches sales orders with nested customer
                dataToExport = await Promise.all(rawSalesOrders.map(async so => {
                    let createdByUsername = 'N/A';
                    if (so.created_by_user_id) {
                        const userInfo = await db.getUserInfoForLogById(so.created_by_user_id);
                        createdByUsername = userInfo?.username || 'N/A (User Fetch Failed)';
                    }
                    // Format date for CSV consistency if desired, or leave as ISO string
                    const formattedOrderDate = so.order_date ? new Date(so.order_date).toLocaleDateString('en-CA') : 'N/A'; // YYYY-MM-DD

                    return {
                        id: so.id,
                        order_number: so.order_number,
                        customer_name: so.customer?.full_name || 'N/A',
                        order_date: formattedOrderDate,
                        status: so.status,
                        total_amount: so.total_amount,
                        created_by_username: createdByUsername,
                        notes: so.notes
                    };
                }));
                headers = ['id', 'order_number', 'customer_name', 'order_date', 'status', 'total_amount', 'created_by_username', 'notes'];
                break;
            // Add more cases here for other export types like:
            // case 'sales_order_items':
            //     dataToExport = await db.getSalesOrderItemsForExport(); // You'd need to create this db function
            //     headers = [/* ... headers for sales order items ... */];
            //     break;
            // case 'returns':
            //     dataToExport = await db.getReturnRecords({}); // Your existing function
            //     // You might need to flatten nested data (item, customer, user) like for sales_orders
            //     headers = [/* ... headers for returns ... */];
            //     break;
            default:
                console.error(`[Main Process] Unsupported export type received: ${exportType}`);
                throw new Error(`Unsupported export type: ${exportType}`);
        }

        if (!dataToExport || dataToExport.length === 0) {
            if (typeof logActivity === 'function') await logActivity(username, `Finished Data Export: ${exportType}`, 'Status: Success (No data)');
            return { success: true, message: `No data found for ${exportType.replace(/_/g, ' ')} to export.` };
        }

        console.log(`[Main Process] Preparing CSV content for ${exportType}. Record count: ${dataToExport.length}`);
        const csvContent = convertToCSV(dataToExport, headers);

        const window = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
        if (!window) {
            console.error("[Main Process] Could not get window reference for save dialog.");
            throw new Error('Could not get window reference for save dialog.');
        }

        const { canceled, filePath } = await dialog.showSaveDialog(window, {
            title: `Save ${exportType.replace(/_/g, ' ')} Export`,
            defaultPath: `${fileNamePrefix}-${new Date().toISOString().split('T')[0]}.csv`,
            filters: [{ name: 'CSV Files', extensions: ['csv'] }]
        });

        if (canceled || !filePath) {
            if (typeof logActivity === 'function') await logActivity(username, `Finished Data Export: ${exportType}`, 'Status: Cancelled');
            return { success: true, message: 'Export cancelled by user.' };
        }

        fs.writeFileSync(filePath, csvContent, 'utf-8');
        if (typeof logActivity === 'function') await logActivity(username, `Finished Data Export: ${exportType}`, `Status: Success, File: ${path.basename(filePath)}`);
        return { success: true, message: `${exportType.replace(/_/g, ' ')} exported successfully to ${path.basename(filePath)}` };

    } catch (error) {
        console.error(`[Main Process] Critical error during generic export (${exportType}):`, error);
        if (typeof logActivity === 'function') await logActivity(username, `Error during Data Export: ${exportType}`, error.message);
        return { success: false, message: `Export failed for ${exportType.replace(/_/g, ' ')}: ${error.message}` };
    }
});

ipcMain.handle('generate-report', async (event, { reportType, filters }) => {
    const user = currentUser;
    if (!user) return { success: false, message: "User not authenticated." };
    console.log(`[Main Process] generate-report. Type: ${reportType}, Filters:`, filters);

    try {
        let result;
        switch (reportType) {
            case 'inventory_valuation': // Changed from current_stock for clarity
                result = await db.getInventoryValuationReportData(filters);
                break;
            case 'sales_performance': // Changed from sales_summary_with_details
                result = await db.getSalesPerformanceReportData(filters.period, filters.topItemsLimit);
                break;
            default:
                return { success: false, message: `Unknown report type: ${reportType}` };
        }

        if (result.success) {
            await logActivity(user.username, `Generated Report: ${reportType}`, `Filters: ${JSON.stringify(filters)}`);
        } else {
            await logActivity(user.username, `Failed to Generate Report: ${reportType}`, `Error: ${result.message || 'Unknown'}, Filters: ${JSON.stringify(filters)}`);
        }
        return result;

    } catch (error) {
        console.error(`[Main Process] Error generating report ${reportType}:`, error);
        await logActivity(user.username, `Error Generating Report: ${reportType}`, `Error: ${error.message}`);
        return { success: false, message: `Server error generating report: ${error.message}`, data: reportType === 'sales_performance' ? {} : [] };
    }
});

// --- END OF FILE ---
