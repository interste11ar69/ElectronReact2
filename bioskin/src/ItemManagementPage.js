// src/ItemManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ItemList from './ItemList';
import {
    FaSearch,
    FaThLarge,
    FaPlus,
    // FaFileAlt // Not used in this file, can be removed if not planned for export button here
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
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

    // State for sorting
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');

    const navigate = useNavigate();

    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 500);

        return () => {
            clearTimeout(timerId);
        };
    }, [searchTerm]);

    const loadItems = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        const filterPayload = {
            category: selectedCategory || null,
            storageLocation: selectedStorage || null, // Will send the selected storage filter value
            searchTerm: debouncedSearchTerm || null,
            sortBy: sortBy,
            sortOrder: sortOrder
        };

        console.log("ItemManagementPage: Calling electronAPI.getItems with payload:", JSON.stringify(filterPayload, null, 2));

        try {
            const fetchedItemsResult = await window.electronAPI.getItems(filterPayload);

            if (fetchedItemsResult && fetchedItemsResult.error) {
                console.error("ItemManagementPage: Error from backend getItems:", fetchedItemsResult.error);
                setError(`Failed to load items: ${fetchedItemsResult.error}`);
                setItems([]);
            } else if (fetchedItemsResult && Array.isArray(fetchedItemsResult)) {
                setItems(fetchedItemsResult);
            } else {
                console.warn("ItemManagementPage: getItems did not return an array or a known error structure. Received:", fetchedItemsResult);
                setError("Received unexpected data format for items.");
                setItems([]);
            }
        } catch (err) {
            console.error("ItemManagementPage: Critical error loading items:", err.message, err.stack);
            setError(`Failed to load items: ${err.message}`);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedCategory, selectedStorage, debouncedSearchTerm, sortBy, sortOrder]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const handleSort = (newSortBy) => {
        if (sortBy === newSortBy) {
            setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(newSortBy);
            setSortOrder(newSortBy === 'quantity' ? 'asc' : 'asc');
        }
    };

    const navigateToEdit = (item) => navigate(`/products/${item.id}/edit`);
    const navigateToAddNew = () => navigate('/products/new');

    const handleDeleteItem = async (itemId) => {
        if (window.confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
            setError(null);
            try {
                const result = await window.electronAPI.deleteItem(itemId);
                if (result.success) {
                    console.log(result.message);
                    loadItems();
                } else {
                    setError(result.message || 'Failed to delete item.');
                }
            } catch (err) {
                console.error("Error deleting item:", err);
                setError(`Error deleting item: ${err.message}`);
            }
        }
    };

    const categories = ["Skincare", "Wellness", "Cosmetics", "Soap", "Beauty Soap", "Body Care", "Hair Care", "Uncategorized"];
    // --- MODIFICATION START: Update storageOptions to match ProductFormPage and diagram ---
    const storageOptions = ["STORE", "Warehouse A", "Warehouse 200"];
    // --- MODIFICATION END ---

    return (
        <div className="item-management-page page-container">
            <header className="page-header-alt">
                <h1>Products List</h1>
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
                        {/* Storage Location Filter Dropdown */}
                        <select
                            value={selectedStorage}
                            onChange={(e) => setSelectedStorage(e.target.value)}
                            className="filter-dropdown standalone-filter storage-filter-full-width"
                        >
                            <option value="">All Storage Locations</option>
                            {/* --- MODIFICATION START: Map over the updated storageOptions --- */}
                            {storageOptions.map(store => <option key={store} value={store}>{store}</option>)}
                            {/* --- MODIFICATION END --- */}
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
                                onSort={handleSort}
                                currentSortBy={sortBy}
                                currentSortOrder={sortOrder}
                            />
                        )}
                    </div>
                </section>

                <div className="page-actions-bar">
                    <button className="button" onClick={navigateToAddNew}>
                        <FaPlus style={{marginRight: '8px'}} /> Add New Stock
                    </button>
                    {/* You could add an export button here if desired, linking to the export functionality */}
                    {/* Example:
                    <button className="button button-secondary" onClick={handleExport} disabled={isExporting}>
                        <FaFileAlt style={{marginRight: '8px'}} /> {isExporting ? 'Exporting...' : 'Export All Items'}
                    </button>
                    */}
                </div>
            </div>
        </div>
    );
}

export default ItemManagementPage;