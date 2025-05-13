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
        storage: '', // This will be the selected storage location
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
    // --- MODIFICATION START: Update storageOptions to match the diagram ---
    const storageOptions = ["STORE", "Warehouse A", "Warehouse 200"];
    // --- MODIFICATION END ---

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
                            cost_price: item.cost_price !== null ? String(item.cost_price) : '',
                            quantity: item.quantity !== null ? String(item.quantity) : '0',
                            category: item.category || '',
                            // --- MODIFICATION START: Ensure 'storage' field is used for item.storage_location ---
                            storage: item.storage_location || '', // Use item.storage_location
                            // --- MODIFICATION END ---
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
            // --- MODIFICATION START: Set default storage for new items if desired, or leave blank ---
            // Option 1: Leave blank, user must select
            // initialFormData.storage = '';
            // Option 2: Set a default, e.g., "STORE"
            // initialFormData.storage = "STORE";
            setFormData({...initialFormData, storage: ""}); // Defaulting to blank, requiring selection
            // --- MODIFICATION END ---
            setConfirmDetails(false);
            setIsLoading(false);
        }
    }, [itemIdFromParams, isEditing]); // Removed initialFormData from dependency array as it's constant here

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
        // --- MODIFICATION START: Ensure formData.storage is used for validation ---
        if (!formData.storage) { setError('Storage Location is required.'); return; }
        // --- MODIFICATION END ---

        let quantity = 0;
        if (!isEditing) {
            quantity = parseInt(formData.quantity, 10);
            if (formData.quantity === '' || isNaN(quantity) || quantity < 0) {
                setError('Valid initial Product Stock quantity is required for new items (e.g., 100).');
                return;
            }
        }

        if (isEditing && currentUser?.role !== 'admin') {
            const originalItem = await window.electronAPI.getItemById(itemIdFromParams);
            if (originalItem) {
                if (formData.sku !== originalItem.sku) {
                    setError("Employees cannot change the SKU of an existing product.");
                    setIsSubmitting(false); return;
                }
                const costPrice = parseFloat(formData.cost_price);
                 if (formData.cost_price === '' || isNaN(costPrice) || costPrice < 0) {
                    setError('Valid Product Price is required (e.g., 60.00).');
                    setIsSubmitting(false); return;
                }
                if (costPrice !== parseFloat(originalItem.cost_price)) {
                    setError("Employees cannot change the Price of an existing product.");
                    setIsSubmitting(false); return;
                }
            } else {
                 setError("Could not verify original item data. Update blocked.");
                 setIsSubmitting(false); return;
            }
        } else {
             const costPrice = parseFloat(formData.cost_price);
             if (formData.cost_price === '' || isNaN(costPrice) || costPrice < 0) {
                 setError('Valid Product Price is required (e.g., 60.00).');
                 return;
             }
        }

        setIsSubmitting(true);

        const itemDataToSave = {
            name: formData.name.trim(),
            sku: formData.sku.trim() || null,
            description: formData.description.trim() || null,
            cost_price: parseFloat(formData.cost_price),
            category: formData.category,
            // --- MODIFICATION START: Ensure 'storage_location' is used for saving ---
            storage_location: formData.storage, // Send formData.storage as storage_location
            // --- MODIFICATION END ---
            variant: formData.variant.trim() || null,
            status: formData.status,
        };

        if (!isEditing) {
            itemDataToSave.quantity = quantity;
        }

        if (isEditing) {
            itemDataToSave.id = parseInt(itemIdFromParams, 10);
        }

        console.log(`ProductFormPage: Attempting to ${isEditing ? 'update' : 'add'} item with data:`, JSON.stringify(itemDataToSave, null, 2));

        try {
            let result;
            if (isEditing) {
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

    const isAdmin = currentUser?.role === 'admin';
    const disableSkuField = isEditing && !isAdmin;
    const disablePriceField = isEditing && !isAdmin;
    const disableQuantityField = isEditing;

    return (
        <div className="product-form-page page-container">
            <header className="page-header-alt">
                <div className="form-header-left">
                    <button onClick={() => navigate('/products')} className="back-button" aria-label="Go back to products list">
                        <FaArrowLeft />
                    </button>
                    <div>
                        <h1>{isEditing ? 'EDIT STOCK DETAILS' : 'NEW STOCK DETAILS'}</h1>
                        <p className="form-subtitle">
                           {isEditing ? 'Edit product information. Stock quantity is adjusted via Returns, Receiving, or Stock Counts.' : 'Input all product information below.'}
                        </p>
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">Error: {error}</div>}

            <form onSubmit={handleSubmit} className="product-form card">
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
                         {/* --- MODIFICATION START: Ensure 'storage' field and state are used for the dropdown --- */}
                         <label htmlFor="storage">Choose Storage *</label>
                         <div className="input-with-icon">
                            <FaThLarge className="input-icon" />
                             <select id="storage" name="storage" value={formData.storage} onChange={handleChange} required>
                                 <option value="" disabled>Select Storage</option>
                                 {storageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                             </select>
                         </div>
                         {/* --- MODIFICATION END --- */}
                     </div>
                 </div>

                 <div className="form-row">
                     <div className="form-group form-group-inline">
                         <label htmlFor="name">Product Name *</label>
                         <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g., Kojic Soap" required />
                     </div>
                     <div className="form-group form-group-inline">
                         <label htmlFor="cost_price">Set Product Price *</label>
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
                            style={disablePriceField ? { backgroundColor: '#eee' } : {}}
                         />
                     </div>
                 </div>

                 <div className="form-row three-cols">
                     <div className="form-group form-group-inline">
                         <label htmlFor="variant">Product Variant (Optional)</label>
                         <input type="text" id="variant" name="variant" value={formData.variant} onChange={handleChange} placeholder="e.g., 135 grams" />
                     </div>
                     <div className="form-group form-group-inline">
                         <label htmlFor="quantity">{isEditing ? 'Current Stock (Read-Only)' : 'Initial Stock Quantity *'}</label>
                         <input
                            type="number"
                            id="quantity"
                            name="quantity"
                            value={formData.quantity}
                            onChange={handleChange}
                            min="0"
                            placeholder={isEditing ? "" : "e.g., 100"}
                            required={!isEditing}
                            disabled={disableQuantityField}
                            title={disableQuantityField ? "Quantity is adjusted via specific inventory transactions (Receiving, Returns, Adjustments)." : ""}
                            style={disableQuantityField ? { backgroundColor: '#eee' } : {}}
                         />
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

                 <div className="form-group">
                     <label htmlFor="sku">Product SKU Code (Optional)</label>
                     <input
                        type="text"
                        id="sku"
                        name="sku"
                        value={formData.sku}
                        onChange={handleChange}
                        placeholder="e.g., BIOSKIN-KS-135"
                        disabled={disableSkuField}
                        title={disableSkuField ? "Only admins can change the SKU of an existing product." : ""}
                        style={disableSkuField ? { backgroundColor: '#eee' } : {}}
                     />
                 </div>

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