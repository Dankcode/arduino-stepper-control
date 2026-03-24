import React, { useState, useCallback, useMemo } from 'react';
import MergedPlateTable from './MergedPlateTable';
import { wellSchema } from './plateSchema';

// The base URL for the Raspberry Pi backend.
const PI_BACKEND_URL = 'http://192.168.1.7:5000';

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
  // State for the currently selected range
  const [selectedRange, setSelectedRange] = useState(null);

  // NEW: State for repeat schedule
  const [repeatCount, setRepeatCount] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [repeatInterval, setRepeatInterval] = useState('daily');

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

  // NEW: Handle JSON file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (json.well_data) {
          // Flatten well_data back into quadrantData
          const newData = { ...quadrantData };
          const newLayouts = { ...quadrantLayouts };

          // Simplified: assume 96-well for import if not specified
          // In a real app, we'd infer from the data structure

          json.well_data.forEach(item => {
            const quadName = item.plateNumber === 1 ? 'topLeft' :
              item.plateNumber === 2 ? 'topRight' :
                item.plateNumber === 3 ? 'bottomLeft' : 'bottomRight';

            if (!newData[quadName]) {
              newData[quadName] = createPlateData('96-well');
              newLayouts[quadName] = '96-well';
            }

            const rowLabel = item.wellId.charAt(0);
            const colNum = parseInt(item.wellId.slice(1), 10);
            const rowIndex = rowLabel.charCodeAt(0) - 65;
            const colIndex = colNum - 1;

            if (newData[quadName][rowIndex] && newData[quadName][rowIndex][colIndex]) {
              newData[quadName][rowIndex][colIndex] = {
                ...newData[quadName][rowIndex][colIndex],
                stepAmount: item.stepAmount,
                delayBetweenStep: item.delayBetweenStep,
                lightTime: item.lightTime,
                exposureTime: item.exposureTime,
                switchPlate: item.switchPlate === 1
              };
            }
          });

          setQuadrantData(newData);
          setQuadrantLayouts(newLayouts);
          setFilename(file.name.replace('.json', ''));
          setMessage('Routine imported successfully.');
        }
      } catch (err) {
        console.error('Import failed:', err);
        setMessage('Failed to parse routine file.');
      }
    };
    reader.readAsText(file);
  };

  // NEW: Get current value for parameter from selection (first well)
  const getSelectedWellValue = (param) => {
    if (!selectedWellCoords) return '';
    const { rowIndex, colIndex } = selectedWellCoords;
    const quad = Object.keys(quadrantMap).find(q => {
      const { startRow, startCol } = quadrantMap[q];
      return rowIndex >= startRow && rowIndex < startRow + 8 && colIndex >= startCol && colIndex < startCol + 12;
    });
    if (!quad || !quadrantData[quad]) return '';
    const localRow = rowIndex - quadrantMap[quad].startRow;
    const localCol = colIndex - quadrantMap[quad].startCol;
    const val = quadrantData[quad][localRow]?.[localCol]?.[param];
    return val !== undefined ? val : '';
  };

  // NEW: Handle batch update for parameters
  const handleBatchParamChange = (param, value) => {
    if (!selectedRange) return;

    // Convert checkbox to boolean, numbers to numbers
    let processedValue = value;
    if (param === 'switchPlate') {
      processedValue = !!value;
    }

    const { startRow, endRow, startCol, endCol } = selectedRange;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    setQuadrantData(prev => {
      const nextData = { ...prev };

      // Iterate through all quadrants and update wells in range
      ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].forEach(quad => {
        if (!nextData[quad]) return;
        const { startRow: quadStartRow, startCol: quadStartCol } = quadrantMap[quad];

        const newQuad = nextData[quad].map((row, rIdx) => {
          const globalRow = quadStartRow + rIdx;
          if (globalRow < minRow || globalRow > maxRow) return row;

          return row.map((well, cIdx) => {
            const globalCol = quadStartCol + cIdx;
            if (globalCol < minCol || globalCol > maxCol) return well;
            return { ...well, [param]: processedValue };
          });
        });
        nextData[quad] = newQuad;
      });

      return nextData;
    });
  };

  // Combines the logic for creating and uploading the routine to the backend.
  const handleSaveAndUploadRoutine = async () => {
    if (!filename) {
      setMessage('Please enter a filename.');
      return;
    }

    setLoading(true);
    setMessage('Saving routine to SQL database...');

    // This will hold the structured data array for the 'well_data' table
    const well_data_list = [];
    const quadrants = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
    let plateNumber = 1;

    // --- Step 1: Generate the flat well_data array (JSON payload structure) ---
    quadrants.forEach(quadrant => {
      const layout = quadrantLayouts[quadrant];
      const quadrantDataArray = quadrantData[quadrant];

      if (layout !== 'none' && quadrantDataArray) {
        // NOTE: getLayoutDimensions, quadrantLayouts, quadrantData must be defined outside this function
        const { rows, cols } = getLayoutDimensions(layout);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const well = quadrantDataArray[r]?.[c];

            if (well) {
              const wellId = `${String.fromCharCode(65 + r)}${c + 1}`;

              // Construct the JSON object for the well data
              // The filename link is implicit in the final JSON body
              well_data_list.push({
                plateNumber: plateNumber,
                wellId: wellId,
                stepAmount: well.stepAmount || 0,
                delayBetweenStep: well.delayBetweenStep || 0,
                lightTime: well.lightTime || 0,
                exposureTime: well.exposureTime || 0,
                // Convert boolean switchPlate to integer (1 or 0) for the SQL database
                switchPlate: well.switchPlate ? 1 : 0
              });
            }
          }
        }
      }
      plateNumber++;
    });

    console.log('Generated Well Data List:', well_data_list);

    // --- Step 2: Send the Routine Data to the Dedicated SQL Saving Endpoint ---
    try {
      // The backend now expects the filename (the parent key) and the array of well_data (the children)
      const response = await fetch(`${PI_BACKEND_URL}/save_routine_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: filename,          // Parent Key
          well_data: well_data_list,    // Child Data
          repeatCount: repeatCount,
          startTime: startTime,
          repeatInterval: repeatInterval
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setMessage(result.message || 'Routine saved and replaced successfully!');
      } else {
        const errorResponse = await response.json().catch(() => ({ error: 'Unknown server error' }));
        setMessage(`Error: ${errorResponse.error || response.statusText}`);
        console.error('Save failed:', response.status, errorResponse);
      }
    } catch (error) {
      setMessage('Failed to save routine. Check the backend connection.');
      console.error('Network error during save:', error);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="routine-builder-container">
      <style>{`
        .routine-builder-container {
          display: flex;
          height: 100vh;
          background-color: #0f172a; /* Deep Navy */
          color: #f8fafc;
          font-family: 'Inter', sans-serif;
          padding: 0;
          box-sizing: border-box;
          overflow: hidden;
        }

        .control-panel {
          background-color: #1e293b;
          border-right: 1px solid #334155;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          width: 260px;
          flex-shrink: 0;
          overflow-y: auto;
        }

        .plate-wrapper {
          flex-grow: 1;
          background-color: #0f172a;
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: auto;
          position: relative;
        }

        .panel-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .panel-section h2 {
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin: 0;
          border-bottom: 1px solid #334155;
          padding-bottom: 0.25rem;
        }

        .parameter-panel {
          background-color: #0f172a;
          border: 1px solid #0ea5e9; /* Neon Blue border */
          border-radius: 0.5rem;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          box-shadow: 0 0 10px rgba(14, 165, 233, 0.05);
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .input-group label {
          font-size: 0.65rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .param-input {
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 0.25rem;
          padding: 0.4rem 0.6rem;
          color: #0ea5e9;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          width: 100%;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }

        .param-input:focus {
          outline: none;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.1);
        }

        .filename-input {
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 0.25rem;
          padding: 0.5rem 0.6rem;
          color: #f8fafc;
          font-size: 0.85rem;
          width: 100%;
          box-sizing: border-box;
        }

        .control-buttons-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .toggle-group {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #94a3b8;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 34px;
          height: 20px;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #334155;
          transition: .4s;
          border-radius: 20px;
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }

        input:checked + .slider {
          background-color: #0ea5e9;
        }

        input:focus + .slider {
          box-shadow: 0 0 1px #0ea5e9;
        }

        input:checked + .slider:before {
          transform: translateX(14px);
        }

        .upload-label {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem;
          background: #1e293b;
          border: 1px dashed #334155;
          border-radius: 0.5rem;
          color: #94a3b8;
          font-size: 0.7rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .upload-label:hover {
          border-color: #0ea5e9;
          color: #0ea5e9;
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
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          border: none;
          color: white;
          padding: 0.6rem 0.75rem;
          border-radius: 0.375rem;
          font-weight: 700;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .save-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 15px -3px rgba(14, 165, 233, 0.3);
        }

        .runtime-display {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1rem;
          font-weight: 700;
          color: #0ea5e9;
          background: #0f172a;
          padding: 0.5rem;
          border-radius: 0.375rem;
          text-align: center;
          border: 1px solid #1e293b;
        }
        
        .loading-spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
          border: 2px solid rgba(14, 165, 233, 0.1);
          border-top-color: #0ea5e9;
          border-radius: 50%;
          height: 1.5rem;
          width: 1.5rem;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
      <div className="control-panel">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#0ea5e9' }}>BIO</span>BOT OS
        </h1>

        <div className="panel-section">
          <h2>System Control</h2>
          <div className="input-group">
            <label>Routine ID</label>
            <input
              type="text"
              value={filename}
              onChange={handleFilenameChange}
              className="filename-input"
              placeholder="ROUTINE_UNNAMED"
            />
          </div>
          <button
            onClick={handleSaveAndUploadRoutine}
            className="save-button"
            disabled={loading}
          >
            {loading ? 'Transmitting...' : 'Upload Routine ✓'}
          </button>

          <label className="upload-label">
            <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
            <span>Import JSON Routine</span>
          </label>
        </div>

        <div className="panel-section">
          <h2>Execution Schedule</h2>
          <div className="input-group">
            <label>Repeats</label>
            <input
              type="number"
              className="param-input"
              style={{ width: '60px' }}
              value={repeatCount}
              onChange={(e) => setRepeatCount(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Start Time</label>
            <input
              type="time"
              className="param-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Frequency</label>
            <select
              className="param-input"
              value={repeatInterval}
              onChange={(e) => setRepeatInterval(e.target.value)}
            >
              <option value="once">Run Once</option>
              <option value="daily">Daily Cycle</option>
              <option value="hourly">Hourly Cycle</option>
            </select>
          </div>
        </div>

        <div className="panel-section">
          <h2>Parameter Control</h2>
          <div className="parameter-panel">
            <div className="input-group">
              <label>Step Amount (SA)</label>
              <input
                type="number"
                className="param-input"
                placeholder="0"
                value={getSelectedWellValue('stepAmount')}
                onChange={(e) => handleBatchParamChange('stepAmount', e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Step Delay (DL) ms</label>
              <input
                type="number"
                className="param-input"
                placeholder="1"
                value={getSelectedWellValue('delayBetweenStep')}
                onChange={(e) => handleBatchParamChange('delayBetweenStep', e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Light Duration (LT) ms</label>
              <input
                type="number"
                className="param-input"
                placeholder="1"
                value={getSelectedWellValue('lightTime')}
                onChange={(e) => handleBatchParamChange('lightTime', e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Exposure Time (EXP) µs</label>
              <input
                type="number"
                className="param-input"
                placeholder="1"
                value={getSelectedWellValue('exposureTime')}
                onChange={(e) => handleBatchParamChange('exposureTime', e.target.value)}
              />
            </div>

            <div className="toggle-group" style={{ marginTop: '0.5rem' }}>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={!!getSelectedWellValue('switchPlate')}
                  onChange={(e) => handleBatchParamChange('switchPlate', e.target.checked)}
                />
                <span className="slider"></span>
              </label>
              <span>SWITCH PLATE AFTER WELL</span>
            </div>
          </div>
          <p style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'center', margin: '0.5rem 0' }}>
            {selectedWellCoords ? `Selected Well: ${String.fromCharCode(65 + (selectedWellCoords.rowIndex % 8))}${selectedWellCoords.colIndex + 1}` : 'Values applied to current selection.'}
          </p>
        </div>

        <div className="panel-section">
          <h2>Session Stats</h2>
          <div className="runtime-display">
            {formatTime(totalRuntime)}
          </div>
          <p style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'center' }}>
            ESTIMATED EXECUTION TIME
          </p>
        </div>

        {message && (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#0f172a', border: '1px solid #1e293b', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
            {message}
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
          onRangeChange={setSelectedRange}
        />
      </div>
    </div>
  );
};

export default RoutineBuilder;
