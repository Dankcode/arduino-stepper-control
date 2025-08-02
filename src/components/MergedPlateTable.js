// MergedPlateTable.js
import React from 'react';

const MergedPlateTable = ({
  plate,
  handleDrop,
  handleWellCustomization,
  selectedWellCoords,
  onWellSelect,
}) => {
  const { baseLayout, data } = plate;

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

  // handleDragOver is needed by individual wells
  const handleDragOver = (e) => {
    e.preventDefault(); // Allows the drop
  };

  // Function to determine if a cell is on a quadrant boundary
  const isQuadrantBoundary = (rowIndex, colIndex) => {
    // Check for right boundary of the first two quadrants
    const isRightBoundary = (colIndex === baseCols - 1) && (colIndex !== totalCols - 1);
    // Check for bottom boundary of the top two quadrants
    const isBottomBoundary = (rowIndex === baseRows - 1) && (rowIndex !== totalRows - 1);

    return { isRightBoundary, isBottomBoundary };
  };

  return (
    <div className="merged-plate-table-container">
      <style>{`
        .merged-plate-table-container {
          flex: 1; /* Allows the container to take up remaining space */
          display: flex;
          justify-content: center; /* Center the table horizontally */
          align-items: flex-start; /* Align table to the top */
          overflow: auto; /* Allows scrolling for the table if it overflows */
          padding: 0; /* Removed padding here as it's handled by routine-builder-container */
          box-sizing: border-box; /* Include padding in element's total width and height */
        }

        .merged-plate-table-wrapper {
          background-color: white;
          border-radius: 0.75rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          overflow: auto; /* Allows internal scrolling if table is too big for its container */
          max-width: 100%; /* Ensure it doesn't overflow its parent */
          max-height: 100%; /* Ensure it doesn't overflow its parent */
        }

        .merged-plate-table {
          border-collapse: collapse;
          table-layout: fixed; /* Fixed layout for consistent cell sizes */
          min-width: 100%; /* Ensure table takes full width of its wrapper */
        }

        .merged-plate-table th,
        .merged-plate-table td {
          padding: 0.2rem; /* Reduced padding */
          border: 1px solid #e5e7eb;
          text-align: center;
          vertical-align: middle;
          position: relative;
          min-width: 50px; /* Reduced min-width */
        }

        .merged-plate-table th {
          background-color: #f9fafb;
          font-weight: 600;
          color: #4b5563;
          white-space: nowrap;
          font-size: 0.8rem; /* Adjusted font size */
        }

        .merged-plate-table td {
          height: 4.5rem; /* Reduced height */
          background-color: #ffffff;
          transition: background-color 0.1s ease-in-out, border-color 0.2s ease-in-out;
        }

        .merged-plate-table td:hover {
          background-color: #f0f0f0; /* Light hover effect */
        }

        /* Quadrant Borders */
        .merged-plate-table td.border-right {
          border-right: 3px solid #6b7280; /* Darker, thicker border for vertical separation */
        }
        .merged-plate-table td.border-bottom {
          border-bottom: 3px solid #6b7280; /* Darker, thicker border for horizontal separation */
        }
        .merged-plate-table th.border-right {
          border-right: 3px solid #6b7280; /* Apply to column headers too */
        }
        /* Ensure the last row/column doesn't have an extra thick border */
        .merged-plate-table tr:last-child td.border-bottom {
          border-bottom: 1px solid #e5e7eb;
        }
        .merged-plate-table th:last-child.border-right {
          border-right: 1px solid #e5e7eb;
        }


        /* Selected Well Highlight */
        .merged-plate-table td.selected-well {
          border: 2px solid #3b82f6; /* Blue border for selected well */
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5);
        }

        .well-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 0.1rem; /* Reduced gap */
        }

        .well-method {
          font-weight: 600;
          font-size: 0.8rem; /* Adjusted font size */
          color: #3b82f6;
          word-break: break-all; /* Allow text to break for smaller cells */
        }

        .well-parameter {
          display: flex;
          align-items: center;
          font-size: 0.7rem; /* Adjusted font size */
          color: #4b5563;
        }

        .well-parameter label {
          margin-right: 0.1rem; /* Reduced margin */
          font-weight: 500;
        }

        .well-parameter input {
          width: 3rem; /* Reduced width */
          padding: 0.1rem; /* Reduced padding */
          border: 1px solid #d1d5db;
          border-radius: 0.3rem;
          text-align: center;
          font-size: 0.7rem; /* Adjusted font size */
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
          transition: border-color 0.2s ease-in-out;
        }

        .well-parameter input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
      `}</style>
      <div className="merged-plate-table-wrapper">
        <table className="merged-plate-table">
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
                  return (
                    <td
                      key={colIndex}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop(rowIndex, colIndex)}
                      onClick={() => onWellSelect(rowIndex, colIndex)}
                      className={`${isRightBoundary ? 'border-right' : ''} ${isBottomBoundary ? 'border-bottom' : ''} ${isSelected ? 'selected-well' : ''}`}
                    >
                      <div className="well-content">
                        {well.method && (
                          <>
                            <span className="well-method">{well.method}</span>
                            {well.params.map((param) => (
                              <div key={param} className="well-parameter">
                                <label>{param}:</label>
                                <input
                                  type="text"
                                  value={well.parameters[param] || ''}
                                  onChange={(e) =>
                                    handleWellCustomization(
                                      rowIndex,
                                      colIndex,
                                      param,
                                      e.target.value
                                    )
                                  }
                                  onClick={(e) => e.stopPropagation()} // Prevent selecting well when clicking input
                                />
                              </div>
                            ))}
                          </>
                        )}
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
