// src/ItemList.js
import React from 'react';
import { FaArchive, FaUndo, FaEdit } from 'react-icons/fa';

const getStockStatusClass = (quantity, isArchived, lowStockThreshold = 0) => { // Added lowStockThreshold
    if (isArchived) return 'stock-status-archived';
    const numQuantity = Number(quantity);
    if (numQuantity <= (Number(lowStockThreshold) || 0)) return 'stock-status-low'; // Use threshold
    // Removed the < 10 and < 50 hardcoded checks, relying on threshold primarily.
    // You can add them back if you want a visual distinction beyond just the threshold.
    // For example, if numQuantity < (Number(lowStockThreshold) || 0) + 5 -> moderate
    return 'stock-status-high';
};

const getStockStatusText = (quantity, isArchived, lowStockThreshold = 0) => { // Added lowStockThreshold
    if (isArchived) return 'ARCHIVED';
    const numQuantity = Number(quantity);
    if (numQuantity <= (Number(lowStockThreshold) || 0)) return 'LOW STOCK'; // More explicit
    return 'IN STOCK'; // Simpler status text
};


function ItemList({
    items,
    onEdit,
    onDelete: onArchiveItem,
    userRole,
    onSort,
    currentSortBy,
    currentSortOrder,
    viewingArchived,
    filteredLocationName // <-- NEW PROP: Pass the name of the filtered location
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
            return currentSortOrder === 'asc' ? ' ↑' : ' ↓';
        }
        return <span style={{color: 'var(--color-text-light)', marginLeft: '4px'}}>↕</span>;
    };

    const SortableHeader = ({ children, columnName }) => (
        <th onClick={() => onSort && onSort(columnName)} style={{ cursor: onSort ? 'pointer' : 'default' }}>
            {children}
            {onSort && getSortIndicator(columnName)}
        </th>
    );

    // Determine quantity column header and which quantity field to use for display
    const quantityHeader = filteredLocationName ? `Quantity (${filteredLocationName})` : "Quantity (Total)";
    // For sorting, we'll still use 'total_quantity' for simplicity, or you can make 'sortBy' dynamic
    const quantitySortKey = "total_quantity"; // Or make this dynamic based on filter

    return (
        <table id="itemTable">
            <thead>
                <tr>
                    <SortableHeader columnName="name">Product</SortableHeader>
                    <th>Variant</th>
                    <SortableHeader columnName="sku">SKU Code</SortableHeader>
                    {/* --- MODIFICATION: Dynamic Header Text --- */}
                    <SortableHeader columnName={quantitySortKey} className="text-center">{quantityHeader}</SortableHeader>
                    {/* --- END MODIFICATION --- */}
                    <SortableHeader columnName="cost_price" className="text-right">Price</SortableHeader>
                    <th className="text-center">Stock Status</th>
                    <th className="text-center">Actions</th>
                </tr>
            </thead>
            <tbody id="itemTableBody">
                {items.map(item => {
                    // --- MODIFICATION: Determine which quantity to display ---
                    const displayQuantity = filteredLocationName && item.quantity_at_specific_location !== undefined && item.quantity_at_specific_location !== null
                                          ? item.quantity_at_specific_location
                                          : item.total_quantity;
                    // --- END MODIFICATION ---

                    return (
                        <tr key={item.id} style={item.is_archived ? { backgroundColor: '#f8f9fa', opacity: 0.7 } : {}}>
                            <td>{item.name}</td>
                            <td>{item.variant || 'N/A'}</td>
                            <td>{item.sku || 'N/A'}</td>
                            {/* --- MODIFICATION: Display the determined quantity --- */}
                            <td className="text-center quantity-cell">{item.is_archived ? 'N/A' : (displayQuantity !== undefined ? displayQuantity : 'Err')}</td>
                            {/* --- END MODIFICATION --- */}
                            <td className="text-right"> {/* Changed from text-center */}
                                {item.is_archived ? 'N/A' : (item.cost_price !== null && item.cost_price !== undefined ? `Php ${Number(item.cost_price).toFixed(2)}` : 'N/A')}
                            </td>
                            {/* --- MODIFICATION: Pass displayQuantity and low_stock_threshold to status functions --- */}
                            <td className={`text-center ${getStockStatusClass(displayQuantity, item.is_archived, item.low_stock_threshold)}`}>
                                {getStockStatusText(displayQuantity, item.is_archived, item.low_stock_threshold)}
                            </td>
                            {/* --- END MODIFICATION --- */}
                            <td className="text-center table-actions">
                                <button
                                    className="button-edit"
                                    onClick={() => onEdit(item)}
                                    disabled={item.is_archived && viewingArchived}
                                    title={item.is_archived && viewingArchived ? "Unarchive to edit" : "Edit Details"}
                                >
                                    <FaEdit /> Edit
                                </button>
                                {userRole === 'admin' && onArchiveItem && (
                                    <button
                                        className={item.is_archived ? "button-action button-unarchive" : "button-delete"}
                                        onClick={() => onArchiveItem(item.id, item.name, item.is_archived)}
                                        title={item.is_archived ? "Restore this item" : "Archive this item"}
                                    >
                                        {item.is_archived ? <FaUndo /> : <FaArchive />} {item.is_archived ? 'Restore' : 'Archive'}
                                    </button>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export default ItemList;