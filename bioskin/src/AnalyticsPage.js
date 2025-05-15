// src/AnalyticsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Bar, Doughnut, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import Select from 'react-select'; // For filter dropdowns
import './AnalyticsPage.css'; // Ensure this CSS file is created and styled

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement,
  ChartDataLabels
);

// --- Helper Functions ---
const formatCurrency = (value) => {
  const numericValue = Number(value);
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
    .format(isNaN(numericValue) ? 0 : numericValue);
};

const formatDate = (dateString, includeTime = false) => {
    if (!dateString) return 'N/A';
    try {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
        }
        return new Date(dateString).toLocaleDateString('en-US', options);
    } catch (e) {
        return 'Invalid Date';
    }
};

const generateChartColors = (numColors, opacity = 0.7) => {
  const baseColors = [
    `rgba(255, 99, 132, ${opacity})`, `rgba(54, 162, 235, ${opacity})`, `rgba(255, 206, 86, ${opacity})`,
    `rgba(75, 192, 192, ${opacity})`, `rgba(153, 102, 255, ${opacity})`, `rgba(255, 159, 64, ${opacity})`,
    `rgba(201, 203, 207, ${opacity})`, `rgba(50, 205, 50, ${opacity})`, `rgba(255, 0, 255, ${opacity})`,
    `rgba(0, 255, 255, ${opacity})`
  ];
  return Array.from({ length: numColors }, (_, i) => baseColors[i % baseColors.length]);
};

// --- Initial Chart Data Structures ---
const initialBarChartData = () => ({ labels: [], datasets: [{ label: '', data: [], backgroundColor: 'rgba(128,128,128,0.7)' }] });
const initialPieDoughnutData = () => ({ labels: [], datasets: [{ label: '', data: [], backgroundColor: [] }] });

// --- Chart Options (Copied from your original AnalyticsPage.js) ---
const commonPieDoughnutPlugins = (titleText) => ({
  legend: { position: 'top', labels: { boxWidth: 12, padding: 15, font: {size: 11} } },
  title: { display: false, text: titleText, font: { size: 16, weight: '600' }, padding: { top: 5, bottom: 20 } },
  datalabels: {
    color: '#fff',
    font: { weight: 'bold', size: 10 },
    formatter: (value, ctx) => {
      const ds = ctx.chart.data.datasets[0];
      const total = ds.data.reduce((acc, val) => acc + val, 0);
      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
      if ((value / total) < 0.05 && ds.data.length > 5) return ''; // Hide small labels if many segments
      const label = ctx.chart.data.labels[ctx.dataIndex];
      const labelToShow = label && label.length > 15 ? `${label.substring(0,12)}...` : label || '';
      return `${labelToShow}\n(${percentage})`;
    },
    textStrokeColor: 'black',
    textStrokeWidth: 1.5,
  }
});

const categoryChartOptions = () => ({
  responsive: true, maintainAspectRatio: false,
  plugins: commonPieDoughnutPlugins(`Inventory Value by Category`),
});

const storageChartOptions = () => ({
  responsive: true, maintainAspectRatio: false,
  plugins: commonPieDoughnutPlugins(`Stock Quantity by Storage`),
});

const topSellingItemsChartOptions = (periodText = '') => ({
  responsive: true, indexAxis: 'y', maintainAspectRatio: false,
  layout: { padding: { left: 10, right: 35 } },
  plugins: {
    legend: { display: false },
    title: { display: false, text: `Top Selling Items ${periodText} (by Quantity)`, font: { size: 16, weight: '600' }, padding: { bottom: 15 } },
    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ''}: ${ctx.parsed.x} units` } },
    datalabels: { anchor: 'end', align: 'right', offset: 4, formatter: (v) => v, color: 'black', font: { weight: 'bold' } }
  },
  scales: { x: { beginAtZero: true, title: { display: true, text: 'Quantity Sold' } }, y: { ticks: { font: { size: 10 } } } },
});

const salesByStatusChartOptions = (periodText = '') => ({
  responsive: true, maintainAspectRatio: false,
  plugins: commonPieDoughnutPlugins(`Sales Orders by Status ${periodText}`),
});


function AnalyticsPage() {
    // --- KPIs and Chart States ---
    const [inventorySummary, setInventorySummary] = useState(null);
    const [categoryChartData, setCategoryChartData] = useState(initialPieDoughnutData());
    const [storageChartData, setStorageChartData] = useState(initialPieDoughnutData());
    const [salesPeriod, setSalesPeriod] = useState('last30days');
    const [salesSummary, setSalesSummary] = useState(null);
    const [topSellingItemsChartData, setTopSellingItemsChartData] = useState(initialBarChartData());
    const [salesByStatusChartData, setSalesByStatusChartData] = useState(initialPieDoughnutData());
    const [lowStockItemsList, setLowStockItemsList] = useState([]);

    // --- Detailed Report States ---
    const [detailedStockData, setDetailedStockData] = useState([]);
    const [isDetailedStockLoading, setIsDetailedStockLoading] = useState(false);
    const [salesDetailData, setSalesDetailData] = useState([]);
    const [isSalesDetailLoading, setIsSalesDetailLoading] = useState(false);

    // --- Filter Options & Values States ---
    const [categoryFilterOptions, setCategoryFilterOptions] = useState([]);
    const [locationFilterOptions, setLocationFilterOptions] = useState([]);
    const [stockReportFilters, setStockReportFilters] = useState({ category: null, locationId: null, lowStockOnly: false });

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notification, setNotification] = useState({ type: '', message: '' }); // For export feedback

    // Fetch options for filters (Categories, Locations)
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const itemsRes = await window.electronAPI.getItems({}); // Fetch all items to derive categories
                if (itemsRes && Array.isArray(itemsRes)) {
                    const uniqueCategories = [...new Set(itemsRes.map(item => item.category).filter(Boolean))].sort();
                    setCategoryFilterOptions(uniqueCategories.map(cat => ({ value: cat, label: cat })));
                } else { console.warn("Could not load items for category filters."); }

                const locResult = await window.electronAPI.getStorageLocations();
                if (locResult.success && Array.isArray(locResult.locations)) {
                    setLocationFilterOptions(locResult.locations.map(loc => ({ value: loc.id, label: loc.name })));
                } else { console.warn("Could not load storage locations for filters."); }
            } catch (err) {
                console.error("AnalyticsPage: Error loading filter options:", err);
                setError("Failed to load filter options for reports.");
            }
        };
        loadFilterOptions();
    }, []);

    // Fetch core KPI and chart data
    const fetchCoreData = useCallback(async () => {
        setIsLoading(true); // Overall loading for core data
        setError(null);
        setNotification({ type: '', message: '' });

        try {
            const [invSumRes, lowStockRes, catRes, storageRes, salesSumRes, topItemsRes, salesStatRes] = await Promise.all([
                window.electronAPI.getInventorySummary(),
                window.electronAPI.getLowStockItems(10),
                window.electronAPI.getInventoryByCategory(),
                window.electronAPI.getInventoryByStorage(),
                window.electronAPI.getSalesSummary(salesPeriod),
                window.electronAPI.getTopSellingItems({period: salesPeriod, limit: 7}), // Fetch 7 for chart
                window.electronAPI.getSalesByStatus(salesPeriod),
            ]);

            if (invSumRes.success) setInventorySummary(invSumRes.summary); else throw new Error(invSumRes.message || 'Failed to load inventory summary');
            if (lowStockRes.success) setLowStockItemsList(lowStockRes.items || []); else console.warn("Low stock items data invalid:", lowStockRes);

            if (catRes.success && Array.isArray(catRes.data)) {
                setCategoryChartData({
                  labels: catRes.data.map(c => c.category || 'Uncategorized'),
                  datasets: [{ data: catRes.data.map(c => parseFloat(c.total_value) || 0), backgroundColor: generateChartColors(catRes.data.length), borderColor: '#fff', borderWidth: 1 }],
                });
            } else { console.warn("Category data invalid:", catRes); setCategoryChartData(initialPieDoughnutData());}

            if (storageRes.success && Array.isArray(storageRes.data)) {
                setStorageChartData({
                  labels: storageRes.data.map(s => s.storage_location_name || 'Undefined'),
                  datasets: [{ data: storageRes.data.map(s => parseInt(s.total_quantity_at_location, 10) || 0), backgroundColor: generateChartColors(storageRes.data.length), borderColor: '#fff', borderWidth: 1 }],
                });
            } else { console.warn("Storage data invalid:", storageRes); setStorageChartData(initialPieDoughnutData()); }

            if (salesSumRes.success) setSalesSummary(salesSumRes.summary); else console.warn("Sales summary invalid:", salesSumRes);

            if (topItemsRes.success && Array.isArray(topItemsRes.items) && topItemsRes.items.length > 0) {
                setTopSellingItemsChartData({
                  labels: topItemsRes.items.map(item => `${item.name || 'N/A'} (SKU: ${item.sku || 'N/A'})`.substring(0,35) + (item.name.length > 35 ? '...' : '')),
                  datasets: [{ label: 'Qty Sold', data: topItemsRes.items.map(item => item.total_quantity_sold || 0), backgroundColor: generateChartColors(topItemsRes.items.length, 0.65), borderColor: generateChartColors(topItemsRes.items.length,1), borderWidth:1 }],
                });
            } else { console.warn("Top selling items data invalid or empty:", topItemsRes); setTopSellingItemsChartData(initialBarChartData()); }

            if (salesStatRes.success && Array.isArray(salesStatRes.data) && salesStatRes.data.length > 0) {
                setSalesByStatusChartData({
                  labels: salesStatRes.data.map(s => s.status),
                  datasets: [{ label: 'Order Count', data: salesStatRes.data.map(s => s.count || 0), backgroundColor: generateChartColors(salesStatRes.data.length), borderColor: '#fff', borderWidth: 1 }],
                });
            } else { console.warn("Sales by status data invalid or empty:", salesStatRes); setSalesByStatusChartData(initialPieDoughnutData()); }

        } catch (err) {
            console.error("AnalyticsPage: Error fetching core data:", err);
            setError(err.message || "An error occurred while fetching core analytics data.");
        } finally {
            setIsLoading(false);
        }
    }, [salesPeriod]);

    useEffect(() => {
        fetchCoreData();
    }, [fetchCoreData]);

    // Fetch Detailed Stock Report Data
    const fetchDetailedStock = useCallback(async () => {
        setIsDetailedStockLoading(true);
        try {
            const result = await window.electronAPI.getDetailedStockReport(stockReportFilters);
            if (result.success) {
                setDetailedStockData(result.data || []);
            } else {
                console.error("Failed to fetch detailed stock report:", result.message);
                setDetailedStockData([]);
                setNotification({type: 'error', message: `Stock Report: ${result.message || 'Failed to load.'}`});
            }
        } catch (err) {
            console.error("Error fetching detailed stock report:", err);
            setDetailedStockData([]);
            setNotification({type: 'error', message: `Stock Report Error: ${err.message}`});
        } finally {
            setIsDetailedStockLoading(false);
        }
    }, [stockReportFilters]);

    useEffect(() => {
        fetchDetailedStock();
    }, [fetchDetailedStock]);

    // Fetch Sales Detail Report Data
    const fetchSalesDetail = useCallback(async () => {
        setIsSalesDetailLoading(true);
        try {
            const filters = { period: salesPeriod };
            const result = await window.electronAPI.getSalesDetailReport(filters);
            if (result.success) {
                setSalesDetailData(result.data || []);
            } else {
                console.error("Failed to fetch sales detail report:", result.message);
                setSalesDetailData([]);
                setNotification({type: 'error', message: `Sales Detail: ${result.message || 'Failed to load.'}`});
            }
        } catch (err) {
            console.error("Error fetching sales detail report:", err);
            setSalesDetailData([]);
            setNotification({type: 'error', message: `Sales Detail Error: ${err.message}`});
        } finally {
            setIsSalesDetailLoading(false);
        }
    }, [salesPeriod]);

    useEffect(() => {
        fetchSalesDetail();
    }, [fetchSalesDetail]);

    const handleSalesPeriodChange = (event) => setSalesPeriod(event.target.value);

    const handleStockFilterChange = (filterName, selectedOptionOrEvent) => {
        let value;
        if (filterName === 'lowStockOnly') {
            value = selectedOptionOrEvent.target.checked;
        } else { // For react-select
            value = selectedOptionOrEvent ? selectedOptionOrEvent.value : null;
        }
        setStockReportFilters(prev => ({ ...prev, [filterName]: value }));
    };

    const periodText = `(${salesPeriod.replace('last', 'Last ').replace('days', ' Days').replace('today', 'Today')})`;

    const handleExport = async (reportIdentifier, format) => {
        setNotification({ type: '', message: '' }); // Clear previous notifications
        let dataToExport;
        let fileNamePrefix;

        if (reportIdentifier === 'detailedStock') {
            dataToExport = detailedStockData;
            fileNamePrefix = 'detailed_stock_report';
        } else if (reportIdentifier === 'salesDetail') {
            dataToExport = salesDetailData;
            fileNamePrefix = 'sales_detail_report';
        } else {
            setNotification({type: 'error', message: "Unknown report to export."});
            return;
        }

        if (!dataToExport || dataToExport.length === 0) {
            setNotification({type: 'warn', message: "No data available to export for this report."});
            return;
        }

        try {
            setNotification({type: 'info', message: `Exporting ${format.toUpperCase()}...`});
            const result = await window.electronAPI.exportReportData({
                reportData: dataToExport,
                format: format,
                fileNamePrefix: fileNamePrefix
            });
            if (result.success) {
                setNotification({type: 'success', message: result.message || 'Export successful!'});
            } else {
                setNotification({type: 'error', message: `Export failed: ${result.message}`});
            }
        } catch (err) {
            setNotification({type: 'error', message: `Export error: ${err.message}`});
        }
        setTimeout(() => setNotification({ type: '', message: '' }), 5000); // Clear notification after 5s
    };

    if (isLoading) {
        return <div className="page-container analytics-loading">Loading analytics dashboard...</div>;
    }

    return (
        <div className="page-container analytics-page">
            <header className="analytics-header">
                <h1 className="analytics-title">Inventory & Sales Analytics</h1>
                <div className="sales-period-filter">
                    <label htmlFor="salesPeriod">Sales Data Period:</label>
                    <select id="salesPeriod" value={salesPeriod} onChange={handleSalesPeriodChange}>
                        <option value="today">Today</option>
                        <option value="last7days">Last 7 Days</option>
                        <option value="last30days">Last 30 Days</option>
                    </select>
                </div>
            </header>

            <main>
                {error && <div className="analytics-error card" style={{borderColor: 'var(--color-status-danger)', color: 'var(--color-status-danger)'}}>Error: {error}</div>}
                {notification.message &&
                    <div className={`card notification notification-${notification.type || 'info'}`}
                         style={{marginBottom: '1rem', padding: '1rem', borderLeft: `5px solid var(--color-status-${notification.type || 'info'})`}}>
                        {notification.message}
                    </div>
                }

                <section className="analytics-section">
                    <h2>Overall Inventory Summary</h2>
                    {inventorySummary ? (
                        <ul className="summary-list">
                            <li><strong>Total Unique Items:</strong> <span>{inventorySummary.totalUniqueItems}</span></li>
                            <li><strong>Total Stock Quantity:</strong> <span>{inventorySummary.totalStockQuantity} units</span></li>
                            <li><strong>Est. Total Value:</strong> <span>{formatCurrency(inventorySummary.estimatedTotalValue)}</span></li>
                        </ul>
                    ) : !error && <p className="no-data-message">Could not load inventory summary.</p>}
                </section>

                <section className="analytics-section">
                    <h2>Sales Summary {periodText}</h2>
                    {salesSummary ? (
                        <ul className="summary-list">
                            <li><strong>Total Sales Value:</strong> <span>{formatCurrency(salesSummary.totalSalesValue)}</span></li>
                            <li><strong>Number of Orders:</strong> <span>{salesSummary.numberOfOrders}</span></li>
                            <li><strong>Avg. Order Value:</strong> <span>{formatCurrency(salesSummary.averageOrderValue)}</span></li>
                        </ul>
                    ) : !error && <p className="no-data-message">No sales summary for this period.</p>}
                </section>

                <div className="charts-grid">
                    <div className="chart-card">
                        <h3>Inventory Value by Category</h3>
                        {categoryChartData.datasets[0]?.data.length > 0 ? (
                            <div className="chart-wrapper"><Doughnut options={categoryChartOptions()} data={categoryChartData} /></div>
                        ) : !error && <p className="no-data-message">No category data for chart.</p>}
                    </div>
                    <div className="chart-card">
                        <h3>Stock Quantity by Storage</h3>
                        {storageChartData.datasets[0]?.data.length > 0 ? (
                            <div className="chart-wrapper"><Pie options={storageChartOptions()} data={storageChartData} /></div>
                        ) : !error && <p className="no-data-message">No storage data for chart.</p>}
                    </div>
                    <div className="chart-card">
                        <h3>Top Selling Items {periodText}</h3>
                        {topSellingItemsChartData.datasets[0]?.data.length > 0 ? (
                            <div className="chart-wrapper top-items-chart-wrapper" style={{ height: `${Math.max(300, (topSellingItemsChartData.labels?.length || 0) * 40 + 60)}px` }}>
                                <Bar options={topSellingItemsChartOptions(periodText)} data={topSellingItemsChartData} />
                            </div>
                        ) : !error && <p className="no-data-message">No top selling items for this period.</p>}
                    </div>
                    <div className="chart-card">
                        <h3>Sales Orders by Status {periodText}</h3>
                        {salesByStatusChartData.datasets[0]?.data.length > 0 ? (
                            <div className="chart-wrapper"><Doughnut options={salesByStatusChartOptions(periodText)} data={salesByStatusChartData} /></div>
                        ) : !error && <p className="no-data-message">No sales by status data for this period.</p>}
                    </div>
                </div>

                {/* Detailed Stock Report Section */}
                <section className="analytics-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <h2 style={{marginBottom: '0.5rem'}}>Detailed Stock Report</h2>
                        <div>
                            <button className="button button-secondary button-small" onClick={() => handleExport('detailedStock', 'csv')} disabled={detailedStockData.length === 0}>Export CSV</button>
                            <button className="button button-secondary button-small" style={{marginLeft:'10px'}} onClick={() => handleExport('detailedStock', 'xlsx')} disabled={detailedStockData.length === 0}>Export XLSX</button>
                        </div>
                    </div>
                    <div className="filters-bar">
                        <Select
                            options={categoryFilterOptions}
                            value={categoryFilterOptions.find(o => o.value === stockReportFilters.category)}
                            onChange={(opt) => handleStockFilterChange('category', opt)}
                            isClearable placeholder="Filter by Category..." className="react-select-container" styles={{ menu: base => ({ ...base, zIndex: 5 })}}
                        />
                        <Select
                            options={locationFilterOptions}
                            value={locationFilterOptions.find(o => o.value === stockReportFilters.locationId)}
                            onChange={(opt) => handleStockFilterChange('locationId', opt)}
                            isClearable placeholder="Filter by Location..." className="react-select-container" styles={{ menu: base => ({ ...base, zIndex: 4 })}}
                        />
                        <label>
                            <input type="checkbox" checked={stockReportFilters.lowStockOnly} onChange={(e) => handleStockFilterChange('lowStockOnly', e)} />
                            Show Low Stock Only (Qty {'<'} Threshold)
                        </label>
                    </div>
                    {isDetailedStockLoading ? <p className="no-data-message" style={{minHeight: '100px'}}>Loading detailed stock...</p> : detailedStockData.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Item Name</th><th>SKU</th><th>Category</th><th>Location</th>
                                        <th className="text-right">Qty</th>
                                        <th className="text-right">Cost</th>
                                        <th className="text-right">Value</th>
                                        <th className="text-right">Low Stock Threshold</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailedStockData.map(row => (
                                        <tr key={`${row.item_id}-${row.location_id || 'na'}`}>
                                            <td>{row.item_name} {row.variant ? `(${row.variant})` : ''}</td>
                                            <td>{row.sku || 'N/A'}</td>
                                            <td>{row.category || 'N/A'}</td>
                                            <td>{row.location_name || 'N/A'}</td>
                                            <td className="text-right">{row.quantity_at_location}</td>
                                            <td className="text-right">{formatCurrency(row.cost_price)}</td>
                                            <td className="text-right">{formatCurrency(row.stock_value_at_location)}</td>
                                            <td className="text-right">{row.low_stock_threshold ?? 'N/A'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <p className="no-data-message" style={{minHeight: '100px'}}>No detailed stock data matching filters.</p>}
                </section>

                {/* Sales Detail Report Section */}
                <section className="analytics-section">
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <h2 style={{marginBottom: '0.5rem'}}>Sales Detail Report {periodText}</h2>
                         <div>
                            <button className="button button-secondary button-small" onClick={() => handleExport('salesDetail', 'csv')} disabled={salesDetailData.length === 0}>Export CSV</button>
                            <button className="button button-secondary button-small" style={{marginLeft:'10px'}} onClick={() => handleExport('salesDetail', 'xlsx')} disabled={salesDetailData.length === 0}>Export XLSX</button>
                        </div>
                    </div>
                    {/* Future: Add more filters for sales detail: customer, item/bundle, etc. */}
                    {isSalesDetailLoading ? <p className="no-data-message" style={{minHeight: '100px'}}>Loading sales details...</p> : salesDetailData.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Order Date</th><th>Order #</th><th>Customer</th>
                                        <th>Item/Bundle Name</th><th>SKU</th>
                                        <th className="text-right">Qty</th>
                                        <th className="text-right">Unit Price</th>
                                        <th className="text-right">Line Total</th>
                                        <th>Order Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesDetailData.map(row => (
                                        <tr key={row.id}>
                                            <td>{formatDate(row.sales_orders?.order_date)}</td>
                                            <td>{row.sales_orders?.order_number || `SO-${row.sales_orders?.id}`}</td>
                                            <td>{row.sales_orders?.customer?.full_name || 'N/A'}</td>
                                            <td>{row.item_snapshot_name}</td>
                                            <td>{row.item_snapshot_sku || 'N/A'}</td>
                                            <td className="text-right">{row.quantity}</td>
                                            <td className="text-right">{formatCurrency(row.unit_price)}</td>
                                            <td className="text-right">{formatCurrency(row.line_total)}</td>
                                            <td>{row.sales_orders?.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <p className="no-data-message" style={{minHeight: '100px'}}>No sales details for this period.</p>}
                </section>

                <section className="analytics-section low-stock-section">
                    <h2>{`Low Stock Items (Overall Quantity < 10)`}</h2>
                    {lowStockItemsList.length > 0 ? (
                        <div className="low-stock-list-container">
                            <ul className="low-stock-list">
                                {lowStockItemsList.map(item => (
                                <li key={item.id}>
                                    <span className="item-name">{item.name} (SKU: {item.sku || 'N/A'})</span>
                                    <span className="item-quantity">{item.quantity} units</span> {/* This 'quantity' is total_quantity from getLowStockItems */}
                                </li>
                                ))}
                            </ul>
                        </div>
                    ) : !error && <p className="no-data-message">No items found with overall low stock.</p>}
                </section>
            </main>
        </div>
    );
}

export default AnalyticsPage;