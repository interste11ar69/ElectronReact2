// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt"; // ESSENTIAL for custom password hashing and comparison

// Initialize the Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase;

// Console logs for debugging initialization
console.log("[supabaseClient] Initializing for custom auth...");
console.log(
  "[supabaseClient] REACT_APP_SUPABASE_URL:",
  supabaseUrl ? "SET" : "NOT SET - CRITICAL ERROR IF THIS PERSISTS"
);
console.log(
  "[supabaseClient] REACT_APP_SUPABASE_ANON_KEY:",
  supabaseAnonKey ? "SET" : "NOT SET - CRITICAL ERROR IF THIS PERSISTS"
);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[supabaseClient] CRITICAL: Missing Supabase environment variables. Supabase client will NOT be initialized. Check .env file and main.js for dotenv.config() at the top."
  );
  // supabase remains undefined
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    if (supabase) {
      console.log(
        "[supabaseClient] Supabase client instance CREATED successfully for DB operations."
      );
    } else {
      // This case should ideally not happen if createClient is called with valid params and doesn't throw
      console.error(
        "[supabaseClient] CRITICAL: createClient returned null or undefined, even though URL/Key were provided."
      );
      supabase = undefined; // Ensure it's explicitly undefined
    }
  } catch (e) {
    console.error(
      "[supabaseClient] CRITICAL: Error during Supabase createClient call:",
      e
    );
    supabase = undefined; // Ensure it's undefined on error
  }
}

export { supabase };
// Export the raw client if needed for direct use, though 'db' object is preferred

function getDateRange(period) {
    const PHT_OFFSET_HOURS = 8; // Philippines Time is UTC+8

    // Get current date and time, then adjust to PHT 'now'
    const nowUtc = new Date();
    const nowPht = new Date(nowUtc.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);

    let phtStartOfDay, phtEndOfDay;
    let queryStartDate, queryEndDate;

    const phtYear = nowPht.getUTCFullYear(); // Use UTC methods on the PHT-adjusted date
    const phtMonth = nowPht.getUTCMonth();   // to get components relative to PHT 'now'
    const phtDate = nowPht.getUTCDate();

    if (period === 'today') {
        // Start of "today" in PHT
        phtStartOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 0, 0, 0, 0));
        // End of "today" in PHT
        phtEndOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 23, 59, 59, 999));

        queryStartDate = phtStartOfDay;
        queryEndDate = phtEndOfDay;

    } else if (period === 'last7days') {
        // End of "today" in PHT
        phtEndOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 23, 59, 59, 999));
        // Start of the 7-day period in PHT (today and 6 previous days)
        phtStartOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 0, 0, 0, 0));
        phtStartOfDay.setUTCDate(phtStartOfDay.getUTCDate() - 6);

        queryStartDate = phtStartOfDay;
        queryEndDate = phtEndOfDay;

    } else if (period === 'last30days') {
        // End of "today" in PHT
        phtEndOfDay = new Date(Date.UTC(phtYear, phtMonth, phtDate, 23, 59, 59, 999));
        // Start of the 30-day period in PHT
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

    // The queryStartDate and queryEndDate are now Date objects representing PHT day boundaries,
    // but their internal value is based on UTC milliseconds. toISOString() will give their UTC representation.
    const finalStartDateISO = queryStartDate.toISOString();
    const finalEndDateISO = queryEndDate.toISOString();

    console.log(`[getDateRange] Period: ${period}`);
    console.log(`[getDateRange] PHT Now (for calculation): ${nowPht.toUTCString()} (displayed as UTC but represents PHT moment)`);
    console.log(`[getDateRange] Query Start (UTC ISO for DB): ${finalStartDateISO}`);
    console.log(`[getDateRange] Query End (UTC ISO for DB): ${finalEndDateISO}`);

    return {
        startDate: finalStartDateISO,
        endDate: finalEndDateISO
    };
}

export const db = {
  // --- CUSTOM AUTHENTICATION ---
  async login(username, password) {
    // Guard clause: Check if Supabase client is initialized
    if (!supabase) {
      console.error(
        "[db.login] Supabase client is not initialized. Cannot proceed with login."
      );
      // Return a user-friendly message and log details for developers
      return {
        success: false,
        message:
          "Login service is currently unavailable. Please try again later or contact support.",
      };
    }

    try {
      console.log(
        `[db.login] Attempting to find user in 'users' table: ${username}`
      );
      const { data: userData, error: queryError } = await supabase
        .from("users") // Your custom users table
        .select("id, username, password_hash, role") // Select only necessary fields
        .eq("username", username)
        .maybeSingle(); // Allows 0 or 1 row; returns null if 0 rows, no error for that case

      if (queryError) {
        console.error(
          "[db.login] Supabase query error while fetching user:",
          queryError
        );
        // Provide a more generic error message to the user for security
        return {
          success: false,
          message: "An error occurred during login. Please try again.",
        };
      }

      if (!userData) {
        console.log(`[db.login] User not found: ${username}`);
        return { success: false, message: "Invalid username or password." }; // Generic message for security
      }

      console.log(
        `[db.login] User found: ${userData.username}. Verifying password...`
      );
      // Ensure userData.password_hash exists before trying to compare
      if (!userData.password_hash) {
        console.error(
          `[db.login] Password hash is missing for user: ${userData.username}. Account may be misconfigured.`
        );
        return {
          success: false,
          message: "Account configuration issue. Please contact support.",
        };
      }

      const isValid = await bcrypt.compare(password, userData.password_hash);
      if (!isValid) {
        console.log(
          `[db.login] Password mismatch for user: ${userData.username}`
        );
        return { success: false, message: "Invalid username or password." }; // Generic message
      }

      console.log(`[db.login] Login successful for user: ${userData.username}`);
      // Return a user object without the password_hash for security
      return {
        success: true,
        user: {
          id: userData.id,
          username: userData.username,
          role: userData.role,
          // Add any other non-sensitive fields from your 'users' table that the frontend needs
        },
      };
    } catch (error) {
      // Catch unexpected errors during the bcrypt or other operations
      console.error("[db.login] Unexpected error during login process:", error);
      return {
        success: false,
        message: "An unexpected server error occurred. Please try again.",
        details: error.message,
      };
    }
  },

  async getUserInfoForLogById(userId) {
      if (!supabase || !userId) {
          console.warn('[db.getUserInfoForLogById] Supabase client not init or no userId provided.');
          return { username: 'N/A (System)' }; // Default/fallback
      }
      try {
          const { data, error } = await supabase
              .from('users')
              .select('username')
              .eq('id', userId)
              .single(); // Use single to expect one or zero

          if (error) {
              // PGRST116 means no user found for that ID, which is a valid case if FK is SET NULL or data is inconsistent
              if (error.code === 'PGRST116') {
                  console.warn(`[db.getUserInfoForLogById] User not found for ID ${userId}.`);
                  return { username: `N/A (User ID: ${userId} Not Found)` };
              }
              console.warn(`[db.getUserInfoForLogById] Error fetching username for user ID ${userId}:`, error.message);
              return { username: `N/A (Error)` };
          }
          // data will be null if no user is found and .single() is used without error code PGRST116 (shouldn't happen often)
          return data ? { username: data.username } : { username: `N/A (User ID: ${userId} Not Found)` };
      } catch (e) {
          console.error(`[db.getUserInfoForLogById] Exception fetching username for user ID ${userId}:`, e.message);
          return { username: `N/A (Exception)` };
      }
  },

  // For custom auth, getCurrentUser and logout are managed by the application state
  // (e.g., a variable in Electron main.js and React's App.js state).
  // These are NOT Supabase Auth functions. The IPC handlers in main.js will manage this.

  // --- ITEM MANAGEMENT FUNCTIONS ---
    async getItems(filters = {}) {
      if (!supabase) {
        console.error("[db.getItems] Supabase client not initialized!");
        return Promise.reject(new Error("Supabase client not initialized."));
      }

      try {
        let query = supabase.from("items_with_total_quantity").select("*");

        if (filters.is_archived !== undefined) {
          query = query.eq("is_archived", filters.is_archived);
        } else {
          query = query.eq("is_archived", false);
        }

        if (filters.category) {
          query = query.eq("category", filters.category);
        }

        if (filters.searchTerm) {
          query = query.or(
            `name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`
          );
        }

        const sortByCol = filters.sortBy || "name";
        const sortOrderAsc = filters.sortOrder === "asc";
        const effectiveSortBy =
          sortByCol === "quantity" ? "total_quantity" : sortByCol;
        query = query.order(effectiveSortBy, { ascending: sortOrderAsc });
        if (effectiveSortBy !== "id") {
          query = query.order("id", { ascending: true });
        }

        const { data: baseItems, error: baseItemsError } = await query;

        if (baseItemsError) {
          console.error("[db.getItems] Error fetching base items:", baseItemsError);
          throw baseItemsError;
        }

        if (!baseItems || baseItems.length === 0) {
          console.log("[db.getItems] No base items found matching criteria.");
          return [];
        }

        let itemsToReturn = baseItems;

        // --- MODIFICATION START ---
        // Handle enrichment for specific location quantity, whether by ID or NAME
        let specificLocationIdForEnrichment = null;

        if (filters.stockAtLocationId !== undefined && filters.stockAtLocationId !== null) {
          // This path is used by BundleFormPage (passes ID)
          specificLocationIdForEnrichment = filters.stockAtLocationId;
          console.log(`[db.getItems] Enriching items with stock for location ID: ${specificLocationIdForEnrichment}`);
        } else if (filters.storageLocation) {
          // This path is used by ItemManagementPage (passes NAME)
          console.log(`[db.getItems] Filtering and enriching by storage location NAME: ${filters.storageLocation}`);
          const { data: locationData, error: locationError } = await supabase
            .from("storage_locations")
            .select("id")
            .eq("name", filters.storageLocation)
            .single();

          if (locationError) {
              console.error(`[db.getItems] Error fetching ID for location name ${filters.storageLocation}:`, locationError);
              // If location name doesn't resolve to an ID, we might return empty or all items without specific quantities
              // For now, let's proceed, enrichment will yield 0 for specific quantities if ID is null.
          }
          if (locationData) {
              specificLocationIdForEnrichment = locationData.id;
              console.log(`[db.getItems] Resolved location name "${filters.storageLocation}" to ID: ${specificLocationIdForEnrichment}`);
          } else {
              console.warn(`[db.getItems] Could not find location ID for name: ${filters.storageLocation}. No location-specific quantities will be fetched.`);
              // If no location ID, we effectively show no items if the intent was to filter by a non-existent location.
              // Or, if the intent is to show all items if location is invalid, then don't filter itemsToReturn yet.
              // For strict filtering by location name:
              return []; // No items if the named location doesn't exist
          }
        }

        if (specificLocationIdForEnrichment !== null) {
          const itemIds = itemsToReturn.map((item) => item.id);
          if (itemIds.length > 0) { // Only fetch if there are items to enrich
              const { data: locationQuantities, error: locQtyError } = await supabase
                .from("item_location_quantities")
                .select("item_id, quantity")
                .eq("location_id", specificLocationIdForEnrichment)
                .in("item_id", itemIds);

              if (locQtyError) {
                console.error(
                  `[db.getItems] Error fetching quantities for location ${specificLocationIdForEnrichment}:`,
                  locQtyError
                );
              }

              const quantityMap = new Map();
              if (locationQuantities) {
                locationQuantities.forEach((lq) => {
                  quantityMap.set(lq.item_id, lq.quantity);
                });
              }

              itemsToReturn = itemsToReturn.map((item) => ({
                ...item,
                quantity_at_specific_location: quantityMap.get(item.id) === undefined ? 0 : quantityMap.get(item.id),
              }));

              // If filtering by storageLocation (name), we also need to filter the list
              // to only items that actually HAVE stock (or at least a record) at that location.
              if (filters.storageLocation) { // This implies specificLocationIdForEnrichment was set via name
                  itemsToReturn = itemsToReturn.filter(item => quantityMap.has(item.id));
              }
          }
        }
        // --- MODIFICATION END ---

        console.log(
          `[db.getItems] Fetched and processed ${itemsToReturn.length} items.`
        );
        // Ensure all items have quantity_at_specific_location, even if null/0, if no specific filter applied
        return itemsToReturn.map(item => ({
            ...item,
            quantity_at_specific_location: item.quantity_at_specific_location === undefined ? null : item.quantity_at_specific_location
        }));

      } catch (error) {
        console.error(
          "[db.getItems] General error in function execution:",
          error.message
        );
        throw error;
      }
    },

  async getItemById(itemId) {
    if (!supabase || !itemId)
      return Promise.reject(
        new Error("Supabase client or itemId not provided.")
      );
    try {
      const { data: itemData, error: itemError } = await supabase
        .from("items_with_total_quantity") // Use the view for master details + total_quantity
        .select("*")
        .eq("id", itemId)
        .single();

      if (itemError) throw itemError;
      if (!itemData) return null;

      // Fetch quantities per location for this item
      const { data: locationsData, error: locError } = await supabase
        .from("item_location_quantities")
        .select("quantity, location:storage_locations!inner(id, name)") // Join to get location name and ID
        .eq("item_id", itemId);

      if (locError) {
        console.error(
          `Error fetching location quantities for item ${itemId}:`,
          locError
        );
        itemData.locations = []; // Default to empty if error
      } else {
        itemData.locations = (locationsData || []).map((l) => ({
          locationId: l.location.id,
          locationName: l.location.name,
          quantity: l.quantity,
        }));
      }
      return itemData;
    } catch (error) {
      console.error(`Error in getItemById (ID: ${itemId}):`, error);
      throw error;
    }
  },

  async createItem(
    itemData,
    initialStockEntries = [],
    createdByUserId,
    createdByUsername
  ) {
    // itemData: { name, sku, description, cost_price, category, variant, status }
    // initialStockEntries: Array of objects [{ locationId, quantity, locationName (optional for logging) }, ...]
    // createdByUserId, createdByUsername: For logging the initial stock entries

    if (!supabase) {
      return { success: false, message: "Database client not initialized." };
    }

    // 1. Prepare data for the 'items' table (excluding quantity and master storage_location)
    const itemRecordToInsert = {
      name: itemData.name,
      sku: itemData.sku || null, // SKU can be optional
      description: itemData.description || null,
      cost_price: parseFloat(itemData.cost_price) || 0,
      category: itemData.category || "Uncategorized",
      variant: itemData.variant || null,
      status: itemData.status || "Normal",
      is_archived: false, // New items are active by default
      // created_at and updated_at are usually handled by database defaults/triggers
    };

    let newItem; // To store the created item from the 'items' table

    try {
      // 2. Insert into the 'items' table
      const { data, error: itemInsertError } = await supabase
        .from("items")
        .insert([itemRecordToInsert])
        .select() // Select the newly inserted item
        .single(); // Expecting a single row back

      if (itemInsertError) {
        console.error(
          "Error creating item master record in Supabase:",
          itemInsertError
        );
        throw itemInsertError; // Let the outer catch handle it
      }
      if (!data) {
        throw new Error("Item master record creation failed to return data.");
      }
      newItem = data; // Store the successfully created item master

      // 3. Process initial stock entries by inserting into 'item_location_quantities'
      //    and logging via 'inventory_transactions' (using adjustStockQuantity RPC)
      if (
        initialStockEntries &&
        Array.isArray(initialStockEntries) &&
        initialStockEntries.length > 0
      ) {
        for (const stockEntry of initialStockEntries) {
          if (stockEntry.locationId && Number(stockEntry.quantity) > 0) {
            const transactionDetails = {
              transactionType: "INITIAL_STOCK_ENTRY", // Define this in your TRANSACTION_TYPES
              referenceId: String(newItem.id), // Link to the new item ID
              referenceType: "NEW_ITEM_CREATION",
              userId: createdByUserId, // ID of user creating the item
              usernameSnapshot: createdByUsername, // Username of user
              notes: `Initial stock for new item "${
                newItem.name
              }" at location ID ${stockEntry.locationId}${
                stockEntry.locationName ? ` (${stockEntry.locationName})` : ""
              }.`,
            };

            console.log(
              `[db.createItem] Adding initial stock for item ${newItem.id} at loc ${stockEntry.locationId}: qty ${stockEntry.quantity}`
            );
            // db.adjustStockQuantity now expects locationId as the second argument
            const adjustmentResult = await db.adjustStockQuantity(
              newItem.id,
              stockEntry.locationId,
              Number(stockEntry.quantity), // Must be a positive number for initial stock
              transactionDetails
            );

            if (!adjustmentResult.success) {
              // This is a partial failure state: item master created, but some initial stock failed.
              // For simplicity, we'll report the item creation as successful but log this error.
              // A more robust solution might involve rolling back the item master creation.
              console.error(
                `[db.createItem] Failed to add initial stock for item ${newItem.id} at location ${stockEntry.locationId}: ${adjustmentResult.message}`
              );
              // Optionally, collect these errors to return to the user.
            }
          }
        }
      }

      return {
        success: true,
        item: newItem,
        message: "Item created successfully with initial stock.",
      };
    } catch (error) {
      console.error("Error in createItem process:", error);
      // If newItem was created but subsequent stock entries failed, the item master still exists.
      // Depending on requirements, you might want to delete newItem here if any part of initial stock fails.
      // For now, it returns a general failure message.
      return {
        success: false,
        message: error.message || "Failed to create item or set initial stock.",
      };
    }
  },

  async incrementAllocatedQuantity(itemId, locationId, quantityToAllocate) {
          if (!supabase) return { success: false, message: "DB client not init." };
          try {
              const { error } = await supabase.rpc('increment_allocated_quantity', {
                  p_item_id: itemId,
                  p_location_id: locationId,
                  p_quantity_to_allocate: quantityToAllocate
              });
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
              const { error } = await supabase.rpc('decrement_allocated_quantity', {
                  p_item_id: itemId,
                  p_location_id: locationId,
                  p_quantity_to_deallocate: quantityToDeallocate
              });
              if (error) throw error;
              return { success: true, message: 'Allocated quantity decremented.' };
          } catch (error) {
              console.error('[db.decrementAllocatedQuantity] Error:', error);
              return { success: false, message: error.message || 'Failed to decrement allocated quantity.' };
          }
      },

  async adjustStockQuantity(
    itemId,
    locationId,
    adjustmentQtyNumeric,
    transactionDetails
  ) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };

    if (
      itemId === undefined ||
      itemId === null ||
      locationId === undefined ||
      locationId === null || // Explicitly check locationId
      typeof adjustmentQtyNumeric !== "number"
    ) {
      console.error("[db.adjustStockQuantity] Validation failed. Details:", {
        itemId,
        locationIdProvided: locationId,
        adjustmentQtyNumeric,
      });
      return {
        success: false,
        message: "Invalid item, location, or quantity.",
      };
    }
    // ... rest of the function (RPC call)
    // Ensure your RPC 'adjust_item_quantity' correctly uses p_location_id
    try {
      const rpcParams = {
        p_item_id: itemId,
        p_location_id: locationId, // This is passed to the RPC
        p_adjustment_qty: adjustmentQtyNumeric,
        p_transaction_type: transactionDetails.transactionType,
        p_reference_id: transactionDetails.referenceId || null,
        p_reference_type: transactionDetails.referenceType || null,
        p_user_id: transactionDetails.userId || null,
        p_username_snapshot: transactionDetails.usernameSnapshot || null,
        p_notes: transactionDetails.notes || null,
      };
      // console.log('[db.adjustStockQuantity] Calling RPC with params:', rpcParams);
      const { data: rpcResultData, error: rpcError } = await supabase.rpc(
        "adjust_item_quantity",
        rpcParams
      );

      if (rpcError) {
        console.error("[db.adjustStockQuantity] RPC error:", rpcError);
        throw rpcError;
      }
      // The RPC should return the new quantity at the location, or handle errors internally
      // For this example, let's assume it returns the new quantity or throws.
      // If your RPC returns a more complex object, adjust accordingly.
      const newQuantityAtLocation =
        typeof rpcResultData === "number" ? rpcResultData : null;
      if (newQuantityAtLocation === null && adjustmentQtyNumeric !== 0) {
        // This might indicate an issue if the RPC was expected to return a value
        // console.warn('[db.adjustStockQuantity] RPC did not return a numeric quantity.');
      }

      return { success: true, newQuantityAtLocation: newQuantityAtLocation }; // Ensure newQuantityAtLocation is what RPC returns
    } catch (error) {
      console.error("[db.adjustStockQuantity] Catch block error:", error);
      return { success: false, message: error.message || "RPC call failed." };
    }
  },

  async updateItem(id, itemData) {
    // id is separate, itemData is the object of fields to update
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      // Prepare data, ensuring types are correct and id is not in the update payload
      const dataToUpdate = { ...itemData };
      if (dataToUpdate.cost_price !== undefined)
        dataToUpdate.cost_price = parseFloat(dataToUpdate.cost_price) || 0;
      if (dataToUpdate.quantity !== undefined)
        dataToUpdate.quantity = parseInt(dataToUpdate.quantity, 10) || 0;
      delete dataToUpdate.id; // Ensure 'id' is not part of the payload to supabase.update()

      const { data, error } = await supabase
        .from("items")
        .update(dataToUpdate)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error("Error updating item in Supabase:", error);
        throw error;
      }
      return { success: true, item: data };
    } catch (error) {
      console.error("Error in updateItem:", error);
      return {
        success: false,
        message: error.message || "Failed to update item.",
      };
    }
  },
  async deleteItem(id) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
      return { success: true, message: "Item deleted successfully." };
    } catch (error) {
      console.error("Error in deleteItem:", error);
      return {
        success: false,
        message: error.message || "Failed to delete item.",
      };
    }
  },

  // --- ANALYTICS FUNCTIONS ---
  async getInventorySummary() {
    if (!supabase)
      return {
        success: false,
        message: "Database client not initialized.",
        summary: null,
      };
    try {
      // Fetch total unique active items
      const { count: totalUniqueItemsCount, error: countError } = await supabase
        .from("items") // This still queries 'items' for the count of unique items
        .select("*", { count: "exact", head: true })
        .eq("is_archived", false);

      if (countError) {
        console.error(
          "[db.getInventorySummary] Error counting items:",
          countError
        );
        throw countError;
      }

      // Fetch sum of quantities and values using the RPC
      const { data: totalsData, error: totalsError } = await supabase.rpc(
        "get_overall_inventory_totals"
      );

      if (totalsError) {
        console.error(
          "[db.getInventorySummary] Error calling RPC get_overall_inventory_totals:",
          totalsError
        );
        throw totalsError;
      }

      const summaryData =
        totalsData && totalsData.length > 0
          ? totalsData[0]
          : { total_stock_quantity: 0, estimated_total_value: 0 };

      return {
        success: true,
        summary: {
          totalUniqueItems: totalUniqueItemsCount || 0,
          totalStockQuantity: Number(summaryData.total_stock_quantity) || 0,
          estimatedTotalValue: Number(summaryData.estimated_total_value) || 0,
        },
      };
    } catch (error) {
      console.error("[db.getInventorySummary] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to get summary.",
        summary: null,
      };
    }
  },

  // getLowStockItems: Stays the same.
  async getLowStockItems(threshold = null, specificLocationName = "STORE") { // threshold can be null if using item's own threshold
          if (!supabase) return { success: false, message: "Database client not initialized.", items: [] };
          try {
              // 1. Get the ID of the specific location (e.g., "STORE")
              let locationIdToFilter = null;
              if (specificLocationName) {
                  const { data: locData, error: locError } = await supabase
                      .from('storage_locations')
                      .select('id')
                      .eq('name', specificLocationName)
                      .eq('is_active', true)
                      .single();

                  if (locError && locError.code !== 'PGRST116') throw locError;
                  if (!locData) {
                      console.warn(`[db.getLowStockItems] Location "${specificLocationName}" not found or inactive.`);
                      // Decide behavior: return empty, or error, or fall back to total quantity check
                      // For now, let's return empty if the specific store isn't found.
                      return { success: true, items: [], message: `Location "${specificLocationName}" not found for low stock check.` };
                  }
                  locationIdToFilter = locData.id;
              }

              // 2. Query items based on stock at the specific location vs. their individual low_stock_threshold
              //    or a global threshold if provided and item.low_stock_threshold is null.
              let query = supabase
                  .from('items')
                  .select(`
                      id, name, sku, category, low_stock_threshold,
                      item_location_quantities!inner (quantity)
                  `)
                  .eq('is_archived', false);

              if (locationIdToFilter) {
                  query = query.eq('item_location_quantities.location_id', locationIdToFilter);
              }
              // The filtering logic for "low stock" needs to happen after fetching,
              // or by using a more complex SQL query/RPC because the comparison is dynamic.

              const { data: itemsWithLocationStock, error } = await query;

              if (error) throw error;

              const lowStockList = (itemsWithLocationStock || [])
                  .map(item => {
                      // item.item_location_quantities should be an array, but with the .eq filter, it should have 0 or 1 element.
                      // If !inner join was used, it could be empty. With inner, item won't appear if no stock record at location.
                      const stockAtLocation = item.item_location_quantities[0]?.quantity;

                      if (stockAtLocation === undefined || stockAtLocation === null) {
                          // This item doesn't have a stock record at the specified location,
                          // or the join didn't work as expected. Treat as 0 for low stock check.
                          // Or, if using !inner, it might not appear at all.
                          // With !inner, if an item has no record at the location, item_location_quantities will be empty.
                          // For this logic, we assume if it's in itemsWithLocationStock, it has a record due to !inner.
                          return null;
                      }

                      // Use item's own low_stock_threshold if available, otherwise the global threshold (if provided)
                      const effectiveThreshold = item.low_stock_threshold !== null && item.low_stock_threshold !== undefined
                                               ? item.low_stock_threshold
                                               : (threshold !== null ? threshold : 0); // Default to 0 if no item threshold and no global threshold

                      if (stockAtLocation < effectiveThreshold) {
                          return {
                              id: item.id,
                              name: item.name,
                              sku: item.sku,
                              category: item.category,
                              quantity: stockAtLocation, // This is quantity_at_specific_location
                              low_stock_threshold: item.low_stock_threshold // For display/info
                          };
                      }
                      return null;
                  })
                  .filter(item => item !== null) // Remove items that are not low stock
                  .sort((a, b) => a.quantity - b.quantity); // Sort by quantity ascending

              return { success: true, items: lowStockList };

          } catch (error) {
              console.error("[db.getLowStockItems] Error:", error);
              return { success: false, message: error.message || "Failed to get low stock items.", items: [] };
          }
      },

  // NEW: Get inventory breakdown by category
  async getInventoryByCategory() {
    if (!supabase)
      return {
        success: false,
        message: "Database client not initialized.",
        data: [],
      };
    try {
      // This requires a custom SQL query or multiple queries if Supabase JS client doesn't directly support complex GROUP BY with SUM
      // For simplicity with JS client, we can fetch relevant data and aggregate, or use an RPC.
      // Let's use an RPC for efficiency. (See Step 1.1 below to create it in SQL)

      const { data, error } = await supabase.rpc(
        "get_inventory_summary_by_category"
      );

      if (error) {
        console.error("[db.getInventoryByCategory] RPC error:", error);
        throw error;
      }
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("[db.getInventoryByCategory] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to get category breakdown.",
        data: [],
      };
    }
  },

  // NEW: Get inventory breakdown by storage location
  async getTodaysSalesTotal() {
    if (!supabase)
      return {
        success: false,
        message: "Database client not initialized.",
        total: 0,
      };
    try {
      const today = new Date();
      const startDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0,
        0,
        0,
        0
      ).toISOString();
      const endDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999
      ).toISOString();

      console.log(
        `[db.getTodaysSalesTotal] Fetching sales from ${startDate} to ${endDate}`
      );

      // We sum 'total_amount' from 'sales_orders' table where status is 'Fulfilled' and order_date is today.
      // If you also want to include other statuses like 'Awaiting Payment' if that counts as a "sale" for this metric, adjust the filter.
      const { data, error } = await supabase
        .from("sales_orders")
        .select("total_amount")
        .eq("status", "Fulfilled") // Only count fulfilled orders as completed sales for total value
        .gte("order_date", startDate) // order_date greater than or equal to start of today
        .lte("order_date", endDate); // order_date less than or equal to end of today

      if (error) {
        console.error("[db.getTodaysSalesTotal] Supabase error:", error);
        throw error;
      }

      const totalSalesValue = (data || []).reduce(
        (sum, order) => sum + (Number(order.total_amount) || 0),
        0
      );
      console.log(
        `[db.getTodaysSalesTotal] Calculated total: ${totalSalesValue}`
      );
      return { success: true, total: totalSalesValue };
    } catch (error) {
      console.error("[db.getTodaysSalesTotal] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to get today's sales total.",
        total: 0,
      };
    }
  },

  // --- REVISED: Get New Orders Count for Today ---
  async getNewOrdersCount() {
    if (!supabase)
      return {
        success: false,
        message: "Database client not initialized.",
        count: 0,
      };
    try {
      const today = new Date();
      const startDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0,
        0,
        0,
        0
      ).toISOString();
      const endDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999
      ).toISOString();

      console.log(
        `[db.getNewOrdersCount] Fetching new orders from ${startDate} to ${endDate}`
      );

      // Counts orders created today, regardless of status, or you can filter by status like 'Pending', 'Confirmed'
      // For "New Orders", 'Pending' or 'Confirmed' often makes sense.
      const { count, error } = await supabase
        .from("sales_orders")
        .select("*", { count: "exact", head: true }) // We just need the count
        .gte("created_at", startDate) // Use created_at for when the order record was actually made
        .lte("created_at", endDate);
      // Optionally filter by status if "new" means specific statuses:
      // .in('status', ['Pending', 'Confirmed', 'Awaiting Payment'])

      if (error) {
        console.error("[db.getNewOrdersCount] Supabase error:", error);
        throw error;
      }

      console.log(`[db.getNewOrdersCount] Count: ${count}`);
      return { success: true, count: count || 0 };
    } catch (error) {
      console.error("[db.getNewOrdersCount] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to get new orders count.",
        count: 0,
      };
    }
  },

  async getTopSellingProductsByQuantity(limit = 5, dateRange = null) {
    // Requires a 'sales_items' table or similar, joining with 'items'
    // and aggregating quantity sold.
    if (!supabase)
      return {
        success: false,
        message: "Database client not initialized.",
        products: [],
      };
    console.warn(
      "[db.getTopSellingProductsByQuantity] This is a placeholder. Sales data table needed."
    );
    // Simulate for now - returning top N most stocked items as a proxy
    try {
      const { data, error } = await supabase
        .from("items")
        .select("name, category, quantity")
        .order("quantity", { ascending: false })
        .limit(limit);
      if (error) throw error;
      // This isn't "top selling" but "most stocked", adapt chart label accordingly
      return {
        success: true,
        products: data || [],
        isProxyData: true,
        proxyType: "Most Stocked",
      };
    } catch (error) {
      return { success: false, message: error.message, products: [] };
    }
  },
  // --- CUSTOMER MANAGEMENT FUNCTIONS ---
  async getCustomers(filters = {}) {
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      let query = supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false }); // Default order

      // Example filters (customize as needed)
      if (filters.searchTerm) {
        query = query.or(
          `full_name.ilike.%${filters.searchTerm}%,email.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`
        );
      }
      // Add more filters like by city, etc. if you add those fields

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error in getCustomers:", error);
      throw error;
    }
  },

  async getCustomerById(id) {
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error in getCustomerById:", error);
      throw error;
    }
  },

  async createCustomer(customerData) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      // Add any necessary defaults or transformations here if needed
      const dataToInsert = {
        full_name: customerData.full_name,
        email: customerData.email || null,
        phone: customerData.phone || null,
        address: customerData.address || null,
        notes: customerData.notes || null,
        // created_at and updated_at will be handled by the database
      };
      const { data, error } = await supabase
        .from("customers")
        .insert([dataToInsert])
        .select()
        .single();
      if (error) {
        console.error("Error creating customer in Supabase:", error);
        throw error;
      }
      return { success: true, customer: data };
    } catch (error) {
      console.error("Error in createCustomer:", error);
      return {
        success: false,
        message: error.message || "Failed to create customer.",
      };
    }
  },

  async updateCustomer(id, customerData) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      const dataToUpdate = { ...customerData };
      delete dataToUpdate.id; // Ensure 'id' is not part of the payload to supabase.update()
      // `updated_at` will be handled by the trigger if you set it up

      const { data, error } = await supabase
        .from("customers")
        .update(dataToUpdate)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error("Error updating customer in Supabase:", error);
        throw error;
      }
      return { success: true, customer: data };
    } catch (error) {
      console.error("Error in updateCustomer:", error);
      return {
        success: false,
        message: error.message || "Failed to update customer.",
      };
    }
  },

  async deleteCustomer(id) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      return { success: true, message: "Customer deleted successfully." };
    } catch (error) {
      console.error("Error in deleteCustomer:", error);
      return {
        success: false,
        message: error.message || "Failed to delete customer.",
      };
    }
  },
  async getAllItemsForExport() {
      if (!supabase) {
        return Promise.reject(new Error("Supabase client not initialized."));
      }
      try {
        const { data, error } = await supabase
          .from('item_location_quantities')
          .select(`
            quantity,
            item:items!inner (
              id, sku, name, variant, description, category, cost_price, status, is_archived, low_stock_threshold, created_at, updated_at
            ),
            location:storage_locations!inner (
              id, name, description, is_active
            )
          `)
          // Optional filters:
          // .eq('item.is_archived', false)
          // .eq('location.is_active', true)
          .order('name', { foreignTable: 'items', ascending: true })
          .order('name', { foreignTable: 'location', ascending: true });

        if (error) {
          console.error("[db.getAllItemsForExport] Supabase error:", error);
          throw error;
        }

        const flatData = (data || []).map(record => ({
          item_id: record.item.id,
          sku: record.item.sku,
          item_name: record.item.name,
          variant: record.item.variant,
          description: record.item.description,
          category: record.item.category,
          cost_price: record.item.cost_price,
          item_status: record.item.status,
          is_archived: record.item.is_archived,
          low_stock_threshold: record.item.low_stock_threshold,
          item_created_at: record.item.created_at,
          item_updated_at: record.item.updated_at,
          location_id: record.location.id,
          location_name: record.location.name,
          location_description: record.location.description,
          location_is_active: record.location.is_active,
          quantity_at_location: record.quantity
        }));

        console.log(`[db.getAllItemsForExport] Fetched and transformed ${flatData.length} item-location records for export.`);
        return flatData;

      } catch (error) {
        console.error("[db.getAllItemsForExport] Error fetching items for export:", error);
        throw error;
      }
    },

    async getTableData(tableName) {
        if (!supabase) return Promise.reject(new Error("..."));
        try {
            const { data, error } = await supabase.from(tableName).select('*');
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error(`Error fetching data for table ${tableName}:`, err);
            throw err;
        }
    },

  // --- ACTIVITY LOG FUNCTIONS ---
  async addActivityLogEntry(entryData) {
    // entryData should be an object like { user_identifier: '...', action: '...', details: '...' }
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      const { data, error } = await supabase
        .from("activity_log")
        .insert([entryData]) // Insert expects an array of objects
        .select() // Optionally select the inserted row back
        .single(); // Assuming you insert one at a time

      if (error) {
        console.error("[db.addActivityLogEntry] Supabase insert error:", error);
        throw error; // Let the caller handle it
      }
      // console.log('[db.addActivityLogEntry] Log entry added:', data);
      return { success: true, entry: data };
    } catch (error) {
      console.error("[db.addActivityLogEntry] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to add log entry.",
      };
    }
  },

  async getActivityLogEntries(limit = 50) {
    // Default limit of 50
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*") // Select all columns
        .order("created_at", { ascending: false }) // Get newest first
        .limit(limit); // Limit the number of results

      if (error) {
        console.error(
          "[db.getActivityLogEntries] Supabase select error:",
          error
        );
        throw error;
      }
      // console.log(`[db.getActivityLogEntries] Fetched ${data?.length ?? 0} log entries.`);
      return data || []; // Return array or empty array
    } catch (error) {
      console.error("[db.getActivityLogEntries] Error:", error);
      throw error; // Re-throw to be caught by the caller
    }
  },
  // --- RETURN FUNCTIONS ---
  async createReturnRecord(returnData) {
    // returnData should include: item_id, quantity_returned, reason, condition,
    // Optional: customer_id, notes, processed_by_user_id
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      // We won't set inventory_adjusted here; main.js logic will handle that update separately if needed.
      const { data, error } = await supabase
        .from("returns")
        .insert([returnData])
        .select() // Select the created record
        .single();

      if (error) {
        console.error("[db.createReturnRecord] Supabase insert error:", error);
        throw error;
      }
      return { success: true, returnRecord: data };
    } catch (error) {
      console.error("[db.createReturnRecord] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to create return record.",
      };
    }
  },

  // Function to specifically increase inventory for a returned item
  // This provides better transaction control than just calling updateItem generically
  async incrementItemQuantity(itemId, quantityToAdd) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    if (!itemId || quantityToAdd <= 0) {
      return { success: false, message: "Invalid item ID or quantity to add." };
    }
    try {
      // Use Supabase RPC function for atomic increment is BEST PRACTICE
      // Let's create one in SQL (See Step 2.1 below) and call it here.
      const { data, error } = await supabase.rpc("increment_item_quantity", {
        p_item_id: itemId,
        p_quantity_to_add: quantityToAdd,
      });

      if (error) {
        console.error("[db.incrementItemQuantity] Supabase RPC error:", error);
        throw error;
      }

      // The RPC function might return the new quantity or just success
      console.log(
        `[db.incrementItemQuantity] RPC call successful for item ${itemId}. Result:`,
        data
      );
      // Check if the RPC returned a specific value indicating success if needed
      // For now, assume no error means success.
      return { success: true, message: "Quantity incremented." };

      /* // --- Alternative (Less Safe - Risk of Race Condition) ---
// 1. Get current quantity
const { data: currentItem, error: fetchError } = await supabase
.from('items')
.select('quantity')
.eq('id', itemId)
.single();

if (fetchError) throw fetchError;
if (!currentItem) throw new Error(`Item with ID ${itemId} not found for quantity update.`);

// 2. Calculate new quantity
const newQuantity = (currentItem.quantity || 0) + quantityToAdd;

// 3. Update item with new quantity
const { error: updateError } = await supabase
.from('items')
.update({ quantity: newQuantity })
.eq('id', itemId);

if (updateError) throw updateError;
return { success: true, newQuantity: newQuantity };
*/
    } catch (error) {
      console.error("[db.incrementItemQuantity] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to increment item quantity.",
      };
    }
  },

  // Function to update the return record flag (optional but good practice)
  async markReturnInventoryAdjusted(returnId) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      const { error } = await supabase
        .from("returns")
        .update({ inventory_adjusted: true })
        .eq("id", returnId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("[db.markReturnInventoryAdjusted] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to mark return adjusted.",
      };
    }
  },

  // Function to fetch return records (for a potential history page)
  async getReturnRecords(filters = {}, limit = 50) {
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      let query = supabase
        .from("returns")
        // Select specific columns and related data
        .select(
          `
id,
created_at,
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

      // Add filters if needed (e.g., by date range, item_id, customer_id)
      // if (filters.itemId) query = query.eq('item_id', filters.itemId);
      // if (filters.customerId) query = query.eq('customer_id', filters.customerId);

      const { data, error } = await query;

      if (error) {
        console.error("[db.getReturnRecords] Supabase select error:", error);
        throw error;
      }
      return data || [];
    } catch (error) {
      console.error("[db.getReturnRecords] Error:", error);
      throw error;
    }
  },

  // Function to get inventory transactions for an item (for the new page)
  async getInventoryTransactionsForItem(itemId, limit = 50, offset = 0) {
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data, error, count } = await supabase
        .from("inventory_transactions")
        .select("*", { count: "exact" })
        .eq("item_id", itemId)
        .order("transaction_date", { ascending: false })
        .order("id", { ascending: false }) // Secondary sort for consistent pagination
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { transactions: data || [], count: count || 0 };
    } catch (error) {
      console.error(
        `[db.getInventoryTransactionsForItem] Error fetching transactions for item ${itemId}:`,
        error
      );
      throw error;
    }
  },
  async createStockAdjustmentRecord(adjustmentData) {
    // adjustmentData should contain:
    // item_id, user_id (optional), username_snapshot,
    // adjustment_quantity, previous_quantity, new_quantity, reason, notes
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      const { data, error } = await supabase
        .from("stock_adjustments")
        .insert([adjustmentData])
        .select()
        .single();

      if (error) {
        console.error(
          "[db.createStockAdjustmentRecord] Supabase insert error:",
          error
        );
        throw error;
      }
      console.log(
        "[db.createStockAdjustmentRecord] Stock adjustment record created:",
        data
      );
      return { success: true, record: data };
    } catch (error) {
      console.error("[db.createStockAdjustmentRecord] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to create stock adjustment record.",
      };
    }
  },
  // --- BUNDLE MANAGEMENT FUNCTIONS ---
  async createBundle(bundleData) {
    // bundleData: { bundle_sku, name, description, price, is_active, components: [{item_id, quantity_in_bundle}, ...] }
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      // 1. Create the bundle master record
      const { bundle_sku, name, description, price, is_active, components } =
        bundleData;
      const { data: newBundle, error: bundleError } = await supabase
        .from("bundles")
        .insert([{ bundle_sku, name, description, price, is_active }])
        .select()
        .single();

      if (bundleError) throw bundleError;
      if (!newBundle) throw new Error("Bundle creation failed to return data.");

      // 2. Create bundle components if provided and successful
      if (components && components.length > 0) {
        const componentRecords = components.map((comp) => ({
          bundle_id: newBundle.id,
          item_id: comp.item_id,
          quantity_in_bundle: comp.quantity_in_bundle,
        }));

        const { error: componentsError } = await supabase
          .from("bundle_components")
          .insert(componentRecords);

        if (componentsError) {
          // Potentially rollback bundle creation or log critical error
          console.error(
            "[db.createBundle] Error inserting components, bundle created but components failed:",
            componentsError
          );
          // For simplicity, we'll report success for bundle but with component error.
          // A transaction would be better here in a real production system.
          return {
            success: true,
            bundle: newBundle,
            message: `Bundle '${name}' created, but failed to add components: ${componentsError.message}`,
          };
        }
      }
      return {
        success: true,
        bundle: newBundle,
        message: `Bundle '${name}' created successfully.`,
      };
    } catch (error) {
      console.error("[db.createBundle] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to create bundle.",
      };
    }
  },

  async getBundles(filters = {}) {
    // filters might include { storeLocationId, searchTerm, isActive }
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      let query = supabase.from("bundles").select("*");

      if (filters.isActive !== undefined)
        query = query.eq("is_active", filters.isActive);
      if (filters.searchTerm)
        query = query.or(
          `name.ilike.%${filters.searchTerm}%,bundle_sku.ilike.%${filters.searchTerm}%`
        );
      // Add other filters for bundles if needed

      const { data: bundlesData, error } = await query.order("name");
      if (error) throw error;

      const bundlesWithEnrichedComponents = [];
      for (const bundle of bundlesData || []) {
        // Fetch components for this bundle
        const { data: componentsData, error: compError } = await supabase
          .from("bundle_components")
          // Select basic item details directly with the component
          .select(
            "item_id, quantity_in_bundle, item:items!inner(id, name, sku)"
          )
          .eq("bundle_id", bundle.id);

        if (compError) {
          console.error(
            `Error fetching components for bundle ${bundle.id}`,
            compError
          );
          bundlesWithEnrichedComponents.push({ ...bundle, components: [] }); // Add bundle even if components fail
          continue;
        }

        let enrichedComponents = componentsData || [];
        if (
          filters.storeLocationId &&
          componentsData &&
          componentsData.length > 0
        ) {
          // If storeLocationId is provided, enrich components with specific location quantity
          enrichedComponents = await Promise.all(
            componentsData.map(async (comp) => {
              if (!comp.item_id)
                return {
                  ...comp,
                  item: { ...comp.item, quantity_at_specific_location: 0 },
                }; // Should not happen if item_id is FK

              const { data: locQtyData, error: locQtyError } = await supabase
                .from("item_location_quantities")
                .select("quantity")
                .eq("item_id", comp.item_id)
                .eq("location_id", filters.storeLocationId)
                .single();

              // Handle cases where item might not have a record in item_location_quantities for that store
              if (locQtyError && locQtyError.code !== "PGRST116") {
                // PGRST116: " esattamente una riga attesa" - no row found
                console.error(
                  `Error fetching location quantity for item ${comp.item_id} at store ${filters.storeLocationId}`,
                  locQtyError
                );
              }

              return {
                ...comp, // contains item_id, quantity_in_bundle, and item object (id, name, sku)
                item: {
                  ...comp.item, // Spread existing item properties (id, name, sku)
                  quantity_at_specific_location: locQtyData
                    ? locQtyData.quantity
                    : 0,
                },
              };
            })
          );
        } else if (componentsData) {
          // If no storeLocationId, ensure quantity_at_specific_location is at least null or 0
          enrichedComponents = componentsData.map((comp) => ({
            ...comp,
            item: {
              ...comp.item,
              quantity_at_specific_location: null, // Or 0, depending on how you want to handle it
            },
          }));
        }

        bundlesWithEnrichedComponents.push({
          ...bundle,
          components: enrichedComponents,
        });
      }
      return bundlesWithEnrichedComponents;
    } catch (error) {
      console.error("[db.getBundles] Error:", error);
      throw error;
    }
  },

  async getBundleById(id) {
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data: bundle, error: bundleError } = await supabase
        .from("bundles")
        .select("*")
        .eq("id", id)
        .single();

      if (bundleError) {
        // If bundle not found (PGRST116), it's a valid case, return null
        if (bundleError.code === "PGRST116") {
          console.warn(`[db.getBundleById] Bundle with ID ${id} not found.`);
          return null;
        }
        console.error(
          `[db.getBundleById] Error fetching bundle master for ID ${id}:`,
          bundleError
        );
        throw bundleError;
      }

      if (!bundle) {
        // Should be caught by PGRST116, but as a safeguard
        console.warn(
          `[db.getBundleById] Bundle with ID ${id} not found (no data).`
        );
        return null;
      }

      // Fetch components and their associated item's master data
      // We are NOT fetching 'quantity' directly from 'items' table here.
      // The frontend (BundleFormPage) will handle fetching quantity_at_specific_location if needed.
      const { data: components, error: compError } = await supabase
        .from("bundle_components")
        .select(
          `
                 item_id,
                 quantity_in_bundle,
                 item:items!inner (id, name, sku, cost_price, category, description, variant)
             `
        ) // Select specific, existing columns from items
        .eq("bundle_id", bundle.id);

      if (compError) {
        console.error(
          `[db.getBundleById] Error fetching components for bundle ID ${id}:`,
          compError
        );
        throw compError;
      }

      return { ...bundle, components: components || [] };
    } catch (error) {
      console.error(
        `[db.getBundleById] General error for bundle ID ${id}:`,
        error
      );
      // Ensure the error is re-thrown so the IPC promise rejects correctly
      throw error;
    }
  },

  async updateBundle(bundleId, bundleData) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };

    console.log(
      `[db.updateBundle] Attempting to update bundle ID: ${bundleId} with data:`,
      JSON.stringify(bundleData, null, 2)
    );

    try {
      const { bundle_sku, name, description, price, is_active, components } =
        bundleData;

      // 1. Update bundle master record
      const { data: updatedBundleMaster, error: bundleMasterError } =
        await supabase
          .from("bundles")
          .update({
            bundle_sku,
            name,
            description,
            price,
            is_active,
            updated_at: new Date(),
          })
          .eq("id", bundleId)
          .select()
          .single();

      if (bundleMasterError) {
        console.error(
          `[db.updateBundle] Error updating bundle master for ID ${bundleId}:`,
          bundleMasterError
        );
        throw bundleMasterError;
      }
      if (!updatedBundleMaster) {
        throw new Error(
          `Bundle master update for ID ${bundleId} did not return data.`
        );
      }
      console.log(
        `[db.updateBundle] Successfully updated bundle master for ID ${bundleId}.`
      );

      // 2. Update components: Delete existing then re-insert
      if (Array.isArray(components)) {
        // Ensure components is an array
        console.log(
          `[db.updateBundle] Processing ${components.length} components for bundle ID ${bundleId}.`
        );

        // Delete existing components
        const { error: deleteError } = await supabase
          .from("bundle_components")
          .delete()
          .eq("bundle_id", bundleId);

        if (deleteError) {
          console.error(
            `[db.updateBundle] Error deleting existing components for bundle ID ${bundleId}:`,
            deleteError
          );
          throw deleteError;
        }
        console.log(
          `[db.updateBundle] Successfully deleted existing components for bundle ID ${bundleId}.`
        );

        // Insert new components if any are provided
        if (components.length > 0) {
          const newComponentRecords = components
            .map((comp) => {
              if (
                comp.item_id == null ||
                comp.quantity_in_bundle == null ||
                isNaN(Number(comp.quantity_in_bundle))
              ) {
                console.error(
                  `[db.updateBundle] Invalid component data skipped:`,
                  comp
                );
                // Optionally throw an error to stop the whole process if strict validation is needed
                // For now, we'll log and it will be filtered out by a check below if it results in an invalid record
                return null;
              }
              return {
                bundle_id: bundleId,
                item_id: comp.item_id,
                quantity_in_bundle: Number(comp.quantity_in_bundle),
              };
            })
            .filter((record) => record !== null); // Filter out any nulls from invalid data

          if (newComponentRecords.length > 0) {
            console.log(
              `[db.updateBundle] Inserting ${newComponentRecords.length} new component records for bundle ID ${bundleId}:`,
              newComponentRecords
            );
            const { error: insertCompError } = await supabase
              .from("bundle_components")
              .insert(newComponentRecords);

            if (insertCompError) {
              console.error(
                `[db.updateBundle] Error inserting new components for bundle ID ${bundleId}:`,
                insertCompError
              );
              throw insertCompError;
            }
            console.log(
              `[db.updateBundle] Successfully inserted ${newComponentRecords.length} new components for bundle ID ${bundleId}.`
            );
          } else {
            console.log(
              `[db.updateBundle] No valid new components to insert for bundle ID ${bundleId}.`
            );
          }
        } else {
          console.log(
            `[db.updateBundle] No components in payload to insert for bundle ID ${bundleId} (components array was empty).`
          );
        }
      } else {
        console.log(
          `[db.updateBundle] No 'components' array provided or it's not an array. Components not updated for bundle ID ${bundleId}.`
        );
      }

      return {
        success: true,
        bundle: updatedBundleMaster, // Return the updated master data
        message: `Bundle '${updatedBundleMaster.name}' updated successfully.`,
      };
    } catch (error) {
      console.error(
        `[db.updateBundle] Overall error for bundle ID ${bundleId}:`,
        error
      );
      return {
        success: false,
        message: error.message || "Failed to update bundle.",
      };
    }
  },

  async deleteBundle(bundleId) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      // ON DELETE CASCADE on bundle_components will handle component deletion
      const { error } = await supabase
        .from("bundles")
        .delete()
        .eq("id", bundleId);
      if (error) throw error;
      return { success: true, message: "Bundle deleted successfully." };
    } catch (error) {
      console.error("[db.deleteBundle] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete bundle.",
      };
    }
  },

  // --- FUNCTION TO PROCESS A BUNDLE SALE (DEDUCT COMPONENTS) ---
  async processBundleSale(bundleId, saleQuantity = 1, saleContext = {}) {
    // saleContext should now include: { userId, usernameSnapshot, storeLocationId }
    if (!supabase)
      return { success: false, message: "Database client not initialized." };

    const { userId, usernameSnapshot, storeLocationId } = saleContext;

    if (!storeLocationId) {
      console.error(
        "[db.processBundleSale] storeLocationId is missing in saleContext."
      );
      return {
        success: false,
        message:
          "Internal Error: Store location ID for component deduction is missing.",
      };
    }

    console.log(
      `[db.processBundleSale] Processing sale for bundle ${bundleId}, qty ${saleQuantity}, from store ID ${storeLocationId}`
    );

    try {
      // 1. Fetch bundle components (including item details for stock check)
      const { data: components, error: compError } = await supabase
        .from("bundle_components")
        .select(
          `
                  item_id,
                  quantity_in_bundle,
                  item:items!inner (id, name, sku)
              `
        ) // No need to fetch total quantity here, we need quantity at specific store
        .eq("bundle_id", bundleId);

      if (compError) throw compError;
      if (!components || components.length === 0) {
        return {
          success: false,
          message: "Bundle has no components defined or bundle not found.",
        };
      }

      // 2. Check if all components have enough stock AT THE SPECIFIED storeLocationId
      const stockErrors = [];
      const componentStockDetails = []; // To store fetched quantities

      for (const comp of components) {
        const requiredQtyForThisSale = comp.quantity_in_bundle * saleQuantity;

        // Fetch current quantity of this component AT THE storeLocationId
        const { data: locQtyData, error: locQtyError } = await supabase
          .from("item_location_quantities")
          .select("quantity")
          .eq("item_id", comp.item_id)
          .eq("location_id", storeLocationId)
          .single();

        if (locQtyError && locQtyError.code !== "PGRST116") {
          // PGRST116 means 0 rows, which is fine (means 0 stock)
          console.error(
            `[db.processBundleSale] Error fetching stock for component ${comp.item_id} at location ${storeLocationId}:`,
            locQtyError
          );
          stockErrors.push(`Could not verify stock for ${comp.item.name}.`);
          continue; // Skip to next component if stock check fails
        }

        const availableAtStore = locQtyData ? locQtyData.quantity : 0;
        componentStockDetails.push({
          ...comp,
          available_at_store: availableAtStore,
        }); // Store for deduction step

        if (availableAtStore < requiredQtyForThisSale) {
          stockErrors.push(
            `Not enough stock for component ${comp.item.name} (SKU: ${comp.item.sku}). Required: ${requiredQtyForThisSale}, Available at STORE: ${availableAtStore}`
          );
        }
      }

      if (stockErrors.length > 0) {
        return {
          success: false,
          message:
            "Insufficient stock for bundle components at STORE: " +
            stockErrors.join("; "),
        };
      }

      // 3. Deduct stock for each component FROM THE SPECIFIED storeLocationId
      const adjustmentResults = [];
      for (const comp of componentStockDetails) {
        // Use componentStockDetails which has available_at_store
        const quantityToDeduct = comp.quantity_in_bundle * saleQuantity;
        const componentTransactionDetails = {
          transactionType: "BUNDLE_SALE_COMPONENT_DEDUCTION", // More specific type
          referenceId: String(saleContext.salesOrderId || bundleId), // If part of a sales order, use that ID
          referenceType: saleContext.salesOrderId
            ? "SALES_ORDER_BUNDLE"
            : "DIRECT_BUNDLE_SALE",
          userId: userId,
          usernameSnapshot: usernameSnapshot,
          notes: `Component deduction for Bundle: ${comp.item.name} (SKU: ${
            comp.item.sku || "N/A"
          }) for Bundle ID ${bundleId}. Sale Qty: ${saleQuantity}. Deducted from Store ID: ${storeLocationId}.`,
        };

        // Call adjustStockQuantity with the specific storeLocationId
        const result = await db.adjustStockQuantity(
          comp.item_id,
          storeLocationId, // <<< Deduct from this specific location
          -Math.abs(quantityToDeduct), // Ensure it's negative
          componentTransactionDetails
        );
        adjustmentResults.push({ itemId: comp.item_id, ...result });
      }

      const failedAdjustments = adjustmentResults.filter((res) => !res.success);
      if (failedAdjustments.length > 0) {
        console.error(
          "[db.processBundleSale] CRITICAL: Some component stock adjustments failed:",
          failedAdjustments.map((f) => ({ item: f.itemId, msg: f.message }))
        );
        // IMPORTANT: Implement rollback logic here if possible, or at least log very clearly.
        // For now, returning an error.
        return {
          success: false,
          message:
            "Error adjusting stock for some bundle components. Processing incomplete. " +
            failedAdjustments
              .map((f) => `Item ${f.itemId}: ${f.message}`)
              .join("; "),
        };
      }

      return {
        success: true,
        message: `Bundle sale processed (${saleQuantity} units). Component stock deducted from STORE.`,
      };
    } catch (error) {
      console.error("[db.processBundleSale] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to process bundle sale.",
      };
    }
  },
  // --- END BUNDLE MANAGEMENT FUNCTIONS ---
  // --- SALES ORDER FUNCTIONS ---
  async createSalesOrder(orderData, orderItemsData, fulfillmentLocationId) { // Added fulfillmentLocationId
          if (!supabase) return { success: false, message: "DB client not init." };
          if (!orderData.created_by_user_id) return { success: false, message: "User ID missing."};
          if (!fulfillmentLocationId) return { success: false, message: "Fulfillment Location ID missing."};


          let newOrderId = null;
          try {
              const { data: newOrder, error: orderError } = await supabase
                  .from("sales_orders").insert([orderData]).select().single();

              if (orderError) throw orderError;
              if (!newOrder) throw new Error("Sales order creation failed (no data returned).");
              newOrderId = newOrder.id;

              const itemsToInsert = orderItemsData.map((item) => ({ ...item, sales_order_id: newOrderId }));
              const { error: itemsError } = await supabase.from("sales_order_items").insert(itemsToInsert);

              if (itemsError) { /* ... rollback header ... */ throw itemsError; }

              const COMMITTED_ORDER_STATUSES_FOR_CREATE = ['Confirmed', 'Awaiting Payment', 'Ready to Ship']; // Statuses that allocate on create

              // Initial Allocation if created in a committed state (but not Fulfilled yet)
              if (COMMITTED_ORDER_STATUSES_FOR_CREATE.includes(newOrder.status)) {
                  console.log(`[db.createSalesOrder] Order ${newOrderId} created as ${newOrder.status}. Allocating stock.`);
                  for (const item of orderItemsData) {
                      const qtyToProcess = parseInt(item.quantity, 10);
                      if (item.item_id) {
                          const allocResult = await db.incrementAllocatedQuantity(item.item_id, fulfillmentLocationId, qtyToProcess);
                          if (!allocResult.success) throw new Error(`Failed to allocate initial stock for item ID ${item.item_id}: ${allocResult.message}`);
                      } else if (item.bundle_id) {
                          const bundleDetails = await db.getBundleById(item.bundle_id);
                          if (!bundleDetails || !bundleDetails.components) throw new Error (`Bundle ID ${item.bundle_id} details not found for initial allocation.`);
                          for (const component of bundleDetails.components) {
                              const componentQtyToAllocate = component.quantity_in_bundle * qtyToProcess;
                              const allocResult = await db.incrementAllocatedQuantity(component.item_id, fulfillmentLocationId, componentQtyToAllocate);
                              if (!allocResult.success) throw new Error(`Failed to allocate initial stock for bundle component ID ${component.item_id}: ${allocResult.message}`);
                          }
                      }
                  }
              }

              // Initial Deduction & De-allocation if created directly as "Fulfilled"
              if (newOrder.status === "Fulfilled") {
                  console.log(`[db.createSalesOrder] Order ${newOrderId} created as Fulfilled. Processing stock deductions & de-allocations.`);
                  const userInfo = await db.getUserInfoForLogById(newOrder.created_by_user_id);
                   if (!userInfo || !userInfo.username) throw new Error("Failed to retrieve user info for stock deduction log.");


                  for (const item of orderItemsData) {
                      const qtyToProcess = parseInt(item.quantity, 10);
                      const commonTransactionNotes = `Fulfilled NEW Order #${newOrder.order_number || newOrder.id}, Item: ${item.item_snapshot_name}`;

                      if (item.item_id) {
                          // 1. De-allocate (if it was conceptually allocated by being 'Fulfilled')
                          //    OR, if it was created as 'Confirmed' then immediately 'Fulfilled' in one go.
                          //    If created directly as Fulfilled, it might not have gone through a separate allocation increment.
                          //    For simplicity, if created as Fulfilled, we assume any conceptual allocation is immediately fulfilled.
                          //    So, we might not need to explicitly call decrementAllocatedQuantity here if it wasn't incremented.
                          //    However, if the workflow allows creating as "Confirmed" then immediately fulfilling,
                          //    then decrementing allocated is correct.
                          //    Let's assume it was conceptually allocated if it's being fulfilled.
                          const deallocResult = await db.decrementAllocatedQuantity(item.item_id, fulfillmentLocationId, qtyToProcess);
                          // if (!deallocResult.success) console.warn(`De-allocation warning for item ${item.item_id}: ${deallocResult.message}`); // Non-critical warning

                          // 2. Deduct physical stock
                          const transactionDetails = { /* ... */ userId: newOrder.created_by_user_id, usernameSnapshot: userInfo.username, notes: commonTransactionNotes };
                          const deductionResult = await db.adjustStockQuantity(item.item_id, fulfillmentLocationId, -Math.abs(qtyToProcess), transactionDetails);
                          if (!deductionResult.success) throw new Error(`Failed to deduct stock for item ID ${item.item_id}: ${deductionResult.message}`);
                      } else if (item.bundle_id) {
                          // Similar logic for bundle components: decrement allocated, then adjust physical
                          const bundleDetails = await db.getBundleById(item.bundle_id);
                          if (!bundleDetails || !bundleDetails.components) throw new Error (`Bundle ID ${item.bundle_id} details not found for fulfillment.`);
                          for (const component of bundleDetails.components) {
                              const componentQtyToProcess = component.quantity_in_bundle * qtyToProcess;
                              await db.decrementAllocatedQuantity(component.item_id, fulfillmentLocationId, componentQtyToProcess);

                              const transactionDetails = { /* ... */ userId: newOrder.created_by_user_id, usernameSnapshot: userInfo.username, notes: `${commonTransactionNotes} (Component: ${component.item?.name})` };
                              const deductionResult = await db.adjustStockQuantity(component.item_id, fulfillmentLocationId, -Math.abs(componentQtyToProcess), transactionDetails);
                              if (!deductionResult.success) throw new Error(`Failed to deduct stock for bundle component ID ${component.item_id}: ${deductionResult.message}`);
                          }
                      }
                  }
              }
              return { success: true, order: newOrder, message: `Sales Order ${newOrder.order_number || `ID-${newOrder.id}`} created with status ${newOrder.status}.` };
          } catch (error) { /* ... error handling and return ... */ }
      },

      async getSalesOrders(filters = {}) {
              if (!supabase) {
                  console.error("[db.getSalesOrders] Supabase client not initialized.");
                  return Promise.reject(new Error("Supabase client not initialized."));
              }
              console.log("[db.getSalesOrders] Fetching sales orders with filters:", filters); // Add log
              try {
                  let query = supabase
                      .from("sales_orders")
                      .select(
                          `
                              id,
                              order_number,
                              order_date,
                              status,
                              total_amount,
                              notes,
                              created_by_user_id,
                              customer:customers(id, full_name),
                              order_items:sales_order_items(*)  // Crucial for item count on list page
                          `
                      )
                      .order("order_date", { ascending: false });

                  if (filters.status && filters.status !== 'All') { // Make sure to handle 'All'
                      query = query.eq("status", filters.status);
                  }
                  if (filters.customerId) {
                      query = query.eq("customer_id", filters.customerId);
                  }
                  // Add more filters as needed

                  const { data, error } = await query;
                  if (error) {
                      console.error("[db.getSalesOrders] Supabase select error:", error);
                      throw error; // Propagate the error
                  }
                  console.log(`[db.getSalesOrders] Fetched ${data ? data.length : 0} sales orders.`);
                  return data || []; // Ensure an array is always returned
              } catch (error) {
                  console.error("[db.getSalesOrders] Catch block error:", error);
                  // It's better to throw here so main.js can catch and return a structured error
                  throw new Error(`Failed to get sales orders from DB: ${error.message}`);
              }
          },

  async getSalesOrderById(orderId) {
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(
          `
*,
customer:customers(id, full_name, email, phone),
order_items:sales_order_items(*)
`
        )
        .eq("id", orderId)
        .single();

      if (error) throw error;
      // For each order item, fetch item/bundle details if needed for display (or join in SQL view/RPC)
      if (data && data.order_items) {
        for (let item of data.order_items) {
          if (item.item_id) {
            const { data: productInfo } = await supabase
              .from("items")
              .select("name, sku")
              .eq("id", item.item_id)
              .single();
            item.product_details = productInfo;
          } else if (item.bundle_id) {
            const { data: bundleInfo } = await supabase
              .from("bundles")
              .select("name, bundle_sku")
              .eq("id", item.bundle_id)
              .single();
            item.product_details = bundleInfo;
          }
        }
      }
      return data;
    } catch (error) {
      console.error("[db.getSalesOrderById] Error:", error);
      throw error;
    }
  },

  async updateSalesOrderStatus(orderId, newStatus, performingUserId) {
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      const order = await db.getSalesOrderById(orderId);
      if (!order) return { success: false, message: "Sales order not found." };

      if (order.status === "Fulfilled" && newStatus !== "Fulfilled") {
        /* ... */
      }
      if (order.status === "Cancelled" && newStatus !== "Cancelled") {
        /* ... */
      }

      const performingUserInfo = await db.getUserInfoForLogById(
        performingUserId
      );

      if (newStatus === "Fulfilled" && order.status !== "Fulfilled") {
        console.log(
          `[db.updateSalesOrderStatus] Order ${orderId} (${
            order.order_number || ""
          }) moving to Fulfilled. Validating stock and processing deductions.`
        );

        const storeLocationId = await db.getStoreLocationId();
        if (!storeLocationId) {
          console.error(
            `[db.updateSalesOrderStatus] CRITICAL: Default fulfillment location (STORE) not configured. Cannot fulfill order ${orderId}.`
          );
          throw new Error(
            "Default fulfillment location (STORE) not configured. Order cannot be fulfilled."
          );
        }
        console.log(
          `[db.updateSalesOrderStatus] Using STORE Location ID for fulfillment: ${storeLocationId}`
        );

        // --- BEGIN PRE-FULFILLMENT STOCK VALIDATION ---
        const stockShortfalls = [];
        for (const item of order.order_items) {
          const requiredQuantityForSale = parseInt(item.quantity, 10);

          if (item.item_id) {
            // Individual item
            const { data: locQtyData, error: qtyError } = await supabase
              .from("item_location_quantities")
              .select("quantity")
              .eq("item_id", item.item_id)
              .eq("location_id", storeLocationId)
              .single();

            if (qtyError && qtyError.code !== "PGRST116") throw qtyError;
            const currentStockAtStore = locQtyData ? locQtyData.quantity : 0;

            if (currentStockAtStore < requiredQuantityForSale) {
              stockShortfalls.push(
                `${
                  item.item_snapshot_name || `Item ID ${item.item_id}`
                }: Requires ${requiredQuantityForSale}, Available at STORE: ${currentStockAtStore}`
              );
            }
          } else if (item.bundle_id) {
            // Bundle
            const { data: components, error: compError } = await supabase
              .from("bundle_components")
              .select(
                "item_id, quantity_in_bundle, item:items!inner(id, name, sku)"
              )
              .eq("bundle_id", item.bundle_id);

            if (compError) throw compError;
            if (!components || components.length === 0) {
              stockShortfalls.push(
                `Bundle ${
                  item.item_snapshot_name || `ID ${item.bundle_id}`
                } has no components defined.`
              );
              continue;
            }

            for (const comp of components) {
              const requiredCompQtyForBundleSale =
                comp.quantity_in_bundle * requiredQuantityForSale;
              const { data: compLocQtyData, error: compQtyErr } = await supabase
                .from("item_location_quantities")
                .select("quantity")
                .eq("item_id", comp.item_id)
                .eq("location_id", storeLocationId)
                .single();

              if (compQtyErr && compQtyErr.code !== "PGRST116")
                throw compQtyErr;
              const currentCompStockAtStore = compLocQtyData
                ? compLocQtyData.quantity
                : 0;

              if (currentCompStockAtStore < requiredCompQtyForBundleSale) {
                stockShortfalls.push(
                  `Component ${comp.item.name} (for Bundle ${item.item_snapshot_name}): Requires ${requiredCompQtyForBundleSale}, Available at STORE: ${currentCompStockAtStore}`
                );
              }
            }
          }
        }

        if (stockShortfalls.length > 0) {
          const shortfallMessage =
            "Cannot fulfill order. Insufficient stock at STORE for: " +
            stockShortfalls.join("; ");
          console.warn(
            `[db.updateSalesOrderStatus] Stock shortfall for order ${orderId}: ${shortfallMessage}`
          );
          return {
            success: false,
            message: shortfallMessage,
            isStockError: true,
          }; // Add flag for frontend
        }
        // --- END PRE-FULFILLMENT STOCK VALIDATION ---

        // If stock validation passes, proceed with deductions
        for (const item of order.order_items) {
          let deductionResult;
          const commonTransactionNotes = `Sale for Order #${
            order.order_number || order.id
          }, Item: ${
            item.item_snapshot_name ||
            (item.item_id
              ? `Item ID ${item.item_id}`
              : `Bundle ID ${item.bundle_id}`)
          } from STORE (LocID: ${storeLocationId})`;

          if (item.item_id) {
            const transactionDetails = {
              /* ... as before ... */ transactionType: "SALE_ITEM_DEDUCTION",
              referenceId: String(order.id),
              referenceType: "SALES_ORDER_ITEM",
              userId: performingUserId,
              usernameSnapshot: performingUserInfo.username,
              notes: commonTransactionNotes,
            };
            console.log(
              `[db.updateSalesOrderStatus] Deducting item: ID=${
                item.item_id
              }, Qty=${-Math.abs(item.quantity)}, LocID=${storeLocationId}`
            );
            deductionResult = await db.adjustStockQuantity(
              item.item_id,
              storeLocationId, // Use the validated storeLocationId
              -Math.abs(item.quantity),
              transactionDetails
            );
          } else if (item.bundle_id) {
            const bundleSaleContext = {
              salesOrderId: order.id,
              salesOrderNumber: order.order_number || `SO-${order.id}`,
              userId: performingUserId,
              usernameSnapshot: performingUserInfo.username,
              fulfillmentLocationId: storeLocationId, // Pass it down
            };
            console.log(
              `[db.updateSalesOrderStatus] Processing bundle sale: ID=${item.bundle_id}, Qty=${item.quantity}, Context with LocID=${storeLocationId}`
            );
            deductionResult = await db.processBundleSale(
              item.bundle_id,
              item.quantity,
              bundleSaleContext
            );
          }

          if (!deductionResult || !deductionResult.success) {
            // This should ideally not happen if pre-validation was correct, but as a safeguard:
            const productName =
              item.item_snapshot_name ||
              (item.item_id
                ? `Item ID ${item.item_id}`
                : `Bundle ID ${item.bundle_id}`);
            console.error(
              `[db.updateSalesOrderStatus] STOCK DEDUCTION FAILED (POST-VALIDATION) for ${productName} in order ${orderId}. Error: ${deductionResult?.message}. THIS INDICATES A POTENTIAL RACE CONDITION OR LOGIC FLAW.`
            );
            throw new Error(
              `Critical error: Stock deduction failed for ${productName} after validation. Fulfillment incomplete. Error: ${deductionResult?.message}`
            );
          }
        }
        console.log(
          `[db.updateSalesOrderStatus] Stock deductions complete for order ${orderId}.`
        );
      }

      // Update order status in DB
      const { data: updatedOrder, error } = await supabase
        .from("sales_orders")
        .update({ status: newStatus, updated_at: new Date() })
        .eq("id", orderId)
        .select()
        .single();

      if (error) throw error;
      return {
        success: true,
        order: updatedOrder,
        message: `Sales Order status updated to ${newStatus}.`,
      };
    } catch (error) {
      console.error("[db.updateSalesOrderStatus] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to update sales order status.",
      };
    }
  },

  // Function to generate a unique (enough) order number - can be improved
  async generateOrderNumber() {
    const date = new Date();
    const prefix = `SO-${date.getFullYear()}${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}-`;
    // This is a simple sequence, for high concurrency a DB sequence or UUID is better
    const { count, error } = await supabase
      .from("sales_orders")
      .select("*", { count: "exact", head: true });
    if (error) return prefix + "ERR";
    return prefix + (count + 1).toString().padStart(4, "0");
  },
  // --- NEW STOCK TRANSFER FUNCTION ---
  async createStockTransferAndAdjustInventory(transferDetails) {
    // transferDetails: { itemId, quantityTransferred, sourceLocationId, destinationLocationId,
    //                    sourceLocationName, destinationLocationName, notes, referenceNumber, userId, usernameSnapshot }
    if (!supabase)
      return { success: false, message: "Database client not initialized." };

    console.log(
      "[db.createStockTransferAndAdjustInventory] Details:",
      transferDetails
    );

    try {
      // 1. Validate stock at source location
      //    Fetch current quantity of the item AT THE SOURCE LOCATION
      const { data: sourceStock, error: sourceStockError } = await supabase
        .from("item_location_quantities")
        .select("quantity")
        .eq("item_id", transferDetails.itemId)
        .eq("location_id", transferDetails.sourceLocationId)
        .single();

      if (sourceStockError && sourceStockError.code !== "PGRST116") {
        // PGRST116 is " esattamente una riga attesa" (exactly one row expected) - means no stock record yet
        throw sourceStockError;
      }
      const currentQtyAtSource = sourceStock ? sourceStock.quantity : 0;

      if (currentQtyAtSource < transferDetails.quantityTransferred) {
        return {
          success: false,
          message: `Insufficient stock at ${transferDetails.sourceLocationName}. Available: ${currentQtyAtSource}, Trying to transfer: ${transferDetails.quantityTransferred}`,
        };
      }

      // 2. Create the stock_transfers record
      const { data: newTransfer, error: transferError } = await supabase
        .from("stock_transfers")
        .insert([
          {
            item_id: transferDetails.itemId,
            quantity_transferred: transferDetails.quantityTransferred,
            // Store location IDs if your stock_transfers table uses IDs. If names, use names.
            // Assuming stock_transfers.source_location and .destination_location store NAMES for readability in that table.
            // If they store IDs, use transferDetails.sourceLocationId and transferDetails.destinationLocationId
            source_location: transferDetails.sourceLocationName,
            destination_location: transferDetails.destinationLocationName,
            notes: transferDetails.notes,
            reference_number:
              transferDetails.referenceNumber || `TR-${Date.now()}`,
            processed_by_user_id: transferDetails.userId,
            username_snapshot: transferDetails.usernameSnapshot,
          },
        ])
        .select()
        .single();

      if (transferError) throw transferError;
      if (!newTransfer)
        throw new Error("Stock transfer record creation failed.");

      // 3.a. Deduct from source location
      const deductionContext = {
        transactionType: "STOCK_TRANSFER_OUT",
        referenceId: String(newTransfer.id),
        referenceType: "STOCK_TRANSFER",
        userId: transferDetails.userId,
        usernameSnapshot: transferDetails.usernameSnapshot,
        notes: `Transfer Out to ${transferDetails.destinationLocationName}. Ref ID: ${newTransfer.id}`,
      };
      const deductionResult = await db.adjustStockQuantity(
        transferDetails.itemId,
        transferDetails.sourceLocationId, // Use sourceLocationId
        -Math.abs(transferDetails.quantityTransferred),
        deductionContext
      );
      if (!deductionResult.success) {
        /* ... error handling ... */ throw new Error(
          `Deduction failed: ${deductionResult.message}`
        );
      }

      // 3.b. Add to destination location
      // The item's master record in 'items' table is NOT changed for its 'location'
      const additionContext = {
        transactionType: "STOCK_TRANSFER_IN",
        referenceId: String(newTransfer.id),
        referenceType: "STOCK_TRANSFER",
        userId: transferDetails.userId,
        usernameSnapshot: transferDetails.usernameSnapshot,
        notes: `Transfer In from ${transferDetails.sourceLocationName}. Ref ID: ${newTransfer.id}`,
      };
      const additionResult = await db.adjustStockQuantity(
        transferDetails.itemId,
        transferDetails.destinationLocationId, // Use destinationLocationId
        Math.abs(transferDetails.quantityTransferred),
        additionContext
      );
      if (!additionResult.success) {
        /* ... error handling ... */ throw new Error(
          `Addition failed: ${additionResult.message}`
        );
      }

      return {
        success: true,
        transfer: newTransfer,
        message: "Stock transferred successfully.",
      };
    } catch (error) {
      console.error("[db.createStockTransferAndAdjustInventory] Error:", error);
      return {
        success: false,
        message: error.message || "Failed to process stock transfer.",
      };
    }
  },

  async getStockTransfers(filters = {}) {
    if (!supabase)
      return Promise.reject(new Error("Supabase client not initialized."));
    try {
      let query = supabase
        .from("stock_transfers")
        .select(
          `
*,
item:items (id, name, sku),
user:users (id, username)
`
        )
        .order("transfer_date", { ascending: false });

      // Add filters if needed (e.g., by date, item, locations)
      if (filters.itemId) query = query.eq("item_id", filters.itemId);

      const { data, error } = await query.limit(filters.limit || 50);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("[db.getStockTransfers] Error:", error);
      throw error;
    }
  },

  async archiveItem(itemId, archiveStatus = true) {
    // New function, archiveStatus defaults to true
    if (!supabase)
      return { success: false, message: "Database client not initialized." };
    try {
      const { data, error } = await supabase
        .from("items")
        .update({ is_archived: archiveStatus, updated_at: new Date() }) // Set is_archived and update timestamp
        .eq("id", itemId)
        .select() // Optionally select the updated item back
        .single(); // Expecting a single item

      if (error) {
        console.error(
          `Error ${
            archiveStatus ? "archiving" : "unarchiving"
          } item in Supabase:`,
          error
        );
        throw error;
      }
      return {
        success: true,
        item: data,
        message: `Item ${
          archiveStatus ? "archived" : "unarchived"
        } successfully.`,
      };
    } catch (error) {
      console.error(`Error in archiveItem (ID: ${itemId}):`, error);
      return {
        success: false,
        message:
          error.message ||
          `Failed to ${archiveStatus ? "archive" : "unarchive"} item.`,
      };
    }
  },
  async getInventoryByStorageLocation() {
    if (!supabase)
      return {
        success: false,
        message: "Database client not initialized.",
        data: [],
      };
    try {
      const { data, error } = await supabase.rpc(
        "get_inventory_summary_by_storage"
      );
      if (error) {
        console.error("[db.getInventoryByStorageLocation] RPC error:", error);
        return {
          success: false,
          message: error.message || "RPC error fetching storage summary.",
          data: [],
        };
      }
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("[db.getInventoryByStorageLocation] General error:", error);
      return {
        success: false,
        message: error.message || "Failed to get storage breakdown.",
        data: [],
      };
    }
  },

  // --- NEW ANALYTICS DB FUNCTIONS ---

  async getSalesSummary(period = "last30days") {
    if (!supabase)
      return { success: false, message: "DB client not init.", summary: null };
    try {
      const { startDate, endDate } = getDateRange(period);

      // Fetch fulfilled orders within the period
      const { data, error } = await supabase
        .from("sales_orders")
        .select("total_amount")
        .eq("status", "Fulfilled")
        .gte("order_date", startDate) // Assuming order_date reflects the sale date
        .lte("order_date", endDate);

      if (error) throw error;

      const numberOfOrders = data ? data.length : 0;
      const totalSalesValue = (data || []).reduce(
        (sum, order) => sum + (Number(order.total_amount) || 0),
        0
      );
      const averageOrderValue =
        numberOfOrders > 0 ? totalSalesValue / numberOfOrders : 0;

      return {
        success: true,
        summary: {
          totalSalesValue,
          numberOfOrders,
          averageOrderValue,
        },
      };
    } catch (error) {
      console.error("[db.getSalesSummary] Error:", error);
      return { success: false, message: error.message, summary: null };
    }
  },

  async getTopSellingItems(period = "last30days", limit = 5) {
    if (!supabase)
      return { success: false, message: "DB client not init.", items: [] };
    try {
      const { startDate, endDate } = getDateRange(period);

      // This query is a bit more complex as it needs to sum quantities from sales_order_items
      // and join with items/bundles. An RPC would be more efficient.
      // Simplified version: Sum quantities and values from sales_order_items.
      // You'll need to enhance this to get item/bundle names.

      // Fetch fulfilled sales order IDs within the period
      const { data: fulfilledOrders, error: orderError } = await supabase
        .from("sales_orders")
        .select("id")
        .eq("status", "Fulfilled")
        .gte("order_date", startDate)
        .lte("order_date", endDate);

      if (orderError) throw orderError;
      if (!fulfilledOrders || fulfilledOrders.length === 0) {
        return { success: true, items: [] }; // No fulfilled orders, so no top items
      }

      const fulfilledOrderIds = fulfilledOrders.map((o) => o.id);

      const { data: topItems, error: rpcError } = await supabase.rpc(
        "get_top_selling_products_rpc",
        {
          start_date_param: startDate,
          end_date_param: endDate,
          result_limit: limit,
        }
      );

      if (rpcError) {
        console.error("[db.getTopSellingItems] RPC Error:", rpcError);
        throw rpcError;
      }

      return { success: true, items: topItems || [] };
    } catch (error) {
      console.error("[db.getTopSellingItems] Error:", error);
      return { success: false, message: error.message, items: [] };
    }
  },

  async getSalesByStatus(period = "last30days") {
    if (!supabase)
      return { success: false, message: "DB client not init.", data: [] };
    try {
      const { startDate, endDate } = getDateRange(period);

      const { data, error } = await supabase.rpc(
        "get_sales_summary_by_status_rpc",
        {
          start_date_param: startDate,
          end_date_param: endDate,
        }
      );

      if (error) {
        console.error("[db.getSalesByStatus] RPC Error:", error);
        throw error;
      }
      // The RPC directly returns data in [{status: 'X', count: N}, ...] format
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("[db.getSalesByStatus] Error:", error);
      return { success: false, message: error.message, data: [] };
    }
  },
  async getStoreLocationId() {
    if (!supabase) {
      console.error("[db.getStoreLocationId] Supabase client not initialized.");
      return null; // Or throw an error
    }
    try {
      // Assuming your main store location is named 'STORE'
      // Make sure this name matches exactly what's in your 'storage_locations' table.
      const storeLocationName = "STORE";

      const { data, error } = await supabase
        .from("storage_locations")
        .select("id")
        .eq("name", storeLocationName) // Case-sensitive match by default
        .eq("is_active", true) // Ensure the store location is active
        .single(); // Expect only one 'STORE' location

      if (error) {
        // PGRST116 means "exactly one row expected, but 0 or more than 1 were found"
        // If 0 rows, it means 'STORE' location doesn't exist or isn't active.
        if (error.code === "PGRST116") {
          console.warn(
            `[db.getStoreLocationId] Active storage location named "${storeLocationName}" not found.`
          );
          return null;
        }
        // For other errors
        console.error(
          `[db.getStoreLocationId] Error fetching ID for location "${storeLocationName}":`,
          error
        );
        throw error; // Re-throw other errors
      }

      if (!data) {
        console.warn(
          `[db.getStoreLocationId] Active storage location named "${storeLocationName}" not found (data is null).`
        );
        return null;
      }

      console.log(
        `[db.getStoreLocationId] Found ID for "${storeLocationName}": ${data.id}`
      );
      return data.id;
    } catch (err) {
      console.error("[db.getStoreLocationId] Unexpected error:", err);
      return null; // Return null on unexpected errors
    }
  },

  async getStorageLocations() {
    if (!supabase)
      return {
        success: false,
        message: "Database client not initialized.",
        locations: [],
      };
    try {
      const { data, error } = await supabase
        .from("storage_locations")
        .select("id, name, description")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return { success: true, locations: data || [] };
    } catch (error) {
      console.error("[db.getStorageLocations] Error:", error);
      return { success: false, message: error.message, locations: [] };
    }
  },

  async getDetailedStockReport(filters = {}) {
    // filters: { category, locationId, itemId, lowStockOnly (boolean) }
    if (!supabase)
      return { success: false, message: "DB client not init.", data: [] };
    try {
      // This will call the RPC we defined for the ReportsPage, it's reusable.
      // If you haven't created it yet, refer to the previous response for its SQL.
      // Ensure get_current_stock_report_data can handle all these filters.
      // For simplicity, let's assume it takes category and locationId for now.
      // We can enhance the RPC later if needed for itemId or lowStockOnly.

      // For now, let's make a direct query here if the RPC is too specific
      // This query is similar to the RPC 'get_current_stock_report_data'
      let query = supabase
        .from("items")
        .select(
          `
                     id, sku, name, variant, category, cost_price, low_stock_threshold,
                     item_location_quantities!inner (
                         quantity,
                         storage_locations!inner (id, name)
                     )
                 `
        )
        .eq("is_archived", false);

      if (filters.category) {
        query = query.eq("category", filters.category);
      }
      if (filters.locationId) {
        query = query.eq(
          "item_location_quantities.location_id",
          filters.locationId
        );
      }
      if (filters.itemId) {
        query = query.eq("id", filters.itemId);
      }
      // For lowStockOnly, we might need a more complex query or post-filtering
      // if comparing against item.low_stock_threshold vs item_location_quantities.quantity

      const { data, error } = await query
        .order("name")
        .order("name", {
          foreignTable: "item_location_quantities.storage_locations",
        });

      if (error) throw error;

      // Transform data to a flat structure suitable for table display
      const flatData = [];
      (data || []).forEach((item) => {
        if (
          item.item_location_quantities &&
          item.item_location_quantities.length > 0
        ) {
          item.item_location_quantities.forEach((ilq) => {
            if (
              filters.lowStockOnly &&
              ilq.quantity >= (item.low_stock_threshold || 0)
            ) {
              // Skip if not low stock and filter is active
            } else {
              flatData.push({
                item_id: item.id,
                sku: item.sku,
                item_name: item.name,
                variant: item.variant,
                category: item.category,
                location_id: ilq.storage_locations.id,
                location_name: ilq.storage_locations.name,
                quantity_at_location: ilq.quantity,
                cost_price: item.cost_price,
                stock_value_at_location: ilq.quantity * (item.cost_price || 0),
                low_stock_threshold: item.low_stock_threshold,
              });
            }
          });
        } else if (!filters.locationId && !filters.lowStockOnly) {
          // Show items with no stock records if no location filter
          flatData.push({
            item_id: item.id,
            sku: item.sku,
            item_name: item.name,
            variant: item.variant,
            category: item.category,
            location_id: null,
            location_name: "N/A (No Stock Records)",
            quantity_at_location: 0,
            cost_price: item.cost_price,
            stock_value_at_location: 0,
            low_stock_threshold: item.low_stock_threshold,
          });
        }
      });

      return { success: true, data: flatData };
    } catch (error) {
      console.error("[db.getDetailedStockReport] Error:", error);
      return { success: false, message: error.message, data: [] };
    }
  },

  async getSalesDetailReport(filters = {}) {
          if (!supabase) {
              console.error("[db.getSalesDetailReport] Supabase client not initialized.");
              return { success: false, message: "Database client not initialized.", data: [] };
          }

          const period = filters.period || 'last30days'; // Default if not provided
          console.log(`[db.getSalesDetailReport] Attempting to fetch for period: ${period}`);

          try {
              const { startDate, endDate } = getDateRange(period); // Uses the PHT-aware function
              console.log(`[db.getSalesDetailReport] Using PHT-aligned date range for Supabase query - Start: ${startDate}, End: ${endDate}`);

              let query = supabase
                  .from('sales_order_items') // Querying the line items table
                  .select(`
                      id,
                      item_snapshot_name,
                      item_snapshot_sku,
                      quantity,
                      unit_price,
                      line_total,
                      sales_orders!inner (
                          id,
                          order_number,
                          order_date,
                          status,
                          customer:customers (id, full_name)
                      ),
                      item:items (id, name, category),
                      bundle:bundles (id, name)
                  `)
                  // Filter by order_date from the joined sales_orders table
                  .gte('sales_orders.order_date', startDate)
                  .lte('sales_orders.order_date', endDate);

              // Optional: If you only want 'Fulfilled' sales in this detail report
              // query = query.eq('sales_orders.status', 'Fulfilled');

              // Apply additional filters if provided
              if (filters.customerId) {
                  query = query.eq('sales_orders.customer_id', filters.customerId);
                  console.log(`[db.getSalesDetailReport] Applied filter - Customer ID: ${filters.customerId}`);
              }
              if (filters.itemId) {
                  query = query.eq('item_id', filters.itemId); // Assumes item_id is directly on sales_order_items
                  console.log(`[db.getSalesDetailReport] Applied filter - Item ID: ${filters.itemId}`);
              }
              if (filters.bundleId) {
                  query = query.eq('bundle_id', filters.bundleId); // Assumes bundle_id is directly on sales_order_items
                  console.log(`[db.getSalesDetailReport] Applied filter - Bundle ID: ${filters.bundleId}`);
              }

              // Order the results
              query = query.order('order_date', { foreignTable: 'sales_orders', ascending: false })
                           .order('id', { ascending: false }); // Secondary sort for consistent order of items within the same order date

              const { data, error } = await query;

              if (error) {
                  console.error('[db.getSalesDetailReport] Supabase Query Error:', error);
                  return { success: false, message: `Database Query Error: ${error.message}`, data: [] };
              }

              console.log(`[db.getSalesDetailReport] Successfully fetched ${data ? data.length : 0} sales detail records.`);
              // If you want to see a sample of the data for debugging:
              // if (data && data.length > 0) {
              //     console.log('[db.getSalesDetailReport] Sample of fetched data:', JSON.stringify(data.slice(0, 2), null, 2));
              // }

              return { success: true, data: data || [] };

          } catch (error) { // Catch any other unexpected errors (e.g., from getDateRange if it threw)
              console.error('[db.getSalesDetailReport] Unexpected error in function execution:', error);
              return { success: false, message: `Unexpected Error: ${error.message}`, data: [] };
          }
      },


  //export
  async getAllItemsForExport() {
      if (!supabase) {
        return Promise.reject(new Error("Supabase client not initialized."));
      }
      try {
        // This query will fetch each item for each location it exists in,
        // along with its quantity at that location.
        const { data, error } = await supabase
          .from('item_location_quantities') // Start from the junction table
          .select(`
            quantity,
            item:items!inner (
              id, sku, name, variant, description, category, cost_price, status, is_archived, low_stock_threshold, created_at, updated_at
            ),
            location:storage_locations!inner (
              id, name, description, is_active
            )
          `)
          // Optionally, filter out archived items or inactive locations if needed for this export
          // .eq('item.is_archived', false)
          // .eq('location.is_active', true)
          .order('name', { foreignTable: 'items', ascending: true })
          .order('name', { foreignTable: 'location', ascending: true });

        if (error) {
          console.error("[db.getAllItemsForExport] Supabase error:", error);
          throw error;
        }

        // Transform the data into a flatter structure suitable for CSV/XLSX
        // Each row in the export will represent an item at a specific location.
        const flatData = (data || []).map(record => ({
          item_id: record.item.id,
          sku: record.item.sku,
          item_name: record.item.name,
          variant: record.item.variant,
          description: record.item.description,
          category: record.item.category,
          cost_price: record.item.cost_price,
          item_status: record.item.status, // Renamed to avoid conflict with location status if any
          is_archived: record.item.is_archived,
          low_stock_threshold: record.item.low_stock_threshold,
          item_created_at: record.item.created_at,
          item_updated_at: record.item.updated_at,
          location_id: record.location.id,
          location_name: record.location.name,
          location_description: record.location.description,
          location_is_active: record.location.is_active,
          quantity_at_location: record.quantity
        }));

        console.log(`[db.getAllItemsForExport] Fetched and transformed ${flatData.length} item-location records for export.`);
        return flatData; // Ensure an array is always returned

      } catch (error) {
        console.error("[db.getAllItemsForExport] Error fetching items for export:", error);
        throw error; // Re-throw to be caught by the caller in main.js
      }
    },
    async getInventoryValuationReportData(filters = {}) {
            if (!supabase) return { success: false, message: "DB client not init.", data: [] };
            try {
                const { data, error } = await supabase.rpc('get_inventory_valuation_report', {
                    p_category: filters.category || null,
                    p_location_id: filters.locationId || null
                });
                if (error) throw error;
                return { success: true, data: data || [] };
            } catch (error) {
                console.error('[db.getInventoryValuationReportData] Error:', error);
                return { success: false, message: error.message, data: [] };
            }
        },

        async getSalesPerformanceReportData(period = 'last30days', topItemsLimit = 10) {
            if (!supabase) return { success: false, message: "DB client not init.", data: {} };
            try {
                const { startDate, endDate } = getDateRange(period);

                const [summaryRes, topItemsRes, byCategoryRes] = await Promise.all([
                    supabase.rpc('get_sales_summary_kpis', {
                        start_date_param: startDate,
                        end_date_param: endDate
                    }),
                    supabase.rpc('get_top_selling_products_for_report', { // Use the new/updated RPC
                        start_date_param: startDate,
                        end_date_param: endDate,
                        result_limit: topItemsLimit
                    }),
                    supabase.rpc('get_item_sales_by_category_for_period', {
                        start_date_param: startDate,
                        end_date_param: endDate
                    })
                ]);

                if (summaryRes.error) throw new Error(`Sales Summary KPIs Error: ${summaryRes.error.message}`);
                if (topItemsRes.error) throw new Error(`Top Selling Items Error: ${topItemsRes.error.message}`);
                if (byCategoryRes.error) throw new Error(`Sales By Category Error: ${byCategoryRes.error.message}`);

                return {
                    success: true,
                    data: {
                        summary: (summaryRes.data && summaryRes.data[0]) ? summaryRes.data[0] : { total_sales_value: 0, number_of_orders: 0, average_order_value: 0, total_items_sold: 0 },
                        topItems: topItemsRes.data || [],
                        salesByCategory: byCategoryRes.data || []
                    }
                };
            } catch (error) {
                console.error('[db.getSalesPerformanceReportData] Error:', error);
                return { success: false, message: error.message, data: {} };
            }
        },



  // ... (rest of your db object)

  // --- END SALES ORDER FUNCTIONS ---
};