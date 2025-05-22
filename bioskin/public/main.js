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
const { unifiedDb: db } = require("../src/supabaseClient"); // Use unifiedDb for offline/online support
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
};

// --- Global Variables ---
let currentUser = null;
let mainWindow;

// --- Central logging function ---
async function logActivity(user, action, details = "") {
  const userIdentifier = user || "System";
  const entryData = {
    user_identifier: userIdentifier,
    action: action,
    details: details || null,
  };

  console.log(
    `[Attempting Log] User: ${userIdentifier}, Action: ${action}, Details: ${details}`
  );

  try {
    const result = await db.addActivityLogEntry(entryData);
    if (!result.success) {
      console.error(
        `[main.js] Failed to add activity log to Supabase: ${result.message}`
      );
      return;
    }
    const entryForRenderer = {
      id: result.entry?.id || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: result.entry?.created_at || new Date().toISOString(),
      user: userIdentifier,
      action: action,
      details: details || "",
    };
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send("new-log-entry", entryForRenderer);
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
    console.error(
      "[main.js] Unexpected error during logActivity database operation:",
      error
    );
  }
}

// --- CSV Helper Function (Defined Globally) ---
function convertToCSV(data, headers) {
  if (!data || data.length === 0) {
    return "";
  }
  const headerKeys = headers || Object.keys(data[0]);
  const headerString = headerKeys.join(",");
  const rows = data.map((row) => {
    return headerKeys
      .map((key) => {
        let cell =
          row[key] === null || row[key] === undefined ? "" : String(row[key]);
        if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
          cell = `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      })
      .join(",");
  });
  return [headerString, ...rows].join("\n");
}

function mapReasonToTransactionType(reasonString) {
  if (!reasonString) return TRANSACTION_TYPES.UNKNOWN;
  const reasonLower = String(reasonString).toLowerCase().trim();
  if (reasonLower === "goods received from factory") return TRANSACTION_TYPES.GOODS_RECEIVED_FACTORY;
  if (reasonLower === "cycle count adjustment") return TRANSACTION_TYPES.CYCLE_COUNT;
  if (reasonLower === "damaged goods write-off") return TRANSACTION_TYPES.DAMAGED;
  if (reasonLower === "expired stock write-off") return TRANSACTION_TYPES.EXPIRED;
  if (reasonLower === "internal use") return TRANSACTION_TYPES.INTERNAL_USE;
  if (reasonLower === "stock transfer error correction") return TRANSACTION_TYPES.TRANSFER_ERROR;
  if (reasonLower === "found inventory") return TRANSACTION_TYPES.FOUND_STOCK;
  if (reasonLower === "other (specify in notes)") return TRANSACTION_TYPES.OTHER;
  if (reasonLower.includes("sample") || reasonLower.includes("marketing")) return TRANSACTION_TYPES.MARKETING;
  if (reasonLower.includes("gift") || reasonLower.includes("giveaway")) return TRANSACTION_TYPES.GIFT;
  console.warn(
    `[mapReasonToTransactionType] Unmapped reason: '${reasonString}'. Defaulting to ${TRANSACTION_TYPES.UNKNOWN}.`
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
    minWidth: 900,
    minHeight: 600,
    fullscreen: true,
    title: "Bioskin Inventory Management System",
    icon: windowIcon || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  const startUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../build/index.html")}`;

  console.log(`[main.js] Loading URL: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  mainWindow.on("closed", () => {
    console.log("[main.js] Main window closed. Clearing currentUser.");
    mainWindow = null;
    currentUser = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

// --- App Lifecycle Events ---
app.whenReady().then(() => {
  console.log("[main.js] App Ready. Setting up IPC Handlers...");

  // --- Custom Authentication ---
  ipcMain.handle("login", async (event, credentials) => {
    console.log(`[main.js] IPC login attempt for username: ${credentials?.username}`);
    if (!credentials || !credentials.username || !credentials.password) {
      return { success: false, message: "Username and password required." };
    }
    const result = await db.login(credentials.username, credentials.password);
    if (result.success && result.user) {
      currentUser = result.user;
      logActivity(currentUser.username, "User logged in");
      console.log(`[main.js] Login successful. User set:`, { id: currentUser.id, username: currentUser.username, role: currentUser.role });
    } else {
      currentUser = null;
      logActivity("System", "Failed login attempt", `Username: ${credentials.username}`);
      console.log(`[main.js] Login failed. Reason: ${result.message || "Unknown"}`);
    }
    return result;
  });

  ipcMain.handle("get-current-user", async () => {
    console.log(`[main.js] IPC get-current-user. Returning:`, currentUser ? { id: currentUser.id, username: currentUser.username, role: currentUser.role } : null);
    return currentUser;
  });

  ipcMain.handle("logout", async () => {
    const username = currentUser?.username;
    logActivity(username || "Unknown", "User logged out");
    console.log(`[main.js] IPC logout. Clearing user: ${username}`);
    currentUser = null;
    return { success: true };
  });

  // --- Item Management ---
  ipcMain.handle("get-items", async (event, filters) => {
    try {
      console.log("[main.js] IPC get-items called with filters (including sort):", filters);
      return await db.getItems(filters);
    } catch (error) {
      console.error("[main.js] Error in get-items handler:", error);
      logActivity(currentUser?.username, "Error fetching items", error.message);
      return { error: error.message || "Failed to fetch items." };
    }
  });

  ipcMain.handle("get-item-by-id", async (event, id) => {
    console.log("[main.js] IPC get-item-by-id called for ID:", id);
    try {
      return await db.getItemById(id);
    } catch (error) {
      console.error("[main.js] Error getting item by id:", id, error);
      logActivity(currentUser?.username, "Error fetching item by ID", `ID: ${id}, Error: ${error.message}`);
      return { error: error.message || "Failed to fetch item by ID." };
    }
  });

  ipcMain.handle("create-item", async (event, itemPayload) => {
    console.log("[main.js] IPC create-item called with payload:", JSON.stringify(itemPayload, null, 2));
    const user = currentUser;
    if (!user) {
      return { success: false, message: "User not authenticated." };
    }
    try {
      const { itemData, initialStockEntries } = itemPayload;
      if (!itemData || !itemData.name) {
        return { success: false, message: "Item name is required." };
      }

      // Call the modified db.createItem
      const result = await db.createItem(itemPayload, initialStockEntries || [], user.id, user.username); // Pass itemPayload directly

      if (result.success && result.item) {
        logActivity(user.username, "Added inventory item", `Name: ${result.item.name}, SKU: ${result.item.sku || "N/A"}, ID: ${result.item.id}`);
      } else {
        // Log failure, result.message will contain the duplicate SKU info if applicable
        logActivity(user.username, "Failed to add item", result.message || "Unknown DB error");
      }
      return result; // Return the full result object which may include isDuplicateSku
    } catch (error) {
      console.error("[main.js] Error creating item:", itemPayload, error);
      logActivity(currentUser?.username, "Error creating item", error.message);
      return { success: false, message: error.message || "Unexpected error creating item." };
    }
  });

  ipcMain.handle("check-sku-exists", async (event, sku) => {
      console.log(`[main.js] IPC check-sku-exists called for SKU: ${sku}`);
      try {
        if (!sku || String(sku).trim() === "") {
          return { exists: false, item: null, error: "SKU cannot be empty." };
        }
        return await db.checkSkuExists(String(sku).trim());
      } catch (error) {
        console.error(`[main.js] Error checking SKU existence for ${sku}:`, error);
        logActivity(currentUser?.username, "Error checking SKU", `SKU: ${sku}, Error: ${error.message}`);
        return { exists: false, item: null, error: error.message || "Failed to check SKU." };
      }
    });

  ipcMain.handle("update-item", async (event, itemData) => {
    const user = currentUser;
    if (!user) {
      logActivity("System", "Update Item Error", `Attempt to update item without authenticated user. Item ID: ${itemData?.id || "Unknown"}`);
      return { success: false, message: "Authentication error: No user session found." };
    }
    if (user.role !== "admin") {
      if (itemData.id === undefined || itemData.id === null) {
        logActivity(user.username, "Update Item Error", `Missing ID in itemData for update.`);
        return { success: false, message: "Item ID is missing for update." };
      }
      const originalItem = await db.getItemById(itemData.id);
      if (!originalItem) {
        logActivity(user.username, "Update Item Error", `Item not found for ID: ${itemData.id}`);
        return { success: false, message: "Item not found for update." };
      }
      if (itemData.sku !== originalItem.sku) {
        logActivity(user.username, "Update Item Denied", `Attempt to change SKU for item ${originalItem.name} (ID: ${itemData.id})`);
        return { success: false, message: "Authorization denied: Employees cannot change SKU." };
      }
      const currentPrice = parseFloat(itemData.cost_price);
      const originalPrice = parseFloat(originalItem.cost_price);
      if (isNaN(currentPrice)) {
        logActivity(user.username, "Update Item Error", `Invalid price format for item ${originalItem.name} (ID: ${itemData.id})`);
        return { success: false, message: "Invalid product price format." };
      }
      if (currentPrice !== originalPrice) {
        logActivity(user.username, "Update Item Denied", `Attempt to change Price for item ${originalItem.name} (ID: ${itemData.id})`);
        return { success: false, message: "Authorization denied: Employees cannot change Price." };
      }
    }
    const itemIdForLog = itemData?.id || "Unknown ID";
    const itemNameForLog = itemData?.name || `Item ID ${itemIdForLog}`;
    const { quantity, id, ...dataToUpdate } = itemData;
    try {
      if (id === undefined || id === null) {
        logActivity(user.username, "Update Item Error", `Missing ID in itemData for item ${itemNameForLog}`);
        return { success: false, message: "Item ID is missing for update." };
      }
      const result = await db.updateItem(id, dataToUpdate);
      if (result.success && result.item) {
        logActivity(user.username, `Updated item details`, `Item: ${result.item.name || itemNameForLog} (ID: ${id})`);
      } else {
        logActivity(user.username, `Failed to update item`, `Item: ${itemNameForLog} (ID: ${id}). Reason: ${result.message || "Unknown DB error"}`);
      }
      return result;
    } catch (error) {
      console.error(`[main.js] Error handling update-item for ID ${itemIdForLog}:`, error);
      logActivity(user.username, `Error updating item`, `Item: ${itemNameForLog} (ID: ${itemIdForLog}). Error: ${error.message}`);
      return { success: false, message: error.message || "Failed to update item on server." };
    }
  });

  ipcMain.handle("delete-item", async (event, itemId) => {
    console.log('[main.js] IPC "delete-item" (acting as ARCHIVE) called for ID:', itemId);
    const username = currentUser?.username;
    let itemDetailsForLog = `ID: ${itemId}`;
    try {
      const item = await db.getItemById(itemId);
      if (!item) {
        logActivity(username, "Archive Item Error", `Item with ID ${itemId} not found.`);
        return { success: false, message: `Item with ID ${itemId} not found.` };
      }
      itemDetailsForLog = `Name: ${item.name}, SKU: ${item.sku || "N/A"}, ID: ${itemId}`;
      if (item.is_archived) {
        logActivity(username, "Archive Item Info", `Item ${itemDetailsForLog} is already archived.`);
        return { success: true, message: `Item "${item.name}" is already archived. No action taken.` };
      }
      const result = await db.archiveItem(itemId, true);
      if (result.success) {
        logActivity(username, "Archived inventory item", itemDetailsForLog);
      } else {
        logActivity(username, "Failed to archive item", `Details: ${itemDetailsForLog}, Reason: ${result.message || "Unknown DB error"}`);
      }
      return result;
    } catch (error) {
      console.error(`[main.js delete-item/archive] Critical error for item ID ${itemId}:`, error);
      logActivity(username, "Error archiving item", `Details: ${itemDetailsForLog}, Error: ${error.message}`);
      return { success: false, message: error.message || "Unexpected error archiving item." };
    }
  });

  ipcMain.handle("unarchive-item", async (event, itemId) => {
    console.log('[main.js] IPC "unarchive-item" called for ID:', itemId);
    const username = currentUser?.username;
    let itemDetailsForLog = `ID: ${itemId}`;
    try {
      const item = await db.getItemById(itemId);
      if (!item) {
        logActivity(username, "Unarchive Item Error", `Item with ID ${itemId} not found.`);
        return { success: false, message: `Item with ID ${itemId} not found.` };
      }
      itemDetailsForLog = `Name: ${item.name}, SKU: ${item.sku || "N/A"}, ID: ${itemId}`;
      if (!item.is_archived) {
        logActivity(username, "Unarchive Item Info", `Item ${itemDetailsForLog} is already active (not archived).`);
        return { success: true, message: `Item "${item.name}" is already active.` };
      }
      const result = await db.archiveItem(itemId, false);
      if (result.success) {
        logActivity(username, "Restored (Unarchived) inventory item", itemDetailsForLog);
      } else {
        logActivity(username, "Failed to unarchive item", `Details: ${itemDetailsForLog}, Reason: ${result.message || "Unknown DB error"}`);
      }
      return result;
    } catch (error) {
      console.error(`[main.js unarchive-item] Critical error for item ID ${itemId}:`, error);
      logActivity(username, "Error unarchiving item", `Details: ${itemDetailsForLog}, Error: ${error.message}`);
      return { success: false, message: error.message || "Unexpected error unarchiving item." };
    }
  });

  ipcMain.handle("archive-customer", async (event, customerId, archiveStatus) => {
      console.log(`[Main Process] Received "archive-customer" for ID: ${customerId}, Status: ${archiveStatus}`);
      const username = currentUser?.username;
      let customerDetailsForLog = `ID: ${customerId}`;

      try {
        const customer = await db.getCustomerById(customerId);
        if (customer) {
          customerDetailsForLog = `Name: ${customer.full_name}, ID: ${customerId}`;
        }

        const result = await db.archiveCustomer(customerId, archiveStatus);

        if (result.success) {
          const actionText = archiveStatus ? "Archived" : "Restored";
          logActivity(username, `${actionText} customer`, customerDetailsForLog);
        } else {
          const actionText = archiveStatus ? "archive" : "restore";
          logActivity(username, `Failed to ${actionText} customer`, `Details: ${customerDetailsForLog}, Reason: ${result.message || "Unknown DB error"}`);
        }
        return result;
      } catch (error) {
        console.error(`[Main Process] Error in "archive-customer" handler for ID ${customerId}:`, error);
        const actionText = archiveStatus ? "archiving" : "restoring";
        logActivity(username, `Error ${actionText} customer`, `Details: ${customerDetailsForLog}, Error: ${error.message}`);
        return { success: false, message: error.message || `Unexpected error ${actionText} customer.` };
      }
    });

  // --- Customer Management ---
  ipcMain.handle("get-customers", async (event, filters) => {
      console.log('[Main Process] Received "get-customers" with filters:', filters);
      try {
        // --- MODIFICATION START ---
        // Ensure filters (including is_archived) are passed to the db function
        return await db.getCustomers(filters || {});
        // --- MODIFICATION END ---
      } catch (error) {
        console.error('[Main Process] Error in "get-customers" handler:', error);
        logActivity(currentUser?.username, "Error fetching customers", error.message);
        return { error: error.message || "Failed to fetch customers." };
      }
    });

  ipcMain.handle("get-customer-by-id", async (event, id) => {
    console.log('[Main Process] Received "get-customer-by-id" for ID:', id);
    try {
      return await db.getCustomerById(id);
    } catch (error) {
      console.error('[Main Process] Error in "get-customer-by-id" handler:', error);
      logActivity(currentUser?.username, "Error fetching customer by ID", `ID: ${id}, Error: ${error.message}`);
      return { error: error.message || "Failed to fetch customer by ID." };
    }
  });

  ipcMain.handle("create-customer", async (event, customerData) => {
    console.log('[Main Process] Received "create-customer" with data:', customerData);
    try {
      const result = await db.createCustomer(customerData);
      if (result.success && result.customer) {
        logActivity(currentUser?.username, "Added customer", `Name: ${result.customer.full_name}, ID: ${result.customer.id}`);
      } else {
        logActivity(currentUser?.username, "Failed to add customer", result.message || "Unknown DB error");
      }
      return result;
    } catch (error) {
      console.error('[Main Process] Error in "create-customer" handler:', error);
      logActivity(currentUser?.username, "Error creating customer", error.message);
      return { success: false, message: error.message || "Unexpected error creating customer." };
    }
  });

  ipcMain.handle("update-customer", async (event, customerDataWithId) => {
    console.log('[Main Process] Received "update-customer" with data:', customerDataWithId);
    try {
      if (!customerDataWithId || customerDataWithId.id === undefined || customerDataWithId.id === null) {
        throw new Error("Customer ID is missing or invalid for update.");
      }
      const id = customerDataWithId.id;
      const { id: removedId, ...customerData } = customerDataWithId;
      const result = await db.updateCustomer(id, customerData);
      if (result.success && result.customer) {
        logActivity(currentUser?.username, "Updated customer", `Name: ${result.customer.full_name}, ID: ${id}`);
      } else {
        logActivity(currentUser?.username, "Failed to update customer", `ID: ${id}, Reason: ${result.message || "Unknown DB error"}`);
      }
      return result;
    } catch (error) {
      console.error('[Main Process] Error in "update-customer" handler:', error);
      logActivity(currentUser?.username, "Error updating customer", `ID: ${customerDataWithId?.id}, Error: ${error.message}`);
      return { success: false, message: error.message || "Unexpected error updating customer." };
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
      console.warn(`[main.js] Could not fetch details before deleting customer (ID: ${id}):`, fetchError.message);
    }
    try {
      const result = await db.deleteCustomer(id);
      if (result.success) {
        logActivity(currentUser?.username, "Deleted customer", customerDetails);
      } else {
        logActivity(currentUser?.username, "Failed to delete customer", `Details: ${customerDetails}, Reason: ${result.message || "Unknown DB error"}`);
      }
      return result;
    } catch (error) {
      console.error('[Main Process] Error in "delete-customer" handler:', error);
      logActivity(currentUser?.username, "Error deleting customer", `Details: ${customerDetails}, Error: ${error.message}`);
      return { success: false, message: error.message || "Unexpected error deleting customer." };
    }
  });

  // --- Analytics (Inventory Focused) ---
  ipcMain.handle("get-inventory-summary", async () => {
    console.log("[main.js] IPC get-inventory-summary");
    try {
      return await db.getInventorySummary();
    } catch (error) {
      console.error("[main.js] Error getting inventory summary:", error);
      logActivity(currentUser?.username, "Error getting inventory summary", error.message);
      return { success: false, message: error.message, summary: null };
    }
  });

  ipcMain.handle("get-low-stock-items", async (event, threshold) => {
      console.log("[main.js] IPC get-low-stock-items with threshold:", threshold);
      try {
          return await db.getLowStockItems(threshold, "STORE");
      } catch (error) {
          console.error("[main.js] Error getting low stock items:", error);
          logActivity(currentUser?.username, "Error getting low stock items", error.message);
          return { success: false, message: error.message, items: [] };
      }
  });

  ipcMain.handle("get-inventory-by-category", async () => {
    console.log("[main.js] IPC get-inventory-by-category");
    try {
      return await db.getInventoryByCategory();
    } catch (error) {
      console.error("[main.js] Error getting inventory by category:", error);
      logActivity(currentUser?.username, "Error getting category analytics", error.message);
      return { success: false, message: error.message, data: [] };
    }
  });

  ipcMain.handle("get-inventory-by-storage", async () => {
    console.log("[main.js] IPC get-inventory-by-storage");
    try {
      return await db.getInventoryByStorageLocation();
    } catch (error) {
      console.error("[main.js] Error getting inventory by storage:", error);
      logActivity(currentUser?.username, "Error getting storage analytics", error.message);
      return { success: false, message: error.message, data: [] };
    }
  });

  // --- File Processing ---
  ipcMain.handle("import-initial-items", async (event, { fileData }) => {
    const username = currentUser?.username;
    const fileName = fileData?.name || "Unknown file";
    logActivity(username, "Started initial item import", `File: ${fileName}`);
    let result;
    try {
      if (!fileData || !fileData.contentBase64) {
        throw new Error("File data or content is missing.");
      }
      const { contentBase64, type } = fileData;
      console.log(`[main.js] IPC import-initial-items: Processing file ${fileName}`);
      const buffer = Buffer.from(contentBase64, "base64");
      let itemsToParse = [];
      if (type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || fileName.endsWith(".xlsx")) {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("XLSX file contains no sheets.");
        const worksheet = workbook.Sheets[sheetName];
        itemsToParse = XLSX.utils.sheet_to_json(worksheet, { defval: null });
      } else if (type === "text/csv" || fileName.endsWith(".csv")) {
        const csv = buffer.toString("utf-8");
        const parseResult = Papa.parse(csv, { header: true, skipEmptyLines: true });
        if (parseResult.errors.length > 0) {
          console.warn(`[main.js] CSV parsing errors for ${fileName}:`, parseResult.errors);
        }
        itemsToParse = parseResult.data;
      } else {
        throw new Error(`Unsupported file type: ${type || "unknown"}`);
      }
      result = { fileName: fileName, processedCount: itemsToParse.length, successCount: 0, errors: [] };
      if (itemsToParse.length === 0) {
        result.errors.push("No data rows found in the file.");
      } else {
        const skuSet = new Set();
        for (const [index, item] of itemsToParse.entries()) {
          const rowNum = index + 2;
          const normalizedItem = {};
          for (const key in item) {
            normalizedItem[key.trim().toLowerCase()] = item[key];
          }
          const sku = normalizedItem.sku !== null && normalizedItem.sku !== undefined ? String(normalizedItem.sku).trim() : null;
          const name = normalizedItem.name !== null && normalizedItem.name !== undefined ? String(normalizedItem.name).trim() : null;
          if (!sku) {
            result.errors.push(`Row ${rowNum}: Missing SKU.`); // Corrected: result.errors
            continue;
          }
          if (!name) {
            result.errors.push(`Row ${rowNum} (SKU: ${sku}): Missing Name.`); // Corrected: result.errors
            continue;
          }
          if (skuSet.has(sku)) {
            result.errors.push(`Row ${rowNum}: Duplicate SKU ${sku} found within the import file. Skipped.`);
            continue;
          }
          skuSet.add(sku);
          const itemDbData = {
            name: name,
            sku: sku,
            description: String(normalizedItem.description || "").trim(),
            cost_price: parseFloat(normalizedItem.cost || normalizedItem.cost_price) || 0,
            // quantity: parseInt(normalizedItem.quantity, 10) || 0, // Quantity handled by initialStockEntries in createItem
            category: String(normalizedItem.category || "Uncategorized").trim(),
            // storage_location: String(normalizedItem.storage || normalizedItem.storage_location || "Main Warehouse").trim(), // Handled by initialStockEntries
            status: String(normalizedItem.status || "Normal").trim(),
            variant: String(normalizedItem.variant || "").trim(),
          };
          // For initial import, we might assume a default location or require it in the file
          // For simplicity, let's assume initial stock is 0 or handled by a separate process/column
          // The createItem function in db.js now expects initialStockEntries.
          // This import function needs to be adapted to provide that structure if quantities are in the file.
          // For now, it will create items with 0 stock if 'quantity' column is not mapped to initialStockEntries.
          // Let's assume the file has 'Quantity' and 'Storage Location' for initial stock.
          const initialStockQuantity = parseInt(normalizedItem.quantity, 10) || 0;
          const initialStorageLocationName = String(normalizedItem.storage_location || normalizedItem.storage || "STORE").trim(); // Default to STORE
          let initialStockEntries = [];
          if (initialStockQuantity > 0) {
            // Need to get location ID from name
            const locResult = await db.getStorageLocations(); // This is inefficient to call in a loop
            const targetLocation = locResult.locations.find(l => l.name === initialStorageLocationName);
            if (targetLocation) {
                initialStockEntries.push({ locationId: targetLocation.id, quantity: initialStockQuantity, locationName: initialStorageLocationName });
            } else {
                result.errors.push(`Row ${rowNum} (SKU: ${sku}): Storage location "${initialStorageLocationName}" not found. Stock not added.`);
            }
          }

          try {
            const existingItems = await db.getItems({ searchTerm: sku, is_archived: null }); // Check all items
            const alreadyExists = existingItems.some((existing) => existing.sku === sku);
            if (alreadyExists) {
              result.errors.push(`Row ${rowNum}: Item with SKU ${sku} already exists. Skipped.`);
              continue;
            }
            // Pass user.id and user.username for logging within createItem
            const creationResult = await db.createItem(itemDbData, initialStockEntries, user.id, user.username);
            if (creationResult.success) {
              result.successCount++;
            } else {
              result.errors.push(`Row ${rowNum} (SKU: ${sku}): Failed - ${creationResult.message || "DB error"}`);
            }
          } catch (dbError) {
            result.errors.push(`Row ${rowNum} (SKU: ${sku}): Processing Error - ${dbError.message}`);
          }
        }
      }
      console.log("[main.js] Initial import results:", result);
      logActivity(username, "Finished initial item import", `File: ${fileName}, Imported: ${result.successCount}, Errors/Skipped: ${result.errors.length}`);
      return { success: true, ...result };
    } catch (error) {
      console.error("[main.js] Critical error during initial import:", error);
      logActivity(username, "Error processing initial import file", `File: ${fileName}, Error: ${error.message}`);
      result = { fileName: fileName, processedCount: 0, successCount: 0, errors: [`Critical processing error: ${error.message}`] };
      return { success: false, ...result };
    }
  });

  ipcMain.handle("process-inventory-file", async (event, { fileData, actionType, columnMapping }) => {
      const username = currentUser?.username;
      const fileName = fileData?.name || "Unknown file";
      logActivity(username, `Started bulk stock update (${actionType})`, `File: ${fileName}`);
      let result;
      try {
        if (!fileData || !fileData.contentBase64) {
          throw new Error("File data or content is missing.");
        }
        const { contentBase64, type } = fileData;
        console.log(`[main.js] IPC process-inventory-file: Processing file ${fileName}, Action: ${actionType}`);
        const buffer = Buffer.from(contentBase64, "base64");
        let itemsToParse = [];
        if (type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || fileName.endsWith(".xlsx")) {
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error("XLSX file contains no sheets.");
          const worksheet = workbook.Sheets[sheetName];
          itemsToParse = XLSX.utils.sheet_to_json(worksheet, { defval: null });
        } else if (type === "text/csv" || fileName.endsWith(".csv")) {
          const csv = buffer.toString("utf-8");
          const parseResult = Papa.parse(csv, { header: true, skipEmptyLines: true });
          if (parseResult.errors.length > 0) {
            console.warn(`[main.js] CSV parsing errors for ${fileName}:`, parseResult.errors);
          }
          itemsToParse = parseResult.data;
        } else {
          throw new Error(`Unsupported file type: ${type || "unknown"}`);
        }
        result = { fileName: fileName, processedCount: itemsToParse.length, successCount: 0, errors: [] };
        if (itemsToParse.length === 0) {
          result.errors.push("No data rows found in the file.");
        } else {
          const firstRowKeys = Object.keys(itemsToParse[0] || {});
          if (!firstRowKeys.includes(columnMapping.sku)) {
            result.errors.push(`Required header '${columnMapping.sku}' not found in the file.`);
          }
          if (!firstRowKeys.includes(columnMapping.quantity)) {
            result.errors.push(`Required header '${columnMapping.quantity}' not found in the file.`);
          }
          // Add a check for 'Location' header if actionType involves specific locations
          const locationHeader = columnMapping.location || 'Location'; // Default if not provided
          const requiresLocation = actionType === 'set-at-location' || actionType === 'add-at-location' || actionType === 'deduct-at-location'; // Example new action types
          if (requiresLocation && !firstRowKeys.includes(locationHeader)) {
             result.errors.push(`Required header '${locationHeader}' not found for location-specific update.`);
          }


          if (result.errors.length === 0) {
            for (const [index, item] of itemsToParse.entries()) {
              const rowNum = index + 2;
              const sku = item[columnMapping.sku] !== null && item[columnMapping.sku] !== undefined ? String(item[columnMapping.sku]).trim() : null;
              const quantityFromFileStr = item[columnMapping.quantity];
              const quantityFromFile = parseInt(quantityFromFileStr, 10);
              const locationNameFromFile = requiresLocation ? (item[locationHeader] ? String(item[locationHeader]).trim() : null) : null;

              if (!sku) {
                result.errors.push(`Row ${rowNum}: Missing SKU (header '${columnMapping.sku}').`);
                continue;
              }
              if (isNaN(quantityFromFile)) {
                result.errors.push(`Row ${rowNum} (SKU: ${sku}): Invalid quantity '${quantityFromFileStr}' (header '${columnMapping.quantity}').`);
                continue;
              }
              if (requiresLocation && !locationNameFromFile) {
                result.errors.push(`Row ${rowNum} (SKU: ${sku}): Missing Location (header '${locationHeader}').`);
                continue;
              }

              try {
                const itemsWithSku = await db.getItems({ searchTerm: sku, is_archived: null });
                const existingItem = itemsWithSku.find((i) => i.sku === sku);
                if (!existingItem) {
                  result.errors.push(`Row ${rowNum}: Item with SKU ${sku} not found.`);
                  continue;
                }

                let targetLocationId = null;
                if (requiresLocation) {
                    const locResult = await db.getStorageLocations();
                    const foundLoc = locResult.locations.find(l => l.name.toLowerCase() === locationNameFromFile.toLowerCase());
                    if (!foundLoc) {
                        result.errors.push(`Row ${rowNum} (SKU: ${sku}): Location "${locationNameFromFile}" not found.`);
                        continue;
                    }
                    targetLocationId = foundLoc.id;
                }

                // For non-location-specific updates (add, deduct, set on total_quantity)
                // This part needs to be re-thought. Bulk updates should ideally target specific locations.
                // The current `db.updateItem` updates the master `items` table, which doesn't have a direct quantity.
                // This handler should probably call `db.adjustStockQuantity` for a default/specified location.
                // For now, I'll comment out the direct quantity update on `existingItem` as it's misleading.
                // This section needs a decision:
                // 1. Update total quantity (problematic without knowing which location to adjust).
                // 2. Require a 'Location' column in the CSV for all actions.
                // 3. Assume a default location (e.g., "STORE") if not specified.

                // Assuming for now that bulk updates should be location-specific if they modify quantity.
                // If actionType is 'add', 'deduct', 'set' and no location is specified, this is an issue.
                // Let's assume for now these actions are meant for a default location or require a location column.
                // For simplicity, let's assume a default "STORE" location if not provided and action is location-based.
                if (!targetLocationId && (actionType === 'add' || actionType === 'deduct' || actionType === 'set')) {
                    // This is a simplified path. Ideally, the CSV should specify the location.
                    // Or, the UI should ask for a default location for the entire batch.
                    const storeLocId = await db.getStoreLocationId(); // Get "STORE" ID
                    if (!storeLocId) {
                        result.errors.push(`Row ${rowNum} (SKU: ${sku}): Default STORE location not found for update. Please specify location in file.`);
                        continue;
                    }
                    targetLocationId = storeLocId;
                }


                if (targetLocationId) { // Only proceed if we have a location to adjust
                    const itemDetailsForLocation = await db.getItemById(existingItem.id); // Fetches locations array
                    const locData = itemDetailsForLocation.locations.find(l => l.locationId === targetLocationId);
                    const currentQuantityAtLocation = locData ? locData.quantity : 0;
                    let newQuantityAtLocation;

                    switch (actionType) {
                      case "add": // Assumed to be add-at-location
                        newQuantityAtLocation = currentQuantityAtLocation + quantityFromFile;
                        break;
                      case "deduct": // Assumed to be deduct-at-location
                        newQuantityAtLocation = Math.max(0, currentQuantityAtLocation - quantityFromFile);
                        break;
                      case "set": // Assumed to be set-at-location
                        newQuantityAtLocation = Math.max(0, quantityFromFile);
                        break;
                      default:
                        result.errors.push(`Row ${rowNum} (SKU: ${sku}): Invalid action type '${actionType}'.`);
                        continue; // Skip to next item in loop
                    }

                    const adjustmentAmount = newQuantityAtLocation - currentQuantityAtLocation;
                    if (adjustmentAmount !== 0) { // Only adjust if there's a change
                        const transactionDetails = {
                            transactionType: `BULK_UPDATE_${actionType.toUpperCase()}`,
                            referenceId: `FILE-${fileName.substring(0,10)}`,
                            referenceType: "BULK_STOCK_UPDATE",
                            userId: currentUser.id,
                            usernameSnapshot: currentUser.username,
                            notes: `Bulk update from file ${fileName}. Action: ${actionType}. SKU: ${sku}. Location: ${locationNameFromFile || targetLocationId}.`,
                        };
                        const updateResult = await db.adjustStockQuantity(existingItem.id, targetLocationId, adjustmentAmount, transactionDetails);
                        if (updateResult.success) {
                            result.successCount++;
                        } else {
                            result.errors.push(`Row ${rowNum} (SKU: ${sku}): Update Failed at location ${locationNameFromFile || targetLocationId} - ${updateResult.message || "DB error"}`);
                        }
                    } else {
                        result.successCount++; // No change needed, count as success
                    }
                } else {
                     result.errors.push(`Row ${rowNum} (SKU: ${sku}): Location for update not determined. Action: ${actionType}.`);
                }

              } catch (dbError) {
                result.errors.push(`Row ${rowNum} (SKU: ${sku}): Processing Error - ${dbError.message}`);
              }
            }
          }
        }
        console.log("[main.js] Bulk update results:", result);
        logActivity(username, `Finished bulk stock update (${actionType})`, `File: ${fileName}, Updated: ${result.successCount}, Errors: ${result.errors.length}`);
        return { success: true, ...result };
      } catch (error) {
        console.error("[main.js] Critical error during bulk update:", error);
        logActivity(username, `Error processing bulk update file (${actionType})`, `File: ${fileName}, Error: ${error.message}`);
        result = { fileName: fileName, processedCount: 0, successCount: 0, errors: [`Critical processing error: ${error.message}`] };
        return { success: false, ...result };
      }
    }
  );

  // --- Export Handler ---
  // ipcMain.handle("export-inventory", ...); // This specific one can be removed if exportGenericData covers it.

  // --- Activity Log Fetch Handler ---
  ipcMain.handle("get-activity-log", async () => {
    console.log("[main.js] IPC get-activity-log called.");
    try {
      const logEntries = await db.getActivityLogEntries(50);
      const formattedLog = logEntries.map((entry) => ({
        id: entry.id,
        timestamp: entry.created_at,
        user: entry.user_identifier,
        action: entry.action,
        details: entry.details || "",
      }));
      return formattedLog;
    } catch (error) {
      console.error("[main.js] Error fetching activity log from DB:", error);
      logActivity("System", "Error fetching activity log", error.message);
      return [];
    }
  });

  console.log("[main.js] IPC Handlers setup complete.");
  createWindow();
});

app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    console.log("[main.js] All windows closed, quitting app.");
    app.quit();
  } else {
    console.log("[main.js] All windows closed on macOS, app stays active.");
  }
});

// --- Returns Processing ---
ipcMain.handle("process-return", async (event, frontendReturnDetails) => {
  console.log("[Main Process] IPC: process-return invoked. Received details:", JSON.stringify(frontendReturnDetails, null, 2));
  const user = currentUser;
  if (!user) {
    console.error("[Main Process] Error processing return: User not authenticated.");
    return { success: false, message: "User not authenticated to process returns." };
  }
  if (!frontendReturnDetails || !frontendReturnDetails.itemId || !frontendReturnDetails.quantityReturned || !frontendReturnDetails.reason || !frontendReturnDetails.condition) {
    console.error("[Main Process] Error processing return: Missing required fields in frontendReturnDetails.");
    return { success: false, message: "Missing required return details (item, quantity, reason, or condition)." };
  }
  if (parseInt(frontendReturnDetails.quantityReturned, 10) <= 0) {
    console.error("[Main Process] Error processing return: Invalid quantityReturned.");
    return { success: false, message: "Quantity returned must be a positive number." };
  }
  try {
    const returnRecordData = {
      item_id: frontendReturnDetails.itemId,
      quantity_returned: parseInt(frontendReturnDetails.quantityReturned, 10),
      reason: frontendReturnDetails.reason,
      condition: frontendReturnDetails.condition,
      customer_id: frontendReturnDetails.customerId || null,
      notes: frontendReturnDetails.notes || null,
      processed_by_user_id: user.id,
      inventory_adjusted: false,
    };
    console.log("[Main Process] Creating return record with data:", JSON.stringify(returnRecordData, null, 2));
    const createReturnResult = await db.createReturnRecord(returnRecordData);
    if (!createReturnResult.success || !createReturnResult.returnRecord) {
      console.error("[Main Process] Failed to create return record in DB:", createReturnResult.message);
      return { success: false, message: createReturnResult.message || "Failed to create return record." };
    }
    const returnRecord = createReturnResult.returnRecord;
    let message = `Return ID ${returnRecord.id} processed.`;
    let restockSuccessful = false;
    console.log(`[Main Process] Condition check: frontendReturnDetails.condition is "${frontendReturnDetails.condition}"`);
    if (frontendReturnDetails.condition === "Resellable") {
      console.log(`[Main Process] Item is "Resellable". Proceeding with restock logic.`);
      if (!frontendReturnDetails.returnToLocationId) {
        message += ` WARNING: Failed to restock item. Reason: Target location for resellable item was not specified.`;
        console.error(`[Main Process] CRITICAL (Resellable): Cannot restock. Target location ID is MISSING for return ${returnRecord.id}. Item ID: ${frontendReturnDetails.itemId}`);
      } else {
        const transactionDetailsForDB = {
          transactionType: "RETURN_RESTOCK",
          referenceId: String(returnRecord.id),
          referenceType: "SALES_RETURN", // This type might be misleading now. Consider "PRODUCT_RETURN"
          userId: user.id,
          usernameSnapshot: user.username,
          notes: `Restocked from Return ID: ${returnRecord.id}. Original reason: "${frontendReturnDetails.reason}". Returned to: "${frontendReturnDetails.returnToLocationName || `Location ID ${frontendReturnDetails.returnToLocationId}`}"`,
        };
        const restockResult = await db.adjustStockQuantity(
          frontendReturnDetails.itemId,
          frontendReturnDetails.returnToLocationId,
          parseInt(frontendReturnDetails.quantityReturned, 10),
          transactionDetailsForDB
        );
        if (restockResult.success) {
          const markAdjustedResult = await db.markReturnInventoryAdjusted(returnRecord.id);
          if (!markAdjustedResult.success) {
            message += ` Item restocked, but failed to update return record's adjusted status.`;
          } else {
            message += ` Item restocked to "${frontendReturnDetails.returnToLocationName || `Location ID ${frontendReturnDetails.returnToLocationId}`}".`;
            if (restockResult.newQuantityAtLocation !== undefined && restockResult.newQuantityAtLocation !== null) {
              message += ` New quantity at location: ${restockResult.newQuantityAtLocation}.`;
            }
          }
          restockSuccessful = true;
        } else {
          message += ` WARNING: Failed to restock item to "${frontendReturnDetails.returnToLocationName || `Location ID ${frontendReturnDetails.returnToLocationId}`}". Error: ${restockResult.message}`;
          console.error(`[Main Process] CRITICAL: Return ${returnRecord.id} processed but item restock failed for item ${frontendReturnDetails.itemId} to location ${frontendReturnDetails.returnToLocationId}. Error: ${restockResult.message}`);
        }
      }
    } else {
      message += " Item not restocked due to condition.";
    }
    let itemNameForLog = `ID ${frontendReturnDetails.itemId}`;
    try {
      const itemInfo = await db.getItemById(frontendReturnDetails.itemId);
      if (itemInfo && itemInfo.name) {
        itemNameForLog = `${itemInfo.name} (ID: ${frontendReturnDetails.itemId})`;
      }
    } catch (itemFetchError) {
      console.warn(`[Main Process] Could not fetch item details for activity log: ${itemFetchError.message}`);
    }
    const activityLogDetails = `Return processed for item ${itemNameForLog}. Return ID: ${returnRecord.id}. Condition: ${frontendReturnDetails.condition}. ${restockSuccessful ? "Item restocked." : "Item not restocked."}`;
    await logActivity(user.username, "Product Return Processed", activityLogDetails);
    return { success: true, message: message, returnId: returnRecord.id };
  } catch (error) {
    console.error("[Main Process] Error in process-return IPC handler:", error);
    await logActivity(user?.username || "System", "Error Processing Return", `Details: ${JSON.stringify(frontendReturnDetails)}. Error: ${error.message}`);
    return { success: false, message: error.message || "Server error during return processing." };
  }
});

ipcMain.handle("get-returns", async (event, filters) => {
  console.log("[main.js] IPC get-returns called with filters:", filters);
  try {
    return await db.getReturnRecords(filters || {}, 50);
  } catch (error) {
    console.error("[main.js] Error fetching return records:", error);
    logActivity(currentUser?.username, "Error fetching return records", error.message);
    return { error: error.message || "Failed to fetch return records." };
  }
});

// --- Stock Adjustment Handler ---
ipcMain.handle("perform-stock-adjustment", async (event, adjustmentDetails) => {
  console.log(`[Main Process] perform-stock-adjustment handler invoked with details:`, JSON.stringify(adjustmentDetails, null, 2));
  const username = currentUser?.username;
  let itemNameForLog = `ID ${adjustmentDetails?.itemId || "Unknown"}`;
  let locationNameForLog = `ID ${adjustmentDetails?.locationId || "Unknown"}`;
  try {
    if (!adjustmentDetails || adjustmentDetails.itemId === undefined || adjustmentDetails.itemId === null || adjustmentDetails.locationId === undefined || adjustmentDetails.locationId === null || typeof adjustmentDetails.adjustmentQuantity !== "number") {
      const errorMsg = `Invalid details (itemId/locationId/qty). Provided: ${JSON.stringify(adjustmentDetails)}`;
      logActivity(username, "Stock Adjustment Error", errorMsg);
      return { success: false, message: "Invalid adjustment details: Item ID, Location ID, and numerical Quantity are required." };
    }
    if (!adjustmentDetails.reason || String(adjustmentDetails.reason).trim() === "") {
      const errorMsg = `Reason missing for item ${itemNameForLog} at location ${locationNameForLog}.`;
      logActivity(username, "Stock Adjustment Error", errorMsg);
      return { success: false, message: "Reason for adjustment is required." };
    }
    if (String(adjustmentDetails.reason).toLowerCase().includes("other") && (!adjustmentDetails.notes || String(adjustmentDetails.notes).trim() === "")) {
      const errorMsg = `Notes missing for "Other" reason for item ${itemNameForLog} at location ${locationNameForLog}.`;
      logActivity(username, "Stock Adjustment Error", errorMsg);
      return { success: false, message: 'Notes are required when the reason is "Other (Specify in Notes)".' };
    }
    try {
      const item = await db.getItemById(adjustmentDetails.itemId);
      if (item && item.name) {
        itemNameForLog = `${item.name} (ID: ${adjustmentDetails.itemId})`;
      }
      if (adjustmentDetails.locationName) {
        locationNameForLog = `${adjustmentDetails.locationName} (ID: ${adjustmentDetails.locationId})`;
      }
    } catch (fetchError) {
      console.warn(`[main.js perform-stock-adjustment] Could not fetch item/location details for logging: ${fetchError.message}`);
    }
    const mappedTransactionType = mapReasonToTransactionType(adjustmentDetails.reason);
    const transactionContext = {
      transactionType: mappedTransactionType,
      referenceId: null,
      referenceType: "MANUAL_STOCK_ADJUSTMENT",
      userId: adjustmentDetails.userId,
      usernameSnapshot: adjustmentDetails.username,
      notes: `User Reason: ${adjustmentDetails.reason}. Details: ${adjustmentDetails.notes || "N/A"}`,
    };
    const adjustmentResult = await db.adjustStockQuantity(adjustmentDetails.itemId, adjustmentDetails.locationId, adjustmentDetails.adjustmentQuantity, transactionContext);
    if (adjustmentResult.success) {
      logActivity(username, "Performed Stock Adjustment", `Item: ${itemNameForLog}, At Location: ${locationNameForLog}, Type: ${mappedTransactionType}, Adj By: ${adjustmentDetails.adjustmentQuantity}, New Qty@Loc: ${adjustmentResult.newQuantityAtLocation}, Reason: ${adjustmentDetails.reason}`);
      return { success: true, message: "Stock adjusted successfully!", newQuantityAtLocation: adjustmentResult.newQuantityAtLocation };
    } else {
      logActivity(username, "Stock Adjustment Failed", `Item: ${itemNameForLog}, At Location: ${locationNameForLog}, DB Error: ${adjustmentResult.message || "Unknown DB error"}`);
      return { success: false, message: adjustmentResult.message || "Failed to adjust stock." };
    }
  } catch (error) {
    console.error("[main.js perform-stock-adjustment] Critical error during stock adjustment:", error);
    logActivity(username, "Stock Adjustment Error", `Item: ${itemNameForLog}, At Location: ${locationNameForLog}, Critical Error: ${error.message}`);
    return { success: false, message: `An unexpected error occurred: ${error.message}` };
  }
});

// --- Bundle Management (Keeping this as bundles are inventory constructs, not direct sales orders) ---
ipcMain.handle("get-bundles", async (event, filters) => {
  console.log("[Main Process] get-bundles handler invoked with filters:", filters);
  try {
    const bundles = await db.getBundles(filters || {});
    return bundles;
  } catch (error) {
    console.error("[Main Process] Error in get-bundles handler:", error);
    throw error;
  }
});

ipcMain.handle("get-bundle-by-id", async (event, bundleId) => {
  console.log("[Main Process] get-bundle-by-id handler invoked with ID:", bundleId);
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
    return { success: false, message: "Unauthorized to create bundles." };
  }
  try {
    const result = await db.createBundle(bundleData);
    if (result.success && result.bundle) {
      await logActivity(user.username, "Created Bundle", `Bundle: ${result.bundle.name} (ID: ${result.bundle.id}, SKU: ${result.bundle.bundle_sku || "N/A"})`);
    }
    return result;
  } catch (error) {
    console.error("[Main Process] Error in create-bundle handler:", error);
    return { success: false, message: `Failed to create bundle: ${error.message}` };
  }
});

ipcMain.handle("update-bundle", async (event, bundleId, bundleData) => {
  console.log("[Main Process] update-bundle handler invoked for ID:", bundleId);
  const user = currentUser;
  if (!user || user.role !== "admin") {
    return { success: false, message: "Unauthorized to update bundles." };
  }
  try {
    const result = await db.updateBundle(bundleId, bundleData);
    if (result.success && result.bundle) {
      await logActivity(user.username, "Updated Bundle", `Bundle: ${result.bundle.name} (ID: ${result.bundle.id})`);
    }
    return result;
  } catch (error) {
    console.error("[Main Process] Error in update-bundle handler:", error);
    return { success: false, message: `Failed to update bundle: ${error.message}` };
  }
});

ipcMain.handle("delete-bundle", async (event, bundleId) => {
  console.log("[Main Process] delete-bundle handler invoked for ID:", bundleId);
  const user = currentUser;
  if (!user || user.role !== "admin") {
    return { success: false, message: "Unauthorized to delete bundles." };
  }
  try {
    const bundleInfo = await db.getBundleById(bundleId);
    const result = await db.deleteBundle(bundleId);
    if (result.success && bundleInfo) {
      await logActivity(user.username, "Deleted Bundle", `Bundle: ${bundleInfo.name} (ID: ${bundleInfo.id})`);
    }
    return result;
  } catch (error) {
    console.error("[Main Process] Error in delete-bundle handler:", error);
    return { success: false, message: `Failed to delete bundle: ${error.message}` };
  }
});

// --- Inventory Transactions & Locations (Keep these as they are general inventory ops) ---
ipcMain.handle("get-inventory-transactions-for-item", async (event, argsObject) => {
    const { itemId, limit, offset } = argsObject;
    console.log(`[main.js] IPC get-inventory-transactions-for-item received argsObject:`, argsObject);
    try {
      if (itemId === undefined || itemId === null) {
        throw new Error("Item ID is required to fetch transactions.");
      }
      if (typeof itemId === "object") {
        console.error(`[main.js] ERROR: itemId is still an object in main.js: ${JSON.stringify(itemId)}.`);
        throw new Error(`Received an object for itemId instead of a primitive value.`);
      }
      const effectiveLimit = limit === undefined ? 15 : parseInt(limit, 10);
      const effectiveOffset = offset === undefined ? 0 : parseInt(offset, 10);
      return await db.getInventoryTransactionsForItem(itemId, effectiveLimit, effectiveOffset);
    } catch (error) {
      console.error(`[main.js] Error in get-inventory-transactions-for-item handler for item ${itemId}:`, error);
      logActivity(currentUser?.username, "Error fetching inventory ledger", `Item ID: ${itemId}, Error: ${error.message}`);
      return { error: error.message || `Failed to fetch transactions for item ${itemId}.` };
    }
  }
);

ipcMain.handle("create-stock-transfer", async (event, transferDetailsFrontend) => {
    const user = currentUser;
    if (!user) return { success: false, message: "User not authenticated." };
    const transferDetailsForDB = { ...transferDetailsFrontend, userId: user.id, usernameSnapshot: user.username };
    logActivity(user.username, "Initiated Stock Transfer", `Item ID: ${transferDetailsForDB.itemId}, Qty: ${transferDetailsForDB.quantityTransferred}, From Loc: ${transferDetailsForDB.sourceLocationName}(${transferDetailsForDB.sourceLocationId}), To Loc: ${transferDetailsForDB.destinationLocationName}(${transferDetailsForDB.destinationLocationId})`);
    try {
      const result = await db.createStockTransferAndAdjustInventory(transferDetailsForDB);
      // Log success/failure based on result
      return result;
    } catch (error) {
      logActivity(user.username, "Error creating stock transfer", error.message);
      return { success: false, message: error.message };
    }
  }
);

ipcMain.handle("get-stock-transfers", async (event, filters) => {
  try {
    return await db.getStockTransfers(filters || {});
  } catch (error) {
    console.error("[main.js] Error in get-stock-transfers handler:", error);
    throw error;
  }
});

ipcMain.handle("get-storage-locations", async () => {
  console.log("[main.js] IPC get-storage-locations");
  try {
    return await db.getStorageLocations();
  } catch (error) {
    console.error("[main.js] Error getting storage locations:", error);
    return { success: false, message: error.message, locations: [] };
  }
});

ipcMain.handle("get-store-location-id", async () => {
  console.log("[main.js] IPC get-store-location-id");
  try {
    const id = await db.getStoreLocationId();
    return id;
  } catch (error) {
    console.error("[main.js] Error getting store location ID:", error);
    return null;
  }
});

ipcMain.handle("get-item-quantity-at-location", async (event, itemId, locationId) => {
    console.log(`[main.js] IPC get-item-quantity-at-location for item ${itemId}, loc ${locationId}`);
    try {
      // This function in db.js was not defined, assuming it should call getItemById and parse locations.
      // For now, let's assume db.getItemQuantityAtLocation exists or is added.
      // If it doesn't, this will fail.
      const itemDetails = await db.getItemById(itemId);
      if (itemDetails && Array.isArray(itemDetails.locations)) {
          const locData = itemDetails.locations.find(l => l.locationId === locationId);
          return locData ? locData.quantity : 0;
      }
      return 0;
    } catch (error) {
      console.error("[main.js] Error in get-item-quantity-at-location handler:", error);
      return 0;
    }
  }
);

ipcMain.handle("get-detailed-stock-report", async (event, filters) => {
  console.log("[Main Process] get-detailed-stock-report called with filters:", filters);
  try {
    return await db.getDetailedStockReport(filters || {});
  } catch (error) {
    console.error("[Main Process] Error in get-detailed-stock-report handler:", error);
    return { success: false, message: error.message, data: [] };
  }
});



// --- Generic Export Handler (Kept, but sales-specific export types will fail if called) ---
ipcMain.handle("export-generic-data", async (event, { exportType, reportData, format, fileNamePrefix }) => {
    console.log(`[Main Process] IPC export-generic-data received. Type: ${exportType}, Format: ${format}, Prefix: ${fileNamePrefix}, Data length: ${reportData?.length}`);
    const user = currentUser;
    if (!user) {
      return { success: false, message: "User not authenticated." };
    }

    const defaultFileName = `${fileNamePrefix || exportType || "export"}-${new Date().toISOString().split("T")[0]}`;
    let fileExtension, fileContentBuffer;

    try {
      let dataToExport;
      if (reportData) { // If data is directly provided (e.g., from AnalyticsPage client-side filtered data)
          dataToExport = reportData;
      } else if (exportType) { // If type is provided, fetch data from DB
          switch (exportType) {
              case 'comprehensive_inventory':
                  dataToExport = await db.getAllItemsForExport();
                  break;
              case 'customers':
                  dataToExport = await db.getTableData('customers'); // Assuming generic getter
                  break;
              default:
                  return { success: false, message: `Unsupported export type: ${exportType}` };
          }
      } else {
          return { success: false, message: "No data or export type provided." };
      }


      if (!dataToExport || dataToExport.length === 0) {
        return { success: false, message: "No data available to export." };
      }

      if (format === "csv") {
        fileExtension = "csv";
        fileContentBuffer = convertToCSV(dataToExport);
      } else if (format === "xlsx") {
        fileExtension = "xlsx";
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        fileContentBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
      } else {
        return { success: false, message: `Unsupported export format: ${format}` };
      }

      const window = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
      if (!window) {
        throw new Error("Could not get window reference for save dialog.");
      }

      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: `Save ${format.toUpperCase()} Export`,
        defaultPath: `${defaultFileName}.${fileExtension}`,
        filters: [{ name: `${format.toUpperCase()} Files`, extensions: [fileExtension] }],
      });

      if (canceled || !filePath) {
        return { success: true, message: "Export cancelled by user." };
      }

      fs.writeFileSync(filePath, fileContentBuffer);
      await logActivity(user.username, `Exported Data (${exportType || 'custom_report'} - ${format.toUpperCase()})`, `File: ${path.basename(filePath)}`);
      return { success: true, message: `Data exported successfully to ${path.basename(filePath)}` };

    } catch (error) {
      console.error(`[Main Process] Critical error exporting data (type: ${exportType}, format: ${format}):`, error);
      await logActivity(user.username, `Error Exporting Data (${exportType || 'custom_report'} - ${format.toUpperCase()})`, `Error: ${error.message}`);
      return { success: false, message: `Failed to export data: ${error.message}` };
    }
  }
);


// --- END OF FILE ---