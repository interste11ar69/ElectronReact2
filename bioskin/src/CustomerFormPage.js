// src/CustomerFormPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import './CustomerFormPage.css'; // Create this CSS file
import SuccessModal from './SuccessModal'; // Reusing existing modal

function CustomerFormPage({ currentUser }) {
    const { id: customerIdFromParams } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(customerIdFromParams);

    const initialFormData = {
        full_name: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
    };
    const [formData, setFormData] = useState(initialFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [confirmDetails, setConfirmDetails] = useState(false); // If you want this confirmation step
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    useEffect(() => {
        if (isEditing && customerIdFromParams) {
            setIsLoading(true);
            const fetchCustomerData = async () => {
                setError('');
                try {
                    console.log(`CustomerFormPage: Fetching customer with ID: ${customerIdFromParams}`);
                     // Ensure window.electronAPI.getCustomerById is available
                    if (typeof window.electronAPI.getCustomerById !== 'function') {
                        throw new Error("window.electronAPI.getCustomerById is not a function.");
                    }
                    const customer = await window.electronAPI.getCustomerById(customerIdFromParams);
                    console.log("CustomerFormPage: Fetched customer for editing:", customer);

                    if (customer && !customer.error) {
                        setFormData({
                            full_name: customer.full_name || '',
                            email: customer.email || '',
                            phone: customer.phone || '',
                            address: customer.address || '',
                            notes: customer.notes || '',
                        });
                    } else {
                        setError(`Customer with ID ${customerIdFromParams} not found or an error occurred: ${customer?.error}`);
                    }
                } catch (err) {
                    console.error("CustomerFormPage: Error fetching customer data:", err);
                    setError(`Failed to load customer data: ${err.message}`);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchCustomerData();
        } else {
            setFormData(initialFormData);
            setConfirmDetails(false); // Reset for new form
            setIsLoading(false);
        }
    }, [customerIdFromParams, isEditing]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name === "confirmDetails" && type === 'checkbox') {
            setConfirmDetails(checked);
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!confirmDetails) { // Keep confirmation if desired
            setError('Please confirm the details before saving.');
            return;
        }
        if (!formData.full_name.trim()) {
            setError('Full Name is required.');
            return;
        }
        // Add other validations (e.g., email format) if needed

        setIsSubmitting(true);

        const customerDataToSave = {
            full_name: formData.full_name.trim(),
            email: formData.email.trim() || null,
            phone: formData.phone.trim() || null,
            address: formData.address.trim() || null,
            notes: formData.notes.trim() || null,
        };

        if (isEditing) {
            customerDataToSave.id = customerIdFromParams; // Supabase client function will handle it
        }

        console.log(`CustomerFormPage: Attempting to ${isEditing ? 'update' : 'add'} customer:`, customerDataToSave);

        try {
            let result;
            if (isEditing) {
                 if (typeof window.electronAPI.updateCustomer !== 'function') {
                    throw new Error('window.electronAPI.updateCustomer is not a function.');
                }
                // The ID is passed as the first argument for updateCustomer in supabaseClient
                result = await window.electronAPI.updateCustomer({id: customerIdFromParams, ...customerDataToSave});
            } else {
                if (typeof window.electronAPI.createCustomer !== 'function') {
                    throw new Error('window.electronAPI.createCustomer is not a function.');
                }
                result = await window.electronAPI.createCustomer(customerDataToSave);
            }

            console.log(`CustomerFormPage: Backend ${isEditing ? 'update' : 'add'} result:`, result);

            if (result && result.success) {
                setShowSuccessModal(true);
            } else {
                setError(`Failed to ${isEditing ? 'update' : 'add'} customer: ${result?.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error(`CustomerFormPage: Error during API call:`, err);
            setError(`An error occurred: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        setShowSuccessModal(false);
        navigate('/customers'); // Navigate back to customer list
    };

    if (isLoading && isEditing) {
        return <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>Loading customer details...</div>;
    }

    return (
        <div className="customer-form-page page-container"> {/* Use a specific class */}
            <header className="page-header-alt">
                <div className="form-header-left">
                    <button onClick={() => navigate('/customers')} className="back-button" aria-label="Go back to customers list">
                        <FaArrowLeft />
                    </button>
                    <div>
                        <h1>{isEditing ? 'EDIT CUSTOMER DETAILS' : 'NEW CUSTOMER DETAILS'}</h1>
                        <p className="form-subtitle">
                            {isEditing ? 'Edit the customer information below.' : 'Input the customer information below.'}
                        </p>
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">Error: {error}</div>}

            <form onSubmit={handleSubmit} className="customer-form card"> {/* Use a specific class */}
                {/* Row 1: Full Name & Email */}
                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="full_name">Full Name *</label>
                        <input type="text" id="full_name" name="full_name" value={formData.full_name} onChange={handleChange} placeholder="e.g., John Doe" required />
                    </div>
                    <div className="form-group form-group-inline">
                        <label htmlFor="email">Email Address</label>
                        <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} placeholder="e.g., john.doe@example.com" />
                    </div>
                </div>

                {/* Row 2: Phone & Address */}
                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="phone">Phone Number</label>
                        <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="e.g., 555-123-4567" />
                    </div>
                    <div className="form-group form-group-inline">
                        <label htmlFor="address">Address</label>
                        <input type="text" id="address" name="address" value={formData.address} onChange={handleChange} placeholder="e.g., 123 Main St, Anytown" />
                    </div>
                </div>

                {/* Row 3: Notes */}
                <div className="form-group">
                    <label htmlFor="notes">Notes (Optional)</label>
                    <textarea
                        id="notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        rows="4"
                        placeholder="Enter any relevant notes about the customer..."
                    ></textarea>
                </div>

                {/* Row 4: Submit and Confirm */}
                <div className="form-footer">
                    <div className="confirm-checkbox">
                        <input
                            type="checkbox"
                            id="confirmDetails"
                            name="confirmDetails"
                            checked={confirmDetails}
                            onChange={handleChange}
                        />
                        <label htmlFor="confirmDetails">I confirm all details are correct.</label>
                    </div>
                    <div className="form-actions">
                        <button type="submit" className="button save-button" disabled={isSubmitting || !confirmDetails || (isLoading && isEditing)}>
                            {isSubmitting ? 'Saving...' : (isEditing ? 'Update Customer' : 'Save Customer')}
                        </button>
                    </div>
                </div>
            </form>

            {showSuccessModal && (
                <SuccessModal
                    onClose={handleCloseModal}
                    // You can customize title and message for customers if needed
                    // title="CUSTOMER SAVED!"
                    // message="Customer information has been successfully saved."
                />
            )}
        </div>
    );
}

export default CustomerFormPage;