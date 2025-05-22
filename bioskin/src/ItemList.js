// src/ItemList.js
import React from 'react';
import { FaArchive, FaUndo, FaEdit } from 'react-icons/fa';

const getStockStatusClass = (quantity, isArchived, lowStockThreshold = 0) => {
    if (isArchived) return 'stock-status-archived';
    const numQuantity = Number(quantity);
    const threshold = Number(lowStockThreshold) || 0;
    if (numQuantity <= threshold) return 'stock-status-low';
    return 'stock-status-high';
};

const getStockStatusText = (quantity, isArchived, lowStockThreshold = 0) => {
    if (isArchived) return 'ARCHIVED';
    const numQuantity = Number(quantity);
    const threshold = Number(lowStockThreshold) || 0;
    if (numQuantity <= threshold) return 'LOW STOCK';
    return 'IN STOCK';
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
};

function ItemList({
    items,
    onEdit,
    onArchive, // This prop is for the archive/restore functionality
    userRole,
    onSort,
    currentSortBy,
    currentSortOrder,
    viewingArchived,
    filteredLocationName
}) {
    if (!items) {
        return <div className="loading-placeholder" style={{ padding: '2rem', textAlign: 'center' }}>No inventory data available.</div>;
    }
    if (items.length === 0) {
         return (
            <div className="loading-placeholder" style={{ padding: '2rem', textAlign: 'center' }}>
                No {viewingArchived ? 'archived' : 'active'} items found{currentSortBy ? ' matching your criteria' : (filteredLocationName ? ` at ${filteredLocationName}` : '')}.
            </div>
        );
    }

    const getSortIndicator = (columnName) => {
        if (currentSortBy === columnName) {
            return currentSortOrder === 'asc' ? ' ▲' : ' ▼';
        }
        return <span style={{color: 'var(--color-text-light)', marginLeft: '4px', fontSize: '0.8em'}}>↕</span>;
    };

    const SortableHeader = ({ children, columnName, className = '' }) => (
        <th
            onClick={() => onSort && onSort(columnName)}
            style={{ cursor: onSort ? 'pointer' : 'default' }}
            className={className}
        >
            {children}
            {onSort && getSortIndicator(columnName)}
        </th>
    );

    const quantityHeader = filteredLocationName ? `Qty (${filteredLocationName})` : "Total Qty";
    const quantitySortKey = filteredLocationName ? "quantity_at_specific_location" : "total_quantity";

    return (
        <table id="itemTable">
            <thead>
                <tr>
                    <SortableHeader columnName="name">Product</SortableHeader>
                    <th>Variant</th>
                    <SortableHeader columnName="sku">SKU Code</SortableHeader>
                    <SortableHeader columnName={quantitySortKey} className="text-center">{quantityHeader}</SortableHeader>
                    <SortableHeader columnName="cost_price" className="text-right">Price</SortableHeader>
                    <th className="text-center">Stock Status</th>
                    {viewingArchived && <SortableHeader columnName="updated_at">Archived At</SortableHeader>}
                    <th className="text-center">Actions</th>
                </tr>
            </thead>
            <tbody id="itemTableBody">
                {items.map(item => {
                    const displayQuantity = item.is_archived ? 'N/A' : (
                        filteredLocationName && item.quantity_at_specific_location !== undefined && item.quantity_at_specific_location !== null
                            ? item.quantity_at_specific_location
                            : item.total_quantity
                    );

                    return (
                        <tr key={item.id} style={item.is_archived ? { backgroundColor: '#f8f9fa', opacity: 0.7 } : {}}>
                            <td>{item.name}</td>
                            <td>{item.variant || 'N/A'}</td>
                            <td>{item.sku || 'N/A'}</td>
                            <td className="text-center quantity-cell">
                                {displayQuantity}
                            </td>
                            <td className="text-right">
                                {item.is_archived ? 'N/A' : formatCurrency(item.cost_price)}
                            </td>
                            <td className={`text-center ${getStockStatusClass(displayQuantity, item.is_archived, item.low_stock_threshold)}`}>
                                {getStockStatusText(displayQuantity, item.is_archived, item.low_stock_threshold)}
                            </td>
                            {viewingArchived && <td>{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : 'N/A'}</td>}
                            <td className="text-center table-actions">
                                {/* --- BUTTONS RESTORED HERE --- */}
                                <button
                                    className="button-edit"
                                    onClick={() => onEdit(item)}
                                    disabled={item.is_archived}
                                    title={item.is_archived ? "Restore item to edit" : "Edit Details"}
                                >
                                    <FaEdit /> Edit
                                </button>
                                {userRole === 'admin' && onArchive && (
                                    <button
                                        className={item.is_archived ? "button-action button-unarchive" : "button-delete"} // Use button-delete for archive for now, or create button-archive
                                        onClick={() => onArchive(item.id, item.name, item.is_archived)}
                                        title={item.is_archived ? "Restore this item" : "Archive this item"}
                                    >
                                        {item.is_archived ? <FaUndo /> : <FaArchive />} {item.is_archived ? 'Restore' : 'Archive'}
                                    </button>
                                )}
                                {/* --- END OF RESTORED BUTTONS --- */}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export default ItemList;