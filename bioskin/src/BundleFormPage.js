// src/BundleFormPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { FaArrowLeft, FaPlusCircle, FaTrashAlt, FaSave } from 'react-icons/fa';
import './BundleFormPage.css';

// Define or import react-select custom styles
// For example, a basic one:
const reactSelectStyles = {
    control: (baseStyles, state) => ({
        ...baseStyles,
        borderColor: state.isFocused ? 'var(--color-primary-dark)' : 'var(--color-border-strong)',
        boxShadow: state.isFocused ? '0 0 0 0.2rem var(--focus-ring-color)' : 'none',
        '&:hover': {
            borderColor: state.isFocused ? 'var(--color-primary-dark)' : 'var(--color-border-strong)',
        },
    }),
    menu: base => ({ ...base, zIndex: 10 }) // Ensure dropdown is on top
};

function BundleFormPage({ currentUser }) {
    const { id: bundleIdFromParams } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(bundleIdFromParams);

    // Moved initialFormComponent to be a function to ensure fresh object on reset
    const getInitialFormComponent = () => ({
        item_id: null,
        quantity_in_bundle: 1,
        itemName: '',
        itemSku: '',
        currentStoreStock: 0
    });

    const getInitialFormData = () => ({
        bundle_sku: '',
        name: '',
        description: '',
        price: '',
        is_active: true,
        components: [getInitialFormComponent()]
    });

    const [formData, setFormData] = useState(getInitialFormData());
    const [isLoading, setIsLoading] = useState(false); // For loading bundle data itself (editing)
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [itemOptions, setItemOptions] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false); // For loading item options for dropdown
    const [storeLocationId, setStoreLocationId] = useState(null);
    const [storeLocationError, setStoreLocationError] = useState(''); // Specific error for store location

    useEffect(() => {
        const fetchStoreLocation = async () => {
            try {
                const id = await window.electronAPI.getStoreLocationId();
                if (id) {
                    setStoreLocationId(id);
                    setStoreLocationError(''); // Clear previous store location errors
                } else {
                    setStoreLocationError('Configuration error: "STORE" location not found. Cannot load items for bundling.');
                    setError('Configuration error: "STORE" location not found.'); // Also set general error
                }
            } catch (e) {
                setStoreLocationError('Error fetching STORE location configuration.');
                setError('Error fetching STORE location configuration.');
                console.error("Error fetching STORE ID in BundleFormPage:", e);
            }
        };
        fetchStoreLocation();
    }, []);

    const loadAllItemsForStore = useCallback(async () => {
        if (!storeLocationId) {
            setItemOptions([]);
            // If there's no storeLocationError yet, set a waiting message.
            if (!storeLocationError) {
                setError(prev => prev || 'Waiting for STORE location configuration to load items...');
            }
            return;
        }
        setIsItemsLoading(true);
        // Clear general errors if they were related to item loading, but not store config errors
        if (error && !error.includes("STORE location")) {
            setError('');
        }

        try {
            // Pass storeLocationId to getItems to fetch quantity_at_specific_location
            const items = await window.electronAPI.getItems({
                is_archived: false,
                stockAtLocationId: storeLocationId // This tells backend to join with item_location_quantities for this location
            });

            const options = items.map(item => ({
                value: item.id,
                label: `${item.name} (SKU: ${item.sku || 'N/A'}) - STORE Stock: ${item.quantity_at_specific_location === undefined ? 'N/A' : item.quantity_at_specific_location}`,
                name: item.name,
                sku: item.sku,
                currentStoreStock: item.quantity_at_specific_location === undefined ? 0 : item.quantity_at_specific_location
            }));
            setItemOptions(options);

            if (options.length === 0 && !storeLocationError && !error.includes("Could not load product list")) {
                setError('No items found with stock in STORE to add as components.');
            }
        } catch (err) {
            console.error("Error fetching items for component dropdown (STORE specific):", err);
            setError('Could not load product list for components from STORE.');
        } finally {
            setIsItemsLoading(false);
        }
    }, [storeLocationId, storeLocationError, error]); // Removed isLoading from deps

    useEffect(() => {
        // Load items only if storeLocationId is available and there's no error related to fetching it.
        if (storeLocationId && !storeLocationError) {
            loadAllItemsForStore();
        }
    }, [storeLocationId, storeLocationError, loadAllItemsForStore]);

    useEffect(() => {
        if (isEditing && bundleIdFromParams && storeLocationId && !storeLocationError) {
            setIsLoading(true);
            const fetchBundleData = async () => {
                try {
                    const bundle = await window.electronAPI.getBundleById(bundleIdFromParams);
                    if (bundle) {
                        const enrichedComponents = await Promise.all(
                            (bundle.components || []).map(async comp => {
                                const itemOpt = itemOptions.find(opt => opt.value === comp.item_id);
                                let currentStoreStock = 0;
                                if (itemOpt) {
                                    currentStoreStock = itemOpt.currentStoreStock;
                                } else if (comp.item_id && storeLocationId) {
                                    // Item not in current options (e.g. stock became 0), try to fetch its current STORE stock
                                    try {
                                        const qty = await window.electronAPI.getItemQuantityAtLocation(comp.item_id, storeLocationId);
                                        currentStoreStock = qty || 0;
                                    } catch (fetchQtyError) {
                                        console.warn(`Could not fetch current stock for component item ID ${comp.item_id}:`, fetchQtyError);
                                        currentStoreStock = 0; // Default if fetch fails
                                    }
                                }
                                return {
                                    item_id: comp.item_id,
                                    quantity_in_bundle: comp.quantity_in_bundle,
                                    itemName: comp.item?.name || `Item ID ${comp.item_id}`,
                                    itemSku: comp.item?.sku || 'N/A',
                                    currentStoreStock: currentStoreStock
                                };
                            })
                        );

                        setFormData({
                            bundle_sku: bundle.bundle_sku || '',
                            name: bundle.name || '',
                            description: bundle.description || '',
                            price: bundle.price !== null ? String(bundle.price) : '',
                            is_active: bundle.is_active === undefined ? true : bundle.is_active,
                            components: enrichedComponents.length > 0 ? enrichedComponents : [getInitialFormComponent()]
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
        } else if (!isEditing) {
            setFormData(getInitialFormData()); // Reset form for new bundle
        }
    // itemOptions is added to re-enrich components if itemOptions list changes (e.g., stock updates elsewhere)
    }, [bundleIdFromParams, isEditing, storeLocationId, storeLocationError, itemOptions]);


    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleAddComponent = () => {
        setFormData(prev => ({
            ...prev,
            components: [...prev.components, getInitialFormComponent()]
        }));
    };

    const handleRemoveComponent = (index) => {
        setFormData(prev => ({
            ...prev,
            components: prev.components.filter((_, i) => i !== index)
        }));
    };

    const handleComponentChange = (index, field, value) => {
        const updatedComponents = [...formData.components]; // Create a new array
        if (field === 'item_id') {
            const selectedItemOption = itemOptions.find(opt => opt.value === value);
            updatedComponents[index] = {
                ...getInitialFormComponent(), // Reset other fields to default for a component
                item_id: value,
                itemName: selectedItemOption ? selectedItemOption.name : '',
                itemSku: selectedItemOption ? selectedItemOption.sku : '',
                currentStoreStock: selectedItemOption ? selectedItemOption.currentStoreStock : 0,
                quantity_in_bundle: 1 // Reset quantity when item changes
            };
        } else {
            updatedComponents[index] = {
                ...updatedComponents[index],
                [field]: value
            };
        }
        setFormData(prev => ({ ...prev, components: updatedComponents }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccessMessage('');

        if (!formData.name.trim()) { setError('Bundle Name is required.'); return; }

        const validComponents = formData.components.filter(comp => comp.item_id);
        if (validComponents.length === 0) {
            setError('A bundle must have at least one component item selected.'); return;
        }

        for (const comp of validComponents) {
            const qty = Number(comp.quantity_in_bundle);
            if (isNaN(qty) || qty <= 0) {
                setError(`Quantity for component "${comp.itemName || 'Selected Item'}" must be a positive number.`); return;
            }
        }

        const priceVal = parseFloat(formData.price);
        if (formData.price !== '' && (isNaN(priceVal) || priceVal < 0)) {
            setError('If entered, Bundle Price must be a non-negative number.'); return;
        }


        setIsSubmitting(true);
        const bundleDataToSave = {
            bundle_sku: formData.bundle_sku.trim() || null,
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            price: formData.price !== '' ? priceVal : null,
            is_active: formData.is_active,
            components: validComponents.map(comp => ({ // Use validComponents
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

            if (result && result.success) {
                setSuccessMessage(result.message || `Bundle ${isEditing ? 'updated' : 'created'} successfully!`);
                setTimeout(() => {
                    setSuccessMessage('');
                    navigate('/bundles');
                }, 2000);
            } else {
                setError(result?.message || `Failed to ${isEditing ? 'update' : 'create'} bundle.`);
            }
        } catch (err) {
            setError(`An error occurred: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Combined loading state for the main return
    const pageIsLoading = isLoading || // Loading bundle data itself
                         (!storeLocationId && !storeLocationError) || // Waiting for store location ID and no error yet
                         (storeLocationId && isItemsLoading && itemOptions.length === 0 && !error.includes("Could not load product list")); // Loading items for store and no items yet

    if (pageIsLoading) {
        let loadingMessage = "Loading...";
        if (!storeLocationId && !storeLocationError) loadingMessage = "Fetching STORE configuration...";
        else if (isItemsLoading && itemOptions.length === 0) loadingMessage = "Loading items for STORE...";
        else if (isLoading) loadingMessage = "Loading bundle details...";

        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>{loadingMessage}</div>;
    }

    return (
        <div className="bundle-form-page page-container">
            <header className="page-header-alt">
                <div className="form-header-left">
                    <button onClick={() => navigate('/bundles')} className="back-button" aria-label="Go back to bundles list">
                        <FaArrowLeft />
                    </button>
                    <div>
                        <h1>{isEditing ? 'EDIT BUNDLE / KIT' : 'NEW BUNDLE / KIT'}</h1>
                        <p className="form-subtitle">
                            {isEditing ? 'Modify bundle details. Components must be available in STORE.' : 'Define a new bundle. Components must be available in STORE.'}
                        </p>
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}
            {successMessage && <div className="success-message card" role="status">{successMessage}</div>}

            <form onSubmit={handleSubmit} className="bundle-form card">
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
                     <div className="form-group form-group-inline checkbox-group">
                        <label htmlFor="is_active">Active Bundle</label>
                        <input type="checkbox" id="is_active" name="is_active" checked={formData.is_active} onChange={handleChange} />
                    </div>
                </div>

                <div className="form-group">
                    <label htmlFor="description">Description (Optional)</label>
                    <textarea id="description" name="description" value={formData.description} onChange={handleChange} rows="3"></textarea>
                </div>


                <hr className="section-divider" />

                <h3>Bundle Components (from "STORE" Location)</h3>
                {formData.components.map((component, index) => (
                    <div key={index} className="component-row form-row">
                        <div className="form-group component-item-select">
                            <label htmlFor={`component-item-${index}`}>Component Item *</label>
                            <Select
                                id={`component-item-${index}`}
                                options={itemOptions.filter(opt =>
                                    // Ensure item is not already selected in another component row
                                    !formData.components.find((c, i) => i !== index && c.item_id === opt.value) ||
                                    // Allow current item to be in options for itself
                                    component.item_id === opt.value
                                )}
                                value={itemOptions.find(opt => opt.value === component.item_id)}
                                onChange={(selectedOption) => handleComponentChange(index, 'item_id', selectedOption ? selectedOption.value : null)}
                                isLoading={isItemsLoading} // Only items loading, not general page loading
                                isClearable
                                placeholder={storeLocationError ? "STORE config error" : (!storeLocationId ? "Loading STORE config..." : (isItemsLoading ? "Loading STORE items..." : "Select item from STORE..."))}
                                styles={reactSelectStyles}
                                isDisabled={!!storeLocationError || !storeLocationId || isItemsLoading}
                            />
                            {component.item_id && component.currentStoreStock !== undefined &&
                                <small>STORE Stock: {component.currentStoreStock}</small>
                            }
                        </div>
                        <div className="form-group component-quantity">
                            <label htmlFor={`component-qty-${index}`}>Quantity in Bundle *</label>
                            <input
                                type="number"
                                id={`component-qty-${index}`}
                                name="quantity_in_bundle" // Added name for consistency
                                value={component.quantity_in_bundle}
                                onChange={(e) => handleComponentChange(index, 'quantity_in_bundle', e.target.value)}
                                min="1"
                                required={!!component.item_id} // Required only if an item is selected
                            />
                        </div>
                        {formData.components.length > 1 && (
                            <div className="component-actions">
                                <button type="button" className="button-delete-component" onClick={() => handleRemoveComponent(index)}>
                                    <FaTrashAlt />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                <button
                    type="button"
                    className="button button-secondary add-component-btn"
                    onClick={handleAddComponent}
                    disabled={!!storeLocationError || !storeLocationId || isItemsLoading}
                >
                    <FaPlusCircle style={{ marginRight: '8px' }}/> Add Component
                </button>

                <div className="form-footer">
                    <div className="form-actions">
                        <button
                            type="submit"
                            className="button save-button"
                            disabled={isSubmitting || isLoading || !!storeLocationError || !storeLocationId || isItemsLoading}
                        >
                            {isSubmitting ? 'Saving...' : (isEditing ? 'Update Bundle' : 'Save Bundle')}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default BundleFormPage;