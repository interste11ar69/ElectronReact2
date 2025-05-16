// src/localDb.js
// Local DB stub for offline mode. Replace with actual implementation (e.g., SQLite, NeDB).

export const localDb = {
  // --- CUSTOM AUTHENTICATION ---
  async login(username, password) {
    // TODO: Implement local user authentication
    return { success: false, message: "Offline login not implemented." };
  },

  async getUserInfoForLogById(userId) {
    // TODO: Implement local user info lookup
    return { username: "N/A (Offline)" };
  },

  // --- ITEM MANAGEMENT FUNCTIONS ---
  async getItems(filters = {}) {
    // TODO: Implement local item retrieval
    return [];
  },

  async getItemById(itemId) {
    // TODO: Implement local item lookup
    return null;
  },

  async createItem(itemData, initialStockEntries = [], createdByUserId, createdByUsername) {
    // TODO: Implement local item creation
    return { success: false, message: "Offline item creation not implemented." };
  },

  async updateItem(id, itemData) {
    // TODO: Implement local item update
    return { success: false, message: "Offline item update not implemented." };
  },

  async deleteItem(id) {
    // TODO: Implement local item deletion
    return { success: false, message: "Offline item deletion not implemented." };
  },

  // Add more methods as needed to match the db API...
};