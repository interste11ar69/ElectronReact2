// src/DataManagementPage.js
import React, { useState } from 'react'; // <--- Import useState
import { Link, useNavigate } from 'react-router-dom';
import { FaFileUpload, FaPenSquare, FaUsers, FaFileExport, FaFileImport } from 'react-icons/fa';
import './DataManagementPage.css';

function DataManagementPage() {
    const navigate = useNavigate();
    // --- MOVED STATE HOOKS INSIDE THE COMPONENT ---
    const [isExporting, setIsExporting] = useState(false);
    const [exportMessage, setExportMessage] = useState('');
    const [exportError, setExportError] = useState('');
    // --- END OF MOVED STATE HOOKS ---

    // --- DEFINED handleExportInventory INSIDE THE COMPONENT ---
    const handleExportInventory = async () => {
        setIsExporting(true);
        setExportMessage('');
        setExportError('');
        console.log("Attempting to export inventory...");

        try {
            // Ensure window.electronAPI and exportInventory exist before calling
            if (window.electronAPI && typeof window.electronAPI.exportInventory === 'function') {
                const result = await window.electronAPI.exportInventory();
                console.log("Export result:", result);
                if (result.success) {
                    setExportMessage(result.message || 'Export completed successfully.');
                } else {
                    setExportError(result.message || 'An unknown error occurred during export.');
                }
            } else {
                 // Handle the case where the function isn't exposed correctly
                 throw new Error('Export function (window.electronAPI.exportInventory) is not available. Check preload.js and main.js setup.');
            }
        } catch (err) {
            console.error("Export inventory error (frontend):", err);
            setExportError(`An error occurred: ${err.message}`);
        } finally {
            setIsExporting(false);
            // Optional: clear messages after a delay
            setTimeout(() => {
                setExportMessage('');
                setExportError('');
            }, 7000); // Clear messages after 7 seconds
        }
    };
    // --- END OF DEFINED handleExportInventory ---

    // --- TASKS ARRAY (now uses state and handler defined above) ---
    const tasks = [
        {
            title: 'Initial Item Import',
            description: 'Upload a file to add multiple new items to the inventory system at once.',
            path: '/initial-import', // Existing path
            icon: <FaFileImport />,
            buttonText: 'Go to Initial Import',
            disabled: isExporting, // Disable while exporting
        },
        {
            title: 'Bulk Stock Update',
            description: 'Upload a file to update quantities for existing items (add, deduct, or set).',
            path: '/bulk-update', // Existing path
            icon: <FaPenSquare />,
            buttonText: 'Go to Bulk Update',
            disabled: isExporting, // Disable while exporting
        },
        // --- Future Placeholders ---
        {
            title: 'Customer Data Import (Future)',
            description: 'Upload a file to add multiple new customers to the system.',
            path: '/data-management/customer-import', // Example new path
            icon: <FaUsers />,
            buttonText: 'Import Customers',
            disabled: true, // Keep disabled until implemented (or disable while exporting)
        },
        {
            title: 'Export Inventory Data',
            description: 'Download a comprehensive CSV report of your current inventory stock.',
            action: handleExportInventory, // Reference the function defined above
            icon: <FaFileExport />,
            buttonText: isExporting ? 'Exporting...' : 'Export Inventory', // Use state variable
            disabled: isExporting, // Use state variable to disable during export
        },
    ];
    // --- END OF TASKS ARRAY ---

    // --- JSX RENDER ---
    return (
        <div className="container data-management-page">
            <header className="page-header-alt" style={{ borderBottom: '1px solid var(--color-border-soft)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                {/* Fixed header content */}
                <h1>Data Management</h1>
                 <p style={{ marginTop: '-1rem', color: 'var(--color-text-medium)' }}>
                    Manage your inventory and customer data through bulk file operations.
                </p>
            </header>

            {/* Feedback Area */}
            {exportMessage && (
                <div className="card" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--color-status-success)', color: 'white', borderLeft: '5px solid darkgreen' }}>
                    {exportMessage}
                </div>
            )}
            {exportError && (
                <div className="card" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--color-status-danger)', color: 'white', borderLeft: '5px solid darkred' }}>
                    Error: {exportError}
                </div>
            )}

            <main>
                <div className="tasks-grid">
                    {tasks.map((task, index) => (
                        <div key={index} className={`task-card card ${task.disabled ? 'disabled' : ''}`}>
                            <div className="task-icon">{task.icon}</div>
                            <h2>{task.title}</h2>
                            <p className="task-description">{task.description}</p>
                            {/* Corrected button rendering logic */}
                            {task.action && ( // If it has an action function (Export Button)
                                <button
                                    className="button button-primary"
                                    onClick={task.action}
                                    disabled={task.disabled} // Use the disabled state from the task definition
                                >
                                    {task.buttonText} {/* Use the button text from the task definition */}
                                </button>
                            )}
                            {task.path && !task.action && ( // If it has a path and no action (Navigate Buttons)
                                <button
                                    className="button button-primary"
                                    onClick={() => navigate(task.path)}
                                    disabled={task.disabled} // Use the disabled state from the task definition
                                >
                                    {task.buttonText} {/* Use the button text from the task definition */}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
    // --- END OF JSX RENDER ---
} // End of DataManagementPage component

export default DataManagementPage; // Make sure export is present