// src/BundleListPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaBoxes, FaShoppingCart, FaInfoCircle } from 'react-icons/fa';
import './BundleListPage.css'; // Ensure this CSS file exists and is styled

// Modal Component for Recording Bundle Sale
const RecordSaleModal = ({ bundle, onClose, onRecordSale, processingSale }) => {
    const [quantitySold, setQuantitySold] = useState(1);
    const [saleError, setSaleError] = useState('');

    const handleSubmitSale = () => {
        const qty = parseInt(quantitySold, 10);
        if (isNaN(qty) || qty <= 0) {
            setSaleError('Please enter a valid positive quantity.');
            return;
        }
        // bundle.maxBuildable should be passed from the parent
        if (qty > bundle.maxBuildable) {
            setSaleError(`Cannot sell ${qty}. Only ${bundle.maxBuildable} can be built with current component stock.`);
            return;
        }
        setSaleError('');
        onRecordSale(bundle.id, qty);
        // onClose will be called by parent after processing
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content record-sale-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Record Sale for: {bundle.name}</h3>
                <p className="current-stock-info" style={{fontSize: '0.9em', marginBottom: '1rem'}}>
                    <FaInfoCircle /> Max Buildable: {bundle.maxBuildable}
                </p>
                <div className="form-group">
                    <label htmlFor="quantitySold">Quantity Sold:</label>
                    <input
                        type="number"
                        id="quantitySold"
                        name="quantitySold"
                        value={quantitySold}
                        onChange={(e) => setQuantitySold(e.target.value)}
                        min="1"
                        max={bundle.maxBuildable > 0 ? bundle.maxBuildable : undefined}
                        className="form-control" // Assuming you have a global .form-control style
                        required
                        disabled={processingSale}
                    />
                </div>
                {saleError && <p className="error-message" style={{color: 'red', fontSize: '0.9em', marginTop: '0.5rem'}}>{saleError}</p>}
                <div className="form-actions" style={{marginTop: '1.5rem', textAlign: 'right'}}>
                    <button type="button" className="button button-secondary" onClick={onClose} disabled={processingSale} style={{marginRight: '10px'}}>Cancel</button>
                    <button type="button" className="button button-primary" onClick={handleSubmitSale} disabled={processingSale || quantitySold <=0 || bundle.maxBuildable <=0 }>
                        {processingSale ? 'Processing...' : 'Record Sale'}
                    </button>
                </div>
            </div>
        </div>
    );
};


function BundleListPage({ currentUser }) {
    const [bundles, setBundles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(''); // For general success messages
    const navigate = useNavigate();

    const [showSaleModal, setShowSaleModal] = useState(false);
    const [selectedBundleForSale, setSelectedBundleForSale] = useState(null);
    const [processingSale, setProcessingSale] = useState(false);

    const calculateMaxBuildable = useCallback((components) => {
        if (!components || components.length === 0) return 0;
        let maxBuildable = Infinity;
        for (const comp of components) {
            if (!comp.item || typeof comp.item.quantity !== 'number' || typeof comp.quantity_in_bundle !== 'number' || comp.quantity_in_bundle <= 0) {
                return 0; // Invalid component data or missing item data
            }
            const buildableForThisComp = Math.floor(comp.item.quantity / comp.quantity_in_bundle);
            if (buildableForThisComp < maxBuildable) {
                maxBuildable = buildableForThisComp;
            }
        }
        return maxBuildable === Infinity ? 0 : maxBuildable;
    }, []);

    const loadBundles = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        // setSuccessMessage(''); // Clear previous success messages
        try {
            const fetchedBundles = await window.electronAPI.getBundles({});
            const bundlesWithBuildable = (fetchedBundles || []).map(b => ({
                ...b,
                maxBuildable: calculateMaxBuildable(b.components)
            }));
            setBundles(bundlesWithBuildable);
        } catch (err) {
            console.error("Error loading bundles:", err);
            setError(`Failed to load bundles: ${err.message}`);
            setBundles([]);
        } finally {
            setIsLoading(false);
        }
    }, [calculateMaxBuildable]);

    useEffect(() => {
        loadBundles();
    }, [loadBundles]);

    const navigateToEdit = (bundleId) => navigate(`/bundles/${bundleId}/edit`);
    const navigateToAddNew = () => navigate('/bundles/new');

    const handleDeleteBundle = async (bundleId, bundleName) => {
        if (window.confirm(`Are you sure you want to delete the bundle "${bundleName}"? This action cannot be undone.`)) {
            setError(null);
            setSuccessMessage('');
            try {
                const result = await window.electronAPI.deleteBundle(bundleId);
                if (result.success) {
                    setSuccessMessage(result.message || 'Bundle deleted successfully!');
                    loadBundles();
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
        if (bundle.maxBuildable <= 0) {
            alert("This bundle cannot be sold as there isn't enough stock for its components.");
            return;
        }
        setSelectedBundleForSale(bundle);
        setShowSaleModal(true);
        setError(''); // Clear main page errors when modal opens
        setSuccessMessage('');
    };

    const handleCloseSaleModal = () => {
        setShowSaleModal(false);
        setSelectedBundleForSale(null);
    };

    const handleRecordSale = async (bundleId, quantitySold) => {
        setProcessingSale(true);
        setError(null);
        setSuccessMessage('');
        try {
            const result = await window.electronAPI.processBundleSale(bundleId, quantitySold);
            if (result.success) {
                setSuccessMessage(result.message || 'Bundle sale recorded successfully!');
                loadBundles(); // Reload bundles to update maxBuildable and component stock
                setTimeout(() => setSuccessMessage(''), 3000);
            } else {
                setError(result.message || 'Failed to process bundle sale.');
            }
        } catch (err) {
            console.error("Error processing bundle sale:", err);
            setError(`Error processing bundle sale: ${err.message}`);
        } finally {
            setProcessingSale(false);
            handleCloseSaleModal();
        }
    };

    if (isLoading) {
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading bundles...</div>;
    }

    return (
        <div className="bundle-list-page page-container">
            <header className="page-header-alt">
                <h1>Product Bundles / Kits</h1>
                {currentUser?.role === 'admin' && (
                    <button className="button button-primary" onClick={navigateToAddNew}>
                        <FaPlus style={{ marginRight: '8px' }} /> Add New Bundle
                    </button>
                )}
            </header>

            {error && (
                <div className="card error-message" role="alert" style={{ color: 'var(--color-status-danger)', border: '1px solid var(--color-status-danger)', backgroundColor: 'rgba(211,47,47,0.05)',  marginBottom: '1rem', padding: '1rem' }}>
                    Error: {error}
                </div>
            )}
            {successMessage && (
                <div className="card success-message" role="status" style={{ color: 'var(--color-status-success)', border: '1px solid var(--color-status-success)', backgroundColor: 'rgba(56,142,60,0.05)', marginBottom: '1rem', padding: '1rem' }}>
                    {successMessage}
                </div>
            )}
            {processingSale && <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-primary-dark)', fontWeight: 'bold' }}>Processing sale, please wait...</p>}

            <main className="content-block-wrapper">
                {!isLoading && bundles.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>No bundles found. Click "Add New Bundle" to create one.</p>
                )}
                {bundles.length > 0 && (
                    <div className="table-container">
                        <table id="bundleTable">
                            <thead>
                                <tr>
                                    <th>Bundle Name</th>
                                    <th>Bundle SKU</th>
                                    <th>Price</th>
                                    <th>Components</th>
                                    <th className="text-center">Max Buildable</th>
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
                                                        <li key={comp.item_id}>
                                                            {comp.item?.name || `Item ID: ${comp.item_id}`} (x{comp.quantity_in_bundle})
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
                                                    title="Edit Bundle"
                                                    className="button-edit"
                                                    onClick={() => navigateToEdit(bundle.id)}
                                                >
                                                    <FaEdit /> Edit
                                                </button>
                                                <button
                                                    title="Delete Bundle"
                                                    className="button-delete"
                                                    onClick={() => handleDeleteBundle(bundle.id, bundle.name)}
                                                >
                                                    <FaTrash /> Delete
                                                </button>
                                                <button
                                                    title="Record Bundle Sale"
                                                    className="button-action record-sale-btn"
                                                    onClick={() => handleOpenSaleModal(bundle)}
                                                    disabled={bundle.maxBuildable <= 0 || processingSale}
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