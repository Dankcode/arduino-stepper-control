import React, { useState, useCallback, useMemo } from 'react';
import MergedPlateTable from './MergedPlateTable';
import { wellSchema } from './plateSchema';

// The base URL for the Raspberry Pi backend.
const PI_BACKEND_URL = 'http://192.168.1.9:5000';

// Helper function to get row and column counts for a given layout.
const getLayoutDimensions = (layout) => {
  if (layout === '96-well') {
    return { rows: 8, cols: 12 };
  }
  if (layout === '48-well') {
    return { rows: 6, cols: 8 };
  }
  return { rows: 0, cols: 0 }; // 'none' layout has 0 dimensions
};

// Creates a data array for a given layout, with default values from the schema.
const createPlateData = (layout) => {
  const { rows, cols } = getLayoutDimensions(layout);
  // Initialize wells with an object containing all parameter keys with default values from schema
  const defaultWellData = Object.keys(wellSchema.properties).reduce((acc, key) => {
    acc[key] = wellSchema.properties[key].default;
    return acc;
  }, {});

  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ ...defaultWellData }))
  );
};

// Helper function to create a default filename with a timestamp
const createDefaultFilename = () => {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${date}-${time}`;
};

const RoutineBuilder = () => {
  // State to manage the layout for each quadrant, defaulting to one active plate
  const [quadrantLayouts, setQuadrantLayouts] = useState({
    topLeft: '96-well',
    topRight: 'none',
    bottomLeft: 'none',
    bottomRight: 'none',
  });

  // State to hold the actual data for each quadrant - this is the single source of truth
  const [quadrantData, setQuadrantData] = useState({
    topLeft: createPlateData('96-well'),
    topRight: null,
    bottomLeft: null,
    bottomRight: null,
  });

  // State for the coordinates of the currently selected well (for single well input/copy source)
  const [selectedWellCoords, setSelectedWellCoords] = useState(null);
  // State for the custom filename
  const [filename, setFilename] = useState(createDefaultFilename());
  // State for displaying messages to the user (e.g., success/error)
  const [message, setMessage] = useState('');
  // State to indicate if an action is in progress
  const [loading, setLoading] = useState(false);

  // A memoized map of quadrant properties for easy access
  const quadrantMap = {
    topLeft: { startRow: 0, startCol: 0 },
    topRight: { startRow: 0, startCol: 12 },
    bottomLeft: { startRow: 8, startCol: 0 },
    bottomRight: { startRow: 8, startCol: 12 },
  };

  // Handle well selection for copy/paste source and value input
  const handleWellSelect = (rowIndex, colIndex) => {
    setSelectedWellCoords({ rowIndex, colIndex });
  };

  // Callback for when a quadrant's layout is changed
  const handleLayoutChange = useCallback((quadrant, layout) => {
    setQuadrantLayouts(prev => ({ ...prev, [quadrant]: layout }));
    if (layout === 'none') {
      setQuadrantData(prev => ({ ...prev, [quadrant]: null }));
    } else {
      setQuadrantData(prev => ({ ...prev, [quadrant]: createPlateData(layout) }));
    }
  }, []);

  // useMemo hook to calculate the total runtime whenever quadrantData changes.
  const totalRuntime = useMemo(() => {
    let total = 0;
    
    Object.values(quadrantData).forEach(quadrant => {
      if (quadrant) {
        quadrant.forEach(row => {
          row.forEach(well => {
            if (well) {
              total += parseInt(well.stepAmount || '0', 10);
              total += parseInt(well.delayBetweenStep || '0', 10);
              total += parseInt(well.lightTime || '0', 10);
              total += parseInt(well.exposureTime || '0', 10);
            }
          });
        });
      }
    });
    
    return total;
  }, [quadrantData]);

  // Function to convert seconds to days, hours, minutes, and remaining seconds
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

  // Handle filename change and sanitize the input
  const handleFilenameChange = (e) => {
    // Allows letters, numbers, hyphens, underscores, and periods
    const sanitizedName = e.target.value.replace(/[^a-zA-Z0-9-_.]/g, '');
    setFilename(sanitizedName);
  };
  
  // Combines the logic for creating and uploading the routine to the backend.
  const handleSaveAndUploadRoutine = async () => {
    if (!filename) {
      setMessage('Please enter a filename.');
      return;
    }

    setLoading(true);
    setMessage('Uploading routine...');

    // Process all quadrant data into the required JSON format
    const routineData = [];
    
    const processQuadrant = (quadrantDataArray, plateType) => {
      if (plateType === 'none' || !quadrantDataArray) {
        return [];
      }
      
      const wells = [];
      const { rows, cols } = getLayoutDimensions(plateType);
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const well = quadrantDataArray[r]?.[c];
          
          if (well) {
            const wellId = `${String.fromCharCode(65 + r)}${c + 1}`;
            wells.push({
              well: wellId,
              stepAmount: well.stepAmount,
              delayBetweenStep: well.delayBetweenStep,
              lightTime: well.lightTime,
              exposureTime: well.exposureTime,
              switchPlate: well.switchPlate,
            });
          }
        }
      }
      return wells;
    };
    
    const quadrants = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
    let plateNumber = 1;
    quadrants.forEach(quadrant => {
      const layout = quadrantLayouts[quadrant];
      const quadrantDataArray = quadrantData[quadrant];

      const quadrantProcessedData = processQuadrant(
        quadrantDataArray,
        layout
      );
      
      const plateObject = {};
      plateObject[`${plateNumber}`] = quadrantProcessedData;
      routineData.push(plateObject);
      plateNumber++;
    });

    const routineString = JSON.stringify(routineData, null, 2);
    const blob = new Blob([routineString], { type: 'text/plain' });
    const file = new File([blob], `${filename}.txt`, { type: 'text/plain' });
    
    const formData = new FormData();
    formData.append('routine_file', file);
    
    try {
      const response = await fetch(`${PI_BACKEND_URL}/upload_routine`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setMessage(result.message || 'Routine uploaded successfully!');
      } else {
        const errorText = await response.text();
        setMessage(`Error: ${errorText}`);
        console.error('Upload failed:', response.status, errorText);
      }
    } catch (error) {
      setMessage('Failed to upload routine. Check the backend connection.');
      console.error('Network error during upload:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="routine-builder-container">
      <style>{`
        body {
          margin: 0;
          font-family: 'Inter', sans-serif;
          overflow: hidden;
        }
        .routine-builder-container {
          display: flex;
          height: 100vh;
          background-color: #f3f4f6;
          font-family: 'Inter', sans-serif;
          padding: 1.5rem;
          box-sizing: border-box;
        }

        .control-panel {
          background-color: #ffffff;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          border-radius: 0.75rem;
          overflow-y: auto;
          flex-shrink: 0;
          margin-right: 1.5rem;
          width: 300px;
        }

        .plate-wrapper {
          flex-grow: 1;
          overflow: auto;
        }

        .panel-section {
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 0.75rem;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
          margin-bottom: 1rem;
        }

        .panel-section h2 {
          font-size: 1.1rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 0.75rem;
          text-align: center;
        }
        
        .filename-input {
          padding: 0.4rem;
          border: 1px solid #d1d5db;
          border-radius: 0.3rem;
          font-size: 0.85rem;
          flex-grow: 1;
          box-sizing: border-box;
          width: 50%;
        }

        .input-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          justify-content: space-between;
        }
        
        .input-group label {
          font-size: 0.9rem;
          color: #374151;
          flex-shrink: 0;
          width: 80px;
          text-align: left;
        }

        .control-buttons-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .control-button {
          padding: 0.6rem 0.8rem;
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

        .copy-paste-context {
          font-size: 0.8rem;
          color: #6b7280;
          text-align: center;
          margin: 0.25rem 0;
          padding: 0.4rem;
          background-color: #f9fafb;
          border-radius: 0.5rem;
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
            gap: 0.5rem;
            align-items: center;
        }

        .repeat-schedule-group .input-group {
            width: 100%;
            justify-content: space-between;
        }

        .repeat-schedule-group select,
        .repeat-schedule-group input[type="time"] {
            padding: 0.4rem;
            border: 1px solid #d1d5db;
            border-radius: 0.3rem;
            font-size: 0.85rem;
            flex-grow: 1;
            box-sizing: border-box;
        }
        
        .runtime-display {
          font-size: 0.9rem;
          font-weight: 600;
          color: #1f2937;
          text-align: center;
          margin-top: 0.75rem;
        }
        
        .message-display {
          padding: 0.75rem;
          border-radius: 0.5rem;
          background-color: #f3f4f6;
          border: 1px solid #e5e7eb;
          margin-top: 1rem;
          margin-bottom: 1rem;
          text-align: center;
        }

        .message-text {
          font-size: 0.875rem;
          color: #4b5563;
        }

        .loading-spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top-color: #10b981;
          border-radius: 50%;
          height: 1.5rem;
          width: 1.5rem;
          margin-top: 1rem;
        }
      `}</style>
      <div className="control-panel">

        {/* Global Controls */}
        <div className="panel-section control-buttons-group">
          <h2>Routine Actions</h2>
          <div className="copy-paste-context">
            Use Ctrl + C to copy and Ctrl + V to paste.
          </div>
          <div className="input-group">
            <label htmlFor="filename">File Name:</label>
            <input
              type="text"
              id="filename"
              value={filename}
              onChange={handleFilenameChange}
              className="filename-input"
              placeholder="e.g. MyRoutine_01"
            />
          </div>
          <button
            onClick={handleSaveAndUploadRoutine}
            className="control-button save-button"
            disabled={loading}
          >
            {loading ? 'Uploading...' : 'Save & Upload Routine'}
          </button>
        </div>
        
        {/* Total Runtime Display */}
        <div className="panel-section">
          <h2>Total Runtime</h2>
          <div className="runtime-display">
            {formatTime(totalRuntime)}
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div className="message-display">
            <p className="message-text">{message}</p>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="mt-4 text-center">
            <div className="loading-spinner"></div>
          </div>
        )}
      </div>
      
      {/* Merged Plate Table Display Area */}
      <div className="plate-wrapper">
        <MergedPlateTable
          quadrantLayouts={quadrantLayouts}
          quadrantData={quadrantData}
          setQuadrantData={setQuadrantData}
          selectedWellCoords={selectedWellCoords}
          onWellSelect={handleWellSelect}
          onLayoutChange={handleLayoutChange}
        />
      </div>
    </div>
  );
};

export default RoutineBuilder;
