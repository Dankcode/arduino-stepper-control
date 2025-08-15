'use client';
import { useState } from 'react';

// This component is now a presentational component, receiving all data and functions as props.
const PiRoutineManager = ({ 
  allRoutines, 
  activeRoutines, 
  isLoading, 
  onLocalUpdateActiveRoutine,
  onSaveSchedule,
  onRename,
  onDeleteRoutine,
  onMoveToActive,
  onMoveToInactive
}) => {
  const [selectedRoutine, setSelectedRoutine] = useState(null);
  const [selectedActiveRoutine, setSelectedActiveRoutine] = useState(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  
  const handleRenameClick = (routine) => {
    setIsRenaming(true);
    setNewRoutineName(routine.name.replace('.txt', ''));
  };

  const handleSaveRenameClick = (routine) => {
    if (!newRoutineName || newRoutineName.endsWith('.txt')) {
      alert("Invalid name. Must not be empty and should not end with '.txt'.");
      return;
    }
    // Call the parent's function to handle the backend request
    onRename(routine.name, `${newRoutineName}.txt`);
    setIsRenaming(false);
    setNewRoutineName('');
    setSelectedRoutine(null);
    setSelectedActiveRoutine(null);
  };
  
  const handleDeleteRoutineClick = (routine) => {
    setFileToDelete(routine);
    setShowDeleteModal(true);
  };
  
  const confirmDelete = () => {
    if (fileToDelete) {
      // Call the parent's function to handle the backend request
      onDeleteRoutine(fileToDelete.name);
      setShowDeleteModal(false);
      setFileToDelete(null);
      setSelectedRoutine(null);
      setSelectedActiveRoutine(null);
    }
  };
  
  const handleMoveToActiveClick = () => {
    if (selectedRoutine) {
      onMoveToActive(selectedRoutine.name);
      setSelectedRoutine(null);
    }
  };

  const handleMoveToInactiveClick = () => {
    if (selectedActiveRoutine) {
      onMoveToInactive(selectedActiveRoutine.name);
      setSelectedActiveRoutine(null);
    }
  };

  return (
    <div>
      <style jsx>{`
        .main-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 32px;
          background-color: #f3f4f6;
          min-height: 800px;
          width: 900px;
          margin: 0 auto;
        }
        .card-container {
          width: 100%;
        }
        .main-title {
          text-align: center;
          font-size: 30px;
          font-weight: 700;
          margin-bottom: 16px;
          color: #1f2937;
        }
        .columns-container {
          display: flex;
          flex-direction: row;
          gap: 32px;
        }
        .column {
          flex: 1;
          padding: 16px;
          background-color: #f9fafb;
          border-radius: 8px;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          border: 1px solid #e5e7eb;
          min-width: 300px;
        }
        .column-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 16px;
          color: #1f2937;
        }
        .list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 384px;
          overflow-y: auto;
          padding-right: 8px;
        }
        .list-item-base {
          padding: 12px;
          border-radius: 8px;
          border: 1px solid;
          cursor: pointer;
          transition: background-color 0.2s ease-in-out;
        }
        .list-item-selected {
          background-color: #bfdbfe;
          border-color: #3b82f6;
        }
        .list-item-unselected {
          background-color: #ffffff;
          border-color: #e5e7eb;
        }
        .list-item-unselected:hover {
          background-color: #f3f4f6;
        }
        .list-item-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .list-item-text {
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
        }
        .loading-text {
          font-size: 14px;
          color: #6b7280;
          font-style: italic;
        }
        .transfer-buttons-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin: auto 0;
        }
        .transfer-button-base {
          padding: 12px;
          background-color: #3b82f6;
          color: #ffffff;
          border-radius: 9999px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          transition: background-color 0.15s ease-in-out;
        }
        .transfer-button-base:hover:not(:disabled) {
          background-color: #2563eb;
        }
        .transfer-button-base:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .input-container {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .input-number {
          width: 48px;
          text-align: center;
          padding: 4px;
          border: 1px solid;
          border-radius: 4px;
        }
        .input-time {
          width: 96px;
          padding: 4px;
          border: 1px solid;
          border-radius: 4px;
        }
        .save-button {
          margin-left: 8px;
          padding: 4px 12px;
          background-color: #10b981;
          color: white;
          border-radius: 6px;
          font-size: 14px;
          transition: background-color 0.15s ease-in-out;
        }
        .save-button:hover {
          background-color: #059669;
        }
        .save-button:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }
        .action-buttons {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          justify-content: flex-end;
        }
        .rename-button, .delete-button {
          padding: 6px 12px;
          font-size: 14px;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.15s ease-in-out;
        }
        .rename-button {
          background-color: #f59e0b;
          color: white;
        }
        .rename-button:hover {
          background-color: #d97706;
        }
        .delete-button {
          background-color: #ef4444;
          color: white;
        }
        .delete-button:hover {
          background-color: #dc2626;
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
      <div className="main-container">
        <div className="card-container">
          <h1 className="main-title">Routine Manager</h1>
          
          <div className="columns-container">
            {/* All Routines Column */}
            <div className="column">
              <h2 className="column-title">Routines</h2>
              <ul className="list">
                {isLoading ? (
                  <p className="loading-text">Loading...</p>
                ) : (
                  allRoutines.map((routine) => (
                    <li
                      key={routine.name}
                      className={`list-item-base ${selectedRoutine?.name === routine.name ? 'list-item-selected' : 'list-item-unselected'}`}
                      onClick={() => {
                        setSelectedRoutine(routine);
                        setSelectedActiveRoutine(null);
                      }}
                    >
                      <div className="list-item-content">
                        <span className="list-item-text">{routine.name}</span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
              {selectedRoutine && (
                <div className="action-buttons">
                  {isRenaming && selectedRoutine.name === selectedRoutine.name && (
                    <div className="input-container">
                      <input
                        type="text"
                        value={newRoutineName}
                        onChange={(e) => setNewRoutineName(e.target.value)}
                        className="input-number"
                      />
                      <button onClick={() => handleSaveRenameClick(selectedRoutine)} className="save-button">
                        Save Name
                      </button>
                    </div>
                  )}
                  {!isRenaming && (
                    <>
                      <button onClick={() => handleRenameClick(selectedRoutine)} className="rename-button">
                        Rename
                      </button>
                      <button onClick={() => handleDeleteRoutineClick(selectedRoutine)} className="delete-button">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Transfer Buttons */}
            <div className="transfer-buttons-container">
              <button
                onClick={handleMoveToActiveClick}
                disabled={!selectedRoutine}
                className="transfer-button-base"
                title="Move to Active"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
              <button
                onClick={handleMoveToInactiveClick}
                disabled={!selectedActiveRoutine}
                className="transfer-button-base"
                title="Move to Available"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            </div>

            {/* Active Routines Column */}
            <div className="column">
              <h2 className="column-title">Active Routines</h2>
              <ul className="list">
                {isLoading ? (
                  <p className="loading-text">Loading...</p>
                ) : activeRoutines.length === 0 ? (
                  <p className="loading-text">No active routines.</p>
                ) : (
                  activeRoutines.map((routine) => (
                    <li
                      key={routine.originalName}
                      className={`list-item-base ${selectedActiveRoutine?.originalName === routine.originalName ? 'list-item-selected' : 'list-item-unselected'}`}
                      onClick={() => {
                        setSelectedActiveRoutine(routine);
                        setSelectedRoutine(null);
                      }}
                    >
                      <div className="list-item-content">
                        <span className="list-item-text">{routine.name}</span>
                        <div className="input-container">
                          <input
                            type="number"
                            className="input-number"
                            value={routine.day || 1}
                            onChange={(e) => onLocalUpdateActiveRoutine(routine.originalName, e.target.value, routine.time)}
                            min="1"
                            max="7"
                          />
                          <input
                            type="time"
                            className="input-time"
                            value={routine.time || '00:00'}
                            onChange={(e) => onLocalUpdateActiveRoutine(routine.originalName, routine.day, e.target.value)}
                          />
                          <button
                            onClick={() => onSaveSchedule(routine)}
                            className="save-button"
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
                <div className="action-buttons">
                  {isRenaming && selectedActiveRoutine.name === selectedActiveRoutine.name && (
                    <div className="input-container">
                      <input
                        type="text"
                        value={newRoutineName}
                        onChange={(e) => setNewRoutineName(e.target.value)}
                        className="input-number"
                      />
                      <button onClick={() => handleSaveRenameClick(selectedActiveRoutine)} className="save-button">
                        Save Name
                      </button>
                    </div>
                  )}
                  {!isRenaming && (
                    <>
                      <button onClick={() => handleRenameClick(selectedActiveRoutine)} className="rename-button">
                        Rename
                      </button>
                      <button onClick={() => handleDeleteRoutineClick(selectedActiveRoutine)} className="delete-button">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal">
          <div className="modal-content">
            <h3 className="text-lg font-bold">Confirm Deletion</h3>
            <p className="mt-2">Are you sure you want to delete <span className="font-semibold">{fileToDelete?.name}</span>?</p>
            <div className="modal-buttons">
              <button onClick={confirmDelete} className="confirm-delete">
                Confirm Delete
              </button>
              <button onClick={() => setShowDeleteModal(false)} className="cancel-delete">
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
