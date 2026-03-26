'use client';
import { useEffect, useState } from 'react';
import { CONFIG } from '@/lib/config';

export default function RoutineController({ activeRoutineId }) {
  const [status, setStatus] = useState('Idle');
  const [lastStep, setLastStep] = useState(null);
  const [syncStatus, setSyncStatus] = useState('Idle');

  useEffect(() => {
    if (!activeRoutineId) return;

    // Execution loop
    const executeInterval = setInterval(async () => {
      try {
        const res = await fetch(`${CONFIG.DASHBOARD_API_URL}/routine/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routineId: activeRoutineId }),
        });
        const data = await res.json();
        
        if (data.success) {
          if (data.completed) {
            setStatus('Completed');
            clearInterval(executeInterval);
          } else {
            setStatus('Running');
            setLastStep(data.nextWell);
          }
        } else {
          setStatus('Error: ' + data.error);
        }
      } catch (err) {
        setStatus('Error: ' + err.message);
      }
    }, CONFIG.EXECUTION_INTERVAL_MS);

    // Sync loop
    const syncInterval = setInterval(async () => {
      try {
        const res = await fetch(`${CONFIG.DASHBOARD_API_URL}/sync/pictures`, {
          method: 'POST',
        });
        const data = await res.json();
        if (data.success) {
          setSyncStatus(`Synced ${data.processed} pictures`);
        } else {
          setSyncStatus('Sync Error: ' + data.error);
        }
      } catch (err) {
        setSyncStatus('Sync Error: ' + err.message);
      }
    }, CONFIG.SYNC_INTERVAL_MS);

    return () => {
      clearInterval(executeInterval);
      clearInterval(syncInterval);
    };
  }, [activeRoutineId]);

  return (
    <div className="routine-controller-box">
      <style jsx>{`
        .routine-controller-box {
          background-color: #1e293b;
          border: 1px solid #0ea5e9;
          border-radius: 0.75rem;
          padding: 1.25rem;
          margin-bottom: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .status-group {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .status-label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .status-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          color: #0ea5e9;
        }
      `}</style>
      <div className="status-group">
        <span className="status-label">Execution Status</span>
        <span className="status-value">{status}</span>
      </div>
      {lastStep && (
        <div className="status-group">
          <span className="status-label">Last Step</span>
          <span className="status-value">Captured {lastStep}</span>
        </div>
      )}
      <div className="status-group">
        <span className="status-label">Sync Status</span>
        <span className="status-value">{syncStatus}</span>
      </div>
    </div>
  );
}
