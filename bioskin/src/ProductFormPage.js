// FILE: src/ProductFormPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaThLarge } from 'react-icons/fa';
import './ProductFormPage.css';
import SuccessModal from './SuccessModal'; // Ensure this component exists and works

function ProductFormPage({ currentUser }) { // currentUser might be used for role-based logic if needed
    const { id: itemIdFromParams } = useParams(); // Get item ID from URL if editing, renamed to avoid conflict
    const navigate = useNavigate();
    const isEditing = Boolean(itemIdFromParams);

    // Form State
    const initialFormData = {
        name: '',
        sku: '',
        description: '',
        cost_price: '',
        quantity: '',
        category: '',
        storage: '',  // This is the frontend state name for 'storage_location'
        variant: '',
        status: 'Normal', // Default status
    };
    const [formData, setFormData] = useState(initialFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false); // For loading item data when editing
    const [confirmDetails, setConfirmDetails] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Placeholder data for dropdowns
    const categories = ["Beauty Soap", "Skincare", "Wellness", "Cosmetics", "Soap", "Body Care", "Hair Care"];
    const storageOptions = ["STORE", "Main Warehouse", "Retail Shelf", "Online Fulfillment", "STORE A", "STORE B"];

    useEffect(() => {
        if (isEditing && itemIdFromParams) {
            setIsLoading(true);
            const fetchItemData = async () => {
                setError('');
                try {
                    console.log(`ProductFormPage: Fetching item with ID: ${itemIdFromParams}`);
                    // Ensure getItemById is exposed in preload and handled in main
                    const item = await window.electronAPI.getItemById(itemIdFromParams);
                    console.log("ProductFormPage: Fetched item for editing:", JSON.stringify(item, null, 2));

                    if (item) {
                        setFormData({
                            name: item.name || '',
                            sku: item.sku || '',
                            description: item.description || '',
                            cost_price: item.cost_price !== null ? String(item.cost_price) : '',
                            quantity: item.quantity !== null ? String(item.quantity) : '',
                            category: item.category || '',
                            storage: item.storage_location || item.storage || '', // Map storage_location to 'storage'
                            variant: item.variant || '',
                            status: item.status || 'Normal',
                        });
                    } else {
                        setError(`Item with ID ${itemIdFromParams} not found or an error occurred.`);
                        console.warn(`ProductFormPage: Item with ID ${itemIdFromParams} not found by backend or backend returned null/error.`);
                    }
                } catch (err) {
                    console.error("ProductFormPage: Error fetching item data:", err);
                    setError(`Failed to load item data: ${err.message}`);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchItemData();
        } else {
            // Reset form for 'new' page or if itemIdFromParams is missing
            setFormData(initialFormData);
            setConfirmDetails(false);
            setIsLoading(false);
        }
    }, [itemIdFromParams, isEditing]); // Dependencies for useEffect

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
        setError(''); // Clear previous errors

        // Client-side validations
        if (!confirmDetails) {
            setError('Please confirm the details before saving.');
            return;
        }
        if (!formData.name.trim()) {
            setError('Product Name is required.');
            return;
        }
        if (!formData.category) {
            setError('Product Category is required.');
            return;
        }
        if (!formData.storage) { // 'storage' is the form field name
            setError('Storage Location is required.');
            return;
        }
        const costPrice = parseFloat(formData.cost_price);
        if (formData.cost_price === '' || isNaN(costPrice) || costPrice < 0) {
            setError('Valid Product Price is required (e.g., 60.00).');
            return;
        }
        const quantity = parseInt(formData.quantity, 10);
        if (formData.quantity === '' || isNaN(quantity) || quantity < 0) {
            setError('Valid Product Stock quantity is required (e.g., 100).');
            return;
        }

        setIsSubmitting(true);

        const itemDataToSave = {
            name: formData.name.trim(),
            sku: formData.sku.trim() || null, // Send null if empty for optional SKU
            description: formData.description.trim() || null,
            cost_price: costPrice, // Use the parsed float
            quantity: quantity,     // Use the parsed int
            category: formData.category,
            storage_location: formData.storage, // Map frontend 'storage' to backend 'storage_location'
            variant: formData.variant.trim() || null,
            status: formData.status,
        };

        if (isEditing) {
            itemDataToSave.id = parseInt(itemIdFromParams, 10);
        }

        console.log(`ProductFormPage: Attempting to ${isEditing ? 'update' : 'add'} item with data:`, JSON.stringify(itemDataToSave, null, 2));
        console.log('window.electronAPI object keys:', Object.keys(window.electronAPI || {})); // Debugging

        try {
            let result;
            if (isEditing) {
                if (typeof window.electronAPI.updateItem !== 'function') {
                    throw new TypeError('window.electronAPI.updateItem is not a function. Check preload.js');
                }
                result = await window.electronAPI.updateItem(itemDataToSave); // Pass the whole object including ID
            } else {
                if (typeof window.electronAPI.createItem !== 'function') {
                    throw new TypeError('window.electronAPI.createItem is not a function. Check preload.js');
                }
                result = await window.electronAPI.createItem(itemDataToSave); // Use createItem
            }

            console.log(`ProductFormPage: Backend ${isEditing ? 'update' : 'add'} result:`, result);

            if (result && result.success) {
                setShowSuccessModal(true);
                // Don't reset form here for editing; navigation handles it.
                // For new items, navigation after modal close will also show a fresh page.
            } else {
                // Handle cases where result might be null or not have a success flag or message
                const backendMessage = result ? result.message : 'Operation failed without a specific message.';
                setError(`Failed to ${isEditing ? 'update' : 'add'} item: ${backendMessage}`);
                console.error(`ProductFormPage: Backend operation failed. Result:`, result);
            }
        } catch (err) {
            console.error(`ProductFormPage: Error during ${isEditing ? 'update' : 'add'} item API call:`, err);
            setError(`An error occurred: ${err.message}. Check console for details.`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        setShowSuccessModal(false);
        navigate('/products'); // Navigate back to list after closing modal
    };

    if (isLoading && isEditing) { // Only show loading when fetching existing item data
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading product details...</div>;
    }

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
                            {isEditing ? 'Edit the product information below.' : 'Input all the product information below.'}
                        </p>
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
                         <label htmlFor="storage">Choose Storage *</label> {/* 'storage' matches form field name */}
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
                         <input type="number" id="cost_price" name="cost_price" value={formData.cost_price} onChange={handleChange} min="0" step="0.01" placeholder="e.g., 60.00" required/>
                     </div>
                 </div>

                 {/* Row 3: Variant, Quantity, Status */}
                 <div className="form-row three-cols">
                     <div className="form-group form-group-inline">
                         <label htmlFor="variant">Product Variant (Optional)</label>
                         <input type="text" id="variant" name="variant" value={formData.variant} onChange={handleChange} placeholder="e.g., 135 grams" />
                     </div>
                     <div className="form-group form-group-inline">
                         <label htmlFor="quantity">Product Stock (Quantity) *</label>
                         <input type="number" id="quantity" name="quantity" value={formData.quantity} onChange={handleChange} min="0" placeholder="e.g., 100" required />
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
                     <input type="text" id="sku" name="sku" value={formData.sku} onChange={handleChange} placeholder="e.g., BIOSKIN-KS-135"/>
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
                             {isSubmitting ? 'Saving...' : (isEditing ? 'Update Product' : 'Save Product')}
                         </button>
                     </div>
                 </div>
            </form>

            {showSuccessModal && <SuccessModal onClose={handleCloseModal} />}
        </div>
    );
}

export default ProductFormPage;