import React, { useState, useRef, useCallback, useEffect } from 'react';

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
  // selectedRange now stores { startRow, endRow, startCol, endCol, cells: [{ row, col, data }] }
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

  /**
   * Helper function to generate the array of selected cells with their data
   * based on the current bounding box of the drag selection.
   * @param {number} currentStartRow - The starting row index of the current selection.
   * @param {number} currentEndRow - The ending row index of the current selection.
   * @param {number} currentStartCol - The starting column index of the current selection.
   * @param {number} currentEndCol - The ending column index of the current selection.
   * @returns {Array<{row: number, col: number, data: object}>} An array of objects, each representing a selected cell with its data.
   */
  const updateSelectedCellsData = useCallback((currentStartRow, currentEndRow, currentStartCol, currentEndCol) => {
    const cells = [];
    // Normalize start and end to always be min and max for correct iteration
    const minRow = Math.min(currentStartRow, currentEndRow);
    const maxRow = Math.max(currentStartRow, currentEndRow);
    const minCol = Math.min(currentStartCol, currentEndCol);
    const maxCol = Math.max(currentStartCol, currentEndCol);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const wellData = data[r]?.[c]; // Get the well data for the current coordinate
        if (wellData) {
          cells.push({ row: r, col: c, data: wellData });
        } else {
          cells.push({ row: r, col: c, data: {} }); // Push empty data if well is undefined
        }
      }
    }
    return cells;
  }, [data]); // Dependency on 'data' to ensure it uses the latest plate data

  /**
   * Helper function to check if a cell is in the selected range (for visual highlighting).
   * This only checks the bounding box, not the `cells` array within `selectedRange`.
   * @param {number} rowIndex - The row index of the cell.
   * @param {number} colIndex - The column index of the cell.
   * @returns {boolean} - True if the cell is within the selected range's bounding box, false otherwise.
   */
  const isCellInRange = useCallback((rowIndex, colIndex) => {
    if (!selectedRange) return false;
    // Normalize start and end to always be min and max for correct range checking
    const startRow = Math.min(selectedRange.startRow, selectedRange.endRow);
    const endRow = Math.max(selectedRange.startRow, selectedRange.endRow);
    const startCol = Math.min(selectedRange.startCol, selectedRange.endCol);
    const endCol = Math.max(selectedRange.startCol, selectedRange.endCol);

    return rowIndex >= startRow && rowIndex <= endRow && 
           colIndex >= startCol && colIndex <= endCol;
  }, [selectedRange]);

  /**
   * Handles the mouse down event on a cell to start a drag selection.
   * Initializes the drag start point and the selected range with the clicked cell's data.
   * @param {number} rowIndex - The row index of the clicked cell.
   * @param {number} colIndex - The column index of the clicked cell.
   * @param {React.MouseEvent} event - The mouse event.
   */
  const handleMouseDown = useCallback((rowIndex, colIndex, event) => {
    event.preventDefault(); // Prevent default browser drag behavior
    setDragStart({ row: rowIndex, col: colIndex });
    setIsDragging(true);
    
    // Initialize selectedRange with the first cell's data and bounding box
    const initialCells = updateSelectedCellsData(rowIndex, rowIndex, colIndex, colIndex);
    setSelectedRange({
      startRow: rowIndex,
      endRow: rowIndex,
      startCol: colIndex,
      endCol: colIndex,
      cells: initialCells // Store the data of the initial cell
    });
    
    // Also trigger the original well select callback
    if (onWellSelect) {
      onWellSelect(rowIndex, colIndex);
    }
  }, [onWellSelect, updateSelectedCellsData]);

  /**
   * Handles the mouse enter event on a cell during a drag.
   * Expands the selection range and updates the data of all cells within the new range.
   * @param {number} rowIndex - The row index of the cell being entered.
   * @param {number} colIndex - The column index of the cell being entered.
   */
  const handleMouseEnter = useCallback((rowIndex, colIndex) => {
    if (!isDragging || !dragStart) return;
    
    // Calculate the new bounding box based on dragStart and current cell
    const newStartRow = dragStart.row;
    const newEndRow = rowIndex;
    const newStartCol = dragStart.col;
    const newEndCol = colIndex;

    // Update selectedRange with the new bounding box and re-calculate cells data
    setSelectedRange(prevRange => {
        const updatedCells = updateSelectedCellsData(newStartRow, newEndRow, newStartCol, newEndCol);
        return {
            startRow: newStartRow,
            endRow: newEndRow,
            startCol: newStartCol,
            endCol: newEndCol,
            cells: updatedCells // Update the data of all cells in the current range
        };
    });
  }, [isDragging, dragStart, updateSelectedCellsData]);

  /**
   * Handles the paste operation.
   * Copies data from the `selectedWellCoords` (the single well clicked for copy)
   * to all wells within the `selectedRange`.
   */
  const handlePaste = useCallback(() => {
    if (!selectedRange || !onWellUpdate || !selectedWellCoords) return;

    // Get the data of the single selected well (the source for pasting)
    const sourceWellData = data[selectedWellCoords.rowIndex][selectedWellCoords.colIndex];

    // Iterate through the cells in the selectedRange (which now contains all cells' coordinates)
    // and apply the sourceWellData to them using the onWellUpdate callback.
    selectedRange.cells.forEach(cell => {
      // Use a deep copy to avoid modifying the original object
      onWellUpdate(cell.row, cell.col, { ...sourceWellData });
    });

  }, [selectedRange, selectedWellCoords, data, onWellUpdate]);

  /**
   * Handles the mouse up event, ending the drag selection.
   * Logs the selected coordinates with their data and then triggers the paste operation.
   */
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null); // Reset drag start

    // Log the array of selected coordinates and their data to the console
    if (selectedRange && selectedRange.cells) {
        const cellsToLog = selectedRange.cells.map(cell => {
            const formattedWellData = {};
            // Map full parameter names to their abbreviated labels for the log output
            Object.entries(cell.data).forEach(([paramName, value]) => {
                formattedWellData[paramLabels[paramName] || paramName] = value;
            });
            return { row: cell.row, col: cell.col, data: formattedWellData };
        });
        console.log("Selected Coordinates and Data after drag end:", cellsToLog);
    } else {
        console.log("No cells selected or selectedRange is null.");
    }

    handlePaste(); // Call the paste function after logging
  }, [selectedRange, handlePaste, paramLabels]); // Dependencies for useCallback

  // Effect hook to add and clean up global mouse up listener
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]); // Re-run if handleMouseUp changes

  return (
    <div className="merged-plate-table-container">
      {/* Inline styles for the component */}
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
      `}</style>
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
