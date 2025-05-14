    // src/DashboardPage.js
    import React, { useState, useEffect } from 'react';
    import './DashboardPage.css';
    import {
        FaBell, FaUserCircle, FaPumpSoap, FaClipboardList, FaArrowDown, FaDollarSign
    } from 'react-icons/fa';
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
      // Real Data States
      const [totalProducts, setTotalProducts] = useState(0);
      const [lowStockCount, setLowStockCount] = useState(0);
      const [todaysSalesValue, setTodaysSalesValue] = useState(0); // Will be fetched
      const [newOrdersCount, setNewOrdersCount] = useState(0);   // Will be fetched

      const [activityLog, setActivityLog] = useState([]);
      const [topItemsData, setTopItemsData] = useState({ labels: [], datasets: [] }); // For the chart

      // Loading & Error States
      const [isLoadingStats, setIsLoadingStats] = useState(true);
      const [statsError, setStatsError] = useState(null);
      const [isLogLoading, setIsLogLoading] = useState(true);
      const [logError, setLogError] = useState(null);
      const [isChartLoading, setIsChartLoading] = useState(true);
      const [chartError, setChartError] = useState(null);
      const [chartProxyInfo, setChartProxyInfo] = useState(''); // Info about proxy data for chart

      // Fetch Core Stats (Total Products, Low Stock, Sales, Orders)
      useEffect(() => {
        let isMounted = true;
        setIsLoadingStats(true);
        setStatsError(null);

        const fetchDashboardStats = async () => {
          console.log("Dashboard: Fetching all dashboard stats...");
          try {
            const [summaryRes, lowStockRes, salesRes, ordersRes] = await Promise.all([
              window.electronAPI.getInventorySummary(),
              window.electronAPI.getLowStockItems(),
              window.electronAPI.getTodaysSalesTotal(), // Using new backend call
              window.electronAPI.getNewOrdersCount()    // Using new backend call
            ]);

            if (!isMounted) return;

            if (summaryRes.success) setTotalProducts(summaryRes.summary?.totalUniqueItems || 0);
            else throw new Error(summaryRes.message || 'Failed to load total products');

            if (lowStockRes.success) setLowStockCount(lowStockRes.items?.length || 0);
            else throw new Error(lowStockRes.message || 'Failed to load low stock count');

            if (salesRes.success) setTodaysSalesValue(salesRes.total || 0);
            else {
                console.warn("Dashboard: Sales data placeholder used.", salesRes.message);
                setTodaysSalesValue(salesRes.total || 0); // Use placeholder value
                // Optionally set a specific message for sales data being placeholder
            }

            if (ordersRes.success) setNewOrdersCount(ordersRes.count || 0);
            else {
                 console.warn("Dashboard: New orders data placeholder used.", ordersRes.message);
                 setNewOrdersCount(ordersRes.count || 0); // Use placeholder value
            }

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

      // Fetch Data for Top Items Chart (Using Most Stocked as Proxy)
      useEffect(() => {
        let isMounted = true;
        setIsChartLoading(true);
        setChartError(null);
        setChartProxyInfo('');

        const fetchChartData = async () => {
            console.log("Dashboard: Fetching chart data (top items proxy)...");
            try {
                const result = await window.electronAPI.getTopSellingProxy(); // Fetches most stocked
                if (!isMounted) return;

                if (result.success && result.products) {
                    console.log("Dashboard: Received chart proxy data:", result.products);
                    if (result.isProxyData) {
                        setChartProxyInfo(`(Displaying ${result.proxyType} Items)`);
                    }
                    // Group by category and sum quantities for the chart
                    const categoryQuantities = result.products.reduce((acc, product) => {
                        const category = product.category || 'Uncategorized';
                        acc[category] = (acc[category] || 0) + (product.quantity || 0);
                        return acc;
                    }, {});

                    setTopItemsData({
                        labels: Object.keys(categoryQuantities),
                        datasets: [{
                            label: result.proxyType || 'Items by Category',
                            data: Object.values(categoryQuantities),
                            borderColor: '#81D4FA', // Example color
                            backgroundColor: 'rgba(129, 212, 250, 0.2)',
                            tension: 0.3,
                            fill: true,
                        }],
                    });
                } else {
                     throw new Error(result.message || "Failed to load chart data.");
                }
            } catch (err) {
                console.error("Dashboard: Error fetching chart data:", err);
                 if (isMounted) setChartError(err.message || "Could not load chart data.");
            } finally {
                if (isMounted) setIsChartLoading(false);
            }
        };
        fetchChartData();
        return () => { isMounted = false; };
      }, []);


      // Activity Log Effect (Keep as previously implemented)
      useEffect(() => {
        let isMounted = true;
        let cleanupListener = () => {};
        setIsLogLoading(true);
        setLogError(null);

        const fetchLogs = async () => { /* ... same as before ... */
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
            cleanupListener = window.electronAPI.onNewLogEntry((newEntry) => {
                if (isMounted) {
                    setActivityLog(prevLog => [newEntry, ...prevLog].slice(0, 50));
                }
            });
        } catch (listenerError) {
            if (isMounted) setLogError("Failed to set up real-time log updates.");
        }
        return () => { isMounted = false; if (typeof cleanupListener === 'function') cleanupListener(); };
      }, []);

      const lineChartOptions = { /* ... same as before ... */
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
      const formatLogTime = (timestamp) => { /* ... same as before ... */
        try {
          return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
        } catch (e) { return 'Invalid date'; }
      };

      // Main render
      if (isLoadingStats) { // Primary loading for the page based on core stats
        return <div className="container page-container" style={{ textAlign: 'center', padding: '2rem' }}>Loading dashboard data...</div>;
      }
      if (statsError) {
        return <div className="container page-container card" style={{ color: 'var(--color-status-danger)', padding: '1rem' }}>Error loading dashboard: {statsError}</div>;
      }

      return (
        <div className="dashboard-layout">
            <div className="dashboard-main-content container page-container">
              <header className="dashboard-header">
                <div>
                    <h1 className="welcome-title">WELCOME {currentUser?.username?.toUpperCase() || 'USER'}!</h1>
                    <p className="welcome-subtitle">BIOSKIN INVENTORY</p>
                </div>
              </header>

              <div className="stat-cards-grid">
                {/* Total Products */}
                <div className="card stat-card">
                  <div className="stat-icon icon-total-products"><FaPumpSoap /></div>
                  <div className="stat-info">
                    <span>{totalProducts}</span>
                    <p>total products</p>
                  </div>
                </div>
                {/* Today's Sales */}
                <div className="card stat-card">
                  <div className="stat-icon icon-todays-sales" style={{fontWeight: 700, fontSize: '2em'}}>₱</div>
                  <div className="stat-info">
                    <span>{formatCurrency(todaysSalesValue)}</span>
                    <p>today's sales <em style={{fontSize:'0.8em', color:'var(--color-text-light)'}}></em></p>
                  </div>
                </div>
                {/* New Orders */}
                <div className="card stat-card">
                  <div className="stat-icon icon-new-orders"><FaClipboardList /></div>
                  <div className="stat-info">
                    <span>{newOrdersCount}</span>
                    <p>new orders <em style={{fontSize:'0.8em', color:'var(--color-text-light)'}}></em></p>
                  </div>
                </div>
                {/* Low Stock */}
                <div className="card stat-card">
                  <div className="stat-icon icon-low-stock"><FaArrowDown /></div>
                  <div className="stat-info">
                    <span>{lowStockCount}</span>
                    <p>in low stock</p>
                  </div>
                </div>
              </div>

              <div className="card info-card chart-container">
                <h3>Items by Category Overview {chartProxyInfo && <span style={{fontSize: '0.8em', fontWeight: 'normal', color: 'var(--color-text-medium)'}}>{chartProxyInfo}</span>}</h3>
                <div style={{ height: '350px' }}>
                    {isChartLoading && <p style={{textAlign: 'center', paddingTop: '50px'}}>Loading chart data...</p>}
                    {chartError && <p style={{textAlign: 'center', paddingTop: '50px', color: 'var(--color-status-danger)'}}>Error: {chartError}</p>}
                    {!isChartLoading && !chartError && topItemsData.datasets && topItemsData.datasets.length > 0 && topItemsData.datasets[0].data.length > 0 ? (
                        <Line options={lineChartOptions} data={topItemsData} />
                    ) : (
                        !isChartLoading && !chartError && <p style={{textAlign: 'center', paddingTop: '50px', color: 'var(--color-text-light)'}}>No data available for chart.</p>
                    )}
                </div>
              </div>
            </div>

            <aside className="activity-log-panel card">
                <h3>Activity Log</h3>
                {isLogLoading && <p className="no-data-message">Loading activity...</p>}
                {logError && <p className="no-data-message" style={{color: 'var(--color-status-danger)'}}>{logError}</p>}
                {!isLogLoading && !logError && activityLog.length > 0 ? (
                    <ul>
                        {activityLog.map(log => (
                            <li key={log.id}>
                                <span className="log-time" title={new Date(log.timestamp).toLocaleString()}>{formatLogTime(log.timestamp)}</span>
                                <div>
                                    <span className="log-user">{log.user}:</span>
                                    <span className="log-action">{log.action}</span>
                                    {log.details && <span style={{ display: 'block', fontSize: '0.85em', color: 'var(--color-text-light)', marginTop: '3px' }}>{log.details}</span>}
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