import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from './ui/StatusToast';

const StepperMotorControl = ({ PI_BACKEND_URL }) => {
  const [steps, setSteps] = useState(400);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [manualExposure, setManualExposure] = useState(50000);
  const [blueLightOn, setBlueLightOn] = useState(false);
  const [wellTestProgress, setWellTestProgress] = useState('');
  const toast = useToast();
  const loading = Boolean(pendingAction);
  const motionBusy = [
    'x-forward',
    'x-backward',
    'zy-forward',
    'zy-backward',
    'enable',
    'disable',
    'test',
    'well-test',
  ].includes(pendingAction);

  const API_BASE = useMemo(() => `${PI_BACKEND_URL.replace(/\/$/, '')}/api`, [PI_BACKEND_URL]);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/status`);
      if (!response.ok) throw new Error('Status request failed');
      const data = await response.json();
      setConnected(data.connected);
      if (Number.isFinite(data.current_steps)) setSteps(data.current_steps);
      if (data.connected) {
        setMessage(`Connected to Arduino via port: ${data.port || 'Unknown'}`);
      }
    } catch (error) {
      setMessage('Failed to connect to backend');
    }
  }, [API_BASE]);

  useEffect(() => {
    const saved = localStorage.getItem('cnc_default_steps');
    const savedSteps = Number.parseInt(saved, 10);
    if (Number.isFinite(savedSteps) && savedSteps > 0) setSteps(savedSteps);
    checkStatus();
  }, [checkStatus]);

  const handleBlueLightToggle = async (targetState) => {
    setPendingAction('light');
    try {
      const response = await fetch(`${API_BASE}/bluelight/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: targetState }),
      });
      const data = await response.json();
      if (data.success) {
        setBlueLightOn(targetState === 'on');
        setMessage(data.message);
        toast.success(data.message);
      } else {
        setMessage(`Light error: ${data.message}`);
        toast.error(data.message || 'Blue light command failed.');
      }
    } catch (error) {
      setMessage('Failed to reach blue light API');
      toast.error('Failed to reach blue light API');
    } finally {
      setPendingAction(null);
    }
  };

  const handleConnect = async () => {
    setPendingAction('connect');
    try {
      const response = await fetch(`${API_BASE}/connect`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) {
        setConnected(true);
        toast.success(data.message);
      } else {
        toast.error(data.message || 'Failed to connect to Arduino');
      }
    } catch (error) {
      setMessage('Failed to connect to Arduino');
      toast.error('Failed to connect to Arduino');
    } finally {
      setPendingAction(null);
    }
  };

  const handleDisconnect = async () => {
    setPendingAction('disconnect');
    try {
      const response = await fetch(`${API_BASE}/disconnect`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) {
        setConnected(false);
        toast.info(data.message);
      }
    } catch (error) {
      setMessage('Failed to disconnect');
      toast.error('Failed to disconnect');
    } finally {
      setPendingAction(null);
    }
  };

  const updateSteps = async () => {
    const parsedSteps = Number.parseInt(steps, 10);
    if (!Number.isFinite(parsedSteps) || parsedSteps <= 0) {
      setMessage('Step amount must be a positive integer');
      toast.error('Step amount must be a positive integer');
      return;
    }
    setPendingAction('steps');
    try {
      const response = await fetch(`${API_BASE}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: parsedSteps }),
      });
      const data = await response.json();
      setMessage(data.message);
      if (response.ok) {
        setSteps(parsedSteps);
        localStorage.setItem('cnc_default_steps', String(parsedSteps));
        toast.success(data.message);
      } else {
        toast.error(data.message || 'Failed to update steps');
      }
    } catch (error) {
      setMessage('Failed to update steps');
      toast.error('Failed to update steps');
    } finally {
      setPendingAction(null);
    }
  };

  const sendMotorCommand = async (endpoint) => {
    if (!connected) { setMessage('Arduino not connected'); return; }
    setPendingAction(endpoint);
    try {
      const response = await fetch(`${API_BASE}/motor/${endpoint}`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      if (!response.ok) throw new Error(data.message || `Failed to send ${endpoint}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      setMessage(`Failed to send ${endpoint} command`);
      toast.error(error.message || `Failed to send ${endpoint} command`);
    } finally {
      setPendingAction(null);
    }
  };

  const handleWellTest = async () => {
    if (!connected) { setMessage('Arduino not connected'); return; }
    setPendingAction('well-test');
    setWellTestProgress('Starting well test...');
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const step = async (label, endpoint) => {
      setWellTestProgress(`Moving: ${label}`);
      await sendMotorCommandSilent(endpoint);
      await delay(600);
    };

    try {
      await step('A1 to A2 (X Forward)', 'x-forward');
      await step('A2 to B1 (ZY Forward)', 'zy-forward');
      await step('B1 to A2 (ZY Backward)', 'zy-backward');
      await step('A2 to A1 (X Backward)', 'x-backward');
      setWellTestProgress('Well test complete - returned to home (A1)');
      setMessage('Well test sequence finished successfully.');
    } catch (err) {
      setWellTestProgress('Well test failed.');
      setMessage(`Well test error: ${err.message}`);
      toast.error(`Well test error: ${err.message}`);
    } finally {
      setPendingAction(null);
    }
  };

  const sendMotorCommandSilent = async (endpoint) => {
    const response = await fetch(`${API_BASE}/motor/${endpoint}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `Failed to send ${endpoint}`);
    setMessage(data.message);
  };

  const handleTakePicture = async () => {
    if (manualExposure <= 0) { setMessage('Error: Exposure time must be > 0'); return; }
    setPendingAction('picture');
    try {
      const response = await fetch(`${API_BASE}/camera/take-picture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exposure_time: manualExposure,
          routine_name: 'ManualControl_Snapshot'
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Picture command failed');
      setMessage(data.message);
      toast.success(data.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      setMessage(`Error: ${error.message}`);
      toast.error(error.message);
    } finally {
      setPendingAction(null);
    }
  };

  const jogDisabled = motionBusy || !connected;

  return (
    <div className="mc-page">
      <style jsx global>{`
        .mc-page {
          display: flex;
          justify-content: center;
          padding: 1.5rem;
          overflow-y: auto;
          flex-grow: 1;
          box-sizing: border-box;
        }
        .mc-grid {
          display: grid;
          grid-template-columns: minmax(320px, 1.2fr) minmax(280px, 1fr);
          gap: 1rem;
          width: 100%;
          max-width: 62rem;
          align-content: start;
        }
        @media (max-width: 900px) { .mc-grid { grid-template-columns: 1fr; } }
        .mc-card {
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 0.75rem;
          padding: 1.1rem 1.25rem;
        }
        .mc-card-title {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #94a3b8;
          margin: 0 0 0.35rem;
        }
        .mc-card-hint { font-size: 0.75rem; color: #64748b; margin: 0 0 0.9rem; line-height: 1.4; }
        .mc-row { display: flex; gap: 0.5rem; align-items: center; }
        .mc-btn {
          padding: 0.6rem 1rem;
          font-weight: 700;
          border-radius: 0.4rem;
          cursor: pointer;
          border: 1px solid #475569;
          background: #334155;
          color: #f8fafc;
          font-size: 0.75rem;
          text-transform: uppercase;
          transition: all 0.15s;
          flex: 1;
        }
        .mc-btn:hover:not(:disabled) { background: #475569; }
        .mc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .mc-btn-primary { background: linear-gradient(135deg, #2563eb, #1d4ed8); border: none; color: white; }
        .mc-btn-primary:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); background: linear-gradient(135deg, #2563eb, #1d4ed8); }
        .mc-badge {
          padding: 0.2rem 0.6rem; border-radius: 0.25rem; font-size: 0.65rem;
          font-weight: 800; text-transform: uppercase;
        }
        .mc-badge.on { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid #10b981; }
        .mc-badge.off { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; }
        .mc-jog {
          display: grid;
          grid-template-columns: 3.4rem 3.4rem 3.4rem;
          grid-template-rows: 3.4rem 3.4rem 3.4rem;
          gap: 0.4rem;
          justify-content: center;
          margin: 0.5rem 0 0.75rem;
        }
        .mc-jog-btn {
          border-radius: 0.5rem; border: 1px solid #475569; background: #0f172a;
          color: #38bdf8; font-size: 1.15rem; font-weight: 800; cursor: pointer;
          transition: all 0.15s; display: flex; align-items: center; justify-content: center;
        }
        .mc-jog-btn:hover:not(:disabled) { border-color: #0ea5e9; background: #172554; }
        .mc-jog-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .mc-jog-center {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          font-size: 0.6rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;
          border: 1px dashed #334155; border-radius: 0.5rem;
        }
        .mc-axis-legend { display: flex; justify-content: center; gap: 1.25rem; font-size: 0.68rem; color: #64748b; margin-bottom: 0.75rem; }
        .mc-input {
          flex: 1; padding: 0.55rem; border: 1px solid #334155; border-radius: 0.35rem;
          font-size: 0.9rem; outline: none; background: #0f172a; color: #38bdf8;
          font-family: 'JetBrains Mono', monospace;
        }
        .mc-input:focus { border-color: #0ea5e9; }
        .mc-field-label { display: block; font-size: 0.66rem; font-weight: 700; color: #64748b; margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.06em; }
        .mc-field { margin-bottom: 0.9rem; }
        .mc-inline-note { font-size: 0.68rem; color: #64748b; margin-top: 0.3rem; }
        .mc-progress {
          margin-top: 0.6rem; padding: 0.5rem 0.65rem; border-radius: 0.375rem;
          background: #0f172a; border: 1px solid #0ea5e9; font-size: 0.72rem;
          color: #38bdf8; font-family: 'JetBrains Mono', monospace;
        }
        .mc-message {
          grid-column: 1 / -1; padding: 0.65rem 0.8rem; border-radius: 0.5rem;
          background: #0f172a; border: 1px solid #1e293b; font-size: 0.78rem;
          color: #94a3b8; font-family: 'JetBrains Mono', monospace;
        }
        .mc-light-btn {
          width: 100%; padding: 0.7rem; border-radius: 0.4rem; font-weight: 800;
          font-size: 0.75rem; text-transform: uppercase; cursor: pointer; transition: all 0.15s;
          background: #0f172a; color: #06b6d4; border: 1px solid #06b6d4;
        }
        .mc-light-btn.active { background: #06b6d4; color: #083344; box-shadow: 0 0 15px rgba(6, 182, 212, 0.4); }
        .mc-light-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mc-capture-btn {
          width: 100%; padding: 0.7rem; border-radius: 0.4rem; font-weight: 800;
          font-size: 0.75rem; text-transform: uppercase; cursor: pointer;
          background: linear-gradient(135deg, #f97316, #ea580c); color: white; border: none;
          transition: all 0.15s;
        }
        .mc-capture-btn:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(249, 115, 22, 0.35); }
        .mc-capture-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div className="mc-grid">
        {/* ---- Connection ---- */}
        <div className="mc-card">
          <h2 className="mc-card-title">Connection</h2>
          <p className="mc-card-hint">
            Links the backend to the Arduino stepper controller over USB serial.
            Connect once per session before moving the stage.
          </p>
          <div className="mc-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Arduino</span>
            <span className={`mc-badge ${connected ? 'on' : 'off'}`}>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="mc-row">
            <button
              onClick={handleConnect}
              disabled={pendingAction === 'connect' || connected}
              className="mc-btn mc-btn-primary"
              title="Open the serial connection to the Arduino stepper controller"
            >
              Connect
            </button>
            <button
              onClick={handleDisconnect}
              disabled={pendingAction === 'disconnect' || !connected}
              className="mc-btn"
              title="Close the serial connection (motors stay in their current position)"
            >
              Disconnect
            </button>
          </div>
          <div className="mc-row" style={{ marginTop: '0.5rem' }}>
            <button
              onClick={() => sendMotorCommand('enable')}
              disabled={jogDisabled}
              className="mc-btn"
              title="Energize the stepper motors so they hold position and can move"
            >
              Enable motors
            </button>
            <button
              onClick={() => sendMotorCommand('disable')}
              disabled={jogDisabled}
              className="mc-btn"
              title="De-energize the motors: they stop holding position and can be moved by hand"
            >
              Disable motors
            </button>
          </div>
        </div>

        {/* ---- Illumination + Camera ---- */}
        <div className="mc-card">
          <h2 className="mc-card-title">Illumination &amp; Camera</h2>
          <p className="mc-card-hint">
            The blue light illuminates the current well. Captures save to
            Pictures &rarr; ManualControl_Snapshot.
          </p>
          <div className="mc-field">
            <button
              onClick={() => handleBlueLightToggle(blueLightOn ? 'off' : 'on')}
              className={`mc-light-btn ${blueLightOn ? 'active' : ''}`}
              disabled={pendingAction === 'light'}
              title={blueLightOn
                ? 'Turn the blue excitation light off'
                : 'Turn the blue excitation light on (stays on until turned off)'}
            >
              {blueLightOn ? 'Blue light: ON — click to turn off' : 'Blue light: OFF — click to turn on'}
            </button>
          </div>
          <div className="mc-field">
            <label className="mc-field-label" htmlFor="mc-exposure">Exposure time (microseconds)</label>
            <div className="mc-row">
              <input
                id="mc-exposure"
                type="number"
                value={manualExposure}
                onChange={(e) => setManualExposure(parseInt(e.target.value) || 0)}
                className="mc-input"
                min="1000"
                title="How long the camera sensor collects light for each capture. 50,000 us = 1/20 s."
              />
            </div>
            <div className="mc-inline-note">Longer exposure = brighter image. Typical range: 10,000–100,000 &micro;s.</div>
          </div>
          <button
            onClick={handleTakePicture}
            disabled={pendingAction === 'picture' || !connected}
            className="mc-capture-btn"
            title="Capture one full-resolution image at the exposure above and save it on the backend"
          >
            {pendingAction === 'picture' ? 'Capturing…' : 'Take picture'}
          </button>
        </div>

        {/* ---- Stage jog ---- */}
        <div className="mc-card">
          <h2 className="mc-card-title">Stage Jog</h2>
          <p className="mc-card-hint">
            Moves the plate by the step amount below. X moves along a row
            (A1&rarr;A2). Rows are changed by the coupled Z+Y axes (A1&rarr;B1).
          </p>
          <div className="mc-jog">
            <span />
            <button
              className="mc-jog-btn"
              disabled={jogDisabled}
              onClick={() => sendMotorCommand('zy-backward')}
              title="Previous row: move Z+Y backward by the step amount (e.g. B1 back to A1)"
              aria-label="Row up (Z+Y backward)"
            >
              &#9650;
            </button>
            <span />
            <button
              className="mc-jog-btn"
              disabled={jogDisabled}
              onClick={() => sendMotorCommand('x-backward')}
              title="Move X backward by the step amount (e.g. A2 back to A1)"
              aria-label="X backward"
            >
              &#9664;
            </button>
            <div className="mc-jog-center">
              <span>{steps}</span>
              <span>steps</span>
            </div>
            <button
              className="mc-jog-btn"
              disabled={jogDisabled}
              onClick={() => sendMotorCommand('x-forward')}
              title="Move X forward by the step amount (e.g. A1 to A2)"
              aria-label="X forward"
            >
              &#9654;
            </button>
            <span />
            <button
              className="mc-jog-btn"
              disabled={jogDisabled}
              onClick={() => sendMotorCommand('zy-forward')}
              title="Next row: move Z+Y forward by the step amount (e.g. A1 to B1)"
              aria-label="Row down (Z+Y forward)"
            >
              &#9660;
            </button>
            <span />
          </div>
          <div className="mc-axis-legend">
            <span>&#9664; &#9654; X axis (columns)</span>
            <span>&#9650; &#9660; Z+Y axes (rows)</span>
          </div>
          <div className="mc-field">
            <label className="mc-field-label" htmlFor="mc-steps">Step amount (motor steps per jog)</label>
            <div className="mc-row">
              <input
                id="mc-steps"
                type="number"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                className="mc-input"
                min="1"
                title="How many motor steps each arrow press moves. 400 steps is roughly one well pitch."
              />
              <button
                onClick={updateSteps}
                disabled={pendingAction === 'steps'}
                className="mc-btn"
                style={{ flex: '0 0 auto' }}
                title="Send the new step amount to the Arduino"
              >
                Apply
              </button>
            </div>
            <div className="mc-inline-note">Applied to all jog moves and remembered between sessions.</div>
          </div>
        </div>

        {/* ---- Diagnostics ---- */}
        <div className="mc-card">
          <h2 className="mc-card-title">Diagnostics</h2>
          <p className="mc-card-hint">
            Quick hardware checks. Run these after wiring changes or if moves
            look wrong.
          </p>
          <div className="mc-row" style={{ flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => sendMotorCommand('test')}
              disabled={jogDisabled}
              className="mc-btn"
              style={{ width: '100%' }}
              title="Fire the firmware's built-in self test: each axis pulses briefly"
            >
              Test motors
            </button>
            <button
              onClick={handleWellTest}
              disabled={jogDisabled}
              className="mc-btn"
              style={{ width: '100%' }}
              title="Trace a small square: A1 to A2 to B1 and back home. Confirms both axes and directions."
            >
              Well navigation test (A1 &rarr; A2 &rarr; B1 &rarr; home)
            </button>
          </div>
          {wellTestProgress && <div className="mc-progress">{wellTestProgress}</div>}
        </div>

        {message && <div className="mc-message">{message}</div>}
      </div>
    </div>
  );
};

export default StepperMotorControl;
