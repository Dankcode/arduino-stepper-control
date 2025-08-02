import React, { useState, useEffect } from 'react';

const StepperMotorControl = () => {
  const [steps, setSteps] = useState(400);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const API_BASE = 'http://localhost:5000/api';

  // Check connection status on component mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/status`);
      const data = await response.json();
      setConnected(data.connected);
      setSteps(data.current_steps);
    } catch (error) {
      setMessage('Failed to connect to backend');
      console.error('Status check failed:', error);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/connect`, {
        method: 'POST',
      });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) {
        setConnected(true);
      }
    } catch (error) {
      setMessage('Failed to connect to Arduino');
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/disconnect`, {
        method: 'POST',
      });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) {
        setConnected(false);
      }
    } catch (error) {
      setMessage('Failed to disconnect from Arduino');
    }
    setLoading(false);
  };

  const updateSteps = async () => {
    try {
      const response = await fetch(`${API_BASE}/steps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      const response = await fetch(`${API_BASE}/motor/${endpoint}`, {
        method: 'POST',
      });
      const data = await response.json();
      setMessage(data.message);
    } catch (error) {
      setMessage(`Failed to send ${endpoint} command`);
    }
    setLoading(false);
  };

  return (
    <div className="container">
      {/* Google Fonts - Inter */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <style jsx global>{`
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
          min-height: 100vh; /* Ensure it takes full viewport height for centering */
          padding: 1rem;
          box-sizing: border-box;
        }

        .card {
          background-color: #ffffff;
          padding: 2rem;
          border-radius: 1.5rem; /* 24px */
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); /* shadow-2xl */
          width: 100%;
          max-width: 28rem; /* max-w-md (448px) */
          border: 1px solid #e2e8f0; /* border-gray-200 */
        }

        .title {
          font-size: 2.25rem; /* 3xl */
          font-weight: 800; /* font-extrabold */
          text-align: center;
          color: #1a202c; /* gray-900 */
          margin-bottom: 2rem; /* mb-8 */
        }

        .message-display {
          padding: 0.75rem; /* p-3 */
          border-radius: 0.5rem; /* rounded-lg */
          background-color: #f3f4f6; /* gray-100 */
          border: 1px solid #e5e7eb; /* border */
          margin-top: 1rem; /* mt-4 */
          margin-bottom: 1rem; /* mb-4 */
        }

        .message-text {
          font-size: 0.875rem; /* text-sm */
          color: #4b5563; /* gray-700 */
        }

        .status-block, .input-section {
          margin-bottom: 1.5rem; /* mb-6 */
          padding: 0.75rem; /* p-3 */
          border-radius: 0.5rem; /* rounded-lg */
          background-color: #f9fafb; /* gray-50 */
        }

        .status-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem; /* mb-2 */
        }

        .status-label {
          font-size: 0.875rem; /* text-sm */
          font-weight: 500; /* font-medium */
          color: #4a5568; /* gray-700 */
        }

        .status-indicator {
          padding: 0.25rem 0.5rem; /* px-2 py-1 */
          border-radius: 0.25rem; /* rounded */
          font-size: 0.75rem; /* text-xs */
          font-weight: 500; /* font-medium */
        }

        .status-indicator.connected {
          background-color: #d1fae5; /* green-100 */
          color: #065f46; /* green-800 */
        }

        .status-indicator.disconnected {
          background-color: #fee2e2; /* red-100 */
          color: #b91c1c; /* red-800 */
        }

        .flex-buttons-group {
          display: flex;
          gap: 0.5rem; /* space-x-2 */
        }

        .btn {
          padding: 0.75rem 1rem; /* px-3 py-2 */
          font-weight: 500; /* font-medium */
          border-radius: 0.25rem; /* rounded */
          transition: background-color 0.2s ease-in-out, opacity 0.2s ease-in-out;
          cursor: pointer;
          border: none;
          flex: 1; /* flex-1 */
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-connect {
          background-color: #2563eb; /* blue-600 */
          color: #ffffff;
        }

        .btn-connect:hover:not(:disabled) {
          background-color: #1d4ed8; /* blue-700 */
        }

        .btn-disconnect {
          background-color: #dc2626; /* red-600 */
          color: #ffffff;
        }

        .btn-disconnect:hover:not(:disabled) {
          background-color: #b91c1c; /* red-700 */
        }

        .input-label {
          display: block;
          font-size: 0.875rem; /* text-sm */
          font-weight: 500; /* font-medium */
          color: #4a5568; /* gray-700 */
          margin-bottom: 0.5rem; /* mb-2 */
        }

        .input-field {
          flex: 1; /* flex-1 */
          padding: 0.5rem 0.75rem; /* px-3 py-2 */
          border: 1px solid #cbd5e0; /* border-gray-300 */
          border-radius: 0.25rem; /* rounded */
          font-size: 0.875rem; /* text-sm */
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-field:focus {
          border-color: #3b82f6; /* blue-500 */
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5); /* focus:ring-2 focus:ring-blue-500 */
        }

        .btn-update-steps {
          padding: 0.5rem 1rem; /* px-4 py-2 */
          background-color: #16a34a; /* green-600 */
          color: #ffffff;
        }

        .btn-update-steps:hover {
          background-color: #15803d; /* green-700 */
        }

        .motor-buttons-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem; /* space-y-3 */
          margin-bottom: 1.5rem; /* mb-6 */
        }

        .btn-motor {
          width: 100%; /* w-full */
          padding: 0.75rem 1rem; /* px-4 py-3 */
          font-weight: 500; /* font-medium */
          border-radius: 0.25rem; /* rounded */
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
          background-color: #2563eb; /* blue-600 */
        }
        .btn-motor.blue:hover:not(:disabled) {
          background-color: #1d4ed8; /* blue-700 */
        }

        .btn-motor.purple {
          background-color: #9333ea; /* purple-600 */
        }
        .btn-motor.purple:hover:not(:disabled) {
          background-color: #7e22ce; /* purple-700 */
        }

        .btn-motor.green {
          background-color: #16a34a; /* green-600 */
        }
        .btn-motor.green:hover:not(:disabled) {
          background-color: #15803d; /* green-700 */
        }

        .btn-motor.red {
          background-color: #dc2626; /* red-600 */
        }
        .btn-motor.red:hover:not(:disabled) {
          background-color: #b91c1c; /* red-700 */
        }

        .btn-motor.yellow {
          background-color: #d97706; /* yellow-600 */
          color: #ffffff; /* text-white */
        }
        .btn-motor.yellow:hover:not(:disabled) {
          background-color: #b45309; /* yellow-700 */
        }

        .loading-spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top-color: #2563eb; /* blue-600 */
          border-radius: 50%;
          height: 1.5rem; /* h-6 */
          width: 1.5rem; /* w-6 */
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
            font-size: 1.75rem; /* Smaller title on small screens */
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
            Step Amount:
          </label>
          <div className="flex-buttons-group"> {/* Reusing flex-buttons-group for alignment */}
            <input
              type="number"
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