'use client';
import { useState, useEffect } from 'react';
import StepperMotorControl from '../components/ManualControl';
import RoutineBuilder from '../components/RoutineBuilder';
import PiRoutineManagerRefactored from '../components/PiRoutineManagerRefactored';
import PictureBrowserRefactored from '../components/PictureBrowserRefactored';
import CameraStream from '../components/CameraStream';

export default function Home() {
  const [activeTab, setActiveTab] = useState('routine');
  const [connectionStatus, setConnectionStatus] = useState('Checking Dashboard DB...');
  
  // The local dashboard API handles coordination now.
  const PI_BACKEND_URL = 'http://192.168.1.43:5000';

  useEffect(() => {
    // Basic check for dashboard backend connection
    fetch('/api/routine/list')
      .then(res => res.ok ? setConnectionStatus('Dashboard Ready') : setConnectionStatus('Dashboard Connection Issue'))
      .catch(() => setConnectionStatus('Dashboard Offline'));
  }, [activeTab]);

  const getStatusIndicatorClass = () => {
    if (connectionStatus === 'Dashboard Ready') {
      return 'status-indicator-dot connected';
    } else if (connectionStatus === 'Checking Dashboard DB...') {
      return 'status-indicator-dot connecting';
    }
    return 'status-indicator-dot disconnected';
  };

  return (
    <div className="main-wrapper">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <style jsx global>{`
        body { margin: 0; font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; height: 100vh; overflow: hidden; }
        .main-wrapper { display: flex; flex-direction: column; height: 100vh; width: 100vw; box-sizing: border-box; position: relative; }
        .connection-status-box { position: absolute; top: 0.75rem; right: 1rem; padding: 0.4rem 0.8rem; background-color: #1e293b; border-radius: 0.375rem; border: 1px solid #334155; display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #94a3b8; z-index: 100; }
        .status-indicator-dot { height: 0.5rem; width: 0.5rem; border-radius: 50%; }
        .status-indicator-dot.connected { background-color: #10b981; box-shadow: 0 0 8px #10b981; }
        .status-indicator-dot.connecting { background-color: #f59e0b; animation: pulse 2s infinite; }
        .status-indicator-dot.disconnected { background-color: #ef4444; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .tab-section { background-color: #0f172a; border-bottom: 1px solid #1e293b; padding: 0 1rem; flex-shrink: 0; z-index: 50; display: flex; align-items: center; }
        .tab-nav { display: flex; gap: 0.5rem; }
        .tab-button { padding: 1rem 1.25rem; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; background: none; border: none; color: #64748b; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .tab-button.active { color: #0ea5e9; border-bottom-color: #0ea5e9; background: linear-gradient(to top, rgba(14, 165, 233, 0.1), transparent); }
        .tab-button:hover:not(.active) { color: #94a3b8; background: rgba(255, 255, 255, 0.05); }
        .tab-content { flex-grow: 1; overflow: auto; display: flex; flex-direction: column; }
      `}</style>

      <div className="connection-status-box">
        <div className={getStatusIndicatorClass()}></div>
        {connectionStatus}
      </div>

      <div className="tab-section">
        <nav className="tab-nav">
          {['routine', 'manual', 'manager', 'pictures', 'camera'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`tab-button ${activeTab === tab ? 'active' : 'inactive'}`}
            >
              {tab.replace(/^\w/, (c) => c.toUpperCase())}
            </button>
          ))}
        </nav>
      </div>

      <div className="tab-content">
        {activeTab === 'routine' && <RoutineBuilder PI_BACKEND_URL={PI_BACKEND_URL} />}
        {activeTab === 'manual' && <StepperMotorControl PI_BACKEND_URL={PI_BACKEND_URL} />}
        {activeTab === 'manager' && <PiRoutineManagerRefactored />}
        {activeTab === 'pictures' && <PictureBrowserRefactored />}
        {activeTab === 'camera' && <CameraStream PI_BACKEND_URL={PI_BACKEND_URL} />}
      </div>
    </div>
  );
}