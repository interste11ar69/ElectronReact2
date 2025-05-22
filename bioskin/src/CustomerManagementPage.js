// src/CustomerManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerList from './CustomerList';
import { FaSearch, FaPlus, FaArchive, FaUndo } from 'react-icons/fa'; // Added FaArchive, FaUndo
import './CustomerManagementPage.css';

function CustomerManagementPage({ currentUser }) {
    const [customers, setCustomers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(''); // For archive/unarchive feedback

    // State for filters
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
    const [showArchived, setShowArchived] = useState(false); // New state

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
        setSuccessMessage(''); // Clear previous success messages
        console.log("CustomerManagementPage: Calling electronAPI.getCustomers with filters:", {
            searchTerm: debouncedSearchTerm || null,
            is_archived: showArchived // Pass archive status
        });
        try {
            if (typeof window.electronAPI.getCustomers !== 'function') {
                throw new Error("window.electronAPI.getCustomers is not a function.");
            }
            const fetchedCustomers = await window.electronAPI.getCustomers({
                searchTerm: debouncedSearchTerm || null,
                is_archived: showArchived // Send filter to backend
            });
            console.log("CustomerManagementPage: Fetched customers:", fetchedCustomers);

            if (fetchedCustomers && Array.isArray(fetchedCustomers)) {
                setCustomers(fetchedCustomers);
            } else if (fetchedCustomers && fetchedCustomers.error) {
                 throw new Error(fetchedCustomers.error);
            } else {
                console.warn("CustomerManagementPage: getCustomers did not return an array. Received:", fetchedCustomers);
                setCustomers([]);
            }
        } catch (err) {
            console.error("CustomerManagementPage: Error loading customers:", err);
            setError(`Failed to load customers: ${err.message}`);
            setCustomers([]);
        } finally {
            setIsLoading(false);
        }
    }, [debouncedSearchTerm, showArchived]); // Add showArchived to dependencies

    useEffect(() => {
        loadCustomers();
    }, [loadCustomers]);

    const navigateToEdit = (customer) => {
        if (customer.is_archived) {
            alert("Archived customers cannot be edited. Please restore the customer first.");
            return;
        }
        navigate(`/customers/${customer.id}/edit`);
    };

    const navigateToAddNew = () => {
        navigate('/customers/new');
    };

    // Renamed from handleDeleteCustomer
    const handleArchiveCustomer = async (customerId, customerName, isCurrentlyArchived) => {
        const actionText = isCurrentlyArchived ? 'restore' : 'archive';
        const friendlyName = customerName || `Customer ID ${customerId}`;
        const confirmationMessage = `Are you sure you want to ${actionText} "${friendlyName}"?
    ${isCurrentlyArchived ? 'They will become active again.' : 'They will be hidden from active lists but can be recovered.'}`;

        if (window.confirm(confirmationMessage)) {
            setError(null);
            setSuccessMessage('');
            try {
                // We'll need a new API endpoint: archiveCustomer
                if (typeof window.electronAPI.archiveCustomer !== 'function') {
                    throw new Error("window.electronAPI.archiveCustomer is not a function.");
                }
                // Pass customerId and the desired new archive status (true to archive, false to unarchive)
                const result = await window.electronAPI.archiveCustomer(customerId, !isCurrentlyArchived);
                if (result.success) {
                    setSuccessMessage(result.message || `Customer ${actionText}d successfully!`);
                    loadCustomers(); // Reload customers
                    setTimeout(() => setSuccessMessage(''), 3000);
                } else {
                    setError(result.message || `Failed to ${actionText} customer.`);
                }
            } catch (err) {
                console.error(`Error ${actionText}ing customer:`, err);
                setError(`Error ${actionText}ing customer: ${err.message}`);
            }
        }
    };

    return (
        <div className="customer-management-page page-container">
            <header className="page-header-alt">
                <h1>{showArchived ? "Archived Customer List" : "Customer List"}</h1>
                <button
                    className={`button ${showArchived ? 'button-primary' : 'button-secondary'}`}
                    onClick={() => setShowArchived(!showArchived)}
                    style={{fontSize: '0.9em', padding: '0.5em 1em'}}
                >
                    {showArchived ? <FaUndo style={{ marginRight: '8px' }} /> : <FaArchive style={{ marginRight: '8px' }} />}
                    {showArchived ? 'View Active Customers' : 'View Archived Customers'}
                </button>
            </header>

            {error && (
                <div className="card error-message" role="alert"> {/* Assuming global .error-message .card styles */}
                    Error: {error}
                </div>
            )}
            {successMessage && (
                <div className="card success-message" role="status"> {/* Assuming global .success-message .card styles */}
                    {successMessage}
                </div>
            )}

            <div className="content-block-wrapper">
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
                            </div>
                        </div>
                    </div>
                </div>

                <section className="stock-list-section">
                    <div className="table-container">
                        {isLoading ? (
                            <div className="loading-placeholder">Loading customers...</div>
                        ) : (
                            <CustomerList
                                customers={customers}
                                onEdit={navigateToEdit}
                                onArchive={currentUser?.role === 'admin' ? handleArchiveCustomer : null} // Renamed prop
                                userRole={currentUser?.role}
                                viewingArchived={showArchived} // Pass this new prop
                            />
                        )}
                    </div>
                </section>

                <div className="page-actions-bar">
                    {!showArchived && ( // Only show "Add New" if not viewing archived
                        <button className="button" onClick={navigateToAddNew}>
                            <FaPlus style={{ marginRight: '8px' }} /> Add New Customer
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CustomerManagementPage;