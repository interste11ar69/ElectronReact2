// src/Sidebar.js
import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';
import {
    FaTachometerAlt, FaBoxOpen, FaAddressBook, // Existing main icons
    FaChartBar,                                 // For Analytics
    FaDatabase,                                 // New icon for Data Management
    FaSignOutAlt                                // For Logout
    // Removed FaPenSquare, FaFileUpload from direct imports as they are not direct sidebar links anymore
    // You can keep FaTags, FaShoppingCart, FaTruckMoving, FaUsers, FaUserCircle if you plan to use them soon
} from 'react-icons/fa';
import appLogo from './assets/logo.png'; // Make sure this path is correct or your import setup works

function Sidebar({ onLogout, currentUser }) {
  const navigate = useNavigate();
  const location = useLocation(); // To highlight active link

  const handleLogoutClick = async () => {
    try {
      await window.electronAPI.logout();
      onLogout();
      navigate('/login');
    } catch (err) {
      console.error("Sidebar Logout error:", err);
    }
  };

  // --- Navigation Links ---
  const mainNavLinks = [
    { path: '/', label: 'Dashboard', icon: <FaTachometerAlt /> },
    { path: '/products', label: 'Inventory', icon: <FaBoxOpen /> },
    { path: '/customers', label: 'Customers', icon: <FaAddressBook /> },
  ];

  // Admin Tools links now include "Data Management" which leads to the hub page.
  // "Bulk Update" and "Initial Import" are accessed *from* the Data Management page.
  const adminToolsLinks = [
    { path: '/analytics', label: 'Analytics', icon: <FaChartBar />, adminOnly: true },
    { path: '/data-management', label: 'Data Management', icon: <FaDatabase />, adminOnly: true },
    // Example for a future Users link:
    // { path: '/users', label: 'Users', icon: <FaUsers />, adminOnly: true },
  ];

  // Helper function to render a list of links
  const renderLinkList = (linksArray) => {
    return linksArray.map(link => {
      // Skip rendering if it's an admin link and the current user is not an admin
      if (link.adminOnly && currentUser?.role !== 'admin') {
        return null;
      }

      // Determine if the link should be active.
      // Active if current path exactly matches, OR
      // if current path starts with link.path (for parent routes like /data-management when on /bulk-update)
      // but ignore this for the root path '/' to prevent it from always being active.
      const isActive = location.pathname === link.path ||
                       (link.path !== '/' && location.pathname.startsWith(link.path));

      return (
        <li key={link.path} className={isActive ? 'active' : ''}>
          <Link to={link.path}>
            {link.icon}
            <span>{link.label}</span>
          </Link>
        </li>
      );
    });
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        {/* Ensure appLogo is correctly imported and accessible */}
        <img src={appLogo} alt="Bioskin Logo" className="sidebar-logo" />
        <h3>Bioskin IMS</h3>
      </div>
      <nav className="sidebar-nav">
        {/* Main Menu Section */}
        <p className="nav-section-title">Main Menu</p>
        <ul>
          {renderLinkList(mainNavLinks)}
        </ul>

        {/* Admin Tools Section (only shown if user is admin) */}
        {currentUser?.role === 'admin' && (
          <>
            <p className="nav-section-title">Admin Tools</p>
            <ul>
              {renderLinkList(adminToolsLinks)}
            </ul>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <button onClick={handleLogoutClick} className="logout-button">
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
        {currentUser && (
          <div className="sidebar-user-info">
            Logged in as: {currentUser.username} ({currentUser.role})
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;