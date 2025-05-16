// src/DashboardPage.js
import React, { useState, useEffect } from 'react';
import './DashboardPage.css';
import {
    FaBell, FaUserCircle, FaPumpSoap, FaClipboardList, FaArrowDown
} from 'react-icons/fa'; // FaDollarSign might be implicitly used by formatCurrency
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js';
import { formatDistanceToNow } from 'date-fns';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
);

const formatCurrency = (value, currency = 'PHP') => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
};

function DashboardPage({ currentUser }) {
  const [totalProducts, setTotalProducts] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0); // This will be updated by the backend
  const [todaysSalesValue, setTodaysSalesValue] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [activityLog, setActivityLog] = useState([]);
  const [categoryOverviewChartData, setCategoryOverviewChartData] = useState({ labels: [], datasets: [] });

  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [isLogLoading, setIsLogLoading] = useState(true);
  const [logError, setLogError] = useState(null);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [chartError, setChartError] = useState(null);
  const [chartProxyInfo, setChartProxyInfo] = useState('');

  // Fetch Core Stats
  useEffect(() => {
    let isMounted = true;
    const fetchDashboardStats = async () => {
      setIsLoadingStats(true);
      setStatsError(null);
      console.log("Dashboard: Fetching all dashboard stats (multi-location aware)...");
      try {
        const [summaryRes, lowStockRes, salesRes, ordersRes] = await Promise.all([
          window.electronAPI.getInventorySummary(),
          window.electronAPI.getLowStockItems(), // This call needs to return the accurate count
          window.electronAPI.getTodaysSalesTotal(),
          window.electronAPI.getNewOrdersCount()
        ]);

        if (!isMounted) return;

        if (summaryRes.success && summaryRes.summary) {
            setTotalProducts(summaryRes.summary.totalUniqueItems || 0);
        } else {
            throw new Error(summaryRes.message || 'Failed to load total products');
        }

        // The accuracy of lowStockCount depends on what lowStockRes.items.length is
        if (lowStockRes.success && Array.isArray(lowStockRes.items)) {
            setLowStockCount(lowStockRes.items.length || 0);
        } else {
            throw new Error(lowStockRes.message || 'Failed to load low stock count');
        }

        if (salesRes.success) setTodaysSalesValue(salesRes.total || 0);
        else console.warn("Dashboard: Sales data might be placeholder.", salesRes.message);


        if (ordersRes.success) setNewOrdersCount(ordersRes.count || 0);
        else console.warn("Dashboard: New orders data might be placeholder.", ordersRes.message);

      } catch (err) {
        console.error("Dashboard: Error fetching stats:", err);
        if (isMounted) setStatsError(err.message || "Failed to load dashboard statistics.");
      } finally {
        if (isMounted) setIsLoadingStats(false);
      }
    };
    fetchDashboardStats();
    return () => { isMounted = false; };
  }, []);

  // Fetch Data for Category Overview Chart
  useEffect(() => {
    let isMounted = true;
    const fetchChartData = async () => {
        setIsChartLoading(true);
        setChartError(null);
        setChartProxyInfo('');
        console.log("Dashboard: Fetching category overview chart data (multi-location aware)...");
        try {
            const result = await window.electronAPI.getInventoryByCategory();
            if (!isMounted) return;

            if (result.success && Array.isArray(result.data)) {
                console.log("Dashboard: Received category overview data:", result.data);
                setCategoryOverviewChartData({
                    labels: result.data.map(cat => cat.category || 'Uncategorized'),
                    datasets: [{
                        label: 'Total Quantity by Category',
                        data: result.data.map(cat => cat.total_quantity || 0),
                        borderColor: 'var(--color-accent-secondary, #7986CB)',
                        backgroundColor: 'rgba(121, 134, 203, 0.2)',
                        tension: 0.3,
                        fill: true,
                    }],
                });
            } else {
                 throw new Error(result.message || "Failed to load category overview chart data.");
            }
        } catch (err) {
            console.error("Dashboard: Error fetching category chart data:", err);
             if (isMounted) setChartError(err.message || "Could not load category chart data.");
        } finally {
            if (isMounted) setIsChartLoading(false);
        }
    };
    fetchChartData();
    return () => { isMounted = false; };
  }, []);


  // Activity Log Effect
  useEffect(() => {
    let isMounted = true;
    let cleanupListener = () => {};
    setIsLogLoading(true);
    setLogError(null);

    const fetchLogs = async () => {
        console.log("Dashboard: Fetching initial activity log...");
        try {
            const logs = await window.electronAPI.getActivityLog();
            if (isMounted) {
                setActivityLog(logs || []);
            }
        } catch (err) {
            if (isMounted) setLogError("Failed to load activity log.");
        } finally {
            if (isMounted) setIsLogLoading(false);
        }
    };
    fetchLogs();

    try {
        const removeListener = window.electronAPI.onNewLogEntry((newEntry) => {
            if (isMounted) {
                setActivityLog(prevLog => [newEntry, ...prevLog.slice(0, 49)]);
            }
        });
        if (typeof removeListener === 'function') {
            cleanupListener = removeListener;
        } else {
            console.warn("Dashboard: onNewLogEntry did not return a cleanup function.");
        }
    } catch (listenerError) {
        if (isMounted) setLogError("Failed to set up real-time log updates.");
    }
    return () => {
        isMounted = false;
        if (typeof cleanupListener === 'function') {
            cleanupListener();
        }
    };
  }, []);

  const lineChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: 'var(--color-text-medium)', usePointStyle: true, boxWidth: 8, padding: 20 }},
      title: { display: false },
      tooltip: { backgroundColor: 'rgba(0,0,0,0.7)', titleFont: { size: 14 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 4 }
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: 'var(--color-text-light)'}, grid: { color: 'var(--color-border-soft)'}, title: {display: true, text: 'Aggregated Quantity'} },
      x: { ticks: { color: 'var(--color-text-light)'}, grid: { display: false }, title: {display: true, text: 'Category'} },
    },
    elements: { line: { borderWidth: 2 }, point: { radius: 4, hoverRadius: 6 } }
  };

  const formatLogTime = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) { return 'Invalid date'; }
  };


  if (isLoadingStats) {
    return <div className="container page-container analytics-loading">Loading dashboard data...</div>;
  }

  return (
    <div className="dashboard-layout">
        <div className="dashboard-main-content container page-container">
          <header className="dashboard-header">
            <div>
                <h1 className="welcome-title">WELCOME {currentUser?.username?.toUpperCase() || 'USER'}!</h1>
                <p className="welcome-subtitle">BIOSKIN INVENTORY</p>
            </div>
            <div className="top-bar-icons"><FaBell /><FaUserCircle /></div>
          </header>

          {statsError && <div className="analytics-error card" style={{marginBottom:'1.5rem'}}>Error loading core stats: {statsError}</div>}

          <div className="stat-cards-grid">
            <div className="card stat-card">
              <div className="stat-icon icon-total-products"><FaPumpSoap /></div>
              <div className="stat-info">
                <span>{isLoadingStats ? '...' : totalProducts}</span>
                <p>total active products</p>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon icon-todays-sales">₱</div>
              <div className="stat-info">
                <span>{isLoadingStats ? '...' : formatCurrency(todaysSalesValue)}</span>
                <p>today's sales value</p>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon icon-new-orders"><FaClipboardList /></div>
              <div className="stat-info">
                <span>{isLoadingStats ? '...' : newOrdersCount}</span>
                <p>new orders today</p>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon icon-low-stock"><FaArrowDown /></div>
              <div className="stat-info">
                <span>{isLoadingStats ? '...' : lowStockCount}</span>
                <p>items in low stock</p>
              </div>
            </div>
          </div>

          <div className="card info-card chart-container">
            <h3>Inventory Overview by Category {chartProxyInfo && <span style={{fontSize: '0.8em', fontWeight: 'normal', color: 'var(--color-text-medium)'}}>{chartProxyInfo}</span>}</h3>
            <div style={{ height: '350px' }} className="chart-wrapper">
                {isChartLoading && <p className="no-data-message">Loading chart data...</p>}
                {chartError && <p className="no-data-message analytics-error" style={{border:'none', padding:0}}>{chartError}</p>}
                {!isChartLoading && !chartError && categoryOverviewChartData.datasets && categoryOverviewChartData.datasets.length > 0 && categoryOverviewChartData.datasets[0].data.length > 0 ? (
                    <Line options={lineChartOptions} data={categoryOverviewChartData} />
                ) : (
                    !isChartLoading && !chartError && <p className="no-data-message">No category data available for chart.</p>
                )}
            </div>
          </div>
        </div>

        <aside className="activity-log-panel card">
            <h3>Activity Log</h3>
            {isLogLoading && <p className="no-data-message">Loading activity...</p>}
            {logError && <p className="no-data-message analytics-error" style={{border:'none', padding:0}}>{logError}</p>}
            {!isLogLoading && !logError && activityLog.length > 0 ? (
                <ul>
                    {activityLog.map(log => (
                        <li key={log.id}>
                            <span className="log-time" title={new Date(log.timestamp).toLocaleString()}>{formatLogTime(log.timestamp)}</span>
                            <div>
                                <span className="log-user">{log.user}:</span>
                                <span className="log-action">{log.action}</span>
                                {log.details && <span className="log-details">{log.details}</span>}
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                 !isLogLoading && !logError && <p className="no-data-message">No recent activity.</p>
            )}
        </aside>
    </div>
  );
}
export default DashboardPage;