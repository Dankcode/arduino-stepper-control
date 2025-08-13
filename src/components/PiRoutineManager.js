// components/PiRoutineManager.js
'use client';
import { useState, useEffect } from 'react';

// This component handles the connection and display for the Raspberry Pi routines
const PiRoutineManager = () => {
  const [connectionStatus, setConnectionStatus] = useState('pending');
  const [allRoutines, setAllRoutines] = useState([]);
  const [activeRoutines, setActiveRoutines] = useState([]);
  const [selectedRoutine, setSelectedRoutine] = useState(null);
  const [selectedActiveRoutine, setSelectedActiveRoutine] = useState(null);

  // Use the IP address of your Raspberry Pi instead of localhost
  const PI_BACKEND_URL = 'http://192.168.1.3:5000';

  // Helper function to parse '6m 24s' into seconds
  const parseRuntimeToSeconds = (runtimeStr) => {
    if (!runtimeStr) return 0;
    const parts = runtimeStr.match(/(\d+)m\s*(\d+)s/);
    if (!parts) return 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    return minutes * 60 + seconds;
  };

  // Helper function to sort active routines by day and time
  const sortActiveRoutines = (routines) => {
    const now = new Date();
    const sorted = [...routines].sort((a, b) => {
      const aTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + a.day - 1, ...a.time.split(':'));
      const bTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + b.day - 1, ...b.time.split(':'));
      return aTime - bTime;
    });
    setActiveRoutines(sorted);
  };

  // Function to fetch all routine data from the backend
  const fetchRoutineData = async () => {
    setConnectionStatus('pending');
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      setAllRoutines(data.all_routines.sort((a, b) => a.creationDate - b.creationDate));
      // Set the active routines and sort them
      setActiveRoutines(data.active_routines);
      sortActiveRoutines(data.active_routines);
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Failed to fetch routine data:', error);
      setConnectionStatus('disconnected');
      setAllRoutines([]);
      setActiveRoutines([]);
    }
  };

  useEffect(() => {
    fetchRoutineData();
    const intervalId = setInterval(fetchRoutineData, 10000); // Refresh every 10 seconds
    return () => clearInterval(intervalId);
  }, []);

  // Handler for updating day/time inputs
  const handleUpdateActiveRoutine = async (filename, day, time) => {
    const updatedRoutines = activeRoutines.map((r) =>
      r.name === filename ? { ...r, day, time } : r
    );
    setActiveRoutines(updatedRoutines);
    sortActiveRoutines(updatedRoutines);
    
    try {
      await fetch(`${PI_BACKEND_URL}/update-active-routine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, day, time }),
      });
    } catch (error) {
      console.error('Failed to update routine:', error);
      // Revert the local state on failure
      fetchRoutineData();
    }
  };

  // Handler for moving a routine to the active list
  const handleMoveToActive = async () => {
    if (!selectedRoutine) return;
    try {
      // Fetch the routine content to get the total runtime
      const contentResponse = await fetch(`${PI_BACKEND_URL}/routine-content/${selectedRoutine.name}`);
      const content = await contentResponse.json();
      const runtimeInSeconds = parseRuntimeToSeconds(content.routineSummary.totalRuntime);
      
      let defaultDay = 1;
      let defaultTime = '00:00';
      
      if (activeRoutines.length > 0) {
        const lastRoutine = activeRoutines[activeRoutines.length - 1];
        const lastTime = new Date();
        const [lastHours, lastMinutes] = lastRoutine.time.split(':').map(Number);
        lastTime.setDate(lastTime.getDate() + lastRoutine.day - 1);
        lastTime.setHours(lastHours, lastMinutes, 0, 0);

        const newTime = new Date(lastTime.getTime() + runtimeInSeconds * 1000);
        
        defaultDay = Math.floor((newTime - new Date()) / (1000 * 60 * 60 * 24)) + 1;
        if (defaultDay < 1) defaultDay = 1;
        defaultTime = newTime.toTimeString().split(' ')[0].substring(0, 5);
        
      } else {
        // Set to current time rounded to the nearest hour
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30); // Round up
        defaultDay = 1;
        defaultTime = now.toTimeString().split(' ')[0].substring(0, 5);
      }
      
      const moveResponse = await fetch(`${PI_BACKEND_URL}/move-routine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedRoutine.name, destination: 'active' }),
      });
      
      if (moveResponse.ok) {
        const updatedRoutines = [...activeRoutines, { ...selectedRoutine, day: defaultDay, time: defaultTime }];
        setAllRoutines(allRoutines.filter((r) => r.name !== selectedRoutine.name));
        setSelectedRoutine(null);
        sortActiveRoutines(updatedRoutines);
      }
    } catch (error) {
      console.error('Failed to move routine to active:', error);
      fetchRoutineData(); // Re-sync state
    }
  };

  // Handler for moving a routine to the inactive list
  const handleMoveToInactive = async () => {
    if (!selectedActiveRoutine) return;
    try {
      const response = await fetch(`${PI_BACKEND_URL}/move-routine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedActiveRoutine.name, destination: 'inactive' }),
      });
      if (response.ok) {
        const updatedRoutines = [...allRoutines, selectedActiveRoutine];
        setAllRoutines(updatedRoutines.sort((a, b) => a.creationDate - b.creationDate));
        setActiveRoutines(activeRoutines.filter((r) => r.name !== selectedActiveRoutine.name));
        setSelectedActiveRoutine(null);
      }
    } catch (error) {
      console.error('Failed to move routine to inactive:', error);
      fetchRoutineData(); // Re-sync state
    }
  };
  
  return (
    <div className="card-container">
      <h1 className="main-title">Pi Routine Manager</h1>
      
      <div className="status-block">
        <div className="status-header">
          <span className="status-label">Connection Status</span>
          <span
            className={`status-indicator ${
              connectionStatus === 'connected' ? 'connected' : 'disconnected'
            }`}
          >
            {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {connectionStatus === 'disconnected' && (
          <div className="flex-buttons-group mt-2">
            <button
              onClick={fetchRoutineData}
              className="btn btn-connect"
            >
              Reconnect
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-8 mt-4">
        {/* All Routines Column */}
        <div className="flex-1 p-4 bg-gray-50 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Available Routines</h2>
          <ul className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {allRoutines.map((routine) => (
              <li
                key={routine.name}
                className={`p-3 rounded-lg border cursor-pointer transition-colors duration-200
                          ${selectedRoutine?.name === routine.name ? 'bg-blue-200 border-blue-500' : 'bg-white border-gray-200 hover:bg-gray-100'}`}
                onClick={() => setSelectedRoutine(routine)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{routine.name}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Transfer Buttons */}
        <div className="flex flex-col items-center justify-center space-y-4 my-auto">
          <button
            onClick={handleMoveToActive}
            disabled={!selectedRoutine}
            className="p-3 bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Move to Active"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
          <button
            onClick={handleMoveToInactive}
            disabled={!selectedActiveRoutine}
            className="p-3 bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Move to Available"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {/* Active Routines Column */}
        <div className="flex-1 p-4 bg-gray-50 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Active Routines</h2>
          <ul className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {activeRoutines.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No active routines.</p>
            ) : (
              activeRoutines.map((routine) => (
                <li
                  key={routine.name}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors duration-200
                            ${selectedActiveRoutine?.name === routine.name ? 'bg-blue-200 border-blue-500' : 'bg-white border-gray-200 hover:bg-gray-100'}`}
                  onClick={() => setSelectedActiveRoutine(routine)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{routine.name}</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        className="w-12 text-center p-1 border rounded"
                        value={routine.day || 1}
                        onChange={(e) => handleUpdateActiveRoutine(routine.name, e.target.value, routine.time)}
                        min="1"
                      />
                      <input
                        type="time"
                        className="w-24 p-1 border rounded"
                        value={routine.time || '00:00'}
                        onChange={(e) => handleUpdateActiveRoutine(routine.name, routine.day, e.target.value)}
                      />
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PiRoutineManager;
