'use client';
import { useState, useEffect } from 'react';
import StepperMotorControl from '../components/ManualControl'; 
import RoutineBuilder from '../components/RoutineBuilder'; 
import PiRoutineManager from '../components/PiRoutineManager'; 

export default function Home() {
  const [activeTab, setActiveTab] = useState('routine');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  // The actual backend URL for the Raspberry Pi
  const PI_BACKEND_URL = 'http://192.168.1.7:5000';
  const CONNECTION_TIMEOUT = 5000; // 5 seconds

  const checkConnectionAndFetchData = async () => {
    setConnectionStatus('Connecting...');
    try {
      // Create a timeout promise that rejects after the specified time
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out')), CONNECTION_TIMEOUT)
      );

      // Create a promise for the fetch request
      const fetchPromise = fetch(`${PI_BACKEND_URL}`);

      // Race the fetch and the timeout promises
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      console.log(data);
      setConnectionStatus('Connected');
    } catch (error) {
      console.error('Failed to connect to Raspberry Pi:', error);
      setConnectionStatus('Disconnected');
    }
  };

  useEffect(() => {
    checkConnectionAndFetchData();
  }, []); // Empty dependency array ensures this runs once on mount

  const getStatusIndicatorClass = () => {
    if (connectionStatus === 'Connected') {
      return 'status-indicator-dot connected';
    } else if (connectionStatus === 'Connecting...') {
      return 'status-indicator-dot connecting';
    }
    return 'status-indicator-dot disconnected';
  };

  return (
    <div className="main-wrapper">
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

        .main-wrapper {
          width: 100%;
          margin-left: auto;
          margin-right: auto;
          padding: 2rem;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .main-title {
          font-size: 2.25rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          color: #1a202c;
          text-align: center;
        }
        
        .connection-status-box {
          position: absolute;
          top: 1rem;
          right: 1rem;
          padding: 0.5rem 1rem;
          background-color: #ffffff;
          border-radius: 0.5rem;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: #4b5563;
          z-index: 10;
        }
        
        .status-indicator-dot {
          height: 0.75rem;
          width: 0.75rem;
          border-radius: 9999px;
        }
        
        .status-indicator-dot.connected {
          background-color: #10b981;
        }
        
        .status-indicator-dot.connecting {
          background-color: #f59e0b;
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .status-indicator-dot.disconnected {
          background-color: #ef4444;
          animation: none;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: .5;
          }
        }

        .tab-section {
          margin-bottom: 1.5rem;
          width: 100%;
        }

        .tab-border-container {
          border-bottom: 1px solid #e2e8f0;
        }

        .tab-nav {
          display: flex;
          margin-bottom: -1px;
        }

        .tab-button {
          padding-top: 0.5rem;
          padding-bottom: 0.5rem;
          padding-left: 1rem;
          padding-right: 1rem;
          border-bottom-width: 2px;
          font-weight: 500;
          font-size: 0.875rem;
          cursor: pointer;
          background: none;
          border-left: none;
          border-right: none;
          border-top: none;
          transition: all 0.2s ease-in-out;
        }

        .tab-button.active {
          border-color: #3b82f6;
          color: #2563eb;
        }

        .tab-button.inactive {
          border-color: transparent;
          color: #6b7280;
        }

        .tab-button.inactive:hover {
          color: #4b5563;
          border-color: #d1d5db;
        }

        .tab-button + .tab-button {
          margin-left: 2rem;
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
        
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .modal-content {
          background: white;
          padding: 24px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: center;
          width: 400px;
        }
        .modal-buttons {
          margin-top: 16px;
          display: flex;
          justify-content: center;
          gap: 16px;
        }
        .confirm-delete, .cancel-delete {
          padding: 8px 16px;
          font-size: 16px;
          border-radius: 6px;
          cursor: pointer;
        }
        .confirm-delete {
          background-color: #ef4444;
          color: white;
        }
        .cancel-delete {
          background-color: #e5e7eb;
          color: #4b5563;
        }
      `}</style>

      <div className="connection-status-box">
        Connection:
        <span className={getStatusIndicatorClass()} />
        {connectionStatus}
      </div>
      <div className="tab-section">
        <div className="tab-border-container">
          <nav className="tab-nav">
            <button
              onClick={() => setActiveTab('routine')}
              className={`tab-button ${activeTab === 'routine' ? 'active' : 'inactive'}`}
            >
              Routine Builder
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`tab-button ${activeTab === 'manual' ? 'active' : 'inactive'}`}
            >
              Manual Control
            </button>
            <button
              onClick={() => setActiveTab('pi')}
              className={`tab-button ${activeTab === 'pi' ? 'active' : 'inactive'}`}
            >
              Pi Routines
            </button>
          </nav>
        </div>
      </div>

      {activeTab === 'routine' && <RoutineBuilder PI_BACKEND_URL={PI_BACKEND_URL} />}
      {activeTab === 'manual' && <StepperMotorControl PI_BACKEND_URL={PI_BACKEND_URL} />}
      {activeTab === 'pi' && (
        <PiRoutineManager 
          connectionStatus={connectionStatus}
          PI_BACKEND_URL={PI_BACKEND_URL}
        />
      )}
    </div>
  );
}
