// src/CustomerList.js
import React from 'react';
import { FaArchive, FaUndo, FaEdit } from 'react-icons/fa'; // Import necessary icons

// Helper to format date, can be moved to a utils file
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); // More readable format
    } catch (e) {
        return 'Invalid Date';
    }
};

function CustomerList({
    customers,
    onEdit,
    onArchive, // Changed from onDelete
    userRole,
    viewingArchived // New prop
}) {
    if (!customers) {
        return <p className="loading-placeholder" style={{padding: '2rem'}}>No customer data available.</p>;
    }
    if (customers.length === 0) {
        return (
            <p className="loading-placeholder" style={{padding: '2rem'}}>
                No {viewingArchived ? 'archived' : 'active'} customers found.
            </p>
        );
    }

    return (
        <table id="customerTable">
            <thead>
                <tr>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Joined Date</th>
                    {/* Optional: Add an "Archived At" column if you store that date */}
                    {viewingArchived && <th>Archived At</th>}
                    <th className="text-center">Actions</th>
                </tr>
            </thead>
            <tbody id="customerTableBody">
                {customers.map(customer => (
                    <tr key={customer.id} style={customer.is_archived ? { backgroundColor: '#f8f9fa', opacity: 0.7 } : {}}>
                        <td>{customer.full_name}</td>
                        <td>{customer.email || 'N/A'}</td>
                        <td>{customer.phone || 'N/A'}</td>
                        <td>{customer.address || 'N/A'}</td>
                        <td>{formatDate(customer.created_at)}</td>
                        {viewingArchived && <td>{customer.updated_at ? formatDate(customer.updated_at) : 'N/A'}</td>} {/* Assuming updated_at is when it was archived */}
                        <td className="text-center table-actions">
                            <button
                                className="button-edit"
                                onClick={() => onEdit(customer)}
                                disabled={customer.is_archived && viewingArchived} // Disable edit for archived items if viewing archived list
                                title={customer.is_archived && viewingArchived ? "Restore customer to edit" : "Edit Details"}
                            >
                                <FaEdit style={{ marginRight: '4px' }} /> Edit
                            </button>
                            {userRole === 'admin' && onArchive && (
                                <button
                                    className={customer.is_archived ? "button-action button-unarchive" : "button-delete"} // Use distinct classes for styling
                                    onClick={() => onArchive(customer.id, customer.full_name, customer.is_archived)}
                                    title={customer.is_archived ? "Restore this customer" : "Archive this customer"}
                                >
                                    {customer.is_archived ? <FaUndo style={{ marginRight: '4px' }} /> : <FaArchive style={{ marginRight: '4px' }} />}
                                    {customer.is_archived ? 'Restore' : 'Archive'}
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default CustomerList;