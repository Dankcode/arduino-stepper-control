import React, { useState, useRef, useCallback, useEffect } from 'react';

const MergedPlateTable = ({
  quadrantLayouts,
  quadrantData,
  setQuadrantData,
  selectedWellCoords,
  onWellSelect,
  onLayoutChange,
}) => {
  // State for drag and drop functionality
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const tableRef = useRef(null);
  
  // State to hold the data of the copied range
  const [copiedRangeData, setCopiedRangeData] = useState(null);
  // State to store the coordinates of the copied range for visual highlighting
  const [copiedRangeCoords, setCopiedRangeCoords] = useState(null);
  
  // State to track which cell and parameter is being edited
  const [editingCell, setEditingCell] = useState({ row: null, col: null, param: null });

  // NEW: State to track which quadrant's dropdown is open
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);
  
  // Unified parameter labels for all plate types
  const parameterLabels = {
    stepAmount: 'SA',
    delayBetweenStep: 'DL',
    lightTime: 'LT',
    exposureTime: 'EXP',
  };
  
  /**
   * Helper function to get row and column counts for a given layout.
   */
  const getLayoutDimensions = (layout) => {
    if (layout === '96-well') {
      return { rows: 8, cols: 12 };
    }
    if (layout === '48-well') {
      return { rows: 6, cols: 8 };
    }
    return { rows: 0, cols: 0 }; // 'none' layout has 0 dimensions
  };
  
  /**
   * Helper function to check if a cell is in the selected range.
   */
  const isCellInRange = useCallback((rowIndex, colIndex) => {
    if (!selectedRange) return false;
    const startRow = Math.min(selectedRange.startRow, selectedRange.endRow);
    const endRow = Math.max(selectedRange.startRow, selectedRange.endRow);
    const startCol = Math.min(selectedRange.startCol, selectedRange.endCol);
    const endCol = Math.max(selectedRange.startCol, selectedRange.endCol);
    
    return rowIndex >= startRow && rowIndex <= endRow && 
           colIndex >= startCol && colIndex <= endCol;
  }, [selectedRange]);
  
  /**
   * Helper function to check if a cell is in the copied range (for dotted border).
   */
  const isCellInCopiedRange = useCallback((rowIndex, colIndex) => {
    if (!copiedRangeCoords) return false;
    const startRow = Math.min(copiedRangeCoords.startRow, copiedRangeCoords.endRow);
    const endRow = Math.max(copiedRangeCoords.startRow, copiedRangeCoords.endRow);
    const startCol = Math.min(copiedRangeCoords.startCol, copiedRangeCoords.endCol);
    const endCol = Math.max(copiedRangeCoords.startCol, copiedRangeCoords.endCol);
    
    return rowIndex >= startRow && rowIndex <= endRow && 
           colIndex >= startCol && colIndex <= endCol;
  }, [copiedRangeCoords]);
  
  /**
   * Handles the mouse down event on a cell to start a drag selection.
   */
  const handleMouseDown = useCallback((rowIndex, colIndex, event) => {
    event.preventDefault();
    setIsDragging(true);
    setDragStart({ row: rowIndex, col: colIndex });
    
    setSelectedRange({
      startRow: rowIndex,
      endRow: rowIndex,
      startCol: colIndex,
      endCol: colIndex,
    });
    
    if (onWellSelect) {
      onWellSelect(rowIndex, colIndex);
    }
  }, [onWellSelect]);
  
  /**
   * Handles the mouse enter event on a cell during a drag.
   */
  const handleMouseEnter = useCallback((rowIndex, colIndex) => {
    if (!isDragging || !dragStart) return;
    
    const dragStartQuadrant = getQuadrantFromCoords(dragStart.row, dragStart.col);
    const currentQuadrant = getQuadrantFromCoords(rowIndex, colIndex);
    
    if (dragStartQuadrant !== currentQuadrant) {
      let clampedRowIndex = rowIndex;
      let clampedColIndex = colIndex;
      
      const isTop = dragStartQuadrant.includes('top');
      const isLeft = dragStartQuadrant.includes('Left');
      
      const { rows: quadRows, cols: quadCols } = getLayoutDimensions(quadrantLayouts[dragStartQuadrant]);
      
      if (isTop) {
        clampedRowIndex = Math.min(rowIndex, dragStart.row + quadRows - 1);
      } else {
        clampedRowIndex = Math.max(rowIndex, dragStart.row);
      }
      if (isLeft) {
        clampedColIndex = Math.min(colIndex, dragStart.col + quadCols - 1);
      } else {
        clampedColIndex = Math.max(colIndex, dragStart.col);
      }
      
      setSelectedRange({
        startRow: dragStart.row,
        endRow: clampedRowIndex,
        startCol: dragStart.col,
        endCol: clampedColIndex,
      });
      return;
    }
    
    setSelectedRange({
      startRow: dragStart.row,
      endRow: rowIndex,
      startCol: dragStart.col,
      endCol: colIndex,
    });
  }, [isDragging, dragStart, quadrantLayouts]);
  
  /**
   * Handles the mouse up event, ending the drag selection.
   */
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);
  
  /**
   * Helper function to determine the quadrant from global coordinates.
   */
  const getQuadrantFromCoords = (row, col) => {
    if (row < 8 && col < 12) return 'topLeft';
    if (row < 8 && col >= 12) return 'topRight';
    if (row >= 8 && col < 12) return 'bottomLeft';
    if (row >= 8 && col >= 12) return 'bottomRight';
    return null;
  };
  
  /**
   * Handles the copy operation.
   */
  const handleCopy = useCallback(() => {
    if (!selectedRange) return;
    
    const { startRow, endRow, startCol, endCol } = selectedRange;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    
    const quadrant = getQuadrantFromCoords(minRow, minCol);
    if (!quadrant || !quadrantData[quadrant]) return;
    
    const quadrantStartRow = quadrant.includes('bottom') ? 8 : 0;
    const quadrantStartCol = quadrant.includes('Right') ? 12 : 0;
    
    const copiedCells = [];
    
    for (let r = minRow; r <= maxRow; r++) {
      const rowData = [];
      for (let c = minCol; c <= maxCol; c++) {
        const localRow = r - quadrantStartRow;
        const localCol = c - quadrantStartCol;
        rowData.push({ ...quadrantData[quadrant][localRow][localCol] });
      }
      copiedCells.push(rowData);
    }
    setCopiedRangeData(copiedCells);
    setCopiedRangeCoords(selectedRange);
  }, [selectedRange, quadrantData]);
  
  /**
   * Handles the paste operation.
   */
  const handlePaste = useCallback(() => {
    if (!selectedRange || !copiedRangeData) return;
    
    const { startRow: pasteStartRow, endRow: pasteEndRow, startCol: pasteStartCol, endCol: pasteEndCol } = selectedRange;
    const pasteMinRow = Math.min(pasteStartRow, pasteEndRow);
    const pasteMaxRow = Math.max(pasteStartRow, pasteEndRow);
    const pasteMinCol = Math.min(pasteStartCol, pasteEndCol);
    const pasteMaxCol = Math.max(pasteStartCol, pasteEndCol);
    
    const quadrant = getQuadrantFromCoords(pasteMinRow, pasteMinCol);
    if (!quadrant || !quadrantData[quadrant]) return;
    
    const quadrantStartRow = quadrant.includes('bottom') ? 8 : 0;
    const quadrantStartCol = quadrant.includes('Right') ? 12 : 0;
    
    const newQuadrantData = quadrantData[quadrant].map(row => [...row]); // Deep copy
    
    const copiedRows = copiedRangeData.length;
    const copiedCols = copiedRangeData[0].length;
    
    for (let r = pasteMinRow; r <= pasteMaxRow; r++) {
      for (let c = pasteMinCol; c <= pasteMaxCol; c++) {
        const sourceRowIndex = (r - pasteMinRow) % copiedRows;
        const sourceColIndex = (c - pasteMinCol) % copiedCols;
        const sourceData = copiedRangeData[sourceRowIndex][sourceColIndex];
        
        const localRow = r - quadrantStartRow;
        const localCol = c - quadrantStartCol;
        
        if (newQuadrantData[localRow] && newQuadrantData[localRow][localCol]) {
          newQuadrantData[localRow][localCol] = { ...sourceData };
        }
      }
    }
    setQuadrantData(prev => ({ ...prev, [quadrant]: newQuadrantData }));
    setSelectedRange(null);
    setCopiedRangeCoords(null);
  }, [selectedRange, copiedRangeData, quadrantData, setQuadrantData]);
  
  /**
   * Handles the change event on an input field to update the parameter value.
   */
  const handleValueChange = (quadrant, localRow, localCol, paramName, value) => {
    setQuadrantData(prev => {
      const newQuadrantData = prev[quadrant].map(row => [...row]); // Deep copy
      const newWellData = { ...newQuadrantData[localRow][localCol], [paramName]: value };
      newQuadrantData[localRow][localCol] = newWellData;
      return { ...prev, [quadrant]: newQuadrantData };
    });
  };
  
  /**
   * Handles double-click to start editing a cell.
   */
  const handleDoubleClick = (globalRowIndex, globalColIndex, paramName, event) => {
    event.stopPropagation();
    setEditingCell({ row: globalRowIndex, col: globalColIndex, param: paramName });
  };
  
  /**
   * Handles blur event to stop editing and save the value.
   */
  const handleBlur = () => {
    setEditingCell({ row: null, col: null, param: null });
  };
  
  /**
   * Handles key presses in the input field.
   */
  const handleKeyDown = (event, quadrant, localRow, localCol, paramName, value) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleValueChange(quadrant, localRow, localCol, paramName, event.target.value);
      handleBlur();
    }
    if (event.key === 'Escape') {
      handleBlur();
    }
  };
  
  // Effect hook for keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        event.preventDefault();
        handleCopy();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        event.preventDefault();
        handlePaste();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleCopy, handlePaste]);
  
  // Effect hook for global mouse up listener
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  // NEW: Effect hook to close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef]);
  
  /**
   * Renders a single quadrant table based on the selected layout.
   */
  const renderQuadrant = (quadrant, startRow, startCol) => {
    const layout = quadrantLayouts[quadrant];
    
    // If layout is 'none', render an empty placeholder with a click handler
    if (layout === 'none') {
      return (
        <div 
          className={`quadrant quadrant-${quadrant} quadrant-none`}
          onClick={() => setOpenDropdown(quadrant)} // Open dropdown on click
          ref={openDropdown === quadrant ? dropdownRef : null} // Attach ref only when open
        >
          <div className="placeholder-text">
            Empty Plate
          </div>
          {openDropdown === quadrant && ( // Conditionally render the dropdown
            <div className="quadrant-dropdown-wrapper">
              <div>
                Select the wellplate size
              </div>
              <select 
                value={layout} 
                onChange={(e) => {
                  onLayoutChange(quadrant, e.target.value);
                  setOpenDropdown(null); // Close dropdown after selection
                }}
                onClick={(e) => e.stopPropagation()} // Prevent closing on select click
              >
                <option value="none">None</option>
                <option value="48-well">48-well</option>
                <option value="96-well">96-well</option>
              </select>
            </div>
          )}
        </div>
      );
    }
    
    // Get dimensions and labels based on the selected layout
    const { rows, cols } = getLayoutDimensions(layout);
    // Row labels are always A, B, C...
    const rowLabels = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
    // Column labels are always 1, 2, 3... for each individual plate
    const colLabels = Array.from({ length: cols }, (_, i) => i + 1);
    
    const localQuadrantData = quadrantData[quadrant] || [];
    
    return (
      <div className={`quadrant quadrant-${quadrant}`}>
        <div className="quadrant-header">
          <select value={layout} onChange={(e) => onLayoutChange(quadrant, e.target.value)}>
            <option value="none">None</option>
            <option value="48-well">48-well</option>
            <option value="96-well">96-well</option>
          </select>
        </div>
        <table className="quadrant-table">
          <thead>
            <tr>
              <th></th>
              {/* Display local column numbers for the header */}
              {colLabels.map((label, colIndex) => (
                <th key={colIndex}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rIndex) => (
              <tr key={rIndex}>
                {/* Display local row letters for the header */}
                <th>{rowLabels[rIndex]}</th>
                {Array.from({ length: cols }).map((_, cIndex) => {
                  // Use global coordinates for data retrieval and selection
                  const globalRowIndex = startRow + rIndex;
                  const globalColIndex = startCol + cIndex;
                  const well = localQuadrantData[rIndex]?.[cIndex] || {};
                  
                  const isSelected = selectedWellCoords &&
                                     selectedWellCoords.rowIndex === globalRowIndex &&
                                     selectedWellCoords.colIndex === globalColIndex;
                  const isInRange = isCellInRange(globalRowIndex, globalColIndex);
                  const isInCopiedRange = isCellInCopiedRange(globalRowIndex, globalColIndex);
                  
                  return (
                    <td
                      key={cIndex}
                      onMouseDown={(e) => handleMouseDown(globalRowIndex, globalColIndex, e)}
                      onMouseEnter={() => handleMouseEnter(globalRowIndex, globalColIndex)}
                      className={`
                        ${isSelected ? 'selected-well' : ''} 
                        ${isInRange ? 'selected-range' : ''}
                        ${isInCopiedRange ? 'copied-range-border' : ''}
                      `.trim()}
                    >
                      <div className="well-content">
                        {Object.entries(parameterLabels).map(([paramName, label]) => {
                          const value = well[paramName];
                          const isEditing = editingCell.row === globalRowIndex &&
                                            editingCell.col === globalColIndex &&
                                            editingCell.param === paramName;
                                            
                          return (
                            <div 
                              key={paramName} 
                              className="well-param-display"
                              onDoubleClick={(e) => handleDoubleClick(globalRowIndex, globalColIndex, paramName, e)}
                            >
                              <span className="well-param-label">{label}:</span>
                              {isEditing ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={value}
                                  onChange={(e) => handleValueChange(quadrant, rIndex, cIndex, paramName, e.target.value)}
                                  onBlur={handleBlur}
                                  onKeyDown={(e) => handleKeyDown(e, quadrant, rIndex, cIndex, paramName, value)}
                                  onClick={(e) => e.stopPropagation()} // Prevent cell selection on input click
                                  className="well-param-input"
                                />
                              ) : (
                                <span className="well-param-value">
                                  {value}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  
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
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto auto;
          gap: 1px;
        }
        
        .quadrant {
          border: 1px solid #e5e7eb;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .quadrant-none {
            justify-content: space-between;
        }
        
        .quadrant-header {
          position: absolute;
          display: flex;
          gap: 5px;
          z-index: 10;
        }
        
        .quadrant-header select {
          padding: 0.2rem 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 0.25rem;
          width:75%;
        }

        /* Updated CSS for the dropdown wrapper and its select element */
        .quadrant-dropdown-wrapper {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 20;
          background-color: #fff;
          padding: 10px;
          border: 1px solid #d1d5db;
          border-radius: 0.25rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-size: .8rem;
          color: #1f2937;
          display: flex;
          flex-direction: column;
          gap: 10px;
          text-align: center;
        }
        
        .quadrant-dropdown-wrapper select {
          width: auto;
          min-width: 150px;
          padding: 0.2rem 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 0.25rem;
        }
        
        .placeholder-text {
          flex-grow: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 1.5rem;
          color: #9ca3af;
          font-style: italic;
          cursor: pointer;
        }
        
        .quadrant-table {
          border-collapse: collapse;
          table-layout: fixed;
          min-width: 100%;
          max-width: 100%;
        }
        
        .quadrant-table th,
        .quadrant-table td {
          padding: 0.2rem;
          border: 1px solid #e5e7eb;
          text-align: center;
          vertical-align: middle;
          position: relative;
          min-width: 50px;
        }
        
        .quadrant-table th {
          background-color: #f9fafb;
          font-weight: 600;
          color: #4b5563;
          white-space: nowrap;
          font-size: 0.8rem;
        }
        
        .quadrant-table td {
          height: 4.5rem;
          background-color: #ffffff;
          transition: background-color 0.1s ease-in-out, border-color 0.2s ease-in-out;
          cursor: pointer;
        }
        
        .quadrant-table td:hover {
          background-color: #f0f0f0;
        }
        
        .selected-well {
          border: 2px solid #3b82f6;
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5);
        }
        
        .selected-range {
          background-color: rgba(59, 130, 246, 0.1) !important;
          border: 1px solid #3b82f6;
        }
        
        .copied-range-border {
          border-style: dotted !important;
          border-color: #3b82f6 !important;
        }
        
        .dragging {
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
        }
        
        .well-param-display {
          font-size: 0.7rem;
          color: #4b5563;
          display: flex;
          justify-content: space-between;
          width: 100%;
          box-sizing: border-box;
          align-items: center;
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
        
        .well-param-input {
          flex-grow: 1;
          border: 1px solid #3b82f6;
          border-radius: 0.25rem;
          font-size: 0.65rem;
          text-align: right;
          padding: 0 2px;
          box-sizing: border-box;
          font-family: inherit;
          width:80%;
        }
      `}</style>
      <div 
        className={`merged-plate-table-wrapper ${isDragging ? 'dragging' : ''}`}
        ref={tableRef}
        tabIndex={0}
      >
        {renderQuadrant('topLeft', 0, 0)}
        {renderQuadrant('topRight', 0, 12)}
        {renderQuadrant('bottomLeft', 8, 0)}
        {renderQuadrant('bottomRight', 8, 12)}
      </div>
    </div>
  );
};

export default MergedPlateTable;