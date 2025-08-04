import React, { useState, useRef, useCallback } from 'react';

const MergedPlateTable = ({
  plate,
  selectedWellCoords,
  onWellSelect,
  onWellUpdate,
}) => {
  const { baseLayout, data } = plate;
  
  // State for drag and drop functionality
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const tableRef = useRef(null);

  let baseRows, baseCols;
  if (baseLayout === '96-well') {
    baseRows = 8;
    baseCols = 12;
  } else { // 48-well
    baseRows = 6;
    baseCols = 8;
  }

  const totalRows = baseRows * 2;
  const totalCols = baseCols * 2;

  const rowLabels = Array.from({ length: totalRows }, (_, i) => String.fromCharCode(65 + i));
  const colLabels = Array.from({ length: totalCols }, (_, i) => i + 1);

  // Function to determine if a cell is on a quadrant boundary
  const isQuadrantBoundary = (rowIndex, colIndex) => {
    const isRightBoundary = (colIndex === baseCols - 1) && (colIndex !== totalCols - 1);
    const isBottomBoundary = (rowIndex === baseRows - 1) && (rowIndex !== totalRows - 1);
    return { isRightBoundary, isBottomBoundary };
  };

  // Map full parameter names to their abbreviated labels
  const paramLabels = {
    stepAmount: 'SA',
    delayBetweenStep: 'DL',
    lightTime: 'LT',
    exposureTime: 'EXP',
    switchPlate: 'SP',
  };

  // Helper function to check if a cell is in the selected range
  const isCellInRange = (rowIndex, colIndex) => {
    if (!selectedRange) return false;
    const { startRow, endRow, startCol, endCol } = selectedRange;
    return rowIndex >= startRow && rowIndex <= endRow && 
           colIndex >= startCol && colIndex <= endCol;
  };

  // Handle mouse down on a cell (start selection/drag)
  const handleMouseDown = useCallback((rowIndex, colIndex, event) => {
    event.preventDefault();
    setDragStart({ row: rowIndex, col: colIndex });
    setDragEnd({ row: rowIndex, col: colIndex });
    setIsDragging(true);
    
    // Update selected range
    setSelectedRange({
      startRow: rowIndex,
      endRow: rowIndex,
      startCol: colIndex,
      endCol: colIndex
    });
    
    // Also trigger the original well select
    if (onWellSelect) {
      onWellSelect(rowIndex, colIndex);
    }
  }, [onWellSelect]);

  // Handle mouse enter on a cell (expand selection during drag)
  const handleMouseEnter = useCallback((rowIndex, colIndex) => {
    if (!isDragging || !dragStart) return;
    
    setDragEnd({ row: rowIndex, col: colIndex });
    
    // Update selected range
    const startRow = Math.min(dragStart.row, rowIndex);
    const endRow = Math.max(dragStart.row, rowIndex);
    const startCol = Math.min(dragStart.col, colIndex);
    const endCol = Math.max(dragStart.col, colIndex);
    
    setSelectedRange({ startRow, endRow, startCol, endCol });
  }, [isDragging, dragStart]);

  // Handle mouse up (end selection/drag)
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle paste operation
  const handlePaste = useCallback(() => {
    if (!selectedRange || !onWellUpdate || !selectedWellCoords) return;

    // Get the data of the single selected well
    const selectedWellData = data[selectedWellCoords.rowIndex][selectedWellCoords.colIndex];

    // Find all highlighted coordinates (the selected range)
    for (let targetRow = selectedRange.startRow; targetRow <= selectedRange.endRow; targetRow++) {
      for (let targetCol = selectedRange.startCol; targetCol <= selectedRange.endCol; targetCol++) {
        // Replace the data of each highlighted cell with the selected well's data
        // Use a deep copy to avoid modifying the original object
        onWellUpdate(targetRow, targetCol, { ...selectedWellData });
      }
    }

  }, [selectedRange, selectedWellCoords, data, onWellUpdate]);

  // Handle copy/paste operations (Ctrl+C/Ctrl+V)
  const handleKeyDown = useCallback((event) => {
    if (event.ctrlKey && event.key === 'c' && selectedWellCoords) {
        // No longer need to copy a range, as we are only copying the selected well
        // We can just rely on selectedWellCoords to determine what to paste.
        // The `handlePaste` function is now responsible for getting the data.
    } else if (event.ctrlKey && event.key === 'v' && selectedRange && selectedWellCoords) {
      // Paste operation
      handlePaste();
    }
  }, [selectedRange, selectedWellCoords, handlePaste]);

  // Add global mouse up listener and keyboard events
  React.useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleMouseUp, handleKeyDown]);

  return (
    <div className="merged-plate-table-container">
      <style>{`
        .merged-plate-table-container {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          overflow: auto;
          padding: 0;
          box-sizing: border-box;
          user-select: none;
          position: relative;
        }

        .merged-plate-table-wrapper {
          background-color: white;
          border-radius: 0.75rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          overflow: auto;
          max-width: 100%;
          max-height: 100%;
        }

        .merged-plate-table {
          border-collapse: collapse;
          table-layout: fixed;
          min-width: 100%;
        }

        .merged-plate-table th,
        .merged-plate-table td {
          padding: 0.2rem;
          border: 1px solid #e5e7eb;
          text-align: center;
          vertical-align: middle;
          position: relative;
          min-width: 50px;
        }

        .merged-plate-table th {
          background-color: #f9fafb;
          font-weight: 600;
          color: #4b5563;
          white-space: nowrap;
          font-size: 0.8rem;
        }

        .merged-plate-table td {
          height: 4.5rem;
          background-color: #ffffff;
          transition: background-color 0.1s ease-in-out, border-color 0.2s ease-in-out;
          cursor: pointer;
        }

        .merged-plate-table td:hover {
          background-color: #f0f0f0;
        }

        /* Quadrant Borders */
        .merged-plate-table td.border-right {
          border-right: 3px solid #6b7280;
        }
        .merged-plate-table td.border-bottom {
          border-bottom: 3px solid #6b7280;
        }
        .merged-plate-table th.border-right {
          border-right: 3px solid #6b7280;
        }
        .merged-plate-table tr:last-child td.border-bottom {
          border-bottom: 1px solid #e5e7eb;
        }
        .merged-plate-table th:last-child.border-right {
          border-right: 1px solid #e5e7eb;
        }

        /* Selected Well Highlight */
        .merged-plate-table td.selected-well {
          border: 2px solid #3b82f6;
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5);
        }

        /* Range Selection Highlight */
        .merged-plate-table td.selected-range {
          background-color: rgba(59, 130, 246, 0.1) !important;
          border: 1px solid #3b82f6;
        }

        /* Dragging state */
        .merged-plate-table.dragging {
          cursor: crosshair;
        }

        .well-content {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          height: 100%;
          gap: 0.1rem;
          word-break: break-all;
          padding: 0.1rem;
          width: 100%;
          overflow: hidden;
          pointer-events: none;
        }

        .well-param-display {
          font-size: 0.7rem;
          color: #4b5563;
          display: flex;
          justify-content: space-between;
          width: 100%;
          padding: 0 0.1rem;
        }

        .well-param-label {
          font-weight: 500;
          color: #3b82f6;
          flex-shrink: 0;
          margin-right: 0.2rem;
        }

        .well-param-value {
          font-weight: 600;
          color: #1f2937;
          word-break: break-word;
          text-align: right;
          flex-grow: 1;
        }

        /* Instructions */
        .instructions {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 0.75rem;
          z-index: 1000;
          pointer-events: none;
        }
      `}</style>
      
      <div className="instructions">
        Drag to select • Ctrl+C to copy • Ctrl+V to paste
      </div>
      
      <div className="merged-plate-table-wrapper">
        <table 
          className={`merged-plate-table ${isDragging ? 'dragging' : ''}`}
          ref={tableRef}
          tabIndex={0}
        >
          <thead>
            <tr>
              <th></th>
              {colLabels.map((label, colIndex) => {
                const { isRightBoundary } = isQuadrantBoundary(0, colIndex);
                return (
                  <th key={label} className={isRightBoundary ? 'border-right' : ''}>
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className={isQuadrantBoundary(rowIndex, 0).isBottomBoundary ? 'border-bottom' : ''}>
                  {rowLabels[rowIndex]}
                </th>
                {row.map((well, colIndex) => {
                  const { isRightBoundary, isBottomBoundary } = isQuadrantBoundary(rowIndex, colIndex);
                  const isSelected = selectedWellCoords &&
                                     selectedWellCoords.rowIndex === rowIndex &&
                                     selectedWellCoords.colIndex === colIndex;
                  const isInRange = isCellInRange(rowIndex, colIndex);
                  
                  return (
                    <td
                      key={colIndex}
                      onMouseDown={(e) => handleMouseDown(rowIndex, colIndex, e)}
                      onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                      className={`
                        ${isRightBoundary ? 'border-right' : ''} 
                        ${isBottomBoundary ? 'border-bottom' : ''} 
                        ${isSelected ? 'selected-well' : ''} 
                        ${isInRange ? 'selected-range' : ''}
                      `.trim()}
                    >
                      <div className="well-content">
                        {Object.entries(well).map(([paramName, value]) => (
                          value.trim() !== '' && (
                            <div key={paramName} className="well-param-display">
                              <span className="well-param-label">{paramLabels[paramName] || paramName}:</span>
                              <span className="well-param-value">{value}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MergedPlateTable;