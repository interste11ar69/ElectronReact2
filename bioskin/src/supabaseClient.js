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
async adjustStockQuantity(itemId, adjustmentQty, transactionDetails) {
   console.log(`[db.adjustStockQuantity] Attempting to adjust item ${itemId} by ${adjustmentQty}. Transaction Details:`, JSON.stringify(transactionDetails, null, 2));

   if (!supabase) {
       console.error("[db.adjustStockQuantity] Supabase client not initialized.");
       return { success: false, message: "Database client not initialized." };
   }
   if (itemId === undefined || itemId === null || typeof adjustmentQty !== 'number') { // Stricter check for itemId
       console.error("[db.adjustStockQuantity] Invalid item ID or adjustment quantity. ItemID:", itemId, "AdjustmentQty:", adjustmentQty);
       return { success: false, message: "Invalid item ID or adjustment quantity." };
   }

   // --- MODIFICATION START: Refined validation for transactionType ---
   // Now that main.js maps it, transactionType should always be a non-empty string from TRANSACTION_TYPES
   if (!transactionDetails || !transactionDetails.transactionType || String(transactionDetails.transactionType).trim() === '') {
       console.error("[db.adjustStockQuantity] Validation failed: Transaction type is missing, undefined, or empty. Received type:", transactionDetails?.transactionType);
       return { success: false, message: "A valid internal transaction type is required for stock adjustment." };
   }
   // You could add another check here if transactionDetails.transactionType must be one of your known enum/standard values,
   // though the mapping in main.js should handle that.
   // --- MODIFICATION END: Refined validation for transactionType ---


   try {
       const rpcParams = { // Prepare params clearly
           p_item_id: itemId,
           p_adjustment_qty: adjustmentQty,
           p_transaction_type: transactionDetails.transactionType, // This is now the mapped type
           p_reference_id: transactionDetails.referenceId || null,
           p_reference_type: transactionDetails.referenceType || null,
           p_user_id: transactionDetails.userId || null,
           p_username_snapshot: transactionDetails.usernameSnapshot || null,
           p_notes: transactionDetails.notes || null
       };
       console.log(`[db.adjustStockQuantity] Calling RPC 'adjust_item_quantity' with params:`, rpcParams);


       const { data: newQuantity, error: rpcError } = await supabase.rpc('adjust_item_quantity', rpcParams);

       if (rpcError) {
           console.error('[db.adjustStockQuantity] Supabase RPC error:', rpcError);
           throw rpcError;
       }

       console.log(`[db.adjustStockQuantity] RPC call successful for item ${itemId}. New Quantity:`, newQuantity);
       return { success: true, newQuantity: newQuantity };

   } catch (error) {
       console.error('[db.adjustStockQuantity] Caught error during RPC call or processing:', error);
       return { success: false, message: error.message || "Failed to adjust item quantity via RPC." };
   }
},
// Function to get inventory transactions for an item (for the new page)
   async getInventoryTransactionsForItem(itemId, limit = 50, offset = 0) {
       if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
       try {
           const { data, error, count } = await supabase
               .from('inventory_transactions')
               .select('*', { count: 'exact' })
               .eq('item_id', itemId)
               .order('transaction_date', { ascending: false })
               .order('id', { ascending: false }) // Secondary sort for consistent pagination
               .range(offset, offset + limit - 1);

           if (error) throw error;
           return { transactions: data || [], count: count || 0 };
       } catch (error) {
           console.error(`[db.getInventoryTransactionsForItem] Error fetching transactions for item ${itemId}:`, error);
           throw error;
       }
   },
 async createStockAdjustmentRecord(adjustmentData) {
        // adjustmentData should contain:
        // item_id, user_id (optional), username_snapshot,
        // adjustment_quantity, previous_quantity, new_quantity, reason, notes
        if (!supabase) return { success: false, message: "Database client not initialized." };
        try {
            const { data, error } = await supabase
                .from('stock_adjustments')
                .insert([adjustmentData])
                .select()
                .single();

            if (error) {
                console.error('[db.createStockAdjustmentRecord] Supabase insert error:', error);
                throw error;
            }
            console.log('[db.createStockAdjustmentRecord] Stock adjustment record created:', data);
            return { success: true, record: data };
        } catch (error) {
            console.error('[db.createStockAdjustmentRecord] Error:', error);
            return { success: false, message: error.message || "Failed to create stock adjustment record." };
        }
    },
    // --- BUNDLE MANAGEMENT FUNCTIONS ---
        async createBundle(bundleData) {
            // bundleData: { bundle_sku, name, description, price, is_active, components: [{item_id, quantity_in_bundle}, ...] }
            if (!supabase) return { success: false, message: "Database client not initialized." };
            try {
                // 1. Create the bundle master record
                const { bundle_sku, name, description, price, is_active, components } = bundleData;
                const { data: newBundle, error: bundleError } = await supabase
                    .from('bundles')
                    .insert([{ bundle_sku, name, description, price, is_active }])
                    .select()
                    .single();

                if (bundleError) throw bundleError;
                if (!newBundle) throw new Error("Bundle creation failed to return data.");

                // 2. Create bundle components if provided and successful
                if (components && components.length > 0) {
                    const componentRecords = components.map(comp => ({
                        bundle_id: newBundle.id,
                        item_id: comp.item_id,
                        quantity_in_bundle: comp.quantity_in_bundle
                    }));

                    const { error: componentsError } = await supabase
                        .from('bundle_components')
                        .insert(componentRecords);

                    if (componentsError) {
                        // Potentially rollback bundle creation or log critical error
                        console.error('[db.createBundle] Error inserting components, bundle created but components failed:', componentsError);
                        // For simplicity, we'll report success for bundle but with component error.
                        // A transaction would be better here in a real production system.
                        return { success: true, bundle: newBundle, message: `Bundle '${name}' created, but failed to add components: ${componentsError.message}` };
                    }
                }
                return { success: true, bundle: newBundle, message: `Bundle '${name}' created successfully.` };
            } catch (error) {
                console.error('[db.createBundle] Error:', error);
                return { success: false, message: error.message || "Failed to create bundle." };
            }
        },

        async getBundles(filters = {}) {
            if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
            try {
                // Fetch bundles and their components
                // This is a more complex query to get components nested.
                // For simplicity, we can fetch them separately or use a view/RPC.
                // Let's use an RPC for this to get structured data easily.

                // SQL RPC Function to create (run in Supabase SQL editor):
                /*
                CREATE OR REPLACE FUNCTION get_bundles_with_components()
                RETURNS JSONB
                LANGUAGE sql
                AS $$
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', b.id,
                        'bundle_sku', b.bundle_sku,
                        'name', b.name,
                        'description', b.description,
                        'price', b.price,
                        'is_active', b.is_active,
                        'created_at', b.created_at,
                        'components', (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'item_id', bc.item_id,
                                    'item_name', i.name, -- Assuming items table has 'name'
                                    'item_sku', i.sku,   -- Assuming items table has 'sku'
                                    'quantity_in_bundle', bc.quantity_in_bundle
                                )
                            )
                            FROM bundle_components bc
                            JOIN items i ON i.id = bc.item_id
                            WHERE bc.bundle_id = b.id
                        )
                    )
                )
                FROM bundles b
                WHERE ( ($1::TEXT IS NULL OR b.name ILIKE ('%' || $1 || '%')) OR
                        ($1::TEXT IS NULL OR b.bundle_sku ILIKE ('%' || $1 || '%')) ) -- Example filter for name/SKU
                  AND ( $2::BOOLEAN IS NULL OR b.is_active = $2 ) -- Example filter for is_active
                $$;
                -- Call with: supabase.rpc('get_bundles_with_components', { p_search_term: filters.searchTerm || null, p_is_active: filters.isActive !== undefined ? filters.isActive : null })
                -- Adjust parameters for RPC as needed.
                -- For now, let's do a simpler fetch and handle joining in JS or do separate calls.
                */

                let query = supabase.from('bundles').select('*');
                if (filters.isActive !== undefined) query = query.eq('is_active', filters.isActive);
                if (filters.searchTerm) query = query.or(`name.ilike.%${filters.searchTerm}%,bundle_sku.ilike.%${filters.searchTerm}%`);

                const { data: bundlesData, error } = await query.order('name');
                if (error) throw error;

                // Optionally fetch components for each bundle (N+1 query, consider RPC for production)
                const bundlesWithComponents = [];
                for (const bundle of bundlesData) {
                    const { data: components, error: compError } = await supabase
                        .from('bundle_components')
                        .select('*, item:items(id, name, sku, quantity)') // Fetch item details too
                        .eq('bundle_id', bundle.id);
                    if (compError) console.error(`Error fetching components for bundle ${bundle.id}`, compError);
                    bundlesWithComponents.push({ ...bundle, components: components || [] });
                }

                return bundlesWithComponents;
            } catch (error) {
                console.error('[db.getBundles] Error:', error);
                throw error;
            }
        },

        async getBundleById(id) {
            if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
            try {
                const { data: bundle, error: bundleError } = await supabase
                    .from('bundles')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (bundleError) throw bundleError;
                if (!bundle) return null;

                const { data: components, error: compError } = await supabase
                    .from('bundle_components')
                    .select('*, item:items(id, name, sku, quantity)')
                    .eq('bundle_id', bundle.id);
                if (compError) throw compError;

                return { ...bundle, components: components || [] };
            } catch (error) {
                console.error('[db.getBundleById] Error:', error);
                throw error;
            }
        },

        async updateBundle(bundleId, bundleData) {
            // bundleData: { bundle_sku, name, description, price, is_active, componentsToUpdate: [{item_id, quantity_in_bundle}, ...] }
            if (!supabase) return { success: false, message: "Database client not initialized." };
            try {
                const { bundle_sku, name, description, price, is_active, componentsToUpdate } = bundleData;
                // 1. Update bundle master
                const { data: updatedBundle, error: bundleError } = await supabase
                    .from('bundles')
                    .update({ bundle_sku, name, description, price, is_active, updated_at: new Date() })
                    .eq('id', bundleId)
                    .select()
                    .single();

                if (bundleError) throw bundleError;

                // 2. Update components (more complex: delete existing then re-insert, or smart update)
                // For simplicity, we'll delete all existing components and re-insert.
                // In production, you might want a more nuanced update.
                if (componentsToUpdate) {
                    const { error: deleteError } = await supabase
                        .from('bundle_components')
                        .delete()
                        .eq('bundle_id', bundleId);
                    if (deleteError) throw deleteError;

                    if (componentsToUpdate.length > 0) {
                        const newComponentRecords = componentsToUpdate.map(comp => ({
                            bundle_id: bundleId,
                            item_id: comp.item_id,
                            quantity_in_bundle: comp.quantity_in_bundle
                        }));
                        const { error: insertCompError } = await supabase
                            .from('bundle_components')
                            .insert(newComponentRecords);
                        if (insertCompError) throw insertCompError;
                    }
                }
                return { success: true, bundle: updatedBundle, message: `Bundle '${updatedBundle.name}' updated.` };
            } catch (error) {
                console.error('[db.updateBundle] Error:', error);
                return { success: false, message: error.message || "Failed to update bundle." };
            }
        },

        async deleteBundle(bundleId) {
            if (!supabase) return { success: false, message: "Database client not initialized." };
            try {
                // ON DELETE CASCADE on bundle_components will handle component deletion
                const { error } = await supabase.from('bundles').delete().eq('id', bundleId);
                if (error) throw error;
                return { success: true, message: 'Bundle deleted successfully.' };
            } catch (error) {
                console.error('[db.deleteBundle] Error:', error);
                return { success: false, message: error.message || "Failed to delete bundle." };
            }
        },

        // --- FUNCTION TO PROCESS A BUNDLE SALE (DEDUCT COMPONENTS) ---
         async processBundleSale(bundleId, saleQuantity = 1, saleContext = {}) {
                // saleContext: { salesOrderId, salesOrderNumber, userId, usernameSnapshot }
                if (!supabase) return { success: false, message: "Database client not initialized." };
                try {
                    // 1. Fetch bundle components (including item details like name, sku for logging)
                    const { data: components, error: compError } = await supabase
                        .from('bundle_components')
                        .select('item_id, quantity_in_bundle, item:items(id, name, sku, quantity)')
                        .eq('bundle_id', bundleId);

                    if (compError) throw compError;
                    if (!components || components.length === 0) {
                        return { success: false, message: "Bundle has no components defined or bundle not found." };
                    }

                    // 2. Check if all components have enough stock (as before)
                    // ... (stock check logic remains) ...
                    const stockErrors = [];
                    for (const comp of components) {
                        const requiredQtyForThisSale = comp.quantity_in_bundle * saleQuantity;
                        if (comp.item.quantity < requiredQtyForThisSale) {
                            stockErrors.push(`Not enough stock for component ${comp.item.name} (SKU: ${comp.item.sku}). Required: ${requiredQtyForThisSale}, Available: ${comp.item.quantity}`);
                        }
                    }
                    if (stockErrors.length > 0) {
                        return { success: false, message: "Insufficient stock for bundle components: " + stockErrors.join('; ') };
                    }


                    // 3. Deduct stock for each component
                    const adjustmentResults = [];
                    for (const comp of components) {
                        const quantityToDeduct = comp.quantity_in_bundle * saleQuantity;
                        const componentTransactionDetails = {
                            transactionType: 'BUNDLE_COMPONENT_DEDUCTION', // Or 'SALE_BUNDLE_COMPONENT'
                            referenceId: String(saleContext.salesOrderId || bundleId),
                            referenceType: saleContext.salesOrderId ? 'SALES_ORDER_BUNDLE_ITEM' : 'BUNDLE_SALE_DIRECT', // More specific type
                            userId: saleContext.userId,
                            usernameSnapshot: saleContext.usernameSnapshot,
                            notes: `Component: ${comp.item.name} (SKU: ${comp.item.sku || 'N/A'}) for Bundle ID ${bundleId}. Order Ref: ${saleContext.salesOrderNumber || 'N/A'}`
                        };

                        const result = await db.adjustStockQuantity(comp.item.id, -quantityToDeduct, componentTransactionDetails);
                        adjustmentResults.push({itemId: comp.item.id, ...result});
                    }

                    const failedAdjustments = adjustmentResults.filter(res => !res.success);
                    if (failedAdjustments.length > 0) {
                        // This is a problem state: some components might have been deducted.
                        // A true transaction rollback would be needed for the entire sales order fulfillment.
                        // For now, we report the failure.
                        console.error("[db.processBundleSale] CRITICAL: Some component stock adjustments failed:", failedAdjustments);
                        return { success: false, message: "Error adjusting stock for some bundle components. Processing incomplete. " + failedAdjustments.map(f => `Item ${f.itemId}: ${f.message}`).join('; ') };
                    }

                    return { success: true, message: "Bundle sale processed, component stock deducted." };
                } catch (error) {
                    console.error('[db.processBundleSale] Error:', error);
                    return { success: false, message: error.message || "Failed to process bundle sale." };
                }
            },
        // --- END BUNDLE MANAGEMENT FUNCTIONS ---
        // --- SALES ORDER FUNCTIONS ---
            async createSalesOrder(orderData, orderItemsData) {
                // orderData: { customer_id, status, notes, total_amount, created_by_user_id, order_number (optional) }
                // orderItemsData: [{ item_id/bundle_id, item_snapshot_name, item_snapshot_sku, quantity, unit_price, line_total }, ...]
                if (!supabase) return { success: false, message: "Database client not initialized." };
                try {
                    // 1. Create the sales_order header
                    const { data: newOrder, error: orderError } = await supabase
                        .from('sales_orders')
                        .insert([orderData])
                        .select()
                        .single();

                    if (orderError) throw orderError;
                    if (!newOrder) throw new Error("Sales order creation failed to return data.");

                    // 2. Create sales_order_items linked to the newOrder.id
                    const itemsToInsert = orderItemsData.map(item => ({
                        ...item,
                        sales_order_id: newOrder.id
                    }));

                    const { error: itemsError } = await supabase
                        .from('sales_order_items')
                        .insert(itemsToInsert);

                    if (itemsError) {
                        // CRITICAL: Order header created, but items failed.
                        // In a robust system, you'd attempt to delete the order header here (rollback).
                        // For simplicity now, we'll log and report.
                        console.error(`[db.createSalesOrder] CRITICAL: Order ${newOrder.id} created, but item insertion failed:`, itemsError);
                        await supabase.from('sales_orders').delete().eq('id', newOrder.id); // Attempt rollback
                        throw new Error(`Failed to add items to sales order: ${itemsError.message}. Order creation rolled back.`);
                    }

                    // Optionally re-fetch the order with items if needed, or just return success
                    return { success: true, order: newOrder, message: `Sales Order ${newOrder.order_number || newOrder.id} created successfully.` };

                } catch (error) {
                    console.error('[db.createSalesOrder] Error:', error);
                    return { success: false, message: error.message || "Failed to create sales order." };
                }
            },

            async getSalesOrders(filters = {}) { // e.g., filters.status, filters.customerId, filters.searchTerm
                if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
                try {
                    let query = supabase
                        .from('sales_orders')
                        .select(`
                            *,
                            customer:customers(id, full_name),
                            order_items:sales_order_items(*)
                        `)
                        .order('order_date', { ascending: false });

                    if (filters.status) query = query.eq('status', filters.status);
                    if (filters.customerId) query = query.eq('customer_id', filters.customerId);
                    // Add more filters as needed

                    const { data, error } = await query;
                    if (error) throw error;
                    return data || [];
                } catch (error) {
                    console.error('[db.getSalesOrders] Error:', error);
                    throw error;
                }
            },

            async getSalesOrderById(orderId) {
                if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
                try {
                    const { data, error } = await supabase
                        .from('sales_orders')
                        .select(`
                            *,
                            customer:customers(id, full_name, email, phone),
                            order_items:sales_order_items(*)
                        `)
                        .eq('id', orderId)
                        .single();

                    if (error) throw error;
                    // For each order item, fetch item/bundle details if needed for display (or join in SQL view/RPC)
                    if (data && data.order_items) {
                        for (let item of data.order_items) {
                            if (item.item_id) {
                                const { data: productInfo } = await supabase.from('items').select('name, sku').eq('id', item.item_id).single();
                                item.product_details = productInfo;
                            } else if (item.bundle_id) {
                                const { data: bundleInfo } = await supabase.from('bundles').select('name, bundle_sku').eq('id', item.bundle_id).single();
                                item.product_details = bundleInfo;
                            }
                        }
                    }
                    return data;
                } catch (error) {
                    console.error('[db.getSalesOrderById] Error:', error);
                    throw error;
                }
            },

            async updateSalesOrderStatus(orderId, newStatus, userId) {
                if (!supabase) return { success: false, message: "Database client not initialized." };
                try {
                    // Fetch the order and its items first to process stock deductions
                    const order = await db.getSalesOrderById(orderId);
                    if (!order) return { success: false, message: "Sales order not found." };

                    if (order.status === 'Fulfilled' && newStatus !== 'Fulfilled') {
                         return { success: false, message: "Cannot change status of an already fulfilled order to non-fulfilled in this flow." };
                    }
                    if (order.status === 'Cancelled') {
                         return { success: false, message: "Cannot change status of a cancelled order." };
                    }


                    // --- STOCK DEDUCTION LOGIC ---
                    if (newStatus === 'Fulfilled' && order.status !== 'Fulfilled') {
                        console.log(`[db.updateSalesOrderStatus] Order ${orderId} moving to Fulfilled. Processing stock deductions.`);
                        for (const item of order.order_items) {
                            let deductionResult;
                            if (item.item_id) { // Regular item
                                console.log(`Deducting single item ${item.item_id} by quantity ${item.quantity}`);
                                deductionResult = await db.adjustStockQuantity(item.item_id, -item.quantity); // Deduct
                            } else if (item.bundle_id) { // Bundle
                                console.log(`Deducting bundle ${item.bundle_id} by quantity ${item.quantity}`);
                                deductionResult = await db.processBundleSale(item.bundle_id, item.quantity);
                            }

                            if (!deductionResult || !deductionResult.success) {
                                // CRITICAL: Failed to deduct stock for an item/bundle.
                                // Rollback status update or at least report major error.
                                const productName = item.item_snapshot_name || (item.item_id ? `Item ID ${item.item_id}` : `Bundle ID ${item.bundle_id}`);
                                console.error(`[db.updateSalesOrderStatus] CRITICAL: Failed to deduct stock for ${productName} in order ${orderId}. Error: ${deductionResult?.message}`);
                                throw new Error(`Failed to deduct stock for ${productName}. Order fulfillment incomplete. Error: ${deductionResult?.message}`);
                            }
                        }
                        console.log(`[db.updateSalesOrderStatus] Stock deductions complete for order ${orderId}.`);
                    }
                    // --- END STOCK DEDUCTION LOGIC ---

                    // Update the order status
                    const { data: updatedOrder, error } = await supabase
                        .from('sales_orders')
                        .update({ status: newStatus, updated_at: new Date() }) // `updated_at` is handled by trigger too
                        .eq('id', orderId)
                        .select()
                        .single();

                    if (error) throw error;

                    return { success: true, order: updatedOrder, message: `Sales Order status updated to ${newStatus}.` };
                } catch (error) {
                    console.error('[db.updateSalesOrderStatus] Error:', error);
                    return { success: false, message: error.message || "Failed to update sales order status." };
                }
            },

            // Function to generate a unique (enough) order number - can be improved
            async generateOrderNumber() {
                const date = new Date();
                const prefix = `SO-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-`;
                // This is a simple sequence, for high concurrency a DB sequence or UUID is better
                const { count, error } = await supabase.from('sales_orders').select('*', { count: 'exact', head: true });
                if (error) return prefix + "ERR";
                return prefix + (count + 1).toString().padStart(4, '0');
            },
             // --- NEW STOCK TRANSFER FUNCTION ---
              async createStockTransferAndAdjustInventory(transferDetails) {
                // transferDetails: {
                //   itemId, quantityTransferred, sourceLocation, destinationLocation,
                //   notes, referenceNumber (optional), userId, usernameSnapshot
                // }
                if (!supabase) return { success: false, message: "Database client not initialized." };

                try {
                  // 1. Validate enough stock at source (conceptually, since source is just the item's current location)
                  const { data: itemBefore, error: itemFetchError } = await supabase
                    .from('items')
                    .select('quantity, storage_location')
                    .eq('id', transferDetails.itemId)
                    .single();

                  if (itemFetchError) throw itemFetchError;
                  if (!itemBefore) return { success: false, message: `Item ID ${transferDetails.itemId} not found.` };
                  if (itemBefore.storage_location !== transferDetails.sourceLocation) {
                    return { success: false, message: `Item's current location (${itemBefore.storage_location}) does not match source location (${transferDetails.sourceLocation}). Please refresh item data.`};
                  }
                  if (itemBefore.quantity < transferDetails.quantityTransferred) {
                    return { success: false, message: `Insufficient stock. Available: ${itemBefore.quantity}, Trying to transfer: ${transferDetails.quantityTransferred}` };
                  }

                  // 2. Create the stock_transfers record
                  const { data: newTransfer, error: transferError } = await supabase
                    .from('stock_transfers')
                    .insert([{
                      item_id: transferDetails.itemId,
                      quantity_transferred: transferDetails.quantityTransferred,
                      source_location: transferDetails.sourceLocation,
                      destination_location: transferDetails.destinationLocation,
                      notes: transferDetails.notes,
                      reference_number: transferDetails.referenceNumber || `TR-${Date.now()}`, // Auto-generate if not provided
                      processed_by_user_id: transferDetails.userId,
                      username_snapshot: transferDetails.usernameSnapshot
                    }])
                    .select()
                    .single();

                  if (transferError) throw transferError;
                  if (!newTransfer) throw new Error("Stock transfer record creation failed.");

                  // 3. Perform inventory adjustments via RPC
                  //    a. Deduct from source location (conceptually, from the item's current state)
                  const deductionContext = {
                    transactionType: 'STOCK_TRANSFER_OUT',
                    referenceId: String(newTransfer.id),
                    referenceType: 'STOCK_TRANSFER',
                    userId: transferDetails.userId,
                    usernameSnapshot: transferDetails.usernameSnapshot,
                    notes: `Transfer Out to ${transferDetails.destinationLocation}. Ref ID: ${newTransfer.id}`
                  };
                  const deductionResult = await db.adjustStockQuantity(
                    transferDetails.itemId,
                    -transferDetails.quantityTransferred, // Negative adjustment
                    deductionContext
                  );
                  if (!deductionResult.success) {
                    // Attempt to rollback transfer record or log critical error
                    console.error(`CRITICAL: Stock transfer ${newTransfer.id} recorded, but deduction failed: ${deductionResult.message}`);
                    // await supabase.from('stock_transfers').delete().eq('id', newTransfer.id); // Risky without true transactions
                    throw new Error(`Deduction failed for transfer: ${deductionResult.message}. Transfer partially failed.`);
                  }

                  //    b. Update the item's master storage_location
                  const { error: itemUpdateError } = await supabase
                    .from('items')
                    .update({ storage_location: transferDetails.destinationLocation, updated_at: new Date() })
                    .eq('id', transferDetails.itemId);

                  if (itemUpdateError) {
                    console.error(`CRITICAL: Stock transfer ${newTransfer.id} recorded, deduction done, but item location update failed: ${itemUpdateError.message}`);
                    // This is a problematic state. The item quantity is reduced, but its location not updated.
                    // Would ideally rollback deduction.
                    throw new Error(`Item location update failed for transfer: ${itemUpdateError.message}. Transfer partially failed.`);
                  }

                  //    c. Add to destination location (conceptually, to the item's new state)
                  const additionContext = {
                    transactionType: 'STOCK_TRANSFER_IN',
                    referenceId: String(newTransfer.id),
                    referenceType: 'STOCK_TRANSFER',
                    userId: transferDetails.userId,
                    usernameSnapshot: transferDetails.usernameSnapshot,
                    notes: `Transfer In from ${transferDetails.sourceLocation}. Ref ID: ${newTransfer.id}`
                  };
                  const additionResult = await db.adjustStockQuantity(
                    transferDetails.itemId,
                    transferDetails.quantityTransferred, // Positive adjustment
                    additionContext
                  );
                  if (!additionResult.success) {
                    // CRITICAL: Item location updated, but addition failed.
                    // This is also a problematic state.
                    console.error(`CRITICAL: Stock transfer ${newTransfer.id} recorded, location updated, but addition failed: ${additionResult.message}`);
                    throw new Error(`Addition failed for transfer: ${additionResult.message}. Transfer partially failed.`);
                  }

                  return { success: true, transfer: newTransfer, message: "Stock transferred successfully." };

                } catch (error) {
                  console.error('[db.createStockTransferAndAdjustInventory] Error:', error);
                  return { success: false, message: error.message || "Failed to process stock transfer." };
                }
              },

              async getStockTransfers(filters = {}) {
                if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
                try {
                  let query = supabase
                    .from('stock_transfers')
                    .select(`
                      *,
          item:items (id, name, sku),
                      user:users (id, username)
                    `)
                    .order('transfer_date', { ascending: false });

                  // Add filters if needed (e.g., by date, item, locations)
                  if(filters.itemId) query = query.eq('item_id', filters.itemId);

                  const { data, error } = await query.limit(filters.limit || 50);
                  if (error) throw error;
                  return data || [];
                } catch (error) {
                  console.error('[db.getStockTransfers] Error:', error);
                  throw error;
                }
              }
              // ... (rest of your db object)

            // --- END SALES ORDER FUNCTIONS ---

};