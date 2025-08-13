import React, { useState, useCallback, useEffect, useMemo } from 'react';
import MergedPlateTable from './MergedPlateTable';
import { wellSchema } from './plateSchema';

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
  return `${date}-${time}-wellplates-wellplates2`;
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
  // This is the part that automatically updates the display when you edit a well.
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

  // Save routine to a text file with the new structured format
  const handleSaveRoutine = () => {
    // Start with an object that contains the total runtime in a summary section
    const routineData = [
      {
        routineSummary: {
          totalRuntime: formatTime(totalRuntime),
        },
      },
    ];
    
    // Helper function to process a quadrant's data
    const processQuadrant = (quadrantName, quadrantDataArray, plateType) => {
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
    
    // Process each quadrant and add to the plates array in the specified order
    const quadrants = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
    let plateNumber = 1;
    quadrants.forEach(quadrant => {
      const layout = quadrantLayouts[quadrant];
      const quadrantDataArray = quadrantData[quadrant];

      const quadrantProcessedData = processQuadrant(
        quadrant,
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename + '.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Upload routine to Python backend
  const handleUploadRoutine = async (file) => {
    if (!file) {
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
        const result = await response.json();
      } else {
        const errorText = await response.text();
      }
    } catch (error) {
      console.error('Error uploading routine:', error);
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
        
        .runtime-display {
          font-size: 0.9rem;
          font-weight: 600;
          color: #1f2937;
          text-align: center;
          margin-top: 0.75rem;
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
        
        {/* Total Runtime Display */}
        <div className="panel-section">
          <h2>Total Runtime</h2>
          <div className="runtime-display">
            {formatTime(totalRuntime)}
          </div>
        </div>
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
