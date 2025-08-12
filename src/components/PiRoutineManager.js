// components/PiRoutineManager.js
'use client';
import { useState, useEffect } from 'react';

// This component handles the connection and display for the Raspberry Pi routines
const PiRoutineManager = () => {
  const [connectionStatus, setConnectionStatus] = useState('pending');
  const [routineFiles, setRoutineFiles] = useState([]);
  const [activeRoutine, setActiveRoutine] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);

  // Use the IP address of your Raspberry Pi instead of localhost
  const PI_BACKEND_URL = 'http://192.168.1.3:5000';

  // Function to fetch data from the Flask backend
  const fetchRoutineData = async () => {
    setConnectionStatus('pending');
    try {
      // Fetch from the backend running on the Raspberry Pi
      const response = await fetch(`${PI_BACKEND_URL}/routines`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      setRoutineFiles(data.files);
      setActiveRoutine(data.active_routine);
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Failed to fetch routine data:', error);
      setConnectionStatus('disconnected');
      setRoutineFiles([]);
      setActiveRoutine(null);
    }
  };

  useEffect(() => {
    // Fetch data when the component first mounts
    fetchRoutineData();
    // Set up a refresh interval to periodically check the status and files
    const intervalId = setInterval(fetchRoutineData, 5000); // Refresh every 5 seconds
    return () => clearInterval(intervalId); // Clean up the interval on unmount
  }, []);

  // Drag-and-drop handlers
  const handleDragStart = (e, file) => {
    setDraggedItem(file);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetFile) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetFile) {
      return;
    }

    const newRoutineFiles = [...routineFiles];
    const draggedIndex = newRoutineFiles.indexOf(draggedItem);
    const targetIndex = newRoutineFiles.indexOf(targetFile);

    // Remove dragged item from its original position
    newRoutineFiles.splice(draggedIndex, 1);
    // Insert dragged item at the new position
    newRoutineFiles.splice(targetIndex, 0, draggedItem);
    
    setRoutineFiles(newRoutineFiles);
    setDraggedItem(null);
  };

  return (
    <div className="card">
      <h1 className="title">Pi Routine Manager</h1>
      
      {/* Connection Status Block */}
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

      {/* Routine Files List */}
      <div className="input-section">
        <h2 className="text-xl font-bold mb-2 text-gray-800">Available Routines</h2>
        {routineFiles.length === 0 && connectionStatus !== 'pending' ? (
          <p className="text-sm text-gray-500 italic">No routine files found.</p>
        ) : (
          <ul className="space-y-2">
            {routineFiles.map((file) => (
              <li
                key={file}
                className={`p-3 rounded-lg border border-gray-200 bg-white shadow-sm cursor-grab
                          ${file === activeRoutine ? 'bg-blue-100 border-blue-400' : ''}`}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, file)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, file)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{file}</span>
                  {file === activeRoutine && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-200 text-green-800">
                      Active
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PiRoutineManager;
