// src/ReturnProcessingPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUndo, FaSave, FaHistory } from 'react-icons/fa'; // FaSearch and FaTimes are not used, can be removed
import Select from 'react-select';

// Basic styling (inline for this component)
const styles = {
    page: {
        padding: '2rem',
        // Assuming .page-container in a parent or global CSS handles max-width and centering
    },
    // --- MODIFICATION START: Added header and button styles ---
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--color-border-soft, #eee)', // Use CSS var or fallback
    },
    headerTitle: {
        margin: 0, // Remove default h1 margin
        fontSize: '1.8em', // Match other page titles if desired
        color: 'var(--color-text-dark, #333)'
    },
    viewHistoryButton: {
        padding: '0.6rem 1.2rem',
        border: '1px solid var(--color-primary-dark, #5C3221)',
        borderRadius: 'var(--border-radius, 4px)',
        cursor: 'pointer',
        backgroundColor: 'var(--color-primary-light, #F5F0E8)',
        color: 'var(--color-primary-dark, #5C3221)',
        fontWeight: '500',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '0.9em', // Slightly smaller than main action buttons
        transition: 'background-color 0.2s ease, color 0.2s ease',
    },
    // --- MODIFICATION END ---
    card: {
        background: 'var(--color-surface, #fff)', // Use CSS var or fallback
        padding: '2rem',
        borderRadius: 'var(--border-radius-rounded, 8px)',
        boxShadow: 'var(--box-shadow, 0 2px 8px rgba(0,0,0,0.1))',
        marginBottom: '1rem',
        border: '1px solid var(--color-border-soft, #eee)',
    },
    formGroup: {
        marginBottom: '1.5rem'
    },
    label: {
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: '600',
        color: 'var(--color-text-medium, #555)'
    },
    input: { // Also used for select dropdowns for consistency
        width: '100%',
        padding: '0.8rem',
        border: '1px solid var(--color-border-strong, #ccc)',
        borderRadius: 'var(--border-radius, 4px)',
        boxSizing: 'border-box',
        fontSize: '1em',
        backgroundColor: 'var(--color-surface, #fff)',
        color: 'var(--color-text-dark, #333)',
    },
    select: {
        // react-select specific styles can be passed via its `styles` prop if more customization is needed
    },
    textarea: {
        width: '100%',
        padding: '0.8rem',
        border: '1px solid var(--color-border-strong, #ccc)',
        borderRadius: 'var(--border-radius, 4px)',
        minHeight: '80px',
        boxSizing: 'border-box',
        fontSize: '1em',
        backgroundColor: 'var(--color-surface, #fff)',
        color: 'var(--color-text-dark, #333)',
    },
    button: { // Base style for action buttons
        padding: '0.8rem 1.5rem',
        border: 'none',
        borderRadius: 'var(--border-radius, 4px)',
        cursor: 'pointer',
        marginRight: '0.5rem',
        fontWeight: '600', // Bolder action buttons
        fontSize: '1em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'opacity 0.2s ease',
    },
    saveButton: {
        backgroundColor: 'var(--color-primary-dark, #5C3221)',
        color: 'var(--color-primary-light, #F5F0E8)',
    },
    cancelButton: {
        backgroundColor: 'var(--color-surface-alt, #eee)', // Slightly different background
        color: 'var(--color-text-dark, #333)',
        border: '1px solid var(--color-border-strong, #ccc)',
    },
    error: { // For error messages
        color: 'var(--color-status-danger, red)',
        backgroundColor: 'rgba(211, 47, 47, 0.05)', // Lighter version of error bg
        padding: '1rem', // Match card padding
        // borderRadius: 'var(--border-radius-rounded, 8px)', // Inherited from card
        // marginBottom: '1rem', // Inherited from card
        border: '1px solid var(--color-status-danger, red)',
        // boxShadow: 'var(--box-shadow, 0 2px 8px rgba(0,0,0,0.1))', // Inherited from card
    },
    success: { // For success messages
        color: 'var(--color-status-success, green)',
        backgroundColor: 'rgba(56, 142, 60, 0.05)', // Lighter version of success bg
        padding: '1rem',
        // borderRadius: 'var(--border-radius-rounded, 8px)',
        // marginBottom: '1rem',
        border: '1px solid var(--color-status-success, green)',
        // boxShadow: 'var(--box-shadow, 0 2px 8px rgba(0,0,0,0.1))',
    },
    // searchResult and searchResultHover are not used in this component currently
};


function ReturnProcessingPage({ currentUser }) { // Added currentUser prop
    const navigate = useNavigate();
    const [selectedItem, setSelectedItem] = useState(null);
    const [quantityReturned, setQuantityReturned] = useState(1);
    const [reason, setReason] = useState('');
    const [condition, setCondition] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);

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
        const loadItems = async () => {
            setIsItemsLoading(true);
            try {
                const items = await window.electronAPI.getItems({ is_archived: false }); // Fetch only active items
                const options = items.map(item => ({
                    value: item.id,
                    label: `${item.name} ${item.variant ? `(${item.variant})` : ''} - SKU: ${item.sku || 'N/A'}`
                }));
                setItemOptions(options);
            } catch (err) {
                console.error("Error fetching items for dropdown:", err);
                setError('Could not load product list.');
            } finally {
                setIsItemsLoading(false);
            }
        };
        loadItems();
    }, []);

     useEffect(() => {
        const loadCustomers = async () => {
            setIsCustomersLoading(true);
            try {
                const customers = await window.electronAPI.getCustomers({});
                 const options = customers.map(cust => ({
                    value: cust.id,
                    label: `${cust.full_name}`
                 }));
                 setCustomerOptions(options);
            } catch (err) {
                console.error("Error fetching customers for dropdown:", err);
            } finally {
                setIsCustomersLoading(false);
            }
        };
        loadCustomers();
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

        setIsSubmitting(true);

        const returnDetails = {
            itemId: selectedItem.value,
            quantityReturned: qty,
            reason: reason,
            condition: condition,
            customerId: selectedCustomer ? selectedCustomer.value : null,
            notes: notes,
            // processed_by_user_id will be added by main.js from currentUser
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
                 setTimeout(() => setSuccessMessage(''), 5000);
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

    return (
        <div style={styles.page} className="page-container"> {/* Added global page-container class */}
            <header style={styles.header}> {/* Using header style from const */}
                <h1 style={styles.headerTitle}>Process Product Return</h1>
                <button
                    style={styles.viewHistoryButton}
                    onClick={() => navigate('/returns')}
                    title="View all processed returns"
                >
                    <FaHistory /> View Return History
                </button>
            </header>

             {error && <div style={{...styles.card, ...styles.error}}>{error}</div>}
             {successMessage && <div style={{...styles.card, ...styles.success}}>{successMessage}</div>}

            <form onSubmit={handleSubmit} style={styles.card}>
                <div style={styles.formGroup}>
                    <label htmlFor="itemSelect" style={styles.label}>Select Item Returned *</label>
                    <Select
                        id="itemSelect"
                        options={itemOptions}
                        value={selectedItem}
                        onChange={setSelectedItem}
                        isLoading={isItemsLoading}
                        isClearable
                        placeholder="Search or select product by Name/SKU..."
                        styles={{
                            control: (baseStyles) => ({
                                ...baseStyles,
                                borderColor: 'var(--color-border-strong, #ccc)',
                                minHeight: 'calc(0.8rem * 2 + 1em + 2px)', // Approximate match to input padding
                                padding: '0.1rem', // Slight inner padding for select
                            }),
                            container: (base) => ({ ...base, zIndex: 10 })
                        }}
                        required
                    />
                </div>

                 <div style={styles.formGroup}>
                    <label htmlFor="quantity" style={styles.label}>Quantity Returned *</label>
                    <input
                        id="quantity"
                        type="number"
                        min="1"
                        value={quantityReturned}
                        onChange={(e) => setQuantityReturned(e.target.value)}
                        style={styles.input}
                        required
                    />
                </div>

                 <div style={styles.formGroup}>
                    <label htmlFor="reason" style={styles.label}>Reason for Return *</label>
                    <select
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        style={styles.input}
                        required
                    >
                        <option value="" disabled>-- Select Reason --</option>
                        {reasonOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                 </div>

                 <div style={styles.formGroup}>
                    <label htmlFor="condition" style={styles.label}>Item Condition *</label>
                    <select
                        id="condition"
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                        style={styles.input}
                        required
                    >
                        <option value="" disabled>-- Select Condition --</option>
                         {conditionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                     <small style={{display: 'block', marginTop: '5px', color: 'var(--color-text-light, #777)'}}>
                         Select 'Resellable' ONLY if the item can go directly back into stock.
                     </small>
                 </div>

                <div style={styles.formGroup}>
                    <label htmlFor="customerSelect" style={styles.label}>Customer (Optional)</label>
                    <Select
                        id="customerSelect"
                        options={customerOptions}
                        value={selectedCustomer}
                        onChange={setSelectedCustomer}
                        isLoading={isCustomersLoading}
                        isClearable
                        placeholder="Search or select customer..."
                        styles={{
                             control: (baseStyles) => ({
                                ...baseStyles,
                                borderColor: 'var(--color-border-strong, #ccc)',
                                minHeight: 'calc(0.8rem * 2 + 1em + 2px)',
                                padding: '0.1rem',
                            }),
                            container: (base) => ({ ...base, zIndex: 9 })
                        }}
                    />
                </div>

                 <div style={styles.formGroup}>
                    <label htmlFor="notes" style={styles.label}>Notes (Optional)</label>
                    <textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        style={styles.textarea}
                        rows="3"
                        placeholder="Any additional details about the return..."
                    />
                 </div>

                 <div style={{ textAlign: 'right', marginTop: '2rem' }}>
                    <button
                        type="button"
                        onClick={() => navigate('/')} // Or navigate back to dashboard
                        style={{...styles.button, ...styles.cancelButton}}
                        disabled={isSubmitting}
                        className="button button-secondary" // Added global button classes
                    >
                         Cancel
                    </button>
                     <button
                        type="submit"
                        style={{...styles.button, ...styles.saveButton}}
                        disabled={isSubmitting || !selectedItem || !reason || !condition || parseInt(quantityReturned) <= 0}
                        className="button button-primary" // Added global button classes
                     >
                        <FaSave /> {/* Icon already has margin from gap in styles.button */}
                        {isSubmitting ? 'Processing...' : 'Process Return'}
                     </button>
                 </div>
            </form>
        </div>
    );
}

export default ReturnProcessingPage;