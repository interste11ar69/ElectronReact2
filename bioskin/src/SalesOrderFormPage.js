// src/SalesOrderFormPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { FaArrowLeft, FaPlusCircle, FaTrashAlt, FaSave } from 'react-icons/fa';
import './SalesOrderFormPage.css'; // Make sure you have this CSS file

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Awaiting Payment', 'Ready to Ship', 'Fulfilled', 'Cancelled'];
const FULFILLMENT_ROLES = ['admin', 'manager']; // Add 'employee' if they should also fulfill

// Define or import react-select custom styles
const reactSelectStyles = {
    control: (baseStyles, state) => ({
        ...baseStyles,
        borderColor: state.isFocused ? 'var(--color-primary-dark)' : 'var(--color-border-strong)',
        boxShadow: state.isFocused ? '0 0 0 0.2rem var(--focus-ring-color)' : 'none',
        '&:hover': {
            borderColor: state.isFocused ? 'var(--color-primary-dark)' : 'var(--color-border-strong)',
        },
        minHeight: 'calc(1.5em + (0.75rem * 2) + 2px)', // Approximate standard input height
        fontSize: '0.9em', // Match other inputs
    }),
    menu: base => ({ ...base, zIndex: 10 }) // Ensure dropdown is on top
    // Add other style overrides if needed (placeholder, valueContainer, etc.)
};


function SalesOrderFormPage({ currentUser }) {
    const { id: orderIdFromParams } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(orderIdFromParams);

    const getInitialLineItem = () => ({ // Made into a function for fresh objects
        type: 'item',
        productId: null,
        quantity: 1,
        unitPrice: 0,
        name: '',
        sku: ''
    });

    const [formData, setFormData] = useState({
        customer_id: null,
        order_date: new Date().toISOString().slice(0, 10),
        status: 'Pending',
        notes: '',
        items: [getInitialLineItem()], // Use function here
        order_number: ''
    });
    const [originalStatus, setOriginalStatus] = useState('');
    const [orderTotal, setOrderTotal] = useState(0);

    const [customers, setCustomers] = useState([]);
    const [productsAndBundles, setProductsAndBundles] = useState([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const [customerRes, itemRes, bundleRes] = await Promise.all([
                window.electronAPI.getCustomers({}),
                // Fetch items/bundles that are active and potentially available for sale
                window.electronAPI.getItems({ is_archived: false }), // Assuming active items are sellable
                window.electronAPI.getBundles({ isActive: true })     // Assuming active bundles are sellable
            ]);

            if (customerRes && Array.isArray(customerRes)) {
                setCustomers(customerRes.map(c => ({ value: c.id, label: c.full_name })));
            } else {
                console.warn("Failed to load customers or invalid format.");
                // Optionally set an error or allow proceeding without customers
            }

            const productOptions = (itemRes && Array.isArray(itemRes)) ? itemRes.map(i => ({ value: `item-${i.id}`, label: `[Item] ${i.name} (SKU: ${i.sku || 'N/A'}) - Price: ${i.cost_price != null ? i.cost_price.toFixed(2) : 'N/A'}`, type: 'item', id: i.id, price: i.cost_price, name: i.name, sku: i.sku })) : [];
            const bundleOptions = (bundleRes && Array.isArray(bundleRes)) ? bundleRes.map(b => ({ value: `bundle-${b.id}`, label: `[Bundle] ${b.name} (SKU: ${b.bundle_sku || 'N/A'}) - Price: ${b.price != null ? b.price.toFixed(2) : 'N/A'}`, type: 'bundle', id: b.id, price: b.price, name: b.name, sku: b.bundle_sku })) : [];
            setProductsAndBundles([...productOptions, ...bundleOptions]);

            if (isEditing && orderIdFromParams) {
                const order = await window.electronAPI.getSalesOrderById(orderIdFromParams);
                if (order) {
                    setFormData({
                        customer_id: order.customer_id,
                        order_date: new Date(order.order_date).toISOString().slice(0, 10),
                        status: order.status,
                        notes: order.notes || '',
                        items: order.order_items && order.order_items.length > 0
                               ? order.order_items.map(oi => ({
                                    type: oi.item_id ? 'item' : 'bundle',
                                    productId: oi.item_id ? `item-${oi.item_id}` : `bundle-${oi.bundle_id}`,
                                    quantity: oi.quantity,
                                    unitPrice: oi.unit_price,
                                    name: oi.item_snapshot_name,
                                    sku: oi.item_snapshot_sku,
                                    existingOrderItemId: oi.id // Useful if you implement item-level updates
                                }))
                               : [getInitialLineItem()], // Ensure at least one line item if fetched order has none
                        order_number: order.order_number || `ID-${order.id}`
                    });
                    setOriginalStatus(order.status);
                } else {
                    setError(`Sales Order with ID ${orderIdFromParams} not found.`);
                    setFormData(prev => ({...prev, status: 'ErrorLoading'}));
                }
            } else {
                 setFormData(prev => ({
                     ...prev,
                     customer_id: null, // Ensure reset for new form
                     order_date: new Date().toISOString().slice(0, 10),
                     status: 'Pending',
                     notes: '',
                     items: [getInitialLineItem()],
                     order_number: ''
                }));
            }

        } catch (err) {
            console.error("Error loading data for sales order form:", err);
            setError("Failed to load necessary data. " + err.message);
        } finally {
            setIsLoading(false);
        }
    }, [isEditing, orderIdFromParams]);

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]);

    useEffect(() => {
        let total = 0;
        formData.items.forEach(item => {
            total += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        });
        setOrderTotal(total);
    }, [formData.items]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCustomerChange = (selectedOption) => {
        setFormData(prev => ({ ...prev, customer_id: selectedOption ? selectedOption.value : null }));
    };

    const handleItemLineChange = (index, field, value) => {
        const newItems = JSON.parse(JSON.stringify(formData.items)); // Deep copy
        if (field === 'productId') {
            const selectedProduct = productsAndBundles.find(p => p.value === value);
            newItems[index] = {
                // ...getInitialLineItem(), // Reset all fields of the line item
                type: selectedProduct ? selectedProduct.type : 'item',
                productId: value,
                unitPrice: selectedProduct ? (selectedProduct.price !== undefined && selectedProduct.price !== null ? selectedProduct.price : 0) : 0,
                name: selectedProduct ? selectedProduct.name : '',
                sku: selectedProduct ? (selectedProduct.sku || '') : '',
                quantity: newItems[index].quantity || 1 // Preserve quantity if already set, else 1
            };
        } else {
            newItems[index][field] = value;
        }
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const addLineItem = () => {
        setFormData(prev => ({ ...prev, items: [...prev.items, getInitialLineItem()] }));
    };

    const removeLineItem = (index) => {
        setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    };

    const canFulfillOrder = FULFILLMENT_ROLES.includes(currentUser?.role);
    const isOrderLocked = isEditing && (originalStatus === 'Fulfilled' || originalStatus === 'Cancelled');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccessMessage('');

        if (isOrderLocked) {
            setError("This order cannot be modified as it is already Fulfilled or Cancelled.");
            return;
        }

        if (formData.items.some(item => !item.productId || (Number(item.quantity) || 0) <= 0 || (item.unitPrice !== undefined && (Number(item.unitPrice) || 0) < 0))) {
            setError("All line items must have a product selected, quantity > 0, and non-negative unit price.");
            return;
        }

        if (formData.status === 'Fulfilled' && !canFulfillOrder) {
            setError("You do not have permission to mark orders as 'Fulfilled'.");
            return;
        }

        // Confirmation dialogs
        if (isEditing && formData.status === 'Fulfilled' && originalStatus !== 'Fulfilled') {
            if (!window.confirm("You are about to mark this order as 'Fulfilled'. This WILL DEDUCT STOCK from STORE. Are you sure?")) return;
        }
        if (isEditing && formData.status === 'Cancelled' && originalStatus !== 'Cancelled') {
            if (!window.confirm("You are about to mark this order as 'Cancelled'. Stock will NOT be automatically restocked. Are you sure?")) return;
        }
        if (!isEditing && formData.status === 'Fulfilled') {
            if (!window.confirm("You are about to create this order as 'Fulfilled'. This WILL DEDUCT STOCK from STORE immediately. Are you sure?")) return;
        }

        setIsSubmitting(true);

        try {
            let result;
            if (isEditing) {
                if (formData.status !== originalStatus) {
                    // This call handles stock deduction if newStatus is 'Fulfilled'
                    result = await window.electronAPI.updateSalesOrderStatus(orderIdFromParams, formData.status);
                } else {
                    // Placeholder for updating other order details (notes, customer, items if allowed)
                    // This would require a separate backend API endpoint.
                    // For now, we assume if status is unchanged, only minor non-critical details might have changed.
                    console.log("Order status unchanged. To update other details like notes, customer, or items, a specific API call is needed.");
                    // Example:
                    // const detailsToUpdate = { notes: formData.notes, customer_id: formData.customer_id };
                    // result = await window.electronAPI.updateSalesOrderDetails(orderIdFromParams, detailsToUpdate);
                    // For this example, if no specific "update details" API exists, we simulate success.
                    setSuccessMessage("Order details (like notes/customer) saved. Status remains: " + formData.status);
                    setTimeout(() => navigate('/sales-orders'), 2000);
                    setIsSubmitting(false);
                    return;
                }
            } else { // Creating new order
                const orderPayload = {
                    customer_id: formData.customer_id,
                    order_date: formData.order_date,
                    status: formData.status,
                    notes: formData.notes,
                    total_amount: orderTotal,
                    // created_by_user_id is handled by main.js using currentUser
                };
                // orderPayload.order_number = await window.electronAPI.generateOrderNumber(); // Backend can generate this
                const orderItemsPayload = formData.items.map(item => ({
                    item_id: item.type === 'item' ? parseInt(item.productId.split('-')[1]) : null,
                    bundle_id: item.type === 'bundle' ? parseInt(item.productId.split('-')[1]) : null,
                    item_snapshot_name: item.name,
                    item_snapshot_sku: item.sku,
                    quantity: parseInt(item.quantity),
                    unit_price: parseFloat(item.unitPrice),
                    line_total: (parseInt(item.quantity) * parseFloat(item.unitPrice))
                }));
                result = await window.electronAPI.createSalesOrder(orderPayload, orderItemsPayload);
            }

            if (result && result.success) {
                setSuccessMessage(result.message || `Sales Order ${isEditing ? 'status updated' : 'created'} successfully!`);
                setTimeout(() => {
                    setSuccessMessage(''); // Clear message before navigating
                    navigate('/sales-orders');
                }, 2000);
            } else {
                if (result && result.isStockError) {
                    setError(result.message);
                    if (!isEditing && formData.status === 'Fulfilled') {
                        setFormData(prev => ({ ...prev, status: 'Pending' }));
                    }
                } else {
                    setError(result?.message || `Failed to ${isEditing ? 'update' : 'create'} sales order.`);
                }
            }
        } catch (err) {
            console.error("Error submitting sales order:", err);
            setError("An unexpected error occurred: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const disableOrderFields = isEditing && (formData.status === 'Fulfilled' || formData.status === 'Cancelled');

    if (isLoading) return <div className="page-container" style={{textAlign: 'center', padding: '2rem'}}>Loading order details...</div>;
    if (formData.status === 'ErrorLoading' && isEditing) {
         return (
            <div className="sales-order-form-page page-container">
                 <header className="page-header-alt">
                    <div className="form-header-left">
                        <button onClick={() => navigate('/sales-orders')} className="back-button"><FaArrowLeft /></button>
                        <h1>Error Loading Order</h1>
                    </div>
                </header>
                {error && <div className="error-message card">{error}</div>}
            </div>
        );
    }

    return (
        <div className="sales-order-form-page page-container">
            <header className="page-header-alt">
                 <div className="form-header-left">
                    <button onClick={() => navigate(isEditing ? `/sales-orders` : '/sales-orders')} className="back-button">
                        <FaArrowLeft />
                    </button>
                    <h1>{isEditing ? `Edit Sales Order ${formData.order_number || ''}` : 'New Sales Order'}</h1>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}
            {successMessage && <div className="success-message card" role="status">{successMessage}</div>}

            <form onSubmit={handleSubmit} className="sales-order-form card">
                <h4>Order Details</h4>
                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="order_date">Order Date *</label>
                        <input type="date" id="order_date" name="order_date" value={formData.order_date} onChange={handleChange} required className="form-control" disabled={disableOrderFields}/>
                    </div>
                    <div className="form-group form-group-inline">
                        <label htmlFor="status">Status *</label>
                        <select
                            id="status"
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            required
                            className="form-control"
                            disabled={isOrderLocked || (isEditing && originalStatus === 'Fulfilled' && !canFulfillOrder) || (isEditing && originalStatus === 'Cancelled')}
                        >
                            {ORDER_STATUSES.map(s => (
                                <option
                                    key={s}
                                    value={s}
                                    disabled={(s === 'Fulfilled' && !canFulfillOrder && (!isEditing || originalStatus !== 'Fulfilled')) || (isEditing && originalStatus === 'Fulfilled' && s !== 'Fulfilled' && !canFulfillOrder) || (isEditing && originalStatus === 'Cancelled' && s !== 'Cancelled')}
                                >
                                    {s}
                                </option>
                            ))}
                        </select>
                         {formData.status === 'Fulfilled' && !canFulfillOrder && (!isEditing || originalStatus !== 'Fulfilled') && <small className="error-text-small">Requires admin/manager to fulfill.</small>}
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="customer_id">Customer (Optional)</label>
                    <Select
                        id="customer_id"
                        name="customer_id"
                        options={customers}
                        value={customers.find(c => c.value === formData.customer_id)}
                        onChange={handleCustomerChange}
                        isClearable
                        placeholder="Select customer..."
                        styles={reactSelectStyles} // Apply styles
                        classNamePrefix="react-select"
                        isDisabled={disableOrderFields}
                    />
                </div>

                <hr className="section-divider"/>
                <h4>Order Items</h4>
                {formData.items.map((item, index) => (
                    <div key={index} className="line-item-row form-row">
                        <div className="form-group" style={{flex: 3}}>
                            <label htmlFor={`product-item-${index}`}>Product/Bundle *</label>
                            <Select
                                inputId={`product-item-${index}`}
                                options={productsAndBundles}
                                value={productsAndBundles.find(p => p.value === item.productId)}
                                onChange={(selected) => handleItemLineChange(index, 'productId', selected ? selected.value : null)}
                                placeholder="Select Item or Bundle..."
                                styles={reactSelectStyles} // Apply styles
                                classNamePrefix="react-select"
                                isDisabled={disableOrderFields}
                            />
                        </div>
                        <div className="form-group" style={{flex: 1, minWidth: '80px'}}>
                            <label htmlFor={`product-qty-${index}`}>Qty *</label>
                            <input id={`product-qty-${index}`} type="number" value={item.quantity} onChange={(e) => handleItemLineChange(index, 'quantity', e.target.value)} min="1" required className="form-control" disabled={disableOrderFields}/>
                        </div>
                        <div className="form-group" style={{flex: 1, minWidth: '100px'}}>
                            <label htmlFor={`product-price-${index}`}>Unit Price *</label>
                            <input id={`product-price-${index}`} type="number" value={item.unitPrice} onChange={(e) => handleItemLineChange(index, 'unitPrice', e.target.value)} min="0" step="0.01" required className="form-control" disabled={disableOrderFields}/>
                        </div>
                        <div className="form-group line-item-total" style={{flex: 1, minWidth: '120px'}}>
                            <span>Php {((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toFixed(2)}</span>
                        </div>
                        {formData.items.length > 1 && !disableOrderFields && (
                            <div className="line-item-actions">
                               <button type="button" onClick={() => removeLineItem(index)} className="button-delete-component" title="Remove Item"><FaTrashAlt /></button>
                            </div>
                        )}
                    </div>
                ))}
                {!disableOrderFields &&
                    <button type="button" onClick={addLineItem} className="button button-secondary add-component-btn" style={{marginBottom: '1rem'}}>
                        <FaPlusCircle style={{marginRight: '8px'}} /> Add Line Item
                    </button>
                }

                <div style={{textAlign: 'right', fontSize: '1.2em', fontWeight: 'bold', marginTop: '1rem'}}>
                    Order Total: Php {orderTotal.toFixed(2)}
                </div>

                <div className="form-group">
                    <label htmlFor="notes">Order Notes (Optional)</label>
                    <textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} rows="3" className="form-control" disabled={isOrderLocked && !canFulfillOrder}></textarea>
                </div>

                <div className="form-actions" style={{marginTop: '2rem'}}>
                    <button type="submit" className="button button-primary save-button"
                        disabled={isSubmitting || isLoading || isOrderLocked || (isEditing && formData.status === 'Fulfilled' && originalStatus === 'Fulfilled' && !isSubmitting) }>
                        <FaSave style={{marginRight: '8px'}}/>
                        {isSubmitting ? 'Saving...' : (isEditing ? 'Update Order' : 'Create Sales Order')}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default SalesOrderFormPage;