// src/StockAdjustmentPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select'; // Use react-select for searchable item dropdown
import { FaSave, FaInfoCircle } from 'react-icons/fa'; // Removed FaTimes as it's not used
import './StockAdjustmentPage.css';

// --- MODIFICATION START: Add new reasons ---
const adjustmentReasons = [
    'Goods Received from Factory',
    'Cycle Count Adjustment',
    'Damaged Goods Write-off',
    'Expired Stock Write-off',
    'Samples / Marketing Use',
    'Gifts / Giveaways',
    'Internal Use',
    'Stock Transfer Error Correction',
    'Found Inventory',
    'Other (Specify in Notes)',
];
// --- MODIFICATION END ---

function StockAdjustmentPage({ currentUser }) {
    const navigate = useNavigate();
    const [selectedItem, setSelectedItem] = useState(null);
    const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [newQuantity, setNewQuantity] = useState(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [itemOptions, setItemOptions] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false);

    useEffect(() => {
        const loadItems = async () => {
            setIsItemsLoading(true);
            try {
                const items = await window.electronAPI.getItems({});
                const options = items.map(item => ({
                    value: item.id,
                    label: `${item.name} ${item.variant ? `(${item.variant})` : ''} (SKU: ${item.sku || 'N/A'}) - Current: ${item.quantity}`,
                    currentQty: item.quantity
                }));
                setItemOptions(options);
            } catch (err) {
                console.error("Error fetching items for adjustment dropdown:", err);
                setError('Could not load product list.');
            } finally {
                setIsItemsLoading(false);
            }
        };
        loadItems();
    }, []);

    useEffect(() => {
        if (selectedItem && adjustmentQuantity !== '') {
            const current = Number(selectedItem.currentQty);
            const adjustment = Number(adjustmentQuantity);
            if (!isNaN(current) && !isNaN(adjustment)) {
                setNewQuantity(current + adjustment);
            } else {
                setNewQuantity(null);
            }
        } else {
            setNewQuantity(null);
        }
    }, [selectedItem, adjustmentQuantity]);

    const handleItemChange = (selectedOption) => {
        setSelectedItem(selectedOption);
        setAdjustmentQuantity(''); // Also reset quantity when item changes for clarity
        setReason(''); // Reset reason
        setNotes(''); // Reset notes
        setNewQuantity(null); // Reset calculated new quantity
        setError('');
        setSuccessMessage('');
    };

    const handleQuantityChange = (e) => {
        const value = e.target.value;
        if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
            setAdjustmentQuantity(value);
            // No need to clear error/success here, only on item change or submit
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (!selectedItem) {
            setError('Please select an item to adjust.');
            return;
        }
        if (adjustmentQuantity === '' || adjustmentQuantity === '-') {
            setError('Please enter a valid adjustment quantity (positive or negative).');
            return;
        }
        const adjustmentQty = Number(adjustmentQuantity);
        if (isNaN(adjustmentQty) || adjustmentQty === 0) {
            setError('Adjustment quantity cannot be zero and must be a number.');
            return;
        }
        if (!reason) {
            setError('Please select a reason for the adjustment.');
            return;
        }
        if (reason === 'Other (Specify in Notes)' && !notes.trim()) {
            setError('Please provide details in the Notes when selecting "Other".');
            return;
        }
        // --- MODIFICATION START: Allow positive adjustments for receiving goods, even if it seems like "duplicating" found stock logic.
        // The key difference is the *reason* and thus the *transaction_type* logged.
        // For "Goods Received..." reasons, the adjustment quantity SHOULD typically be positive.
        if ((reason === 'Goods Received from Factory') && adjustmentQty <= 0) {
            setError(`For "${reason}", adjustment quantity should be positive.`);
            return;
        }
        // --- MODIFICATION END ---

        if (newQuantity !== null && newQuantity < 0) {
             // Check for other reasons leading to negative stock
             if (reason !== 'Damaged Goods Write-off' && reason !== 'Expired Stock Write-off' && !reason.toLowerCase().includes('deduct')) { // Add more "deduction" type reasons if any
                setError(`Resulting quantity (${newQuantity}) cannot be negative. Current stock is ${selectedItem.currentQty}.`);
                return;
             }
        }


        setIsSubmitting(true);

        const adjustmentDetails = {
            itemId: selectedItem.value,
            adjustmentQuantity: adjustmentQty,
            reason: reason,
            notes: notes.trim() || null,
            userId: currentUser?.id,
            username: currentUser?.username,
        };

        try {
            console.log("Submitting stock adjustment:", adjustmentDetails);
            const result = await window.electronAPI.performStockAdjustment(adjustmentDetails);
            console.log("Stock adjustment result:", result);

            if (result.success) {
                setSuccessMessage(result.message || 'Stock adjusted successfully!');
                // Refresh item options to show updated current quantity in dropdown
                const items = await window.electronAPI.getItems({});
                const options = items.map(item => ({
                    value: item.id,
                    label: `${item.name} ${item.variant ? `(${item.variant})` : ''} (SKU: ${item.sku || 'N/A'}) - Current: ${item.quantity}`,
                    currentQty: item.quantity
                }));
                setItemOptions(options);

                // Reset form fields
                setSelectedItem(null); // This will also clear dependent fields via handleItemChange if called
                setAdjustmentQuantity('');
                setReason('');
                setNotes('');
                setNewQuantity(null);


                setTimeout(() => setSuccessMessage(''), 7000); // Clear success after 7s
            } else {
                setError(result.message || 'Failed to adjust stock.');
            }
        } catch (err) {
            console.error("Error submitting stock adjustment:", err);
            setError(`An unexpected error occurred: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="stock-adjustment-page page-container">
            <header className="page-header-alt">
                 <div className="form-header-left">
                     <div>
                        <h1>Stock Adjustment</h1>
                         <p className="form-subtitle">Manually adjust inventory levels with proper reason codes.</p>
                     </div>
                 </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}
            {successMessage && <div className="success-message card" role="status">{successMessage}</div>}

            <form onSubmit={handleSubmit} className="stock-adjustment-form card">
                <div className="form-group">
                    <label htmlFor="itemSelect">Select Item *</label>
                    <Select
                        id="itemSelect"
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
                            <FaInfoCircle /> Current Stock: {selectedItem.currentQty}
                        </p>
                    )}
                </div>

                <div className="form-group">
                    <label htmlFor="adjustmentQuantity">Adjustment Quantity *</label>
                    <input
                        id="adjustmentQuantity"
                        type="text"
                        value={adjustmentQuantity}
                        onChange={handleQuantityChange}
                        placeholder="e.g., -5 (to deduct) or 10 (to add)"
                        className="form-control"
                        required
                        disabled={!selectedItem}
                    />
                     <small className="form-text text-muted">
                        Enter a positive number to add stock (e.g., for received goods), a negative number to deduct stock.
                    </small>
                </div>

                 {newQuantity !== null && (
                     <div className="form-group calculated-quantity">
                        <label>Resulting Quantity:</label>
                         <span className={`quantity-value ${newQuantity < 0 ? 'negative' : ''}`}>
                            {newQuantity}
                        </span>
                     </div>
                 )}

                <div className="form-group">
                    <label htmlFor="reason">Reason for Adjustment *</label>
                    <select
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="form-control"
                        required
                        disabled={!selectedItem}
                    >
                        <option value="" disabled>-- Select Reason --</option>
                        {adjustmentReasons.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="notes">Notes {reason === 'Other (Specify in Notes)' ? '*' : '(Optional)'}</label>
                    <textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows="3"
                        className="form-control"
                        placeholder="Add any relevant details, PO numbers, etc. Required if reason is 'Other'..."
                        disabled={!selectedItem}
                        required={reason === 'Other (Specify in Notes)'}
                    ></textarea>
                </div>

                <div className="form-actions">
                    <button
                        type="submit"
                        className="button button-primary save-button"
                        disabled={isSubmitting || !selectedItem || !reason || adjustmentQuantity === '' || adjustmentQuantity === '-' || newQuantity === null || (newQuantity < 0 && reason !== 'Damaged Goods Write-off' && reason !== 'Expired Stock Write-off' && !reason.toLowerCase().includes('deduct')) }
                    >
                        <FaSave style={{ marginRight: '8px' }} />
                        {isSubmitting ? 'Processing...' : 'Submit Adjustment'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default StockAdjustmentPage;