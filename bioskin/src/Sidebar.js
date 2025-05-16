// src/Sidebar.js
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom'; // useLocation is not strictly needed if NavLink handles active state
import './Sidebar.css';
import {
    FaTachometerAlt, FaBoxOpen, FaAddressBook,
    FaChartBar,
    FaDatabase,
    FaSignOutAlt,
    FaUndo,
    FaHistory,
    FaSlidersH,
    FaBoxes,
    FaFileInvoiceDollar, // For Sales Orders list
    FaCartPlus,
    FaListAlt,
    FaExchangeAlt
    // Optional: For direct "New Sales Order" link
} from 'react-icons/fa';
import appLogo from './assets/logo.png';

function Sidebar({ onLogout, currentUser }) {
  const navigate = useNavigate();
  // const location = useLocation(); // NavLink's isActive prop can handle active state

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
          { path: '/returns/process', label: 'Process Return', icon: <FaUndo /> },
          { path: '/inventory-movements', label: 'Stock Ledger', icon: <FaListAlt /> },
      ];

      const adminToolsLinks = [
          { path: '/analytics', label: 'Analytics', icon: <FaChartBar />, adminOnly: true },
          { path: '/data-management', label: 'Data Management', icon: <FaDatabase />, adminOnly: true },
          { path: '/stock-adjustment', label: 'Stock Adjustments', icon: <FaSlidersH />, adminOnly: true },
          { path: '/bundles', label: 'Bundles/Kits', icon: <FaBoxes />, adminOnly: true },
          { path: '/stock-transfer', label: 'Stock Transfer', icon: <FaExchangeAlt />, adminOnly: true },
      ];

      // --- Helper function to render a list of links ---
      const renderLinkList = (linksArray) => {
          return linksArray.map(link => {
              if (link.adminOnly && currentUser?.role !== 'admin') {
                  return null;
              }

              // Define paths that should have exact matching for active state
              const exactMatchPaths = [
                  '/',
                  '/products',
                  '/customers',
                  '/returns',      // Add returns list page
                  '/analytics',
                  '/data-management',
                  '/stock-adjustment',
                  '/bundles'
              ];
              // Note: '/returns/process' and '/sales-orders/new' (if added) usually don't need 'end'
              // if you want their parent list link to remain somewhat active.
              // NavLink default behavior handles this fairly well. Test to confirm.

              return (
                  <li key={link.path}>
                      <NavLink
                          to={link.path}
                          end={exactMatchPaths.includes(link.path)} // Use 'end' for exact match on specified paths
                          className={({ isActive }) => isActive ? 'active' : ''} // NavLink handles active class
                      >
                          {link.icon}
                          <span>{link.label}</span>
                      </NavLink>
                  </li>
              );
          });
      };

      return (
          <div className="sidebar">
              <div className="sidebar-header">
                  <img src={appLogo} alt="Bioskin Logo" className="sidebar-logo" />
                  <h3>Bioskin IMS</h3>
              </div>
              <nav className="sidebar-nav">
                  <p className="nav-section-title">Main Menu</p>
                  <ul>
                      {renderLinkList(mainNavLinks)}
                  </ul>

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