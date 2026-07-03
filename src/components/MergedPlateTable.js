import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

const MergedPlateTable = ({
  quadrantLayouts,
  quadrantData,
  setQuadrantData,
  selectedWellCoords,
  onWellSelect,
  onLayoutChange,
  onRangeChange,
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

  const quadrantFrames = useMemo(() => {
    const dims = Object.fromEntries(
      Object.entries(quadrantLayouts).map(([quadrant, layout]) => [quadrant, getLayoutDimensions(layout)])
    );
    const topRows = Math.max(dims.topLeft.rows, dims.topRight.rows);
    const leftCols = Math.max(dims.topLeft.cols, dims.bottomLeft.cols);
    return {
      topLeft: { startRow: 0, startCol: 0, ...dims.topLeft },
      topRight: { startRow: 0, startCol: leftCols, ...dims.topRight },
      bottomLeft: { startRow: topRows, startCol: 0, ...dims.bottomLeft },
      bottomRight: { startRow: topRows, startCol: leftCols, ...dims.bottomRight },
    };
  }, [quadrantLayouts]);

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
    if (onRangeChange) {
      onRangeChange({
        startRow: rowIndex,
        endRow: rowIndex,
        startCol: colIndex,
        endCol: colIndex,
      });
    }
  }, [onWellSelect, onRangeChange]);

  /**
   * Handles the mouse enter event on a cell during a drag.
   */
  const handleMouseEnter = useCallback((rowIndex, colIndex) => {
    if (!isDragging || !dragStart) return;

    const dragStartQuadrant = getQuadrantFromCoords(dragStart.row, dragStart.col);
    const currentQuadrant = getQuadrantFromCoords(rowIndex, colIndex);

    if (!dragStartQuadrant || dragStartQuadrant !== currentQuadrant) {
      return;
    }

    const newRange = {
      startRow: dragStart.row,
      endRow: rowIndex,
      startCol: dragStart.col,
      endCol: colIndex,
    };
    setSelectedRange(newRange);
    if (onRangeChange) {
      onRangeChange(newRange);
    }
  }, [isDragging, dragStart, onRangeChange]);

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
    for (const [quadrant, frame] of Object.entries(quadrantFrames)) {
      if (
        frame.rows > 0 &&
        frame.cols > 0 &&
        row >= frame.startRow &&
        row < frame.startRow + frame.rows &&
        col >= frame.startCol &&
        col < frame.startCol + frame.cols
      ) {
        return quadrant;
      }
    }
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

    const quadrantStartRow = quadrantFrames[quadrant].startRow;
    const quadrantStartCol = quadrantFrames[quadrant].startCol;

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
  }, [selectedRange, quadrantData, quadrantFrames]);

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

    const quadrantStartRow = quadrantFrames[quadrant].startRow;
    const quadrantStartCol = quadrantFrames[quadrant].startCol;

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
  }, [selectedRange, copiedRangeData, quadrantData, setQuadrantData, quadrantFrames]);

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

  const handleTableKeyDown = useCallback((event) => {
    const target = event.target;
    const isEditable = target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;
    if (isEditable) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      handleCopy();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      handlePaste();
    }
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
    const { rows, cols } = getLayoutDimensions(layout);
    const rowLabels = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
    const colLabels = Array.from({ length: cols }, (_, i) => i + 1);
    const localQuadrantData = quadrantData[quadrant] || [];

    const handlePlaceholderClick = () => {
      // Cycle through or just trigger the parent change to a default
      onLayoutChange(quadrant, '96-well');
    };

    return (
      <div className={`quadrant quadrant-${quadrant} ${layout === 'none' ? 'quadrant-none' : ''}`}>
        <div className="quadrant-header">
          <select
            value={layout}
            onChange={(e) => onLayoutChange(quadrant, e.target.value)}
            className="layout-select"
          >
            <option value="none">TABLE EMPTY</option>
            <option value="48-well">48-WELL PLATE</option>
            <option value="96-well">96-WELL PLATE</option>
          </select>
        </div>

        {layout === 'none' ? (
          <div className="table-placeholder" onClick={handlePlaceholderClick}>
            <div className="placeholder-icon">+</div>
            <div className="placeholder-text">CLICK TO ADD PLATE</div>
          </div>
        ) : (
          <table className="quadrant-table">
            <thead>
              <tr>
                <th className="corner-label"></th>
                {colLabels.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowLabels.map((rowLabel, rIndex) => {
                const globalRowIndex = startRow + rIndex;
                return (
                  <tr key={rowLabel}>
                    <th>{rowLabel}</th>
                    {colLabels.map((_, cIndex) => {
                      const globalColIndex = startCol + cIndex;
                      const well = localQuadrantData[rIndex]?.[cIndex] || {};
                      const sa = well.stepAmount || 0;

                      const isSelected =
                        selectedWellCoords &&
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
                            well-cell
                            ${isSelected ? 'selected-well' : ''} 
                            ${isInRange ? 'selected-range' : ''}
                            ${isInCopiedRange ? 'copied-range-border' : ''}
                          `.trim()}
                        >
                          {sa > 0 ? (
                            <div className="well-label">
                              <span className="sa-label">{sa}</span>
                              <span className="exp-label">{well.exposureTime}</span>
                            </div>
                          ) : (
                            <div className="empty-well">·</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div className="merged-plate-table-container">
      <style jsx global>{`
        .merged-plate-table-container {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          overflow: auto;
          background-color: #0f172a;
          user-select: none;
          padding: 1rem;
        }
        
        .merged-plate-table-wrapper {
          background-color: #1e293b;
          border: 1px solid #334155;
          display: grid;
          grid-template-columns: auto auto;
          grid-template-rows: auto auto;
          gap: 0.5rem;
          padding: 0.5rem;
          border-radius: 0.5rem;
          margin: auto;
        }
        
        .quadrant {
          background-color: #0f172a;
          border: 1px solid #334155;
          border-radius: 0.25rem;
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
        }

        .quadrant-header {
           margin-bottom: 0.25rem;
        }
        
        .quadrant-header select {
          background: #1e293b;
          border: 1px solid #334155;
          color: #94a3b8;
          font-size: 0.6rem;
          font-weight: 800;
          text-transform: uppercase;
          padding: 0.1rem 0.2rem;
          border-radius: 0.15rem;
        }

        .quadrant-table {
          border-collapse: collapse;
        }
        
        .quadrant-table th {
          color: #475569;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.55rem;
          font-weight: 700;
          padding: 1px;
          border: 1px solid #1e293b;
        }
        
        .well-cell {
          width: 3.2rem;
          height: 2.2rem;
          padding: 0;
          border: 1px solid #1e293b;
          position: relative;
          background: #0f172a;
          transition: background 0.1s;
          cursor: pointer;
        }

        .well-cell:hover {
          background: #1e293b;
        }
        
        .selected-well {
          background: #0ea5e9 !important;
          border: 1px solid #f8fafc;
          z-index: 10;
        }

        .selected-range {
          background: rgba(14, 165, 233, 0.2);
          box-shadow: inset 0 0 0 1px #0ea5e9;
        }
        
        .copied-range-border {
          box-shadow: inset 0 0 0 1px #0ea5e9;
          outline: 1px dashed #0ea5e9;
          z-index: 5;
        }
        
        .dragging {
          cursor: crosshair;
        }

        .empty-well {
           color: #1e293b;
           font-size: 1rem;
           text-align: center;
           line-height: 2.2rem;
        }

        .well-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          pointer-events: none;
        }

        .table-placeholder {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 150px;
          cursor: pointer;
          background: rgba(30, 41, 59, 0.5);
          border: 1px dashed #334155;
          border-radius: 0.25rem;
          transition: all 0.2s;
        }

        .table-placeholder:hover {
          background: rgba(14, 165, 233, 0.1);
          border-color: #0ea5e9;
        }

        .placeholder-icon {
          font-size: 1.5rem;
          color: #0ea5e9;
          margin-bottom: 0.25rem;
        }

        .placeholder-text {
          font-size: 0.65rem;
          font-weight: 800;
          color: #94a3b8;
        }

        .sa-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1;
          margin-bottom: 2px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        }

        .exp-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.5rem;
          font-weight: 600;
          color: #38bdf8;
          line-height: 1;
        }
      `}</style>
      <div
        className={`merged-plate-table-wrapper ${isDragging ? 'dragging' : ''}`}
        ref={tableRef}
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
      >
        {renderQuadrant('topLeft', quadrantFrames.topLeft.startRow, quadrantFrames.topLeft.startCol)}
        {renderQuadrant('topRight', quadrantFrames.topRight.startRow, quadrantFrames.topRight.startCol)}
        {renderQuadrant('bottomLeft', quadrantFrames.bottomLeft.startRow, quadrantFrames.bottomLeft.startCol)}
        {renderQuadrant('bottomRight', quadrantFrames.bottomRight.startRow, quadrantFrames.bottomRight.startCol)}
      </div>
    </div>
  );
};

export default MergedPlateTable;
