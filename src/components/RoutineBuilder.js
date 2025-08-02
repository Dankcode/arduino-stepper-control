import React, { useState } from 'react';
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
        .map(() => ({ method: null, parameters: {} }))
    );
};

// Available methods with their parameter options
const availableMethods = [
  { name: 'Aspirate', params: ['volume', 'speed'] },
  { name: 'Dispense', params: ['volume', 'speed'] },
  { name: 'Mix', params: ['cycles', 'speed'] },
  { name: 'Incubate', params: ['time', 'temperature'] },
  { name: 'Custom', params: ['command', 'steps'] },
];

const RoutineBuilder = () => {
  // State for the single merged plate
  const [plate, setPlate] = useState({
    id: 1, // Still useful for identification, even if only one
    baseLayout: '96-well', // Can be '96-well' or '48-well'
    data: generateMergedPlateData('96-well'),
  });

  const [draggedMethod, setDraggedMethod] = useState(null); // For individual well drag-and-drop
  const [selectedMethod, setSelectedMethod] = useState(null); // For applying to whole plate
  const [selectedWellCoords, setSelectedWellCoords] = useState(null); // { rowIndex, colIndex } of selected well
  const [copiedWellData, setCopiedWellData] = useState(null); // { method, parameters } of copied well

  // Drag and drop handlers for methods (from palette)
  const handleDragStart = (method) => (e) => {
    setDraggedMethod(method);
    setSelectedMethod(method); // Also set as selected method when dragged
  };

  // Click handler for methods (from palette)
  const handleMethodClick = (method) => () => {
    setSelectedMethod(method);
    setDraggedMethod(null); // Clear dragged method if clicked
  };

  // Drop handler for wells (passed to MergedPlateTable)
  const handleDrop = (rowIndex, colIndex) => (e) => {
    e.preventDefault();
    if (!draggedMethod) return;

    setPlate((prevPlate) => {
      const newData = [...prevPlate.data];
      newData[rowIndex][colIndex] = { ...draggedMethod, parameters: {} };
      return { ...prevPlate, data: newData };
    });
    setDraggedMethod(null); // Clear dragged method after drop
  };

  // Well customization handler (passed to MergedPlateTable)
  const handleWellCustomization = (rowIndex, colIndex, param, value) => {
    setPlate((prevPlate) => {
      const newData = [...prevPlate.data];
      const well = { ...newData[rowIndex][colIndex] };
      well.parameters[param] = value;
      newData[rowIndex][colIndex] = well;
      return { ...prevPlate, data: newData };
    });
  };

  // Base plate layout customization (96-well vs 48-well)
  const handleBaseLayoutChange = (newLayout) => {
    setPlate((prevPlate) => ({
      ...prevPlate,
      baseLayout: newLayout,
      data: generateMergedPlateData(newLayout), // Regenerate data for new layout
    }));
  };

  // Apply selected method to all wells of the merged plate
  const handleApplyMethodToAllWells = () => {
    if (!selectedMethod) {
      alert('Please select a method first.');
      return;
    }

    setPlate((prevPlate) => {
      const [totalRows, totalCols] = [prevPlate.data.length, prevPlate.data[0].length];
      const newPlateData = Array(totalRows)
        .fill(null)
        .map(() =>
          Array(totalCols)
            .fill(null)
            .map(() => ({ ...selectedMethod, parameters: {} }))
        );
      return { ...prevPlate, data: newPlateData };
    });
    alert(`Method "${selectedMethod.name}" applied to all wells.`);
  };

  // Handle well selection for copy/paste
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
    setCopiedWellData({ ...wellContent, parameters: { ...wellContent.parameters } }); // Deep copy
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
      newData[rowIndex][colIndex] = { ...copiedWellData, parameters: { ...copiedWellData.parameters } }; // Deep paste
      return { ...prevPlate, data: newData };
    });
    alert(`Content pasted to well ${String.fromCharCode(65 + selectedWellCoords.rowIndex)}${selectedWellCoords.colIndex + 1}.`);
  };

  // Save routine to a text file
  const handleSaveRoutine = () => {
    const routineData = {
      plate: {
        id: plate.id,
        baseLayout: plate.baseLayout,
        // Flatten the 2D array of wells into a 1D array for simpler storage/parsing
        wells: plate.data.flat().map(well => ({
          method: well.method,
          parameters: well.parameters
        }))
      }
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
          width: 280px;
          background-color: #ffffff;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
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

        .methods-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 0.75rem;
        }

        .method-item {
          padding: 0.75rem 0.5rem;
          border: 1px solid #a78bfa;
          border-radius: 0.5rem;
          cursor: grab;
          background-color: #ede9fe;
          color: #5b21b6;
          font-weight: 600;
          text-align: center;
          transition: all 0.2s ease-in-out;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .method-item:hover {
          background-color: #c4b5fd;
          color: #4c1d95;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }

        .method-item.selected-method {
          border-color: #3b82f6;
          background-color: #dbeafe;
          color: #1e40af;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
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

        .apply-method-button {
          background-color: #3b82f6;
        }
        .apply-method-button:hover:not(:disabled) {
          background-color: #2563eb;
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
            flex-direction: column;
            gap: 0.5rem;
            align-items: center;
        }

        .layout-selector {
            padding: 0.5rem 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 0.5rem;
            background-color: white;
            font-size: 0.9rem;
            cursor: pointer;
            width: 100%;
            text-align: center;
        }
      `}</style>
      <div className="control-panel">
        <h1 className="header">Plate Routine Builder</h1>

        {/* Methods Palette */}
        <div className="panel-section">
          <h2>Available Methods</h2>
          <div className="methods-grid">
            {availableMethods.map((method, index) => (
              <div
                key={index}
                draggable
                onDragStart={handleDragStart(method)}
                onClick={handleMethodClick(method)}
                className={`method-item ${selectedMethod && selectedMethod.name === method.name ? 'selected-method' : ''}`}
              >
                {method.name}
              </div>
            ))}
          </div>
        </div>

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

        {/* Global Controls */}
        <div className="panel-section control-buttons-group">
          <h2>Routine Actions</h2>
          <button
            onClick={handleApplyMethodToAllWells}
            disabled={!selectedMethod}
            className="control-button apply-method-button"
          >
            Apply "{selectedMethod ? selectedMethod.name : 'Method'}" to All Wells
          </button>

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
        handleDrop={handleDrop}
        handleWellCustomization={handleWellCustomization}
        selectedWellCoords={selectedWellCoords}
        onWellSelect={handleWellSelect}
      />
    </div>
  );
};

export default RoutineBuilder;
