// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt"; // ESSENTIAL for custom password hashing and comparison

import { localDb } from "./localDb.js";

// Helper: Check if online (basic)
function isOnline() {
  return !!supabase;
}

// Initialize the Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase;

console.log("[supabaseClient] Initializing for custom auth...");
console.log("[supabaseClient] REACT_APP_SUPABASE_URL:", supabaseUrl ? "SET" : "NOT SET - CRITICAL ERROR IF THIS PERSISTS");
console.log("[supabaseClient] REACT_APP_SUPABASE_ANON_KEY:", supabaseAnonKey ? "SET" : "NOT SET - CRITICAL ERROR IF THIS PERSISTS");

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[supabaseClient] CRITICAL: Missing Supabase environment variables. Supabase client will NOT be initialized. Check .env file and main.js for dotenv.config() at the top.");
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    if (supabase) {
      console.log("[supabaseClient] Supabase client instance CREATED successfully for DB operations.");
    } else {
      console.error("[supabaseClient] CRITICAL: createClient returned null or undefined, even though URL/Key were provided.");
      supabase = undefined;
    }
  } catch (e) {
    console.error("[supabaseClient] CRITICAL: Error during Supabase createClient call:", e);
    supabase = undefined;
  }
}

export { supabase };

export const unifiedDb = new Proxy({}, {
  get(target, prop) {
    const source = isOnline() ? db : localDb;
    return source[prop];
  }
});

// getDateRange is still used by some inventory analytics, so keep it.
function getDateRange(period) {
    const PHT_OFFSET_HOURS = 8;
    const nowUtc = new Date();
    const nowPht = new Date(nowUtc.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
    let phtStartOfDay, phtEndOfDay;
    let queryStartDate, queryEndDate;
    const phtYear = nowPht.getUTCFullYear();
    const phtMonth = nowPht.getUTCMonth();
    const phtDate = nowPht.getUTCDate();

    if (period === 'today') {
        phtStartOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 0, 0, 0, 0));
        phtEndOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 23, 59, 59, 999));
        queryStartDate = phtStartOfDay;
        queryEndDate = phtEndOfDay;
    } else if (period === 'last7days') {
        phtEndOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 23, 59, 59, 999));
        phtStartOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 0, 0, 0, 0));
        phtStartOfDay.setUTCDate(phtStartOfDay.getUTCDate() - 6);
        queryStartDate = phtStartOfDay;
        queryEndDate = phtEndOfDay;
    } else if (period === 'last30days') {
        phtEndOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 23, 59, 59, 999));
        phtStartOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 0, 0, 0, 0));
        phtStartOfDay.setUTCDate(phtStartOfDay.getUTCDate() - 29);
        queryStartDate = phtStartOfDay;
        queryEndDate = phtEndOfDay;
    } else {
        console.warn(`[getDateRange] Unknown period: ${period}, defaulting to today (PHT).`);
        phtStartOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 0, 0, 0, 0));
        phtEndOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 23, 59, 59, 999));
        queryStartDate = phtStartOfDay;
        queryEndDate = phtEndOfDay;
    }
    const finalStartDateISO = queryStartDate.toISOString();
    const finalEndDateISO = queryEndDate.toISOString();
    console.log(`[getDateRange] Period: ${period}`);
    console.log(`[getDateRange] PHT Now (for calculation): ${nowPht.toUTCString()} (displayed as UTC but represents PHT moment)`);
    console.log(`[getDateRange] Query Start (UTC ISO for DB): ${finalStartDateISO}`);
    console.log(`[getDateRange] Query End (UTC ISO for DB): ${finalEndDateISO}`);
    return { startDate: finalStartDateISO, endDate: finalEndDateISO };
}

export const db = {
  // --- CUSTOM AUTHENTICATION ---
  async login(username, password) {
    if (!supabase) {
      console.error("[db.login] Supabase client is not initialized. Cannot proceed with login.");
      return { success: false, message: "Login service is currently unavailable. Please try again later or contact support." };
    }
    try {
      const { data: userData, error: queryError } = await supabase
        .from("users")
        .select("id, username, password_hash, role")
        .eq("username", username)
        .maybeSingle();
      if (queryError) {
        console.error("[db.login] Supabase query error while fetching user:", queryError);
        return { success: false, message: "An error occurred during login. Please try again." };
      }
      if (!userData) {
        return { success: false, message: "Invalid username or password." };
      }
      if (!userData.password_hash) {
        console.error(`[db.login] Password hash is missing for user: ${userData.username}. Account may be misconfigured.`);
        return { success: false, message: "Account configuration issue. Please contact support." };
      }
      const isValid = await bcrypt.compare(password, userData.password_hash);
      if (!isValid) {
        return { success: false, message: "Invalid username or password." };
      }
      return { success: true, user: { id: userData.id, username: userData.username, role: userData.role } };
    } catch (error) {
      console.error("[db.login] Unexpected error during login process:", error);
      return { success: false, message: "An unexpected server error occurred. Please try again.", details: error.message };
    }
  },

  async getUserInfoForLogById(userId) {
      if (!supabase || !userId) {
          console.warn('[db.getUserInfoForLogById] Supabase client not init or no userId provided.');
          return { username: 'N/A (System)' };
      }
      try {
          const { data, error } = await supabase.from('users').select('username').eq('id', userId).single();
          if (error) {
              if (error.code === 'PGRST116') {
                  return { username: `N/A (User ID: ${userId} Not Found)` };
              }
              return { username: `N/A (Error)` };
          }
          return data ? { username: data.username } : { username: `N/A (User ID: ${userId} Not Found)` };
      } catch (e) {
          return { username: `N/A (Exception)` };
      }
  },

  // --- ITEM MANAGEMENT FUNCTIONS ---
    async getItems(filters = {}) {
      if (!supabase) {
        return Promise.reject(new Error("Supabase client not initialized."));
      }
      try {
        let query = supabase.from("items_with_total_quantity").select("*");
        if (filters.is_archived !== undefined) {
          query = query.eq("is_archived", filters.is_archived);
        } else {
          query = query.eq("is_archived", false);
        }
        if (filters.category) query = query.eq("category", filters.category);
        if (filters.searchTerm) query = query.or(`name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`);
        const sortByCol = filters.sortBy || "name";
        const sortOrderAsc = filters.sortOrder === "asc";
        const effectiveSortBy = sortByCol === "quantity" ? "total_quantity" : sortByCol;
        query = query.order(effectiveSortBy, { ascending: sortOrderAsc });
        if (effectiveSortBy !== "id") query = query.order("id", { ascending: true });
        const { data: baseItems, error: baseItemsError } = await query;
        if (baseItemsError) throw baseItemsError;
        if (!baseItems || baseItems.length === 0) return [];
        let itemsToReturn = baseItems;
        let specificLocationIdForEnrichment = null;
        if (filters.stockAtLocationId !== undefined && filters.stockAtLocationId !== null) {
          specificLocationIdForEnrichment = filters.stockAtLocationId;
        } else if (filters.storageLocation) {
          const { data: locationData, error: locationError } = await supabase.from("storage_locations").select("id").eq("name", filters.storageLocation).single();
          if (locationError && locationError.code !== 'PGRST116') console.error(`[db.getItems] Error fetching ID for location name ${filters.storageLocation}:`, locationError);
          if (locationData) specificLocationIdForEnrichment = locationData.id;
          else return []; // Strict: if location name filter doesn't resolve, return no items
        }
        if (specificLocationIdForEnrichment !== null) {
          const itemIds = itemsToReturn.map((item) => item.id);
          if (itemIds.length > 0) {
              const { data: locationQuantities, error: locQtyError } = await supabase.from("item_location_quantities").select("item_id, quantity").eq("location_id", specificLocationIdForEnrichment).in("item_id", itemIds);
              if (locQtyError) console.error(`[db.getItems] Error fetching quantities for location ${specificLocationIdForEnrichment}:`, locQtyError);
              const quantityMap = new Map();
              if (locationQuantities) locationQuantities.forEach((lq) => quantityMap.set(lq.item_id, lq.quantity));
              itemsToReturn = itemsToReturn.map((item) => ({ ...item, quantity_at_specific_location: quantityMap.get(item.id) === undefined ? 0 : quantityMap.get(item.id) }));
              if (filters.storageLocation) itemsToReturn = itemsToReturn.filter(item => quantityMap.has(item.id));
          }
        }
        return itemsToReturn.map(item => ({ ...item, quantity_at_specific_location: item.quantity_at_specific_location === undefined ? null : item.quantity_at_specific_location }));
      } catch (error) {
        console.error("[db.getItems] General error in function execution:", error.message);
        throw error;
      }
    },

  async getItemById(itemId) {
    if (!supabase || !itemId) return Promise.reject(new Error("Supabase client or itemId not provided."));
    try {
      const { data: itemData, error: itemError } = await supabase.from("items_with_total_quantity").select("*").eq("id", itemId).single();
      if (itemError) throw itemError;
      if (!itemData) return null;
      const { data: locationsData, error: locError } = await supabase.from("item_location_quantities").select("quantity, location:storage_locations!inner(id, name)").eq("item_id", itemId);
      if (locError) {
        console.error(`Error fetching location quantities for item ${itemId}:`, locError);
        itemData.locations = [];
      } else {
        itemData.locations = (locationsData || []).map((l) => ({ locationId: l.location.id, locationName: l.location.name, quantity: l.quantity }));
      }
      return itemData;
    } catch (error) {
      console.error(`Error in getItemById (ID: ${itemId}):`, error);
      throw error;
    }
  },

  async createItem(itemData, initialStockEntries = [], createdByUserId, createdByUsername) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    const itemRecordToInsert = {
      name: itemData.name,
      sku: itemData.sku || null,
      description: itemData.description || null,
      cost_price: parseFloat(itemData.cost_price) || 0,
      category: itemData.category || "Uncategorized",
      variant: itemData.variant || null,
      status: itemData.status || "Normal",
      is_archived: false,
    };
    let newItem;
    try {
      const { data, error: itemInsertError } = await supabase.from("items").insert([itemRecordToInsert]).select().single();
      if (itemInsertError) throw itemInsertError;
      if (!data) throw new Error("Item master record creation failed to return data.");
      newItem = data;
      if (initialStockEntries && Array.isArray(initialStockEntries) && initialStockEntries.length > 0) {
        for (const stockEntry of initialStockEntries) {
          if (stockEntry.locationId && Number(stockEntry.quantity) > 0) { // Ensure quantity is positive for initial entry
            const transactionDetails = {
              transactionType: "INITIAL_STOCK_ENTRY",
              referenceId: String(newItem.id),
              referenceType: "NEW_ITEM_CREATION",
              userId: createdByUserId,
              usernameSnapshot: createdByUsername,
              notes: `Initial stock for new item "${newItem.name}" at location ID ${stockEntry.locationId}${stockEntry.locationName ? ` (${stockEntry.locationName})` : ""}.`,
            };
            const adjustmentResult = await db.adjustStockQuantity(newItem.id, stockEntry.locationId, Number(stockEntry.quantity), transactionDetails);
            if (!adjustmentResult.success) {
              console.error(`[db.createItem] Failed to add initial stock for item ${newItem.id} at location ${stockEntry.locationId}: ${adjustmentResult.message}`);
            }
          }
        }
      }
      return { success: true, item: newItem, message: "Item created successfully with initial stock." };
    } catch (error) {
      console.error("Error in createItem process:", error);
      return { success: false, message: error.message || "Failed to create item or set initial stock." };
    }
  },

  // incrementAllocatedQuantity and decrementAllocatedQuantity are related to sales order fulfillment,
  // if you are completely removing sales, these might not be needed unless used for other reservation systems.
  // For now, I'll keep them, but review if they are truly necessary for your non-sales IMS.
  async incrementAllocatedQuantity(itemId, locationId, quantityToAllocate) {
    if (!supabase) return { success: false, message: "DB client not init." };
    try {
        const { error } = await supabase.rpc('increment_allocated_quantity', { p_item_id: itemId, p_location_id: locationId, p_quantity_to_allocate: quantityToAllocate });
        if (error) throw error;
        return { success: true, message: 'Allocated quantity incremented.' };
    } catch (error) {
        console.error('[db.incrementAllocatedQuantity] Error:', error);
        return { success: false, message: error.message || 'Failed to increment allocated quantity.' };
    }
  },
  async decrementAllocatedQuantity(itemId, locationId, quantityToDeallocate) {
      if (!supabase) return { success: false, message: "DB client not init." };
      try {
          const { error } = await supabase.rpc('decrement_allocated_quantity', { p_item_id: itemId, p_location_id: locationId, p_quantity_to_deallocate: quantityToDeallocate });
          if (error) throw error;
          return { success: true, message: 'Allocated quantity decremented.' };
      } catch (error) {
          console.error('[db.decrementAllocatedQuantity] Error:', error);
          return { success: false, message: error.message || 'Failed to decrement allocated quantity.' };
      }
  },

  async adjustStockQuantity(itemId, locationId, adjustmentQtyNumeric, transactionDetails) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    if (itemId === undefined || itemId === null || locationId === undefined || locationId === null || typeof adjustmentQtyNumeric !== "number") {
      return { success: false, message: "Invalid item, location, or quantity." };
    }
    try {
      const rpcParams = {
        p_item_id: itemId,
        p_location_id: locationId,
        p_adjustment_qty: adjustmentQtyNumeric,
        p_transaction_type: transactionDetails.transactionType,
        p_reference_id: transactionDetails.referenceId || null,
        p_reference_type: transactionDetails.referenceType || null,
        p_user_id: transactionDetails.userId || null,
        p_username_snapshot: transactionDetails.usernameSnapshot || null,
        p_notes: transactionDetails.notes || null,
      };
      const { data: rpcResultData, error: rpcError } = await supabase.rpc("adjust_item_quantity", rpcParams);
      if (rpcError) throw rpcError;
      const newQuantityAtLocation = typeof rpcResultData === "number" ? rpcResultData : null;
      return { success: true, newQuantityAtLocation: newQuantityAtLocation };
    } catch (error) {
      console.error("[db.adjustStockQuantity] Catch block error:", error);
      return { success: false, message: error.message || "RPC call failed." };
    }
  },

  async updateItem(id, itemData) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const dataToUpdate = { ...itemData };
      if (dataToUpdate.cost_price !== undefined) dataToUpdate.cost_price = parseFloat(dataToUpdate.cost_price) || 0;
      // Removed quantity update from here as it's managed by item_location_quantities
      // if (dataToUpdate.quantity !== undefined) dataToUpdate.quantity = parseInt(dataToUpdate.quantity, 10) || 0;
      delete dataToUpdate.id;
      delete dataToUpdate.quantity; // Explicitly remove if it was passed

      const { data, error } = await supabase.from("items").update(dataToUpdate).eq("id", id).select().single();
      if (error) throw error;
      return { success: true, item: data };
    } catch (error) {
      console.error("Error in updateItem:", error);
      return { success: false, message: error.message || "Failed to update item." };
    }
  },

  async deleteItem(id) { // This is used by archiveItem in main.js. If archiveItem is kept, this is needed.
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      // This should ideally be a soft delete (archiving) if `archiveItem` is the primary way to "delete"
      // The current `archiveItem` function calls `db.archiveItem` which updates `is_archived`.
      // This `deleteItem` function performs a hard delete.
      // For consistency with the "Archive" feature, this might need to be re-evaluated or removed if `archiveItem` is always used.
      // For now, keeping it as it was, but be aware of this potential conflict in deletion strategy.
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
      return { success: true, message: "Item deleted successfully." };
    } catch (error) {
      console.error("Error in deleteItem:", error);
      return { success: false, message: error.message || "Failed to delete item." };
    }
  },

  // --- ANALYTICS FUNCTIONS (Inventory Focused) ---
  async getInventorySummary() {
    if (!supabase) return { success: false, message: "Database client not initialized.", summary: null };
    try {
      const { count: totalUniqueItemsCount, error: countError } = await supabase.from("items").select("*", { count: "exact", head: true }).eq("is_archived", false);
      if (countError) throw countError;
      const { data: totalsData, error: totalsError } = await supabase.rpc("get_overall_inventory_totals");
      if (totalsError) throw totalsError;
      const summaryData = totalsData && totalsData.length > 0 ? totalsData[0] : { total_stock_quantity: 0, estimated_total_value: 0 };
      return { success: true, summary: { totalUniqueItems: totalUniqueItemsCount || 0, totalStockQuantity: Number(summaryData.total_stock_quantity) || 0, estimatedTotalValue: Number(summaryData.estimated_total_value) || 0 } };
    } catch (error) {
      console.error("[db.getInventorySummary] Error:", error);
      return { success: false, message: error.message || "Failed to get summary.", summary: null };
    }
  },

  async getLowStockItems(threshold = null, specificLocationName = "STORE") {
      if (!supabase) return { success: false, message: "Database client not initialized.", items: [] };
      try {
          let locationIdToFilter = null;
          if (specificLocationName) {
              const { data: locData, error: locError } = await supabase.from('storage_locations').select('id').eq('name', specificLocationName).eq('is_active', true).single();
              if (locError && locError.code !== 'PGRST116') throw locError;
              if (!locData) return { success: true, items: [], message: `Location "${specificLocationName}" not found for low stock check.` };
              locationIdToFilter = locData.id;
          }
          let query = supabase.from('items').select(`id, name, sku, category, low_stock_threshold, item_location_quantities!inner (quantity)`).eq('is_archived', false);
          if (locationIdToFilter) query = query.eq('item_location_quantities.location_id', locationIdToFilter);
          const { data: itemsWithLocationStock, error } = await query;
          if (error) throw error;
          const lowStockList = (itemsWithLocationStock || [])
              .map(item => {
                  const stockAtLocation = item.item_location_quantities[0]?.quantity;
                  if (stockAtLocation === undefined || stockAtLocation === null) return null;
                  const effectiveThreshold = item.low_stock_threshold !== null && item.low_stock_threshold !== undefined ? item.low_stock_threshold : (threshold !== null ? threshold : 0);
                  if (stockAtLocation < effectiveThreshold) {
                      return { id: item.id, name: item.name, sku: item.sku, category: item.category, quantity: stockAtLocation, low_stock_threshold: item.low_stock_threshold };
                  }
                  return null;
              })
              .filter(item => item !== null)
              .sort((a, b) => a.quantity - b.quantity);
          return { success: true, items: lowStockList };
      } catch (error) {
          console.error("[db.getLowStockItems] Error:", error);
          return { success: false, message: error.message || "Failed to get low stock items.", items: [] };
      }
  },

  async getInventoryByCategory() {
    if (!supabase) return { success: false, message: "Database client not initialized.", data: [] };
    try {
      const { data, error } = await supabase.rpc("get_inventory_summary_by_category");
      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("[db.getInventoryByCategory] Error:", error);
      return { success: false, message: error.message || "Failed to get category breakdown.", data: [] };
    }
  },

  // --- REMOVED SALES ANALYTICS FUNCTIONS ---
  // async getTodaysSalesTotal() { ... }
  // async getNewOrdersCount() { ... }
  // async getTopSellingProductsByQuantity(limit = 5, dateRange = null) { ... } // This was a proxy, if it was for sales, remove.
  // async getSalesSummary(period = "last30days") { ... }
  // async getTopSellingItems(period = "last30days", limit = 5) { ... }
  // async getSalesByStatus(period = "last30days") { ... }
  // async getSalesDetailReport(filters = {}) { ... }
  // async getSalesPerformanceReportData(period = 'last30days', topItemsLimit = 10) { ... }


  // --- CUSTOMER MANAGEMENT FUNCTIONS (Keep, as customers can exist without sales) ---
  async getCustomers(filters = {}) {
      if (!supabase)
        return Promise.reject(new Error("Supabase client not initialized."));
      try {
        let query = supabase
          .from("customers")
          .select("*")
          // Default order can be by name or created_at
          .order(filters.sortBy || "full_name", { ascending: filters.sortOrder === 'asc' });


        // --- MODIFICATION START ---
        if (filters.is_archived !== undefined) {
          query = query.eq("is_archived", filters.is_archived);
        } else {
          // Default to showing only active customers if is_archived is not specified
          query = query.eq("is_archived", false);
        }
        // --- MODIFICATION END ---

        if (filters.searchTerm) {
          query = query.or(
            `full_name.ilike.%${filters.searchTerm}%,email.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`
          );
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      } catch (error) {
        console.error("Error in getCustomers:", error);
        throw error;
      }
    },

    async archiveCustomer(customerId, archiveStatus = true) {
        if (!supabase)
          return { success: false, message: "Database client not initialized." };
        try {
          const { data, error } = await supabase
            .from("customers")
            .update({ is_archived: archiveStatus, updated_at: new Date() }) // Assuming you have an updated_at column
            .eq("id", customerId)
            .select()
            .single();

          if (error) {
            console.error(`Error ${archiveStatus ? "archiving" : "restoring"} customer in Supabase:`, error);
            throw error;
          }
          return {
            success: true,
            customer: data,
            message: `Customer ${archiveStatus ? "archived" : "restored"} successfully.`,
          };
        } catch (error) {
          console.error(`Error in archiveCustomer (ID: ${customerId}):`, error);
          return {
            success: false,
            message: error.message || `Failed to ${archiveStatus ? "archive" : "restore"} customer.`,
          };
        }
      },

  async getCustomerById(id) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error in getCustomerById:", error);
      throw error;
    }
  },
  async createCustomer(customerData) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const dataToInsert = { full_name: customerData.full_name, email: customerData.email || null, phone: customerData.phone || null, address: customerData.address || null, notes: customerData.notes || null };
      const { data, error } = await supabase.from("customers").insert([dataToInsert]).select().single();
      if (error) throw error;
      return { success: true, customer: data };
    } catch (error) {
      console.error("Error in createCustomer:", error);
      return { success: false, message: error.message || "Failed to create customer." };
    }
  },
  async updateCustomer(id, customerData) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const dataToUpdate = { ...customerData };
      delete dataToUpdate.id;
      const { data, error } = await supabase.from("customers").update(dataToUpdate).eq("id", id).select().single();
      if (error) throw error;
      return { success: true, customer: data };
    } catch (error) {
      console.error("Error in updateCustomer:", error);
      return { success: false, message: error.message || "Failed to update customer." };
    }
  },
  async deleteCustomer(id) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      return { success: true, message: "Customer deleted successfully." };
    } catch (error) {
      console.error("Error in deleteCustomer:", error);
      return { success: false, message: error.message || "Failed to delete customer." };
    }
  },

  // --- GENERIC EXPORT/TABLE DATA (Keep, but sales table exports will fail if called) ---
  async getAllItemsForExport() {
      if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
      try {
        const { data, error } = await supabase.from('item_location_quantities').select(`quantity, item:items!inner (id, sku, name, variant, description, category, cost_price, status, is_archived, low_stock_threshold, created_at, updated_at), location:storage_locations!inner (id, name, description, is_active)`).order('name', { foreignTable: 'items', ascending: true }).order('name', { foreignTable: 'location', ascending: true });
        if (error) throw error;
        const flatData = (data || []).map(record => ({ item_id: record.item.id, sku: record.item.sku, item_name: record.item.name, variant: record.item.variant, description: record.item.description, category: record.item.category, cost_price: record.item.cost_price, item_status: record.item.status, is_archived: record.item.is_archived, low_stock_threshold: record.item.low_stock_threshold, item_created_at: record.item.created_at, item_updated_at: record.item.updated_at, location_id: record.location.id, location_name: record.location.name, location_description: record.location.description, location_is_active: record.location.is_active, quantity_at_location: record.quantity }));
        return flatData;
      } catch (error) {
        console.error("[db.getAllItemsForExport] Error fetching items for export:", error);
        throw error;
      }
    },
    async getTableData(tableName) { // This is generic, keep it.
        if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
        // Add a check here if tableName is 'sales_orders' or 'sales_order_items' and return error/empty.
        if (tableName === 'sales_orders' || tableName === 'sales_order_items') {
            console.warn(`[db.getTableData] Attempted to fetch sales data ('${tableName}') which has been removed.`);
            return []; // Or throw new Error('Sales data is not available.');
        }
        try {
            const { data, error } = await supabase.from(tableName).select('*');
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error(`Error fetching data for table ${tableName}:`, err);
            throw err;
        }
    },

  // --- ACTIVITY LOG FUNCTIONS (Keep) ---
  async addActivityLogEntry(entryData) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { data, error } = await supabase.from("activity_log").insert([entryData]).select().single();
      if (error) throw error;
      return { success: true, entry: data };
    } catch (error) {
      console.error("[db.addActivityLogEntry] Error:", error);
      return { success: false, message: error.message || "Failed to add log entry." };
    }
  },
  async getActivityLogEntries(limit = 50) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data, error } = await supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("[db.getActivityLogEntries] Error:", error);
      throw error;
    }
  },

  // --- RETURN FUNCTIONS (Keep, returns are not direct sales) ---
  async createReturnRecord(returnData) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { data, error } = await supabase.from("returns").insert([returnData]).select().single();
      if (error) throw error;
      return { success: true, returnRecord: data };
    } catch (error) {
      console.error("[db.createReturnRecord] Error:", error);
      return { success: false, message: error.message || "Failed to create return record." };
    }
  },
  async incrementItemQuantity(itemId, quantityToAdd) { // This is generic, might be used by returns.
    if (!supabase) return { success: false, message: "Database client not initialized." };
    if (!itemId || quantityToAdd <= 0) return { success: false, message: "Invalid item ID or quantity to add." };
    try {
      const { data, error } = await supabase.rpc("increment_item_quantity", { p_item_id: itemId, p_quantity_to_add: quantityToAdd });
      if (error) throw error;
      return { success: true, message: "Quantity incremented." };
    } catch (error) {
      console.error("[db.incrementItemQuantity] Error:", error);
      return { success: false, message: error.message || "Failed to increment item quantity." };
    }
  },
  async markReturnInventoryAdjusted(returnId) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { error } = await supabase.from("returns").update({ inventory_adjusted: true }).eq("id", returnId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("[db.markReturnInventoryAdjusted] Error:", error);
      return { success: false, message: error.message || "Failed to mark return adjusted." };
    }
  },
async getReturnRecords(filters = {}, limit = 50) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
    try {
      let query = supabase
        .from("returns")
        .select( // The string inside these backticks must be PURE PostgREST select syntax
          `
            id,
            return_date:created_at,
            quantity_returned,
            reason,
            condition,
            notes,
            inventory_adjusted,
            item:items ( id, name, sku ),
            customer:customers ( id, full_name ),
            user:users ( id, username )
          `
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      const { data, error } = await query;

      if (error) {
        console.error("[db.getReturnRecords] Supabase select error:", error);
        throw error;
      }
      // console.log("[db.getReturnRecords] Data from Supabase (first 2):", data ? JSON.stringify(data.slice(0,2), null, 2) : "No data");
      return data || [];
    } catch (error) {
      console.error("[db.getReturnRecords] Error:", error);
      throw error;
    }
  },

  // --- STOCK OPERATIONS (Keep) ---
  async getInventoryTransactionsForItem(itemId, limit = 50, offset = 0) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data, error, count } = await supabase.from("inventory_transactions").select("*", { count: "exact" }).eq("item_id", itemId).order("transaction_date", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return { transactions: data || [], count: count || 0 };
    } catch (error) {
      console.error(`[db.getInventoryTransactionsForItem] Error fetching transactions for item ${itemId}:`, error);
      throw error;
    }
  },
  async createStockAdjustmentRecord(adjustmentData) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { data, error } = await supabase.from("stock_adjustments").insert([adjustmentData]).select().single();
      if (error) throw error;
      return { success: true, record: data };
    } catch (error) {
      console.error("[db.createStockAdjustmentRecord] Error:", error);
      return { success: false, message: error.message || "Failed to create stock adjustment record." };
    }
  },

  // --- BUNDLE MANAGEMENT FUNCTIONS (Keep, as bundles are inventory constructs) ---
  async createBundle(bundleData) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { bundle_sku, name, description, price, is_active, components } = bundleData;
      const { data: newBundle, error: bundleError } = await supabase.from("bundles").insert([{ bundle_sku, name, description, price, is_active }]).select().single();
      if (bundleError) throw bundleError;
      if (!newBundle) throw new Error("Bundle creation failed to return data.");
      if (components && components.length > 0) {
        const componentRecords = components.map((comp) => ({ bundle_id: newBundle.id, item_id: comp.item_id, quantity_in_bundle: comp.quantity_in_bundle }));
        const { error: componentsError } = await supabase.from("bundle_components").insert(componentRecords);
        if (componentsError) {
          return { success: true, bundle: newBundle, message: `Bundle '${name}' created, but failed to add components: ${componentsError.message}` };
        }
      }
      return { success: true, bundle: newBundle, message: `Bundle '${name}' created successfully.` };
    } catch (error) {
      console.error("[db.createBundle] Error:", error);
      return { success: false, message: error.message || "Failed to create bundle." };
    }
  },
  async getBundles(filters = {}) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
    try {
      let query = supabase.from("bundles").select("*");
      if (filters.isActive !== undefined) query = query.eq("is_active", filters.isActive);
      if (filters.searchTerm) query = query.or(`name.ilike.%${filters.searchTerm}%,bundle_sku.ilike.%${filters.searchTerm}%`);
      const { data: bundlesData, error } = await query.order("name");
      if (error) throw error;
      const bundlesWithEnrichedComponents = [];
      for (const bundle of bundlesData || []) {
        const { data: componentsData, error: compError } = await supabase.from("bundle_components").select("item_id, quantity_in_bundle, item:items!inner(id, name, sku)").eq("bundle_id", bundle.id);
        if (compError) {
          bundlesWithEnrichedComponents.push({ ...bundle, components: [] });
          continue;
        }
        let enrichedComponents = componentsData || [];
        if (filters.storeLocationId && componentsData && componentsData.length > 0) {
          enrichedComponents = await Promise.all(
            componentsData.map(async (comp) => {
              if (!comp.item_id) return { ...comp, item: { ...comp.item, quantity_at_specific_location: 0 } };
              const { data: locQtyData, error: locQtyError } = await supabase.from("item_location_quantities").select("quantity").eq("item_id", comp.item_id).eq("location_id", filters.storeLocationId).single();
              if (locQtyError && locQtyError.code !== "PGRST116") console.error(`Error fetching location quantity for item ${comp.item_id} at store ${filters.storeLocationId}`, locQtyError);
              return { ...comp, item: { ...comp.item, quantity_at_specific_location: locQtyData ? locQtyData.quantity : 0 } };
            })
          );
        } else if (componentsData) {
          enrichedComponents = componentsData.map((comp) => ({ ...comp, item: { ...comp.item, quantity_at_specific_location: null } }));
        }
        bundlesWithEnrichedComponents.push({ ...bundle, components: enrichedComponents });
      }
      return bundlesWithEnrichedComponents;
    } catch (error) {
      console.error("[db.getBundles] Error:", error);
      throw error;
    }
  },
  async getBundleById(id) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data: bundle, error: bundleError } = await supabase.from("bundles").select("*").eq("id", id).single();
      if (bundleError) {
        if (bundleError.code === "PGRST116") return null;
        throw bundleError;
      }
      if (!bundle) return null;
      const { data: components, error: compError } = await supabase.from("bundle_components").select(`item_id, quantity_in_bundle, item:items!inner (id, name, sku, cost_price, category, description, variant)`).eq("bundle_id", bundle.id);
      if (compError) throw compError;
      return { ...bundle, components: components || [] };
    } catch (error) {
      console.error(`[db.getBundleById] General error for bundle ID ${id}:`, error);
      throw error;
    }
  },
  async updateBundle(bundleId, bundleData) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { bundle_sku, name, description, price, is_active, components } = bundleData;
      const { data: updatedBundleMaster, error: bundleMasterError } = await supabase.from("bundles").update({ bundle_sku, name, description, price, is_active, updated_at: new Date() }).eq("id", bundleId).select().single();
      if (bundleMasterError) throw bundleMasterError;
      if (!updatedBundleMaster) throw new Error(`Bundle master update for ID ${bundleId} did not return data.`);
      if (Array.isArray(components)) {
        const { error: deleteError } = await supabase.from("bundle_components").delete().eq("bundle_id", bundleId);
        if (deleteError) throw deleteError;
        if (components.length > 0) {
          const newComponentRecords = components.map((comp) => {
            if (comp.item_id == null || comp.quantity_in_bundle == null || isNaN(Number(comp.quantity_in_bundle))) return null;
            return { bundle_id: bundleId, item_id: comp.item_id, quantity_in_bundle: Number(comp.quantity_in_bundle) };
          }).filter((record) => record !== null);
          if (newComponentRecords.length > 0) {
            const { error: insertCompError } = await supabase.from("bundle_components").insert(newComponentRecords);
            if (insertCompError) throw insertCompError;
          }
        }
      }
      return { success: true, bundle: updatedBundleMaster, message: `Bundle '${updatedBundleMaster.name}' updated successfully.` };
    } catch (error) {
      console.error(`[db.updateBundle] Overall error for bundle ID ${bundleId}:`, error);
      return { success: false, message: error.message || "Failed to update bundle." };
    }
  },
  async deleteBundle(bundleId) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { error } = await supabase.from("bundles").delete().eq("id", bundleId);
      if (error) throw error;
      return { success: true, message: "Bundle deleted successfully." };
    } catch (error) {
      console.error("[db.deleteBundle] Error:", error);
      return { success: false, message: error.message || "Failed to delete bundle." };
    }
  },


  // --- STOCK TRANSFER FUNCTIONS (Keep) ---
  async createStockTransferAndAdjustInventory(transferDetails) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { data: sourceStock, error: sourceStockError } = await supabase.from("item_location_quantities").select("quantity").eq("item_id", transferDetails.itemId).eq("location_id", transferDetails.sourceLocationId).single();
      if (sourceStockError && sourceStockError.code !== "PGRST116") throw sourceStockError;
      const currentQtyAtSource = sourceStock ? sourceStock.quantity : 0;
      if (currentQtyAtSource < transferDetails.quantityTransferred) {
        return { success: false, message: `Insufficient stock at ${transferDetails.sourceLocationName}. Available: ${currentQtyAtSource}, Trying to transfer: ${transferDetails.quantityTransferred}` };
      }
      const { data: newTransfer, error: transferError } = await supabase.from("stock_transfers").insert([{ item_id: transferDetails.itemId, quantity_transferred: transferDetails.quantityTransferred, source_location: transferDetails.sourceLocationName, destination_location: transferDetails.destinationLocationName, notes: transferDetails.notes, reference_number: transferDetails.referenceNumber || `TR-${Date.now()}`, processed_by_user_id: transferDetails.userId, username_snapshot: transferDetails.usernameSnapshot, }]).select().single();
      if (transferError) throw transferError;
      if (!newTransfer) throw new Error("Stock transfer record creation failed.");
      const deductionContext = { transactionType: "STOCK_TRANSFER_OUT", referenceId: String(newTransfer.id), referenceType: "STOCK_TRANSFER", userId: transferDetails.userId, usernameSnapshot: transferDetails.usernameSnapshot, notes: `Transfer Out to ${transferDetails.destinationLocationName}. Ref ID: ${newTransfer.id}` };
      const deductionResult = await db.adjustStockQuantity(transferDetails.itemId, transferDetails.sourceLocationId, -Math.abs(transferDetails.quantityTransferred), deductionContext);
      if (!deductionResult.success) throw new Error(`Deduction failed: ${deductionResult.message}`);
      const additionContext = { transactionType: "STOCK_TRANSFER_IN", referenceId: String(newTransfer.id), referenceType: "STOCK_TRANSFER", userId: transferDetails.userId, usernameSnapshot: transferDetails.usernameSnapshot, notes: `Transfer In from ${transferDetails.sourceLocationName}. Ref ID: ${newTransfer.id}` };
      const additionResult = await db.adjustStockQuantity(transferDetails.itemId, transferDetails.destinationLocationId, Math.abs(transferDetails.quantityTransferred), additionContext);
      if (!additionResult.success) throw new Error(`Addition failed: ${additionResult.message}`);
      return { success: true, transfer: newTransfer, message: "Stock transferred successfully." };
    } catch (error) {
      console.error("[db.createStockTransferAndAdjustInventory] Error:", error);
      return { success: false, message: error.message || "Failed to process stock transfer." };
    }
  },
  async getStockTransfers(filters = {}) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
    try {
      let query = supabase.from("stock_transfers").select(`*, item:items (id, name, sku), user:users (id, username)`).order("transfer_date", { ascending: false });
      if (filters.itemId) query = query.eq("item_id", filters.itemId);
      const { data, error } = await query.limit(filters.limit || 50);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("[db.getStockTransfers] Error:", error);
      throw error;
    }
  },

  // --- ARCHIVE ITEM (Keep) ---
  async archiveItem(itemId, archiveStatus = true) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { data, error } = await supabase.from("items").update({ is_archived: archiveStatus, updated_at: new Date() }).eq("id", itemId).select().single();
      if (error) throw error;
      return { success: true, item: data, message: `Item ${archiveStatus ? "archived" : "unarchived"} successfully.` };
    } catch (error) {
      console.error(`Error in archiveItem (ID: ${itemId}):`, error);
      return { success: false, message: error.message || `Failed to ${archiveStatus ? "archive" : "unarchive"} item.` };
    }
  },

  // --- STORAGE LOCATIONS (Keep) ---
  async getInventoryByStorageLocation() { // Used by AnalyticsPage
    if (!supabase) return { success: false, message: "Database client not initialized.", data: [] };
    try {
      const { data, error } = await supabase.rpc("get_inventory_summary_by_storage");
      if (error) return { success: false, message: error.message || "RPC error fetching storage summary.", data: [] };
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("[db.getInventoryByStorageLocation] General error:", error);
      return { success: false, message: error.message || "Failed to get storage breakdown.", data: [] };
    }
  },
  async getStoreLocationId() { // Used by Bundle forms and other places needing "STORE"
    if (!supabase) return null;
    try {
      const storeLocationName = "STORE";
      const { data, error } = await supabase.from("storage_locations").select("id").eq("name", storeLocationName).eq("is_active", true).single();
      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return data ? data.id : null;
    } catch (err) {
      console.error("[db.getStoreLocationId] Unexpected error:", err);
      return null;
    }
  },
  async getStorageLocations() { // Used by various forms for location dropdowns
    if (!supabase) return { success: false, message: "Database client not initialized.", locations: [] };
    try {
      const { data, error } = await supabase.from("storage_locations").select("id, name, description").eq("is_active", true).order("name", { ascending: true });
      if (error) throw error;
      return { success: true, locations: data || [] };
    } catch (error) {
      console.error("[db.getStorageLocations] Error:", error);
      return { success: false, message: error.message, locations: [] };
    }
  },

  // --- DETAILED STOCK REPORT (Keep) ---
  async getDetailedStockReport(filters = {}) {
    if (!supabase) return { success: false, message: "DB client not init.", data: [] };
    try {
      let query = supabase.from("items").select(`id, sku, name, variant, category, cost_price, low_stock_threshold, item_location_quantities!inner (quantity, storage_locations!inner (id, name))`).eq("is_archived", false);
      if (filters.category) query = query.eq("category", filters.category);
      if (filters.locationId) query = query.eq("item_location_quantities.location_id", filters.locationId);
      if (filters.itemId) query = query.eq("id", filters.itemId);
      const { data, error } = await query.order("name").order("name", { foreignTable: "item_location_quantities.storage_locations" });
      if (error) throw error;
      const flatData = [];
      (data || []).forEach((item) => {
        if (item.item_location_quantities && item.item_location_quantities.length > 0) {
          item.item_location_quantities.forEach((ilq) => {
            if (filters.lowStockOnly && ilq.quantity >= (item.low_stock_threshold || 0)) { /* Skip */ }
            else {
              flatData.push({ item_id: item.id, sku: item.sku, item_name: item.name, variant: item.variant, category: item.category, location_id: ilq.storage_locations.id, location_name: ilq.storage_locations.name, quantity_at_location: ilq.quantity, cost_price: item.cost_price, stock_value_at_location: ilq.quantity * (item.cost_price || 0), low_stock_threshold: item.low_stock_threshold });
            }
          });
        } else if (!filters.locationId && !filters.lowStockOnly) {
          flatData.push({ item_id: item.id, sku: item.sku, item_name: item.name, variant: item.variant, category: item.category, location_id: null, location_name: "N/A (No Stock Records)", quantity_at_location: 0, cost_price: item.cost_price, stock_value_at_location: 0, low_stock_threshold: item.low_stock_threshold });
        }
      });
      return { success: true, data: flatData };
    } catch (error) {
      console.error("[db.getDetailedStockReport] Error:", error);
      return { success: false, message: error.message, data: [] };
    }
  },

  // --- INVENTORY VALUATION REPORT (Keep) ---
  async getInventoryValuationReportData(filters = {}) {
      if (!supabase) return { success: false, message: "DB client not init.", data: [] };
      try {
          const { data, error } = await supabase.rpc('get_inventory_valuation_report', { p_category: filters.category || null, p_location_id: filters.locationId || null });
          if (error) throw error;
          return { success: true, data: data || [] };
      } catch (error) {
          console.error('[db.getInventoryValuationReportData] Error:', error);
          return { success: false, message: error.message, data: [] };
      }
  },
};