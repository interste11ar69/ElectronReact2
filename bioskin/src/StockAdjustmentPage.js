// src/StockAdjustmentPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select'; // Use react-select for searchable item dropdown
import { FaSave, FaTimes, FaInfoCircle } from 'react-icons/fa';
import './StockAdjustmentPage.css'; // Create this CSS file in Step 2

// Predefined standard adjustment reasons
const adjustmentReasons = [
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

function StockAdjustmentPage({ currentUser }) {
    const navigate = useNavigate();
    const [selectedItem, setSelectedItem] = useState(null); // { value: id, label: 'Name (SKU) - Current: X', currentQty: X }
    const [adjustmentQuantity, setAdjustmentQuantity] = useState(''); // Can be positive or negative
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [newQuantity, setNewQuantity] = useState(null); // Calculated new quantity

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Item options for the dropdown
    const [itemOptions, setItemOptions] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false);

    // Fetch items for the Select dropdown
    useEffect(() => {
        const loadItems = async () => {
            setIsItemsLoading(true);
            try {
                const items = await window.electronAPI.getItems({}); // Fetch all items
                const options = items.map(item => ({
                    value: item.id,
                    label: `${item.name} ${item.variant ? `(${item.variant})` : ''} (SKU: ${item.sku || 'N/A'}) - Current: ${item.quantity}`,
                    currentQty: item.quantity // Store current quantity for calculation
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

    // Calculate new quantity whenever item or adjustment amount changes
    useEffect(() => {
        if (selectedItem && adjustmentQuantity !== '') {
            const current = Number(selectedItem.currentQty);
            const adjustment = Number(adjustmentQuantity);
            if (!isNaN(current) && !isNaN(adjustment)) {
                setNewQuantity(current + adjustment);
            } else {
                setNewQuantity(null); // Reset if inputs are invalid
            }
        } else {
            setNewQuantity(null); // Reset if no item or adjustment amount
        }
    }, [selectedItem, adjustmentQuantity]);

    const handleItemChange = (selectedOption) => {
        setSelectedItem(selectedOption);
        setError(''); // Clear error on item change
        setSuccessMessage('');
    };

    const handleQuantityChange = (e) => {
        // Allow negative sign, but ensure it's a number
        const value = e.target.value;
         // Allow empty string, minus sign, or valid number potentially starting with minus
         if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
            setAdjustmentQuantity(value);
            setError('');
            setSuccessMessage('');
         }
    };


    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        // --- Validations ---
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
        // Check if the new quantity would be negative (generally disallowed unless explicitly handled)
        if (newQuantity !== null && newQuantity < 0) {
            setError(`Resulting quantity (${newQuantity}) cannot be negative. Current stock is ${selectedItem.currentQty}.`);
            return;
        }
        // --- End Validations ---


        setIsSubmitting(true);

        const adjustmentDetails = {
            itemId: selectedItem.value,
            adjustmentQuantity: adjustmentQty, // Send the numeric value
            reason: reason,
            notes: notes.trim() || null,
            userId: currentUser?.id, // Pass user ID for logging
            username: currentUser?.username, // Pass username for logging
        };

        try {
            console.log("Submitting stock adjustment:", adjustmentDetails);
            // Ensure this function exists in preload/main.js (Step 4)
            const result = await window.electronAPI.performStockAdjustment(adjustmentDetails);
            console.log("Stock adjustment result:", result);

            if (result.success) {
                setSuccessMessage(result.message || 'Stock adjusted successfully!');
                // Reset form
                setSelectedItem(null);
                setAdjustmentQuantity('');
                setReason('');
                setNotes('');
                setNewQuantity(null);
                // Optionally refresh item list if needed, though usually not necessary on separate page
                // Or navigate away
                 setTimeout(() => setSuccessMessage(''), 5000);
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
                 {/* Reusing form header style */}
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
                {/* Item Selection */}
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
                        styles={{ container: base => ({ ...base, zIndex: 10 }) }} // Ensure dropdown overlaps
                        required
                    />
                    {selectedItem && (
                        <p className="current-stock-info">
                            <FaInfoCircle /> Current Stock: {selectedItem.currentQty}
                        </p>
                    )}
                </div>

                {/* Adjustment Quantity */}
                <div className="form-group">
                    <label htmlFor="adjustmentQuantity">Adjustment Quantity *</label>
                    <input
                        id="adjustmentQuantity"
                        type="text" // Use text to allow easier input of negative sign
                        value={adjustmentQuantity}
                        onChange={handleQuantityChange}
                        placeholder="e.g., -5 (to deduct) or 10 (to add)"
                        className="form-control" // Add general form control class if you have one
                        required
                        disabled={!selectedItem} // Disable until item is selected
                    />
                     <small className="form-text text-muted">
                        Enter a positive number to add stock, a negative number to deduct stock.
                    </small>
                </div>

                 {/* Calculated New Quantity (Read-Only) */}
                 {newQuantity !== null && (
                     <div className="form-group calculated-quantity">
                        <label>Resulting Quantity:</label>
                         <span className={`quantity-value ${newQuantity < 0 ? 'negative' : ''}`}>
                            {newQuantity}
                        </span>
                     </div>
                 )}


                 {/* Reason */}
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

                {/* Notes */}
                <div className="form-group">
                    <label htmlFor="notes">Notes {reason === 'Other (Specify in Notes)' ? '*' : '(Optional)'}</label>
                    <textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows="3"
                        className="form-control"
                        placeholder="Add any relevant details, required if reason is 'Other'..."
                        disabled={!selectedItem}
                        required={reason === 'Other (Specify in Notes)'}
                    ></textarea>
                </div>

                {/* Actions */}
                <div className="form-actions">
                    <button
                        type="submit"
                        className="button button-primary save-button" // Reuse save button style potentially
                        disabled={isSubmitting || !selectedItem || !reason || adjustmentQuantity === '' || newQuantity === null || newQuantity < 0}
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