// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// --- Import Page Components ---
import LoginPage from './LoginPage';
import Layout from './Layout'; // The main layout with Sidebar
import DashboardPage from './DashboardPage'; // Your new dashboard
import ItemManagementPage from './ItemManagementPage'; // Manages ItemForm and ItemList
import ProductFormPage from './ProductFormPage';

// Import existing admin pages
import AnalyticsPage from './AnalyticsPage';
import BulkUpdatePage from './BulkUpdatePage';
import InitialImportPage from './InitialImportPage';
import CustomerManagementPage from './CustomerManagementPage';
import CustomerFormPage from './CustomerFormPage';
import DataManagementPage from './DataManagementPage';

// Placeholder pages for future sidebar links (optional, for testing navigation)
// const UsersPage = () => <div className="container page-container" style={{padding: '20px'}}><h1 style={{textAlign: 'left'}}>Users Management (WIP)</h1></div>;
// const CategoriesPage = () => <div className="container page-container" style={{padding: '20px'}}><h1 style={{textAlign: 'left'}}>Categories (WIP)</h1></div>;
// const OrdersPage = () => <div className="container page-container" style={{padding: '20px'}}><h1 style={{textAlign: 'left'}}>Orders (WIP)</h1></div>;
// const SuppliersPage = () => <div className="container page-container" style={{padding: '20px'}}><h1 style={{textAlign: 'left'}}>Suppliers (WIP)</h1></div>;
// const ProfilePage = () => <div className="container page-container" style={{padding: '20px'}}><h1 style={{textAlign: 'left'}}>User Profile (WIP)</h1></div>;

// --- Protected Route Component ---
// This component remains unchanged from your existing code.
// It ensures that a user is logged in before accessing certain routes.
function ProtectedRoute({ user, children }) {
    const location = useLocation();
    if (!user) {
        // If no user, redirect to login, saving the intended location
        console.log("ProtectedRoute: No user found, redirecting to /login");
        return <Navigate to="/login" state={{ from: location }} replace />;
    }
    // If user exists, render the children components (the protected page)
    return children;
}

// --- Main Router Component ---
// This is the component you will export as default.
// It manages the overall application routing and authentication state.
function AppRouter() {
    const [currentUser, setCurrentUser] = useState(null);
    const [authChecked, setAuthChecked] = useState(false); // To show loading until auth is checked

    // Effect to check authentication status when the app loads
    useEffect(() => {
        const checkAuth = async () => {
            console.log("AppRouter: Checking initial authentication status...");
            try {
                // Attempt to get the current user from the backend (Electron main process)
                const user = await window.electronAPI.getCurrentUser();
                console.log("AppRouter: Received current user:", user);
                setCurrentUser(user || null); // Set user or null if no user
            } catch (error) {
                console.error("Error checking auth status:", error);
                setCurrentUser(null); // Ensure currentUser is null on error
            } finally {
                setAuthChecked(true); // Mark authentication check as complete
            }
        };
        checkAuth();
    }, []); // Empty dependency array means this runs once on component mount

    // Callback function for successful login
    const handleLoginSuccess = (user) => {
        console.log("AppRouter: Login successful, setting user:", user);
        setCurrentUser(user);
    };

    // Callback function for logout
    const handleLogout = () => {
        console.log("AppRouter: Logout requested, clearing user.");
        setCurrentUser(null);
        // Note: Navigation to /login after logout will be handled by either
        // the Sidebar component itself or by ProtectedRoute redirecting.
    };

    // Show a loading message until the initial authentication check is complete
    if (!authChecked) {
        return <div style={{ textAlign: 'center', padding: '3rem', fontSize: '1.2em' }}>Checking authentication...</div>;
    }

    // --- Define Routes ---
    return (
        <Router>
            <Routes>

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
                    {/* Child routes of Layout. These will render inside Layout's <Outlet /> */}
                    <Route path="/" element={<DashboardPage />} /> {/* Default page after login */}
                    <Route path="/products" element={<ItemManagementPage currentUser={currentUser} />} />

                    {/* Admin Only Routes: Conditionally render these routes */}
                    {/* These routes are only defined if the currentUser has the 'admin' role. */}
                     <Route path="/products/new" element={<ProductFormPage currentUser={currentUser} />} />
                                        <Route path="/products/:id/edit" element={<ProductFormPage currentUser={currentUser} />} />
                    {currentUser?.role === 'admin' && (
                        <>
                            <Route path="/analytics" element={<AnalyticsPage />} />
                            <Route path="/bulk-update" element={<BulkUpdatePage />} />
                            <Route path="/data-management" element={<DataManagementPage />} />
                            <Route path="/initial-import" element={<InitialImportPage />} />
                            <Route path="/customers" element={<CustomerManagementPage currentUser={currentUser} />} />
                            <Route path="/customers/new" element={<CustomerFormPage currentUser={currentUser} />} />
                            <Route path="/customers/:id/edit" element={<CustomerFormPage currentUser={currentUser} />} />
                        </>
                    )}

                </Route>

                {/* Catch-all Route */}
                {/* If no other route matches, redirect to the main page if logged in, or to login if not. */}
                <Route path="*" element={<Navigate to={currentUser ? "/" : "/login"} replace />} />

            </Routes>
        </Router>
    );
}

// Export the main router component
export default AppRouter;