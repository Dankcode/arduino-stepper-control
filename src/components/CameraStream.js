'use client';
import React, { useState, useRef } from 'react';

const CameraStream = ({ PI_BACKEND_URL }) => {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const imgRef = useRef(null);

  const STREAM_URL = `${PI_BACKEND_URL}/api/camera/stream`;

  const startStream = () => {
    setError('');
    setStreaming(true);
  };

  const stopStream = () => {
    // Clearing the src stops the browser from keeping the MJPEG connection open
    if (imgRef.current) imgRef.current.src = '';
    setStreaming(false);
  };

  const handleImgError = () => {
    setError('Stream unavailable - check that the Pi backend is running and the camera is connected.');
    setStreaming(false);
  };

  return (
    <div className="cs-container">
      <style jsx global>{`
        .cs-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.5rem;
          width: 100%;
          box-sizing: border-box;
          flex-grow: 1;
        }
        .cs-card {
          background: #1e293b;
          border-radius: 1rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
          border: 1px solid #334155;
          padding: 2rem;
          width: 100%;
          max-width: 56rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }
        .cs-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: #f8fafc;
          text-align: center;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .cs-viewport {
          width: 100%;
          aspect-ratio: 16/9;
          background: #020617;
          border-radius: 0.75rem;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border: 2px solid #334155;
          box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
        }
        .cs-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          color: #64748b;
        }
        .cs-placeholder-icon {
          font-size: 4rem;
          opacity: 0.3;
          filter: grayscale(1);
        }
        .cs-placeholder-text {
          font-size: 0.9rem;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.05em;
        }
        .cs-stream-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
        .cs-controls {
          display: flex;
          gap: 1rem;
          width: 100%;
          justify-content: center;
        }
        .cs-btn {
          padding: 0.75rem 2rem;
          border: none;
          border-radius: 0.5rem;
          font-size: 0.85rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 10rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .cs-btn-start {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #ffffff;
        }
        .cs-btn-start:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
        
        .cs-btn-stop {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid #ef4444;
        }
        .cs-btn-stop:hover { background-color: #ef4444; color: white; }

        .cs-status {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.8rem;
          color: #94a3b8;
          font-family: 'JetBrains Mono', monospace;
        }
        .cs-status-dot {
          width: 0.75rem;
          height: 0.75rem;
          border-radius: 9999px;
          border: 2px solid transparent;
          background-color: ${streaming ? '#10b981' : '#475569'};
          ${streaming ? 'border-color: rgba(16, 185, 129, 0.4); box-shadow: 0 0 10px #10b981; animation: cs-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;' : ''}
        }
        @keyframes cs-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
        .cs-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #ef4444;
          border-radius: 0.5rem;
          padding: 1rem;
          color: #ef4444;
          font-size: 0.8rem;
          text-align: center;
          width: 100%;
          box-sizing: border-box;
          font-family: 'JetBrains Mono', monospace;
        }
        .cs-info {
          font-size: 0.75rem;
          color: #64748b;
          text-align: center;
          font-family: 'JetBrains Mono', monospace;
        }
        .cs-info code {
          color: #0ea5e9;
          background: #0f172a;
          padding: 0.2rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          border: 1px solid #1e293b;
        }
      `}</style>

      <div className="cs-card">
        <h2 className="cs-title">📷 Live Camera Stream</h2>

        {/* Stream Viewport */}
        <div className="cs-viewport">
          {streaming ? (
            <img
              ref={imgRef}
              src={STREAM_URL}
              alt="Live camera stream"
              className="cs-stream-img"
              onError={handleImgError}
            />
          ) : (
            <div className="cs-placeholder">
              <span className="cs-placeholder-icon">📷</span>
              <span className="cs-placeholder-text">Stream not started</span>
            </div>
          )}
        </div>

        {/* Status indicator */}
        <div className="cs-status">
          <div className="cs-status-dot" />
          {streaming ? 'Streaming live from Pi camera' : 'Stream stopped'}
        </div>

        {/* Controls */}
        <div className="cs-controls">
          {!streaming ? (
            <button className="cs-btn cs-btn-start" onClick={startStream}>
              ▶ Start Stream
            </button>
          ) : (
            <button className="cs-btn cs-btn-stop" onClick={stopStream}>
              ⏹ Stop Stream
            </button>
          )}
        </div>

        {/* Error display */}
        {error && <div className="cs-error">⚠️ {error}</div>}

        {/* Info */}
        <p className="cs-info">
          Stream source: <code>{STREAM_URL}</code>
        </p>
      </div>
    </div>
  );
};

export default CameraStream;
