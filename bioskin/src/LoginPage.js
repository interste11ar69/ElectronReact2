// src/LoginPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

// Assuming your logo is named logo.png in the assets folder
import bioskinLogo from './assets/logo.png';

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setIsLoading(true); // Set loading at the start

    if (!username || !password) {
      setError('Please enter both username and password.');
      setIsLoading(false); // Reset for client-side validation error
      return;
    }

    try {
      const result = await window.electronAPI.login({ username, password });
      if (result.success) {
        onLoginSuccess(result.user);
        navigate('/');
        // No need to set isLoading to false here if navigating away,
        // but it doesn't hurt if finally block does it.
      } else {
        setError(result.message || 'Login failed. Please check your credentials.');
        console.error('Login failed:', result);
        // setIsLoading(false); // Moved to finally
      }
    } catch (err) {
      setError('An error occurred during login. ' + (err.message || 'Please try again.'));
      console.error('IPC Login error:', err);
      // setIsLoading(false); // Moved to finally
    } finally {
      // This block will execute regardless of whether the try succeeded or an error was caught
      setIsLoading(false); // <<< --- ADD THIS LINE (or ensure it's here)
    }
  };

  return (
    <div className="login-page-container">
      {/* Left Panel */}
      <div className="login-left-panel">
        <div className="login-branding">
          <img src={bioskinLogo} alt="Bioskin Logo" className="login-logo" />
          <h1>BIOSKIN INVENTORY</h1>
        </div>
      </div>

      {/* Right Panel (Login Form) */}
      <div className="login-right-panel">
        <div className="login-form-container">
          <h2>LOGIN</h2>
          <form onSubmit={handleLogin}>
            {error && <div className="login-error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="button button-login" disabled={isLoading}>
                {isLoading ? 'Logging In...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;