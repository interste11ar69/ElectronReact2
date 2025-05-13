// src/ItemManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ItemList from './ItemList';
import {
    FaSearch,
    // FaSlidersH, // Not used, can be removed if you don't plan to use it for advanced filters
    FaThLarge,
    FaPlus,
    FaFileAlt
} from 'react-icons/fa';
import './ItemManagementPage.css';

function ItemManagementPage({ currentUser }) {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // State for filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedStorage, setSelectedStorage] = useState('');
    // --- CORRECTED: Only one declaration of debouncedSearchTerm ---
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

    // State for sorting
    const [sortBy, setSortBy] = useState('created_at'); // Default sort: by creation date
    const [sortOrder, setSortOrder] = useState('desc');   // Default order: descending (newest first)

    const navigate = useNavigate();

    // Debounce search term
    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 500); // 500ms delay

        return () => {
            clearTimeout(timerId);
        };
    }, [searchTerm]);


    // Modified loadItems to include sorting and filters
    const loadItems = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        const filterPayload = {
            category: selectedCategory || null,
            storageLocation: selectedStorage || null,
            searchTerm: debouncedSearchTerm || null,
            sortBy: sortBy,
            sortOrder: sortOrder
        };

        console.log("ItemManagementPage: Calling electronAPI.getItems with payload:", JSON.stringify(filterPayload, null, 2));

        try {
            const fetchedItemsResult = await window.electronAPI.getItems(filterPayload);

            // Check if the result itself indicates an error (as returned by your main.js)
            if (fetchedItemsResult && fetchedItemsResult.error) {
                console.error("ItemManagementPage: Error from backend getItems:", fetchedItemsResult.error);
                setError(`Failed to load items: ${fetchedItemsResult.error}`);
                setItems([]);
            } else if (fetchedItemsResult && Array.isArray(fetchedItemsResult)) {
                setItems(fetchedItemsResult);
            } else {
                // This case handles unexpected non-array, non-error responses
                console.warn("ItemManagementPage: getItems did not return an array or a known error structure. Received:", fetchedItemsResult);
                setError("Received unexpected data format for items.");
                setItems([]);
            }
        } catch (err) { // Catch errors from the window.electronAPI call itself (e.g., IPC issues)
            console.error("ItemManagementPage: Critical error loading items:", err.message, err.stack);
            setError(`Failed to load items: ${err.message}`);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedCategory, selectedStorage, debouncedSearchTerm, sortBy, sortOrder]); // Removed state setters from dependencies

    useEffect(() => {
        loadItems();
    }, [loadItems]); // loadItems is the sole dependency here


    // --- SORTING HANDLER FUNCTIONS ---
    const handleSort = (newSortBy) => {
        if (sortBy === newSortBy) {
            setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(newSortBy);
            // When changing column, usually default to 'asc'
            // but for 'quantity', 'asc' (lowest first) is often desired initially.
            setSortOrder(newSortBy === 'quantity' ? 'asc' : 'asc');
        }
        // loadItems will be called by its own useEffect due to sortBy/sortOrder change in its dependency (loadItems itself)
    };

    const navigateToEdit = (item) => navigate(`/products/${item.id}/edit`);
    const navigateToAddNew = () => navigate('/products/new');

    const handleDeleteItem = async (itemId) => {
        if (window.confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
            setError(null); // Clear previous errors
            try {
                const result = await window.electronAPI.deleteItem(itemId);
                if (result.success) {
                    console.log(result.message);
                    loadItems(); // Reload items to reflect deletion
                } else {
                    setError(result.message || 'Failed to delete item.');
                }
            } catch (err) {
                console.error("Error deleting item:", err);
                setError(`Error deleting item: ${err.message}`);
            }
        }
    };

    // Data for dropdowns (can be fetched from DB in a real app if dynamic)
    const categories = ["Skincare", "Wellness", "Cosmetics", "Soap", "Beauty Soap", "Body Care", "Hair Care", "Uncategorized"];
    const storageOptions = ["Main Warehouse", "Retail Shelf", "Online Fulfillment", "STORE", "STORE A", "STORE B", "Undefined Location"];

    // Helper for sort indicator is now inside ItemList.js, no longer needed here.

    return (
        <div className="item-management-page page-container">
            <header className="page-header-alt">
                <h1>Products List</h1>
                {/* Add export/import buttons or other header actions if desired */}
            </header>

            <div className="content-block-wrapper">
                <div className="filter-section-alt">
                    <div className="filters-bar">
                        <div className="filter-row">
                            <div className="search-input-group">
                                <FaSearch className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search Product Name or SKU"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {/* If you add advanced filter options:
                                <FaSlidersH className="filter-action-icon" title="Advanced filters" onClick={() => alert('Advanced filters UI coming soon!')}/>
                                */}
                            </div>
                            <div className="filter-dropdown-group">
                                <FaThLarge className="filter-icon" />
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="filter-dropdown"
                                >
                                    <option value="">All Product Categories</option>
                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                        </div>
                        <select
                            value={selectedStorage}
                            onChange={(e) => setSelectedStorage(e.target.value)}
                            className="filter-dropdown standalone-filter storage-filter-full-width"
                        >
                            <option value="">All Storage Locations</option>
                            {storageOptions.map(store => <option key={store} value={store}>{store}</option>)}
                        </select>
                    </div>
                </div>

                <section className="stock-list-section">
                    {error && (
                        <div className="card" style={{ color: 'var(--color-status-danger)', padding: '1rem', marginBottom: '1rem', border: '1px solid var(--color-status-danger)', backgroundColor: 'rgba(211, 47, 47, 0.05)' }}>
                            Error: {error}
                        </div>
                    )}
                    <div className="table-container">
                        {isLoading ? (
                            <div className="loading-placeholder">Loading inventory...</div>
                        ) : (
                            <ItemList
                                items={items}
                                onEdit={navigateToEdit}
                                onDelete={currentUser?.role === 'admin' ? handleDeleteItem : null}
                                userRole={currentUser?.role}
                                onSort={handleSort} // Pass the sort handler
                                currentSortBy={sortBy} // Pass current sort column
                                currentSortOrder={sortOrder} // Pass current sort direction
                            />
                        )}
                    </div>
                </section>

                <div className="page-actions-bar">
                    <button className="button" onClick={navigateToAddNew}>
                        <FaPlus style={{marginRight: '8px'}} /> Add New Stock
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ItemManagementPage;