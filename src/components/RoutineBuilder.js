import React, { useState, useEffect } from 'react';
import MergedPlateTable from './MergedPlateTable'; // Import the new merged plate component

// Helper function to generate an empty plate data structure for the merged table
const generateMergedPlateData = (baseLayout) => {
  let baseRows, baseCols;
  if (baseLayout === '96-well') {
    baseRows = 8;
    baseCols = 12;
  } else { // 48-well
    baseRows = 6;
    baseCols = 8;
  }

  const totalRows = baseRows * 2; // 2x2 quadrant
  const totalCols = baseCols * 2; // 2x2 quadrant

  return Array(totalRows)
    .fill(null)
    .map(() =>
      Array(totalCols)
        .fill(null)
        // Initialize wells with an object containing all parameter keys with empty strings
        .map(() => ({
          stepAmount: '',
          delayBetweenStep: '',
          lightTime: '',
          exposureTime: '',
          switchPlate: '',
        }))
    );
};

const RoutineBuilder = () => {
  // State for the single merged plate
  const [plate, setPlate] = useState({
    id: 1,
    baseLayout: '96-well',
    data: generateMergedPlateData('96-well'),
  });

  // State for the coordinates of the currently selected well
  const [selectedWellCoords, setSelectedWellCoords] = useState(null);
  // State for the data copied from a well
  const [copiedWellData, setCopiedWellData] = useState(null);

  // States for routine repetition
  const [repeatFrequency, setRepeatFrequency] = useState('daily');
  const [repeatTime, setRepeatTime] = useState('09:00'); // Default time

  // Handle individual input changes for well parameters
  // This function now directly updates the plate data for the selected well
  const handleWellInputChange = (paramName) => (e) => {
    const value = e.target.value;
    if (selectedWellCoords) {
      setPlate((prevPlate) => {
        const newData = [...prevPlate.data];
        const { rowIndex, colIndex } = selectedWellCoords;
        // Create a deep copy of the well's data to ensure immutability
        const updatedWell = { ...newData[rowIndex][colIndex],
          [paramName]: value
        };
        newData[rowIndex][colIndex] = updatedWell;
        return { ...prevPlate, data: newData };
      });
    }
  };

  // Base plate layout customization (96-well vs 48-well)
  const handleBaseLayoutChange = (newLayout) => {
    setPlate((prevPlate) => ({
      ...prevPlate,
      baseLayout: newLayout,
      data: generateMergedPlateData(newLayout), // Regenerate data for new layout
    }));
    setSelectedWellCoords(null); // Deselect well on layout change
  };

  // Handle well selection for copy/paste and value input
  const handleWellSelect = (rowIndex, colIndex) => {
    setSelectedWellCoords({ rowIndex, colIndex });
  };

  // Copy content of selected well
  const handleCopyWell = () => {
    if (!selectedWellCoords) {
      alert('Please select a well to copy.');
      return;
    }
    const { rowIndex, colIndex } = selectedWellCoords;
    const wellContent = plate.data[rowIndex][colIndex];
    // Deep copy all properties of the well
    setCopiedWellData({ ...wellContent });
    alert(`Content of well ${String.fromCharCode(65 + rowIndex)}${colIndex + 1} copied.`);
  };

  // Paste content to selected well
  const handlePasteWell = () => {
    if (!copiedWellData) {
      alert('No well content copied yet. Please copy a well first.');
      return;
    }
    if (!selectedWellCoords) {
      alert('Please select a well to paste into.');
      return;
    }

    setPlate((prevPlate) => {
      const newData = [...prevPlate.data];
      const { rowIndex, colIndex } = selectedWellCoords;
      // Deep paste all properties
      newData[rowIndex][colIndex] = { ...copiedWellData };
      return { ...prevPlate, data: newData };
    });
    alert(`Content pasted to well ${String.fromCharCode(65 + selectedWellCoords.rowIndex)}${selectedWellCoords.colIndex + 1}.`);
  };

  // Save routine to a text file
  const handleSaveRoutine = () => {
    const flattenedWells = [];
    plate.data.forEach((row, rowIndex) => {
      row.forEach((well, colIndex) => {
        const wellId = `${String.fromCharCode(65 + rowIndex)}${colIndex + 1}`;
        // Only include well if it has any non-empty parameter
        const hasContent = Object.values(well).some(value => value !== '');
        if (hasContent) {
          flattenedWells.push({
            well: wellId,
            Step: well.stepAmount || '',
            delay: well.delayBetweenStep || '',
            LT: well.lightTime || '',
            exposure: well.exposureTime || '',
            switch: well.switchPlate || '',
          });
        }
      });
    });

    const routineData = {
      plateType: plate.baseLayout,
      routineSchedule: {
        repeatFrequency: repeatFrequency,
        repeatTime: repeatTime,
      },
      wells: flattenedWells,
    };

    const routineString = JSON.stringify(routineData, null, 2);
    const blob = new Blob([routineString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'routine.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Upload routine to Python backend
  const handleUploadRoutine = async (file) => {
    if (!file) {
      alert('Please select a file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('routine_file', file);

    try {
      const response = await fetch('http://localhost:5000/upload_routine', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert('Routine uploaded successfully!');
        const result = await response.json();
        console.log('Backend response:', result);
      } else {
        const errorText = await response.text();
        alert(`Failed to upload routine: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error uploading routine:', error);
      alert('Network error. Could not connect to the backend. Ensure your Python backend is running on localhost:5000.');
    }
  };

  // Get the current well's values for display in input fields
  const getCurrentWellValues = () => {
    if (selectedWellCoords) {
      const { rowIndex, colIndex } = selectedWellCoords;
      return plate.data[rowIndex][colIndex];
    }
    return {
      stepAmount: '',
      delayBetweenStep: '',
      lightTime: '',
      exposureTime: '',
      switchPlate: '',
    };
  };
  const currentWellValues = getCurrentWellValues();

  return (
    <div className="routine-builder-container">
      <style>{`
        body {
          margin: 0;
          font-family: 'Inter', sans-serif;
          overflow: hidden; /* Prevent body scroll */
        }
        .routine-builder-container {
          display: flex;
          height: 100vh;
          background-color: #f3f4f6;
          font-family: 'Inter', sans-serif;
          padding: 1.5rem; /* Added padding for overall margins */
          box-sizing: border-box; /* Include padding in element's total width and height */
        }

        .control-panel {
          background-color: #ffffff;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          border-radius: 0.75rem; /* Rounded all corners */
          overflow-y: auto; /* Allow control panel to scroll if content is long */
          flex-shrink: 0; /* Prevent panel from shrinking */
          margin-right: 1.5rem; /* Margin between control panel and table */
        }

        .panel-section {
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1rem;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .panel-section h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 1rem;
          text-align: center;
        }

        .input-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .input-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .input-group label {
          font-size: 0.9rem;
          color: #374151;
          flex-shrink: 0;
          width: 100px; /* Fixed width for labels */
          text-align: right;
        }

        .value-input {
          padding: 0.5rem; /* Smaller padding */
          border: 1px solid #d1d5db;
          border-radius: 0.3rem; /* Slightly smaller border radius */
          font-size: 0.9rem; /* Smaller font size */
          flex-grow: 1; /* Allow input to take remaining space */
          box-sizing: border-box;
        }

        .control-buttons-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .control-button {
          padding: 0.75rem 1rem;
          color: white;
          border-radius: 0.5rem;
          font-weight: 600;
          transition: background-color 0.2s ease-in-out, transform 0.1s ease-in-out;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .control-button:active {
          transform: translateY(1px);
        }

        .control-button:disabled {
          background-color: #d1d5db;
          cursor: not-allowed;
          box-shadow: none;
        }

        .save-button {
          background-color: #10b981;
        }
        .save-button:hover:not(:disabled) {
          background-color: #059669;
        }

        .upload-label {
          background-color: #8b5cf6;
          position: relative;
        }
        .upload-label:hover:not(:disabled) {
          background-color: #7c3aed;
        }

        .copy-paste-button {
          background-color: #f59e0b;
        }
        .copy-paste-button:hover:not(:disabled) {
          background-color: #d97706;
        }

        .upload-input {
          position: absolute;
          width: 0;
          height: 0;
          opacity: 0;
          overflow: hidden;
        }

        .layout-selector-group {
            display: flex;
            color: #1f2937;
            flex-direction: column;
            align-items: center;
        }

        .layout-selector {
            padding: 0.5rem 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 0.5rem;
            background-color: white;
            cursor: pointer;
            width: 100%;
            text-align: center;
        }

        .repeat-schedule-group {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            align-items: center;
        }

        .repeat-schedule-group .input-group {
            width: 100%;
            justify-content: space-between;
        }

        .repeat-schedule-group select,
        .repeat-schedule-group input[type="time"] {
            padding: 0.5rem;
            border: 1px solid #d1d5db;
            border-radius: 0.3rem;
            font-size: 0.9rem;
            flex-grow: 1;
            box-sizing: border-box;
        }
      `}</style>
      <div className="control-panel">
        {/* Layout Selection */}
        <div className="panel-section layout-selector-group">
            <h2>Plate Layout</h2>
            <select
                value={plate.baseLayout}
                onChange={(e) => handleBaseLayoutChange(e.target.value)}
                className="layout-selector"
            >
                <option value="96-well">96-well Base (16x24 Grid)</option>
                <option value="48-well">48-well Base (12x16 Grid)</option>
            </select>
        </div>

        {/* Value Input Section */}
        <div className="panel-section input-section">
          <h2>Well Parameters</h2>
          <div className="input-group">
            <label htmlFor="stepAmount">Step Amount:</label>
            <input
              id="stepAmount"
              type="text"
              value={currentWellValues.stepAmount}
              onChange={handleWellInputChange('stepAmount')}
              placeholder="e.g., 100"
              className="value-input"
              disabled={!selectedWellCoords}
            />
          </div>
          <div className="input-group">
            <label htmlFor="delayBetweenStep">Delay Between Step:</label>
            <input
              id="delayBetweenStep"
              type="text"
              value={currentWellValues.delayBetweenStep}
              onChange={handleWellInputChange('delayBetweenStep')}
              placeholder="e.g., 500ms"
              className="value-input"
              disabled={!selectedWellCoords}
            />
          </div>
          <div className="input-group">
            <label htmlFor="lightTime">Light Time:</label>
            <input
              id="lightTime"
              type="text"
              value={currentWellValues.lightTime}
              onChange={handleWellInputChange('lightTime')}
              placeholder="e.g., 60s"
              className="value-input"
              disabled={!selectedWellCoords}
            />
          </div>
          <div className="input-group">
            <label htmlFor="exposureTime">Exposure Time:</label>
            <input
              id="exposureTime"
              type="text"
              value={currentWellValues.exposureTime}
              onChange={handleWellInputChange('exposureTime')}
              placeholder="e.g., 100ms"
              className="value-input"
              disabled={!selectedWellCoords}
            />
          </div>
          <div className="input-group">
            <label htmlFor="switchPlate">Switch Plate:</label>
            <input
              id="switchPlate"
              type="text"
              value={currentWellValues.switchPlate}
              onChange={handleWellInputChange('switchPlate')}
              placeholder="e.g., Plate 2"
              className="value-input"
              disabled={!selectedWellCoords}
            />
          </div>
        </div>

        {/* Routine Repetition Schedule */}
        <div className="panel-section repeat-schedule-group">
            <h2>Routine Schedule</h2>
            <div className="input-group">
                <label htmlFor="repeatFrequency">Repeat every:</label>
                <select
                    id="repeatFrequency"
                    value={repeatFrequency}
                    onChange={(e) => setRepeatFrequency(e.target.value)}
                >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
            </div>
            <div className="input-group">
                <label htmlFor="repeatTime">At time:</label>
                <input
                    id="repeatTime"
                    type="time"
                    value={repeatTime}
                    onChange={(e) => setRepeatTime(e.target.value)}
                />
            </div>
        </div>

        {/* Global Controls */}
        <div className="panel-section control-buttons-group">
          <h2>Routine Actions</h2>
          <button
            onClick={handleCopyWell}
            disabled={!selectedWellCoords}
            className="control-button copy-paste-button"
          >
            Copy Well {selectedWellCoords ? `(${String.fromCharCode(65 + selectedWellCoords.rowIndex)}${selectedWellCoords.colIndex + 1})` : ''}
          </button>
          <button
            onClick={handlePasteWell}
            disabled={!copiedWellData || !selectedWellCoords}
            className="control-button copy-paste-button"
          >
            Paste to Well {selectedWellCoords ? `(${String.fromCharCode(65 + selectedWellCoords.rowIndex)}${selectedWellCoords.colIndex + 1})` : ''}
          </button>

          <button
            onClick={handleSaveRoutine}
            className="control-button save-button"
          >
            Save Routine (.txt)
          </button>
          <label className="control-button upload-label">
            Upload Routine to Backend
            <input
              type="file"
              accept=".txt"
              className="upload-input"
              onChange={(e) => handleUploadRoutine(e.target.files[0])}
            />
          </label>
        </div>
      </div>

      {/* Merged Plate Table Display Area */}
      <MergedPlateTable
        plate={plate}
        selectedWellCoords={selectedWellCoords}
        onWellSelect={handleWellSelect}
      />
    </div>
  );
};

export default RoutineBuilder;
