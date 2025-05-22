// src/BundleListPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaArchive, FaUndo } from 'react-icons/fa';
import './BundleListPage.css';

function BundleListPage({ currentUser }) {
    const [bundles, setBundles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');
    const navigate = useNavigate();
    const [storeLocationId, setStoreLocationId] = useState(null);
    const [showArchived, setShowArchived] = useState(false);

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
            if (!comp.item || typeof comp.item.quantity_at_specific_location !== 'number' ||
                typeof comp.quantity_in_bundle !== 'number' || comp.quantity_in_bundle <= 0) {
                return 0;
            }
            const buildableForThisComp = Math.floor(comp.item.quantity_at_specific_location / comp.quantity_in_bundle);
            if (buildableForThisComp < maxBuildable) {
                maxBuildable = buildableForThisComp;
            }
        }
        return maxBuildable === Infinity ? 0 : maxBuildable;
    }, []);

    const loadBundles = useCallback(async () => {
        if (storeLocationId === null && !error?.includes("STORE configuration")) {
            return;
        }
        setIsLoading(true);
        if (error && !error.toLowerCase().includes("store")) {
            setError(null);
        }
        setSuccessMessage('');

        try {
            const apiFilters = {
                storeLocationId: storeLocationId,
                // isActive: !showArchived, // You might use this if bundles have an active/inactive status separate from archive
                is_archived: showArchived
            };
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
    }, [calculateMaxBuildableFromStore, storeLocationId, error, showArchived]);

    useEffect(() => {
        if (storeLocationId !== null || error?.includes("STORE configuration")) {
            loadBundles();
        } else {
            setBundles([]);
        }
    }, [storeLocationId, loadBundles, error]);

    const navigateToEdit = (bundle) => {
        if (bundle.is_archived) {
            alert("Archived bundles cannot be edited. Please restore the bundle first.");
            return;
        }
        navigate(`/bundles/${bundle.id}/edit`);
    };
    const navigateToAddNew = () => navigate('/bundles/new');

    const handleArchiveBundle = async (bundleId, bundleName, isCurrentlyArchived) => {
        const actionText = isCurrentlyArchived ? 'restore' : 'archive';
        const friendlyName = bundleName || `Bundle ID ${bundleId}`;
        const confirmationMessage = `Are you sure you want to ${actionText} the bundle "${friendlyName}"?`;

        if (window.confirm(confirmationMessage)) {
            setError(null);
            setSuccessMessage('');
            try {
                const result = await window.electronAPI.archiveBundle(bundleId, !isCurrentlyArchived);
                if (result.success) {
                    setSuccessMessage(result.message || `Bundle ${actionText}d successfully!`);
                    loadBundles();
                    setTimeout(() => setSuccessMessage(''), 3000);
                } else {
                    setError(result.message || `Failed to ${actionText} bundle.`);
                }
            } catch (err) {
                setError(`Error ${actionText}ing bundle: ${err.message}`);
            }
        }
    };

    if ((storeLocationId === null && !error?.includes("STORE configuration")) || (isLoading && bundles.length === 0 && !error)) {
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading bundles and STORE configuration...</div>;
    }

    return (
        <div className="bundle-list-page page-container">
            <header className="page-header-alt">
                <h1>{showArchived ? "Archived Bundles" : "Product Bundles / Kits"} (Components from STORE)</h1>
                <div className="page-header-actions">
                    {currentUser?.role === 'admin' && (
                        <button
                            className={`button ${showArchived ? 'button-primary' : 'button-secondary'} view-archive-btn`}
                            onClick={() => setShowArchived(!showArchived)}
                        >
                            {showArchived ? <FaUndo style={{ marginRight: '8px' }} /> : <FaArchive style={{ marginRight: '8px' }} />}
                            {showArchived ? 'View Active Bundles' : 'View Archived Bundles'}
                        </button>
                    )}
                    {currentUser?.role === 'admin' && !showArchived && (
                        <button className="button button-primary add-new-btn" onClick={navigateToAddNew}>
                            <FaPlus style={{ marginRight: '8px' }} /> Add New Bundle
                        </button>
                    )}
                </div>
            </header>

            {error && <div className="card error-message" role="alert">Error: {error}</div>}
            {successMessage && <div className="card success-message" role="status">{successMessage}</div>}

            <main className="content-block-wrapper">
                {(!isLoading && bundles.length === 0 && !error) && (
                    <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
                        No {showArchived ? 'archived' : 'active'} bundles found.
                        {!showArchived && currentUser?.role === 'admin' && ' Click "Add New Bundle" to create one.'}
                    </p>
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
                                    {showArchived && <th>Archived At</th>}
                                    {currentUser?.role === 'admin' && <th className="text-center">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {bundles.map(bundle => (
                                    <tr key={bundle.id} style={bundle.is_archived ? { backgroundColor: '#f8f9fa', opacity: 0.7 } : {}}>
                                        <td>{bundle.name}</td>
                                        <td>{bundle.bundle_sku || 'N/A'}</td>
                                        <td>{bundle.price ? `Php ${Number(bundle.price).toFixed(2)}` : 'N/A'}</td>
                                        <td>
                                            {bundle.components && bundle.components.length > 0 ? (
                                                <ul className="component-list-inline">
                                                    {bundle.components.map(comp => (
                                                        <li key={comp.item_id || comp.item?.id}>
                                                            {comp.item?.name || `Item ID: ${comp.item_id}`} (x{comp.quantity_in_bundle})
                                                            <span style={{fontSize: '0.8em', color: 'var(--color-text-light)'}}>
                                                                {` - STORE Stock: ${comp.item?.quantity_at_specific_location ?? 'N/A'}`}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : <span style={{color: 'var(--color-text-light)'}}>No components defined</span>}
                                        </td>
                                        <td className={`text-center ${bundle.maxBuildable <= 0 ? 'stock-status-low' : bundle.maxBuildable < 5 ? 'stock-status-moderate' : 'stock-status-high'}`}
                                            style={bundle.maxBuildable <= 0 ? {fontWeight: 'bold'} : {}} >
                                            {bundle.is_archived ? 'N/A' : bundle.maxBuildable}
                                        </td>
                                        <td>
                                            {bundle.is_archived ? <span style={{color: 'var(--color-text-light)', fontStyle: 'italic'}}>Archived</span> : (bundle.is_active ? 'Active' : 'Inactive')}
                                        </td>
                                        {showArchived && <td>{bundle.updated_at ? new Date(bundle.updated_at).toLocaleDateString() : 'N/A'}</td>}
                                        {currentUser?.role === 'admin' && (
                                            <td className="table-actions">
                                                <div className="actions-button-group">
                                                    <button
                                                        title="Edit Bundle" className="button-edit"
                                                        onClick={() => navigateToEdit(bundle)}
                                                        disabled={bundle.is_archived} >
                                                        <FaEdit /> Edit
                                                    </button>
                                                    <button
                                                        title={bundle.is_archived ? "Restore Bundle" : "Archive Bundle"}
                                                        className={bundle.is_archived ? "button-action button-unarchive" : "button-delete"}
                                                        onClick={() => handleArchiveBundle(bundle.id, bundle.name, bundle.is_archived)} >
                                                        {bundle.is_archived ? <FaUndo /> : <FaArchive />} {bundle.is_archived ? 'Restore' : 'Archive'}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}

export default BundleListPage;