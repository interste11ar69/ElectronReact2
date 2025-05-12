// src/DataManagementPage.js
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaFileUpload, FaPenSquare, FaUsers, FaFileExport, FaFileImport } from 'react-icons/fa';
import './DataManagementPage.css'; // We'll create this CSS file

function DataManagementPage() {
    const navigate = useNavigate();

    // Define the data management tasks
    // We can add more here later
    const tasks = [
        {
            title: 'Initial Item Import',
            description: 'Upload a file to add multiple new items to the inventory system at once.',
            path: '/initial-import', // Existing path
            icon: <FaFileImport />,
            buttonText: 'Go to Initial Import',
        },
        {
            title: 'Bulk Stock Update',
            description: 'Upload a file to update quantities for existing items (add, deduct, or set).',
            path: '/bulk-update', // Existing path
            icon: <FaPenSquare />,
            buttonText: 'Go to Bulk Update',
        },
        // --- Future Placeholders ---
        {
            title: 'Customer Data Import (Future)',
            description: 'Upload a file to add multiple new customers to the system.',
            path: '/data-management/customer-import', // Example new path
            icon: <FaUsers />,
            buttonText: 'Import Customers',
            disabled: true, // Disable until implemented
        },
        {
            title: 'Export Inventory Data (Future)',
            description: 'Download a comprehensive report of your current inventory stock.',
            action: () => alert('Export Inventory Data feature coming soon!'), // Or navigate to a new export page
            icon: <FaFileExport />,
            buttonText: 'Export Inventory',
            disabled: true,
        },
    ];

    return (
        <div className="container data-management-page">
            <header className="page-header-alt" style={{ borderBottom: '1px solid var(--color-border-soft)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <h1>Data Management</h1>
                <p style={{ marginTop: '-1rem', color: 'var(--color-text-medium)' }}>
                    Manage your inventory and customer data through bulk file operations.
                </p>
            </header>

            <main>
                <div className="tasks-grid">
                    {tasks.map((task, index) => (
                        <div key={index} className={`task-card card ${task.disabled ? 'disabled' : ''}`}>
                            <div className="task-icon">{task.icon}</div>
                            <h2>{task.title}</h2>
                            <p className="task-description">{task.description}</p>
                            {task.path && (
                                <button
                                    className="button button-primary"
                                    onClick={() => navigate(task.path)}
                                    disabled={task.disabled}
                                >
                                    {task.buttonText}
                                </button>
                            )}
                            {task.action && !task.path && (
                                 <button
                                    className="button button-primary"
                                    onClick={task.action}
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