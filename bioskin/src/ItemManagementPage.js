// src/ItemManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ItemList from './ItemList';
import {
    FaSearch,
    FaThLarge,
    FaPlus,
    FaArchive // New icon for archiving
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
    // --- MODIFICATION START: Filter for archived items ---
    const [showArchived, setShowArchived] = useState(false); // New state for filter
    // --- MODIFICATION END ---

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
            storageLocation: selectedStorage || null,
            searchTerm: debouncedSearchTerm || null,
            sortBy: sortBy,
            sortOrder: sortOrder,
            // --- MODIFICATION START: Pass archive filter status to backend ---
            is_archived: showArchived ? true : false, // Send true to get only archived, false to get only active
            // If you want to show ALL (active + archived), your backend getItems needs to handle `includeArchived: true`
            // or you can make two separate calls. For now, this toggles between active and archived.
            // To show active by default: is_archived: showArchived (assuming showArchived is false by default)
            // To show only active by default, the backend getItems already filters is_archived = false by default
            // So, if showArchived is true, we want to fetch is_archived: true
            // If showArchived is false, we want to fetch is_archived: false (which is the default)
            // Let's adjust the backend to accept 'is_archived' parameter explicitly
            // and if not provided, it defaults to false.
            // So here, we only provide it if we want to see archived.
            // Let's refine the backend to take an 'archivedStatus' filter: 'active', 'archived', or 'all'
            // For simplicity now: if showArchived is true, we ask for archived items. Otherwise, active.
            // --- The backend db.getItems was already modified to handle 'is_archived' filter ---
        };
        if (showArchived) {
            filterPayload.is_archived = true;
        } else {
            filterPayload.is_archived = false; // Explicitly ask for active items
        }


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
    // --- MODIFICATION START: Add showArchived to dependencies ---
    }, [selectedCategory, selectedStorage, debouncedSearchTerm, sortBy, sortOrder, showArchived]);
    // --- MODIFICATION END ---

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

    const navigateToEdit = (item) => {
        // --- MODIFICATION START: Prevent editing of archived items (optional) ---
        if (item.is_archived) {
            alert("Archived items cannot be edited. Please unarchive it first if you need to make changes.");
            return;
        }
        // --- MODIFICATION END ---
        navigate(`/products/${item.id}/edit`);
    }
    const navigateToAddNew = () => navigate('/products/new');

    // --- MODIFICATION START: Rename handleDeleteItem to handleArchiveItem ---
    const handleArchiveItem = async (itemId, currentItemName, isCurrentlyArchived) => {
        const actionText = isCurrentlyArchived ? 'unarchive' : 'archive';
        const friendlyItemName = currentItemName || `item ID ${itemId}`;
        const confirmationMessage = `Are you sure you want to ${actionText} "${friendlyItemName}"?
    ${isCurrentlyArchived ? 'It will become active and visible in main lists again.' : 'It will be hidden from active lists but can be recovered by viewing archived items.'}`;

        if (window.confirm(confirmationMessage)) {
            setError(null); // Clear previous errors
            try {
                let result;
                if (isCurrentlyArchived) {
                    // Call the new unarchive function
                    result = await window.electronAPI.unarchiveItem(itemId);
                } else {
                    // 'deleteItem' now acts as 'archiveItem'
                    result = await window.electronAPI.deleteItem(itemId);
                }

                if (result && result.success) {
                    console.log(result.message);
                    // Important: Reload items to reflect the change in status (active/archived)
                    // This will also re-render the ItemList with updated button text/icons
                    loadItems();
                    // Optionally show a temporary success message to the user on this page
                    // setSuccessMessage(result.message); // You'd need a successMessage state
                    // setTimeout(() => setSuccessMessage(''), 3000);
                } else if (result) {
                    setError(result.message || `Failed to ${actionText} item.`);
                } else {
                    setError(`An unknown error occurred while trying to ${actionText} the item.`);
                }
            } catch (err) {
                console.error(`Error during ${actionText} item:`, err);
                setError(`Error ${actionText} item: ${err.message}`);
            }
        }
    };

    // --- MODIFICATION END ---

    const categories = ["Skincare", "Wellness", "Cosmetics", "Soap", "Beauty Soap", "Body Care", "Hair Care", "Uncategorized"];
    const storageOptions = ["STORE", "Warehouse A", "Warehouse 200"];

    return (
        <div className="item-management-page page-container">
            <header className="page-header-alt">
                <h1>{showArchived ? "Archived Products List" : "Products List"}</h1>
                {/* --- MODIFICATION START: Toggle Button for Archived --- */}
                <button
                    className={`button ${showArchived ? 'button-primary' : 'button-secondary'}`}
                    onClick={() => setShowArchived(!showArchived)}
                    style={{fontSize: '0.9em', padding: '0.5em 1em'}}
                >
                    {showArchived ? 'View Active Items' : 'View Archived Items'}
                </button>
                {/* --- MODIFICATION END --- */}
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
                                // --- MODIFICATION START: Pass handleArchiveItem and showArchived status ---
                                onDelete={currentUser?.role === 'admin' ? handleArchiveItem : null} // Renamed prop for clarity, or keep onDelete
                                userRole={currentUser?.role}
                                onSort={handleSort}
                                currentSortBy={sortBy}
                                currentSortOrder={sortOrder}
                                viewingArchived={showArchived} // Pass this to ItemList
                                // --- MODIFICATION END ---
                            />
                        )}
                    </div>
                </section>

                <div className="page-actions-bar">
                    {/* --- MODIFICATION START: Hide "Add New Stock" when viewing archived items --- */}
                    {!showArchived && (
                        <button className="button" onClick={navigateToAddNew}>
                            <FaPlus style={{marginRight: '8px'}} /> Add New Stock
                        </button>
                    )}
                    {/* --- MODIFICATION END --- */}
                </div>
            </div>
        </div>
    );
}

export default ItemManagementPage;