// src/InventoryMovementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom'; // If you want a back button
import Select from 'react-select';
import './InventoryMovementPage.css'; // Create this CSS

function InventoryMovementPage({ currentUser }) {
    const navigate = useNavigate();
    const [selectedItem, setSelectedItem] = useState(null); // { value: item.id, label: item.name }
    const [itemOptions, setItemOptions] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isItemsLoading, setIsItemsLoading] = useState(false);
    const [error, setError] = useState('');

    // Pagination (basic)
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(15); // Or make this configurable
    const [totalTransactions, setTotalTransactions] = useState(0);

    // Load items for the dropdown
    useEffect(() => {
        const loadItemsForSelect = async () => {
            setIsItemsLoading(true);
            try {
                const items = await window.electronAPI.getItems({});
                setItemOptions(items.map(item => ({ value: item.id, label: `${item.name} (SKU: ${item.sku || 'N/A'})` })));
            } catch (err) {
                console.error("Error fetching items for dropdown:", err);
                setError("Could not load items list.");
            }
            setIsItemsLoading(false);
        };
        loadItemsForSelect();
    }, []);

    const fetchTransactions = useCallback(async () => {
        if (!selectedItem) {
            setTransactions([]);
            setTotalTransactions(0);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const offset = (currentPage - 1) * itemsPerPage;
            const result = await window.electronAPI.getInventoryTransactionsForItem(selectedItem.value, itemsPerPage, offset);
            setTransactions(result.transactions || []);
            setTotalTransactions(result.count || 0);
        } catch (err) {
            console.error(`Error fetching transactions for item ${selectedItem.value}:`, err);
            setError(`Failed to load movements for ${selectedItem.label}.`);
            setTransactions([]);
            setTotalTransactions(0);
        }
        setIsLoading(false);
    }, [selectedItem, currentPage, itemsPerPage]); // Dependencies

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]); // fetchTransactions will change when selectedItem or currentPage changes

    const handleItemChange = (selectedOption) => {
        setSelectedItem(selectedOption);
        setCurrentPage(1); // Reset to first page when item changes
        setTransactions([]); // Clear previous transactions immediately
        setTotalTransactions(0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString(); // More detailed timestamp
    };

    const totalPages = Math.ceil(totalTransactions / itemsPerPage);

    return (
        <div className="inventory-movement-page page-container">
            <header className="page-header-alt">
                <h1>Inventory Movement Ledger</h1>
                {/* Add back button or other header elements if needed */}
            </header>

            {error && <div className="error-message card">{error}</div>}

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="form-group">
                    <label htmlFor="itemSelectLedger">Select Item to View Ledger:</label>
                    <Select
                        id="itemSelectLedger"
                        options={itemOptions}
                        value={selectedItem}
                        onChange={handleItemChange}
                        isLoading={isItemsLoading}
                        isClearable
                        placeholder="Search and select an item..."
                        styles={{ container: base => ({ ...base, zIndex: 10 }) }}
                    />
                </div>
            </div>

            {selectedItem && (
                <main className="content-block-wrapper">
                    <h3>Movements for: {selectedItem.label}</h3>
                    {isLoading && <p style={{ textAlign: 'center' }}>Loading movements...</p>}
                    {!isLoading && transactions.length === 0 && (
                        <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
                            No inventory movements found for this item.
                        </p>
                    )}
                    {transactions.length > 0 && (
                        <>
                            <div className="table-container">
                                <table id="inventoryMovementTable">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Type</th>
                                            <th className="text-right">Qty Change</th>
                                            <th className="text-right">Before</th>
                                            <th className="text-right">After</th>
                                            <th>Reference</th>
                                            <th>User</th>
                                            <th>Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map(tx => (
                                            <tr key={tx.id}>
                                                <td>{formatDate(tx.transaction_date)}</td>
                                                <td>{tx.transaction_type}</td>
                                                <td className={`text-right ${tx.quantity_change < 0 ? 'text-danger' : 'text-success'}`}>
                                                    {tx.quantity_change > 0 ? `+${tx.quantity_change}` : tx.quantity_change}
                                                </td>
                                                <td className="text-right">{tx.quantity_before}</td>
                                                <td className="text-right">{tx.quantity_after}</td>
                                                <td>{tx.reference_type ? `${tx.reference_type} (ID: ${tx.reference_id || 'N/A'})` : 'N/A'}</td>
                                                <td>{tx.username_snapshot || 'N/A'}</td>
                                                <td className="notes-cell">{tx.notes}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {/* Basic Pagination */}
                            {totalPages > 1 && (
                                <div className="pagination-controls" style={{ marginTop: '1rem', textAlign: 'center' }}>
                                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                        Previous
                                    </button>
                                    <span style={{ margin: '0 10px' }}>
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                        Next
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </main>
            )}
        </div>
    );
}

export default InventoryMovementPage;