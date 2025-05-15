// src/BundleListPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaShoppingCart, FaInfoCircle } from 'react-icons/fa';
import './BundleListPage.css';

// RecordSaleModal remains the same
// --- MODAL COMPONENT DEFINED OUTSIDE BundleListPage ---
const RecordSaleModal = ({ bundle, onClose, onRecordSale, processingSale }) => {
    const [quantitySold, setQuantitySold] = useState(1);
    const [saleError, setSaleError] = useState('');

    const handleSubmitSale = () => {
        const qty = parseInt(quantitySold, 10);
        if (isNaN(qty) || qty <= 0) {
            setSaleError('Please enter a valid positive quantity.');
            return;
        }
        if (bundle && qty > bundle.maxBuildable) { // Added check for bundle existence
            setSaleError(`Cannot sell ${qty}. Only ${bundle.maxBuildable} can be built with current STORE component stock.`);
            return;
        }
        setSaleError('');
        onRecordSale(bundle.id, qty);
    };

    // Added a check for bundle before trying to access its properties
    if (!bundle) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content record-sale-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Record Sale for: {bundle.name}</h3>
                <p className="current-stock-info" style={{fontSize: '0.9em', marginBottom: '1rem'}}>
                    <FaInfoCircle /> Max Buildable from STORE: {bundle.maxBuildable}
                </p>
                <div className="form-group">
                    <label htmlFor="quantitySold">Quantity Sold:</label>
                    <input
                        type="number" id="quantitySold" name="quantitySold"
                        value={quantitySold} onChange={(e) => setQuantitySold(e.target.value)}
                        min="1" max={bundle.maxBuildable > 0 ? bundle.maxBuildable : undefined}
                        className="form-control" required disabled={processingSale}
                    />
                </div>
                {saleError && <p className="error-message" style={{color: 'red', fontSize: '0.9em', marginTop: '0.5rem'}}>{saleError}</p>}
                <div className="form-actions" style={{marginTop: '1.5rem', textAlign: 'right'}}>
                    <button type="button" className="button button-secondary" onClick={onClose} disabled={processingSale} style={{marginRight: '10px'}}>Cancel</button>
                    <button
                        type="button"
                        className="button button-primary"
                        onClick={handleSubmitSale}
                        disabled={processingSale || !quantitySold || Number(quantitySold) <=0 || bundle.maxBuildable <=0 }
                    >
                        {processingSale ? 'Processing...' : 'Record Sale'}
                    </button>
                </div>
            </div>
        </div>
    );
};

function BundleListPage({ currentUser }) {
    const [bundles, setBundles] = useState([]);
    const [isLoading, setIsLoading] = useState(true); // Start true
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');
    const navigate = useNavigate();

    const [showSaleModal, setShowSaleModal] = useState(false);
    const [selectedBundleForSale, setSelectedBundleForSale] = useState(null);
    const [processingSale, setProcessingSale] = useState(false);
    const [storeLocationId, setStoreLocationId] = useState(null);

    useEffect(() => {
        const fetchStoreId = async () => {
            try {
                const id = await window.electronAPI.getStoreLocationId();
                if (id) {
                    setStoreLocationId(id);
                } else {
                    setError(prev => (prev ? prev + " " : "").trim() + " STORE location not configured. Bundle buildable counts may be inaccurate.");
                }
            } catch (e) {
                setError(prev => (prev ? prev + " " : "").trim() + " Error fetching STORE configuration for bundle list.");
                console.error("Error fetching STORE ID in BundleListPage:", e);
            }
        };
        fetchStoreId();
    }, []);

    const calculateMaxBuildableFromStore = useCallback((components) => {
        if (!components || components.length === 0) return 0;
        let maxBuildable = Infinity;
        for (const comp of components) {
            // Ensure comp.item and quantity_at_specific_location exist
            if (!comp.item || typeof comp.item.quantity_at_specific_location !== 'number' ||
                typeof comp.quantity_in_bundle !== 'number' || comp.quantity_in_bundle <= 0) {
                // console.warn("Invalid component data for maxBuildable calculation:", comp);
                return 0; // Cannot calculate if data is missing or invalid
            }
            const buildableForThisComp = Math.floor(comp.item.quantity_at_specific_location / comp.quantity_in_bundle);
            if (buildableForThisComp < maxBuildable) {
                maxBuildable = buildableForThisComp;
            }
        }
        return maxBuildable === Infinity ? 0 : maxBuildable;
    }, []);

    const loadBundles = useCallback(async () => {
        if (storeLocationId === null) {
            // Don't attempt to load if storeLocationId isn't set yet,
            // as calculations depend on it.
            // The calling useEffect will handle this.
            return;
        }

        setIsLoading(true);
        // Clear general errors, but preserve store config error if it exists
        if (error && !error.toLowerCase().includes("store")) {
            setError(null);
        }

        try {
            const apiFilters = { storeLocationId: storeLocationId };
            // Pass storeLocationId so backend can fetch correct component quantities
            const fetchedBundles = await window.electronAPI.getBundles(apiFilters);

            const bundlesWithBuildable = (fetchedBundles || []).map(b => ({
                ...b,
                maxBuildable: calculateMaxBuildableFromStore(b.components)
            }));
            setBundles(bundlesWithBuildable);

        } catch (err) {
            console.error("Error loading bundles (STORE specific):", err);
            setError(`Failed to load bundles: ${err.message}`);
            setBundles([]);
        } finally {
            setIsLoading(false);
        }
    // Dependencies: Only external values that, when changed, should cause this function to be re-created
    // and thus re-fetched. `calculateMaxBuildableFromStore` is stable. `storeLocationId` is key.
    // `error` is included to allow conditional clearing of general errors.
    }, [calculateMaxBuildableFromStore, storeLocationId, error]);

    useEffect(() => {
        if (storeLocationId !== null) { // Only load if storeLocationId is available
            loadBundles();
        } else {
            // If storeLocationId is not yet set, ensure UI reflects a loading or waiting state
            // and clear any previously loaded bundles.
            setBundles([]);
            // setIsLoading(true); // Or manage loading state based on storeLocationId fetch
        }
    // This useEffect runs when storeLocationId changes, or when loadBundles function reference changes.
    // loadBundles reference changes if its dependencies (calculateMaxBuildableFromStore, storeLocationId, error) change.
    }, [storeLocationId, loadBundles]);

    const navigateToEdit = (bundleId) => navigate(`/bundles/${bundleId}/edit`);
    const navigateToAddNew = () => navigate('/bundles/new');

    const handleDeleteBundle = async (bundleId, bundleName) => {
        // ... (same)
        if (window.confirm(`Are you sure you want to delete the bundle "${bundleName}"? This action cannot be undone.`)) {
            setError(null);
            setSuccessMessage('');
            try {
                const result = await window.electronAPI.deleteBundle(bundleId);
                if (result.success) {
                    setSuccessMessage(result.message || 'Bundle deleted successfully!');
                    if (storeLocationId !== null) loadBundles(); // Reload only if storeId is available
                    setTimeout(() => setSuccessMessage(''), 3000);
                } else {
                    setError(result.message || 'Failed to delete bundle.');
                }
            } catch (err) {
                console.error("Error deleting bundle:", err);
                setError(`Error deleting bundle: ${err.message}`);
            }
        }
    };

    const handleOpenSaleModal = (bundle) => {
        // ... (same)
        if (!storeLocationId) {
            alert("STORE location configuration is missing. Cannot process sale.");
            return;
        }
        if (bundle.maxBuildable <= 0) {
            alert("This bundle cannot be sold as there isn't enough stock for its components in the STORE.");
            return;
        }
        setSelectedBundleForSale(bundle);
        setShowSaleModal(true);
        setError('');
        setSuccessMessage('');
    };

    const handleCloseSaleModal = () => {
        // ... (same)
        setShowSaleModal(false);
        setSelectedBundleForSale(null);
    };

    const handleRecordSale = async (bundleId, quantitySold) => {
        // ... (same)
        if (!storeLocationId) {
            setError("Cannot process sale: STORE location configuration is missing.");
            setProcessingSale(false);
            handleCloseSaleModal();
            return;
        }
        setProcessingSale(true);
        setError(null); setSuccessMessage('');
        try {
            // Pass storeLocationId to processBundleSale if the backend needs it to know *where* to deduct from.
            // Assuming processBundleSale implicitly uses the "STORE" context or the backend db.processBundleSale
            // is already aware of the "STORE" location for component deduction.
            // If not, you might need to pass storeLocationId here:
            // const result = await window.electronAPI.processBundleSale({ bundleId, quantitySold, locationId: storeLocationId });
            const result = await window.electronAPI.processBundleSale({ bundleId, quantitySold }); // Assuming backend handles store context
            if (result && result.success) {
                setSuccessMessage(result.message || 'Bundle sale recorded successfully! Stock deducted from STORE.');
                if (storeLocationId !== null) loadBundles(); // Reload
                setTimeout(() => setSuccessMessage(''), 3000);
            } else {
                setError(result?.message || 'Failed to process bundle sale from STORE.');
            }
        } catch (err) {
            console.error("Error processing bundle sale from STORE:", err);
            setError(`Error processing bundle sale: ${err.message}`);
        } finally {
            setProcessingSale(false);
            handleCloseSaleModal();
        }
    };

    // Initial loading state: show loading if storeLocationId is still null OR if isLoading is true
    if (storeLocationId === null || (isLoading && bundles.length === 0 && !error)) {
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading bundles and STORE configuration...</div>;
    }

    return (
        // ... JSX remains largely the same ...
        // Ensure the table correctly displays comp.item.quantity_at_specific_location
        // In the table:
        // {` - STORE Stock: ${comp.item?.quantity_at_specific_location ?? 'N/A'}`}
        // This should now work correctly if db.getBundles is fixed.
        <div className="bundle-list-page page-container">
            <header className="page-header-alt">
                <h1>Product Bundles / Kits (from STORE)</h1>
                {currentUser?.role === 'admin' && (
                    <button className="button button-primary" onClick={navigateToAddNew}>
                        <FaPlus style={{ marginRight: '8px' }} /> Add New Bundle
                    </button>
                )}
            </header>

            {error && (
                <div className="card error-message" role="alert">
                    Error: {error}
                </div>
            )}
            {successMessage && (
                <div className="card success-message" role="status">
                    {successMessage}
                </div>
            )}

            {processingSale && <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-primary-dark)', fontWeight: 'bold' }}>Processing sale from STORE, please wait...</p>}

            <main className="content-block-wrapper">
                {(!isLoading && bundles.length === 0 && !error) && (
                    <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>No bundles found. Click "Add New Bundle" to create one (components must be in STORE).</p>
                )}
                {bundles.length > 0 && (
                    <div className="table-container">
                        <table id="bundleTable">
                            <thead>
                                <tr>
                                    <th>Bundle Name</th>
                                    <th>Bundle SKU</th>
                                    <th>Price</th>
                                    <th>Components (Requires STORE Stock)</th>
                                    <th className="text-center">Max Buildable (from STORE)</th>
                                    <th>Status</th>
                                    {currentUser?.role === 'admin' && <th className="text-center">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {bundles.map(bundle => (
                                    <tr key={bundle.id}>
                                        <td>{bundle.name}</td>
                                        <td>{bundle.bundle_sku || 'N/A'}</td>
                                        <td>{bundle.price ? `Php ${Number(bundle.price).toFixed(2)}` : 'N/A'}</td>
                                        <td>
                                            {bundle.components && bundle.components.length > 0 ? (
                                                <ul className="component-list-inline">
                                                    {bundle.components.map(comp => (
                                                        <li key={comp.item_id || comp.item?.id /* Use item.id as fallback if item_id is not directly on comp */}>
                                                            {comp.item?.name || `Item ID: ${comp.item_id}`} (x{comp.quantity_in_bundle})
                                                            <span style={{fontSize: '0.8em', color: 'var(--color-text-light)'}}>
                                                                {/* This now relies on the enriched comp.item.quantity_at_specific_location */}
                                                                {` - STORE Stock: ${comp.item?.quantity_at_specific_location ?? 'N/A'}`}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : <span style={{color: 'var(--color-text-light)'}}>No components defined</span>}
                                        </td>
                                        <td className={`text-center ${bundle.maxBuildable <= 0 ? 'stock-status-low' : bundle.maxBuildable < 5 ? 'stock-status-moderate' : 'stock-status-high'}`}
                                            style={bundle.maxBuildable <= 0 ? {fontWeight: 'bold'} : {}} >
                                            {bundle.maxBuildable}
                                        </td>
                                        <td>{bundle.is_active ? 'Active' : 'Inactive'}</td>
                                        {currentUser?.role === 'admin' && (
                                            <td className="text-center table-actions">
                                                <button
                                                    title="Edit Bundle" className="button-edit"
                                                    onClick={() => navigateToEdit(bundle.id)} >
                                                    <FaEdit /> Edit
                                                </button>
                                                <button
                                                    title="Delete Bundle" className="button-delete"
                                                    onClick={() => handleDeleteBundle(bundle.id, bundle.name)} >
                                                    <FaTrash /> Delete
                                                </button>
                                                <button
                                                    title="Record Bundle Sale (from STORE)"
                                                    className="button-action record-sale-btn"
                                                    onClick={() => handleOpenSaleModal(bundle)}
                                                    disabled={bundle.maxBuildable <= 0 || processingSale || !storeLocationId}
                                                >
                                                    <FaShoppingCart /> Sell
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            {showSaleModal && selectedBundleForSale && (
                 <RecordSaleModal
                    bundle={selectedBundleForSale}
                    onClose={handleCloseSaleModal}
                    onRecordSale={handleRecordSale}
                    processingSale={processingSale}
                />
            )}
        </div>
    );
}

export default BundleListPage;