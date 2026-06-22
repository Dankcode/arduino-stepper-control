'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import StepperMotorControl from '../components/ManualControl';
import RoutineBuilder from '../components/RoutineBuilder';
import PiRoutineManager from '../components/PiRoutineManager';
import PictureBrowser from '../components/PictureBrowser';
import CameraStream from '../components/CameraStream';

const CONNECTION_TIMEOUT = 5000; // 5 seconds
const DEFAULT_PI_BACKEND_URL = process.env.NEXT_PUBLIC_PI_BACKEND_URL || 'http://localhost:5000';

export default function Home() {
  const [activeTab, setActiveTab] = useState('routine');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  // The backend URL for the Raspberry Pi. Set NEXT_PUBLIC_PI_BACKEND_URL for LAN deployments.
  const PI_BACKEND_URL = useMemo(() => DEFAULT_PI_BACKEND_URL.replace(/\/$/, ''), []);

  const checkConnectionAndFetchData = useCallback(async () => {
    setConnectionStatus('Connecting...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

    try {
      const response = await fetch(`${PI_BACKEND_URL}`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      setConnectionStatus('Connected');
    } catch (error) {
      console.error('Failed to connect to Raspberry Pi:', error);
      setConnectionStatus('Disconnected');
    } finally {
      clearTimeout(timeoutId);
      setLastCheckedAt(new Date());
    }
  }, [PI_BACKEND_URL]);

  useEffect(() => {
    checkConnectionAndFetchData();
    const intervalId = setInterval(checkConnectionAndFetchData, 30000);
    return () => clearInterval(intervalId);
  }, [checkConnectionAndFetchData]);

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
      <style jsx global>{`
        body {
          margin: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background-color: #020617; /* Darkest Navy */
          color: #f8fafc;
          height: 100vh;
          overflow: hidden;
        }

        .main-wrapper {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          box-sizing: border-box;
          position: relative;
        }

        .connection-status-box {
          position: absolute;
          top: 0.75rem;
          right: 1rem;
          padding: 0.4rem 0.8rem;
          background-color: #1e293b;
          border-radius: 0.375rem;
          border: 1px solid #334155;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
          z-index: 100;
        }

        .backend-url {
          color: #64748b;
          font-family: var(--font-mono);
          font-size: 0.68rem;
        }
        
        .status-indicator-dot {
          height: 0.5rem;
          width: 0.5rem;
          border-radius: 50%;
        }
        
        .status-indicator-dot.connected { background-color: #10b981; box-shadow: 0 0 8px #10b981; }
        .status-indicator-dot.connecting { background-color: #f59e0b; animation: pulse 2s infinite; }
        .status-indicator-dot.disconnected { background-color: #ef4444; }

        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

        .tab-section {
          background-color: #0f172a;
          border-bottom: 1px solid #1e293b;
          padding: 0 1rem;
          flex-shrink: 0;
          z-index: 50;
          display: flex;
          align-items: center;
        }

        .tab-nav {
          display: flex;
          gap: 0.5rem;
        }

        .tab-button {
          padding: 1rem 1.25rem;
          font-weight: 700;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          background: none;
          border: none;
          color: #64748b;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }

        .tab-button.active {
          color: #0ea5e9;
          border-bottom-color: #0ea5e9;
          background: linear-gradient(to top, rgba(14, 165, 233, 0.1), transparent);
        }

        .tab-button:hover:not(.active) {
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.05);
        }
        
        /* Unified container for tab content */
        .tab-content {
          flex-grow: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* Generic Card for other tabs to maintain uniformity */
        .uniform-panel {
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 0.75rem;
          padding: 1.5rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
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
        <div className={getStatusIndicatorClass()}></div>
        {connectionStatus}
        <span className="backend-url">{PI_BACKEND_URL}</span>
        {lastCheckedAt && (
          <span className="backend-url">Checked {lastCheckedAt.toLocaleTimeString()}</span>
        )}
      </div>

      <div className="tab-section">
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
          <button
            onClick={() => setActiveTab('pictures')}
            className={`tab-button ${activeTab === 'pictures' ? 'active' : 'inactive'}`}
          >
            Pictures
          </button>
          <button
            onClick={() => setActiveTab('camera')}
            className={`tab-button ${activeTab === 'camera' ? 'active' : 'inactive'}`}
          >
            Camera
          </button>
        </nav>
      </div>

      <div className="tab-content">
        {activeTab === 'routine' && <RoutineBuilder PI_BACKEND_URL={PI_BACKEND_URL} />}
        {activeTab === 'manual' && <StepperMotorControl PI_BACKEND_URL={PI_BACKEND_URL} />}
        {activeTab === 'pi' && (
          <PiRoutineManager
            connectionStatus={connectionStatus}
            PI_BACKEND_URL={PI_BACKEND_URL}
          />
        )}
        {activeTab === 'pictures' && (
          <PictureBrowser
            PI_BACKEND_URL={PI_BACKEND_URL}
          />
        )}
        {activeTab === 'camera' && (
          <CameraStream
            PI_BACKEND_URL={PI_BACKEND_URL}
          />
        )}
      </div>
    </div>
  );
}
