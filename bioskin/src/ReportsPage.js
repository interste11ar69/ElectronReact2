// src/ReportsPage.js
import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import './ReportsPage.css'; // Make sure this CSS file is created and styled

// Helper functions (ensure they are defined or imported correctly)
const formatCurrency = (value) => {
  const numericValue = Number(value);
  // Ensure to handle potential NaN from Number(value) if value is not easily convertible
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
    .format(isNaN(numericValue) ? 0 : numericValue);
};
const formatDate = (dateString) => { // Using en-CA for YYYY-MM-DD is a good choice for sorting/consistency
    if (!dateString) return 'N/A';
    try { return new Date(dateString).toLocaleDateString('en-CA'); } // YYYY-MM-DD
    catch (e) { return 'Invalid Date'; }
};

const reportOptionsList = [
    { value: 'select', label: 'Select a Report Type...', isDisabled: true }, // Good to have a disabled placeholder
    { value: 'inventory_valuation', label: 'Inventory Valuation Report' },
    { value: 'sales_performance', label: 'Sales Performance Report' },
    // Add more report options here as you develop them
];

const periodOptionsList = [
    { value: 'today', label: 'Today' },
    { value: 'last7days', label: 'Last 7 Days' },
    { value: 'last30days', label: 'Last 30 Days' },
    // Consider adding 'custom_range' in the future, which would require date pickers
];

// react-select custom styles (example)
const reactSelectStyles = {
    menu: base => ({ ...base, zIndex: 20 }), // Ensure dropdown menus are on top
    container: base => ({ ...base, minWidth: '200px', flex: 1 }) // Ensure select takes space in flex
};

function ReportsPage() {
    const [selectedReportType, setSelectedReportType] = useState(reportOptionsList[0].value);
    const [reportData, setReportData] = useState(null); // Initialized to null, good
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [notification, setNotification] = useState({ type: '', message: '' });

    // Filter states
    const [filters, setFilters] = useState({}); // Initialize as empty object
    const [categoryFilterOptions, setCategoryFilterOptions] = useState([]);
    const [locationFilterOptions, setLocationFilterOptions] = useState([]);

    // Load options for filters (Categories, Locations) - runs once on mount
    useEffect(() => {
        const loadFilterOpts = async () => {
            try {
                const itemsRes = await window.electronAPI.getItems({});
                if (itemsRes && Array.isArray(itemsRes)) {
                    const uniqueCategories = [...new Set(itemsRes.map(item => item.category).filter(Boolean))].sort();
                    setCategoryFilterOptions([{value: '', label: 'All Categories'}, ...uniqueCategories.map(cat => ({ value: cat, label: cat }))]);
                } else { console.warn("ReportsPage: Could not load items for category filters."); }

                const locResult = await window.electronAPI.getStorageLocations();
                if (locResult.success && Array.isArray(locResult.locations)) {
                    setLocationFilterOptions([{value: '', label: 'All Locations'}, ...locResult.locations.map(loc => ({ value: loc.id, label: loc.name }))]);
                } else { console.warn("ReportsPage: Could not load storage locations for filters."); }
            } catch (err) {
                console.error("ReportsPage: Error loading filter options:", err);
                // Optionally set a general error if filter loading is critical
                // setError("Failed to load filter options. Some reports may not filter correctly.");
            }
        };
        loadFilterOpts();
    }, []);

    const handleReportTypeChange = (selected) => {
        const newReportType = selected ? selected.value : reportOptionsList[0].value;
        setSelectedReportType(newReportType);
        setReportData(null);
        setError('');
        setNotification({ type: '', message: '' }); // Clear notifications too

        // Set default filters for the selected report type
        if (newReportType === 'inventory_valuation') {
            setFilters({ category: null, locationId: null }); // Use null for react-select clearable
        } else if (newReportType === 'sales_performance') {
            setFilters({ period: 'last30days', topItemsLimit: 10 }); // Default period
        } else {
            setFilters({}); // Reset for other or "select" type
        }
    };

    // Generic handler for react-select based filters
    const handleFilterChange = (filterName, selectedOption) => {
        setFilters(prev => ({ ...prev, [filterName]: selectedOption ? selectedOption.value : null }));
    };

    // Specific handler for native select (like period, if not using react-select for it)
     const handlePeriodFilterChange = (selectedOption) => { // Assuming this is for react-select
        setFilters(prev => ({ ...prev, period: selectedOption ? selectedOption.value : 'last30days' }));
    };


    const handleGenerateReport = async () => {
        if (selectedReportType === 'select' || !selectedReportType) { // Added !selectedReportType check
            setError('Please select a report type.');
            return;
        }
        setIsLoading(true);
        setError('');
        setReportData(null);
        setNotification({ type: '', message: '' });
        try {
            console.log(`ReportsPage: Generating report type "${selectedReportType}" with filters:`, filters);
            const result = await window.electronAPI.generateReport({
                reportType: selectedReportType,
                filters: filters
            });
            console.log(`ReportsPage: Result for "${selectedReportType}":`, result);

            if (result && result.success) { // Check if result itself is defined
                setReportData(result.data);
                // Check if the actual data part is empty
                const dataIsEmpty = (Array.isArray(result.data) && result.data.length === 0) ||
                                    (typeof result.data === 'object' && result.data !== null && !result.data.summary && (!result.data.topItems || result.data.topItems.length === 0));
                if (dataIsEmpty) {
                    setNotification({type: 'info', message: 'No data found for the selected criteria.'});
                }
            } else {
                setError(result?.message || 'Failed to generate report. API did not return success.');
            }
        } catch (err) {
            console.error(`ReportsPage: Error generating report "${selectedReportType}":`, err);
            setError(`Error generating report: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = async (format) => {
        setNotification({ type: '', message: '' });
        if (!reportData) {
            setNotification({type: 'warn', message: "Please generate a report before exporting."});
            return;
        }

        let dataForActualExport = [];
        let fileName = selectedReportType;

        if (selectedReportType === 'inventory_valuation') {
            dataForActualExport = Array.isArray(reportData) ? reportData : [];
        } else if (selectedReportType === 'sales_performance') {
            if (reportData && reportData.topItems && Array.isArray(reportData.topItems) && reportData.topItems.length > 0) {
                dataForActualExport = reportData.topItems;
                fileName = `${selectedReportType}_top_items`;
            } else if (reportData && reportData.salesByCategory && Array.isArray(reportData.salesByCategory) && reportData.salesByCategory.length > 0) {
                dataForActualExport = reportData.salesByCategory; // Example: export another part
                fileName = `${selectedReportType}_sales_by_category`;
            } else if (reportData && reportData.summary) {
                // Exporting summary KPIs might need special formatting or a different approach
                // For now, let's make it an array of one object for CSV/XLSX
                dataForActualExport = [reportData.summary];
                fileName = `${selectedReportType}_summary_kpis`;
            } else {
                 setNotification({type: 'warn', message: "No specific table data available in this sales report to export directly."});
                 return;
            }
        } else {
             setNotification({type: 'warn', message: "Export not configured for this report type."});
             return;
        }

        if (!Array.isArray(dataForActualExport) || dataForActualExport.length === 0) {
            setNotification({type: 'warn', message: "No data to export."});
            return;
        }

        try {
            setNotification({type: 'info', message: `Exporting ${format.toUpperCase()}...`});
            const result = await window.electronAPI.exportReportData({
                reportData: dataForActualExport,
                format: format,
                fileNamePrefix: fileName
            });
             if (result && result.success) { // Check result
                setNotification({type: 'success', message: result.message || 'Export successful!'});
            } else {
                setNotification({type: 'error', message: result?.message || `Export failed.`});
            }
        } catch (err) {
            setNotification({type: 'error', message: `Export error: ${err.message}`});
        }
        setTimeout(() => setNotification({ type: '', message: '' }), 7000);
    };

    const renderFilters = () => {
        if (selectedReportType === 'inventory_valuation') {
            return (
                <div className="filters-bar">
                    <Select options={categoryFilterOptions} value={categoryFilterOptions.find(o=>o.value === filters.category)} onChange={(opt) => handleFilterChange('category', opt)} isClearable placeholder="All Categories" className="react-select-container" styles={reactSelectStyles}/>
                    <Select options={locationFilterOptions} value={locationFilterOptions.find(o=>o.value === filters.locationId)} onChange={(opt) => handleFilterChange('locationId', opt)} isClearable placeholder="All Locations" className="react-select-container" styles={reactSelectStyles}/>
                </div>
            );
        } else if (selectedReportType === 'sales_performance') {
            return (
                 <div className="filters-bar">
                    <label htmlFor="periodFilter" style={{marginRight: '0.5rem', fontWeight:'500', color: 'var(--color-text-medium)'}}>Period:</label>
                    <Select
                        inputId="periodFilter"
                        options={periodOptionsList}
                        value={periodOptionsList.find(o=>o.value === (filters.period || 'last30days'))}
                        onChange={handlePeriodFilterChange}
                        className="react-select-container"
                        styles={reactSelectStyles}
                    />
                </div>
            );
        }
        return null; // No filters for "select" or unhandled report types
    };

    const renderReportContent = () => {
        if (isLoading) return <p className="loading-placeholder">Generating report...</p>;
        // Error is displayed globally, so if error is set, reportData might be null
        if (error && !reportData) return null; // Error is already shown, don't show "no data" too
        if (!reportData) return <p className="no-data-message">Select a report type and filters, then click "Generate Report".</p>;

        if (selectedReportType === 'inventory_valuation') {
            if (!Array.isArray(reportData) || reportData.length === 0) return <p className="no-data-message">No stock data found for the selected filters.</p>;
            const grandTotalValue = reportData.reduce((sum, row) => sum + Number(row.total_value_at_location || 0), 0);
            return (
                <div className="table-container">
                    <table className="table">
                        <thead><tr><th>Item Name</th><th>SKU</th><th>Category</th><th>Location</th><th className="text-right">Qty</th><th className="text-right">Cost Price</th><th className="text-right">Total Value</th></tr></thead>
                        <tbody>
                            {reportData.map((row, i) => (
                                <tr key={`${row.item_id}-${row.location_id || 'all'}-${i}`}> {/* Handle null location_id if data can have it */}
                                    <td>{row.item_name} {row.variant ? `(${row.variant})` : ''}</td><td>{row.sku || 'N/A'}</td><td>{row.category || 'N/A'}</td><td>{row.location_name || 'N/A'}</td>
                                    <td className="text-right">{row.quantity_at_location}</td><td className="text-right">{formatCurrency(row.cost_price)}</td><td className="text-right">{formatCurrency(row.total_value_at_location)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot><tr><td colSpan="6" className="text-right"><strong>Grand Total Value:</strong></td><td className="text-right"><strong>{formatCurrency(grandTotalValue)}</strong></td></tr></tfoot>
                    </table>
                </div>
            );
        } else if (selectedReportType === 'sales_performance') {
            const { summary, topItems, salesByCategory } = reportData;
            if (!summary || (summary.number_of_orders === 0 && (!topItems || topItems.length === 0) && (!salesByCategory || salesByCategory.length === 0))) {
                 return <p className="no-data-message">No sales data found for the selected period.</p>;
            }
            return (
                <div>
                    <h4>Sales Summary ({periodOptionsList.find(o=>o.value === (filters.period || 'last30days'))?.label})</h4>
                    {summary && <ul className="summary-list">
                        <li><strong>Total Sales Value:</strong> <span>{formatCurrency(summary.total_sales_value)}</span></li>
                        <li><strong>Number of Orders:</strong> <span>{summary.number_of_orders}</span></li>
                        <li><strong>Avg. Order Value:</strong> <span>{formatCurrency(summary.average_order_value)}</span></li>
                        <li><strong>Total Items Sold:</strong> <span>{summary.total_items_sold} units</span></li>
                    </ul>}

                    {topItems && topItems.length > 0 && (<>
                        <h5 style={{marginTop: '2rem', marginBottom: '1rem'}}>Top Selling Products (by Revenue)</h5>
                        <div className="table-container" style={{maxHeight: '400px'}}> {/* Example max height */}
                            <table className="table">
                                <thead><tr><th>Product Name</th><th>SKU</th><th>Type</th><th className="text-right">Qty Sold</th><th className="text-right">Total Revenue</th></tr></thead>
                                <tbody>{topItems.map(item => <tr key={`${item.product_id}-${item.product_type}`}><td>{item.name}</td><td>{item.sku || 'N/A'}</td><td>{item.product_type}</td><td className="text-right">{item.total_quantity_sold}</td><td className="text-right">{formatCurrency(item.total_revenue_generated)}</td></tr>)}</tbody>
                            </table>
                        </div>
                    </>)}

                    {salesByCategory && salesByCategory.length > 0 && (<>
                        <h5 style={{marginTop: '2rem', marginBottom: '1rem'}}>Sales by Item Category</h5>
                         <div className="table-container" style={{maxHeight: '400px'}}> {/* Example max height */}
                            <table className="table">
                                <thead><tr><th>Category</th><th className="text-right">Qty Sold</th><th className="text-right">Total Revenue</th></tr></thead>
                                <tbody>{salesByCategory.map(cat => <tr key={cat.category}><td>{cat.category}</td><td className="text-right">{cat.total_quantity_sold}</td><td className="text-right">{formatCurrency(cat.total_sales_value)}</td></tr>)}</tbody>
                            </table>
                        </div>
                    </>)}
                </div>
            );
        }
        // Fallback if reportData is present but not matching known types, or if a new type is added without render logic
        if (reportData) {
            return <p className="no-data-message">Report generated. Display for this type might need specific implementation or no data matched.</p>;
        }
        return null; // Or some other placeholder
    };

    return (
        <div className="page-container reports-page">
            <header className="page-header-alt"><h1>Reports</h1></header>

            {notification.message &&
                <div className={`card notification notification-${notification.type || 'info'}`}
                     style={{marginBottom: '1rem', padding: '1rem', borderLeft: `5px solid var(--color-status-${notification.type || 'info'})`}}>
                    {notification.message}
                </div>
            }

            <div className="card report-controls-section">
                <div className="form-group">
                    <label htmlFor="reportTypeSelect">Select Report:</label>
                    <Select
                        inputId="reportTypeSelect"
                        options={reportOptionsList}
                        value={reportOptionsList.find(opt => opt.value === selectedReportType) || reportOptionsList[0]} // Ensure a value is always selected
                        onChange={handleReportTypeChange}
                        className="react-select-container"
                        styles={reactSelectStyles}
                        getOptionValue={(option) => option.value} // ensure value is correctly picked
                        getOptionLabel={(option) => option.label} // ensure label is correctly picked
                    />
                </div>

                {selectedReportType !== 'select' && renderFilters()}

                {selectedReportType !== 'select' && (
                    <div className="form-actions" style={{marginTop: '1rem'}}>
                        <button className="button button-primary" onClick={handleGenerateReport} disabled={isLoading}>
                            {isLoading ? 'Generating...' : 'Generate Report'}
                        </button>
                    </div>
                )}
            </div>

            {/* Conditional rendering for the report display section */}
            {/* Show this section only if a report has been selected (not 'select'), and it's not loading,
                and there's either data or an error to display related to that attempt. */}
            {(selectedReportType !== 'select' && !isLoading ) && (
                 <div className="card report-display-section" style={{marginTop: '2rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                        <h3>{reportOptionsList.find(opt => opt.value === selectedReportType)?.label || 'Report'}</h3>
                        {/* Show export buttons only if there's data and no error preventing data display */}
                        {reportData && !error &&
                            ( (Array.isArray(reportData) && reportData.length > 0) ||
                              (typeof reportData === 'object' && reportData !== null && (reportData.summary || (reportData.topItems && reportData.topItems.length > 0)))
                            ) &&
                            (<div>
                                <button className="button button-secondary button-small" onClick={() => handleExport('csv')} disabled={isLoading}>Export CSV</button>
                                <button className="button button-secondary button-small" style={{marginLeft:'10px'}} onClick={() => handleExport('xlsx')} disabled={isLoading}>Export XLSX</button>
                            </div>)
                        }
                    </div>
                    {renderReportContent()}
                </div>
            )}
        </div>
    );
}
export default ReportsPage;