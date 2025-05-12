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
  async getItems(filters = {}) {
    if (!supabase) return Promise.reject(new Error("Supabase client not initialized."));
    try {
      let query = supabase.from('items').select('*');
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.storageLocation) query = query.eq('storage_location', filters.storageLocation);
      if (filters.searchTerm) query = query.or(`name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data || []; // Ensure an array is always returned
    } catch (error) {
      console.error('Error in getItems:', error);
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
      const { data, error } = await supabase.from('items').select('quantity, cost_price');
      if (error) throw error;
      const summary = (data || []).reduce((acc, item) => {
        acc.totalItems = (acc.totalItems || 0) + 1;
        acc.totalQuantity = (acc.totalQuantity || 0) + (Number(item.quantity) || 0);
        acc.totalValue = (acc.totalValue || 0) + ((Number(item.quantity) || 0) * (Number(item.cost_price) || 0));
        return acc;
      }, { totalItems: 0, totalQuantity: 0, totalValue: 0 });
      return { success: true, summary };
    } catch (error) {
      console.error('Error in getInventorySummary:', error);
      return { success: false, message: error.message || "Failed to get summary.", summary: null };
    }
  },
  async getLowStockItems(threshold = 10) {
    if (!supabase) return { success: false, message: "Database client not initialized.", items: [] };
    try {
      const { data, error } = await supabase.from('items').select('name, quantity').lt('quantity', threshold);
      if (error) throw error;
      return { success: true, items: data || [] };
    } catch (error) {
      console.error('Error in getLowStockItems:', error);
      return { success: false, message: error.message || "Failed to get low stock items.", items: [] };
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

  // Implement your file processing db functions (processBulkUpdate, importInitialItemsFromFile) here if they interact with Supabase
};