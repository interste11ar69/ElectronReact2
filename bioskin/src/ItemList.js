// src/ItemList.js
import React from 'react';
import { FaArchive, FaUndo, FaEdit } from 'react-icons/fa'; // Added FaEdit for consistency

// --- MODIFICATION: getStockStatusClass and getStockStatusText now use total_quantity if available ---
const getStockStatusClass = (quantity, isArchived) => {
    if (isArchived) return 'stock-status-archived';
    const numQuantity = Number(quantity); // Ensure it's a number
    if (numQuantity <= 0) return 'stock-status-low';
    if (numQuantity < 10) return 'stock-status-low';
    if (numQuantity < 50) return 'stock-status-moderate';
    return 'stock-status-high';
};

const getStockStatusText = (quantity, isArchived) => {
    if (isArchived) return 'ARCHIVED';
    const numQuantity = Number(quantity);
    if (numQuantity <= 0) return 'OUT OF STOCK';
    if (numQuantity < 10) return 'LOW';
    if (numQuantity < 50) return 'MODERATE';
    return 'HIGH';
};
// --- END MODIFICATION ---

function ItemList({ items, onEdit, onDelete: onArchiveItem, userRole, onSort, currentSortBy, currentSortOrder, viewingArchived }) {
    if (!items) {
        return <div className="loading-placeholder" style={{ padding: '2rem', textAlign: 'center' }}>No inventory data available.</div>;
    }
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
                    {/* --- MODIFICATION: Header now refers to 'total_quantity' for sorting --- */}
                    <SortableHeader columnName="total_quantity" className="text-right">Quantity (Total)</SortableHeader>
                    {/* --- END MODIFICATION --- */}
                    <SortableHeader columnName="cost_price" className="text-right">Price</SortableHeader>
                    <th className="text-center">Stock Status</th> {/* This is derived, not directly sortable from a single DB field easily */}
                    <th className="text-center">Actions</th>
                </tr>
            </thead>
            <tbody id="itemTableBody">
                {items.map(item => (
                    // item object now should have 'total_quantity' from the view
                    <tr key={item.id} style={item.is_archived ? { backgroundColor: '#f8f9fa', opacity: 0.7 } : {}}>
                        <td>{item.name}</td>
                        <td>{item.variant || 'N/A'}</td>
                        <td>{item.sku || 'N/A'}</td>
                        {/* --- MODIFICATION: Display item.total_quantity --- */}
                        <td className="text-center">{item.is_archived ? 'N/A' : (item.total_quantity !== undefined ? item.total_quantity : 'Err')}</td>
                        {/* --- END MODIFICATION --- */}
                        <td className="text-center  ">
                            {item.is_archived ? 'N/A' : (item.cost_price !== null && item.cost_price !== undefined ? `Php ${Number(item.cost_price).toFixed(2)}` : 'N/A')}
                        </td>
                        {/* --- MODIFICATION: Pass item.total_quantity to status functions --- */}
                        <td className={`text-center ${getStockStatusClass(item.total_quantity, item.is_archived)}`}>
                            {getStockStatusText(item.total_quantity, item.is_archived)}
                        </td>
                        {/* --- END MODIFICATION --- */}
                        <td className="text-center table-actions">
                            <button
                                className="button-edit"
                                onClick={() => onEdit(item)}
                                disabled={item.is_archived && viewingArchived}
                                title={item.is_archived && viewingArchived ? "Unarchive to edit" : "Edit Details"}
                            >
                                <FaEdit /> Edit Details {/* Added Icon */}
                            </button>
                            {userRole === 'admin' && onArchiveItem && (
                                <button
                                    className={item.is_archived ? "button-action button-unarchive" : "button-delete"} // Added button-unarchive for potential specific styling
                                    onClick={() => onArchiveItem(item.id, item.name, item.is_archived)}
                                    title={item.is_archived ? "Restore this item" : "Archive this item"}
                                >
                                    {item.is_archived ? <FaUndo /> : <FaArchive />} {item.is_archived ? 'Restore' : 'Archive'}
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default ItemList;