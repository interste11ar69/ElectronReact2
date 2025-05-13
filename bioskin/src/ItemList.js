// src/ItemList.js
import React from 'react';
import { FaArchive, FaUndo } from 'react-icons/fa'; // FaUndo for unarchive

// ... (getStockStatusClass, getStockStatusText functions) ...
const getStockStatusClass = (quantity, isArchived) => { // Added isArchived
    if (isArchived) return 'stock-status-archived'; // New status for archived
    if (quantity <= 0) return 'stock-status-low';
    if (quantity < 10) return 'stock-status-low';
    if (quantity < 50) return 'stock-status-moderate';
    return 'stock-status-high';
};
const getStockStatusText = (quantity, isArchived) => { // Added isArchived
    if (isArchived) return 'ARCHIVED';
    if (quantity <= 0) return 'OUT OF STOCK';
    if (quantity < 10) return 'LOW';
    if (quantity < 50) return 'MODERATE';
    return 'HIGH';
};

// --- MODIFICATION START: Accept viewingArchived prop, rename onDelete to onArchive ---
function ItemList({ items, onEdit, onDelete: onArchiveItem, userRole, onSort, currentSortBy, currentSortOrder, viewingArchived }) {
// --- MODIFICATION END ---
    if (!items) {
        return <div className="loading-placeholder" style={{ padding: '2rem', textAlign: 'center' }}>No inventory data available.</div>;
    }
    // No items message adjusted slightly
    if (items.length === 0) {
         return (
            <div className="loading-placeholder" style={{ padding: '2rem', textAlign: 'center' }}>
                No {viewingArchived ? 'archived' : 'active'} items found{currentSortBy ? ' matching your criteria' : ''}.
            </div>
        );
    }

    const getSortIndicator = (columnName) => {
        if (currentSortBy === columnName) {
            return currentSortOrder === 'asc' ? ' ▲' : ' ▼';
        }
        return <span style={{color: 'var(--color-text-light)', marginLeft: '4px'}}>↕</span>;
    };

    const SortableHeader = ({ children, columnName }) => (
        <th onClick={() => onSort && onSort(columnName)} style={{ cursor: onSort ? 'pointer' : 'default' }}>
            {children}
            {onSort && getSortIndicator(columnName)}
        </th>
    );

    return (
        <table id="itemTable">
            <thead>
                <tr>
                    <SortableHeader columnName="name">Product</SortableHeader>
                    <th>Variant</th>
                    <SortableHeader columnName="sku">SKU Code</SortableHeader>
                    <SortableHeader columnName="quantity" className="text-right">Quantity</SortableHeader>
                    <SortableHeader columnName="cost_price" className="text-right">Price</SortableHeader>
                    <th className="text-center">Stock Status</th>
                    <th className="text-center">Actions</th>
                </tr>
            </thead>
            <tbody id="itemTableBody">
                {items.map(item => (
                    <tr key={item.id} style={item.is_archived ? { backgroundColor: '#f8f9fa', opacity: 0.7 } : {}}>
                        <td>{item.name}</td>
                        <td>{item.variant || 'N/A'}</td>
                        <td>{item.sku || 'N/A'}</td>
                        <td className="text-right">{item.is_archived ? 'N/A' : item.quantity}</td>
                        <td className="text-right">
                            {item.is_archived ? 'N/A' : (item.cost_price !== null && item.cost_price !== undefined ? `Php ${Number(item.cost_price).toFixed(2)}` : 'N/A')}
                        </td>
                        {/* --- MODIFICATION START: Pass item.is_archived to status functions --- */}
                        <td className={`text-center ${getStockStatusClass(item.quantity, item.is_archived)}`}>
                            {getStockStatusText(item.quantity, item.is_archived)}
                        </td>
                        {/* --- MODIFICATION END --- */}
                        <td className="text-center table-actions">
                            {/* --- MODIFICATION START: Adjust Edit button for archived items --- */}
                            <button
                                className="button-edit"
                                onClick={() => onEdit(item)}
                                disabled={item.is_archived && viewingArchived} // Disable edit for archived items when viewing archived list
                                title={item.is_archived && viewingArchived ? "Unarchive to edit" : "Edit Details"}
                            >
                                Edit Details
                            </button>
                            {/* --- MODIFICATION END --- */}
                            {/* --- MODIFICATION START: Change button to Archive/Unarchive --- */}
                            {userRole === 'admin' && onArchiveItem && (
                                <button
                                    className={item.is_archived ? "button-action" : "button-delete"} // Use a different style for unarchive if desired
                                    onClick={() => onArchiveItem(item.id, item.name, item.is_archived)}
                                    title={item.is_archived ? "Unarchive this item" : "Archive this item"}
                                >
                                    {item.is_archived ? <FaUndo /> : <FaArchive />} {item.is_archived ? 'Unarchive' : 'Archive'}
                                </button>
                            )}
                            {/* --- MODIFICATION END --- */}
                        </td>
                    </tr>
                ))}
                {/* This message is now handled by the check at the top of the component */}
            </tbody>
        </table>
    );
}

export default ItemList;