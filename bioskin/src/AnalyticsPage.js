// src/AnalyticsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Bar, Doughnut, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, DoughnutController, PieController
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import './AnalyticsPage.css'; // <<< IMPORT THE CSS FILE

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, DoughnutController, PieController,
  ChartDataLabels
);

// --- Helper Functions ---
const formatCurrency = (value) => {
  const numericValue = Number(value);
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
    .format(isNaN(numericValue) ? 0 : numericValue);
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

// --- Chart Options ---
const commonPieDoughnutPlugins = (titleText) => ({
  legend: { position: 'top', labels: { boxWidth: 12, padding: 15, font: {size: 11} } },
  title: { display: true, text: titleText, font: { size: 16, weight: '600' }, padding: { top: 5, bottom: 20 } }, // Added top padding
  datalabels: {
    color: '#fff',
    font: { weight: 'bold', size: 10 },
    formatter: (value, ctx) => {
      const ds = ctx.chart.data.datasets[0];
      const total = ds.data.reduce((acc, val) => acc + val, 0);
      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
      if ((value / total) < 0.05 && ds.data.length > 5) return '';
      const label = ctx.chart.data.labels[ctx.dataIndex];
      const labelToShow = label && label.length > 15 ? `${label.substring(0,12)}...` : label || '';
      return `${labelToShow}\n(${percentage})`;
    },
    textStrokeColor: 'black',
    textStrokeWidth: 1.5,
  }
});

const lowStockChartOptions = { /* This options object is for the Bar chart - KEEP IF OTHER BAR CHARTS USE IT, or remove if not */
  responsive: true, indexAxis: 'y', maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: { display: true, text: 'Low Stock Items (Quantity < 10)', font: { size: 16, weight: '600' }, padding: { bottom: 15 } },
    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ''}: ${ctx.parsed.x} units` } },
    datalabels: { anchor: 'end', align: 'right', offset: 4, formatter: (v) => v, color: 'black', font: { weight: 'bold' } }
  },
  scales: { x: { beginAtZero: true, title: { display: true, text: 'Quantity' } }, y: { ticks: { font: { size: 10 } } } },
};

const categoryChartOptions = (periodText = '') => ({
  responsive: true, maintainAspectRatio: false,
  plugins: commonPieDoughnutPlugins(`Inventory Value by Category`), // PeriodText might not apply here
});

const storageChartOptions = (periodText = '') => ({
  responsive: true, maintainAspectRatio: false,
  plugins: commonPieDoughnutPlugins(`Stock Quantity by Storage`), // PeriodText might not apply here
});

const topSellingItemsChartOptions = (periodText = '') => ({
  responsive: true, indexAxis: 'y', maintainAspectRatio: false,
  layout: { padding: { left: 10, right: 35 } }, // Ensure datalabels are visible
  plugins: {
    legend: { display: false },
    title: { display: true, text: `Top Selling Items ${periodText} (by Quantity)`, font: { size: 16, weight: '600' }, padding: { bottom: 15 } },
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
  const [inventorySummary, setInventorySummary] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]); // For list display
  const [categoryChartData, setCategoryChartData] = useState(initialPieDoughnutData());
  const [storageChartData, setStorageChartData] = useState(initialPieDoughnutData());

  const [salesPeriod, setSalesPeriod] = useState('last30days');
  const [salesSummary, setSalesSummary] = useState(null);
  const [topSellingItemsChartData, setTopSellingItemsChartData] = useState(initialBarChartData());
  const [salesByStatusChartData, setSalesByStatusChartData] = useState(initialPieDoughnutData());

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLowStockItems([]);
    setCategoryChartData(initialPieDoughnutData());
    setStorageChartData(initialPieDoughnutData());
    setTopSellingItemsChartData(initialBarChartData());
    setSalesByStatusChartData(initialPieDoughnutData());

    try {
      const [invSumRes, lowStockRes, catRes, storageRes, salesSumRes, topItemsRes, salesStatRes] = await Promise.all([
        window.electronAPI.getInventorySummary(),
        window.electronAPI.getLowStockItems(10),
        window.electronAPI.getInventoryByCategory(),
        window.electronAPI.getInventoryByStorage(),
        window.electronAPI.getSalesSummary(salesPeriod),
        window.electronAPI.getTopSellingItems(salesPeriod, 5),
        window.electronAPI.getSalesByStatus(salesPeriod),
      ]);

      // Process Inventory Data
      if (invSumRes.success) setInventorySummary(invSumRes.summary); else throw new Error(invSumRes.message || 'Failed to load inventory summary');

      if (lowStockRes.success && Array.isArray(lowStockRes.items)) {
        setLowStockItems(lowStockRes.items);
      } else {
        console.warn("Low stock items data was not valid:", lowStockRes);
        setLowStockItems([]);
      }

      if (catRes.success && Array.isArray(catRes.data)) {
        setCategoryChartData({
          labels: catRes.data.map(c => c.category || 'Uncategorized'),
          datasets: [{ label: 'Total Value by Category', data: catRes.data.map(c => parseFloat(c.total_value) || 0), backgroundColor: generateChartColors(catRes.data.length), borderColor: '#fff', borderWidth: 1 }],
        });
      } else console.warn("Category data invalid:", catRes);

      if (storageRes.success && Array.isArray(storageRes.data)) {
              console.log("AnalyticsPage: Processing storageRes.data for chart:", storageRes.data); // Keep this for verification
              setStorageChartData({
                // --- MODIFICATION: Use correct property names from RPC ---
                labels: storageRes.data.map(s => s.storage_location_name || 'Undefined Location'), // Use s.storage_location_name
                datasets: [{
                  label: 'Total Quantity by Storage',
                  // --- MODIFICATION: Use correct property names from RPC ---
                  data: storageRes.data.map(s => parseInt(s.total_quantity_at_location, 10) || 0), // Use s.total_quantity_at_location
                  backgroundColor: generateChartColors(storageRes.data.length),
                  borderColor: '#fff',
                  borderWidth: 1
                }],
              });
            } else {
              console.warn("Storage data invalid or empty:", storageRes);
              setStorageChartData(initialPieDoughnutData()); // Reset if data is invalid
            }

      // Process Sales Data
      if (salesSumRes.success) setSalesSummary(salesSumRes.summary); else console.warn("Sales summary invalid:", salesSumRes);

      if (topItemsRes.success && Array.isArray(topItemsRes.items) && topItemsRes.items.length > 0) {
        setTopSellingItemsChartData({
          labels: topItemsRes.items.map(item => `${item.name || 'N/A Item'} (SKU: ${item.sku || 'N/A'})`.substring(0, 40) + (`${item.name || 'N/A Item'} (SKU: ${item.sku || 'N/A'})`.length > 40 ? '...' : '')),
          datasets: [{ label: 'Quantity Sold', data: topItemsRes.items.map(item => item.total_quantity_sold || 0), backgroundColor: generateChartColors(topItemsRes.items.length, 0.65), borderColor: generateChartColors(topItemsRes.items.length, 1), borderWidth: 1 }],
        });
      } else {
        console.warn("Top selling items data invalid or empty:", topItemsRes);
        setTopSellingItemsChartData(initialBarChartData()); // Reset if no data
      }

      if (salesStatRes.success && Array.isArray(salesStatRes.data) && salesStatRes.data.length > 0) {
        setSalesByStatusChartData({
          labels: salesStatRes.data.map(s => s.status),
          datasets: [{ label: 'Order Count', data: salesStatRes.data.map(s => s.count || 0), backgroundColor: generateChartColors(salesStatRes.data.length), borderColor: '#fff', borderWidth: 1 }],
        });
      } else {
        console.warn("Sales by status data invalid or empty:", salesStatRes);
        setSalesByStatusChartData(initialPieDoughnutData()); // Reset if no data
      }

    } catch (err) {
      console.error("AnalyticsPage: Error fetching data:", err);
      setError(err.message || "An unknown error occurred while fetching analytics data.");
      setInventorySummary(null);
      setLowStockItems([]);
      setSalesSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [salesPeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePeriodChange = (event) => setSalesPeriod(event.target.value);
  const periodText = `(${salesPeriod.replace('last', 'Last ')})`;

  if (isLoading) {
    return <div className="page-container analytics-loading">Loading analytics data...</div>;
  }

  return (
    <div className="page-container analytics-page">
      <header className="analytics-header">
        <h1 className="analytics-title">Inventory & Sales Analytics</h1>
        <div className="sales-period-filter">
          <label htmlFor="salesPeriod">Sales Period:</label>
          <select id="salesPeriod" value={salesPeriod} onChange={handlePeriodChange}>
            <option value="today">Today</option>
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
          </select>
        </div>
      </header>

      <main>
        {error && <div className="analytics-error card">Error: {error}</div>}

        <section className="analytics-section">
          <h2>Overall Inventory Summary</h2>
          {inventorySummary ? (
            <ul className="summary-list">
              <li><strong>Total Unique Items:</strong> <span>{inventorySummary.totalUniqueItems}</span></li>
              <li><strong>Total Stock Quantity:</strong> <span>{inventorySummary.totalStockQuantity} units</span></li>
              <li><strong>Estimated Total Value:</strong> <span>{formatCurrency(inventorySummary.estimatedTotalValue)}</span></li>
            </ul>
          ) : !error && <p className="no-data-message">Could not load inventory summary.</p>}
        </section>

        <section className="analytics-section">
          <h2>Sales Summary {periodText}</h2>
          {salesSummary ? (
            <ul className="summary-list">
              <li><strong>Total Sales Value:</strong> <span>{formatCurrency(salesSummary.totalSalesValue)}</span></li>
              <li><strong>Number of Orders:</strong> <span>{salesSummary.numberOfOrders}</span></li>
              <li><strong>Average Order Value:</strong> <span>{formatCurrency(salesSummary.averageOrderValue)}</span></li>
            </ul>
          ) : !error && <p className="no-data-message">No sales summary for this period.</p>}
        </section>

        <div className="charts-grid">
          <div className="chart-card">
            <h3>Inventory Value by Category</h3>
            {categoryChartData.datasets[0]?.data.length > 0 ? (
              <div className="chart-wrapper"><Doughnut options={categoryChartOptions()} data={categoryChartData} /></div>
            ) : !error && <p className="no-data-message">No category data.</p>}
          </div>

          <div className="chart-card">
            <h3>Stock Quantity by Storage</h3>
            {storageChartData.datasets[0]?.data.length > 0 ? (
              <div className="chart-wrapper"><Pie options={storageChartOptions()} data={storageChartData} /></div>
            ) : !error && <p className="no-data-message">No storage data.</p>}
          </div>

          <div className="chart-card">
            <h3>Top Selling Items {periodText}</h3>
            {topSellingItemsChartData.datasets[0]?.data.length > 0 ? (
              <div className="chart-wrapper top-items-chart-wrapper" style={{ height: `${Math.max(300, (topSellingItemsChartData.labels?.length || 0) * 45 + 50)}px` }}>
                <Bar options={topSellingItemsChartOptions(periodText)} data={topSellingItemsChartData} />
              </div>
            ) : !error && <p className="no-data-message">No top selling items data for this period.</p>}
          </div>

          <div className="chart-card">
            <h3>Sales Orders by Status {periodText}</h3>
            {salesByStatusChartData.datasets[0]?.data.length > 0 ? (
              <div className="chart-wrapper"><Doughnut options={salesByStatusChartOptions(periodText)} data={salesByStatusChartData} /></div>
            ) : !error && <p className="no-data-message">No sales by status data for this period.</p>}
          </div>
        </div>

        <section className="analytics-section low-stock-section">
        <h2>{`Low Stock Items (Quantity < 10)`}</h2>
          {lowStockItems.length > 0 ? (
            <div className="low-stock-list-container">
              <ul className="low-stock-list">
                {lowStockItems.map(item => (
                  <li key={item.id}>
                    <span className="item-name">{item.name} (SKU: {item.sku || 'N/A'})</span>
                    <span className="item-quantity">{item.quantity} units</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : !error && (
            <p className="no-data-message">No items found with low stock.</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default AnalyticsPage;