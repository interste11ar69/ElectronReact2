// src/ProductFormPage.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaThLarge, FaPlusCircle, FaTrashAlt } from 'react-icons/fa';
import Select from 'react-select';
import './ProductFormPage.css';
import './BundleFormPage.css'; // For .component-row if reused for stock entries
import SuccessModal from './SuccessModal';

function ProductFormPage({ currentUser }) {
    const { id: itemIdFromParams } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(itemIdFromParams);
    const skuInputRef = useRef(null);

    const initialItemMasterData = {
        name: '',
        sku: '',
        description: '',
        cost_price: '',
        category: '',
        variant: '',
        status: 'Normal', // Default status
    };
    const [itemMasterData, setItemMasterData] = useState(initialItemMasterData);
    const [initialStockEntries, setInitialStockEntries] = useState([{ locationId: '', quantity: '', locationName: '' }]);
    const [storageLocationOptions, setStorageLocationOptions] = useState([]);
    const [isLocationsLoading, setIsLocationsLoading] = useState(false);
    const [displayTotalStock, setDisplayTotalStock] = useState(0);
    const [displayStockByLocation, setDisplayStockByLocation] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [skuError, setSkuError] = useState('');
    const [isCheckingSku, setIsCheckingSku] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [confirmDetails, setConfirmDetails] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const categories = ["Beauty Soap", "Skincare", "Wellness", "Cosmetics", "Soap", "Body Care", "Hair Care", "Uncategorized"];

    // Debounce function
    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    const checkSkuUniqueness = useCallback(
        debounce(async (sku) => {
            if (!sku || sku.trim() === "" || isEditing) { // Only for new items or if SKU is editable
                setSkuError('');
                return;
            }
            // For new items, or if admin is editing SKU
            if (isEditing && currentUser?.role !== 'admin') {
                return; // Non-admins cannot change SKU when editing
            }

            setIsCheckingSku(true);
            setSkuError('');
            try {
                const result = await window.electronAPI.checkSkuExists(sku.trim());
                if (result.exists) {
                    // If editing, ensure it's not conflicting with another item's SKU
                    if (isEditing && result.item && result.item.id !== parseInt(itemIdFromParams, 10)) {
                        setSkuError(`SKU "${sku.trim()}" is already used by item "${result.item.name}".`);
                    } else if (!isEditing) { // For new items
                        let message = `SKU "${sku.trim()}" already exists for item "${result.item.name}".`;
                        if (result.item.is_archived) {
                            message += " This item is currently archived. Consider restoring it or use a different SKU.";
                        } else {
                            message += " Please use a unique SKU.";
                        }
                        setSkuError(message);
                    }
                } else if (result.error) {
                    setSkuError(`Error checking SKU: ${result.error}`);
                } else {
                    setSkuError('');
                }
            } catch (e) {
                setSkuError('Failed to verify SKU uniqueness.');
                console.error("Error in checkSkuUniqueness:", e);
            } finally {
                setIsCheckingSku(false);
            }
        }, 750),
    [isEditing, itemIdFromParams, currentUser?.role]);


    useEffect(() => {
        const loadStorageLocations = async () => {
            setIsLocationsLoading(true);
            try {
                const result = await window.electronAPI.getStorageLocations();
                if (result.success) {
                    setStorageLocationOptions(result.locations.map(loc => ({ value: loc.id, label: loc.name })));
                } else {
                    setError(prev => `${prev} Could not load storage locations.`.trim());
                }
            } catch (err) {
                setError(prev => `${prev} Error loading storage locations.`.trim());
            } finally {
                setIsLocationsLoading(false);
            }
        };
        if (!isEditing) {
            loadStorageLocations();
        }
    }, [isEditing]);

    useEffect(() => {
        if (isEditing && itemIdFromParams) {
            setIsLoading(true);
            const fetchItemData = async () => {
                setError(''); setSkuError('');
                try {
                    const item = await window.electronAPI.getItemById(itemIdFromParams);
                    if (item) {
                        setItemMasterData({
                            name: item.name || '',
                            sku: item.sku || '',
                            description: item.description || '',
                            cost_price: item.cost_price !== null ? String(item.cost_price) : '',
                            category: item.category || '',
                            variant: item.variant || '',
                            status: item.status || 'Normal',
                        });
                        setDisplayTotalStock(item.total_quantity || 0);
                        setDisplayStockByLocation(item.locations || []);
                    } else {
                        setError(`Item with ID ${itemIdFromParams} not found.`);
                    }
                } catch (err) {
                    setError(`Failed to load item data: ${err.message}`);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchItemData();
        } else {
            setItemMasterData(initialItemMasterData);
            setInitialStockEntries([{ locationId: '', quantity: '', locationName: '' }]);
            setDisplayTotalStock(0);
            setDisplayStockByLocation([]);
            setConfirmDetails(false);
            setIsLoading(false);
            setSkuError('');
        }
    }, [itemIdFromParams, isEditing]);

    const handleChangeMasterData = (e) => {
        const { name, value } = e.target;
        setItemMasterData(prev => ({ ...prev, [name]: value }));
        if (name === 'sku') {
            // For new items, or if admin is editing SKU and it's different from original
            // This check is primarily for real-time feedback. Submit will do a final check.
            if (!isEditing || (isEditing && currentUser?.role === 'admin')) {
                 checkSkuUniqueness(value);
            }
        }
    };

    const handleStatusClick = (newStatus) => {
        setItemMasterData(prev => ({ ...prev, status: newStatus }));
    };

    const handleInitialStockChange = (index, field, value) => {
        const updatedEntries = [...initialStockEntries];
        if (field === 'locationId') {
            const selectedLocation = storageLocationOptions.find(opt => opt.value === value);
            updatedEntries[index].locationId = value;
            updatedEntries[index].locationName = selectedLocation ? selectedLocation.label : '';
        } else {
            updatedEntries[index][field] = value;
        }
        setInitialStockEntries(updatedEntries);
    };

    const addInitialStockEntry = () => {
        setInitialStockEntries([...initialStockEntries, { locationId: '', quantity: '', locationName: '' }]);
    };

    const removeInitialStockEntry = (index) => {
        setInitialStockEntries(initialStockEntries.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSkuError('');

        if (!confirmDetails) { setError('Please confirm the details before saving.'); return; }
        if (!itemMasterData.name.trim()) { setError('Product Name is required.'); return; }
        if (!itemMasterData.category) { setError('Product Category is required.'); return; }
        const costPrice = parseFloat(itemMasterData.cost_price);
        if (itemMasterData.cost_price === '' || isNaN(costPrice) || costPrice < 0) {
            setError('Valid Product Price is required (e.g., 60.00).'); return;
        }

        if (!isEditing) { // Validations for initial stock entries
            if (initialStockEntries.length > 0 && !initialStockEntries.every(entry => !entry.locationId && !entry.quantity)) {
                 for (const entry of initialStockEntries) {
                    if (entry.locationId || entry.quantity) {
                        if (!entry.locationId) { setError('All active initial stock entries must have a location selected.'); return; }
                        const qty = parseInt(entry.quantity, 10);
                        if (entry.quantity === '' || isNaN(qty) || qty < 0) {
                            setError(`Valid non-negative quantity required for initial stock at ${entry.locationName || 'selected location'}. Use 0 if none.`); return;
                        }
                    }
                }
            }
        }

        // Final SKU check before submitting, especially for new items or if admin changed SKU
        const currentSku = itemMasterData.sku ? itemMasterData.sku.trim() : "";
        if (currentSku !== "") { // Only check if SKU is not empty
            // For new items, or if admin is editing and SKU has changed from original
            let performSkuCheck = !isEditing;
            if (isEditing && currentUser?.role === 'admin') {
                const originalItem = await window.electronAPI.getItemById(itemIdFromParams); // Re-fetch to be sure
                if (originalItem && originalItem.sku !== currentSku) {
                    performSkuCheck = true;
                }
            }

            if (performSkuCheck) {
                setIsCheckingSku(true);
                const skuCheckResult = await window.electronAPI.checkSkuExists(currentSku);
                setIsCheckingSku(false);
                if (skuCheckResult.exists) {
                    // If editing, it's a conflict only if the existing SKU belongs to a DIFFERENT item
                    if (isEditing && skuCheckResult.item && skuCheckResult.item.id !== parseInt(itemIdFromParams, 10)) {
                         setSkuError(`SKU "${currentSku}" is already used by item "${skuCheckResult.item.name}".`);
                         setError("Please resolve SKU conflict before saving.");
                         skuInputRef.current?.focus();
                         return;
                    } else if (!isEditing) { // For new items, any existence is a conflict
                        let message = `SKU "${currentSku}" already exists for item "${skuCheckResult.item.name}".`;
                        if (skuCheckResult.item.is_archived) message += " This item is currently archived.";
                        setSkuError(message);
                        setError("Please resolve SKU conflict before saving.");
                        skuInputRef.current?.focus();
                        return;
                    }
                }
                if (skuCheckResult.error && !skuCheckResult.exists) { // Only error if it didn't find an existing one (which would be a different error)
                     setError(`Error verifying SKU before save: ${skuCheckResult.error}`);
                     return;
                }
            }
        }


        if (isEditing && currentUser?.role !== 'admin') {
            const originalItem = await window.electronAPI.getItemById(itemIdFromParams);
            if (originalItem) {
                if (itemMasterData.sku !== originalItem.sku) { setError("Employees cannot change SKU."); setIsSubmitting(false); return; }
                if (costPrice !== parseFloat(originalItem.cost_price)) { setError("Employees cannot change Price."); setIsSubmitting(false); return; }
            } else { setError("Could not verify original item data."); setIsSubmitting(false); return; }
        }

        setIsSubmitting(true);
        const itemDataForTable = {
            name: itemMasterData.name.trim(),
            sku: itemMasterData.sku.trim() || null,
            description: itemMasterData.description.trim() || null,
            cost_price: costPrice,
            category: itemMasterData.category,
            variant: itemMasterData.variant.trim() || null,
            status: itemMasterData.status,
        };

        const itemPayloadForCreate = {
            itemData: itemDataForTable,
            initialStockEntries: []
        };

        if (!isEditing) {
            const validInitialStock = initialStockEntries
                .filter(entry => entry.locationId && entry.quantity !== '' && Number(entry.quantity) >= 0)
                .map(entry => ({
                    locationId: entry.locationId,
                    quantity: Number(entry.quantity),
                    locationName: entry.locationName
                }));
            itemPayloadForCreate.initialStockEntries = validInitialStock;
        }

        try {
            let result;
            if (isEditing) {
                itemDataForTable.id = parseInt(itemIdFromParams, 10);
                result = await window.electronAPI.updateItem(itemDataForTable);
            } else {
                result = await window.electronAPI.createItem(itemPayloadForCreate);
            }

            if (result && result.success) {
                setShowSuccessModal(true);
            } else {
                if (result && result.isDuplicateSku) {
                    setSkuError(result.message);
                    setError("Failed to save item due to SKU conflict.");
                    skuInputRef.current?.focus();
                } else {
                    setError(result?.message || `Failed to ${isEditing ? 'update' : 'save'} item.`);
                }
            }
        } catch (err) {
            setError(`An error occurred: ${err.message}.`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        setShowSuccessModal(false);
        navigate('/products');
    };

    const isAdmin = currentUser?.role === 'admin';
    const disableSkuField = isEditing && !isAdmin;
    const disablePriceField = isEditing && !isAdmin;

    if (isLoading && isEditing) {
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading product details...</div>;
    }

    return (
        <div className="product-form-page page-container">
            <header className="page-header-alt">
                <div className="form-header-left">
                    <button onClick={() => navigate('/products')} className="back-button" aria-label="Go back to products list"><FaArrowLeft /></button>
                    <div>
                        <h1>{isEditing ? 'EDIT PRODUCT DETAILS' : 'NEW PRODUCT'}</h1>
                        <p className="form-subtitle">
                           {isEditing ? 'Edit product information. Stock levels are managed via Adjustments, Transfers, and Returns.' : 'Input product information and initial stock levels per location below.'}
                        </p>
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}

            <form onSubmit={handleSubmit} className="product-form card">
                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="name">Product Name *</label>
                        <input type="text" id="name" name="name" value={itemMasterData.name} onChange={handleChangeMasterData} placeholder="e.g., Kojic Soap" required />
                    </div>
                    <div className="form-group form-group-inline">
                        <label htmlFor="category">Product Category *</label>
                        <div className="input-with-icon">
                            <FaThLarge className="input-icon" />
                            <select id="category" name="category" value={itemMasterData.category} onChange={handleChangeMasterData} required>
                                <option value="" disabled>Select Category</option>
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="form-row">
                     <div className="form-group form-group-inline">
                         <label htmlFor="cost_price">Product Price *</label>
                         <input type="number" id="cost_price" name="cost_price" value={itemMasterData.cost_price} onChange={handleChangeMasterData}
                            min="0" step="0.01" placeholder="e.g., 60.00" required disabled={disablePriceField}
                            title={disablePriceField ? "Only admins can change price." : ""} />
                     </div>
                     <div className="form-group form-group-inline">
                         <label htmlFor="sku">SKU Code (Optional, Must be Unique)</label>
                         <input
                            ref={skuInputRef}
                            type="text" id="sku" name="sku" value={itemMasterData.sku}
                            onChange={handleChangeMasterData}
                            placeholder="e.g., BIOSKIN-KS-135"
                            disabled={disableSkuField || isCheckingSku}
                            title={disableSkuField ? "Only admins can change SKU." : (isCheckingSku ? "Verifying SKU..." : "")}
                            aria-describedby="sku-feedback"
                         />
                         {isCheckingSku && <small className="form-text text-muted" style={{display: 'block', marginTop: '0.25rem'}}>Checking SKU...</small>}
                         {skuError && <small id="sku-feedback" className="error-text-small">{skuError}</small>}
                     </div>
                </div>

                 <div className="form-row three-cols">
                     <div className="form-group form-group-inline">
                         <label htmlFor="variant">Variant (Optional)</label>
                         <input type="text" id="variant" name="variant" value={itemMasterData.variant} onChange={handleChangeMasterData} placeholder="e.g., 135 grams" />
                     </div>
                     <div className="form-group form-group-inline">
                         <label>Product Status</label>
                         <div className="status-buttons">
                             <button type="button" className={`status-btn high ${itemMasterData.status === 'High' ? 'active' : ''}`} onClick={() => handleStatusClick('High')}>High</button>
                             <button type="button" className={`status-btn normal ${itemMasterData.status === 'Normal' ? 'active' : ''}`} onClick={() => handleStatusClick('Normal')}>Normal</button>
                             <button type="button" className={`status-btn low ${itemMasterData.status === 'Low' ? 'active' : ''}`} onClick={() => handleStatusClick('Low')}>Low</button>
                         </div>
                     </div>
                     {isEditing && (
                        <div className="form-group form-group-inline">
                            <label>Total Current Stock</label>
                            <input type="text" value={`${displayTotalStock} units (all locations)`} readOnly className="form-control" style={{backgroundColor: '#e9ecef', textAlign:'right'}}/>
                        </div>
                     )}
                 </div>

                <div className="form-group">
                    <label htmlFor="description">Description (Optional)</label>
                    <textarea id="description" name="description" value={itemMasterData.description} onChange={handleChangeMasterData} rows="3" placeholder="Product details..."></textarea>
                </div>

                <hr className="section-divider" />
                {isEditing ? (
                    <div>
                        <h4>Stock by Location (Read-Only)</h4>
                        {displayStockByLocation.length > 0 ? (
                            <ul className="stock-location-list" style={{listStyle:'none', paddingLeft:0}}>
                                {displayStockByLocation.map(loc => (
                                    <li key={loc.locationId} style={{display:'flex', justifyContent:'space-between', padding:'0.5rem 0', borderBottom:'1px solid #eee'}}>
                                        <span>{loc.locationName}:</span>
                                        <strong>{loc.quantity} units</strong>
                                    </li>
                                ))}
                                {displayStockByLocation.length === 0 && <li>No stock recorded at specific locations.</li>}
                            </ul>
                        ) : <p>No stock recorded at any specific location for this item.</p>}
                        <p style={{fontSize:'0.9em', color:'var(--color-text-medium)', marginTop:'1rem'}}>
                            To change stock levels, please use Stock Adjustments or Stock Transfers.
                        </p>
                    </div>
                ) : (
                    <div>
                        <h4>Initial Stock Quantities by Location</h4>
                        <p style={{fontSize:'0.9em', color:'var(--color-text-medium)', marginBottom:'1rem'}}>
                            Define starting quantity at locations. Leave empty or set quantity to 0 if none.
                        </p>
                        {initialStockEntries.map((entry, index) => (
                            <div key={index} className="component-row form-row" style={{alignItems: 'flex-end', border:'1px dashed #ddd', padding:'1rem', marginBottom:'1rem'}}>
                                <div className="form-group" style={{flex:3}}>
                                    <label htmlFor={`location-${index}`}>Storage Location</label>
                                    <Select
                                        id={`location-${index}`}
                                        options={storageLocationOptions}
                                        value={storageLocationOptions.find(opt => opt.value === entry.locationId)}
                                        onChange={(selected) => handleInitialStockChange(index, 'locationId', selected ? selected.value : '')}
                                        isLoading={isLocationsLoading} isClearable placeholder="Select location..."
                                        styles={{ container: base => ({ ...base, zIndex: 10 - index }) }}
                                    />
                                </div>
                                <div className="form-group" style={{flex:1}}>
                                    <label htmlFor={`qty-${index}`}>Quantity</label>
                                    <input type="number" id={`qty-${index}`} value={entry.quantity}
                                        onChange={(e) => handleInitialStockChange(index, 'quantity', e.target.value)}
                                        min="0" placeholder="e.g., 100" className="form-control"
                                    />
                                </div>
                                {initialStockEntries.length > 1 && (
                                    <div className="component-actions">
                                        <button type="button" className="button-delete-component" onClick={() => removeInitialStockEntry(index)}><FaTrashAlt /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                        <button type="button" className="button button-secondary add-component-btn" onClick={addInitialStockEntry}>
                            <FaPlusCircle style={{marginRight:'8px'}}/> Add Another Location
                        </button>
                    </div>
                )}

                <div className="form-footer">
                    <div className="confirm-checkbox">
                         <input type="checkbox" id="confirmDetails" name="confirmDetails" checked={confirmDetails} onChange={(e) => setConfirmDetails(e.target.checked)} />
                         <label htmlFor="confirmDetails">I confirm all details of this product are correct.</label>
                     </div>
                     <div className="form-actions">
                         <button type="submit" className="button save-button" disabled={isSubmitting || !confirmDetails || (isLoading && isEditing) || isCheckingSku || !!skuError}>
                             {isSubmitting ? 'Saving...' : (isEditing ? 'Update Product Details' : 'Save New Product')}
                         </button>
                     </div>
                 </div>
            </form>

            {showSuccessModal && <SuccessModal onClose={handleCloseModal} />}
        </div>
    );
}

export default ProductFormPage;