// src/ReturnListPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './ReturnListPage.css';

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return 'Invalid Date';
    }
};

function ReturnListPage() {
    const [returns, setReturns] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchReturns = async () => {
            setIsLoading(true);
            setError(null);
            try {
                if (typeof window.electronAPI.getReturns !== 'function') {
                    throw new Error("Return history function is not available.");
                }
                const fetchedReturns = await window.electronAPI.getReturns();
                if (fetchedReturns && Array.isArray(fetchedReturns)) {
                    setReturns(fetchedReturns);
                } else if (fetchedReturns && fetchedReturns.error) {
                    throw new Error(fetchedReturns.error);
                } else {
                    setReturns([]);
                }
            } catch (err) {
                setError(`Failed to load return history: ${err.message}`);
                setReturns([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchReturns();
    }, []);

    return (
        <div className="return-list-page page-container">
            <header className="page-header-alt">
                <h1>Return History</h1>
            </header>

            <div className="content-block-wrapper">
                {error && (
                    <div className="card error-message" role="alert">
                        Error: {error}
                    </div>
                )}

                <section className="list-section">
                    {isLoading ? (
                        <div className="loading-placeholder">Loading return history...</div>
                    ) : returns.length === 0 ? (
                        <div className="loading-placeholder">No return records found.</div>
                    ) : (
                        <div className="table-container">
                            <table id="returnTable">
                                <thead>
                                    <tr>
                                        <th>Return Date</th>
                                        <th>Item Name</th>
                                        <th>SKU</th>
                                        <th className="text-center">Qty</th>
                                        <th>Reason</th>
                                        <th>Condition</th>
                                        <th>Inv. Adjusted?</th>
                                        <th>Customer</th>
                                        <th>Processed By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {returns.map(ret => (
                                        <tr key={ret.id}>
                                            {/* --- MODIFICATION HERE --- */}
                                            <td>{formatDate(ret.return_date)}</td> {/* Use ret.return_date */}
                                            {/* --- END MODIFICATION --- */}
                                            <td>{ret.item?.name || '(Item Deleted?)'}</td>
                                            <td>{ret.item?.sku || 'N/A'}</td>
                                            <td className="text-center">{ret.quantity_returned}</td>
                                            <td>{ret.reason}</td>
                                            <td>{ret.condition}</td>
                                            <td className={`text-center ${ret.inventory_adjusted ? 'status-yes' : 'status-no'}`}>
                                                {ret.inventory_adjusted ? 'Yes' : 'No'}
                                            </td>
                                            <td>{ret.customer?.full_name || 'N/A'}</td>
                                            <td>{ret.user?.username || 'N/A'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

export default ReturnListPage;