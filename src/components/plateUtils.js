// This file contains utility functions for the plate table component.

/**
 * Gets the number of rows and columns for a given plate layout.
 * @param {string} layout - The plate layout ('96-well' or '48-well').
 * @returns {{rows: number, cols: number}} The dimensions of the layout.
 */
export const getLayoutDimensions = (layout) => {
  if (layout === '96-well') {
    return { rows: 8, cols: 12 };
  }
  return { rows: 6, cols: 8 }; // Default to '48-well'
};

/**
 * Checks if a given cell is within the selected range.
 * @param {number} rowIndex - The row index of the cell.
 * @param {number} colIndex - The column index of the cell.
 * @param {object|null} selectedRange - The object representing the selected range.
 * @returns {boolean} True if the cell is in the range, otherwise false.
 */
export const isCellInRange = (rowIndex, colIndex, selectedRange) => {
  if (!selectedRange) return false;
  const startRow = Math.min(selectedRange.startRow, selectedRange.endRow);
  const endRow = Math.max(selectedRange.startRow, selectedRange.endRow);
  const startCol = Math.min(selectedRange.startCol, selectedRange.endCol);
  const endCol = Math.max(selectedRange.startCol, selectedRange.endCol);

  return rowIndex >= startRow && rowIndex <= endRow &&
         colIndex >= startCol && colIndex <= endCol;
};

/**
 * Checks if a given cell is within the copied range (for a dotted border).
 * @param {number} rowIndex - The row index of the cell.
 * @param {number} colIndex - The column index of the cell.
 * @param {object|null} copiedRangeCoords - The object representing the copied range coordinates.
 * @returns {boolean} True if the cell is in the copied range, otherwise false.
 */
export const isCellInCopiedRange = (rowIndex, colIndex, copiedRangeCoords) => {
  if (!copiedRangeCoords) return false;
  const startRow = Math.min(copiedRangeCoords.startRow, copiedRangeCoords.endRow);
  const endRow = Math.max(copiedRangeCoords.startRow, copiedRangeCoords.endRow);
  const startCol = Math.min(copiedRangeCoords.startCol, copiedRangeCoords.endCol);
  const endCol = Math.max(copiedRangeCoords.startCol, copiedRangeCoords.endCol);

  return rowIndex >= startRow && rowIndex <= endRow &&
         colIndex >= startCol && colIndex <= endCol;
};
