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

  // --- Backend API Call Functions ---

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
      setAllRoutines(data.all_routines);
      setActiveRoutines(data.active_routines);
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
  useEffect(() => {
    if (PI_BACKEND_URL) {
      fetchAllRoutines();
    }
  }, [PI_BACKEND_URL]);

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

  return (
    <div className="flex flex-col gap-8 p-6 bg-gray-50 min-h-[800px] w-full max-w-4xl mx-auto rounded-xl shadow-2xl border-2 border-gray-200">
      <h1 className="text-center text-3xl font-bold text-gray-800">Routine Manager</h1>
      <div className="flex flex-col md:flex-row gap-8">
        {/* All Routines Column */}
        <div className="flex-1 p-6 bg-white rounded-xl shadow-md border border-gray-200 min-w-[300px]">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Routines</h2>
          <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-2">
            {isLoading ? (
              <p className="text-sm text-gray-500 italic">Loading...</p>
            ) : (
              allRoutines.map((routine) => (
                <li
                  key={routine.name}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors duration-200 
                    ${selectedRoutine?.name === routine.name ? 'bg-blue-200 border-blue-500' : 'bg-white border-gray-200 hover:bg-gray-100'}`}
                  onClick={() => {
                    setSelectedRoutine(routine);
                    setSelectedActiveRoutine(null);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{routine.name}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
          {selectedRoutine && (
            <div className="flex gap-2 mt-4 justify-end">
              {isRenaming && selectedRoutine?.name === selectedRoutine?.name ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    value={newRoutineName}
                    onChange={(e) => setNewRoutineName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="New routine name"
                  />
                  <button onClick={() => handleSave(selectedRoutine)} className="py-2 px-4 bg-emerald-500 text-white rounded-md text-sm hover:bg-emerald-600 transition-colors duration-150">
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={handleRenameClick} className="py-2 px-4 text-sm rounded-lg cursor-pointer bg-amber-500 text-white hover:bg-amber-600 transition-colors duration-150">
                    Rename
                  </button>
                  <button onClick={handleDeleteRoutineClick} className="py-2 px-4 text-sm rounded-lg cursor-pointer bg-red-500 text-white hover:bg-red-600 transition-colors duration-150">
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Transfer Buttons */}
        <div className="flex flex-row md:flex-col items-center justify-center gap-4 my-auto">
          <button
            onClick={() => moveToActive(selectedRoutine?.name)}
            disabled={!selectedRoutine || isRenaming}
            className="p-3 bg-blue-500 text-white rounded-full shadow-lg transition-colors duration-150 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Move to Active"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
          <button
            onClick={() => moveToInactive(selectedActiveRoutine?.name)}
            disabled={!selectedActiveRoutine || isRenaming}
            className="p-3 bg-blue-500 text-white rounded-full shadow-lg transition-colors duration-150 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Move to Available"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {/* Active Routines Column */}
        <div className="flex-1 p-6 bg-white rounded-xl shadow-md border border-gray-200 min-w-[300px]">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Active Routines</h2>
          <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-2">
            {isLoading ? (
              <p className="text-sm text-gray-500 italic">Loading...</p>
            ) : activeRoutines.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No active routines.</p>
            ) : (
              activeRoutines.map((routine) => (
                <li
                  key={routine.name}
                  className={`p-3 rounded-lg border transition-colors duration-200
                    ${selectedActiveRoutine?.name === routine.name ? 'bg-blue-200 border-blue-500' : 'bg-white border-gray-200 hover:bg-gray-100'}`}
                  onClick={() => {
                    setSelectedActiveRoutine(routine);
                    setSelectedRoutine(null);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{routine.name.replace('.json', '')}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-12 text-center p-1 border border-gray-300 rounded-md"
                        value={routine.day || ''}
                        onChange={(e) => onLocalUpdateActiveRoutine(routine.name, e.target.value, routine.time)}
                        min="1"
                        max="7"
                      />
                      <input
                        type="time"
                        className="w-24 p-1 border border-gray-300 rounded-md"
                        value={routine.time || ''}
                        onChange={(e) => onLocalUpdateActiveRoutine(routine.name, routine.day, e.target.value)}
                      />
                      <button
                        onClick={() => handleSave(routine)}
                        className="py-1 px-3 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 transition-colors duration-150"
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
            <div className="flex gap-2 mt-4 justify-end">
              {isRenaming && selectedActiveRoutine?.name === selectedActiveRoutine?.name ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    value={newRoutineName}
                    onChange={(e) => setNewRoutineName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="New routine name"
                  />
                  <button onClick={() => handleSave(selectedActiveRoutine)} className="py-2 px-4 bg-emerald-500 text-white rounded-md text-sm hover:bg-emerald-600 transition-colors duration-150">
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={handleRenameClick} className="py-2 px-4 text-sm rounded-lg cursor-pointer bg-amber-500 text-white hover:bg-amber-600 transition-colors duration-150">
                    Rename
                  </button>
                  <button onClick={handleDeleteRoutineClick} className="py-2 px-4 text-sm rounded-lg cursor-pointer bg-red-500 text-white hover:bg-red-600 transition-colors duration-150">
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
        <div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg text-center w-[400px]">
            <h3 className="text-lg font-bold">Confirm Deletion</h3>
            <p className="mt-2">Are you sure you want to delete <span className="font-semibold">{fileToDelete}</span>?</p>
            <div className="mt-4 flex justify-center gap-4">
              <button onClick={confirmDelete} className="py-2 px-4 text-base rounded-md cursor-pointer bg-red-500 text-white">
                Confirm Delete
              </button>
              <button onClick={() => setShowDeleteModal(false)} className="py-2 px-4 text-base rounded-md cursor-pointer bg-gray-200 text-gray-700">
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
