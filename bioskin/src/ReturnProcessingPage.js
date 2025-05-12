// src/ReturnProcessingPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUndo, FaSave, FaSearch, FaTimes } from 'react-icons/fa'; // Example icons
import Select from 'react-select'; // Using react-select for searchable dropdowns
// You might need to install react-select: npm install react-select

// Basic styling (create/add to a CSS file)
const styles = {
    page: { padding: '2rem' },
    card: { background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '1rem' },
    formGroup: { marginBottom: '1.5rem' },
    label: { display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#555' },
    input: { width: '100%', padding: '0.8rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' },
    select: { /* react-select handles its own styling mostly */ },
    textarea: { width: '100%', padding: '0.8rem', border: '1px solid #ccc', borderRadius: '4px', minHeight: '80px', boxSizing: 'border-box' },
    button: { padding: '0.8rem 1.5rem', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '0.5rem', fontWeight: '500' },
    saveButton: { backgroundColor: 'var(--color-primary-dark)', color: 'white' },
    cancelButton: { backgroundColor: '#eee', color: '#333' },
    error: { color: 'red', background: '#ffebee', padding: '0.8rem', borderRadius: '4px', marginBottom: '1rem', border: '1px solid red'},
    success: { color: 'green', background: '#e8f5e9', padding: '0.8rem', borderRadius: '4px', marginBottom: '1rem', border: '1px solid green'},
    searchResult: { padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #eee' },
    searchResultHover: { backgroundColor: '#f0f0f0' }
};


function ReturnProcessingPage() {
    const navigate = useNavigate();
    const [selectedItem, setSelectedItem] = useState(null); // { value: id, label: 'Name (SKU)' }
    const [quantityReturned, setQuantityReturned] = useState(1);
    const [reason, setReason] = useState('');
    const [condition, setCondition] = useState(''); // e.g., 'Resellable', 'Damaged'
    const [notes, setNotes] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null); // Optional { value: id, label: 'Name' }

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // --- Data for Selects ---
    const [itemOptions, setItemOptions] = useState([]);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false);
    const [isCustomersLoading, setIsCustomersLoading] = useState(false);

    // Predefined options
    const reasonOptions = ['Damaged', 'Defective', 'Wrong Item Shipped', 'Wrong Size/Color', 'Unwanted', 'Warranty Claim', 'Other'];
    const conditionOptions = ['Resellable', 'Damaged', 'Requires Inspection', 'Open Box']; // Customize as needed

    // --- Fetch Items for Select ---
     useEffect(() => {
        const loadItems = async () => {
            setIsItemsLoading(true);
            try {
                // Fetch only essential fields for the dropdown
                // You might need a dedicated backend function or adjust getItems
                const items = await window.electronAPI.getItems({}); // Fetch all for dropdown initially
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

     // --- Fetch Customers for Select (Optional) ---
     useEffect(() => {
        const loadCustomers = async () => {
            setIsCustomersLoading(true);
            try {
                const customers = await window.electronAPI.getCustomers({}); // Fetch all
                 const options = customers.map(cust => ({
                    value: cust.id,
                    label: `${cust.full_name}`
                 }));
                 setCustomerOptions(options);
            } catch (err) {
                console.error("Error fetching customers for dropdown:", err);
                // Non-critical error, don't block the form
            } finally {
                setIsCustomersLoading(false);
            }
        };
        loadCustomers();
    }, []);


    // --- Form Submission ---
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
        };

        try {
            console.log("Submitting return:", returnDetails);
            const result = await window.electronAPI.processReturn(returnDetails);
            console.log("Return result:", result);

            if (result.success) {
                setSuccessMessage(result.message || 'Return processed successfully!');
                // Reset form partially or fully
                setSelectedItem(null);
                setQuantityReturned(1);
                setReason('');
                setCondition('');
                setNotes('');
                setSelectedCustomer(null);
                // Optionally navigate away or show success longer
                 setTimeout(() => setSuccessMessage(''), 5000); // Clear success after 5s
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
        <div style={styles.page}>
            <h1>Process Product Return</h1>

             {error && <div style={styles.error}>{error}</div>}
             {successMessage && <div style={styles.success}>{successMessage}</div>}

            <form onSubmit={handleSubmit} style={styles.card}>
                 {/* Item Selection */}
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
                        styles={{ // Optional: customize react-select styles
                            container: (base) => ({ ...base, zIndex: 10 }) // Ensure dropdown overlaps
                        }}
                    />
                </div>

                 {/* Quantity */}
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

                 {/* Reason */}
                 <div style={styles.formGroup}>
                    <label htmlFor="reason" style={styles.label}>Reason for Return *</label>
                    <select
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        style={styles.input} // Use input style for consistency
                        required
                    >
                        <option value="" disabled>-- Select Reason --</option>
                        {reasonOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                 </div>

                  {/* Condition */}
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
                     <small style={{display: 'block', marginTop: '5px', color: '#777'}}>
                         Select 'Resellable' ONLY if the item can go directly back into stock.
                     </small>
                 </div>

                  {/* Customer Selection (Optional) */}
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
                         styles={{ // Optional: customize react-select styles
                            container: (base) => ({ ...base, zIndex: 9 }) // Ensure dropdown overlaps
                        }}
                    />
                </div>


                 {/* Notes */}
                 <div style={styles.formGroup}>
                    <label htmlFor="notes" style={styles.label}>Notes (Optional)</label>
                    <textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        style={styles.textarea}
                        rows="3"
                    />
                 </div>

                 {/* Actions */}
                 <div style={{ textAlign: 'right', marginTop: '2rem' }}>
                    <button
                        type="button"
                        onClick={() => navigate('/')} // Or navigate back
                        style={{...styles.button, ...styles.cancelButton}}
                        disabled={isSubmitting}
                    >
                         Cancel
                    </button>
                     <button
                        type="submit"
                        style={{...styles.button, ...styles.saveButton}}
                        disabled={isSubmitting || !selectedItem || !reason || !condition}
                     >
                        <FaSave style={{ marginRight: '8px' }} />
                        {isSubmitting ? 'Processing...' : 'Process Return'}
                     </button>
                 </div>
            </form>
        </div>
    );
}

export default ReturnProcessingPage;