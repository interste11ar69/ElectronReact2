// src/ItemList.js
import React from 'react';

// ... (getStockStatusClass, getStockStatusText functions) ...
const getStockStatusClass = (quantity) => {
    if (quantity <= 0) return 'stock-status-low';
    if (quantity < 10) return 'stock-status-low';
    if (quantity < 50) return 'stock-status-moderate';
    return 'stock-status-high';
};
const getStockStatusText = (quantity) => {
    if (quantity <= 0) return 'OUT OF STOCK';
    if (quantity < 10) return 'LOW';
    if (quantity < 50) return 'MODERATE';
    return 'HIGH';
};


// Accept new sorting props
function ItemList({ items, onEdit, onDelete, userRole, onSort, currentSortBy, currentSortOrder }) {
    if (!items) {
        return <div className="loading-placeholder" style={{ padding: '2rem', textAlign: 'center' }}>No inventory data available.</div>;
    }
    if (items.length === 0 && !onSort) { // Added !onSort to avoid showing "no items" when just sorting an empty list
         return <div className="loading-placeholder" style={{ padding: '2rem', textAlign: 'center' }}>No items found matching your criteria.</div>;
    }


    // Helper for sort indicator in TH
    const getSortIndicator = (columnName) => {
        if (currentSortBy === columnName) {
            return currentSortOrder === 'asc' ? ' ▲' : ' ▼';
        }
        return <span style={{color: 'var(--color-text-light)', marginLeft: '4px'}}>↕</span>; // Default sortable icon
    };

    // Helper to make TH sortable
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
                    <th>Variant</th> {/* Not making variant sortable for this example */}
                    <SortableHeader columnName="sku">SKU Code</SortableHeader>
                    <SortableHeader columnName="quantity" className="text-right">Quantity</SortableHeader> {/* Add className here if TH needs it */}
                    <SortableHeader columnName="cost_price" className="text-right">Price</SortableHeader>
                    {/* Stock status is derived, not directly sortable from DB field easily */}
                    <th className="text-center">Stock</th>
                    <th className="text-center">Actions</th>
                </tr>
            </thead>
            <tbody id="itemTableBody">
                {items.map(item => (
                    <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.variant || 'N/A'}</td>
                        <td>{item.sku || 'N/A'}</td>
                        <td className="text-right">{item.quantity}</td>
                        <td className="text-right">
                            {item.cost_price !== null && item.cost_price !== undefined ? `Php ${Number(item.cost_price).toFixed(2)}` : 'N/A'}
                        </td>
                        <td className={`text-center ${getStockStatusClass(item.quantity)}`}>
                            {getStockStatusText(item.quantity)}
                        </td>
                        <td className="text-center table-actions">
                            <button className="button-edit" onClick={() => onEdit(item)}>Edit Details</button>
                            {userRole === 'admin' && onDelete && (
                                <button className="button-delete" onClick={() => onDelete(item.id)}>Delete</button>
                            )}
                        </td>
                    </tr>
                ))}
                {/* Show a message if items array is empty after filtering/loading */}
                {items.length === 0 && (
                    <tr>
                        <td colSpan="7" className="text-center" style={{padding: '2rem', fontStyle: 'italic', color: 'var(--color-text-light)'}}>
                            No items found.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}

export default ItemList;