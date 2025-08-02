// Plate.js
import React from 'react';

const Plate = ({
  plate,
  handleDragOver,
  handleDrop,
  handleWellCustomization,
  handleCopyPlate,
  handlePastePlate,
  copiedPlateData,
  handleLayoutChange,
  isSelected,
  onSelect,
}) => {
  const [rows, cols] = plate.layout === '96-well' ? [8, 12] : [6, 8];
  const rowLabels = 'ABCDEFGH'.slice(0, rows).split('');
  const colLabels = Array.from({ length: cols }, (_, i) => i + 1);

  return (
    <div
      className={`plate-wrapper ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(plate.id)}
    >
      <style>{`
        .plate-wrapper {
          background-color: white;
          padding: 1rem;
          border-radius: 0.75rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          transition: transform 0.2s ease-in-out, border 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
          cursor: pointer;
          border: 1px solid transparent; /* Default border */
        }

        .plate-wrapper.selected {
          border: 3px solid #3b82f6; /* Highlight selected plate */
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);
        }

        .plate-wrapper:hover {
          transform: translateY(-3px);
        }

        .plate-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .plate-title {
          font-weight: 700;
          font-size: 1.5rem;
          color: #1f2937;
        }

        .plate-controls {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .plate-control-button {
          padding: 0.4rem 0.8rem;
          font-size: 0.875rem;
          background-color: #e5e7eb;
          border-radius: 0.5rem;
          transition: background-color 0.2s ease-in-out, transform 0.1s ease-in-out;
          cursor: pointer;
          border: none;
          color: #374151;
          font-weight: 500;
        }
        .plate-control-button:hover {
          background-color: #d1d5db;
          transform: translateY(-1px);
        }
        .plate-control-button:active {
          transform: translateY(0);
        }
        .plate-control-button:disabled {
          background-color: #f3f4f6;
          color: #9ca3af;
          cursor: not-allowed;
          box-shadow: none;
        }

        .plate-layout-select {
          padding: 0.4rem;
          font-size: 0.875rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          background-color: white;
          cursor: pointer;
          color: #374151;
        }

        .plate-table-wrapper {
          overflow-x: auto;
          flex: 1;
        }

        .plate-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          min-width: max-content;
        }

        .plate-table th,
        .plate-table td {
          padding: 0.5rem;
          border: 1px solid #e5e7eb;
          text-align: center;
          vertical-align: middle;
          position: relative;
        }

        .plate-table th {
          background-color: #f9fafb;
          font-weight: 600;
          color: #4b5563;
          white-space: nowrap;
        }

        .plate-table td {
          height: 6rem;
          background-color: #ffffff;
          transition: background-color 0.1s ease-in-out;
        }

        .plate-table td:hover {
          background-color: #f0f0f0;
        }

        .well-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 0.25rem;
        }

        .well-method {
          font-weight: 600;
          font-size: 0.95rem;
          color: #3b82f6;
        }

        .well-parameter {
          display: flex;
          align-items: center;
          font-size: 0.75rem;
          color: #4b5563;
        }

        .well-parameter label {
          margin-right: 0.25rem;
          font-weight: 500;
        }

        .well-parameter input {
          width: 3.5rem;
          padding: 0.2rem;
          border: 1px solid #d1d5db;
          border-radius: 0.3rem;
          text-align: center;
          font-size: 0.75rem;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
          transition: border-color 0.2s ease-in-out;
        }

        .well-parameter input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
      `}</style>
      <div className="plate-header">
        <h3 className="plate-title">Plate {plate.id} ({plate.layout})</h3>
        <div className="plate-controls">
          <button
            onClick={(e) => { e.stopPropagation(); handleCopyPlate(plate.id); }} // Stop propagation to prevent selecting plate when clicking button
            className="plate-control-button"
          >
            Copy
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handlePastePlate(plate.id); }}
            disabled={!copiedPlateData}
            className="plate-control-button"
          >
            Paste
          </button>
          <select
            value={plate.layout}
            onChange={(e) => { e.stopPropagation(); handleLayoutChange(plate.id, e.target.value); }}
            className="plate-layout-select"
          >
            <option value="96-well">96-well</option>
            <option value="48-well">48-well</option>
          </select>
        </div>
      </div>

      <div className="plate-table-wrapper">
        <table className="plate-table">
          <thead>
            <tr>
              <th></th>
              {colLabels.map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plate.data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th>{rowLabels[rowIndex]}</th>
                {row.map((well, colIndex) => (
                  <td
                    key={colIndex}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop(plate.id, rowIndex, colIndex)}
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
                                    plate.id,
                                    rowIndex,
                                    colIndex,
                                    param,
                                    e.target.value
                                  )
                                }
                                onClick={(e) => e.stopPropagation()} // Prevent selecting plate when clicking input
                              />
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Plate;
