// src/ReturnListPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // Optional: for linking to items/customers
import './ReturnListPage.css'; // Create this CSS file next

// Helper to format date (can be moved to a utils file)
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        // Simple date format, customize as needed
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

    // Fetch return records on component mount
    useEffect(() => {
        const fetchReturns = async () => {
            setIsLoading(true);
            setError(null);
            console.log("ReturnListPage: Fetching return records...");
            try {
                // Ensure window.electronAPI.getReturns is available
                if (typeof window.electronAPI.getReturns !== 'function') {
                    throw new Error("Return history function is not available.");
                }
                const fetchedReturns = await window.electronAPI.getReturns(); // Add filters later if needed
                console.log("ReturnListPage: Received returns:", fetchedReturns);

                if (fetchedReturns && Array.isArray(fetchedReturns)) {
                    setReturns(fetchedReturns);
                } else if (fetchedReturns && fetchedReturns.error) {
                    // Handle structured error from main.js
                    throw new Error(fetchedReturns.error);
                } else {
                    // Handle unexpected response format
                    console.warn("ReturnListPage: getReturns did not return an array or expected error object. Received:", fetchedReturns);
                    setReturns([]);
                }
            } catch (err) {
                console.error("ReturnListPage: Error loading return records:", err);
                setError(`Failed to load return history: ${err.message}`);
                setReturns([]); // Clear data on error
            } finally {
                setIsLoading(false);
            }
        };

        fetchReturns();
    }, []); // Empty dependency array means run once on mount

    return (
        <div className="return-list-page page-container"> {/* Use specific class */}
            <header className="page-header-alt">
                <h1>Return History</h1>
                {/* Add filters or export button here later */}
            </header>

            <div className="content-block-wrapper"> {/* Reuse wrapper style */}
                {error && (
                    <div className="card error-message" role="alert">
                        Error: {error}
                    </div>
                )}

                <section className="list-section"> {/* Generic list section */}
                    {isLoading ? (
                        <div className="loading-placeholder">Loading return history...</div>
                    ) : returns.length === 0 ? (
                        <div className="loading-placeholder">No return records found.</div>
                    ) : (
                        <div className="table-container">
                            <table id="returnTable"> {/* Unique table ID */}
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
                                        {/* Add Notes column if desired */}
                                    </tr>
                                </thead>
                                <tbody>
                                    {returns.map(ret => (
                                        <tr key={ret.id}>
                                            <td>{formatDate(ret.created_at)}</td>
                                            {/* Use optional chaining for related data */}
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
                                            {/* Add TD for notes if needed, maybe with tooltip */}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
                 {/* Add pagination controls here later if needed */}
            </div>
        </div>
    );
}

export default ReturnListPage;