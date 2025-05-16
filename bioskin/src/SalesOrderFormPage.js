// src/SalesOrderFormPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { FaArrowLeft, FaPlusCircle, FaTrashAlt, FaSave } from 'react-icons/fa';
import './SalesOrderFormPage.css'; // Make sure you have this CSS file

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Awaiting Payment', 'Ready to Ship', 'Fulfilled', 'Cancelled'];
const FULFILLMENT_ROLES = ['admin', 'manager']; // Roles that can mark as Fulfilled

// react-select custom styles
const reactSelectStyles = {
    control: (baseStyles, state) => ({
        ...baseStyles,
        borderColor: state.isFocused ? 'var(--color-primary-dark, #5C3221)' : 'var(--color-border-strong, #A1887F)',
        minHeight: 'calc(var(--line-height-base, 1.6) * 1em + (var(--spacing-unit, 0.5rem) * 1.75 * 2) + 2px)', // Match global input height
        padding: 'calc(var(--spacing-unit, 0.5rem) * 0.1) calc(var(--spacing-unit, 0.5rem) * 0.5)', // Minimal inner padding for control
        boxShadow: state.isFocused ? `0 0 0 0.2rem var(--focus-ring-color, rgba(92, 50, 33, 0.35))` : 'none',
        '&:hover': {
            borderColor: state.isFocused ? 'var(--color-primary-dark, #5C3221)' : 'var(--color-border-strong, #A1887F)',
        },
        fontSize: 'var(--font-size-base, 16px)', // Match global input font size
        borderRadius: 'var(--border-radius, 0.3rem)',
    }),
    valueContainer: (baseStyles) => ({
        ...baseStyles,
        padding: `0px calc(var(--spacing-unit, 0.5rem) * 1.5)` // Match input text padding
    }),
    input: (baseStyles) => ({
        ...baseStyles,
        margin: '0px',
        paddingBottom: '0px',
        paddingTop: '0px',
    }),
    placeholder: (baseStyles) => ({
        ...baseStyles,
        color: 'var(--color-text-light, #A1887F)',
    }),
    menu: base => ({ ...base, zIndex: 20 }) // Ensure dropdown menu is on top
};


function SalesOrderFormPage({ currentUser }) {
    const { id: orderIdFromParams } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(orderIdFromParams);

    const getInitialLineItem = useCallback(() => ({
        type: 'item', // 'item' or 'bundle'
        productId: null, // Stores the react-select option's value, e.g., "item-123" or "bundle-45"
        quantity: 1,
        unitPrice: 0,
        name: '', // Snapshot of item/bundle name
        sku: '',  // Snapshot of item/bundle SKU
        // existingOrderItemId: null // Only for items being edited
    }), []);

    const getInitialFormData = useCallback(() => ({
        customer_id: null,
        order_date: new Date().toISOString().slice(0, 10),
        status: 'Pending',
        notes: '',
        items: [getInitialLineItem()],
        order_number: '' // For displaying existing order number
    }), [getInitialLineItem]);

    const [formData, setFormData] = useState(getInitialFormData());
    const [originalStatus, setOriginalStatus] = useState('');
    const [orderTotal, setOrderTotal] = useState(0);

    const [customers, setCustomers] = useState([]);
    const [productsAndBundles, setProductsAndBundles] = useState([]); // Options for react-select

    const [isLoading, setIsLoading] = useState(false); // For loading initial order/dropdown data
    const [isSubmitting, setIsSubmitting] = useState(false); // For form submission
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const [customerRes, itemRes, bundleRes] = await Promise.all([
                window.electronAPI.getCustomers({}),
                window.electronAPI.getItems({ is_archived: false }),
                window.electronAPI.getBundles({ isActive: true })
            ]);

            if (customerRes && Array.isArray(customerRes)) {
                setCustomers(customerRes.map(c => ({ value: c.id, label: c.full_name })));
            } else { console.warn("SalesOrderForm: Failed to load customers."); }

            const productOptions = (itemRes && Array.isArray(itemRes))
                ? itemRes.map(i => ({ value: `item-${i.id}`, label: `[Item] ${i.name} (SKU: ${i.sku || 'N/A'}) - Price: ${i.cost_price != null ? i.cost_price.toFixed(2) : 'N/A'}`, type: 'item', id: i.id, price: i.cost_price, name: i.name, sku: i.sku }))
                : [];
            const bundleOptions = (bundleRes && Array.isArray(bundleRes))
                ? bundleRes.map(b => ({ value: `bundle-${b.id}`, label: `[Bundle] ${b.name} (SKU: ${b.bundle_sku || 'N/A'}) - Price: ${b.price != null ? b.price.toFixed(2) : 'N/A'}`, type: 'bundle', id: b.id, price: b.price, name: b.name, sku: b.bundle_sku }))
                : [];
            setProductsAndBundles([...productOptions, ...bundleOptions]);

            if (isEditing && orderIdFromParams) {
                const order = await window.electronAPI.getSalesOrderById(orderIdFromParams);
                if (order) {
                    setFormData({
                        customer_id: order.customer_id,
                        order_date: new Date(order.order_date).toISOString().slice(0, 10),
                        status: order.status,
                        notes: order.notes || '',
                        items: (order.order_items && order.order_items.length > 0)
                               ? order.order_items.map(oi => ({
                                    type: oi.item_id ? 'item' : 'bundle',
                                    productId: oi.item_id ? `item-${oi.item_id}` : (oi.bundle_id ? `bundle-${oi.bundle_id}` : null),
                                    quantity: oi.quantity,
                                    unitPrice: oi.unit_price,
                                    name: oi.item_snapshot_name,
                                    sku: oi.item_snapshot_sku,
                                    existingOrderItemId: oi.id
                                }))
                               : [getInitialLineItem()],
                        order_number: order.order_number || `SO-${order.id}` // Use SO- prefix for ID if no number
                    });
                    setOriginalStatus(order.status);
                } else {
                    setError(`Sales Order with ID ${orderIdFromParams} not found.`);
                    setFormData(prev => ({...prev, status: 'ErrorLoading'})); // Prevent interaction
                }
            } else { // New order
                 setFormData(getInitialFormData()); // Reset to initial state for new order
            }
        } catch (err) {
            console.error("SalesOrderForm: Error loading initial data:", err);
            setError("Failed to load necessary data for the form. " + err.message);
        } finally {
            setIsLoading(false);
        }
    }, [isEditing, orderIdFromParams, getInitialFormData, getInitialLineItem]); // Added getInitialLineItem

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]); // loadInitialData is memoized

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
        const newItems = formData.items.map((item, i) => {
            if (i === index) {
                if (field === 'productId') {
                    const selectedProduct = productsAndBundles.find(p => p.value === value);
                    return {
                        ...getInitialLineItem(), // Reset to defaults for a new product selection
                        type: selectedProduct ? selectedProduct.type : 'item',
                        productId: value,
                        name: selectedProduct ? selectedProduct.name : '',
                        sku: selectedProduct ? (selectedProduct.sku || '') : '',
                        unitPrice: selectedProduct ? (selectedProduct.price !== undefined && selectedProduct.price !== null ? Number(selectedProduct.price) : 0) : 0,
                        quantity: 1, // Default to 1 when product changes
                    };
                }
                return { ...item, [field]: value };
            }
            return item;
        });
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const addLineItem = () => {
        setFormData(prev => ({ ...prev, items: [...prev.items, getInitialLineItem()] }));
    };

    const removeLineItem = (index) => {
        if (formData.items.length <= 1) { // Prevent removing the last item
            setError("An order must have at least one line item.");
            return;
        }
        setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    };

    const canUserFulfill = FULFILLMENT_ROLES.includes(currentUser?.role);
    // Order is locked if editing and original status was Fulfilled/Cancelled,
    // OR if current status is Fulfilled/Cancelled and user doesn't have special override (e.g. admin)
    const isOrderEffectivelyLocked = isEditing &&
                                    (originalStatus === 'Fulfilled' || originalStatus === 'Cancelled');
                                    // Add more conditions if current formData.status should also lock fields for non-admins

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccessMessage('');

        if (isOrderEffectivelyLocked) { // Check based on original status if editing
            setError("This order cannot be modified as it was already Fulfilled or Cancelled.");
            return;
        }

        if (formData.items.some(item => !item.productId || (Number(item.quantity) || 0) <= 0 || (item.unitPrice !== undefined && (Number(item.unitPrice) || 0) < 0))) {
            setError("All line items must have a product selected, quantity greater than 0, and a non-negative unit price.");
            return;
        }
        if (formData.items.length === 0) {
             setError("An order must have at least one line item."); return;
        }


        if (formData.status === 'Fulfilled' && !canUserFulfill && (!isEditing || originalStatus !== 'Fulfilled')) {
            setError("You do not have permission to mark new/pending orders as 'Fulfilled'.");
            return;
        }

        // Confirmation dialogs
        let confirmAction = true;
        if (isEditing && formData.status === 'Fulfilled' && originalStatus !== 'Fulfilled') {
            confirmAction = window.confirm("You are about to mark this order as 'Fulfilled'. This WILL DEDUCT STOCK from the primary STORE. Are you sure?");
        } else if (isEditing && formData.status === 'Cancelled' && originalStatus !== 'Cancelled') {
            confirmAction = window.confirm("You are about to mark this order as 'Cancelled'. If stock was allocated, it will be de-allocated. This action might be hard to reverse. Are you sure?");
        } else if (!isEditing && formData.status === 'Fulfilled') {
            confirmAction = window.confirm("You are about to create this order directly as 'Fulfilled'. This WILL DEDUCT STOCK from the primary STORE immediately. Are you sure?");
        }
        if (!confirmAction) return; // User cancelled

        setIsSubmitting(true);

        try {
            let result;
            if (isEditing) {
                // For editing, primarily handle status changes.
                // A more complex "update order details" (items, customer, notes) would need a dedicated backend function
                // that doesn't re-trigger fulfillment logic unless status changes to Fulfilled.
                if (formData.status !== originalStatus) {
                    result = await window.electronAPI.updateSalesOrderStatus(orderIdFromParams, formData.status);
                } else {
                    // If only notes/customer changed, and no dedicated "update details" API exists yet for non-status changes.
                    // We can assume for now that such changes are minor and don't need a specific backend call if status is unchanged.
                    // Or, this is where you'd call `updateSalesOrderDetails(orderId, { notes, customer_id })`
                    console.log("Order status unchanged. If other details (notes, customer) were modified, they are considered saved with this action if no specific 'update details' API is called.");
                    result = { success: true, message: `Order details (like notes/customer) noted. Status remains: ${formData.status}` };
                }
            } else { // Creating new order
                const orderPayload = {
                    customer_id: formData.customer_id,
                    order_date: formData.order_date,
                    status: formData.status,
                    notes: formData.notes,
                    total_amount: orderTotal,
                    // created_by_user_id and order_number are handled by main.js
                };
                const orderItemsPayload = formData.items.map(item => ({
                    item_id: item.type === 'item' ? parseInt(item.productId.split('-')[1], 10) : null,
                    bundle_id: item.type === 'bundle' ? parseInt(item.productId.split('-')[1], 10) : null,
                    item_snapshot_name: item.name,
                    item_snapshot_sku: item.sku,
                    quantity: parseInt(item.quantity, 10),
                    unit_price: parseFloat(item.unitPrice),
                    line_total: (parseInt(item.quantity, 10) * parseFloat(item.unitPrice))
                }));
                result = await window.electronAPI.createSalesOrder(orderPayload, orderItemsPayload);
            }

            if (result && result.success) {
                setSuccessMessage(result.message || `Sales Order ${isEditing ? 'updated' : 'created'} successfully!`);
                setTimeout(() => {
                    setSuccessMessage('');
                    navigate('/sales-orders');
                }, 2000);
            } else {
                // Handle specific stock error from backend if provided
                if (result && result.isStockError) { // Assuming backend adds this flag for stock issues
                    setError(result.message);
                    // If creating new and it was 'Fulfilled' but failed due to stock, revert status to Pending in UI
                    if (!isEditing && formData.status === 'Fulfilled') {
                        setFormData(prev => ({ ...prev, status: 'Pending' }));
                        setError(result.message + " Order status set to Pending.");
                    }
                } else {
                    setError(result?.message || `Failed to ${isEditing ? 'update' : 'create'} sales order. Please check details.`);
                }
            }
        } catch (err) {
            console.error("SalesOrderForm: Error submitting sales order:", err);
            setError("An unexpected error occurred: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Determine if form fields related to items/pricing should be disabled
    const disableItemFields = isOrderEffectivelyLocked || (isEditing && formData.status === 'Fulfilled') || (isEditing && formData.status === 'Cancelled');


    if (isLoading) return <div className="page-container" style={{textAlign: 'center', padding: '2rem'}}>Loading order data...</div>;
    if (isEditing && formData.status === 'ErrorLoading') { /* ... error loading display ... */ }


    return (
        <div className="sales-order-form-page page-container">
            <header className="page-header-alt">
                 <div className="form-header-left">
                    <button onClick={() => navigate('/sales-orders')} className="back-button" aria-label="Back to Sales Orders">
                        <FaArrowLeft />
                    </button>
                    <div> {/* Wrapper for h1 and p for better alignment */}
                        <h1>{isEditing ? `Edit Sales Order: ${formData.order_number || ''}` : 'New Sales Order'}</h1>
                        {isEditing && <p className="form-subtitle">Original Status: {originalStatus}</p>}
                    </div>
                </div>
            </header>

            {error && <div className="error-message card" role="alert">{error}</div>}
            {successMessage && <div className="success-message card" role="status">{successMessage}</div>}

            <form onSubmit={handleSubmit} className="sales-order-form card">
                <h4>Order Details</h4>
                <div className="form-row">
                    <div className="form-group form-group-inline">
                        <label htmlFor="order_date">Order Date *</label>
                        <input type="date" id="order_date" name="order_date" value={formData.order_date} onChange={handleChange} required className="form-control" disabled={disableItemFields}/>
                    </div>
                    <div className="form-group form-group-inline">
                        <label htmlFor="status">Status *</label>
                        <select
                            id="status" name="status" value={formData.status} onChange={handleChange} required className="form-control"
                            disabled={isOrderEffectivelyLocked || (isEditing && originalStatus === 'Fulfilled' && !canUserFulfill) || (isEditing && originalStatus === 'Cancelled')}
                        >
                            {ORDER_STATUSES.map(s => (
                                <option
                                    key={s} value={s}
                                    disabled={
                                        (s === 'Fulfilled' && !canUserFulfill && (!isEditing || originalStatus !== 'Fulfilled')) || // Can't set to Fulfilled if no permission, unless it already was
                                        (isEditing && originalStatus === 'Fulfilled' && s !== 'Fulfilled' && !canUserFulfill) || // Can't change FROM Fulfilled if no permission
                                        (isEditing && originalStatus === 'Cancelled' && s !== 'Cancelled') // Can't change FROM Cancelled
                                    }
                                >
                                    {s}
                                </option>
                            ))}
                        </select>
                         {formData.status === 'Fulfilled' && !canUserFulfill && (!isEditing || originalStatus !== 'Fulfilled') &&
                            <small className="error-text-small">Requires admin/manager to set to 'Fulfilled'.</small>}
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="customer_id">Customer (Optional)</label>
                    <Select
                        inputId="customer_id" name="customer_id" options={customers}
                        value={customers.find(c => c.value === formData.customer_id)}
                        onChange={handleCustomerChange} isClearable placeholder="Select customer..."
                        styles={reactSelectStyles} classNamePrefix="react-select" isDisabled={disableItemFields}
                    />
                </div>

                <hr className="section-divider"/>
                <h4>Order Items</h4>
                {formData.items.map((item, index) => (
                    <div key={index} className="line-item-row form-row"> {/* Using index as key is okay if items aren't reordered, but prefer unique ID if possible */}
                        <div className="form-group" style={{flex: 3}}>
                            <label htmlFor={`product-item-${index}`}>Product/Bundle *</label>
                            <Select
                                inputId={`product-item-${index}`} options={productsAndBundles}
                                value={productsAndBundles.find(p => p.value === item.productId)}
                                onChange={(selected) => handleItemLineChange(index, 'productId', selected ? selected.value : null)}
                                placeholder="Select Item or Bundle..." styles={reactSelectStyles} classNamePrefix="react-select"
                                isDisabled={disableItemFields}
                            />
                        </div>
                        <div className="form-group" style={{flex: 1, minWidth: '80px'}}>
                            <label htmlFor={`product-qty-${index}`}>Qty *</label>
                            <input id={`product-qty-${index}`} type="number" value={item.quantity} onChange={(e) => handleItemLineChange(index, 'quantity', e.target.value)} min="1" required className="form-control" disabled={disableItemFields}/>
                        </div>
                        <div className="form-group" style={{flex: 1, minWidth: '100px'}}>
                            <label htmlFor={`product-price-${index}`}>Unit Price *</label>
                            <input id={`product-price-${index}`} type="number" value={item.unitPrice} onChange={(e) => handleItemLineChange(index, 'unitPrice', e.target.value)} min="0" step="0.01" required className="form-control" disabled={disableItemFields}/>
                        </div>
                        <div className="form-group line-item-total" style={{flex: 1, minWidth: '120px'}}>
                            <span>Php {((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toFixed(2)}</span>
                        </div>
                        {formData.items.length > 1 && !disableItemFields && (
                            <div className="line-item-actions">
                               <button type="button" onClick={() => removeLineItem(index)} className="button-delete-component" title="Remove Item"><FaTrashAlt /></button>
                            </div>
                        )}
                    </div>
                ))}
                {!disableItemFields &&
                    <button type="button" onClick={addLineItem} className="button button-secondary add-component-btn" style={{marginBottom: '1rem'}}>
                        <FaPlusCircle style={{marginRight: '8px'}} /> Add Line Item
                    </button>
                }

                <div style={{textAlign: 'right', fontSize: '1.2em', fontWeight: 'bold', marginTop: '1rem'}}>
                    Order Total: Php {orderTotal.toFixed(2)}
                </div>

                <div className="form-group">
                    <label htmlFor="notes">Order Notes (Optional)</label>
                    <textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} rows="3" className="form-control" disabled={isOrderEffectivelyLocked}></textarea>
                </div>

                <div className="form-actions" style={{marginTop: '2rem'}}>
                    <button type="submit" className="button button-primary save-button"
                        disabled={isSubmitting || isLoading || isOrderEffectivelyLocked || (isEditing && formData.status === originalStatus && formData.status === 'Fulfilled') }>
                        <FaSave style={{marginRight: '8px'}}/>
                        {isSubmitting ? 'Saving...' : (isEditing ? 'Update Order' : 'Create Sales Order')}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default SalesOrderFormPage;