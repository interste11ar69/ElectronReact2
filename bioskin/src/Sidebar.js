// src/Sidebar.js
import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';
import {
    FaTachometerAlt, FaBoxOpen, FaAddressBook, // Existing main icons
    FaChartBar,                                 // For Analytics
    FaDatabase,                                 // New icon for Data Management
    FaSignOutAlt,                                // For Logout
    FaUndo,
     FaHistory
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
          { path: '/returns/process', label: 'Process Return', icon: <FaUndo /> },
          { path: '/returns', label: 'Return History', icon: <FaHistory /> },
      ];

      const adminToolsLinks = [
          { path: '/analytics', label: 'Analytics', icon: <FaChartBar />, adminOnly: true },
          { path: '/data-management', label: 'Data Management', icon: <FaDatabase />, adminOnly: true },
      ];

      // --- Helper function to render a list of links ---
      const renderLinkList = (linksArray) => {
          return linksArray.map(link => {
              // Skip rendering check remains the same
              if (link.adminOnly && currentUser?.role !== 'admin') {
                  return null;
              }

              // *** 2. REMOVE the manual isActive calculation ***
              // const isActive = location.pathname === link.path ||
              //                  (link.path !== '/' && location.pathname.startsWith(link.path));

              return (
                   // *** 3. Use NavLink and its className prop ***
                  <li key={link.path}> {/* Keep key on the li */}
                      <NavLink
                          to={link.path}
                          // *** 4. Add the 'end' prop to parent/exact match routes ***
                          // Ensures the link is active only on exact match for these paths
                          end={['/', '/products', '/customers', '/returns', '/analytics', '/data-management'].includes(link.path)}
                          className={({ isActive }) => isActive ? 'active' : ''} // Use NavLink's built-in state
                      >
                          {link.icon}
                          <span>{link.label}</span>
                      </NavLink>
                  </li>
              );
          });
      };

      // The rest of the component remains the same...
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