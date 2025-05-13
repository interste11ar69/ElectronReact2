// src/BundleFormPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { FaArrowLeft, FaPlusCircle, FaTrashAlt } from 'react-icons/fa';
import './BundleFormPage.css'; // Create this CSS file later

function BundleFormPage({ currentUser }) {
    const { id: bundleIdFromParams } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(bundleIdFromParams);

    const initialFormData = {
        bundle_sku: '',
        name: '',
        description: '',
        price: '',
        is_active: true,
        components: [] // Array of { item_id, quantity_in_bundle, itemName (for display) }
    };
    const [formData, setFormData] = useState(initialFormData);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // For item selection dropdown
    const [itemOptions, setItemOptions] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false);

    // Fetch all items for component selection
    const loadAllItems = useCallback(async () => {
        setIsItemsLoading(true);
        try {
            const items = await window.electronAPI.getItems({}); // Get all items
            const options = items.map(item => ({
                value: item.id,
                label: `${item.name} (SKU: ${item.sku || 'N/A'}) - Stock: ${item.quantity}`,
                // Store other item details if needed for display in the form
                name: item.name,
                sku: item.sku,
                currentStock: item.quantity
            }));
            setItemOptions(options);
        } catch (err) {
            console.error("Error fetching items for component dropdown:", err);
            setError('Could not load product list for components.');
        } finally {
            setIsItemsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAllItems(); // Load items on component mount
        if (isEditing && bundleIdFromParams) {
            setIsLoading(true);
            const fetchBundleData = async () => {
                try {
                    const bundle = await window.electronAPI.getBundleById(bundleIdFromParams);
                    if (bundle) {
                        setFormData({
                            bundle_sku: bundle.bundle_sku || '',
                            name: bundle.name || '',
                            description: bundle.description || '',
                            price: bundle.price !== null ? String(bundle.price) : '',
                            is_active: bundle.is_active === undefined ? true : bundle.is_active,
                            components: bundle.components.map(comp => ({
                                item_id: comp.item_id,
                                quantity_in_bundle: comp.quantity_in_bundle,
                                itemName: comp.item?.name || `Item ID ${comp.item_id}`, // For display
                                itemSku: comp.item?.sku || 'N/A'
                            })) || []
                        });
                    } else {
                        setError(`Bundle with ID ${bundleIdFromParams} not found.`);
                    }
                } catch (err) {
                    setError(`Failed to load bundle data: ${err.message}`);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchBundleData();
        } else {
            setFormData(initialFormData);
        }
    }, [bundleIdFromParams, isEditing, loadAllItems]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleAddComponent = () => {
        // Add a placeholder for a new component
        setFormData(prev => ({
            ...prev,
            components: [...prev.components, { item_id: null, quantity_in_bundle: 1, itemName: '', itemSku: '' }]
        }));
    };

    const handleComponentChange = (index, field, value) => {
        const updatedComponents = [...formData.components];
        if (field === 'item_id') {
            const selectedItemOption = itemOptions.find(opt => opt.value === value);
            updatedComponents[index] = {
                ...updatedComponents[index],
                item_id: value,
                itemName: selectedItemOption ? selectedItemOption.name : '',
                itemSku: selectedItemOption ? selectedItemOption.sku : ''
            };
        } else {
            updatedComponents[index][field] = value;
        }
        setFormData(prev => ({ ...prev, components: updatedComponents }));
    };

    const handleRemoveComponent = (index) => {
        setFormData(prev => ({
            ...prev,
            components: prev.components.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        // Validations
        if (!formData.name.trim()) {
            setError('Bundle Name is required.'); return;
        }
        if (formData.components.length === 0) {
            setError('A bundle must have at least one component.'); return;
        }
        for (const comp of formData.components) {
            if (!comp.item_id) {
                setError('All components must have an item selected.'); return;
            }
            const qty = Number(comp.quantity_in_bundle);
            if (isNaN(qty) || qty <= 0) {
                setError('Quantity for each component must be a positive number.'); return;
            }
        }
        const price = formData.price !== '' ? parseFloat(formData.price) : null;
        if (formData.price !== '' && (isNaN(price) || price < 0)) {
            setError('If provided, Price must be a valid non-negative number.'); return;
        }


        setIsSubmitting(true);
        const bundleDataToSave = {
            bundle_sku: formData.bundle_sku.trim() || null,
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            price: price,
            is_active: formData.is_active,
            components: formData.components.map(comp => ({
                item_id: comp.item_id,
                quantity_in_bundle: Number(comp.quantity_in_bundle)
            }))
        };

        try {
            let result;
            if (isEditing) {
                result = await window.electronAPI.updateBundle(bundleIdFromParams, bundleDataToSave);
            } else {
                result = await window.electronAPI.createBundle(bundleDataToSave);
            }

            if (result.success) {
                setSuccessMessage(result.message || `Bundle ${isEditing ? 'updated' : 'created'} successfully!`);
                setTimeout(() => {
                    setSuccessMessage('');
                    navigate('/bundles');
                }, 2000);
            } else {
                setError(result.message || `Failed to ${isEditing ? 'update' : 'create'} bundle.`);
            }
        } catch (err) {
            setError(`An error occurred: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading && isEditing) {
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading bundle details...</div>;
    }

    return (
        <div className="bundle-form-page page-container">
            <header className="page-header-alt"> {/* Reuse from ProductFormPage.css if similar */ }
                <div className="form-header-left">
                    <button onClick={() => navigate('/bundles')} className="back-button" aria-label="Go back to bundles list">
                        <FaArrowLeft />
                    </button>
                    <div>
                        <h1>{isEditing ? 'EDIT BUNDLE / KIT' : 'NEW BUNDLE / KIT'}</h1>
                        <p className="form-subtitle">
                            {isEditing ? 'Modify the bundle details and its components.' : 'Define a new product bundle and its components.'}
                        </p>
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}
            {successMessage && <div className="success-message card" role="status">{successMessage}</div>}

            <form onSubmit={handleSubmit} className="bundle-form card"> {/* Reuse .product-form styling if desired */}
                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="name">Bundle Name *</label>
                        <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required />
                    </div>
                    <div className="form-group form-group-inline">
                        <label htmlFor="bundle_sku">Bundle SKU (Optional)</label>
                        <input type="text" id="bundle_sku" name="bundle_sku" value={formData.bundle_sku} onChange={handleChange} />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="price">Bundle Price (Optional)</label>
                        <input type="number" id="price" name="price" value={formData.price} onChange={handleChange} min="0" step="0.01" placeholder="e.g., 199.99" />
                    </div>
                     <div className="form-group form-group-inline checkbox-group"> {/* For alignment */}
                        <label htmlFor="is_active">Active Bundle</label>
                        <input type="checkbox" id="is_active" name="is_active" checked={formData.is_active} onChange={handleChange} />
                    </div>
                </div>


                <div className="form-group">
                    <label htmlFor="description">Description (Optional)</label>
                    <textarea id="description" name="description" value={formData.description} onChange={handleChange} rows="3"></textarea>
                </div>

                <hr className="section-divider" />

                <h3>Bundle Components</h3>
                {formData.components.map((component, index) => (
                    <div key={index} className="component-row form-row">
                        <div className="form-group component-item-select">
                            <label htmlFor={`component-item-${index}`}>Component Item *</label>
                            <Select
                                id={`component-item-${index}`}
                                options={itemOptions.filter(opt => !formData.components.find((c, i) => i !== index && c.item_id === opt.value))} // Prevent selecting same item twice
                                value={itemOptions.find(opt => opt.value === component.item_id)}
                                onChange={(selectedOption) => handleComponentChange(index, 'item_id', selectedOption ? selectedOption.value : null)}
                                isLoading={isItemsLoading}
                                isClearable
                                placeholder="Select item..."
                                required
                            />
                        </div>
                        <div className="form-group component-quantity">
                            <label htmlFor={`component-qty-${index}`}>Quantity *</label>
                            <input
                                type="number"
                                id={`component-qty-${index}`}
                                value={component.quantity_in_bundle}
                                onChange={(e) => handleComponentChange(index, 'quantity_in_bundle', e.target.value)}
                                min="1"
                                required
                            />
                        </div>
                        <div className="component-actions">
                            <button type="button" className="button-delete-component" onClick={() => handleRemoveComponent(index)}>
                                <FaTrashAlt />
                            </button>
                        </div>
                    </div>
                ))}
                <button type="button" className="button button-secondary add-component-btn" onClick={handleAddComponent}>
                    <FaPlusCircle style={{ marginRight: '8px' }}/> Add Component
                </button>

                <div className="form-footer"> {/* Reuse from ProductFormPage.css if similar */}
                    <div className="form-actions">
                        <button type="submit" className="button save-button" disabled={isSubmitting || isLoading}>
                            {isSubmitting ? 'Saving...' : (isEditing ? 'Update Bundle' : 'Save Bundle')}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default BundleFormPage;