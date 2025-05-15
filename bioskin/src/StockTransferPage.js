// src/StockTransferPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { FaExchangeAlt, FaSave, FaInfoCircle } from 'react-icons/fa';
import './StockAdjustmentPage.css'; // Assuming you reuse styles

function StockTransferPage({ currentUser }) {
    const navigate = useNavigate();

    const [selectedItemOption, setSelectedItemOption] = useState(null);
    const [itemDetails, setItemDetails] = useState(null); // Stores full item object with .locations array

    const [quantityToTransfer, setQuantityToTransfer] = useState('');
    const [sourceLocationOption, setSourceLocationOption] = useState(null);
    const [destinationLocationOption, setDestinationLocationOption] = useState(null);
    const [notes, setNotes] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [itemMasterOptions, setItemMasterOptions] = useState([]);
    const [allStorageLocationOptions, setAllStorageLocationOptions] = useState([]);
    const [sourceLocationDropdownOptions, setSourceLocationDropdownOptions] = useState([]);

    const [isLoadingMasters, setIsLoadingMasters] = useState(false);
    const [isLoadingItemDetails, setIsLoadingItemDetails] = useState(false);

    // Effect to load initial master item list and all storage locations
    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoadingMasters(true);
            setError('');
            try {
                // --- MODIFICATION: Ensure getItems returns total_quantity ---
                const itemsRes = await window.electronAPI.getItems({ is_archived: false });
                const locationsRes = await window.electronAPI.getStorageLocations();

                if (itemsRes && Array.isArray(itemsRes)) {
                    setItemMasterOptions(itemsRes.map(item => ({
                        value: item.id,
                        // Use item.total_quantity for the label
                        label: `${item.name} (SKU: ${item.sku || 'N/A'}) - Total Stock: ${item.total_quantity !== undefined ? item.total_quantity : 'N/A'}`,
                        // Store total_quantity here if needed for initial rough checks, but per-location is key
                        // For the selectedItemOption, we'll primarily rely on fetching full itemDetails later.
                    })));
                } else {
                    console.error("Failed to load items or invalid format:", itemsRes);
                    setError(prev => `${prev} Failed to load products.`.trim());
                }

                if (locationsRes && locationsRes.success && Array.isArray(locationsRes.locations)) {
                    setAllStorageLocationOptions(locationsRes.locations.map(loc => ({
                        value: loc.id,
                        label: loc.name
                    })));
                } else {
                    console.error("Failed to load storage locations or invalid format:", locationsRes);
                    setError(prev => `${prev} Failed to load storage locations.`.trim());
                }

            } catch (err) {
                console.error("Error fetching initial data for transfer page:", err);
                setError('Could not load necessary data. ' + err.message);
            } finally {
                setIsLoadingMasters(false);
            }
        };
        loadInitialData();
    }, []);

    // Effect to fetch detailed location stock for the selected item
    useEffect(() => {
        if (selectedItemOption && selectedItemOption.value) {
            const fetchItemLocationDetails = async () => {
                setIsLoadingItemDetails(true);
                setSourceLocationDropdownOptions([]);
                setSourceLocationOption(null);
                setDestinationLocationOption(null);
                setQuantityToTransfer('');
                try {
                    // getItemById should return an object with a 'locations' array:
                    // { ..., locations: [{ locationId, locationName, quantity }, ...] }
                    const details = await window.electronAPI.getItemById(selectedItemOption.value);
                    if (details && Array.isArray(details.locations)) {
                        setItemDetails(details); // Store full details including the locations array
                        const sources = details.locations
                            .filter(loc => loc.quantity > 0)
                            .map(loc => ({
                                value: loc.locationId,
                                label: `${loc.locationName} (Available: ${loc.quantity})`,
                                currentQtyAtSource: loc.quantity // This is qty at THIS specific location
                            }));
                        setSourceLocationDropdownOptions(sources);
                    } else {
                        setItemDetails(null);
                        setSourceLocationDropdownOptions([]); // Clear if no valid details
                        setError("Could not fetch item's location details or no stock found anywhere.");
                    }
                } catch (err) {
                    console.error("Error fetching item location details:", err);
                    setError("Error fetching item location details: " + err.message);
                    setItemDetails(null);
                    setSourceLocationDropdownOptions([]);
                } finally {
                    setIsLoadingItemDetails(false);
                }
            };
            fetchItemLocationDetails();
        } else {
            setItemDetails(null);
            setSourceLocationDropdownOptions([]);
            setSourceLocationOption(null);
        }
    }, [selectedItemOption]);


    const handleItemMasterChange = (selectedOption) => {
        setSelectedItemOption(selectedOption);
        setSourceLocationOption(null);
        setDestinationLocationOption(null);
        setQuantityToTransfer('');
        setNotes('');
        setReferenceNumber('');
        setError('');
        setSuccessMessage('');
    };

    const handleSourceLocationChange = (selectedOption) => {
        setSourceLocationOption(selectedOption);
        setDestinationLocationOption(null);
        setQuantityToTransfer('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        const qty = parseInt(quantityToTransfer, 10);

        if (!selectedItemOption) { setError('Please select an item.'); return; }
        if (!sourceLocationOption) { setError('Please select a source location.'); return; }
        if (!destinationLocationOption) { setError('Please select a destination location.'); return; }
        if (isNaN(qty) || qty <= 0) { setError('Please enter a valid positive quantity to transfer.'); return; }
        if (sourceLocationOption.value === destinationLocationOption.value) { setError('Source and destination locations cannot be the same.'); return; }

        // --- MODIFICATION: Validate against currentQtyAtSource from sourceLocationOption ---
        if (qty > sourceLocationOption.currentQtyAtSource) {
            setError(`Cannot transfer ${qty}. Only ${sourceLocationOption.currentQtyAtSource} available at "${sourceLocationOption.label.split(' (Available:')[0]}".`);
            return;
        }
        // --- END MODIFICATION ---

        setIsSubmitting(true);
        const transferDetailsPayload = {
            itemId: selectedItemOption.value,
            quantityTransferred: qty,
            sourceLocationId: sourceLocationOption.value,
            destinationLocationId: destinationLocationOption.value,
            sourceLocationName: sourceLocationOption.label.split(' (Available:')[0], // Get name part
            destinationLocationName: destinationLocationOption.label,
            notes: notes.trim(),
            referenceNumber: referenceNumber.trim() || null,
        };

        try {
            const result = await window.electronAPI.createStockTransfer(transferDetailsPayload);
            if (result.success) {
                setSuccessMessage(result.message || 'Stock transferred successfully!');
                setSelectedItemOption(null); // This will clear itemDetails, source options, etc., via useEffect
                // No need to manually reset other dependent states here if useEffect for selectedItemOption handles it
                setNotes('');
                setReferenceNumber('');

                // Re-fetch the master item list to update total quantities in the dropdown
                // This is important if the user wants to perform another transfer immediately
                // and see updated totals.
                setIsLoadingMasters(true); // Show loading for item list refresh
                const itemsRes = await window.electronAPI.getItems({ is_archived: false });
                if (itemsRes && Array.isArray(itemsRes)) {
                    setItemMasterOptions(itemsRes.map(item => ({
                        value: item.id,
                        label: `${item.name} (SKU: ${item.sku || 'N/A'}) - Total Stock: ${item.total_quantity !== undefined ? item.total_quantity : 'N/A'}`,
                    })));
                }
                setIsLoadingMasters(false);


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

    const availableDestinationOptions = allStorageLocationOptions.filter(
        opt => !sourceLocationOption || opt.value !== sourceLocationOption.value
    );

    return (
        <div className="stock-adjustment-page page-container">
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
                        options={itemMasterOptions}
                        value={selectedItemOption}
                        onChange={handleItemMasterChange}
                        isLoading={isLoadingMasters}
                        isClearable
                        placeholder="Search or select product..."
                        styles={{ container: base => ({ ...base, zIndex: 11 }) }}
                        required
                    />
                </div>

                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="sourceLocation">From Location (Source) *</label>
                        <Select
                            id="sourceLocation"
                            options={sourceLocationDropdownOptions}
                            value={sourceLocationOption}
                            onChange={handleSourceLocationChange}
                            isLoading={isLoadingItemDetails}
                            isDisabled={!selectedItemOption || isLoadingItemDetails || sourceLocationDropdownOptions.length === 0}
                            placeholder={!selectedItemOption ? "Select item first" : (isLoadingItemDetails ? "Loading sources..." : (sourceLocationDropdownOptions.length === 0 && itemDetails ? "No stock at any location" : "Select source..."))}
                            styles={{ container: base => ({ ...base, zIndex: 10 }) }}
                            required
                        />
                        {sourceLocationOption && (
                             <p className="current-stock-info" style={{marginTop:'0.25rem', fontSize:'0.8em'}}>
                                <FaInfoCircle /> Available to transfer: {sourceLocationOption.currentQtyAtSource}
                            </p>
                        )}
                    </div>
                    <div className="form-group form-group-inline">
                        <label htmlFor="destinationLocation">To Location (Destination) *</label>
                        <Select
                            id="destinationLocation"
                            options={availableDestinationOptions}
                            value={destinationLocationOption}
                            onChange={setDestinationLocationOption}
                            isDisabled={!sourceLocationOption}
                            placeholder={!sourceLocationOption ? "Select source first" : "Select destination..."}
                            styles={{ container: base => ({ ...base, zIndex: 9 }) }}
                            required
                        />
                    </div>
                </div>

                 <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="quantityTransfer">Quantity to Transfer *</label>
                        <input
                            id="quantityTransfer" type="number" value={quantityToTransfer}
                            onChange={(e) => setQuantityToTransfer(e.target.value)}
                            placeholder="e.g., 10" className="form-control" min="1"
                            required disabled={!destinationLocationOption}
                        />
                    </div>
                    <div className="form-group form-group-inline">
                         <label htmlFor="referenceNumber">Reference # (Optional)</label>
                         <input
                            type="text" id="referenceNumber" value={referenceNumber}
                            onChange={(e) => setReferenceNumber(e.target.value)}
                            placeholder="e.g., TRN-001" className="form-control"
                            disabled={!selectedItemOption}
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label htmlFor="notesTransfer">Notes (Optional)</label>
                    <textarea
                        id="notesTransfer" value={notes} onChange={(e) => setNotes(e.target.value)}
                        rows="3" className="form-control" placeholder="Reason for transfer, additional details..."
                        disabled={!selectedItemOption}
                    />
                </div>

                <div className="form-actions">
                    <button type="button" className="button button-secondary" onClick={() => navigate('/')} disabled={isSubmitting} style={{marginRight: '1rem'}}>
                        Cancel
                    </button>
                    <button type="submit" className="button button-primary save-button"
                        disabled={
                            isSubmitting ||
                            !selectedItemOption ||
                            !sourceLocationOption ||
                            !destinationLocationOption ||
                            !quantityToTransfer ||
                            parseInt(quantityToTransfer) <=0 ||
                            (sourceLocationOption && parseInt(quantityToTransfer) > sourceLocationOption.currentQtyAtSource) ||
                            (sourceLocationOption && destinationLocationOption && sourceLocationOption.value === destinationLocationOption.value)
                        }
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