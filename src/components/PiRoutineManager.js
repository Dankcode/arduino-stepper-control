'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation'; 

/**
 * PiRoutineManager component to manage routines on the Raspberry Pi backend.
 * It handles fetching, saving, renaming, and deleting routines via API calls.
 * @param {object} props The component props.
 * @param {string} props.PI_BACKEND_URL The URL of the Raspberry Pi backend.
 * @param {string} props.connectionStatus The current connection status.
 */
const PiRoutineManager = ({ PI_BACKEND_URL, connectionStatus }) => {
  const router = useRouter(); 

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
  const [localSchedule, setLocalSchedule] = useState({});
  const [initialLocalSchedule, setInitialLocalSchedule] = useState({});
  const [scheduleError, setScheduleError] = useState(null);

  // Helper function to generate time options (Kept for reference).
  const generateTimeOptions = () => {
      const times = [];
      for (let h = 0; h < 24; h++) {
          for (let m = 0; m < 60; m += 30) {
              const hour = String(h).padStart(2, '0');
              const minute = String(m).padStart(2, '0');
              times.push(`${hour}:${minute}`);
          }
      }
      return times;
  };

  const timeOptions = useMemo(generateTimeOptions, []); 

  // --- TIME CONVERSION HELPERS ---

  /**
   * Converts 24-hour time string (HH:MM) to local 12-hour components (HH, MM, Period).
   */
  const convert24toLocal12Hour = (time24) => {
    if (!time24 || typeof time24 !== 'string') return { hour: '12', minute: '00', period: 'AM' };
    
    const parts = time24.split(':');
    if (parts.length !== 2) return { hour: '12', minute: '00', period: 'AM' };

    let [h, m] = parts.map(s => parseInt(s, 10));
    
    if (isNaN(h) || isNaN(m)) return { hour: '12', minute: '00', period: 'AM' };
    
    const date = new Date(2000, 0, 1, h, m);
    const timeFormatter = new Intl.DateTimeFormat('en-US', { 
      hour: 'numeric', 
      minute: 'numeric', 
      hour12: true 
    }).formatToParts(date);
    
    let hour = '12';
    let minute = '00';
    let period = 'AM';

    for (const part of timeFormatter) {
      if (part.type === 'hour') hour = String(part.value).padStart(2, '0');
      if (part.type === 'minute') minute = part.value;
      if (part.type === 'dayPeriod') period = part.value;
    }

    hour = hour.length === 1 ? `0${hour}` : hour;

    return { hour, minute, period };
  };

  /**
   * Converts 12-hour components (HH, MM, Period) to 24-hour time (HH:MM) for the backend.
   */
  const convertLocal12to24Hour = (hour12, minute, period) => {
    let h = parseInt(hour12, 10);
    let m = parseInt(minute, 10);

    if (isNaN(h) || h < 1 || h > 12 || isNaN(m) || m < 0 || m > 59) return null;

    if (period === 'PM' && h !== 12) {
        h += 12;
    } else if (period === 'AM' && h === 12) {
        h = 0; // Midnight (12 AM is 00:00)
    }
    
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  /**
   * Converts 24-hour time string (HH:MM) to total minutes past midnight.
   * @param {string} time24 - Time in 24-hour format (e.g., "15:30").
   * @returns {number} Total minutes past midnight.
   */
  const militaryTimeToMinutes = (time24) => {
    if (!time24) return -1;
    const [h, m] = time24.split(':').map(Number);
    return h * 60 + m;
  };
  
  // --- OVERLAP CHECKER ---
  /**
   * Checks if a routine's proposed new start time causes it to overlap with any other active routine.
   * @param {string} checkingRoutineName - The name of the routine whose time is being checked.
   * @param {string} newTime24 - The proposed 24-hour start time for the checking routine.
   * @param {number} runtimeSeconds - The total runtime of the checking routine.
   * @param {Array} currentActiveRoutines - The list of active routines, which MUST contain the proposed new times for ALL routines (including the one being checked).
   * @param {Array} allRoutinesData - The list of all routines with their runtimes.
   * @returns {boolean} True if an overlap is found, false otherwise.
   */
  const checkOverlap = (checkingRoutineName, newTime24, runtimeSeconds, currentActiveRoutines, allRoutinesData) => {
    // Get new routine's start and end times in minutes past midnight (0-1440)
    const newStartMinutes = militaryTimeToMinutes(newTime24);
    const newDurationMinutes = Math.ceil(runtimeSeconds / 60); 
    const newEndMinutes = (newStartMinutes + newDurationMinutes); // May exceed 1440

    // The list passed as currentActiveRoutines now contains all proposed times
    for (const routine of currentActiveRoutines) {
        // Skip the routine being checked against itself
        if (routine.name === checkingRoutineName) continue; 
        
        // 1. Get the conflicting routine's runtime
        const otherRoutineData = allRoutinesData.find(r => r.name.replace('.sql', '') === routine.name);
        const otherRuntimeSeconds = otherRoutineData?.totalRuntime || 0;
        const otherDurationMinutes = Math.ceil(otherRuntimeSeconds / 60);
        
        // 2. Get the conflicting routine's schedule
        const otherStartMinutes = militaryTimeToMinutes(routine.time); // routine.time is the proposed time from the list
        const otherEndMinutes = (otherStartMinutes + otherDurationMinutes); // May exceed 1440

        // Function to check if a single time point (in 1440-range) falls within a routine's interval
        const isTimeInInterval = (timePoint, start, end, duration) => {
             // Handle standard interval (00:00 to 23:59)
             if (start + duration <= 1440) {
                 return timePoint >= start && timePoint < end;
             }
             // Handle wrap-around interval (e.g., 23:00 to 01:00)
             const wrappedTimePoint = timePoint % 1440;
             const wrappedStart = start % 1440;
             const wrappedEnd = end % 1440; // This is the end time on the next day's 0-24 clock

             return wrappedTimePoint >= wrappedStart || wrappedTimePoint < wrappedEnd;
        };

        // Check 1: Does the start time of A fall into B?
        if (isTimeInInterval(newStartMinutes, otherStartMinutes, otherEndMinutes, otherDurationMinutes)) {
            return true;
        }

        // Check 2: Does the minute *just before* the end of A fall into B?
        if (newDurationMinutes > 0 && isTimeInInterval((newEndMinutes - 1) % 1440, otherStartMinutes, otherEndMinutes, otherDurationMinutes)) {
             return true;
        }
        
        // Check 3: Does the start time of B fall into A?
        if (isTimeInInterval(otherStartMinutes, newStartMinutes, newEndMinutes, newDurationMinutes)) {
            return true;
        }
        
        // Check 4: Does the minute *just before* the end of B fall into A?
        if (otherDurationMinutes > 0 && isTimeInInterval((otherEndMinutes - 1) % 1440, newStartMinutes, newEndMinutes, newDurationMinutes)) {
             return true;
        }
    }
    
    return false;
  };

  // Helper function to convert seconds to a human-readable format
  const formatTime = (totalSeconds) => {
    if (totalSeconds === undefined || totalSeconds === null || totalSeconds === 0) return '0s';
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || totalSeconds < 60) parts.push(`${seconds}s`); 

    return parts.join(' ');
  };
  
  /**
   * Fetches all available routines from the backend.
   */
  const fetchAllRoutines = async () => {
    setIsLoading(true);
    setScheduleError(null); 
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines/all`);
      if (!response.ok) {
        throw new Error('Failed to fetch all routines.');
      }
      const data = await response.json();
      
      setAllRoutines(data.all_routines); 
      setActiveRoutines(data.active_routines);

      // Convert fetched 24-hour time to local 12-hour components for the state
      const initialSchedule = data.active_routines.reduce((acc, routine) => {
          const converted = convert24toLocal12Hour(routine.time);
          acc[routine.name] = { 
              day: routine.day, 
              time12: converted.hour,
              minute: converted.minute,
              period: converted.period,
              time24: routine.time // Store 24-hour time for comparison
          };
          return acc;
      }, {});
      // Set both local (editable) and initial (baseline) schedules
      setLocalSchedule(initialSchedule);
      setInitialLocalSchedule(initialSchedule);
      
    } catch (error) {
      console.error('Error fetching routines:', error);
      setAllRoutines([]);
      setActiveRoutines([]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Computed value to detect unsaved changes in the schedule.
   */
  const hasUnsavedChanges = useMemo(() => {
    // Cannot detect changes if baseline data hasn't loaded
    if (!initialLocalSchedule || Object.keys(initialLocalSchedule).length === 0) {
        // If there are active routines but no initial state, something is being loaded
        return activeRoutines.length > 0 && Object.keys(localSchedule).length > 0;
    }

    for (const routine of activeRoutines) {
        const routineName = routine.name;
        const local = localSchedule[routineName];
        const initial = initialLocalSchedule[routineName];
        
        // Check if any time component differs
        if (local && initial && (
            local.time12 !== initial.time12 ||
            local.minute !== initial.minute ||
            local.period !== initial.period)
        ) {
            return true;
        }
    }
    return false;
  }, [localSchedule, initialLocalSchedule, activeRoutines]);

  /**
   * Handles saving ALL scheduled routine updates.
   */
  const handleSaveAllSchedules = async () => {
    setScheduleError(null);
    const updatesToPerform = [];

    // 1. Create a proposed schedule list for simultaneous conflict checking
    const proposedActiveRoutines = activeRoutines.map(routine => {
      const routineName = routine.name;
      const local = localSchedule[routineName];
      const initial = initialLocalSchedule[routineName];

      const time24Hour = convertLocal12to24Hour(
          local.time12, 
          local.minute, 
          local.period
      );
      
      if (!time24Hour) {
          // Time format validation failed. Set error and return a placeholder to be filtered.
          setScheduleError(`Invalid time format for routine '${routineName}'. Please correct and try again.`);
          return null; 
      }

      // If time has changed, add it to the list of API updates
      if (time24Hour !== initial?.time24) {
          updatesToPerform.push({
              routineName,
              newTime24Hour: time24Hour,
              newDay: local.day,
              runtime: allRoutines.find(r => r.name.replace('.sql', '') === routineName)?.totalRuntime || 0,
          });
      }

      // Return the routine object with the PROPOSED new time
      return {
          name: routineName,
          day: local.day,
          time: time24Hour // Proposed time for overlap checking
      };
    }).filter(r => r !== null); // Filter out any routines with invalid time formats

    if (scheduleError) return; // Exit if initial time validation failed

    // Safety check: if button was enabled but no changes found (e.g., initial load race condition)
    if (updatesToPerform.length === 0) {
        setScheduleError("No schedule changes detected to save.");
        return;
    }

    // 2. Perform Overlap Check against the proposed schedule
    for (const update of updatesToPerform) {
        // Pass the ENTIRE proposedActiveRoutines list for comparison
        if (checkOverlap(update.routineName, update.newTime24Hour, update.runtime, proposedActiveRoutines, allRoutines)) {
            // --- MODIFIED LOGIC HERE: Revert ALL changes on conflict ---
            
            // CONFLICT FOUND: Display error and revert ALL local changes
            setScheduleError(`Cannot save changes. Scheduling conflict detected involving routine '${update.routineName}'. The machine cannot run two routines at once. All unsaved changes have been reverted.`);
            
            // Revert the ENTIRE localSchedule to the last successfully fetched state
            setLocalSchedule(initialLocalSchedule); 
            
            return; // Stop the entire save operation on the first conflict
        }
    }

    // 3. Perform API Updates (Sequential)
    let hadApiError = false;

    for (const update of updatesToPerform) {
        try {
            const response = await fetch(`${PI_BACKEND_URL}/routines/schedule-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: update.routineName,
                    day: update.newDay, 
                    time: update.newTime24Hour, 
                }),
            });
            if (!response.ok) {
                 throw new Error(`Failed to update routine '${update.routineName}'.`);
            }
        } catch (error) {
            console.error('Error saving routine schedule:', error);
            setScheduleError(`Error saving schedule for ${update.routineName}. Other changes were canceled: ${error.message}`);
            hadApiError = true;
            break; // Stop on first API error
        }
    }
    
    // 4. Final state update
    if (!hadApiError) {
        await fetchAllRoutines(); // Refetch to sync state and reset initialLocalSchedule
        setScheduleError("All schedule updates saved successfully! 🎉");
    }
  };


  // --- Helper/Action Functions (Renaming, Deleting, Moving) remain the same ---

  const handleSave = async (routine) => {
    const isInactiveRoutine = allRoutines.some(r => r.name === routine.name);
    if (isRenaming) {
      if (!newRoutineName) {
        console.error("Invalid name. Must not be empty.");
        return;
      }
      const oldBaseName = isInactiveRoutine ? routine.name.replace('.sql', '') : routine.name; 
      const newBaseName = `${newRoutineName}`; 
      try {
        const response = await fetch(`${PI_BACKEND_URL}/routines/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldName: oldBaseName, newName: newBaseName }), 
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
    }
  };

  const handleDeleteFile = async (filename) => {
    const nameToSend = filename.replace('.sql', ''); 
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: nameToSend }),
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

  const handleEditRoutine = (filename) => {
    const routineBaseName = filename.replace('.sql', ''); 
    router.push(`/routine-creator?edit=${routineBaseName}`);
  };

  const moveToActive = async (filename) => {
    const routineBaseName = filename.replace('.sql', ''); 
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines/move-to-active-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: routineBaseName }),
      });
      if (!response.ok) {
        throw new Error('Failed to set routine as active in SQL.');
      }
      await fetchAllRoutines();
      setSelectedRoutine(null);
    } catch (error) {
      console.error('Error setting routine active:', error);
    }
  };

  const moveToInactive = async (filename) => {
    const routineBaseName = filename; 
    try {
      const response = await fetch(`${PI_BACKEND_URL}/routines/move-to-inactive-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: routineBaseName }),
      });
      if (!response.ok) {
        throw new Error('Failed to remove active tag in SQL.');
      }
      await fetchAllRoutines();
      setSelectedActiveRoutine(null); 
    } catch (error) {
      console.error('Error setting routine inactive:', error);
    }
  };
  
  /**
   * Updates the local state for a specific active routine's schedule.
   */
  const onLocalUpdateActiveRoutine = (filename, key, value) => {
    let finalValue = value;
    if (key === 'time12' || key === 'minute') {
        finalValue = value.replace(/[^0-9]/g, '').slice(0, 2); 
    }

    setLocalSchedule(prev => ({
        ...prev,
        [filename]: {
            ...prev[filename],
            [key]: finalValue
        }
    }));
  };
  
  // --- Effect Hooks for Data Loading & UI Handlers (unchanged) ---
  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (hasMounted && PI_BACKEND_URL) {
      fetchAllRoutines();
    }
  }, [hasMounted, PI_BACKEND_URL]);

  const handleRenameClick = () => {
    const routine = selectedRoutine || selectedActiveRoutine;
    if (routine) {
      setIsRenaming(true);
      const baseName = routine.name.replace('.sql', ''); 
      setNewRoutineName(baseName);
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
  
  if (!hasMounted) {
    return null;
  }

  const routineForActions = selectedRoutine || selectedActiveRoutine;

  return (
    <div className="main-container">
      {/* --- CSS Style Block (Modified for Global Save Button) --- */}
      <style>{`
        .main-container {
            padding: 2rem;
            max-width: 1200px;
            margin: auto;
        }
        .columns-container {
            display: flex;
            gap: 20px;
        }
        .column {
            flex: 1;
            background: #f9fafb;
            padding: 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            min-height: 500px;
            display: flex;
            flex-direction: column;
        }
        .column-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: #4b5563;
            margin-bottom: 1rem;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 0.5rem;
        }
        .routine-list {
            list-style: none;
            padding: 0;
            flex-grow: 1;
        }
        .list-item {
            padding: 0.75rem 1rem;
            margin-bottom: 0.5rem;
            border-radius: 0.375rem;
            cursor: pointer;
            transition: background-color 0.15s;
        }
        .list-item-default {
            background-color: #ffffff;
            border: 1px solid #e5e7eb;
        }
        .list-item-selected {
            background-color: #d1fae5; /* Green 100 */
            border: 1px solid #10b981; /* Green 500 */
        }
        .list-item:hover:not(.list-item-selected) {
            background-color: #f3f4f6;
        }
        .routine-name {
            font-weight: 500;
            color: #1f2937;
        }
        .routine-runtime {
            font-size: 0.875rem;
            color: #6b7280;
            margin-left: 0.5rem;
        }
        .transfer-button-container {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 1rem;
        }
        .transfer-button {
            padding: 0.5rem 1rem;
            background-color: #3b82f6;
            color: white;
            border: none;
            border-radius: 0.5rem;
            font-size: 1.5rem;
            cursor: pointer;
            transition: background-color 0.15s;
        }
        .transfer-button:disabled {
            background-color: #9ca3af;
            cursor: not-allowed;
        }
        .transfer-button:hover:not(:disabled) {
            background-color: #2563eb;
        }
        .buttons-container {
            margin-top: 1rem;
            display: flex;
            gap: 0.5rem;
            justify-content: flex-end;
        }
        .edit-button-sql, .rename-button, .delete-button {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 0.5rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.15s;
        }
        .edit-button-sql:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }
        .edit-button-sql {
            background-color: #93c5fd; /* Blue 300 */
            color: #1e40af; /* Blue 800 */
        }
        .edit-button-sql:hover {
            background-color: #60a5fa;
        }
        .rename-button {
            background-color: #fcd34d; /* Amber 300 */
            color: #92400e; /* Amber 800 */
        }
        .rename-button:hover {
            background-color: #fbbf24;
        }
        .delete-button {
            background-color: #fca5a5; /* Red 300 */
            color: #b91c1c; /* Red 800 */
        }
        .delete-button:hover {
            background-color: #f87171;
        }
        .rename-input-container {
            display: flex;
            gap: 0.5rem;
            width: 100%;
        }
        .rename-input {
            flex-grow: 1;
            padding: 0.5rem;
            border: 1px solid #d1d5db;
            border-radius: 0.375rem;
        }
        .save-button {
            padding: 0.5rem 1rem;
            background-color: #10b981;
            color: white;
            border-radius: 0.5rem;
            cursor: pointer;
        }
        .cancel-button-small {
            padding: 0.5rem 1rem;
            background-color: #d1d5db;
            color: #1f2937;
            border-radius: 0.5rem;
            cursor: pointer;
        }
        .italic-text {
            font-style: italic;
            color: #6b7280;
        }
        
        /* Modal Styles */
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
            z-index: 1000;
        }
        .modal-content {
            background: white;
            padding: 2rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            max-width: 400px;
            width: 90%;
            text-align: center;
        }
        .modal-title {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
        }
        .modal-text {
            margin-bottom: 1.5rem;
        }
        .file-name {
            font-weight: bold;
            color: #dc2626; /* Red 600 */
        }
        .modal-buttons {
            display: flex;
            justify-content: center;
            gap: 1rem;
        }
        .confirm-delete-button {
            background-color: #ef4444; /* Red 500 */
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: background-color 0.15s;
        }
        .confirm-delete-button:hover {
            background-color: #dc2626;
        }
        .cancel-button {
            background-color: #d1d5db;
            color: #1f2937;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: background-color 0.15s;
        }
        .cancel-button:hover {
            background-color: #9ca3af;
        }
        /* NEW STYLES for Scheduling UI */
        .input-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .input-group label {
            font-size: 0.875rem;
            color: #4b5563;
        }
        .input-number { 
            width: 3rem; 
            text-align: center;
            padding: 0.25rem;
            border: 1px solid #d1d5db;
            border-radius: 0.375rem;
        }

        .period-select { 
            width: 4rem;
            color: #4b5563;
            padding: 0.25rem;
            border: 1px solid #d1d5db;
            border-radius: 0.375rem;
            background-color: white;
            cursor: pointer;
        }
        
        /* New Style for the main Save All button */
        .global-save-button {
            padding: 0.75rem 2rem;
            background-color: #10b981;
            color: white;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-weight: 600;
            font-size: 1.1rem;
            transition: background-color 0.15s, opacity 0.15s;
            margin-top: 2rem;
        }
        .global-save-button:disabled {
            background-color: #9ca3af; /* Gray color for disabled */
            cursor: not-allowed;
            opacity: 0.7;
        }
        .error-message {
            color: #ef4444; /* Red 500 */
            font-size: 0.875rem;
            margin-top: 1rem;
            padding: 0.75rem;
            background-color: #fee2e2; /* Red 100 */
            border-radius: 0.375rem;
            border: 1px solid #f87171;
        }
      `}</style>
      {/* --- Main Content --- */}
      <div className="columns-container">
        {/* All Routines Column (Inactive) */}
        <div className="column">
          <h2 className="column-title">Routines (Inactive/All Data)</h2>
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
                    setIsRenaming(false); 
                  }}
                >
                  <div className="list-item-content">
                    <div>
                      <span className="routine-name">{routine.name}</span>
                      {routine.totalRuntime !== undefined && (
                        <span className="routine-runtime">
                          (Run Time: {formatTime(routine.totalRuntime)})
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
          {/* Action Buttons for Inactive Routines */}
          {selectedRoutine && (
            <div className="buttons-container">
              {isRenaming && selectedRoutine?.name === routineForActions?.name ? (
                <div className="rename-input-container">
                  <input
                    type="text"
                    value={newRoutineName}
                    onChange={(e) => setNewRoutineName(e.target.value)}
                    className="rename-input"
                    placeholder="New routine name (no extension)"
                  />
                  <button onClick={() => handleSave(selectedRoutine)} className="save-button">
                    Save
                  </button>
                  <button onClick={() => setIsRenaming(false)} className="cancel-button-small">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button 
                    onClick={() => handleEditRoutine(selectedRoutine.name)} 
                    className="edit-button-sql">
                    Edit
                  </button>
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
            title="Move to Active (Scheduled)"
          >
            →
          </button>
          <button
            onClick={() => moveToInactive(selectedActiveRoutine?.name)}
            disabled={!selectedActiveRoutine || isRenaming}
            className="transfer-button"
            title="Move to Inactive (Unschedule)"
          >
            ←
          </button>
        </div>

        {/* Active Routines Column (Scheduled) */}
        <div className="column">
          <h2 className="column-title">Active Routines (Schedule)</h2>
          {/* Error Message Display */}
          {scheduleError && <div className="error-message">{scheduleError}</div>}
          
          <ul className="routine-list">
            {isLoading ? (
              <p className="italic-text">Loading...</p>
            ) : activeRoutines.length === 0 ? (
              <p className="italic-text">No active routines.</p>
            ) : (
              activeRoutines.map((routine) => {
                const scheduleData = localSchedule[routine.name] || {};
                
                const hour = scheduleData.time12 || convert24toLocal12Hour(routine.time).hour;
                const minute = scheduleData.minute || convert24toLocal12Hour(routine.time).minute;
                const period = scheduleData.period || convert24toLocal12Hour(routine.time).period;

                // Check if this routine has unsaved local changes to highlight the input
                const hasLocalChange = hasUnsavedChanges && 
                                       (localSchedule[routine.name]?.time12 !== initialLocalSchedule[routine.name]?.time12 ||
                                        localSchedule[routine.name]?.minute !== initialLocalSchedule[routine.name]?.minute ||
                                        localSchedule[routine.name]?.period !== initialLocalSchedule[routine.name]?.period);

                // Get runtime data for display
                const routineData = allRoutines.find(r => r.name.replace('.sql', '') === routine.name);
                
                return (
                <li
                  key={routine.name}
                  className={`list-item ${selectedActiveRoutine?.name === routine.name ? 'list-item-selected' : 'list-item-default'}`}
                  onClick={() => {
                    setSelectedActiveRoutine(routine);
                    setSelectedRoutine(null);
                    setIsRenaming(false); 
                    setScheduleError(null); // Clear error when selecting a new routine
                  }}
                >
                  <div className="list-item-content">
                    <div>
                      <span className="routine-name">{routine.name}</span>
                       {/* Display runtime from allRoutines data */}
                       {routineData?.totalRuntime !== undefined && (
                        <span className="routine-runtime">
                          (Run Time: {formatTime(routineData.totalRuntime)})
                        </span>
                      )}
                      {/* Display the local 12-hour time and inputs */}
                      <div className="input-group" style={{marginTop: '0.75rem'}}>
                        <label>Start Time:</label>
                        
                        {/* Hour Input (Numerical) */}
                        <input
                            type="number"
                            value={scheduleData.time12 || ''}
                            onChange={(e) => onLocalUpdateActiveRoutine(routine.name, 'time12', e.target.value)}
                            className="input-number"
                            min="1"
                            max="12"
                            placeholder="HH"
                            style={hasLocalChange ? {border: '1px solid #3b82f6'} : {}}
                        />
                        <span>:</span>
                        {/* Minute Input (Numerical) */}
                        <input
                            type="number"
                            value={scheduleData.minute || ''}
                            onChange={(e) => onLocalUpdateActiveRoutine(routine.name, 'minute', e.target.value)}
                            className="input-number"
                            min="0"
                            max="59"
                            placeholder="MM"
                            style={hasLocalChange ? {border: '1px solid #3b82f6'} : {}}
                        />
                        
                        {/* AM/PM Dropdown */}
                        <select
                            value={scheduleData.period || 'AM'}
                            onChange={(e) => onLocalUpdateActiveRoutine(routine.name, 'period', e.target.value)}
                            className="period-select"
                            style={hasLocalChange ? {border: '1px solid #3b82f6'} : {}}
                        >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </li>
              )})
            )}
          </ul>
          {/* Action Buttons for Active Routines */}
          {selectedActiveRoutine && (
             <div className="buttons-container">
              {isRenaming && selectedActiveRoutine?.name === routineForActions?.name ? (
                <div className="rename-input-container">
                  <input
                    type="text"
                    value={newRoutineName}
                    onChange={(e) => setNewRoutineName(e.target.value)}
                    className="rename-input"
                    placeholder="New routine name (no extension)"
                  />
                  <button onClick={() => handleSave(selectedActiveRoutine)} className="save-button">
                    Save
                  </button>
                  <button onClick={() => setIsRenaming(false)} className="cancel-button-small">
                    Cancel
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
      
      {/* Global Save Button for Schedules */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={handleSaveAllSchedules}
          disabled={!hasUnsavedChanges}
          className="global-save-button"
        >
          {hasUnsavedChanges ? 'Save All Schedules' : 'No Changes to Save'}
        </button>
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