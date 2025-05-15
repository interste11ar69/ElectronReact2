// src/ReturnProcessingPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUndo, FaSave, FaHistory } from 'react-icons/fa';
import Select from 'react-select';
import './ReturnProcessingPage.css'; // Import the CSS file

// react-select custom styles (can also be moved to CSS with global overrides or a wrapper)
const reactSelectStyles = {
    control: (baseStyles, state) => ({
        ...baseStyles,
        borderColor: state.isFocused ? 'var(--color-primary-dark, #5C3221)' : 'var(--color-border-strong, #ccc)',
        minHeight: 'calc(0.8rem * 2 + 1em + 2px)', // Matches input padding and line height approximately
        padding: '0.1rem',
        boxShadow: state.isFocused ? '0 0 0 0.2rem var(--focus-ring-color, rgba(92, 50, 33, 0.25))' : 'none',
        '&:hover': {
            borderColor: 'var(--color-border-strong, #999)',
        },
        fontSize: '1em', // Ensure consistent font size with inputs
    }),
    valueContainer: (baseStyles) => ({
        ...baseStyles,
        padding: '0px 6px'
    }),
    input: (baseStyles) => ({
        ...baseStyles,
        margin: '0px',
        padding: '0px'
    }),
    placeholder: (baseStyles) => ({
        ...baseStyles,
        color: 'var(--color-text-light, #aaa)',
    }),
    menu: base => ({ ...base, zIndex: 20 }) // Ensure dropdown menu is on top
};


function ReturnProcessingPage({ currentUser }) {
    const navigate = useNavigate();
    const [selectedItem, setSelectedItem] = useState(null);
    const [quantityReturned, setQuantityReturned] = useState(1);
    const [reason, setReason] = useState('');
    const [condition, setCondition] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [selectedReturnLocation, setSelectedReturnLocation] = useState(null);
    const [storageLocationOptions, setStorageLocationOptions] = useState([]);
    const [isLocationsLoading, setIsLocationsLoading] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [itemOptions, setItemOptions] = useState([]);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false);
    const [isCustomersLoading, setIsCustomersLoading] = useState(false);

    const reasonOptions = ['Damaged', 'Defective', 'Wrong Item Shipped', 'Wrong Size/Color', 'Unwanted', 'Warranty Claim', 'Other'];
    const conditionOptions = ['Resellable', 'Damaged', 'Requires Inspection', 'Open Box'];

    useEffect(() => {
        const loadInitialData = async () => {
            setIsItemsLoading(true);
            setIsCustomersLoading(true);
            setIsLocationsLoading(true);
            try {
                const [itemsRes, customersRes, locationsRes] = await Promise.all([
                    window.electronAPI.getItems({ is_archived: false }),
                    window.electronAPI.getCustomers({}),
                    window.electronAPI.getStorageLocations()
                ]);

                if (itemsRes && Array.isArray(itemsRes)) {
                    setItemOptions(itemsRes.map(item => ({
                        value: item.id,
                        label: `${item.name} ${item.variant ? `(${item.variant})` : ''} - SKU: ${item.sku || 'N/A'}`
                    })));
                } else { throw new Error("Failed to load items or invalid format."); }

                if (customersRes && Array.isArray(customersRes)) {
                    setCustomerOptions(customersRes.map(cust => ({ value: cust.id, label: cust.full_name })));
                } else { console.warn("Failed to load customers or invalid format."); }

                if (locationsRes && locationsRes.success && Array.isArray(locationsRes.locations)) {
                    setStorageLocationOptions(locationsRes.locations.map(loc => ({ value: loc.id, label: loc.name })));
                } else {
                    console.warn("Failed to load storage locations. Please ensure backend is set up.", locationsRes);
                    setError("Could not load storage locations. Please check system configuration.");
                }

            } catch (err) {
                console.error("Error loading initial data for return page:", err);
                setError('Could not load all necessary data. ' + err.message);
            } finally {
                setIsItemsLoading(false);
                setIsCustomersLoading(false);
                setIsLocationsLoading(false);
            }
        };
        loadInitialData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (!selectedItem || !quantityReturned || !reason || !condition) {
            setError('Please select an item and fill in Quantity, Reason, and Condition.');
            return;
        }
        const qty = parseInt(quantityReturned, 10);
        if (isNaN(qty) || qty <= 0) {
             setError('Quantity must be a positive number.');
             return;
        }
        if (condition === 'Resellable' && !selectedReturnLocation) {
            setError('Please select a location to return the "Resellable" item to.');
            return;
        }

        setIsSubmitting(true);
        const returnDetails = {
            itemId: selectedItem.value,
            quantityReturned: qty,
            reason: reason,
            condition: condition,
            customerId: selectedCustomer ? selectedCustomer.value : null,
            notes: notes.trim(),
            returnToLocationId: condition === 'Resellable' ? selectedReturnLocation?.value : null,
            returnToLocationName: condition === 'Resellable' ? selectedReturnLocation?.label : null,
        };

        try {
            const result = await window.electronAPI.processReturn(returnDetails);
            if (result.success) {
                setSuccessMessage(result.message || 'Return processed successfully!');
                setSelectedItem(null);
                setQuantityReturned(1);
                setReason('');
                setCondition('');
                setNotes('');
                setSelectedCustomer(null);
                setSelectedReturnLocation(null);
                 setTimeout(() => setSuccessMessage(''), 7000);
            } else {
                setError(result.message || 'Failed to process return.');
            }
        } catch (err) {
            console.error("Error submitting return:", err);
            setError(`An unexpected error occurred: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        if (condition !== 'Resellable') {
            setSelectedReturnLocation(null);
        }
    }, [condition]);

    return (
        <div className="return-processing-page page-container">
            <header className="page-header-alt rpp-header"> {/* Added rpp-header class */}
                <h1 className="rpp-header-title">Process Product Return</h1>
                <button
                    className="button button-outline view-history-btn" // Use global button classes
                    onClick={() => navigate('/returns')}
                    title="View all processed returns"
                >
                    <FaHistory style={{ marginRight: '8px' }} /> View Return History
                </button>
            </header>

             {error && <div className="error-message card">{error}</div>}
             {successMessage && <div className="success-message card">{successMessage}</div>}

            <form onSubmit={handleSubmit} className="card rpp-form"> {/* Added rpp-form class */}
                <div className="form-group">
                    <label htmlFor="itemSelect" className="form-label">Select Item Returned *</label>
                    <Select
                        id="itemSelect"
                        options={itemOptions}
                        value={selectedItem}
                        onChange={setSelectedItem}
                        isLoading={isItemsLoading}
                        isClearable
                        placeholder="Search or select product..."
                        styles={{...reactSelectStyles, container: (base) => ({ ...base, zIndex: 10 })}}
                        classNamePrefix="react-select" // For easier global CSS targeting if needed
                        required
                    />
                </div>

                 <div className="form-group">
                    <label htmlFor="quantity" className="form-label">Quantity Returned *</label>
                    <input id="quantity" type="number" min="1" value={quantityReturned}
                        onChange={(e) => setQuantityReturned(e.target.value)} className="form-control" required />
                </div>

                 <div className="form-group">
                    <label htmlFor="reason" className="form-label">Reason for Return *</label>
                    <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="form-control" required >
                        <option value="" disabled>-- Select Reason --</option>
                        {reasonOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                 </div>

                 <div className="form-group">
                    <label htmlFor="condition" className="form-label">Item Condition *</label>
                    <select id="condition" value={condition} onChange={(e) => setCondition(e.target.value)} className="form-control" required >
                        <option value="" disabled>-- Select Condition --</option>
                         {conditionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                 </div>

                {condition === 'Resellable' && (
                    <div className="form-group">
                        <label htmlFor="returnLocation" className="form-label">Return to Location *</label>
                        <Select
                            id="returnLocation"
                            options={storageLocationOptions}
                            value={selectedReturnLocation}
                            onChange={setSelectedReturnLocation}
                            isLoading={isLocationsLoading}
                            isClearable
                            placeholder="Select location to restock..."
                            styles={{...reactSelectStyles, container: (base) => ({ ...base, zIndex: 9 })}}
                            classNamePrefix="react-select"
                            required={condition === 'Resellable'}
                        />
                         <small className="form-text text-muted"> {/* Assuming global .form-text .text-muted */}
                            This item will be added back to stock at the selected location.
                        </small>
                    </div>
                )}

                <div className="form-group">
                    <label htmlFor="customerSelect" className="form-label">Customer (Optional)</label>
                    <Select
                        id="customerSelect"
                        options={customerOptions}
                        value={selectedCustomer}
                        onChange={setSelectedCustomer}
                        isLoading={isCustomersLoading}
                        isClearable
                        placeholder="Search or select customer..."
                        styles={{...reactSelectStyles, container: (base) => ({ ...base, zIndex: 8 })}}
                        classNamePrefix="react-select"
                    />
                </div>

                 <div className="form-group">
                    <label htmlFor="notes" className="form-label">Notes (Optional)</label>
                    <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                        className="form-control" rows="3" placeholder="Any additional details about the return..." />
                 </div>

                 <div className="form-actions rpp-form-actions"> {/* Added rpp-form-actions class */}
                    <button type="button" onClick={() => navigate(-1)}
                        className="button button-secondary" disabled={isSubmitting}>
                         Cancel
                    </button>
                     <button type="submit"
                        className="button button-primary"
                        disabled={isSubmitting || !selectedItem || !reason || !condition || parseInt(quantityReturned) <= 0 || (condition === 'Resellable' && !selectedReturnLocation)} >
                        <FaSave style={{ marginRight: '8px' }} />
                        {isSubmitting ? 'Processing...' : 'Process Return'}
                     </button>
                 </div>
            </form>
        </div>
    );
}

export default ReturnProcessingPage;