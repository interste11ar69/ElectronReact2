// src/ProductFormPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaThLarge, FaPlusCircle, FaTrashAlt } from 'react-icons/fa';
import Select from 'react-select'; // For location selection in initial stock
import './ProductFormPage.css'; // Ensure styles are appropriate
import './BundleFormPage.css'; // Reusing some styles for dynamic rows like .component-row
import SuccessModal from './SuccessModal';

function ProductFormPage({ currentUser }) {
    const { id: itemIdFromParams } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(itemIdFromParams);

    // --- State for Master Item Details ---
    const initialItemMasterData = {
        name: '',
        sku: '',
        description: '',
        cost_price: '',
        category: '',
        variant: '',
        status: 'Normal',
    };
    const [itemMasterData, setItemMasterData] = useState(initialItemMasterData);

    // --- State for Initial Stock Entries (only for new items) ---
    const [initialStockEntries, setInitialStockEntries] = useState([{ locationId: '', quantity: '', locationName: '' }]);
    const [storageLocationOptions, setStorageLocationOptions] = useState([]);
    const [isLocationsLoading, setIsLocationsLoading] = useState(false);

    // --- State for Displaying Stock (only for editing items) ---
    const [displayTotalStock, setDisplayTotalStock] = useState(0);
    const [displayStockByLocation, setDisplayStockByLocation] = useState([]);

    // --- General Form State ---
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [confirmDetails, setConfirmDetails] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const categories = ["Beauty Soap", "Skincare", "Wellness", "Cosmetics", "Soap", "Body Care", "Hair Care", "Uncategorized"];

    // Fetch storage locations for the dropdown
    useEffect(() => {
        const loadStorageLocations = async () => {
            setIsLocationsLoading(true);
            try {
                const result = await window.electronAPI.getStorageLocations();
                if (result.success) {
                    setStorageLocationOptions(
                        result.locations.map(loc => ({ value: loc.id, label: loc.name }))
                    );
                } else {
                    setError(prev => `${prev} Could not load storage locations.`.trim());
                }
            } catch (err) {
                setError(prev => `${prev} Error loading storage locations.`.trim());
            } finally {
                setIsLocationsLoading(false);
            }
        };
        if (!isEditing) { // Only needed for new items
            loadStorageLocations();
        }
    }, [isEditing]);


    // Fetch item data if editing
    useEffect(() => {
        if (isEditing && itemIdFromParams) {
            setIsLoading(true);
            const fetchItemData = async () => {
                setError('');
                try {
                    // getItemById should now return total_quantity and locations array
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
            // Reset for new item form
            setItemMasterData(initialItemMasterData);
            setInitialStockEntries([{ locationId: '', quantity: '', locationName: '' }]);
            setDisplayTotalStock(0);
            setDisplayStockByLocation([]);
            setConfirmDetails(false); // Reset confirmation
            setIsLoading(false);
        }
    }, [itemIdFromParams, isEditing]);

    const handleChangeMasterData = (e) => {
        const { name, value } = e.target;
        setItemMasterData(prev => ({ ...prev, [name]: value }));
    };

    const handleStatusClick = (newStatus) => {
        setItemMasterData(prev => ({ ...prev, status: newStatus }));
    };

    // --- Handlers for Initial Stock Entries (for NEW items) ---
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
    // --- End Handlers for Initial Stock ---


    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!confirmDetails) { setError('Please confirm the details before saving.'); return; }
        if (!itemMasterData.name.trim()) { setError('Product Name is required.'); return; }
        if (!itemMasterData.category) { setError('Product Category is required.'); return; }
        // Cost price validation (for both new and edit by admin)
        const costPrice = parseFloat(itemMasterData.cost_price);
        if (itemMasterData.cost_price === '' || isNaN(costPrice) || costPrice < 0) {
            setError('Valid Product Price is required (e.g., 60.00).'); return;
        }


        // Validations for initial stock entries (only if !isEditing)
        if (!isEditing) {
            if (initialStockEntries.length === 0 || initialStockEntries.every(entry => !entry.locationId && !entry.quantity)) {
                // Allow creating item with 0 stock if no entries are actively filled
            } else {
                 for (const entry of initialStockEntries) {
                    // If an entry has either field filled, both become required for that entry
                    if (entry.locationId || entry.quantity) {
                        if (!entry.locationId) { setError('All active initial stock entries must have a location selected.'); return; }
                        const qty = parseInt(entry.quantity, 10);
                        if (entry.quantity === '' || isNaN(qty) || qty < 0) {
                            setError(`Valid positive quantity required for initial stock at ${entry.locationName || 'selected location'}. Use 0 if none.`); return;
                        }
                    }
                }
            }
        }

        // Role-based validation for SKU and Price when editing
        if (isEditing && currentUser?.role !== 'admin') {
            const originalItem = await window.electronAPI.getItemById(itemIdFromParams);
            if (originalItem) {
                if (itemMasterData.sku !== originalItem.sku) {
                    setError("Employees cannot change SKU."); setIsSubmitting(false); return;
                }
                if (costPrice !== parseFloat(originalItem.cost_price)) {
                    setError("Employees cannot change Price."); setIsSubmitting(false); return;
                }
            } else {
                setError("Could not verify original item data."); setIsSubmitting(false); return;
            }
        }

        setIsSubmitting(true);

        // Prepare master item data without quantity/storage for the items table
        const itemDataForTable = {
            name: itemMasterData.name.trim(),
            sku: itemMasterData.sku.trim() || null,
            description: itemMasterData.description.trim() || null,
            cost_price: costPrice,
            category: itemMasterData.category,
            variant: itemMasterData.variant.trim() || null,
            status: itemMasterData.status,
        };

        try {
            let result;
            if (isEditing) {
                itemDataForTable.id = parseInt(itemIdFromParams, 10);
                result = await window.electronAPI.updateItem(itemDataForTable); // updateItem only updates master details
            } else {
                // Filter out empty stock entries and prepare for backend
                const validInitialStock = initialStockEntries
                    .filter(entry => entry.locationId && Number(entry.quantity) >= 0) // Ensure quantity is non-negative
                    .map(entry => ({
                        locationId: entry.locationId,
                        quantity: Number(entry.quantity),
                        locationName: entry.locationName // For logging on backend
                    }));
                // Pass itemDataForTable, validInitialStock, and user details
                result = await window.electronAPI.createItem({
                    itemData: itemDataForTable,
                    initialStockEntries: validInitialStock
                    // userId and username will be picked up by main.js from currentUser
                });
            }

            if (result && result.success) {
                setShowSuccessModal(true);
            } else {
                setError(result?.message || `Failed to ${isEditing ? 'update' : 'save'} item.`);
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
                           {isEditing ? 'Edit product information. Stock levels are managed via Adjustments, Transfers, Sales, and Returns.' : 'Input product information and initial stock levels per location below.'}
                        </p>
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}

            <form onSubmit={handleSubmit} className="product-form card">
                {/* --- Master Item Details --- */}
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
                         <label htmlFor="sku">SKU Code (Optional)</label>
                         <input type="text" id="sku" name="sku" value={itemMasterData.sku} onChange={handleChangeMasterData}
                            placeholder="e.g., BIOSKIN-KS-135" disabled={disableSkuField}
                            title={disableSkuField ? "Only admins can change SKU." : ""} />
                     </div>
                </div>

                 <div className="form-row three-cols"> {/* Assuming three-cols class handles layout */}
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
                     {isEditing && ( // Only show total stock when editing
                        <div className="form-group form-group-inline">
                            <label>Total Current Stock</label>
                            <input type="text" value={`${displayTotalStock} units (across all locations)`} readOnly className="form-control" style={{backgroundColor: '#e9ecef'}}/>
                        </div>
                     )}
                 </div>

                <div className="form-group">
                    <label htmlFor="description">Description (Optional)</label>
                    <textarea id="description" name="description" value={itemMasterData.description} onChange={handleChangeMasterData} rows="3" placeholder="Product details..."></textarea>
                </div>

                {/* --- Stock Information Section --- */}
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
                            </ul>
                        ) : <p>No stock recorded at any location for this item.</p>}
                        <p style={{fontSize:'0.9em', color:'var(--color-text-medium)', marginTop:'1rem'}}>
                            To change stock levels, please use Stock Adjustments, Stock Transfers, Process Returns, or fulfill Sales Orders.
                        </p>
                    </div>
                ) : (
                    <div>
                        <h4>Initial Stock Quantities by Location *</h4>
                        <p style={{fontSize:'0.9em', color:'var(--color-text-medium)', marginBottom:'1rem'}}>
                            Define the starting quantity for this new product at one or more storage locations. If none, leave empty or set quantity to 0.
                        </p>
                        {initialStockEntries.map((entry, index) => (
                            <div key={index} className="component-row form-row" style={{alignItems: 'flex-end', border:'1px dashed #ddd', padding:'1rem', marginBottom:'1rem'}}> {/* Reusing class */}
                                <div className="form-group" style={{flex:3}}>
                                    <label htmlFor={`location-${index}`}>Storage Location *</label>
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
                                    <label htmlFor={`qty-${index}`}>Quantity *</label>
                                    <input type="number" id={`qty-${index}`} value={entry.quantity}
                                        onChange={(e) => handleInitialStockChange(index, 'quantity', e.target.value)}
                                        min="0" placeholder="e.g., 100" className="form-control"
                                    />
                                </div>
                                {initialStockEntries.length > 1 && (
                                    <div className="component-actions"> {/* Reusing class */}
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
                         <button type="submit" className="button save-button" disabled={isSubmitting || !confirmDetails || (isLoading && isEditing)}>
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