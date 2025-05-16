// src/DataManagementPage.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    FaFileUpload,   // For Import
    FaPenSquare,    // For Bulk Update
    FaUsers,        // For Customers
    FaFileExport,   // Generic Export
    FaFileImport,   // Generic Import
    FaBoxes,        // For Inventory
    FaFileInvoiceDollar // For Sales Orders
} from 'react-icons/fa';
import './DataManagementPage.css';

function DataManagementPage() {
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false); // Generic processing state
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [feedbackError, setFeedbackError] = useState('');

    const showFeedback = (type, message) => {
        if (type === 'success') {
            setFeedbackMessage(message);
            setFeedbackError('');
        } else {
            setFeedbackError(message);
            setFeedbackMessage('');
        }
        setTimeout(() => {
            setFeedbackMessage('');
            setFeedbackError('');
        }, 7000); // Clear feedback after 7 seconds
    };

    // Generic export handler
    const handleGenericExport = async (exportType, fileNamePrefix, description) => {
        setIsProcessing(true);
        showFeedback('', ''); // Clear previous feedback
        console.log(`DataManagementPage: Attempting to export - ${description}`);

        try {
            if (window.electronAPI && typeof window.electronAPI.exportGenericData === 'function') {
                const result = await window.electronAPI.exportGenericData({
                    exportType,
                    fileNamePrefix,
                    // Headers will be determined by main.js based on exportType
                });
                console.log(`DataManagementPage: Export result for ${exportType}:`, result);
                if (result.success) {
                    showFeedback('success', result.message || 'Export completed successfully.');
                } else {
                    showFeedback('error', result.message || `An unknown error occurred during ${description} export.`);
                }
            } else {
                throw new Error('Generic export function (window.electronAPI.exportGenericData) is not available. Check preload.js and main.js setup.');
            }
        } catch (err) {
            console.error(`DataManagementPage: Export error for ${exportType}:`, err);
            showFeedback('error', `An error occurred: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const tasks = [
        {
            title: 'Initial Item Import',
            description: 'Upload a file to add multiple new items to the inventory system at once.',
            path: '/initial-import',
            icon: <FaFileImport />,
            buttonText: 'Go to Initial Import',
            type: 'navigation',
            disabled: isProcessing,
        },
        {
            title: 'Bulk Stock Update',
            description: 'Upload a file to update quantities for existing items (add, deduct, or set).',
            path: '/bulk-update',
            icon: <FaPenSquare />,
            buttonText: 'Go to Bulk Update',
            type: 'navigation',
            disabled: isProcessing,
        },
        {
            title: 'Export Comprehensive Inventory',
            description: 'Download a CSV of all items, their quantities, and locations.',
            action: () => handleGenericExport('comprehensive_inventory', 'comprehensive_inventory_export', 'Comprehensive Inventory'),
            icon: <FaBoxes />, // Changed icon
            buttonText: isProcessing ? 'Processing...' : 'Export Inventory Data',
            type: 'action',
            disabled: isProcessing,
        },
        {
            title: 'Export Customer List',
            description: 'Download a CSV of all customer data.',
            action: () => handleGenericExport('customers', 'customer_list_export', 'Customer List'),
            icon: <FaUsers />,
            buttonText: isProcessing ? 'Processing...' : 'Export Customers',
            type: 'action',
            disabled: isProcessing,
        },
        {
            title: 'Export Sales Orders',
            description: 'Download a CSV of all sales order headers and key details.',
            action: () => handleGenericExport('sales_orders', 'sales_orders_export', 'Sales Orders'),
            icon: <FaFileInvoiceDollar />,
            buttonText: isProcessing ? 'Processing...' : 'Export Sales Orders',
            type: 'action',
            disabled: isProcessing,
        },
        // --- Future Placeholder for Import ---
        // {
        //     title: 'Customer Data Import (Future)',
        //     description: 'Upload a file to add multiple new customers to the system.',
        //     path: '/data-management/customer-import', // Example new path
        //     icon: <FaUsers />,
        //     buttonText: 'Import Customers',
        //     type: 'navigation',
        //     disabled: true, // Keep disabled until implemented
        // },
    ];

    return (
        <div className="container data-management-page">
            <header className="page-header-alt" style={{ borderBottom: '1px solid var(--color-border-soft)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <h1>Data Management</h1>
                <p style={{ marginTop: '-0.5rem', color: 'var(--color-text-medium)', fontSize: '0.95em' }}>
                    Manage bulk data operations such as imports and exports.
                </p>
            </header>

            {feedbackMessage && (
                <div className="card notification notification-success" role="alert"> {/* Assuming global notification styles */}
                    {feedbackMessage}
                </div>
            )}
            {feedbackError && (
                <div className="card notification notification-error" role="alert"> {/* Assuming global notification styles */}
                    Error: {feedbackError}
                </div>
            )}

            <main>
                <div className="tasks-grid">
                    {tasks.map((task, index) => (
                        <div key={index} className={`task-card card ${task.disabled ? 'disabled' : ''}`}>
                            <div className="task-icon">{task.icon}</div>
                            <h2>{task.title}</h2>
                            <p className="task-description">{task.description}</p>

                            {task.type === 'action' && task.action && (
                                <button
                                    className="button button-primary"
                                    onClick={task.action}
                                    disabled={task.disabled}
                                >
                                    {task.buttonText}
                                </button>
                            )}
                            {task.type === 'navigation' && task.path && (
                                <button
                                    className="button button-primary"
                                    onClick={() => navigate(task.path)}
                                    disabled={task.disabled}
                                >
                                    {task.buttonText}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}

export default DataManagementPage;