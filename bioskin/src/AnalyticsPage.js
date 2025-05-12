// src/AnalyticsPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, DoughnutController, PieController
} from 'chart.js';
import { Bar, Doughnut, Pie } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, DoughnutController, PieController,
  ChartDataLabels
);

// src/AnalyticsPage.js

const formatCurrency = (value) => {
    // Ensure value is a number, default to 0 if not
    const numericValue = Number(value);
    if (isNaN(numericValue)) {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(0);
    }
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(numericValue);
};

const generateChartColors = (numColors) => {
    const colors = [
        'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
        'rgba(201, 203, 207, 0.7)', 'rgba(50, 205, 50, 0.7)', 'rgba(255, 0, 255, 0.7)',
        'rgba(0, 255, 255, 0.7)'
    ];
    let generatedColors = [];
    for (let i = 0; i < numColors; i++) {
        generatedColors.push(colors[i % colors.length]);
    }
    return generatedColors;
};

// --- Default Empty Chart Data Structures ---
const initialBarChartData = { labels: [], datasets: [{ label: '', data: [], backgroundColor: 'grey' }] };
const initialPieDoughnutData = { labels: [], datasets: [{ label: '', data: [], backgroundColor: [] }] };


function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  // No longer need separate state for the raw arrays if we manage full chart data objects
  // const [lowStockItems, setLowStockItems] = useState([]);
  // const [categoryData, setCategoryData] = useState([]);
  // const [storageData, setStorageData] = useState([]);

  // --- State for Chart Data Objects ---
  const [lowStockChartData, setLowStockChartData] = useState(initialBarChartData);
  const [categoryChartData, setCategoryChartData] = useState(initialPieDoughnutData);
  const [storageChartData, setStorageChartData] = useState(initialPieDoughnutData);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      // Reset chart data to initial empty state before fetching
      setLowStockChartData(initialBarChartData);
      setCategoryChartData(initialPieDoughnutData);
      setStorageChartData(initialPieDoughnutData);

      try {
        const [summaryRes, lowStockRes, categoryRes, storageRes] = await Promise.all([
          window.electronAPI.getInventorySummary(),
          window.electronAPI.getLowStockItems(10),
          window.electronAPI.getInventoryByCategory(),
          window.electronAPI.getInventoryByStorage()
        ]);

        // Process Summary
        if (summaryRes.success && summaryRes.summary) {
            setSummary(summaryRes.summary);
        } else {
            throw new Error(summaryRes.message || 'Failed to load summary');
        }

        // Process Low Stock Items and update chart data
        if (lowStockRes.success && Array.isArray(lowStockRes.items)) {
            setLowStockChartData({
                labels: lowStockRes.items.map(item => `${item.name} (SKU: ${item.sku || 'N/A'})`),
                datasets: [{
                    label: 'Current Quantity',
                    data: lowStockRes.items.map(item => item.quantity),
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1,
                }],
            });
        } else {
            console.warn("Low stock items data was not valid:", lowStockRes);
            // Keep initialBarChartData (empty but valid structure)
        }

        // Process Category Data and update chart data
        if (categoryRes.success && Array.isArray(categoryRes.data)) {
            setCategoryChartData({
                labels: categoryRes.data.map(cat => cat.category),
                datasets: [{
                    label: 'Total Value by Category',
                    data: categoryRes.data.map(cat => parseFloat(cat.total_value) || 0),
                    backgroundColor: generateChartColors(categoryRes.data.length),
                    borderColor: '#fff', borderWidth: 1,
                }],
            });
        } else {
            console.warn("Category data was not valid:", categoryRes);
        }

        // Process Storage Data and update chart data
        if (storageRes.success && Array.isArray(storageRes.data)) {
            setStorageChartData({
                labels: storageRes.data.map(loc => loc.storage_location),
                datasets: [{
                    label: 'Total Quantity by Storage',
                    data: storageRes.data.map(loc => parseInt(loc.total_quantity, 10) || 0),
                    backgroundColor: generateChartColors(storageRes.data.length),
                    borderColor: '#fff', borderWidth: 1,
                }],
            });
        } else {
            console.warn("Storage data was not valid:", storageRes);
        }

      } catch (err) {
        console.error("AnalyticsPage: Error fetching data:", err);
        setError(err.message);
        setSummary(null);
        // Reset to initial empty chart data on error
        setLowStockChartData(initialBarChartData);
        setCategoryChartData(initialPieDoughnutData);
        setStorageChartData(initialPieDoughnutData);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []); // Empty dependency array ensures this runs once on mount

  // --- Chart Options (Remain the same) ---
  const lowStockChartOptions = {
    responsive: true, indexAxis: 'y',
    plugins: { /* ... same ... */
        legend: { display: false },
        title: { display: true, text: 'Low Stock Items (Quantity < 10)' },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ''}: ${ctx.parsed.x} units` }},
        datalabels: {
            anchor: 'end', align: 'end',
            formatter: (value) => value,
            color: 'black', font: { weight: 'bold' }
        }
    },
    scales: { x: { beginAtZero: true, title: { display: true, text: 'Quantity' } }, y: { title: { display: true, text: 'Item Name' }} },
  };
  const categoryChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { /* ... same ... */
        legend: { position: 'right' },
        title: { display: true, text: 'Inventory Value by Category' },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatCurrency(ctx.raw)}` }},
        datalabels: {
            formatter: (value, ctx) => {
                const total = ctx.chart.getDatasetMeta(0).total;
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                if ((value/total) < 0.05 && ctx.chart.data.labels.length > 5) return '';
                return `${ctx.chart.data.labels[ctx.dataIndex]}\n(${percentage})`;
            },
            color: '#fff', textStrokeColor: 'black', textStrokeWidth: 1.5,
            font: { weight: 'bold', size: 10 }
        }
    },
  };
   const storageChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { /* ... same ... */
        legend: { position: 'top' },
        title: { display: true, text: 'Stock Quantity by Storage Location' },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} units` }},
        datalabels: {
            formatter: (value, ctx) => {
                const total = ctx.chart.getDatasetMeta(0).total;
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                if ((value/total) < 0.05 && ctx.chart.data.labels.length > 5) return '';
                return percentage;
            },
            color: '#fff', font: { weight: 'bold' }
        }
    },
  };


  return (
    <div className="container page-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
        <h1>Inventory Analytics</h1>
        <Link to="/" className="button button-secondary">Back to Dashboard</Link>
      </header>

      <main style={{ marginTop: '2rem' }}>
        {isLoading && <p style={{ textAlign: 'center', padding: '2rem' }}>Loading analytics data...</p>}
        {error && <div className="card" style={{ color: 'red', padding: '1rem', marginBottom: '1rem' }}>Error: {error}</div>}

        {!isLoading && !error && (
          <>
            <section className="card" style={{ marginBottom: '2rem' }}>
              <h2>Overall Inventory Summary</h2>
              {/* Summary rendering remains the same */}
              {summary ? (
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                  <li style={{ border: '1px solid var(--color-border-soft)', padding: '1rem', borderRadius: 'var(--border-radius)' }}>
                    <strong>Total Unique Items:</strong> <span style={{fontSize: '1.5em', fontWeight: 'bold', display: 'block'}}>{summary.totalUniqueItems}</span>
                  </li>
                  <li style={{ border: '1px solid var(--color-border-soft)', padding: '1rem', borderRadius: 'var(--border-radius)' }}>
                    <strong>Total Stock Quantity:</strong> <span style={{fontSize: '1.5em', fontWeight: 'bold', display: 'block'}}>{summary.totalStockQuantity} units</span>
                  </li>
                  <li style={{ border: '1px solid var(--color-border-soft)', padding: '1rem', borderRadius: 'var(--border-radius)' }}>
                    <strong>Estimated Total Value:</strong> <span style={{fontSize: '1.5em', fontWeight: 'bold', display: 'block'}}>{formatCurrency(summary.estimatedTotalValue)}</span>
                  </li>
                </ul>
              ) : <p>Could not load summary data.</p>}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                <section className="card chart-card">
                    {/* Render chart if its datasets array exists and has data */}
                    {categoryChartData.datasets && categoryChartData.datasets[0]?.data.length > 0 ? (
                         <div style={{ height: '350px', position: 'relative' }}>
                            <Doughnut options={categoryChartOptions} data={categoryChartData} />
                         </div>
                    ) : <p style={{textAlign: 'center', padding: '2rem'}}>No category data to display.</p>}
                </section>

                <section className="card chart-card">
                     {storageChartData.datasets && storageChartData.datasets[0]?.data.length > 0 ? (
                        <div style={{ height: '350px', position: 'relative' }}>
                            <Pie options={storageChartOptions} data={storageChartData} />
                        </div>
                    ) : <p style={{textAlign: 'center', padding: '2rem'}}>No storage location data to display.</p>}
                </section>
            </div>

            <section className="card">
              {lowStockChartData.datasets && lowStockChartData.datasets[0]?.data.length > 0 ? (
                <div style={{maxHeight: '500px', overflowY: 'auto', paddingRight: '15px'}}>
                    <Bar options={lowStockChartOptions} data={lowStockChartData} />
                </div>
              ) : (
                <>
                    <h2>{`Low Stock Items (Quantity < 10)`}</h2>
                    <p>No items found with stock quantity less than 10.</p>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
export default AnalyticsPage;