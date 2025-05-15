// src/StockAdjustmentPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { FaSave, FaInfoCircle } from 'react-icons/fa';
import './StockAdjustmentPage.css'; // Ensure this CSS file has relevant styles

const adjustmentReasons = [
    'Goods Received from Factory', // For receiving into a specific location
    'Cycle Count Adjustment',
    'Damaged Goods Write-off',
    'Expired Stock Write-off',
    'Samples / Marketing Use',
    'Gifts / Giveaways',
    'Internal Use',
    'Stock Transfer Error Correction', // Usually involves two locations, might be better handled by Transfer page
    'Found Inventory',
    'Other (Specify in Notes)',
];

function StockAdjustmentPage({ currentUser }) {
    const navigate = useNavigate();

    // State for selected item and location
    const [selectedItem, setSelectedItem] = useState(null); // Stores { value: itemId, label: 'Item Name (SKU) - Total: X' }
    const [selectedLocation, setSelectedLocation] = useState(null); // Stores { value: locationId, label: 'Location Name' }

    // State for quantities and form data
    const [currentQtyAtLocation, setCurrentQtyAtLocation] = useState(0);
    const [adjustmentQuantity, setAdjustmentQuantity] = useState(''); // String to allow typing '-'
    const [newQuantityAtLocation, setNewQuantityAtLocation] = useState(null); // Calculated
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');

    // UI State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Dropdown options
    const [itemOptions, setItemOptions] = useState([]);
    const [storageLocationOptions, setStorageLocationOptions] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false);
    const [isLocationsLoading, setIsLocationsLoading] = useState(false);

    // Effect to load items for the item selection dropdown
    useEffect(() => {
        const loadItems = async () => {
            setIsItemsLoading(true);
            try {
                // Fetch items with their total quantity using the view or modified getItems
                const items = await window.electronAPI.getItems({ is_archived: false }); // Assumes getItems returns total_quantity
                const options = items.map(item => ({
                    value: item.id,
                    label: `${item.name} ${item.variant ? `(${item.variant})` : ''} (SKU: ${item.sku || 'N/A'}) - Total Stock: ${item.total_quantity !== undefined ? item.total_quantity : 'N/A'}`,
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

    // Effect to load storage locations for the location selection dropdown
    useEffect(() => {
        const loadStorageLocations = async () => {
            setIsLocationsLoading(true);
            try {
                const result = await window.electronAPI.getStorageLocations();
                if (result.success) {
                    setStorageLocationOptions(
                        result.locations.map(loc => ({ value: loc.id, label: loc.name }))
                    );
                } else {
                    setError(result.message || 'Could not load storage locations.');
                }
            } catch (err) {
                console.error("Error loading storage locations:", err);
                setError('Error loading storage locations.');
            } finally {
                setIsLocationsLoading(false);
            }
        };
        loadStorageLocations();
    }, []);

    // Effect to fetch current quantity when a specific item AND location are selected
    const fetchQtyAtLocation = useCallback(async () => {
        if (selectedItem && selectedItem.value && selectedLocation && selectedLocation.value) {
            setError(''); // Clear previous errors related to fetching qty
            try {
                // getItemById should now return a structure like:
                // { id, name, ..., total_quantity, locations: [{locationId, locationName, quantity}, ...] }
                const itemDetails = await window.electronAPI.getItemById(selectedItem.value);
                if (itemDetails && Array.isArray(itemDetails.locations)) {
                    const locData = itemDetails.locations.find(l => l.locationId === selectedLocation.value);
                    setCurrentQtyAtLocation(locData ? locData.quantity : 0); // If no record, assume 0 at this location
                } else {
                    setCurrentQtyAtLocation(0); // Item exists but no location data or not found at this location
                    if(itemDetails) console.warn("Item details fetched but no 'locations' array or it's not an array:", itemDetails);
                }
            } catch (err) {
                console.error("Error fetching quantity at selected location:", err);
                setCurrentQtyAtLocation(0); // Default to 0 on error
                setError("Failed to fetch current stock for the selected location.");
            }
        } else {
            setCurrentQtyAtLocation(0); // Reset if item or location is not fully selected
        }
    }, [selectedItem, selectedLocation]);

    useEffect(() => {
        fetchQtyAtLocation();
    }, [fetchQtyAtLocation]); // This effect runs when selectedItem or selectedLocation changes

    // Effect to calculate the new quantity at the location
    useEffect(() => {
        if (selectedItem && selectedLocation && adjustmentQuantity !== '') {
            const current = Number(currentQtyAtLocation);
            const adjustment = Number(adjustmentQuantity);
            if (!isNaN(current) && !isNaN(adjustment)) {
                setNewQuantityAtLocation(current + adjustment);
            } else {
                setNewQuantityAtLocation(null); // Invalid input for calculation
            }
        } else {
            setNewQuantityAtLocation(null); // Not enough info to calculate
        }
    }, [currentQtyAtLocation, adjustmentQuantity, selectedItem, selectedLocation]);

    const handleItemChange = (selectedOption) => {
        setSelectedItem(selectedOption);
        setSelectedLocation(null); // Reset location when item changes
        setAdjustmentQuantity('');
        setReason('');
        setNotes('');
        setCurrentQtyAtLocation(0);
        setNewQuantityAtLocation(null);
        setError('');
        setSuccessMessage('');
    };

    const handleLocationChange = (selectedOption) => {
        setSelectedLocation(selectedOption);
        setAdjustmentQuantity(''); // Reset quantity when location changes for the selected item
        setReason(''); // Reset reason
        setNotes(''); // Reset notes
        setNewQuantityAtLocation(null);
        // currentQtyAtLocation will be updated by the fetchQtyAtLocation effect
        setError('');
        setSuccessMessage('');
    };

    const handleQuantityChange = (e) => {
        const value = e.target.value;
        if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
            setAdjustmentQuantity(value);
        }
    };

    const resetFormForNextAdjustment = () => {
        setSelectedItem(null); // This will trigger dependent resets via handleItemChange if we call it
        setSelectedLocation(null);
        setAdjustmentQuantity('');
        setReason('');
        setNotes('');
        setCurrentQtyAtLocation(0);
        setNewQuantityAtLocation(null);
        // Do not clear successMessage here, it's handled by setTimeout
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (!selectedItem) { setError('Please select an item.'); return; }
        if (!selectedLocation) { setError('Please select a storage location for the adjustment.'); return; }
        if (adjustmentQuantity === '' || adjustmentQuantity === '-') { setError('Please enter a valid adjustment quantity.'); return; }

        const adjustmentQtyNum = Number(adjustmentQuantity);
        if (isNaN(adjustmentQtyNum) || adjustmentQtyNum === 0) { setError('Adjustment quantity must be a non-zero number.'); return; }
        if (!reason) { setError('Please select a reason for the adjustment.'); return; }
        if (reason === 'Other (Specify in Notes)' && !notes.trim()) { setError('Please provide details in Notes for "Other" reason.'); return; }

        if ((reason === 'Goods Received from Factory') && adjustmentQtyNum <= 0) {
            setError(`For "${reason}", adjustment quantity should be positive.`); return;
        }
        if (newQuantityAtLocation !== null && newQuantityAtLocation < 0) {
             if (reason !== 'Damaged Goods Write-off' && reason !== 'Expired Stock Write-off' && !reason.toLowerCase().includes('deduct')) {
                setError(`Resulting quantity at location (${newQuantityAtLocation}) cannot be negative. Current stock is ${currentQtyAtLocation}.`); return;
             }
        }

        setIsSubmitting(true);
        const adjustmentDetails = {
            itemId: selectedItem.value,
            locationId: selectedLocation.value, // Crucial for multi-location
            locationName: selectedLocation.label, // Optional: for better logging in main.js
            adjustmentQuantity: adjustmentQtyNum,
            reason: reason,
            notes: notes.trim() || null,
            userId: currentUser?.id,
            username: currentUser?.username,
        };

        try {
            const result = await window.electronAPI.performStockAdjustment(adjustmentDetails);
            if (result.success) {
                setSuccessMessage(result.message || 'Stock adjusted successfully!');
                resetFormForNextAdjustment();
                // Re-fetch items to update total stock in dropdown labels after a delay
                setTimeout(() => {
                    const loadItems = async () => { /* ... same as initial loadItems ... */ };
                    // loadItems(); // This could be too frequent if user makes many adjustments.
                    // Better: The fetchQtyAtLocation will run if they select the same item/location.
                }, 100); // Small delay
                setTimeout(() => setSuccessMessage(''), 7000);
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
                 <div className="form-header-left"> {/* Assuming this class is styled globally or in ProductFormPage.css */}
                     <div> {/* Extra div to contain h1 and p for flex alignment */}
                        <h1>Stock Adjustment (Per Location)</h1>
                         <p className="form-subtitle">Manually adjust inventory levels at specific storage locations.</p>
                     </div>
                 </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}
            {successMessage && <div className="success-message card" role="status">{successMessage}</div>}

            <form onSubmit={handleSubmit} className="stock-adjustment-form card"> {/* Uses classes from StockAdjustmentPage.css */}
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
                        styles={{ container: base => ({ ...base, zIndex: 11 }) }} // Higher zIndex
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="locationSelect">At Storage Location *</label>
                    <Select
                        id="locationSelect"
                        options={storageLocationOptions}
                        value={selectedLocation}
                        onChange={handleLocationChange}
                        isLoading={isLocationsLoading}
                        isClearable
                        placeholder="Select location for adjustment..."
                        styles={{ container: base => ({ ...base, zIndex: 10 }) }}
                        isDisabled={!selectedItem} // Enable only after item is selected
                        required
                    />
                    {selectedItem && selectedLocation && (
                        <p className="current-stock-info">
                            <FaInfoCircle /> Current Stock at {selectedLocation.label}: {currentQtyAtLocation}
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
                        disabled={!selectedItem || !selectedLocation}
                    />
                     <small className="form-text text-muted">
                        Enter a positive number to add stock, a negative number to deduct stock.
                    </small>
                </div>

                 {newQuantityAtLocation !== null && selectedItem && selectedLocation && ( // Show only if relevant
                     <div className="form-group calculated-quantity">
                        <label>Resulting Quantity at {selectedLocation.label}:</label>
                         <span className={`quantity-value ${newQuantityAtLocation < 0 ? 'negative' : ''}`}>
                            {newQuantityAtLocation}
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
                        disabled={!selectedItem || !selectedLocation}
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
                        disabled={!selectedItem || !selectedLocation}
                        required={reason === 'Other (Specify in Notes)'}
                    ></textarea>
                </div>

                <div className="form-actions">
                    <button
                        type="submit"
                        className="button button-primary save-button"
                        disabled={
                            isSubmitting ||
                            !selectedItem ||
                            !selectedLocation ||
                            !reason ||
                            adjustmentQuantity === '' ||
                            adjustmentQuantity === '-' ||
                            newQuantityAtLocation === null ||
                            (newQuantityAtLocation < 0 &&
                                reason !== 'Damaged Goods Write-off' &&
                                reason !== 'Expired Stock Write-off' &&
                                !reason.toLowerCase().includes('deduct'))
                        }
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