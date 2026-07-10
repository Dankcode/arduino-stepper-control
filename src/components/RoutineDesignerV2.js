'use client';

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Check, ChevronLeft, ChevronRight, Download, Play, Save, Upload } from 'lucide-react';
import ProgressBar from './ui/ProgressBar';
import { useToast } from './ui/StatusToast';
import { colors, font, radii, shadows, motion } from './ui/tokens';

const QUADRANTS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const QUADRANT_LABELS = {
  topLeft: 'Plate 1',
  topRight: 'Plate 2',
  bottomLeft: 'Plate 3',
  bottomRight: 'Plate 4',
};
const QUADRANT_PLATE_NUMBER = { topLeft: 1, topRight: 2, bottomLeft: 3, bottomRight: 4 };
const PARAMS = [
  ['stepAmount', 'Steps', 'steps'],
  ['delayBetweenStep', 'Delay', 'ms'],
  ['lightTime', 'Light', 'ms'],
  ['exposureTime', 'Exposure', 'us'],
];
const DEFAULT_WELL = {
  stepAmount: 0,
  delayBetweenStep: 0,
  lightTime: 0,
  exposureTime: 0,
  switchPlate: false,
};
const WELL_ID_PATTERN = /^([A-Z])([1-9]\d*)$/;

const createDefaultFilename = () => {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${date}-${time}`;
};

const getLayoutDimensions = (layout) => {
  if (layout === '96-well') return { rows: 8, cols: 12 };
  if (layout === '48-well') return { rows: 6, cols: 8 };
  return { rows: 0, cols: 0 };
};

const createPlate = (layout) => {
  const { rows, cols } = getLayoutDimensions(layout);
  return {
    layout,
    wells: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ ...DEFAULT_WELL }))
    ),
  };
};

const initialState = {
  plates: {
    topLeft: createPlate('96-well'),
    topRight: null,
    bottomLeft: null,
    bottomRight: null,
  },
  selection: null,
  activeParam: 'stepAmount',
  filename: createDefaultFilename(),
  schedule: { repeatCount: 1, startTime: '09:00', repeatInterval: 'daily' },
  saveState: 'idle',
  inspectorOpen: true,
};

const selectionKey = (row, col) => `${row},${col}`;
const parseSelectionKey = (key) => key.split(',').map(Number);
const sanitizeFilename = (value) => String(value || '')
  .trim()
  .replace(/(?:\.(?:json|sql))+$/i, '')
  .replace(/[^a-zA-Z0-9-_.]/g, '');

function reducer(state, action) {
  switch (action.type) {
    case 'SET_LAYOUT': {
      const plate = action.layout === 'none' ? null : createPlate(action.layout);
      return {
        ...state,
        plates: { ...state.plates, [action.quadrant]: plate },
        selection: state.selection?.quadrant === action.quadrant ? null : state.selection,
      };
    }
    case 'SELECT':
      return { ...state, selection: { quadrant: action.quadrant, cells: action.cells } };
    case 'APPLY_PARAM': {
      const selection = state.selection;
      if (!selection || selection.cells.size === 0) return state;
      const plate = state.plates[selection.quadrant];
      if (!plate) return state;
      const nextWells = plate.wells.map((row, rowIndex) =>
        row.map((well, colIndex) => {
          if (!selection.cells.has(selectionKey(rowIndex, colIndex))) return well;
          const value = action.param === 'switchPlate'
            ? Boolean(action.value)
            : Math.max(0, Number(action.value) || 0);
          return { ...well, [action.param]: value };
        })
      );
      return {
        ...state,
        plates: {
          ...state.plates,
          [selection.quadrant]: { ...plate, wells: nextWells },
        },
        saveState: 'idle',
      };
    }
    case 'IMPORT_JSON':
      return {
        ...state,
        plates: action.plates,
        filename: action.filename || state.filename,
        schedule: { ...initialState.schedule, ...(action.schedule || {}) },
        saveState: 'idle',
        selection: null,
      };
    case 'SET_FILENAME':
      return { ...state, filename: sanitizeFilename(action.filename), saveState: 'idle' };
    case 'SET_SCHEDULE':
      return { ...state, schedule: { ...state.schedule, ...action.schedule }, saveState: 'idle' };
    case 'SET_ACTIVE_PARAM':
      return { ...state, activeParam: action.param };
    case 'SET_SAVE_STATE':
      return { ...state, saveState: action.saveState };
    case 'TOGGLE_INSPECTOR':
      return { ...state, inspectorOpen: !state.inspectorOpen };
    default:
      return state;
  }
}

const flattenPlates = (plates) => {
  const rows = [];
  QUADRANTS.forEach((quadrant) => {
    const plate = plates[quadrant];
    if (!plate) return;
    plate.wells.forEach((row, rowIndex) => {
      row.forEach((well, colIndex) => {
        rows.push({
          plateNumber: QUADRANT_PLATE_NUMBER[quadrant],
          wellId: `${String.fromCharCode(65 + rowIndex)}${colIndex + 1}`,
          layout: plate.layout,
          stepAmount: Number(well.stepAmount) || 0,
          delayBetweenStep: Number(well.delayBetweenStep) || 0,
          lightTime: Number(well.lightTime) || 0,
          exposureTime: Number(well.exposureTime) || 0,
          switchPlate: well.switchPlate ? 1 : 0,
        });
      });
    });
  });
  return rows;
};

const importedSchedule = (payload) => {
  const nested = payload?.schedule && typeof payload.schedule === 'object'
    ? payload.schedule
    : {};
  const source = { ...payload, ...nested };
  const schedule = {};
  const repeatCount = Number(source.repeatCount);
  if (Number.isFinite(repeatCount) && repeatCount > 0) schedule.repeatCount = repeatCount;
  if (typeof source.startTime === 'string' && source.startTime) schedule.startTime = source.startTime;
  if (typeof source.repeatInterval === 'string' && source.repeatInterval) {
    schedule.repeatInterval = source.repeatInterval;
  }
  return schedule;
};

const routinePayload = (state) => {
  const schedule = {
    repeatCount: Math.max(1, Number(state.schedule.repeatCount) || 1),
    startTime: state.schedule.startTime,
    repeatInterval: state.schedule.repeatInterval,
  };
  return {
    filename: state.filename,
    well_data: flattenPlates(state.plates),
    schedule,
    // Flat fields keep exported routines compatible with the existing uploader.
    ...schedule,
  };
};

const hydrateImport = (payload) => {
  const plates = { topLeft: null, topRight: null, bottomLeft: null, bottomRight: null };
  const plateToQuadrant = { 1: 'topLeft', 2: 'topRight', 3: 'bottomLeft', 4: 'bottomRight' };
  (payload.well_data || []).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const quadrant = plateToQuadrant[item.plateNumber] || 'topLeft';
    const layout = item.layout === '48-well' ? '48-well' : '96-well';
    const wellId = String(item.wellId || '').trim().toUpperCase();
    const match = WELL_ID_PATTERN.exec(wellId);
    if (!match) return;
    if (!plates[quadrant]) plates[quadrant] = createPlate(layout);
    const row = match[1].charCodeAt(0) - 65;
    const col = Number(match[2]) - 1;
    if (plates[quadrant].wells[row]?.[col]) {
      plates[quadrant].wells[row][col] = {
        stepAmount: Number(item.stepAmount) || 0,
        delayBetweenStep: Number(item.delayBetweenStep) || 0,
        lightTime: Number(item.lightTime) || 0,
        exposureTime: Number(item.exposureTime) || 0,
        switchPlate: item.switchPlate === 1 || item.switchPlate === true,
      };
    }
  });
  if (!Object.values(plates).some(Boolean)) plates.topLeft = createPlate('96-well');
  return plates;
};

const useRuntimeEstimate = (PI_BACKEND_URL, plates) => {
  const [estimate, setEstimate] = useState({ seconds: 0, loading: false, source: 'local' });
  const payload = useMemo(() => flattenPlates(plates), [plates]);

  useEffect(() => {
    let canceled = false;
    const localSeconds = payload.reduce((sum, well) => {
      if (!well.stepAmount) return sum;
      return sum + well.delayBetweenStep / 1000 + well.lightTime / 1000 + well.exposureTime / 1_000_000;
    }, 0);

    setEstimate({ seconds: localSeconds, loading: Boolean(PI_BACKEND_URL), source: 'local' });
    if (!PI_BACKEND_URL) return undefined;

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${PI_BACKEND_URL}/api/motion/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ well_data: payload }),
        });
        const data = await response.json();
        if (!canceled && response.ok) {
          setEstimate({ seconds: Number(data.seconds) || 0, loading: false, source: 'backend' });
        }
      } catch (_error) {
        if (!canceled) setEstimate({ seconds: localSeconds, loading: false, source: 'local' });
      }
    }, 500);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [PI_BACKEND_URL, payload]);

  return estimate;
};

const useSelectionValues = (plates, selection) => useMemo(() => {
  if (!selection || selection.cells.size === 0) return {};
  const plate = plates[selection.quadrant];
  if (!plate) return {};

  return [...PARAMS.map(([param]) => param), 'switchPlate'].reduce((acc, param) => {
    const values = Array.from(selection.cells).map((key) => {
      const [row, col] = parseSelectionKey(key);
      return plate.wells[row]?.[col]?.[param];
    });
    const first = values[0];
    acc[param] = values.every(value => value === first) ? first : 'mixed';
    return acc;
  }, {});
}, [plates, selection]);

const formatSeconds = (value) => {
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const Toolbar = memo(function Toolbar({ state, dispatch, runtime, saving, running, onSave, onRun, onImport, onExport }) {
  return (
    <div className="routine-designer-toolbar" style={styles.toolbar}>
      <input
        className="routine-designer-filename"
        value={state.filename}
        onChange={(event) => dispatch({ type: 'SET_FILENAME', filename: event.target.value })}
        placeholder="routine-name"
        style={styles.filenameInput}
      />
      <button type="button" onClick={onSave} disabled={saving || !state.filename} style={styles.primaryButton}>
        {saving ? <ProgressBar size="sm" /> : <><Save size={16} /> Save</>}
      </button>
      <button type="button" onClick={onRun} disabled={running || !state.filename} style={styles.secondaryButton}>
        <Play size={16} />
        {running ? 'Starting...' : 'Run now'}
      </button>
      <label style={styles.secondaryButton}>
        <Upload size={16} />
        Import
        <input type="file" accept="application/json,.json" onChange={onImport} style={{ display: 'none' }} />
      </label>
      <button type="button" onClick={onExport} disabled={!state.filename} style={styles.secondaryButton}>
        <Download size={16} />
        Export
      </button>
      <select
        value={state.schedule.repeatInterval}
        onChange={(event) => dispatch({ type: 'SET_SCHEDULE', schedule: { repeatInterval: event.target.value } })}
        style={styles.select}
      >
        <option value="once">Once</option>
        <option value="daily">Daily</option>
        <option value="hourly">Hourly</option>
      </select>
      <input
        type="time"
        value={state.schedule.startTime}
        onChange={(event) => dispatch({ type: 'SET_SCHEDULE', schedule: { startTime: event.target.value } })}
        style={styles.timeInput}
      />
      <div className="routine-designer-runtime" style={styles.runtimeChip}>
        {runtime.loading ? 'Estimating...' : `Runtime ${formatSeconds(runtime.seconds)}`}
      </div>
    </div>
  );
});

const WellCell = memo(function WellCell({ row, col, well, selected, activeParam, maxValue, onPointerDown, onPointerEnter, onPointerUp }) {
  const value = Number(well[activeParam]) || 0;
  const alpha = maxValue > 0 ? Math.min(0.9, 0.12 + (value / maxValue) * 0.65) : 0;
  return (
    <button
      type="button"
      title={`${String.fromCharCode(65 + row)}${col + 1}: ${activeParam} ${value}`}
      onMouseDown={(event) => onPointerDown(event, row, col)}
      onMouseEnter={() => onPointerEnter(row, col)}
      onMouseUp={() => onPointerUp()}
      style={{
        ...styles.wellCell,
        background: value > 0 ? `rgba(14, 165, 233, ${alpha})` : colors.surface1,
        outline: selected ? `2px solid ${colors.textHi}` : '1px solid rgba(51,65,85,0.8)',
      }}
    >
      {value > 0 ? value : ''}
    </button>
  );
});

const PlateCanvas = memo(function PlateCanvas({ state, dispatch, clipboardRef }) {
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const selectionAnchorRef = useRef(null);
  const activePlates = QUADRANTS.filter(quadrant => state.plates[quadrant]);
  const maxValue = useMemo(() => {
    let max = 0;
    activePlates.forEach((quadrant) => {
      state.plates[quadrant].wells.forEach(row => row.forEach((well) => {
        max = Math.max(max, Number(well[state.activeParam]) || 0);
      }));
    });
    return max;
  }, [activePlates, state.activeParam, state.plates]);

  const commitRange = useCallback((quadrant, start, end) => {
    const plate = state.plates[quadrant];
    if (!plate) return;
    const minRow = Math.max(0, Math.min(start.row, end.row));
    const maxRow = Math.min(plate.wells.length - 1, Math.max(start.row, end.row));
    const minCol = Math.max(0, Math.min(start.col, end.col));
    const maxCol = Math.min(plate.wells[0].length - 1, Math.max(start.col, end.col));
    const cells = new Set();
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) cells.add(selectionKey(row, col));
    }
    dispatch({ type: 'SELECT', quadrant, cells });
  }, [dispatch, state.plates]);

  const setSingleSelection = useCallback((event, quadrant, row, col) => {
    const key = selectionKey(row, col);

    if (event.shiftKey && selectionAnchorRef.current?.quadrant === quadrant) {
      commitRange(quadrant, selectionAnchorRef.current.cell, { row, col });
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      const nextCells = state.selection?.quadrant === quadrant
        ? new Set(state.selection.cells)
        : new Set();
      if (nextCells.has(key)) {
        nextCells.delete(key);
      } else {
        nextCells.add(key);
      }
      dispatch({ type: 'SELECT', quadrant, cells: nextCells });
      selectionAnchorRef.current = { quadrant, cell: { row, col } };
      return;
    }

    const isOnlySelected = state.selection?.quadrant === quadrant &&
      state.selection.cells.size === 1 &&
      state.selection.cells.has(key);
    dispatch({ type: 'SELECT', quadrant, cells: isOnlySelected ? new Set() : new Set([key]) });
    selectionAnchorRef.current = { quadrant, cell: { row, col } };
  }, [commitRange, dispatch, state.selection]);

  const handleCopy = useCallback(() => {
    const selection = state.selection;
    if (!selection) return;
    const plate = state.plates[selection.quadrant];
    if (!plate) return;
    const points = Array.from(selection.cells).map(parseSelectionKey);
    const minRow = Math.min(...points.map(([row]) => row));
    const maxRow = Math.max(...points.map(([row]) => row));
    const minCol = Math.min(...points.map(([, col]) => col));
    const maxCol = Math.max(...points.map(([, col]) => col));
    clipboardRef.current = {
      rows: Array.from({ length: maxRow - minRow + 1 }, (_, rowOffset) =>
        Array.from({ length: maxCol - minCol + 1 }, (_, colOffset) => ({
          ...plate.wells[minRow + rowOffset][minCol + colOffset],
        }))
      ),
    };
  }, [clipboardRef, state.plates, state.selection]);

  const handlePaste = useCallback(() => {
    const clip = clipboardRef.current;
    const selection = state.selection;
    if (!clip || !selection) return;
    const [startRow, startCol] = parseSelectionKey(selection.cells.values().next().value);
    clip.rows.forEach((row, rowOffset) => {
      row.forEach((well, colOffset) => {
        dispatch({
          type: 'SELECT',
          quadrant: selection.quadrant,
          cells: new Set([selectionKey(startRow + rowOffset, startCol + colOffset)]),
        });
        Object.entries(well).forEach(([param, value]) => {
          dispatch({ type: 'APPLY_PARAM', param, value });
        });
      });
    });
  }, [clipboardRef, dispatch, state.selection]);

  const handleKeyDown = useCallback((event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      handleCopy();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      handlePaste();
    }
  }, [handleCopy, handlePaste]);

  return (
    <div
      className="routine-designer-canvas"
      ref={canvasRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseUp={() => { dragRef.current = null; }}
      onMouseLeave={() => { dragRef.current = null; }}
      style={styles.canvas}
    >
      <div className="routine-designer-plate-grid" style={{
        ...styles.plateGrid,
        gridTemplateColumns: activePlates.length === 1 ? 'minmax(320px, 720px)' : 'repeat(2, minmax(260px, 1fr))',
      }}>
        {QUADRANTS.map((quadrant) => {
          const plate = state.plates[quadrant];
          if (!plate) {
            return (
              <button
                key={quadrant}
                type="button"
                onClick={() => dispatch({ type: 'SET_LAYOUT', quadrant, layout: '96-well' })}
                style={styles.emptyPlate}
              >
                {QUADRANT_LABELS[quadrant]}
              </button>
            );
          }
          const { rows, cols } = getLayoutDimensions(plate.layout);
          return (
            <section key={quadrant} className="routine-designer-plate-section" style={styles.plateSection}>
              <div style={styles.plateHeader}>
                <span>{QUADRANT_LABELS[quadrant]}</span>
                <select
                  value={plate.layout}
                  onChange={(event) => dispatch({ type: 'SET_LAYOUT', quadrant, layout: event.target.value })}
                  style={styles.smallSelect}
                >
                  <option value="none">Empty</option>
                  <option value="48-well">48-well</option>
                  <option value="96-well">96-well</option>
                </select>
              </div>
              <div className="routine-designer-well-grid" style={{ ...styles.wellGrid, gridTemplateColumns: `24px repeat(${cols}, minmax(24px, 1fr))` }}>
                <div />
                {Array.from({ length: cols }, (_, col) => <div key={col} style={styles.axisLabel}>{col + 1}</div>)}
                {Array.from({ length: rows }, (_, row) => (
                  <React.Fragment key={row}>
                    <div style={styles.axisLabel}>{String.fromCharCode(65 + row)}</div>
                    {Array.from({ length: cols }, (_, col) => (
                      <WellCell
                        key={`${row}-${col}`}
                        row={row}
                        col={col}
                        well={plate.wells[row][col]}
                        activeParam={state.activeParam}
                        maxValue={maxValue}
                        selected={state.selection?.quadrant === quadrant && state.selection.cells.has(selectionKey(row, col))}
                        onPointerDown={(event, r, c) => {
                          setSingleSelection(event, quadrant, r, c);
                          dragRef.current = {
                            quadrant,
                            start: { row: r, col: c },
                            dragEnabled: !event.shiftKey && !event.metaKey && !event.ctrlKey,
                          };
                        }}
                        onPointerEnter={(r, c) => {
                          if (dragRef.current?.quadrant === quadrant && dragRef.current.dragEnabled) {
                            window.requestAnimationFrame(() => commitRange(quadrant, dragRef.current.start, { row: r, col: c }));
                          }
                        }}
                        onPointerUp={() => {
                          dragRef.current = null;
                        }}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
});

const Inspector = memo(function Inspector({ state, values, dispatch }) {
  if (!state.inspectorOpen) {
    return (
      <button type="button" onClick={() => dispatch({ type: 'TOGGLE_INSPECTOR' })} style={styles.inspectorTab}>
        <ChevronLeft size={16} />
      </button>
    );
  }

  const count = state.selection?.cells.size || 0;
  const selectionLabel = count > 0 ? `${count} well${count === 1 ? '' : 's'} selected` : 'No wells selected';

  return (
    <aside className="routine-designer-inspector" style={styles.inspector}>
      <button type="button" onClick={() => dispatch({ type: 'TOGGLE_INSPECTOR' })} style={styles.collapseButton}>
        <ChevronRight size={16} />
      </button>
      <h2 style={styles.inspectorTitle}>{selectionLabel}</h2>
      <div style={styles.segmented}>
        {PARAMS.map(([param, label]) => (
          <button
            key={param}
            type="button"
            onClick={() => dispatch({ type: 'SET_ACTIVE_PARAM', param })}
            style={state.activeParam === param ? styles.segmentActive : styles.segment}
          >
            {label}
          </button>
        ))}
      </div>
      {PARAMS.map(([param, label, unit]) => (
        <label key={param} style={styles.field}>
          <span>{label}</span>
          <div style={styles.numberWrap}>
            <input
              type="number"
              min="0"
              disabled={!count}
              value={values[param] === 'mixed' || values[param] === undefined ? '' : values[param]}
              placeholder={values[param] === 'mixed' ? '-' : '0'}
              onChange={(event) => dispatch({ type: 'APPLY_PARAM', param, value: event.target.value })}
              style={styles.numberInput}
            />
            <span style={styles.unit}>{unit}</span>
          </div>
        </label>
      ))}
      <label style={styles.toggleRow}>
        <input
          type="checkbox"
          disabled={!count}
          checked={values.switchPlate === 'mixed' ? false : Boolean(values.switchPlate)}
          onChange={(event) => dispatch({ type: 'APPLY_PARAM', param: 'switchPlate', value: event.target.checked })}
        />
        Switch plate after this well
      </label>
    </aside>
  );
});

const StatusBar = memo(function StatusBar({ state }) {
  const activeWellCount = flattenPlates(state.plates).filter(well => well.stepAmount > 0).length;
  const warnings = [];
  if (!state.filename) warnings.push('Routine name required');
  if (activeWellCount === 0) warnings.push('No active wells');
  const saveText = state.saveState === 'saved' ? 'Saved' : state.saveState === 'error' ? 'Save failed' : 'Ready';
  return (
    <div style={styles.statusBar}>
      <span>{activeWellCount} active wells</span>
      <span>{warnings[0] || 'Validation clear'}</span>
      <span style={{ color: state.saveState === 'saved' ? colors.success : colors.textMid }}>
        {state.saveState === 'saved' ? <Check size={14} /> : null}
        {saveText}
      </span>
    </div>
  );
});

const RoutineDesignerV2 = ({ PI_BACKEND_URL, editRequest }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const clipboardRef = useRef(null);
  const toast = useToast();
  const runtime = useRuntimeEstimate(PI_BACKEND_URL, state.plates);
  const values = useSelectionValues(state.plates, state.selection);

  // Load a saved routine for editing when Pi Routines' Edit button is clicked.
  // editRequest.ts changes on every click so re-editing the same routine works.
  useEffect(() => {
    if (!editRequest?.name) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `${PI_BACKEND_URL}/routines/detail?filename=${encodeURIComponent(editRequest.name)}`,
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to load routine.');
        if (cancelled) return;
        dispatch({
          type: 'IMPORT_JSON',
          plates: hydrateImport(data),
          filename: sanitizeFilename(data.filename),
          schedule: data.schedule,
        });
        toast.success(`Loaded '${data.filename}' for editing.`);
      } catch (error) {
        if (!cancelled) toast.error(error.message);
      }
    })();
    return () => { cancelled = true; };
  }, [PI_BACKEND_URL, editRequest?.name, editRequest?.ts, toast]);

  const handleSave = useCallback(async () => {
    if (!state.filename) {
      toast.error('Routine name is required.');
      return;
    }
    setSaving(true);
    dispatch({ type: 'SET_SAVE_STATE', saveState: 'saving' });
    try {
      const response = await fetch(`${PI_BACKEND_URL}/save_routine_sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routinePayload(state)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Backend rejected the save (HTTP ${response.status}).`);
      dispatch({ type: 'SET_SAVE_STATE', saveState: 'saved' });
      toast.success(data.message || 'Routine saved.');
    } catch (error) {
      dispatch({ type: 'SET_SAVE_STATE', saveState: 'error' });
      const message = error instanceof TypeError
        ? `Could not reach the backend at ${PI_BACKEND_URL}. Is it running? (See scripts/run_backend_local.sh to run one locally.)`
        : error.message;
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [PI_BACKEND_URL, state.filename, state.plates, state.schedule, toast]);

  // Export the routine as a portable JSON file in the same format the Import
  // button (and the old RoutineBuilder) accepts: { filename, well_data: [...] }.
  const handleExport = useCallback(() => {
    const payload = { ...routinePayload(state), filename: state.filename || 'routine' };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${payload.filename}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${payload.filename}.json`);
  }, [state.filename, state.plates, state.schedule, toast]);

  const handleImport = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!payload || !Array.isArray(payload.well_data) || payload.well_data.length === 0) {
          throw new Error('This file does not contain any routine well data.');
        }
        dispatch({
          type: 'IMPORT_JSON',
          plates: hydrateImport(payload),
          filename: sanitizeFilename(payload.filename || file.name),
          schedule: importedSchedule(payload),
        });
        toast.success('Routine imported.');
      } catch (error) {
        toast.error(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [toast]);

  const handleRun = useCallback(async () => {
    if (!state.filename) {
      toast.error('Routine name is required.');
      return;
    }
    setRunning(true);
    try {
      const saveResponse = await fetch(`${PI_BACKEND_URL}/save_routine_sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routinePayload(state)),
      });
      const saveData = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(saveData.error || 'Save before run failed.');
      dispatch({ type: 'SET_SAVE_STATE', saveState: 'saved' });

      const response = await fetch(`${PI_BACKEND_URL}/api/routine/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: state.filename, plate: 1 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Failed to start routine.');
      toast.success(data.message || 'Routine started.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRunning(false);
    }
  }, [PI_BACKEND_URL, state.filename, state.plates, state.schedule, toast]);

  return (
    <>
    <div className="routine-designer-v2" style={styles.root}>
      <Toolbar
        state={state}
        dispatch={dispatch}
        runtime={runtime}
        saving={saving}
        running={running}
        onSave={handleSave}
        onRun={handleRun}
        onImport={handleImport}
        onExport={handleExport}
      />
      <main className="routine-designer-main" style={styles.main}>
        <PlateCanvas state={state} dispatch={dispatch} clipboardRef={clipboardRef} />
        <Inspector state={state} values={values} dispatch={dispatch} />
      </main>
      <StatusBar state={state} />
    </div>
    <style jsx global>{`
      @media (max-width: 700px) {
        .routine-designer-v2 {
          grid-template-rows: auto minmax(0, 1fr) 34px !important;
          min-width: 0;
        }
        .routine-designer-toolbar {
          gap: 6px !important;
          overflow-x: auto;
          padding: 6px 8px !important;
          scrollbar-width: none;
        }
        .routine-designer-toolbar::-webkit-scrollbar { display: none; }
        .routine-designer-toolbar button,
        .routine-designer-toolbar label,
        .routine-designer-toolbar select,
        .routine-designer-toolbar input {
          flex: 0 0 auto;
          white-space: nowrap;
        }
        .routine-designer-filename { width: 150px !important; }
        .routine-designer-runtime { display: none; }
        .routine-designer-main {
          display: flex !important;
          flex-direction: column;
          min-width: 0;
          overflow: auto;
        }
        .routine-designer-canvas {
          flex: 1 1 auto;
          overflow: auto !important;
          padding: 8px !important;
        }
        .routine-designer-plate-grid {
          grid-template-columns: minmax(320px, 1fr) !important;
          justify-content: start !important;
          min-width: 320px;
          width: 100%;
        }
        .routine-designer-plate-section { min-width: 0; width: 100%; }
        .routine-designer-inspector {
          width: 100% !important;
          max-height: 250px;
          border-left: none !important;
          border-top: 1px solid ${colors.border};
        }
      }
    `}</style>
    </>
  );
};

const styles = {
  root: {
    height: '100%',
    minHeight: 0,
    display: 'grid',
    gridTemplateRows: '48px minmax(0, 1fr) 34px',
    background: colors.bg,
    color: colors.textHi,
    fontFamily: font.sans,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: colors.surface1,
    borderBottom: `1px solid ${colors.border}`,
  },
  filenameInput: {
    width: 220,
    height: 34,
    background: colors.surface2,
    color: colors.textHi,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '0 10px',
  },
  primaryButton: {
    height: 34,
    minWidth: 94,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: colors.accent,
    color: colors.textHi,
    border: 'none',
    borderRadius: radii.sm,
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryButton: {
    height: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: colors.surface2,
    color: colors.textHi,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '0 10px',
    cursor: 'pointer',
  },
  select: {
    height: 34,
    background: colors.surface2,
    color: colors.textHi,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
  },
  smallSelect: {
    background: colors.surface2,
    color: colors.textMid,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    fontSize: font.size.xs,
  },
  timeInput: {
    height: 34,
    background: colors.surface2,
    color: colors.textHi,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
  },
  runtimeChip: {
    marginLeft: 'auto',
    color: colors.info,
    fontFamily: font.mono,
    fontSize: font.size.sm,
  },
  main: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    minHeight: 0,
  },
  canvas: {
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    padding: 12,
    position: 'relative',
  },
  plateGrid: {
    display: 'grid',
    gap: 12,
    alignItems: 'start',
    justifyContent: 'center',
  },
  plateSection: {
    background: colors.surface1,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: 8,
    boxShadow: shadows.glow,
  },
  plateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    color: colors.textMid,
    fontSize: font.size.sm,
    fontWeight: 700,
  },
  emptyPlate: {
    minHeight: 120,
    background: colors.surface1,
    color: colors.textLo,
    border: `1px dashed ${colors.border}`,
    borderRadius: radii.md,
    cursor: 'pointer',
  },
  wellGrid: {
    display: 'grid',
    gap: 3,
  },
  axisLabel: {
    height: 24,
    display: 'grid',
    placeItems: 'center',
    color: colors.textLo,
    fontFamily: font.mono,
    fontSize: font.size.xs,
  },
  wellCell: {
    aspectRatio: '1 / 1',
    minWidth: 24,
    border: 'none',
    borderRadius: 4,
    color: colors.textHi,
    fontFamily: font.mono,
    fontSize: font.size.xs,
    cursor: 'pointer',
    transition: `background ${motion.fast}, outline ${motion.fast}`,
    overflow: 'hidden',
  },
  mouseUpCatcher: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
  },
  inspector: {
    width: 300,
    minHeight: 0,
    overflow: 'auto',
    background: colors.surface1,
    borderLeft: `1px solid ${colors.border}`,
    padding: 12,
    position: 'relative',
  },
  inspectorTab: {
    width: 38,
    border: 'none',
    borderLeft: `1px solid ${colors.border}`,
    background: colors.surface1,
    color: colors.textMid,
    cursor: 'pointer',
  },
  collapseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    border: `1px solid ${colors.border}`,
    background: colors.surface2,
    color: colors.textMid,
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  inspectorTitle: {
    margin: '0 36px 12px 0',
    fontSize: font.size.lg,
  },
  segmented: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6,
    marginBottom: 12,
  },
  segment: {
    height: 30,
    border: `1px solid ${colors.border}`,
    background: colors.surface2,
    color: colors.textMid,
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  segmentActive: {
    height: 30,
    border: `1px solid ${colors.accent}`,
    background: colors.accentDim,
    color: colors.textHi,
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  field: {
    display: 'grid',
    gap: 5,
    marginBottom: 10,
    color: colors.textMid,
    fontSize: font.size.sm,
  },
  numberWrap: {
    display: 'grid',
    gridTemplateColumns: '1fr 48px',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  numberInput: {
    minWidth: 0,
    height: 34,
    background: colors.surface2,
    color: colors.textHi,
    border: 'none',
    padding: '0 8px',
    fontFamily: font.mono,
  },
  unit: {
    display: 'grid',
    placeItems: 'center',
    background: colors.bg,
    color: colors.textLo,
    fontFamily: font.mono,
    fontSize: font.size.xs,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: colors.textMid,
    fontSize: font.size.sm,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '0 12px',
    background: colors.surface1,
    borderTop: `1px solid ${colors.border}`,
    color: colors.textMid,
    fontSize: font.size.sm,
  },
};

export default RoutineDesignerV2;
