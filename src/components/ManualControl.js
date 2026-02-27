import React, { useState, useEffect } from 'react';

const StepperMotorControl = () => {
  const [steps, setSteps] = useState(400);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [manualExposure, setManualExposure] = useState(50000); 
  // NEW STATE: Track if the light is currently on
  const [blueLightOn, setBlueLightOn] = useState(false);

  const API_BASE = 'http://192.168.1.43:5000/api';

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/status`);
      const data = await response.json();
      setConnected(data.connected);
      setSteps(data.current_steps);
      if (data.connected) {
        setMessage(`Connected to Arduino via port: ${data.port || 'Unknown'}`);
      }
    } catch (error) {
      setMessage('Failed to connect to backend');
    }
  };

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
    }
    setLoading(false);
  };

  // --- API Functions (Existing) ---
  const handleConnect = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/connect`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) setConnected(true);
    } catch (error) { setMessage('Failed to connect to Arduino'); }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/disconnect`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) setConnected(false);
    } catch (error) { setMessage('Failed to disconnect'); }
    setLoading(false);
  };

  const updateSteps = async () => {
    try {
      const response = await fetch(`${API_BASE}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: parseInt(steps) }),
      });
      const data = await response.json();
      setMessage(data.message);
    } catch (error) { setMessage('Failed to update steps'); }
  };

  const sendMotorCommand = async (endpoint) => {
    if (!connected) { setMessage('Arduino not connected'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/motor/${endpoint}`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) { setMessage(`Failed to send ${endpoint} command`); }
    setLoading(false);
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
    } catch (error) { setMessage(`Error: ${error.message}`); }
    setLoading(false);
  };

  return (
    <div className="container">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        body { margin: 0; font-family: 'Inter', sans-serif; background: linear-gradient(to bottom right, #e0e0e0, #c0c0c0); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 1rem; box-sizing: border-box; }
        .container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; box-sizing: border-box; }
        .card { background-color: #ffffff; padding: 2rem; border-radius: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); width: 100%; max-width: 28rem; border: 1px solid #e2e8f0; }
        .title { font-size: 2.25rem; font-weight: 800; text-align: center; color: #1a202c; margin-bottom: 2rem; }
        .message-display { padding: 0.75rem; border-radius: 0.5rem; background-color: #f3f4f6; border: 1px solid #e5e7eb; margin-top: 1rem; margin-bottom: 1rem; }
        .message-text { font-size: 0.875rem; color: #4b5563; }
        .status-block, .input-section { margin-bottom: 1.5rem; padding: 0.75rem; border-radius: 0.5rem; background-color: #f9fafb; }
        .status-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .status-label { font-size: 0.875rem; font-weight: 500; color: #4a5568; }
        .status-indicator { padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500; }
        .status-indicator.connected { background-color: #d1fae5; color: #065f46; }
        .status-indicator.disconnected { background-color: #fee2e2; color: #b91c1c; }
        .flex-buttons-group { display: flex; gap: 0.5rem; }
        .btn { padding: 0.75rem 1rem; font-weight: 500; border-radius: 0.25rem; cursor: pointer; border: none; flex: 1; }
        .btn-connect { background-color: #2563eb; color: #ffffff; }
        .btn-disconnect { background-color: #dc2626; color: #ffffff; }
        .input-label { display: block; font-size: 0.875rem; font-weight: 500; color: #4a5568; margin-bottom: 0.5rem; }
        .input-field { flex: 1; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e0; border-radius: 0.25rem; font-size: 0.875rem; outline: none; }
        .btn-update-steps { padding: 0.5rem 1rem; background-color: #16a34a; color: #ffffff; }
        .motor-buttons-group { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
        .btn-motor { width: 100%; padding: 0.75rem 1rem; font-weight: 500; border-radius: 0.25rem; color: #ffffff; cursor: pointer; border: none; }
        .btn-motor.blue { background-color: #2563eb; }
        .btn-motor.purple { background-color: #9333ea; }
        .btn-motor.green { background-color: #16a34a; }
        .btn-motor.red { background-color: #dc2626; }
        .btn-motor.yellow { background-color: #d97706; }
        .btn-motor.orange { background-color: #f97316; font-weight: 800; }
        
        /* NEW BLUE LIGHT STYLE */
        .btn-motor.cyan { background-color: #0891b2; font-weight: 700; border: 2px solid transparent; }
        .btn-motor.cyan.active { background-color: #22d3ee; border-color: #0e7490; color: #083344; box-shadow: 0 0 15px rgba(34, 211, 238, 0.6); }

        .loading-spinner { display: inline-block; animation: spin 1s linear infinite; border: 2px solid rgba(0, 0, 0, 0.1); border-top-color: #2563eb; border-radius: 50%; height: 1.5rem; width: 1.5rem; }
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
              {blueLightOn ? '🔵 BLUE LIGHT: ON' : '⚪ BLUE LIGHT: OFF'}
            </button>
          </div>
        </div>

        <div className="input-section">
          <label className="input-label">Camera Exposure Time (µs):</label>
          <div className="flex-buttons-group">
            <input type="number" value={manualExposure} onChange={(e) => setManualExposure(parseInt(e.target.value) || 0)} className="input-field" min="1000" />
            <button onClick={() => setMessage(`Exposure set to ${manualExposure} µs`)} className="btn btn-update-steps">Set</button>
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
          <button onClick={handleTakePicture} disabled={loading || !connected} className="btn-motor orange">Take Picture 📸</button>
          <button onClick={() => sendMotorCommand('test')} disabled={loading || !connected} className="btn-motor yellow">Test Motors</button>
        </div>

        {message && <div className="message-display"><p className="message-text">{message}</p></div>}
        {loading && <div className="mt-4 text-center"><div className="loading-spinner"></div></div>}
      </div>
    </div>
  );
};

export default StepperMotorControl;