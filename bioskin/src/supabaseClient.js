import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  // Instead of throwing, we'll create a client with placeholder values
  // This allows the app to start and show appropriate error messages in the UI
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };

// Helper functions for common database operations
export const db = {
  // Items
  async getItems(filters = {}) {
    try {
      let query = supabase
        .from('items')
        .select('*');

      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.storageLocation) {
        query = query.eq('storage_location', filters.storageLocation);
      }
      if (filters.searchTerm) {
        query = query.or(`name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error in getItems:', error);
      throw error;
    }
  },

  async getItemById(id) {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error in getItemById:', error);
      throw error;
    }
  },

  async createItem(itemData) {
    try {
      const { data, error } = await supabase
        .from('items')
        .insert([itemData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error in createItem:', error);
      throw error;
    }
  },

  async updateItem(id, itemData) {
    try {
      const { data, error } = await supabase
        .from('items')
        .update(itemData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error in updateItem:', error);
      throw error;
    }
  },

  async deleteItem(id) {
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error in deleteItem:', error);
      throw error;
    }
  },

  // Analytics
  async getInventorySummary() {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('quantity, cost_price');
      
      if (error) throw error;

      const summary = data.reduce((acc, item) => {
        acc.totalItems = (acc.totalItems || 0) + 1;
        acc.totalQuantity = (acc.totalQuantity || 0) + (item.quantity || 0);
        acc.totalValue = (acc.totalValue || 0) + ((item.quantity || 0) * (item.cost_price || 0));
        return acc;
      }, {});

      return { success: true, summary };
    } catch (error) {
      console.error('Error in getInventorySummary:', error);
      throw error;
    }
  },

  async getLowStockItems(threshold = 10) {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .lt('quantity', threshold);
      
      if (error) throw error;
      return { success: true, items: data };
    } catch (error) {
      console.error('Error in getLowStockItems:', error);
      throw error;
    }
  },

  // Users
  async login(username, password) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
      
      if (error) throw error;
      if (!data) return { success: false, message: 'User not found' };

      // Note: In a real app, you should use Supabase Auth instead of storing passwords
      const isValid = await bcrypt.compare(password, data.password_hash);
      if (!isValid) return { success: false, message: 'Invalid password' };

      return { success: true, user: { id: data.id, username: data.username, role: data.role } };
    } catch (error) {
      console.error('Error in login:', error);
      throw error;
    }
  },

  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return null;

      const { data, error: profileError } = await supabase
        .from('users')
        .select('id, username, role')
        .eq('id', user.id)
        .single();
      
      if (profileError) return null;
      return data;
    } catch (error) {
      console.error('Error in getCurrentUser:', error);
      return null;
    }
  },

  async logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error in logout:', error);
      throw error;
    }
  }
}; 