'use client';
import { useState, useEffect, useCallback } from 'react';
import StepperMotorControl from '../components/ManualControl'; 
import RoutineBuilder from '../components/RoutineBuilder'; 
import PiRoutineManager from '../components/PiRoutineManager'; 

export default function Home() {
  const [activeTab, setActiveTab] = useState('routine');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [allRoutines, setAllRoutines] = useState([]);
  const [activeRoutines, setActiveRoutines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // The actual backend URL for the Raspberry Pi
  const PI_BACKEND_URL = 'http://192.168.1.3:5000';

  /**
   * Fetches routine data from the backend and updates the state.
   */
  const fetchRoutineData = async () => {
    setIsLoading(true);
    setConnectionStatus('Connecting...');
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      
      setAllRoutines(data.all_routines.sort((a, b) => a.creationDate - b.creationDate));
      setActiveRoutines(data.active_routines);
      setConnectionStatus('Connected');
    } catch (error) {
      console.error('Failed to fetch routine data:', error);
      setConnectionStatus('Disconnected');
      setAllRoutines([]);
      setActiveRoutines([]);
    } finally {
      setIsLoading(false);
    }
  };

  // useEffect to handle the initial fetch and subsequent refresh interval
  useEffect(() => {
    fetchRoutineData();

    // Set up an interval to refresh the data every 10 seconds
    const intervalId = setInterval(fetchRoutineData, 10000); 
    
    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, []); // Empty dependency array ensures this runs once on mount

  // Callback function to handle local updates to active routines
  const handleLocalUpdateActiveRoutine = useCallback((originalName, day, time) => {
    const updatedRoutines = activeRoutines.map((r) =>
      r.originalName === originalName ? { ...r, day: parseInt(day, 10), time } : r
    );
    setActiveRoutines(updatedRoutines);
  }, [activeRoutines]);

  // Backend interaction functions
  const handleSaveSchedule = async (routine) => {
    try {
      const response = await fetch(`${PI_BACKEND_URL}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routine),
      });
      if (!response.ok) throw new Error('Failed to save schedule');
      await fetchRoutineData(); // Refresh data after saving
    } catch (error) {
      console.error('Error saving schedule:', error);
      // In a real app, you would handle this gracefully (e.g., show an error message)
    }
  };

  const handleRename = async (originalName, newName) => {
    try {
      const response = await fetch(`${PI_BACKEND_URL}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalName, newName }),
      });
      if (!response.ok) throw new Error('Failed to rename routine');
      await fetchRoutineData(); // Refresh data
    } catch (error) {
      console.error('Error renaming routine:', error);
    }
  };

  const handleDeleteRoutine = async (fileName) => {
    try {
      const response = await fetch(`${PI_BACKEND_URL}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      });
      if (!response.ok) throw new Error('Failed to delete routine');
      await fetchRoutineData(); // Refresh data
    } catch (error) {
      console.error('Error deleting routine:', error);
    }
  };

  const handleMoveToActive = async (routineName) => {
    try {
      const response = await fetch(`${PI_BACKEND_URL}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routineName }),
      });
      if (!response.ok) throw new Error('Failed to move to active');
      await fetchRoutineData();
    } catch (error) {
      console.error('Error moving routine to active:', error);
    }
  };

  const handleMoveToInactive = async (routineName) => {
    try {
      const response = await fetch(`${PI_BACKEND_URL}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routineName }),
      });
      if (!response.ok) throw new Error('Failed to move to inactive');
      await fetchRoutineData();
    } catch (error) {
      console.error('Error moving routine to inactive:', error);
    }
  };

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
          max-width: 64rem;
          margin-left: auto;
          margin-right: auto;
          padding: 2rem;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
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

      <h1 className="main-title">Arduino Stepper Motor Control</h1>

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

      {activeTab === 'routine' && <RoutineBuilder />}
      {activeTab === 'manual' && <StepperMotorControl />}
      {activeTab === 'pi' && (
        <PiRoutineManager 
          allRoutines={allRoutines}
          activeRoutines={activeRoutines}
          isLoading={isLoading}
          onLocalUpdateActiveRoutine={handleLocalUpdateActiveRoutine}
          onSaveSchedule={handleSaveSchedule}
          onRename={handleRename}
          onDeleteRoutine={handleDeleteRoutine}
          onMoveToActive={handleMoveToActive}
          onMoveToInactive={handleMoveToInactive}
        />
      )}
    </div>
  );
}
