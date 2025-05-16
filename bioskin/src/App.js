// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// --- Import Page Components ---
import LoginPage from './LoginPage';
import Layout from './Layout';
import DashboardPage from './DashboardPage';
import ItemManagementPage from './ItemManagementPage';
import ProductFormPage from './ProductFormPage';
import SalesOrderListPage from './SalesOrderListPage';
import SalesOrderFormPage from './SalesOrderFormPage';
import AnalyticsPage from './AnalyticsPage';
import BulkUpdatePage from './BulkUpdatePage';
import InitialImportPage from './InitialImportPage';
import CustomerManagementPage from './CustomerManagementPage';
import CustomerFormPage from './CustomerFormPage';
import DataManagementPage from './DataManagementPage';
import ReturnProcessingPage from './ReturnProcessingPage';
import ReturnListPage from './ReturnListPage';
import StockAdjustmentPage from './StockAdjustmentPage';
import BundleListPage from './BundleListPage';
import BundleFormPage from './BundleFormPage';
import InventoryMovementPage from './InventoryMovementPage';
import StockTransferPage from './StockTransferPage';


function ProtectedRoute({ user, children }) {
    const location = useLocation();
    if (!user) {
        console.log("ProtectedRoute: No user found, redirecting to /login");
        return <Navigate to="/login" state={{ from: location }} replace />;
    }
    return children;
}

function AppRouter() {
    const [currentUser, setCurrentUser] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            console.log("AppRouter: Checking initial authentication status...");
            try {
                const user = await window.electronAPI.getCurrentUser();
                console.log("AppRouter: Received current user:", user);
                setCurrentUser(user || null);
            } catch (error) {
                console.error("Error checking auth status:", error);
                setCurrentUser(null);
            } finally {
                setAuthChecked(true);
            }
        };
        checkAuth();
    }, []);

    const handleLoginSuccess = (user) => {
        console.log("AppRouter: Login successful, setting user:", user);
        setCurrentUser(user);
    };

    const handleLogout = () => {
        console.log("AppRouter: Logout requested, clearing user.");
        setCurrentUser(null);
    };

    if (!authChecked) {
        return <div style={{ textAlign: 'center', padding: '3rem', fontSize: '1.2em' }}>Checking authentication...</div>;
    }

    return (
        <Router>
            <Routes> {/* Single top-level Routes component */}

                <Route
                    path="/login"
                    element={
                        currentUser ? <Navigate to="/" replace /> : <LoginPage onLoginSuccess={handleLoginSuccess} />
                    }
                />
                <Route
                    element={
                        <ProtectedRoute user={currentUser}>
                            <Layout currentUser={currentUser} onLogout={handleLogout} />
                        </ProtectedRoute>
                    }
                >
                    {/* Child routes of Layout */}
                    <Route path="/" element={<DashboardPage currentUser={currentUser} />} />
                    <Route path="/products" element={<ItemManagementPage currentUser={currentUser} />} />
                    <Route path="/products/new" element={<ProductFormPage currentUser={currentUser} />} />
                    <Route path="/products/:id/edit" element={<ProductFormPage currentUser={currentUser} />} />
                    <Route path="/customers" element={<CustomerManagementPage currentUser={currentUser} />} />
                    <Route path="/customers/new" element={<CustomerFormPage currentUser={currentUser} />} />
                    <Route path="/customers/:id/edit" element={<CustomerFormPage currentUser={currentUser} />} />
                    <Route path="/returns/process" element={<ReturnProcessingPage currentUser={currentUser} />} /> {/* Added currentUser prop */}
                    <Route path="/returns" element={<ReturnListPage />} />
                    <Route path="/inventory-movements" element={<InventoryMovementPage currentUser={currentUser} />} />


                    {/* Admin Only Routes: */}
                    {currentUser?.role === 'admin' && (
                        <>
                            <Route path="/analytics" element={<AnalyticsPage />} />
                            <Route path="/bulk-update" element={<BulkUpdatePage />} />
                            <Route path="/data-management" element={<DataManagementPage />} />
                            <Route path="/initial-import" element={<InitialImportPage />} />
                            <Route path="/stock-adjustment" element={<StockAdjustmentPage currentUser={currentUser} />} />
                            <Route path="/bundles" element={<BundleListPage currentUser={currentUser} />} />
                            <Route path="/bundles/new" element={<BundleFormPage currentUser={currentUser} />} />
                            <Route path="/bundles/:id/edit" element={<BundleFormPage currentUser={currentUser} />} />
                            <Route path="/stock-transfer" element={<StockTransferPage currentUser={currentUser} />} />
                        </>
                    )}
                </Route>

                <Route path="*" element={<Navigate to={currentUser ? "/" : "/login"} replace />} />

            </Routes> {/* Correctly closed single top-level Routes component */}
        </Router>
    );
}

export default AppRouter;