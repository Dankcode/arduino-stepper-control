import React, { useState, useEffect } from 'react';

const StepperMotorControl = () => {
  // State management for UI and API status
  const [steps, setSteps] = useState(400);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // The base URL must match the Flask server configuration
  const API_BASE = 'http://192.168.1.9:5000/api';

  // --- API Functions ---

  // Check connection status on component mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      // Endpoint: GET /api/status (Returns {connected: bool, current_steps: int})
      const response = await fetch(`${API_BASE}/status`);
      const data = await response.json();
      setConnected(data.connected);
      setSteps(data.current_steps);
      // Optional: Display connection port in message if connected
      if (data.connected) {
        setMessage(`Connected to Arduino via port: ${data.port || 'Unknown'}`);
      }
    } catch (error) {
      setMessage('Failed to connect to backend (Is Python API running?)');
      console.error('Status check failed:', error);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      // Endpoint: POST /api/connect
      const response = await fetch(`${API_BASE}/connect`, {
        method: 'POST',
      });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) {
        setConnected(true);
      }
    } catch (error) {
      setMessage('Failed to connect to Arduino (Check port/logs)');
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      // Endpoint: POST /api/disconnect
      const response = await fetch(`${API_BASE}/disconnect`, {
        method: 'POST',
      });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) {
        setConnected(false);
      }
    } catch (error) {
      setMessage('Failed to disconnect cleanly');
    }
    setLoading(false);
  };

  const updateSteps = async () => {
    try {
      // Endpoint: POST /api/steps
      const response = await fetch(`${API_BASE}/steps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Ensure steps is sent as an integer
        body: JSON.stringify({ steps: parseInt(steps) }),
      });
      const data = await response.json();
      setMessage(data.message);
    } catch (error) {
      setMessage('Failed to update steps');
    }
  };

  const sendMotorCommand = async (endpoint) => {
    if (!connected) {
      setMessage('Arduino not connected');
      return;
    }

    setLoading(true);
    try {
      // Endpoint: POST /api/motor/<command>
      const response = await fetch(`${API_BASE}/motor/${endpoint}`, {
        method: 'POST',
      });
      const data = await response.json();
      setMessage(data.message);
      // Wait a short moment to allow the motor command to execute before finishing loading
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      setMessage(`Failed to send ${endpoint} command`);
    }
    setLoading(false);
  };

  // --- Component Render ---
  return (
    <div className="container">
      {/* Google Fonts - Inter */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* Embedded CSS for styling the single-file React component */}
      <style>{`
        body {
          margin: 0;
          font-family: 'Inter', sans-serif;
          background: linear-gradient(to bottom right, #e0e0e0, #c0c0c0);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 1rem;
          box-sizing: border-box;
        }

        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 1rem;
          box-sizing: border-box;
        }

        .card {
          background-color: #ffffff;
          padding: 2rem;
          border-radius: 1.5rem;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          width: 100%;
          max-width: 28rem;
          border: 1px solid #e2e8f0;
        }

        .title {
          font-size: 2.25rem;
          font-weight: 800;
          text-align: center;
          color: #1a202c;
          margin-bottom: 2rem;
        }

        .message-display {
          padding: 0.75rem;
          border-radius: 0.5rem;
          background-color: #f3f4f6;
          border: 1px solid #e5e7eb;
          margin-top: 1rem;
          margin-bottom: 1rem;
        }

        .message-text {
          font-size: 0.875rem;
          color: #4b5563;
        }

        .status-block, .input-section {
          margin-bottom: 1.5rem;
          padding: 0.75rem;
          border-radius: 0.5rem;
          background-color: #f9fafb;
        }

        .status-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .status-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #4a5568;
        }

        .status-indicator {
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .status-indicator.connected {
          background-color: #d1fae5;
          color: #065f46;
        }

        .status-indicator.disconnected {
          background-color: #fee2e2;
          color: #b91c1c;
        }

        .flex-buttons-group {
          display: flex;
          gap: 0.5rem;
        }

        .btn {
          padding: 0.75rem 1rem;
          font-weight: 500;
          border-radius: 0.25rem;
          transition: background-color 0.2s ease-in-out, opacity 0.2s ease-in-out;
          cursor: pointer;
          border: none;
          flex: 1;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-connect {
          background-color: #2563eb;
          color: #ffffff;
        }

        .btn-connect:hover:not(:disabled) {
          background-color: #1d4ed8;
        }

        .btn-disconnect {
          background-color: #dc2626;
          color: #ffffff;
        }

        .btn-disconnect:hover:not(:disabled) {
          background-color: #b91c1c;
        }

        .input-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #4a5568;
          margin-bottom: 0.5rem;
        }

        .input-field {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: 1px solid #cbd5e0;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-field:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
        }

        .btn-update-steps {
          padding: 0.5rem 1rem;
          background-color: #16a34a;
          color: #ffffff;
        }

        .btn-update-steps:hover {
          background-color: #15803d;
        }

        .motor-buttons-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .btn-motor {
          width: 100%;
          padding: 0.75rem 1rem;
          font-weight: 500;
          border-radius: 0.25rem;
          color: #ffffff;
          transition: background-color 0.2s ease-in-out, opacity 0.2s ease-in-out;
          cursor: pointer;
          border: none;
        }

        .btn-motor:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-motor.blue {
          background-color: #2563eb;
        }
        .btn-motor.blue:hover:not(:disabled) {
          background-color: #1d4ed8;
        }

        .btn-motor.purple {
          background-color: #9333ea;
        }
        .btn-motor.purple:hover:not(:disabled) {
          background-color: #7e22ce;
        }

        .btn-motor.green {
          background-color: #16a34a;
        }
        .btn-motor.green:hover:not(:disabled) {
          background-color: #15803d;
        }

        .btn-motor.red {
          background-color: #dc2626;
        }
        .btn-motor.red:hover:not(:disabled) {
          background-color: #b91c1c;
        }

        .btn-motor.yellow {
          background-color: #d97706;
          color: #ffffff;
        }
        .btn-motor.yellow:hover:not(:disabled) {
          background-color: #b45309;
        }

        .loading-spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top-color: #2563eb;
          border-radius: 50%;
          height: 1.5rem;
          width: 1.5rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Responsive adjustments */
        @media (max-width: 640px) {
          .card {
            padding: 1.5rem;
            border-radius: 1rem;
          }
          .title {
            font-size: 1.75rem;
            margin-bottom: 1.5rem;
          }
          .status-block, .input-section, .motor-buttons-group {
            margin-bottom: 1rem;
          }
          .btn, .input-field {
            padding: 0.6rem 0.8rem;
            font-size: 0.8rem;
          }
          .btn-motor {
            padding: 0.6rem 0.8rem;
            font-size: 0.9rem;
          }
          .status-label {
            font-size: 0.8rem;
          }
          .status-indicator {
            font-size: 0.65rem;
            padding: 0.15rem 0.4rem;
          }
        }
      `}</style>

      <div className="card">
        <h1 className="title">
          Stepper Motor Control
        </h1>

        {/* Connection Status */}
        <div className="status-block">
          <div className="status-header">
            <span className="status-label">Status:</span>
            <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex-buttons-group">
            <button
              onClick={handleConnect}
              disabled={loading || connected}
              className="btn btn-connect"
            >
              Connect
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading || !connected}
              className="btn btn-disconnect"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Step Amount Input */}
        <div className="input-section">
          <label className="input-label">
            Step Amount (Current: {steps}):
          </label>
          <div className="flex-buttons-group">
            <input
              type="number"
              // Note: Using a controlled input here, value reflects state
              value={steps} 
              onChange={(e) => setSteps(e.target.value)}
              className="input-field"
              min="1"
            />
            <button
              onClick={updateSteps}
              className="btn btn-update-steps"
            >
              Update
            </button>
          </div>
        </div>

        {/* Motor Control Buttons */}
        <div className="motor-buttons-group">
          <button
            onClick={() => sendMotorCommand('x-forward')}
            disabled={loading || !connected}
            className="btn-motor blue"
          >
            X Forward
          </button>

          <button
            onClick={() => sendMotorCommand('x-backward')}
            disabled={loading || !connected}
            className="btn-motor blue"
          >
            X Backward
          </button>

          <button
            onClick={() => sendMotorCommand('zy-forward')}
            disabled={loading || !connected}
            className="btn-motor purple"
          >
            Z+Y Forward
          </button>

          <button
            onClick={() => sendMotorCommand('zy-backward')}
            disabled={loading || !connected}
            className="btn-motor purple"
          >
            Z+Y Backward
          </button>

          <div className="flex-buttons-group">
            <button
              onClick={() => sendMotorCommand('enable')}
              disabled={loading || !connected}
              className="btn-motor green"
            >
              Enable Motors
            </button>

            <button
              onClick={() => sendMotorCommand('disable')}
              disabled={loading || !connected}
              className="btn-motor red"
            >
              Disable Motors
            </button>
          </div>

          <button
            onClick={() => sendMotorCommand('test')}
            disabled={loading || !connected}
            className="btn-motor yellow"
          >
            Test Motors
          </button>
        </div>

        {/* Message Display */}
        {message && (
          <div className="message-display">
            <p className="message-text">{message}</p>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="mt-4 text-center">
            <div className="loading-spinner"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StepperMotorControl;
