// src/SalesOrderListPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEye, FaFilter } from 'react-icons/fa'; // FaEye for view/details
import './SalesOrderListPage.css'; // Create this CSS file

const ORDER_STATUSES = ['All', 'Pending', 'Confirmed', 'Awaiting Payment', 'Ready to Ship', 'Fulfilled', 'Cancelled'];

function SalesOrderListPage({ currentUser }) {
    const [salesOrders, setSalesOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const [filterStatus, setFilterStatus] = useState('All'); // For filtering

    const loadSalesOrders = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const filters = {};
            if (filterStatus !== 'All') {
                filters.status = filterStatus;
            }
            // Add other filters like customerId or date range if needed
            const fetchedOrders = await window.electronAPI.getSalesOrders(filters);
            setSalesOrders(fetchedOrders || []);
        } catch (err) {
            console.error("Error loading sales orders:", err);
            setError(`Failed to load sales orders: ${err.message}`);
            setSalesOrders([]);
        } finally {
            setIsLoading(false);
        }
    }, [filterStatus]); // Re-fetch when filterStatus changes

    useEffect(() => {
        loadSalesOrders();
    }, [loadSalesOrders]);

    const navigateToViewOrder = (orderId) => {
        // Navigating to the form page, which will also serve as view/edit for now
        navigate(`/sales-orders/${orderId}`);
    };

    const navigateToAddNewOrder = () => {
        navigate('/sales-orders/new');
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString();
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value || 0);
    };


    if (isLoading && salesOrders.length === 0) { // Show loading only if no data yet
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading sales orders...</div>;
    }

    return (
        <div className="sales-order-list-page page-container">
            <header className="page-header-alt">
                <h1>Sales Orders</h1>
                {/* Employees should be able to create sales orders */}
                <button className="button button-primary" onClick={navigateToAddNewOrder}>
                    <FaPlus style={{ marginRight: '8px' }} /> New Sales Order
                </button>
            </header>

            {error && (
                <div className="card error-message" role="alert" style={{ color: 'var(--color-status-danger)', border: '1px solid var(--color-status-danger)', backgroundColor: 'rgba(211,47,47,0.05)', marginBottom: '1rem', padding: '1rem' }}>
                    Error: {error}
                </div>
            )}

            <main className="content-block-wrapper"> {/* Optional: Reuse wrapper */}
                <div className="filter-bar" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <FaFilter style={{color: 'var(--color-text-medium)'}} />
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="form-control" // Assuming you have a global .form-control style for selects
                        style={{ maxWidth: '250px' }}
                    >
                        {ORDER_STATUSES.map(status => (
                            <option key={status} value={status}>{status === 'All' ? 'All Statuses' : status}</option>
                        ))}
                    </select>
                    {/* Add more filters here (e.g., date range, customer search) */}
                </div>

                {isLoading && <p style={{textAlign: 'center'}}>Loading...</p>}

                {!isLoading && salesOrders.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
                        No sales orders found{filterStatus !== 'All' ? ` matching criteria "${filterStatus}"` : ''}.
                    </p>
                )}

                {salesOrders.length > 0 && (
                    <div className="table-container">
                        <table id="salesOrderTable">
                            <thead>
                                <tr>
                                    <th>Order #</th>
                                    <th>Date</th>
                                    <th>Customer</th>
                                    <th className="text-right">Total Amount</th>
                                    <th>Status</th>
                                    <th className="text-center">Items</th>
                                    <th className="text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesOrders.map(order => (
                                    <tr key={order.id}>
                                        <td>{order.order_number || `ID-${order.id}`}</td>
                                        <td>{formatDate(order.order_date)}</td>
                                        <td>{order.customer?.full_name || 'N/A'}</td>
                                        <td className="text-right">{formatCurrency(order.total_amount)}</td>
                                        <td>
                                            <span className={`status-badge status-${order.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="text-center">{order.order_items?.length || 0}</td>
                                        <td className="text-center table-actions">
                                            <button
                                                title="View/Edit Order Details"
                                                className="button-edit" // Or a dedicated view button style
                                                onClick={() => navigateToViewOrder(order.id)}
                                            >
                                                <FaEye /> View/Edit
                                            </button>
                                        </td>
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

export default SalesOrderListPage;