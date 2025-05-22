// src/ItemManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ItemList from './ItemList';
import {
    FaSearch,
    FaThLarge,
    FaPlus,
    FaArchive, // For "View Archived" button
    FaUndo    // For "View Active" button when viewing archived
} from 'react-icons/fa';
import './ItemManagementPage.css';

function ItemManagementPage({ currentUser }) {
    console.log('ItemManagementPage currentUser:', currentUser); // For debugging
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(''); // For user feedback

    // State for filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedStorage, setSelectedStorage] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
    const [showArchived, setShowArchived] = useState(false);

    // State for sorting
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');

    const navigate = useNavigate();

    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 500);
        return () => clearTimeout(timerId);
    }, [searchTerm]);

    const loadItems = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(''); // Clear success message on new load

        const filterPayload = {
            category: selectedCategory || null,
            storageLocation: selectedStorage || null,
            searchTerm: debouncedSearchTerm || null,
            sortBy: sortBy,
            sortOrder: sortOrder,
            is_archived: showArchived,
        };

        // console.log("ItemManagementPage: Calling electronAPI.getItems with payload:", JSON.stringify(filterPayload, null, 2));

        try {
            const fetchedItemsResult = await window.electronAPI.getItems(filterPayload);
            if (fetchedItemsResult && fetchedItemsResult.error) {
                setError(`Failed to load items: ${fetchedItemsResult.error}`);
                setItems([]);
            } else if (fetchedItemsResult && Array.isArray(fetchedItemsResult)) {
                setItems(fetchedItemsResult);
            } else {
                setError("Received unexpected data format for items.");
                setItems([]);
            }
        } catch (err) {
            setError(`Failed to load items: ${err.message}`);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedCategory, selectedStorage, debouncedSearchTerm, sortBy, sortOrder, showArchived]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const handleSort = (newSortBy) => {
        if (sortBy === newSortBy) {
            setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(newSortBy);
            setSortOrder('asc'); // Default to ascending for a new column
        }
    };

    const navigateToEdit = (item) => {
        if (item.is_archived) {
            alert("Archived items cannot be edited. Please restore it first if you need to make changes.");
            return;
        }
        navigate(`/products/${item.id}/edit`);
    }
    const navigateToAddNew = () => navigate('/products/new');

    const handleArchiveItem = async (itemId, currentItemName, isCurrentlyArchived) => {
        const actionText = isCurrentlyArchived ? 'restore' : 'archive';
        const friendlyItemName = currentItemName || `item ID ${itemId}`;
        const confirmationMessage = `Are you sure you want to ${actionText} "${friendlyItemName}"?
    ${isCurrentlyArchived ? 'It will become active and visible in main lists again.' : 'It will be hidden from active lists but can be recovered by viewing archived items.'}`;

        if (window.confirm(confirmationMessage)) {
            setError(null);
            setSuccessMessage('');
            try {
                let result;
                // --- *** CORRECTED API CALLS HERE *** ---
                if (isCurrentlyArchived) {
                    if (typeof window.electronAPI.unarchiveItem !== 'function') {
                        throw new Error("window.electronAPI.unarchiveItem is not a function.");
                    }
                    result = await window.electronAPI.unarchiveItem(itemId);
                } else {
                    if (typeof window.electronAPI.archiveItem !== 'function') {
                        throw new Error("window.electronAPI.archiveItem is not a function.");
                    }
                    result = await window.electronAPI.archiveItem(itemId); // Use archiveItem
                }
                // --- *** END OF CORRECTION *** ---

                if (result && result.success) {
                    setSuccessMessage(result.message || `Item ${actionText}d successfully!`);
                    loadItems();
                    setTimeout(() => setSuccessMessage(''), 3000);
                } else if (result) {
                    setError(result.message || `Failed to ${actionText} item.`);
                } else {
                    setError(`An unknown error occurred while trying to ${actionText} the item.`);
                }
            } catch (err) {
                console.error(`Error during ${actionText} item:`, err);
                setError(`Error ${actionText}ing item: ${err.message}`);
            }
        }
    };

    const categories = ["Skincare", "Wellness", "Cosmetics", "Soap", "Beauty Soap", "Body Care", "Hair Care", "Uncategorized"];
    const storageOptions = ["STORE", "Warehouse A", "Warehouse 200"]; // Example, fetch these dynamically if possible

    return (
        <div className="item-management-page page-container">
            <header className="page-header-alt">
                <h1>{showArchived ? "Archived Products List" : "Products List"}</h1>
                <div className="page-header-actions"> {/* Wrapper for buttons */}
                    {currentUser?.role === 'admin' && (
                        <button
                            className={`button ${showArchived ? 'button-primary' : 'button-secondary'} view-archive-btn`}
                            onClick={() => setShowArchived(!showArchived)}
                            // style={{fontSize: '0.9em', padding: '0.5em 1em'}} // Moved to CSS if preferred
                        >
                            {showArchived ? <FaUndo style={{ marginRight: '8px' }} /> : <FaArchive style={{ marginRight: '8px' }} />}
                            {showArchived ? 'View Active Items' : 'View Archived Items'}
                        </button>
                    )}
                    {!showArchived && ( // Only show "Add New Stock" when not viewing archived
                        <button className="button button-primary add-new-btn" onClick={navigateToAddNew}>
                            <FaPlus style={{marginRight: '8px'}} /> Add New Stock
                        </button>
                    )}
                </div>
            </header>

            {error && (
                <div className="card error-message" role="alert">
                    Error: {error}
                </div>
            )}
            {successMessage && (
                <div className="card success-message" role="status">
                    {successMessage}
                </div>
            )}

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
                    <div className="table-container">
                        {isLoading ? (
                            <div className="loading-placeholder">Loading inventory...</div>
                        ) : (
                            <ItemList
                                items={items}
                                onEdit={navigateToEdit}
                                onArchive={currentUser?.role === 'admin' ? handleArchiveItem : null} // Correct prop name
                                userRole={currentUser?.role}
                                onSort={handleSort}
                                currentSortBy={sortBy}
                                currentSortOrder={sortOrder}
                                viewingArchived={showArchived}
                                filteredLocationName={selectedStorage || null}
                            />
                        )}
                    </div>
                </section>
                {/* "Add New Stock" button moved to header */}
            </div>
        </div>
    );
}

export default ItemManagementPage;