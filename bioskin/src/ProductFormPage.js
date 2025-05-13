// FILE: src/ProductFormPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaThLarge } from 'react-icons/fa';
import './ProductFormPage.css';
import SuccessModal from './SuccessModal'; // Ensure this component exists and works

function ProductFormPage({ currentUser }) { // currentUser is used for role-based logic
    const { id: itemIdFromParams } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(itemIdFromParams);

    // Form State
    const initialFormData = {
        name: '',
        sku: '',
        description: '',
        cost_price: '',
        quantity: '', // Quantity is set on creation ONLY via this form
        category: '',
        storage: '',
        variant: '',
        status: 'Normal',
    };
    const [formData, setFormData] = useState(initialFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [confirmDetails, setConfirmDetails] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const categories = ["Beauty Soap", "Skincare", "Wellness", "Cosmetics", "Soap", "Body Care", "Hair Care"];
    const storageOptions = ["STORE", "Main Warehouse", "Retail Shelf", "Online Fulfillment", "STORE A", "STORE B"];

    useEffect(() => {
        if (isEditing && itemIdFromParams) {
            setIsLoading(true);
            const fetchItemData = async () => {
                setError('');
                try {
                    const item = await window.electronAPI.getItemById(itemIdFromParams);
                    if (item) {
                        setFormData({
                            name: item.name || '',
                            sku: item.sku || '',
                            description: item.description || '',
                            // --- MODIFICATION START: Fetch price correctly ---
                            cost_price: item.cost_price !== null ? String(item.cost_price) : '', // Fetch price
                            // --- MODIFICATION END ---
                            // --- MODIFICATION START: Fetch quantity correctly (removed duplication) ---
                            quantity: item.quantity !== null ? String(item.quantity) : '0', // Display current quantity
                            // --- MODIFICATION END ---
                            category: item.category || '',
                            storage: item.storage_location || item.storage || '',
                            variant: item.variant || '',
                            status: item.status || 'Normal',
                        });
                    } else {
                        setError(`Item with ID ${itemIdFromParams} not found or an error occurred.`);
                    }
                } catch (err) {
                    setError(`Failed to load item data: ${err.message}`);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchItemData();
        } else {
            setFormData(initialFormData);
            setConfirmDetails(false);
            setIsLoading(false);
        }
    }, [itemIdFromParams, isEditing]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name === "confirmDetails" && type === 'checkbox') {
            setConfirmDetails(checked);
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleStatusClick = (newStatus) => {
        setFormData(prev => ({ ...prev, status: newStatus }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!confirmDetails) {
            setError('Please confirm the details before saving.');
            return;
        }
        if (!formData.name.trim()) { setError('Product Name is required.'); return; }
        if (!formData.category) { setError('Product Category is required.'); return; }
        if (!formData.storage) { setError('Storage Location is required.'); return; }

        // --- MODIFICATION START: Validate initial quantity ONLY if creating ---
        let quantity = 0; // Default for update payload where we don't send quantity
        if (!isEditing) {
            quantity = parseInt(formData.quantity, 10);
            if (formData.quantity === '' || isNaN(quantity) || quantity < 0) {
                setError('Valid initial Product Stock quantity is required for new items (e.g., 100).');
                return;
            }
        }
        // --- MODIFICATION END ---

        // --- MODIFICATION START: Price validation moved inside role check ---
        // const costPrice = parseFloat(formData.cost_price); // Moved validation below
        // --- MODIFICATION END ---

        // --- MODIFICATION START: Prevent non-admins from changing sensitive fields on existing items ---
        if (isEditing && currentUser?.role !== 'admin') {
            // Re-fetch original item data to compare sensitive fields securely.
            const originalItem = await window.electronAPI.getItemById(itemIdFromParams);
            if (originalItem) {
                if (formData.sku !== originalItem.sku) {
                    setError("Employees cannot change the SKU of an existing product.");
                    setIsSubmitting(false); return;
                }
                // Validate price format first
                const costPrice = parseFloat(formData.cost_price);
                 if (formData.cost_price === '' || isNaN(costPrice) || costPrice < 0) {
                    setError('Valid Product Price is required (e.g., 60.00).');
                    setIsSubmitting(false); return;
                }
                // Then compare price
                if (costPrice !== parseFloat(originalItem.cost_price)) {
                    setError("Employees cannot change the Price of an existing product.");
                    setIsSubmitting(false); return;
                }
            } else {
                 setError("Could not verify original item data. Update blocked."); // Handle case where re-fetch fails
                 setIsSubmitting(false); return;
            }
        } else {
             // Validate price for admins editing or anyone creating
             const costPrice = parseFloat(formData.cost_price);
             if (formData.cost_price === '' || isNaN(costPrice) || costPrice < 0) {
                 setError('Valid Product Price is required (e.g., 60.00).');
                 return;
             }
        }
        // --- MODIFICATION END ---


        setIsSubmitting(true);

        // --- MODIFICATION START: Construct payload carefully ---
        const itemDataToSave = {
            name: formData.name.trim(),
            sku: formData.sku.trim() || null,
            description: formData.description.trim() || null,
            cost_price: parseFloat(formData.cost_price), // Use parsed float
            category: formData.category,
            storage_location: formData.storage,
            variant: formData.variant.trim() || null,
            status: formData.status,
        };

        // Only include quantity if creating a new item
        if (!isEditing) {
            itemDataToSave.quantity = quantity; // Use parsed quantity
        }
        // --- MODIFICATION END ---


        if (isEditing) {
            itemDataToSave.id = parseInt(itemIdFromParams, 10);
        }

        console.log(`ProductFormPage: Attempting to ${isEditing ? 'update' : 'add'} item with data:`, JSON.stringify(itemDataToSave, null, 2));

        try {
            let result;
            if (isEditing) {
                // --- MODIFICATION START: Ensure backend function ignores quantity field ---
                // The backend `updateItem` function should be designed to ignore 'quantity'.
                // If not, explicitly remove it here: delete itemDataToSave.quantity;
                // --- MODIFICATION END ---
                if (typeof window.electronAPI.updateItem !== 'function') throw new TypeError('window.electronAPI.updateItem is not a function.');
                result = await window.electronAPI.updateItem(itemDataToSave);
            } else {
                if (typeof window.electronAPI.createItem !== 'function') throw new TypeError('window.electronAPI.createItem is not a function.');
                result = await window.electronAPI.createItem(itemDataToSave);
            }

            console.log(`ProductFormPage: Backend ${isEditing ? 'update' : 'add'} result:`, result);

            if (result && result.success) {
                setShowSuccessModal(true);
            } else {
                const backendMessage = result ? result.message : 'Operation failed without a specific message.';
                setError(`Failed to ${isEditing ? 'update' : 'add'} item: ${backendMessage}`);
            }
        } catch (err) {
            console.error(`ProductFormPage: Error during API call:`, err);
            setError(`An error occurred: ${err.message}. Check console for details.`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        setShowSuccessModal(false);
        navigate('/products');
    };

    if (isLoading && isEditing) {
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading product details...</div>;
    }

    // --- MODIFICATION START: Determine if fields should be disabled ---
    const isAdmin = currentUser?.role === 'admin';
    const disableSkuField = isEditing && !isAdmin;
    const disablePriceField = isEditing && !isAdmin;
    const disableQuantityField = isEditing; // Quantity is ALWAYS disabled when editing via this form
    // --- MODIFICATION END ---

    return (
        <div className="product-form-page page-container">
            <header className="page-header-alt">
                <div className="form-header-left">
                    <button onClick={() => navigate('/products')} className="back-button" aria-label="Go back to products list">
                        <FaArrowLeft />
                    </button>
                    <div>
                        <h1>{isEditing ? 'EDIT STOCK DETAILS' : 'NEW STOCK DETAILS'}</h1>
                        {/* --- MODIFICATION START: Update subtitle --- */}
                        <p className="form-subtitle">
                           {isEditing ? 'Edit product information. Stock quantity is adjusted via Returns, Receiving, or Stock Counts.' : 'Input all product information below.'}
                        </p>
                        {/* --- MODIFICATION END --- */}
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">Error: {error}</div>}

            <form onSubmit={handleSubmit} className="product-form card">
                 {/* Row 1: Category & Storage */}
                 <div className="form-row">
                     <div className="form-group form-group-inline">
                         <label htmlFor="category">Choose Product Category *</label>
                         <div className="input-with-icon">
                            <FaThLarge className="input-icon" />
                             <select id="category" name="category" value={formData.category} onChange={handleChange} required>
                                 <option value="" disabled>Select Category</option>
                                 {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                             </select>
                         </div>
                     </div>
                     <div className="form-group form-group-inline">
                         <label htmlFor="storage">Choose Storage *</label>
                         <div className="input-with-icon">
                            <FaThLarge className="input-icon" />
                             <select id="storage" name="storage" value={formData.storage} onChange={handleChange} required>
                                 <option value="" disabled>Select Storage</option>
                                 {storageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                             </select>
                         </div>
                     </div>
                 </div>

                 {/* Row 2: Name & Price */}
                 <div className="form-row">
                     <div className="form-group form-group-inline">
                         <label htmlFor="name">Product Name *</label>
                         <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g., Kojic Soap" required />
                     </div>
                     <div className="form-group form-group-inline">
                         <label htmlFor="cost_price">Set Product Price *</label>
                          {/* --- MODIFICATION START: Disable price field if editing and not admin --- */}
                         <input
                            type="number"
                            id="cost_price"
                            name="cost_price"
                            value={formData.cost_price}
                            onChange={handleChange}
                            min="0"
                            step="0.01"
                            placeholder="e.g., 60.00"
                            required
                            disabled={disablePriceField}
                            title={disablePriceField ? "Only admins can change the price of an existing product." : ""}
                            style={disablePriceField ? { backgroundColor: '#eee' } : {}} // Visual cue for disabled
                         />
                         {/* --- MODIFICATION END --- */}
                     </div>
                 </div>

                 {/* Row 3: Variant, Quantity, Status */}
                 <div className="form-row three-cols">
                     <div className="form-group form-group-inline">
                         <label htmlFor="variant">Product Variant (Optional)</label>
                         <input type="text" id="variant" name="variant" value={formData.variant} onChange={handleChange} placeholder="e.g., 135 grams" />
                     </div>
                     <div className="form-group form-group-inline">
                         {/* --- MODIFICATION START: Adjust label based on mode --- */}
                         <label htmlFor="quantity">{isEditing ? 'Current Stock (Read-Only)' : 'Initial Stock Quantity *'}</label>
                         {/* --- MODIFICATION END --- */}
                         {/* --- MODIFICATION START: Disable quantity field if editing --- */}
                         <input
                            type="number"
                            id="quantity"
                            name="quantity"
                            value={formData.quantity}
                            onChange={handleChange}
                            min="0"
                            placeholder={isEditing ? "" : "e.g., 100"} // Placeholder only for new items
                            required={!isEditing} // Only required when creating
                            disabled={disableQuantityField}
                            title={disableQuantityField ? "Quantity is adjusted via specific inventory transactions (Receiving, Returns, Adjustments)." : ""}
                            style={disableQuantityField ? { backgroundColor: '#eee' } : {}} // Visual cue for disabled
                         />
                         {/* --- MODIFICATION END --- */}
                     </div>
                     <div className="form-group form-group-inline">
                         <label>Set Product Status</label>
                         <div className="status-buttons">
                             <button type="button" className={`status-btn high ${formData.status === 'High' ? 'active' : ''}`} onClick={() => handleStatusClick('High')}>High</button>
                             <button type="button" className={`status-btn normal ${formData.status === 'Normal' ? 'active' : ''}`} onClick={() => handleStatusClick('Normal')}>Normal</button>
                             <button type="button" className={`status-btn low ${formData.status === 'Low' ? 'active' : ''}`} onClick={() => handleStatusClick('Low')}>Low</button>
                         </div>
                     </div>
                 </div>

                 {/* Row 4: SKU */}
                 <div className="form-group">
                     <label htmlFor="sku">Product SKU Code (Optional)</label>
                      {/* --- MODIFICATION START: Disable SKU field if editing and not admin --- */}
                     <input
                        type="text"
                        id="sku"
                        name="sku"
                        value={formData.sku}
                        onChange={handleChange}
                        placeholder="e.g., BIOSKIN-KS-135"
                        disabled={disableSkuField}
                        title={disableSkuField ? "Only admins can change the SKU of an existing product." : ""}
                        style={disableSkuField ? { backgroundColor: '#eee' } : {}} // Visual cue for disabled
                     />
                      {/* --- MODIFICATION END --- */}
                 </div>

                 {/* Row 5: Description */}
                 <div className="form-group">
                    <label htmlFor="description">Product Description (Optional)</label>
                    <textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows="3"
                        placeholder="Enter a brief description of the product..."
                    ></textarea>
                </div>

                {/* Row 6: Submit and Confirm */}
                <div className="form-footer">
                    <div className="confirm-checkbox">
                         <input
                            type="checkbox"
                            id="confirmDetails"
                            name="confirmDetails"
                            checked={confirmDetails}
                            onChange={handleChange}
                         />
                         <label htmlFor="confirmDetails">I confirm all details of this product are correct.</label>
                     </div>
                     <div className="form-actions">
                         <button type="submit" className="button save-button" disabled={isSubmitting || !confirmDetails || (isLoading && isEditing)}>
                             {isSubmitting ? 'Saving...' : (isEditing ? 'Update Details' : 'Save New Product')}
                         </button>
                     </div>
                 </div>
            </form>

            {showSuccessModal && <SuccessModal onClose={handleCloseModal} />}
        </div>
    );
}

export default ProductFormPage;