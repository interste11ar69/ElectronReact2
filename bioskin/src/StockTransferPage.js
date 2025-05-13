// src/StockTransferPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { FaExchangeAlt, FaSave, FaTimes, FaInfoCircle } from 'react-icons/fa';
// You might want a dedicated CSS file, or reuse styles from StockAdjustmentPage.css
import './StockAdjustmentPage.css'; // Example: Reusing some styles

function StockTransferPage({ currentUser }) {
    const navigate = useNavigate();
    const [selectedItem, setSelectedItem] = useState(null); // { value: id, label: '...', currentQty: X, currentLocation: 'Y' }
    const [quantity, setQuantity] = useState('');
    const [sourceLocation, setSourceLocation] = useState(''); // Will be auto-filled from selected item
    const [destinationLocation, setDestinationLocation] = useState('');
    const [notes, setNotes] = useState('');
    const [referenceNumber, setReferenceNumber] = useState(''); // Optional

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [itemOptions, setItemOptions] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false);
    const [storageOptionsState, setStorageOptionsState] = useState([]); // For destination

    // Fetch items and storage locations
    useEffect(() => {
        const loadData = async () => {
            setIsItemsLoading(true);
            try {
                const items = await window.electronAPI.getItems({});
                const options = items.map(item => ({
                    value: item.id,
                    label: `${item.name} (SKU: ${item.sku || 'N/A'}) - Qty: ${item.quantity} @ ${item.storage_location || 'N/A'}`,
                    currentQty: item.quantity,
                    currentLocation: item.storage_location || ''
                }));
                setItemOptions(options);

                // Define or fetch storage locations
                const commonStorageOptions = ["Main Warehouse", "Retail Shelf", "Online Fulfillment", "STORE A", "STORE B", "Undefined Location"];
                setStorageOptionsState(commonStorageOptions.map(s => ({ value: s, label: s })));

            } catch (err) {
                console.error("Error fetching data for transfer page:", err);
                setError('Could not load necessary data.');
            } finally {
                setIsItemsLoading(false);
            }
        };
        loadData();
    }, []);

    const handleItemChange = (selectedOption) => {
        setSelectedItem(selectedOption);
        if (selectedOption) {
            setSourceLocation(selectedOption.currentLocation);
            setDestinationLocation(''); // Reset destination
            setError('');
            setSuccessMessage('');
        } else {
            setSourceLocation('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        const qty = parseInt(quantity, 10);
        if (!selectedItem) { setError('Please select an item.'); return; }
        if (isNaN(qty) || qty <= 0) { setError('Please enter a valid positive quantity.'); return; }
        if (!sourceLocation) { setError('Source location is missing (select item again).'); return; }
        if (!destinationLocation) { setError('Please select a destination location.'); return; }
        if (sourceLocation === destinationLocation) { setError('Source and destination locations cannot be the same.'); return; }
        if (qty > selectedItem.currentQty) { setError(`Cannot transfer ${qty}. Only ${selectedItem.currentQty} available at ${sourceLocation}.`); return; }


        setIsSubmitting(true);
        const transferDetails = {
            itemId: selectedItem.value,
            quantityTransferred: qty,
            sourceLocation: sourceLocation,
            destinationLocation: destinationLocation,
            notes: notes.trim(),
            referenceNumber: referenceNumber.trim() || null,
            // userId and usernameSnapshot will be added by main.js
        };

        try {
            const result = await window.electronAPI.createStockTransfer(transferDetails);
            if (result.success) {
                setSuccessMessage(result.message || 'Stock transferred successfully!');
                setSelectedItem(null);
                setQuantity('');
                setSourceLocation('');
                setDestinationLocation('');
                setNotes('');
                setReferenceNumber('');
                // Refresh item options as quantities and locations have changed
                // This is a quick way; ideally, you'd update only the affected item
                const items = await window.electronAPI.getItems({});
                const options = items.map(item => ({
                    value: item.id,
                    label: `${item.name} (SKU: ${item.sku || 'N/A'}) - Qty: ${item.quantity} @ ${item.storage_location || 'N/A'}`,
                    currentQty: item.quantity,
                    currentLocation: item.storage_location || ''
                }));
                setItemOptions(options);

                setTimeout(() => setSuccessMessage(''), 7000);
            } else {
                setError(result.message || 'Failed to transfer stock.');
            }
        } catch (err) {
            console.error("Error submitting stock transfer:", err);
            setError(`An unexpected error occurred: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="stock-adjustment-page page-container"> {/* Reuse CSS class */}
            <header className="page-header-alt">
                <div className="form-header-left">
                    <FaExchangeAlt style={{ fontSize: '1.8em', marginRight: '10px', color: 'var(--color-primary-dark)' }} />
                    <div>
                        <h1>Stock Transfer</h1>
                        <p className="form-subtitle">Move inventory between storage locations.</p>
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}
            {successMessage && <div className="success-message card" role="status">{successMessage}</div>}

            <form onSubmit={handleSubmit} className="stock-adjustment-form card">
                <div className="form-group">
                    <label htmlFor="itemSelectTransfer">Select Item to Transfer *</label>
                    <Select
                        id="itemSelectTransfer"
                        options={itemOptions}
                        value={selectedItem}
                        onChange={handleItemChange}
                        isLoading={isItemsLoading}
                        isClearable
                        placeholder="Search or select product..."
                        styles={{ container: base => ({ ...base, zIndex: 10 }) }}
                        required
                    />
                    {selectedItem && (
                        <p className="current-stock-info">
                            <FaInfoCircle /> Available: {selectedItem.currentQty} at "{selectedItem.currentLocation || 'N/A'}"
                        </p>
                    )}
                </div>

                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="sourceLocation">From Location (Source) *</label>
                        <input
                            type="text"
                            id="sourceLocation"
                            value={sourceLocation}
                            className="form-control"
                            readOnly // Auto-filled from selected item
                            style={{ backgroundColor: '#e9ecef' }}
                        />
                    </div>
                    <div className="form-group form-group-inline">
                        <label htmlFor="destinationLocation">To Location (Destination) *</label>
                        <Select
                            id="destinationLocation"
                            options={storageOptionsState.filter(opt => opt.value !== sourceLocation)} // Exclude source
                            value={storageOptionsState.find(opt => opt.value === destinationLocation)}
                            onChange={(selected) => setDestinationLocation(selected ? selected.value : '')}
                            isDisabled={!selectedItem}
                            placeholder="Select destination..."
                            styles={{ container: base => ({ ...base, zIndex: 9 }) }}
                            required
                        />
                    </div>
                </div>

                 <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="quantityTransfer">Quantity to Transfer *</label>
                        <input
                            id="quantityTransfer"
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder="e.g., 10"
                            className="form-control"
                            min="1"
                            required
                            disabled={!selectedItem}
                        />
                    </div>
                    <div className="form-group form-group-inline">
                         <label htmlFor="referenceNumber">Reference # (Optional)</label>
                         <input
                            type="text"
                            id="referenceNumber"
                            value={referenceNumber}
                            onChange={(e) => setReferenceNumber(e.target.value)}
                            placeholder="e.g., TRN-001"
                            className="form-control"
                            disabled={!selectedItem}
                        />
                    </div>
                </div>


                <div className="form-group">
                    <label htmlFor="notesTransfer">Notes (Optional)</label>
                    <textarea
                        id="notesTransfer"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows="3"
                        className="form-control"
                        placeholder="Reason for transfer, additional details..."
                        disabled={!selectedItem}
                    ></textarea>
                </div>

                <div className="form-actions">
                    <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => navigate('/')} // Or to an inventory page
                        disabled={isSubmitting}
                        style={{marginRight: '1rem'}}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="button button-primary save-button"
                        disabled={isSubmitting || !selectedItem || !destinationLocation || !quantity || (selectedItem && parseInt(quantity) > selectedItem.currentQty)}
                    >
                        <FaExchangeAlt style={{ marginRight: '8px' }} />
                        {isSubmitting ? 'Processing...' : 'Confirm Transfer'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default StockTransferPage;