'use client';

import React, { useState, useEffect } from 'react';

/**
 * PiRoutineManager component to manage routines on the Raspberry Pi backend.
 * It handles fetching, saving, renaming, and deleting routines via API calls.
 * @param {object} props The component props.
 * @param {string} props.PI_BACKEND_URL The URL of the Raspberry Pi backend.
 * @param {string} props.connectionStatus The current connection status.
 */
const PiRoutineManager = ({ PI_BACKEND_URL, connectionStatus }) => {
  // State for routine data and UI elements
  const [allRoutines, setAllRoutines] = useState([]);
  const [activeRoutines, setActiveRoutines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRoutine, setSelectedRoutine] = useState(null);
  const [selectedActiveRoutine, setSelectedActiveRoutine] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [hasMounted, setHasMounted] = useState(false);

  // Helper function to convert seconds to a human-readable format
  const formatTime = (totalSeconds) => {
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  };

  /**
   * Fetches all available routines from the backend.
   * This now fetches the combined JSON data.
   */
  const fetchAllRoutines = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines/all`);
      if (!response.ok) {
        throw new Error('Failed to fetch all routines.');
      }
      const data = await response.json();
      
      // Function to parse content and extract runtime
      const parseRoutineData = (routines) => {
        return routines.map(routine => {
          let totalRuntime = 0;
          try {
            const parsedContent = JSON.parse(routine.content);
            if (Array.isArray(parsedContent) && typeof parsedContent[0] === 'number') {
              totalRuntime = parsedContent[0];
            }
          } catch (e) {
            console.error(`Error parsing routine content for ${routine.name}:`, e);
          }
          return { ...routine, totalRuntime };
        });
      };
      
      setAllRoutines(parseRoutineData(data.all_routines));
      setActiveRoutines(parseRoutineData(data.active_routines));

    } catch (error) {
      console.error('Error fetching routines:', error);
      setAllRoutines([]);
      setActiveRoutines([]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Moves a routine from inactive to active list on the backend.
   * @param {string} filename The name of the routine file.
   */
  const moveToActive = async (filename) => {
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines/move-to-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      if (!response.ok) {
        throw new Error('Failed to move routine to active list.');
      }
      await fetchAllRoutines();
    } catch (error) {
      console.error('Error moving routine to active:', error);
    }
  };

  /**
   * Moves a routine from active to inactive list on the backend.
   * @param {string} filename The name of the routine file.
   */
  const moveToInactive = async (filename) => {
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines/move-to-inactive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      if (!response.ok) {
        throw new Error('Failed to move routine to inactive list.');
      }
      await fetchAllRoutines();
    } catch (error) {
      console.error('Error moving routine to inactive:', error);
    }
  };

  /**
   * Handles saving a routine's schedule or renaming it.
   * This is a single function for multiple save-related actions.
   */
  const handleSave = async (routine) => {
    // If the rename input is visible, perform a rename
    if (isRenaming) {
      if (!newRoutineName || newRoutineName.endsWith('.json')) {
        console.error("Invalid name. Must not be empty and should not end with '.json'.");
        return;
      }
      try {
        const response = await fetch(`${PI_BACKEND_URL}/routines/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldName: routine.name, newName: `${newRoutineName}.txt` }),
        });
        if (!response.ok) {
          throw new Error('Failed to rename routine.');
        }
        await fetchAllRoutines();
      } catch (error) {
        console.error('Error renaming routine:', error);
      } finally {
        setIsRenaming(false);
        setNewRoutineName('');
      }
    } else {
      // Otherwise, it's a schedule update for an active routine
      try {
        const response = await fetch(`${PI_BACKEND_URL}/routines/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: routine.name,
            day: routine.day,
            time: routine.time,
          }),
        });
        if (!response.ok) {
          throw new Error('Failed to save routine schedule.');
        }
        await fetchAllRoutines();
      } catch (error) {
        console.error('Error saving routine schedule:', error);
      }
    }
  };
  
  /**
   * Handles the deletion of a routine file on the backend.
   * @param {string} filename The name of the file to delete.
   */
  const handleDeleteFile = async (filename) => {
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      if (!response.ok) {
        throw new Error('Failed to delete routine file.');
      }
      await fetchAllRoutines();
      setSelectedRoutine(null);
      setSelectedActiveRoutine(null);
    } catch (error) {
      console.error('Error deleting routine file:', error);
    }
  };

  // --- Effect Hooks for Data Loading ---
  // Use a state to track if the component has mounted on the client
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Fetch routines only after the component has mounted
  useEffect(() => {
    if (hasMounted && PI_BACKEND_URL) {
      fetchAllRoutines();
    }
  }, [hasMounted, PI_BACKEND_URL]);

  // --- Local UI Handlers ---
  const handleRenameClick = () => {
    const routine = selectedRoutine || selectedActiveRoutine;
    if (routine) {
      setIsRenaming(true);
      setNewRoutineName(routine.name.replace('', ''));
    }
  };

  const handleDeleteRoutineClick = () => {
    const routine = selectedRoutine || selectedActiveRoutine;
    if (routine) {
      setFileToDelete(routine.name);
      setShowDeleteModal(true);
    }
  };

  const confirmDelete = async () => {
    if (fileToDelete) {
      await handleDeleteFile(fileToDelete);
      setShowDeleteModal(false);
      setFileToDelete(null);
    }
  };
  
  const onLocalUpdateActiveRoutine = (filename, day, time) => {
    setActiveRoutines(prev => prev.map(r => 
      r.name === filename ? { ...r, day, time } : r
    ));
  };

  if (!hasMounted) {
    return null; // Return nothing on the initial server render
  }

  return (
    <div className="main-container">
      <style>{`
        .main-container {
            display: flex;
            flex-direction: column;
            gap: 2rem; /* corresponds to gap-8 */
            padding: 1.5rem; /* corresponds to p-6 */
            background-color: #f9fafb; /* corresponds to bg-gray-50 */
            min-height: 800px; /* corresponds to min-h-[800px] */
            width: 100%;
            max-width: 64rem; /* corresponds to max-w-4xl */
            margin: 0 auto;
            border-radius: 0.75rem; /* corresponds to rounded-xl */
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); /* corresponds to shadow-2xl */
            border: 2px solid #e5e7eb; /* corresponds to border-2 border-gray-200 */
        }

        .title {
            text-align: center;
            font-size: 1.875rem; /* corresponds to text-3xl */
            font-weight: 700; /* corresponds to font-bold */
            color: #1f2937; /* corresponds to text-gray-800 */
        }

        .columns-container {
            display: flex;
            flex-direction: column;
            gap: 2rem; /* corresponds to gap-8 */
        }

        @media (min-width: 768px) {
            .columns-container {
                flex-direction: row;
            }
        }

        .column {
            flex: 1;
            padding: 1.5rem; /* corresponds to p-6 */
            background-color: #ffffff; /* corresponds to bg-white */
            border-radius: 0.75rem; /* corresponds to rounded-xl */
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); /* corresponds to shadow-md */
            border: 1px solid #e5e7eb; /* corresponds to border border-gray-200 */
            min-width: 300px; /* corresponds to min-w-[300px] */
        }

        .column-title {
            font-size: 1.25rem; /* corresponds to text-xl */
            font-weight: 700; /* corresponds to font-bold */
            margin-bottom: 1rem; /* corresponds to mb-4 */
            color: #1f2937; /* corresponds to text-gray-800 */
        }

        .routine-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem; /* corresponds to gap-2 */
            max-height: 24rem; /* corresponds to max-h-96 */
            overflow-y: auto;
            padding-right: 0.5rem; /* corresponds to pr-2 */
        }

        .list-item {
            padding: 0.75rem; /* corresponds to p-3 */
            border-radius: 0.5rem; /* corresponds to rounded-lg */
            border: 1px solid;
            cursor: pointer;
            transition-property: background-color;
            transition-duration: 200ms;
        }

        .list-item-selected {
            background-color: #bfdbfe; /* corresponds to bg-blue-200 */
            border-color: #3b82f6; /* corresponds to border-blue-500 */
        }

        .list-item-default {
            background-color: #ffffff; /* corresponds to bg-white */
            border-color: #e5e7eb; /* corresponds to border-gray-200 */
        }

        .list-item-default:hover {
            background-color: #f3f4f6; /* corresponds to hover:bg-gray-100 */
        }

        .list-item-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .routine-name {
            font-size: 0.875rem; /* corresponds to text-sm */
            font-weight: 500; /* corresponds to font-medium */
            color: #1f2937; /* corresponds to text-gray-800 */
        }

        .routine-runtime {
          font-size: 0.75rem;
          color: #6b7280;
          font-weight: 400;
          margin-left: 0.5rem;
        }

        .italic-text {
            font-size: 0.875rem; /* corresponds to text-sm */
            color: #6b7280; /* corresponds to text-gray-500 */
            font-style: italic;
        }

        .buttons-container {
            display: flex;
            gap: 0.5rem;
            margin-top: 1rem;
            justify-content: flex-end;
        }

        .rename-input-container {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            width: 100%;
        }

        .rename-input {
            width: 100%;
            padding: 0.5rem;
            border: 1px solid #d1d5db; /* corresponds to border-gray-300 */
            border-radius: 0.375rem; /* corresponds to rounded-md */
            outline: none;
        }

        .rename-input:focus {
            box-shadow: 0 0 0 2px #3b82f6; /* corresponds to focus:ring-2 focus:ring-blue-500 */
        }

        .save-button {
            padding: 0.5rem 1rem; /* corresponds to py-2 px-4 */
            background-color: #10b981; /* corresponds to bg-emerald-500 */
            color: #ffffff;
            border-radius: 0.375rem; /* corresponds to rounded-md */
            font-size: 0.875rem; /* corresponds to text-sm */
            transition-property: background-color;
            transition-duration: 150ms;
        }

        .save-button:hover {
            background-color: #059669; /* corresponds to hover:bg-emerald-600 */
        }

        .rename-button {
            padding: 0.5rem 1rem; /* corresponds to py-2 px-4 */
            font-size: 0.875rem; /* corresponds to text-sm */
            border-radius: 0.5rem; /* corresponds to rounded-lg */
            cursor: pointer;
            background-color: #f59e0b; /* corresponds to bg-amber-500 */
            color: #ffffff;
            transition-property: background-color;
            transition-duration: 150ms;
        }

        .rename-button:hover {
            background-color: #d97706; /* corresponds to hover:bg-amber-600 */
        }

        .delete-button {
            padding: 0.5rem 1rem; /* corresponds to py-2 px-4 */
            font-size: 0.875rem; /* corresponds to text-sm */
            border-radius: 0.5rem; /* corresponds to rounded-lg */
            cursor: pointer;
            background-color: #ef4444; /* corresponds to bg-red-500 */
            color: #ffffff;
            transition-property: background-color;
            transition-duration: 150ms;
        }

        .delete-button:hover {
            background-color: #dc2626; /* corresponds to hover:bg-red-600 */
        }

        .transfer-button-container {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            margin: auto 0;
        }

        @media (min-width: 768px) {
            .transfer-button-container {
                flex-direction: column;
            }
        }

        .transfer-button {
            padding: 0.75rem;
            background-color: #3b82f6; /* corresponds to bg-blue-500 */
            color: #ffffff;
            border-radius: 9999px; /* corresponds to rounded-full */
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); /* corresponds to shadow-lg */
            transition-property: background-color;
            transition-duration: 150ms;
            font-size: 1.25rem; /* corresponds to text-xl */
        }

        .transfer-button:hover {
            background-color: #2563eb; /* corresponds to hover:bg-blue-600 */
        }

        .transfer-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .input-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .input-number {
            width: 3rem;
            text-align: center;
            padding: 0.25rem;
            border: 1px solid #d1d5db; /* corresponds to border-gray-300 */
            border-radius: 0.375rem; /* corresponds to rounded-md */
        }

        .input-time {
            width: 6rem;
            padding: 0.25rem;
            border: 1px solid #d1d5db; /* corresponds to border-gray-300 */
            border-radius: 0.375rem; /* corresponds to rounded-md */
        }

        .save-small-button {
            padding: 0.25rem 0.75rem;
            background-color: #10b981;
            color: #ffffff;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            transition-property: background-color;
            transition-duration: 150ms;
        }

        .save-small-button:hover {
            background-color: #059669;
        }

        .modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 50;
        }

        .modal-content {
            background-color: #ffffff;
            padding: 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            text-align: center;
            width: 400px;
        }

        .modal-title {
            font-size: 1.125rem;
            font-weight: 700;
        }

        .modal-text {
            margin-top: 0.5rem;
        }

        .modal-text .file-name {
            font-weight: 600;
        }

        .modal-buttons {
            margin-top: 1rem;
            display: flex;
            justify-content: center;
            gap: 1rem;
        }

        .confirm-delete-button {
            padding: 0.5rem 1rem;
            font-size: 1rem;
            border-radius: 0.375rem;
            cursor: pointer;
            background-color: #ef4444;
            color: #ffffff;
        }

        .cancel-button {
            padding: 0.5rem 1rem;
            font-size: 1rem;
            border-radius: 0.375rem;
            cursor: pointer;
            background-color: #e5e7eb;
            color: #4b5563;
        }
      `}</style>
      <h1 className="title">Routine Manager</h1>
      <div className="columns-container">
        {/* All Routines Column */}
        <div className="column">
          <h2 className="column-title">Routines</h2>
          <ul className="routine-list">
            {isLoading ? (
              <p className="italic-text">Loading...</p>
            ) : (
              allRoutines.map((routine) => (
                <li
                  key={routine.name}
                  className={`list-item ${selectedRoutine?.name === routine.name ? 'list-item-selected' : 'list-item-default'}`}
                  onClick={() => {
                    setSelectedRoutine(routine);
                    setSelectedActiveRoutine(null);
                  }}
                >
                  <div className="list-item-content">
                    <span className="routine-name">{routine.name}</span>
                    {routine.totalRuntime && (
                      <span className="routine-runtime">
                        ({formatTime(routine.totalRuntime)})
                      </span>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
          {selectedRoutine && (
            <div className="buttons-container">
              {isRenaming && selectedRoutine?.name === selectedRoutine?.name ? (
                <div className="rename-input-container">
                  <input
                    type="text"
                    value={newRoutineName}
                    onChange={(e) => setNewRoutineName(e.target.value)}
                    className="rename-input"
                    placeholder="New routine name"
                  />
                  <button onClick={() => handleSave(selectedRoutine)} className="save-button">
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={handleRenameClick} className="rename-button">
                    Rename
                  </button>
                  <button onClick={handleDeleteRoutineClick} className="delete-button">
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Transfer Buttons */}
        <div className="transfer-button-container">
          <button
            onClick={() => moveToActive(selectedRoutine?.name)}
            disabled={!selectedRoutine || isRenaming}
            className="transfer-button"
            title="Move to Active"
          >
            →
          </button>
          <button
            onClick={() => moveToInactive(selectedActiveRoutine?.name)}
            disabled={!selectedActiveRoutine || isRenaming}
            className="transfer-button"
            title="Move to Available"
          >
            ←
          </button>
        </div>

        {/* Active Routines Column */}
        <div className="column">
          <h2 className="column-title">Active Routines</h2>
          <ul className="routine-list">
            {isLoading ? (
              <p className="italic-text">Loading...</p>
            ) : activeRoutines.length === 0 ? (
              <p className="italic-text">No active routines.</p>
            ) : (
              activeRoutines.map((routine) => (
                <li
                  key={routine.name}
                  className={`list-item ${selectedActiveRoutine?.name === routine.name ? 'list-item-selected' : 'list-item-default'}`}
                  onClick={() => {
                    setSelectedActiveRoutine(routine);
                    setSelectedRoutine(null);
                  }}
                >
                  <div className="list-item-content">
                    <span className="routine-name">{routine.name.replace('.json', '')}</span>
                    {routine.totalRuntime && (
                      <span className="routine-runtime">
                        ({formatTime(routine.totalRuntime)})
                      </span>
                    )}
                    <div className="input-group">
                      <input
                        type="number"
                        className="input-number"
                        value={routine.day || ''}
                        onChange={(e) => onLocalUpdateActiveRoutine(routine.name, e.target.value, routine.time)}
                        min="1"
                        max="7"
                      />
                      <input
                        type="time"
                        className="input-time"
                        value={routine.time || ''}
                        onChange={(e) => onLocalUpdateActiveRoutine(routine.name, routine.day, e.target.value)}
                      />
                      <button
                        onClick={() => handleSave(routine)}
                        className="save-small-button"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
          {selectedActiveRoutine && (
            <div className="buttons-container">
              {isRenaming && selectedActiveRoutine?.name === selectedActiveRoutine?.name ? (
                <div className="rename-input-container">
                  <input
                    type="text"
                    value={newRoutineName}
                    onChange={(e) => setNewRoutineName(e.target.value)}
                    className="rename-input"
                    placeholder="New routine name"
                  />
                  <button onClick={() => handleSave(selectedActiveRoutine)} className="save-button">
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={handleRenameClick} className="rename-button">
                    Rename
                  </button>
                  <button onClick={handleDeleteRoutineClick} className="delete-button">
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Deletion</h3>
            <p className="modal-text">Are you sure you want to delete <span className="file-name">{fileToDelete}</span>?</p>
            <div className="modal-buttons">
              <button onClick={confirmDelete} className="confirm-delete-button">
                Confirm Delete
              </button>
              <button onClick={() => setShowDeleteModal(false)} className="cancel-button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PiRoutineManager;
