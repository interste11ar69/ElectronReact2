    // src/CustomerList.js
    import React from 'react';

    // Helper to format date, can be moved to a utils file
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            return new Date(dateString).toLocaleDateString();
        } catch (e) {
            return 'Invalid Date';
        }
    };

    function CustomerList({ customers, onEdit, onDelete, userRole }) {
        if (!customers) {
            return <p className="loading-placeholder" style={{padding: '2rem'}}>No customer data available.</p>;
        }
        if (customers.length === 0) {
            return <p className="loading-placeholder" style={{padding: '2rem'}}>No customers found matching your criteria.</p>;
        }

        return (
            <table id="customerTable"> {/* Changed ID for clarity */}
                <thead>
                    <tr>
                        <th>Full Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Address</th>
                        <th>Joined Date</th>
                        <th className="text-center">Actions</th>
                    </tr>
                </thead>
                <tbody id="customerTableBody">
                    {customers.map(customer => (
                        <tr key={customer.id}>
                            <td>{customer.full_name}</td>
                            <td>{customer.email || 'N/A'}</td>
                            <td>{customer.phone || 'N/A'}</td>
                            <td>{customer.address || 'N/A'}</td>
                            <td>{formatDate(customer.created_at)}</td>
                            <td className="text-center table-actions">
                                <button
                                    className="button-edit"
                                    onClick={() => onEdit(customer)}
                                >
                                    Edit Details
                                </button>
                                {userRole === 'admin' && onDelete && ( // Check if onDelete is passed
                                    <button
                                        className="button-delete"
                                        onClick={() => onDelete(customer.id)}
                                    >
                                        Delete
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