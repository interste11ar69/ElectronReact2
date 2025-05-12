// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt'; // ESSENTIAL for custom password hashing and comparison

// Initialize the Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase;

// Console logs for debugging initialization
console.log('[supabaseClient] Initializing for custom auth...');
console.log('[supabaseClient] REACT_APP_SUPABASE_URL:', supabaseUrl ? 'SET' : 'NOT SET - CRITICAL ERROR IF THIS PERSISTS');
console.log('[supabaseClient] REACT_APP_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'SET' : 'NOT SET - CRITICAL ERROR IF THIS PERSISTS');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabaseClient] CRITICAL: Missing Supabase environment variables. Supabase client will NOT be initialized. Check .env file and main.js for dotenv.config() at the top.');
  // supabase remains undefined
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    if (supabase) {
      console.log('[supabaseClient] Supabase client instance CREATED successfully for DB operations.');
    } else {
      // This case should ideally not happen if createClient is called with valid params and doesn't throw
      console.error('[supabaseClient] CRITICAL: createClient returned null or undefined, even though URL/Key were provided.');
      supabase = undefined; // Ensure it's explicitly undefined
    }
  } catch (e) {
    console.error('[supabaseClient] CRITICAL: Error during Supabase createClient call:', e);
    supabase = undefined; // Ensure it's undefined on error
  }
}

// Export the raw client if needed for direct use, though 'db' object is preferred
export { supabase };

export const db = {
  // --- CUSTOM AUTHENTICATION ---
  async login(username, password) {
    // Guard clause: Check if Supabase client is initialized
    if (!supabase) {
      console.error('[db.login] Supabase client is not initialized. Cannot proceed with login.');
      // Return a user-friendly message and log details for developers
      return { success: false, message: 'Login service is currently unavailable. Please try again later or contact support.' };
    }

    try {
      console.log(`[db.login] Attempting to find user in 'users' table: ${username}`);
      const { data: userData, error: queryError } = await supabase
        .from('users') // Your custom users table
        .select('id, username, password_hash, role') // Select only necessary fields
        .eq('username', username)
        .maybeSingle(); // Allows 0 or 1 row; returns null if 0 rows, no error for that case

      if (queryError) {
        console.error('[db.login] Supabase query error while fetching user:', queryError);
        // Provide a more generic error message to the user for security
        return { success: false, message: 'An error occurred during login. Please try again.' };
      }

      if (!userData) {
        console.log(`[db.login] User not found: ${username}`);
        return { success: false, message: 'Invalid username or password.' }; // Generic message for security
      }

      console.log(`[db.login] User found: ${userData.username}. Verifying password...`);
      // Ensure userData.password_hash exists before trying to compare
      if (!userData.password_hash) {
          console.error(`[db.login] Password hash is missing for user: ${userData.username}. Account may be misconfigured.`);
          return { success: false, message: 'Account configuration issue. Please contact support.' };
      }

      const isValid = await bcrypt.compare(password, userData.password_hash);
      if (!isValid) {
        console.log(`[db.login] Password mismatch for user: ${userData.username}`);
        return { success: false, message: 'Invalid username or password.' }; // Generic message
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
    } catch (error) { // Catch unexpected errors during the bcrypt or other operations
      console.error('[db.login] Unexpected error during login process:', error);
      return { success: false, message: 'An unexpected server error occurred. Please try again.' , details: error.message };
    }
  },

  // For custom auth, getCurrentUser and logout are managed by the application state
  // (e.g., a variable in Electron main.js and React's App.js state).
  // These are NOT Supabase Auth functions. The IPC handlers in main.js will manage this.

  // --- ITEM MANAGEMENT FUNCTIONS ---
  async getItems(filters = {}) { // filters can now include sortBy and sortOrder
          if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
          try {
              let query = supabase.from('items').select('*');

              // Apply existing filters
              if (filters.category) query = query.eq('category', filters.category);
              if (filters.storageLocation) query = query.eq('storage_location', filters.storageLocation);
              if (filters.searchTerm) query = query.or(`name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`);

              // --- ADD SORTING LOGIC ---
              const sortBy = filters.sortBy || 'created_at'; // Default sort column
              const sortOrderAsc = filters.sortOrder === 'asc'; // Default to 'desc' if not 'asc'

              query = query.order(sortBy, { ascending: sortOrderAsc });
              // --- END SORTING LOGIC ---

              const { data, error } = await query;
              if (error) {
                  console.error('[db.getItems] Supabase error:', error);
                  throw error;
              }
              return data || [];
          } catch (error) {
              console.error('[db.getItems] General error:', error);
              // Rethrow or return a structured error for the main process to handle
              // For consistency, let's assume main process will catch and structure it.
              throw error;
          }
      },
  async getItemById(id) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
     try {
      const { data, error } = await supabase.from('items').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error in getItemById:', error);
      throw error;
    }
  },
  async createItem(itemData) {
    if (!supabase) return { success: false, message: "Database client not initialized." }; // Return structured error
    try {
      const dataToInsert = {
        ...itemData, // Spread all provided itemData
        // Ensure type conversions and defaults for fields that might be problematic if not set
        cost_price: parseFloat(itemData.cost_price) || 0,
        quantity: parseInt(itemData.quantity, 10) || 0,
        category: itemData.category || 'Uncategorized',
        storage_location: itemData.storage_location || 'Main Warehouse', // Make sure this matches ProductFormPage
        status: itemData.status || 'Normal',
        // Add defaults for any other NOT NULL columns in your DB 'items' table
      };
      const { data, error } = await supabase.from('items').insert([dataToInsert]).select().single();
      if (error) {
        console.error('Error creating item in Supabase:', error);
        throw error; // Let it be caught by the outer catch or IPC handler
      }
      return { success: true, item: data };
    } catch (error) {
      console.error('Error in createItem:', error);
      return { success: false, message: error.message || "Failed to create item." };
    }
  },
  async updateItem(id, itemData) { // id is separate, itemData is the object of fields to update
    if (!supabase) return { success: false, message: "Database client not initialized." };
     try {
      // Prepare data, ensuring types are correct and id is not in the update payload
      const dataToUpdate = { ...itemData };
      if (dataToUpdate.cost_price !== undefined) dataToUpdate.cost_price = parseFloat(dataToUpdate.cost_price) || 0;
      if (dataToUpdate.quantity !== undefined) dataToUpdate.quantity = parseInt(dataToUpdate.quantity, 10) || 0;
      delete dataToUpdate.id; // Ensure 'id' is not part of the payload to supabase.update()

      const { data, error } = await supabase.from('items').update(dataToUpdate).eq('id', id).select().single();
      if (error) {
        console.error('Error updating item in Supabase:', error);
        throw error;
      }
      return { success: true, item: data };
    } catch (error) {
      console.error('Error in updateItem:', error);
      return { success: false, message: error.message || "Failed to update item." };
    }
  },
   async deleteItem(id) {
    if (!supabase) return { success: false, message: "Database client not initialized." };
    try {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) throw error;
      return { success: true, message: 'Item deleted successfully.' };
    } catch (error) {
      console.error('Error in deleteItem:', error);
      return { success: false, message: error.message || "Failed to delete item." };
    }
  },

  // --- ANALYTICS FUNCTIONS ---
 async getInventorySummary() {
         if (!supabase) return { success: false, message: "Database client not initialized.", summary: null };
         try {
             const { data, error, count } = await supabase
                 .from('items')
                 .select('quantity, cost_price', { count: 'exact' }); // Get total item count efficiently

             if (error) throw error;

             const summaryData = (data || []).reduce((acc, item) => {
                 acc.totalQuantity += (Number(item.quantity) || 0);
                 acc.totalValue += ((Number(item.quantity) || 0) * (Number(item.cost_price) || 0));
                 return acc;
             }, { totalQuantity: 0, totalValue: 0 });

             return {
                 success: true,
                 summary: {
                     totalUniqueItems: count || 0, // Total distinct item entries
                     totalStockQuantity: summaryData.totalQuantity,
                     estimatedTotalValue: summaryData.totalValue
                 }
             };
         } catch (error) {
             console.error('[db.getInventorySummary] Error:', error);
             return { success: false, message: error.message || "Failed to get summary.", summary: null };
         }
     },

     // getLowStockItems: Stays the same.
     async getLowStockItems(threshold = 10) {
         if (!supabase) return { success: false, message: "Database client not initialized.", items: [] };
         try {
             const { data, error } = await supabase
                 .from('items')
                 .select('id, name, sku, quantity, category') // Select a few more useful fields
                 .lt('quantity', threshold)
                 .order('quantity', { ascending: true }); // Show lowest first

             if (error) throw error;
             return { success: true, items: data || [] };
         } catch (error) {
             console.error('[db.getLowStockItems] Error:', error);
             return { success: false, message: error.message || "Failed to get low stock items.", items: [] };
         }
     },

     // NEW: Get inventory breakdown by category
     async getInventoryByCategory() {
         if (!supabase) return { success: false, message: "Database client not initialized.", data: [] };
         try {
             // This requires a custom SQL query or multiple queries if Supabase JS client doesn't directly support complex GROUP BY with SUM
             // For simplicity with JS client, we can fetch relevant data and aggregate, or use an RPC.
             // Let's use an RPC for efficiency. (See Step 1.1 below to create it in SQL)

             const { data, error } = await supabase.rpc('get_inventory_summary_by_category');

             if (error) {
                 console.error('[db.getInventoryByCategory] RPC error:', error);
                 throw error;
             }
             return { success: true, data: data || [] };
         } catch (error) {
             console.error('[db.getInventoryByCategory] Error:', error);
             return { success: false, message: error.message || "Failed to get category breakdown.", data: [] };
         }
     },

     // NEW: Get inventory breakdown by storage location
     async getInventoryByStorageLocation() {
         if (!supabase) return { success: false, message: "Database client not initialized.", data: [] };
         try {
             // Create RPC: get_inventory_summary_by_storage (See Step 1.1 below)
             const { data, error } = await supabase.rpc('get_inventory_summary_by_storage');

             if (error) {
                 console.error('[db.getInventoryByStorageLocation] RPC error:', error);
                 throw error;
             }
             return { success: true, data: data || [] };
         } catch (error) {
             console.error('[db.getInventoryByStorageLocation] Error:', error);
             return { success: false, message: error.message || "Failed to get storage breakdown.", data: [] };
         }
     },

     // Placeholder for sales-related analytics (requires sales data)
     async getTodaysSalesTotal() {
         // In a real app, query a 'sales' or 'orders' table for today's date
         if (!supabase) return { success: false, message: "Database client not initialized.", total: 0 };
         console.warn("[db.getTodaysSalesTotal] This is a placeholder. Sales data table needed.");
         // Simulate for now
         return { success: true, total: Math.floor(Math.random() * 20000) + 5000 }; // Random sales
     },

     async getNewOrdersCount() {
         // In a real app, query 'sales' or 'orders' for new/unprocessed orders
         if (!supabase) return { success: false, message: "Database client not initialized.", count: 0 };
         console.warn("[db.getNewOrdersCount] This is a placeholder. Orders/Sales data table needed.");
         // Simulate for now
         return { success: true, count: Math.floor(Math.random() * 30) }; // Random count
     },

     async getTopSellingProductsByQuantity(limit = 5, dateRange = null) {
         // Requires a 'sales_items' table or similar, joining with 'items'
         // and aggregating quantity sold.
         if (!supabase) return { success: false, message: "Database client not initialized.", products: [] };
         console.warn("[db.getTopSellingProductsByQuantity] This is a placeholder. Sales data table needed.");
         // Simulate for now - returning top N most stocked items as a proxy
          try {
             const { data, error } = await supabase
                 .from('items')
                 .select('name, category, quantity')
                 .order('quantity', { ascending: false })
                 .limit(limit);
             if (error) throw error;
             // This isn't "top selling" but "most stocked", adapt chart label accordingly
             return { success: true, products: data || [], isProxyData: true, proxyType: "Most Stocked" };
         } catch (error) {
             return { success: false, message: error.message, products: [] };
         }
     },
  // --- CUSTOMER MANAGEMENT FUNCTIONS ---
    async getCustomers(filters = {}) {
      if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
      try {
        let query = supabase.from('customers').select('*').order('created_at', { ascending: false }); // Default order

        // Example filters (customize as needed)
        if (filters.searchTerm) {
          query = query.or(`full_name.ilike.%${filters.searchTerm}%,email.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`);
        }
        // Add more filters like by city, etc. if you add those fields

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      } catch (error) {
        console.error('Error in getCustomers:', error);
        throw error;
      }
    },

    async getCustomerById(id) {
      if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
      try {
        const { data, error } = await supabase.from('customers').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error in getCustomerById:', error);
        throw error;
      }
    },

    async createCustomer(customerData) {
      if (!supabase) return { success: false, message: "Database client not initialized." };
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
        const { data, error } = await supabase.from('customers').insert([dataToInsert]).select().single();
        if (error) {
          console.error('Error creating customer in Supabase:', error);
          throw error;
        }
        return { success: true, customer: data };
      } catch (error) {
        console.error('Error in createCustomer:', error);
        return { success: false, message: error.message || "Failed to create customer." };
      }
    },

    async updateCustomer(id, customerData) {
      if (!supabase) return { success: false, message: "Database client not initialized." };
      try {
        const dataToUpdate = { ...customerData };
        delete dataToUpdate.id; // Ensure 'id' is not part of the payload to supabase.update()
        // `updated_at` will be handled by the trigger if you set it up

        const { data, error } = await supabase.from('customers').update(dataToUpdate).eq('id', id).select().single();
        if (error) {
          console.error('Error updating customer in Supabase:', error);
          throw error;
        }
        return { success: true, customer: data };
      } catch (error) {
        console.error('Error in updateCustomer:', error);
        return { success: false, message: error.message || "Failed to update customer." };
      }
    },

    async deleteCustomer(id) {
      if (!supabase) return { success: false, message: "Database client not initialized." };
      try {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
        return { success: true, message: 'Customer deleted successfully.' };
      } catch (error) {
        console.error('Error in deleteCustomer:', error);
        return { success: false, message: error.message || "Failed to delete customer." };
      }
    },
     async getAllItemsForExport() {
            if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
            try {
                // Select the columns you want in your CSV export
                const { data, error } = await supabase
                    .from('items')
                    .select('sku, name, variant, description, category, storage_location, quantity, cost_price, status, created_at, updated_at') // Customize columns as needed
                    .order('name', { ascending: true }); // Optional: order the export

                if (error) throw error;
                console.log(`[db.getAllItemsForExport] Fetched ${data?.length ?? 0} items for export.`);
                return data || []; // Ensure an array is always returned
            } catch (error) {
                console.error('[db.getAllItemsForExport] Error fetching items for export:', error);
                throw error; // Re-throw to be caught by the caller in main.js
            }
        },
        // --- ACTIVITY LOG FUNCTIONS ---
            async addActivityLogEntry(entryData) {
                // entryData should be an object like { user_identifier: '...', action: '...', details: '...' }
                if (!supabase) return { success: false, message: "Database client not initialized." };
                try {
                    const { data, error } = await supabase
                        .from('activity_log')
                        .insert([entryData]) // Insert expects an array of objects
                        .select() // Optionally select the inserted row back
                        .single(); // Assuming you insert one at a time

                    if (error) {
                        console.error('[db.addActivityLogEntry] Supabase insert error:', error);
                        throw error; // Let the caller handle it
                    }
                    // console.log('[db.addActivityLogEntry] Log entry added:', data);
                    return { success: true, entry: data };
                } catch (error) {
                    console.error('[db.addActivityLogEntry] Error:', error);
                    return { success: false, message: error.message || "Failed to add log entry." };
                }
            },

            async getActivityLogEntries(limit = 50) { // Default limit of 50
                if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
                try {
                    const { data, error } = await supabase
                        .from('activity_log')
                        .select('*') // Select all columns
                        .order('created_at', { ascending: false }) // Get newest first
                        .limit(limit); // Limit the number of results

                    if (error) {
                        console.error('[db.getActivityLogEntries] Supabase select error:', error);
                        throw error;
                    }
                    // console.log(`[db.getActivityLogEntries] Fetched ${data?.length ?? 0} log entries.`);
                    return data || []; // Return array or empty array
                } catch (error) {
                    console.error('[db.getActivityLogEntries] Error:', error);
                    throw error; // Re-throw to be caught by the caller
                }
            },
             // --- RETURN FUNCTIONS ---
                async createReturnRecord(returnData) {
                    // returnData should include: item_id, quantity_returned, reason, condition,
                    // Optional: customer_id, notes, processed_by_user_id
                    if (!supabase) return { success: false, message: "Database client not initialized." };
                    try {
                        // We won't set inventory_adjusted here; main.js logic will handle that update separately if needed.
                        const { data, error } = await supabase
                            .from('returns')
                            .insert([returnData])
                            .select() // Select the created record
                            .single();

                        if (error) {
                            console.error('[db.createReturnRecord] Supabase insert error:', error);
                            throw error;
                        }
                        return { success: true, returnRecord: data };
                    } catch (error) {
                        console.error('[db.createReturnRecord] Error:', error);
                        return { success: false, message: error.message || "Failed to create return record." };
                    }
                },

                // Function to specifically increase inventory for a returned item
                // This provides better transaction control than just calling updateItem generically
                async incrementItemQuantity(itemId, quantityToAdd) {
                     if (!supabase) return { success: false, message: "Database client not initialized." };
                     if (!itemId || quantityToAdd <= 0) {
                         return { success: false, message: "Invalid item ID or quantity to add." };
                     }
                    try {
                        // Use Supabase RPC function for atomic increment is BEST PRACTICE
                        // Let's create one in SQL (See Step 2.1 below) and call it here.
                        const { data, error } = await supabase.rpc('increment_item_quantity', {
                            p_item_id: itemId,
                            p_quantity_to_add: quantityToAdd
                        });

                        if (error) {
                            console.error('[db.incrementItemQuantity] Supabase RPC error:', error);
                            throw error;
                        }

                         // The RPC function might return the new quantity or just success
                         console.log(`[db.incrementItemQuantity] RPC call successful for item ${itemId}. Result:`, data);
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
                        console.error('[db.incrementItemQuantity] Error:', error);
                        return { success: false, message: error.message || "Failed to increment item quantity." };
                    }
                },

                // Function to update the return record flag (optional but good practice)
                async markReturnInventoryAdjusted(returnId) {
                     if (!supabase) return { success: false, message: "Database client not initialized." };
                     try {
                         const { error } = await supabase
                            .from('returns')
                            .update({ inventory_adjusted: true })
                            .eq('id', returnId);
                         if (error) throw error;
                         return { success: true };
                     } catch(error) {
                          console.error('[db.markReturnInventoryAdjusted] Error:', error);
                          return { success: false, message: error.message || "Failed to mark return adjusted." };
                     }
                },

                // Function to fetch return records (for a potential history page)
                async getReturnRecords(filters = {}, limit = 50) {
                    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
                    try {
                         let query = supabase
                            .from('returns')
                            // Select specific columns and related data
                            .select(`
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
                            `)
                            .order('created_at', { ascending: false })
                            .limit(limit);

                        // Add filters if needed (e.g., by date range, item_id, customer_id)
                        // if (filters.itemId) query = query.eq('item_id', filters.itemId);
                        // if (filters.customerId) query = query.eq('customer_id', filters.customerId);

                        const { data, error } = await query;

                        if (error) {
                            console.error('[db.getReturnRecords] Supabase select error:', error);
                            throw error;
                        }
                        return data || [];
                    } catch (error) {
                         console.error('[db.getReturnRecords] Error:', error);
                         throw error;
                    }
                },

  // Implement your file processing db functions (processBulkUpdate, importInitialItemsFromFile) here if they interact with Supabase
};