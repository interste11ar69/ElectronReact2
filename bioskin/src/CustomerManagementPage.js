// src/CustomerManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerList from './CustomerList'; // Create this component next
import { FaSearch, FaPlus, FaFileAlt, FaSlidersH } from 'react-icons/fa';
import './CustomerManagementPage.css'; // Create this CSS file next

function CustomerManagementPage({ currentUser }) {
    const [customers, setCustomers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // State for filters
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

    const navigate = useNavigate();

    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 500);
        return () => clearTimeout(timerId);
    }, [searchTerm]);

    const loadCustomers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        console.log("CustomerManagementPage: Calling electronAPI.getCustomers with searchTerm:", debouncedSearchTerm);
        try {
            // Ensure window.electronAPI.getCustomers is available
            if (typeof window.electronAPI.getCustomers !== 'function') {
                throw new Error("window.electronAPI.getCustomers is not a function. Check preload.js and main.js IPC setup.");
            }
            const fetchedCustomers = await window.electronAPI.getCustomers({ searchTerm: debouncedSearchTerm || null });
            console.log("CustomerManagementPage: Fetched customers:", fetchedCustomers);

            if (fetchedCustomers && Array.isArray(fetchedCustomers)) {
                setCustomers(fetchedCustomers);
            } else if (fetchedCustomers && fetchedCustomers.error) {
                 throw new Error(fetchedCustomers.error);
            }
            else {
                console.warn("CustomerManagementPage: getCustomers did not return an array. Received:", fetchedCustomers);
                setCustomers([]); // Set to empty array on unexpected response
            }
        } catch (err) {
            console.error("CustomerManagementPage: Error loading customers:", err);
            setError(`Failed to load customers: ${err.message}`);
            setCustomers([]); // Clear customers on error
        } finally {
            setIsLoading(false);
        }
    }, [debouncedSearchTerm]);

    useEffect(() => {
        loadCustomers();
    }, [loadCustomers]);

    const navigateToEdit = (customer) => {
        navigate(`/customers/${customer.id}/edit`);
    };

    const navigateToAddNew = () => {
        navigate('/customers/new');
    };

    const handleGenerateReport = () => {
        alert("Customer report generation feature coming soon!");
        // Potentially: window.electronAPI.generateCustomerReport(filters);
    };

    const handleDeleteCustomer = async (customerId) => {
        if (window.confirm('Are you sure you want to delete this customer? This action cannot be undone.')) {
            setError(null);
            try {
                // Ensure window.electronAPI.deleteCustomer is available
                if (typeof window.electronAPI.deleteCustomer !== 'function') {
                    throw new Error("window.electronAPI.deleteCustomer is not a function.");
                }
                const result = await window.electronAPI.deleteCustomer(customerId);
                if (result.success) {
                    console.log(result.message);
                    loadCustomers(); // Reload customers
                } else {
                    setError(result.message || 'Failed to delete customer.');
                }
            } catch (err) {
                console.error("Error deleting customer:", err);
                setError(`Error deleting customer: ${err.message}`);
            }
        }
    };

    return (
        <div className="customer-management-page page-container">
            <header className="page-header-alt">
                <h1>Customer List</h1>
                {/* Add any header actions if needed */}
            </header>

            <div className="content-block-wrapper"> {/* Reusing class from ItemManagementPage.css for similar styling */}
                <div className="filter-section-alt">
                    <div className="filters-bar">
                        <div className="filter-row">
                             <div className="search-input-group">
                                <FaSearch className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search Name, Email, or Phone"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {/* <FaSlidersH className="filter-action-icon" title="Filter options" /> */}
                            </div>
                            {/* Add other filters like dropdowns if needed later */}
                        </div>
                    </div>
                </div>

                <section className="stock-list-section"> {/* Reusing class */}
                    {error && (
                        <div className="card" style={{ color: 'var(--color-status-danger)', padding: '1rem', marginBottom: '1rem', border: '1px solid var(--color-status-danger)', backgroundColor: 'rgba(211, 47, 47, 0.05)' }}>
                            Error: {error}
                        </div>
                    )}
                    <div className="table-container">
                        {isLoading ? (
                            <div className="loading-placeholder">Loading customers...</div>
                        ) : (
                            <CustomerList
                                customers={customers}
                                onEdit={navigateToEdit}
                                onDelete={currentUser?.role === 'admin' ? handleDeleteCustomer : null} // Only pass onDelete if admin
                                userRole={currentUser?.role}
                            />
                        )}
                    </div>
                </section>

                <div className="page-actions-bar">
                    <button className="button" onClick={navigateToAddNew}>
                        <FaPlus style={{ marginRight: '8px' }} /> Add New Customer
                    </button>
                    <button className="button" onClick={handleGenerateReport}>
                        <FaFileAlt style={{ marginRight: '8px' }} /> Generate Report
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CustomerManagementPage;