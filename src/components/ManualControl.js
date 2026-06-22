import React, { useCallback, useEffect, useMemo, useState } from 'react';

const StepperMotorControl = ({ PI_BACKEND_URL }) => {
  const [steps, setSteps] = useState(400);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [manualExposure, setManualExposure] = useState(50000);
  const [blueLightOn, setBlueLightOn] = useState(false);
  const [wellTestProgress, setWellTestProgress] = useState('');

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
    // Load persisted step count from localStorage
    const saved = localStorage.getItem('cnc_default_steps');
    const savedSteps = Number.parseInt(saved, 10);
    if (Number.isFinite(savedSteps) && savedSteps > 0) setSteps(savedSteps);
    checkStatus();
  }, [checkStatus]);

  // --- NEW FUNCTION: Manual Blue Light Control ---
  const handleBlueLightToggle = async (targetState) => {
    setLoading(true);
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
      } else {
        setMessage(`Light error: ${data.message}`);
      }
    } catch (error) {
      setMessage('Failed to reach blue light API');
    } finally {
      setLoading(false);
    }
  };

  // --- API Functions (Existing) ---
  const handleConnect = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/connect`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) setConnected(true);
    } catch (error) {
      setMessage('Failed to connect to Arduino');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/disconnect`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) setConnected(false);
    } catch (error) {
      setMessage('Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  const updateSteps = async () => {
    const parsedSteps = Number.parseInt(steps, 10);
    if (!Number.isFinite(parsedSteps) || parsedSteps <= 0) {
      setMessage('Step amount must be a positive integer');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: parsedSteps }),
      });
      const data = await response.json();
      setMessage(data.message);
      // Persist the step count so it survives page reloads
      if (response.ok) {
        setSteps(parsedSteps);
        localStorage.setItem('cnc_default_steps', String(parsedSteps));
      }
    } catch (error) {
      setMessage('Failed to update steps');
    }
  };

  const sendMotorCommand = async (endpoint) => {
    if (!connected) { setMessage('Arduino not connected'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/motor/${endpoint}`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      setMessage(`Failed to send ${endpoint} command`);
    } finally {
      setLoading(false);
    }
  };

  // --- Well Navigation Test: A1 to A2 to B1 to Home ---
  const handleWellTest = async () => {
    if (!connected) { setMessage('Arduino not connected'); return; }
    setLoading(true);
    setWellTestProgress('Starting well test...');
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const step = async (label, endpoint) => {
      setWellTestProgress(`Moving: ${label}`);
      await sendMotorCommandSilent(endpoint);
      await delay(600);
    };

    try {
      // A1 to A2: move X forward
      await step('A1 to A2 (X Forward)', 'x-forward');
      // A2 to B1: move ZY forward
      await step('A2 to B1 (ZY Forward)', 'zy-forward');
      // B1 to A1: reverse ZY then reverse X (return home)
      await step('B1 to A2 (ZY Backward)', 'zy-backward');
      await step('A2 to A1 (X Backward)', 'x-backward');
      setWellTestProgress('Well test complete - returned to home (A1)');
      setMessage('Well test sequence finished successfully.');
    } catch (err) {
      setWellTestProgress('Well test failed.');
      setMessage(`Well test error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Silent variant used internally by handleWellTest (no loading state toggle)
  const sendMotorCommandSilent = async (endpoint) => {
    const response = await fetch(`${API_BASE}/motor/${endpoint}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `Failed to send ${endpoint}`);
    setMessage(data.message);
  };

  const handleTakePicture = async () => {
    if (manualExposure <= 0) { setMessage('Error: Exposure time must be > 0'); return; }
    setLoading(true);
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
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <style>{`
        .container { 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          padding: 2rem; 
          box-sizing: border-box;
          overflow-y: auto;
          flex-grow: 1;
        }
        .card { 
          background-color: #1e293b; 
          padding: 1.5rem; 
          border-radius: 1rem; 
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); 
          width: 100%; 
          max-width: 32rem; 
          border: 1px solid #334155; 
        }
        .title { 
          font-size: 1.5rem; 
          font-weight: 800; 
          text-align: center; 
          color: #f8fafc; 
          margin-bottom: 1.5rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .message-display { 
          padding: 0.75rem; 
          border-radius: 0.5rem; 
          background-color: #0f172a; 
          border: 1px solid #1e293b; 
          margin-top: 1rem; 
          margin-bottom: 1rem; 
        }
        .message-text { 
          font-size: 0.8rem; 
          color: #94a3b8; 
          font-family: 'JetBrains Mono', monospace;
          margin: 0;
        }
        .status-block, .input-section { 
          margin-bottom: 1rem; 
          padding: 1rem; 
          border-radius: 0.5rem; 
          background-color: #0f172a;
          border: 1px solid #334155;
        }
        .status-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
        .status-label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .status-indicator { padding: 0.2rem 0.6rem; border-radius: 0.25rem; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; }
        .status-indicator.connected { background-color: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid #10b981; }
        .status-indicator.disconnected { background-color: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; }
        .flex-buttons-group { display: flex; gap: 0.5rem; }
        .btn { 
          padding: 0.6rem 1rem; 
          font-weight: 700; 
          border-radius: 0.375rem; 
          cursor: pointer; 
          border: none; 
          flex: 1; 
          font-size: 0.75rem;
          text-transform: uppercase;
          transition: all 0.2s;
        }
        .btn-connect { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; }
        .btn-disconnect { background: #334155; color: #94a3b8; }
        .btn-connect:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }

        .input-label { display: block; font-size: 0.65rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase; }
        .input-field { 
          flex: 1; 
          padding: 0.5rem; 
          border: 1px solid #334155; 
          border-radius: 0.25rem; 
          font-size: 0.85rem; 
          outline: none; 
          background: #1e293b; 
          color: #0ea5e9;
          font-family: 'JetBrains Mono', monospace;
        }
        .btn-update-steps { 
          padding: 0.5rem 1rem; 
          background-color: #0ea5e9; 
          color: white; 
        }
        .motor-buttons-group { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
        .btn-motor { 
          width: 100%; 
          padding: 0.75rem; 
          font-weight: 700; 
          border-radius: 0.375rem; 
          color: #ffffff; 
          cursor: pointer; 
          border: 1px solid rgba(255,255,255,0.1); 
          font-size: 0.75rem;
          text-transform: uppercase;
          transition: all 0.2s;
        }
        .btn-motor:hover:not(:disabled) { background-color: rgba(255,255,255,0.1); }
        .btn-motor.blue { background-color: #1e293b; color: #3b82f6; border-color: #3b82f6; }
        .btn-motor.purple { background-color: #1e293b; color: #a855f7; border-color: #a855f7; }
        .btn-motor.green { background-color: #1e293b; color: #10b981; border-color: #10b981; }
        .btn-motor.red { background-color: #1e293b; color: #ef4444; border-color: #ef4444; }
        .btn-motor.yellow { background-color: #1e293b; color: #f59e0b; border-color: #f59e0b; }
        .btn-motor.orange { background: linear-gradient(135deg, #f97316, #ea580c); color: white; border: none; }
        
        .btn-motor.cyan { background-color: #1e293b; color: #06b6d4; border-color: #06b6d4; }
        .btn-motor.cyan.active { background-color: #06b6d4; color: #083344; box-shadow: 0 0 15px rgba(6, 182, 212, 0.4); }
        
        .btn-motor.teal { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; border: none; }
        .btn-motor.teal:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3); }

        .well-test-progress { 
          margin-top: 0.5rem; 
          padding: 0.5rem; 
          border-radius: 0.375rem; 
          background-color: #0f172a; 
          border: 1px solid #0ea5e9; 
          font-size: 0.7rem; 
          color: #0ea5e9; 
          font-family: 'JetBrains Mono', monospace;
        }

        .loading-spinner { display: inline-block; animation: spin 1s linear infinite; border: 2px solid rgba(14, 165, 233, 0.1); border-top-color: #0ea5e9; border-radius: 50%; height: 1.25rem; width: 1.25rem; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>

      <div className="card">
        <h1 className="title">Stepper Motor Control</h1>

        <div className="status-block">
          <div className="status-header">
            <span className="status-label">Status:</span>
            <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex-buttons-group">
            <button onClick={handleConnect} disabled={loading || connected} className="btn btn-connect">Connect</button>
            <button onClick={handleDisconnect} disabled={loading || !connected} className="btn btn-disconnect">Disconnect</button>
          </div>
        </div>

        {/* --- NEW BLUE LIGHT SECTION --- */}
        <div className="status-block">
          <label className="input-label">Manual Light Control:</label>
          <div className="flex-buttons-group">
            <button
              onClick={() => handleBlueLightToggle(blueLightOn ? 'off' : 'on')}
              className={`btn-motor cyan ${blueLightOn ? 'active' : ''}`}
              disabled={loading}
            >
              {blueLightOn ? 'BLUE LIGHT: ON' : 'BLUE LIGHT: OFF'}
            </button>
          </div>
        </div>

        <div className="input-section">
          <label className="input-label">Camera Exposure Time (us):</label>
          <div className="flex-buttons-group">
            <input type="number" value={manualExposure} onChange={(e) => setManualExposure(parseInt(e.target.value) || 0)} className="input-field" min="1000" />
            <button onClick={() => setMessage(`Exposure set to ${manualExposure} us`)} className="btn btn-update-steps">Set</button>
          </div>
        </div>

        <div className="input-section">
          <label className="input-label">Step Amount (Current: {steps}):</label>
          <div className="flex-buttons-group">
            <input type="number" value={steps} onChange={(e) => setSteps(e.target.value)} className="input-field" min="1" />
            <button onClick={updateSteps} className="btn btn-update-steps">Update</button>
          </div>
        </div>

        <div className="motor-buttons-group">
          <button onClick={() => sendMotorCommand('x-forward')} disabled={loading || !connected} className="btn-motor blue">X Forward</button>
          <button onClick={() => sendMotorCommand('x-backward')} disabled={loading || !connected} className="btn-motor blue">X Backward</button>
          <button onClick={() => sendMotorCommand('zy-forward')} disabled={loading || !connected} className="btn-motor purple">Z+Y Forward</button>
          <button onClick={() => sendMotorCommand('zy-backward')} disabled={loading || !connected} className="btn-motor purple">Z+Y Backward</button>
          <div className="flex-buttons-group">
            <button onClick={() => sendMotorCommand('enable')} disabled={loading || !connected} className="btn-motor green">Enable</button>
            <button onClick={() => sendMotorCommand('disable')} disabled={loading || !connected} className="btn-motor red">Disable</button>
          </div>
          <button onClick={handleTakePicture} disabled={loading || !connected} className="btn-motor orange">Take Picture</button>
          <button onClick={() => sendMotorCommand('test')} disabled={loading || !connected} className="btn-motor yellow">Test Motors</button>
          <button onClick={handleWellTest} disabled={loading || !connected} className="btn-motor teal">Well Test (A1 to A2 to B1 to Home)</button>
          {wellTestProgress && <div className="well-test-progress">{wellTestProgress}</div>}
        </div>

        {message && <div className="message-display"><p className="message-text">{message}</p></div>}
        {loading && <div className="mt-4 text-center"><div className="loading-spinner"></div></div>}
      </div>
    </div>
  );
};

export default StepperMotorControl;
