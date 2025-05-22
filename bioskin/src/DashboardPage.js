// src/DashboardPage.js
import React, { useState, useEffect } from 'react';
import './DashboardPage.css';
import {
    FaBell, FaUserCircle, FaPumpSoap, FaArrowDown, FaUndo
} from 'react-icons/fa';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { formatDistanceToNow } from 'date-fns';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, Filler
);

// formatCurrency is not used in this file anymore after sales removal.
// You can remove it if it's not planned for other uses here.
// const formatCurrency = (value, currency = 'PHP') => {
//   return new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
// };

function DashboardPage({ currentUser }) {
  const [totalProducts, setTotalProducts] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [todaysReturnCount, setTodaysReturnCount] = useState(0);
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
      // console.log("Dashboard: Fetching all dashboard stats...");
      try {
        const [summaryRes, lowStockRes, returnsRes] = await Promise.all([
          window.electronAPI.getInventorySummary(),
          window.electronAPI.getLowStockItems(), // Fetches items where qty < threshold at STORE
          window.electronAPI.getReturns()
        ]);

        if (!isMounted) return;

        if (summaryRes.success && summaryRes.summary) {
            setTotalProducts(summaryRes.summary.totalUniqueItems || 0);
        } else {
            throw new Error(summaryRes.message || 'Failed to load total products');
        }

        if (lowStockRes.success && Array.isArray(lowStockRes.items)) {
            setLowStockCount(lowStockRes.items.length || 0);
        } else {
            throw new Error(lowStockRes.message || 'Failed to load low stock count');
        }

        let todaysCount = 0;
        if (Array.isArray(returnsRes)) {
          const now = new Date(); // Current date and time in client's local timezone (PHT)
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

          // console.log(`[Dashboard] Client's Start of Today (Local): ${startOfToday.toString()}`);
          // console.log(`[Dashboard] Client's Start of Tomorrow (Local): ${startOfTomorrow.toString()}`);
          // console.log("[Dashboard] Raw returnsRes from API:", JSON.stringify(returnsRes.slice(0, 5)));


          const todayOnly = returnsRes.filter(ret => {
            // Assuming ret.return_date is the alias for ret.created_at from the DB (a UTC string)
            if (!ret || !ret.return_date) {
                // console.warn("[Dashboard] Filtering: Skipping return due to missing object or return_date:", ret);
                return false;
            }
            try {
                const returnTimestamp = new Date(ret.return_date); // Parses UTC string

                // console.log(`[Dashboard] Return ID: ${ret.id}, Raw return_date: ${ret.return_date}, Parsed returnTimestamp (Local): ${returnTimestamp.toString()}`);
                // console.log(`[Dashboard] Is returnTimestamp >= startOfToday? ${returnTimestamp.getTime() >= startOfToday.getTime()}`);
                // console.log(`[Dashboard] Is returnTimestamp < startOfTomorrow? ${returnTimestamp.getTime() < startOfTomorrow.getTime()}`);

                return returnTimestamp.getTime() >= startOfToday.getTime() &&
                       returnTimestamp.getTime() < startOfTomorrow.getTime();
            } catch (e) {
                // console.error("[Dashboard] Filtering: Error parsing return_date for return:", ret, e);
                return false;
            }
          });
          todaysCount = todayOnly.length;
          // console.log(`[Dashboard] Filtered for today. Count: ${todaysCount}`, todayOnly.map(r => ({id: r.id, date: r.return_date })));
        } else {
            // console.warn("[Dashboard] returnsRes is not an array or is undefined:", returnsRes);
        }
        setTodaysReturnCount(todaysCount);

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
        // setChartProxyInfo(''); // Only relevant if using proxy data
        // console.log("Dashboard: Fetching category overview chart data...");
        try {
            const result = await window.electronAPI.getInventoryByCategory();
            if (!isMounted) return;

            if (result.success && Array.isArray(result.data)) {
                // console.log("Dashboard: Received category overview data:", result.data);
                setCategoryOverviewChartData({
                    labels: result.data.map(cat => cat.category || 'Uncategorized'),
                    datasets: [{
                        label: 'Total Quantity by Category', // This label is hidden by display:false in options
                        data: result.data.map(cat => cat.total_quantity || 0),
                        borderColor: 'var(--color-accent-secondary, #7986CB)',
                        backgroundColor: 'rgba(121, 134, 203, 0.2)',
                        tension: 0.3, // More relevant for line charts, but harmless for bar
                        fill: true,    // More relevant for area charts
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
        // console.log("Dashboard: Fetching initial activity log...");
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
            // console.warn("Dashboard: onNewLogEntry did not return a cleanup function.");
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

  const barChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false, // Legend is hidden
      },
      title: { display: false },
      tooltip: { backgroundColor: 'rgba(0,0,0,0.7)', titleFont: { size: 14 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 4 }
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: 'var(--color-text-light)'}, grid: { color: 'var(--color-border-soft)'}, title: {display: true, text: 'Aggregated Quantity'} },
      x: { ticks: { color: 'var(--color-text-light)'}, grid: { display: false }, title: {display: true, text: 'Category'} },
    },
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
              <div className="stat-icon icon-returned-today"><FaUndo /></div>
              <div className="stat-info">
                <span>{isLoadingStats ? '...' : todaysReturnCount}</span>
                <p>products returned today</p>
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
                    <Bar options={barChartOptions} data={categoryOverviewChartData} />
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
                            <span className="log-avatar">
                                {log.user && typeof log.user === 'string'
                                    ? log.user.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)
                                    : 'U'}
                            </span>
                            <div className="log-details-wrap">
                                <span className="log-time" title={new Date(log.timestamp).toLocaleString()}>{formatLogTime(log.timestamp)}</span>
                                <div>
                                    <span className="log-user">{log.user}:</span>
                                    <span className="log-action">{log.action}</span>
                                    {log.details && <span className="log-details">{log.details}</span>}
                                </div>
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