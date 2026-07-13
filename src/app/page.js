'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Gamepad2, Image, LayoutGrid, List, Microscope } from 'lucide-react';
import StepperMotorControl from '../components/ManualControl';
import RoutineBuilder from '../components/RoutineBuilder';
import RoutineDesignerV2 from '../components/RoutineDesignerV2';
import PiRoutineManager from '../components/PiRoutineManager';
import PictureBrowser from '../components/PictureBrowser';
import CameraStream from '../components/CameraStream';
import ProgressBar, { useRoutineProgress } from '../components/ui/ProgressBar';
import ConnectionBadge from '../components/ui/ConnectionBadge';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/StatusToast';

const CONNECTION_TIMEOUT = 5000; // 5 seconds
const DEFAULT_PI_BACKEND_URL = process.env.NEXT_PUBLIC_PI_BACKEND_URL || 'http://localhost:5000';

const SECTIONS = [
  {
    id: 'routine',
    label: 'Routine Designer',
    icon: LayoutGrid,
    description: 'Design which wells to visit and what happens at each one, then save or run the routine.',
  },
  {
    id: 'manual',
    label: 'Manual Control',
    icon: Gamepad2,
    description: 'Jog the stage, toggle the blue light, and take single captures by hand.',
  },
  {
    id: 'camera',
    label: 'Live Camera',
    icon: Camera,
    description: 'Watch the live view from the microscope camera.',
  },
  {
    id: 'pictures',
    label: 'Pictures',
    icon: Image,
    description: 'Browse and view every image captured by routines and manual snapshots.',
  },
  {
    id: 'pi',
    label: 'Saved Routines',
    icon: List,
    description: 'Schedule, rename, download, or delete routines stored on the backend.',
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState('routine');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [backendStatus, setBackendStatus] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  // The backend URL for the Raspberry Pi. Set NEXT_PUBLIC_PI_BACKEND_URL for LAN deployments.
  const PI_BACKEND_URL = useMemo(() => DEFAULT_PI_BACKEND_URL.replace(/\/$/, ''), []);
  const routineProgress = useRoutineProgress(PI_BACKEND_URL);
  const toast = useToast();
  // Set when the user clicks Edit in Saved Routines; consumed by RoutineDesignerV2.
  // ts forces the effect to re-run when the same routine is edited twice.
  const [editRequest, setEditRequest] = useState(null);
  const handleEditRoutine = useCallback((name) => {
    setEditRequest({ name, ts: Date.now() });
    setActiveTab('routine');
  }, []);
  // V2 is the default; the legacy builder stays available via ?legacy=1.
  const useLegacyRoutineBuilder = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('legacy') === '1'
    : false;

  const checkConnectionAndFetchData = useCallback(async () => {
    setConnectionStatus('Connecting...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

    try {
      const response = await fetch(`${PI_BACKEND_URL}/api/status`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      setBackendStatus(data);
      setConnectionStatus('Connected');
    } catch (error) {
      console.error('Failed to connect to Raspberry Pi:', error);
      setBackendStatus(null);
      setConnectionStatus('Disconnected');
    } finally {
      clearTimeout(timeoutId);
      setLastCheckedAt(new Date());
    }
  }, [PI_BACKEND_URL]);

  useEffect(() => {
    checkConnectionAndFetchData();
    const intervalId = setInterval(checkConnectionAndFetchData, 30000);
    return () => clearInterval(intervalId);
  }, [checkConnectionAndFetchData]);

  const handleAbortRoutine = useCallback(async () => {
    if (!window.confirm('Stop the running routine now?')) return;
    try {
      const response = await fetch(`${PI_BACKEND_URL}/api/routine/abort`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Failed to stop routine.');
      toast.info(data.message || 'Routine stop requested.');
    } catch (error) {
      toast.error(error.message);
    }
  }, [PI_BACKEND_URL, toast]);

  const routineRunning = backendStatus?.routine_running || routineProgress.running;
  const activeSection = SECTIONS.find((section) => section.id === activeTab) || SECTIONS[0];

  return (
    <div className="main-wrapper">
      <style jsx global>{`
        body {
          margin: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background-color: #020617;
          color: #f8fafc;
          height: 100vh;
          overflow: hidden;
        }

        .main-wrapper {
          display: flex;
          height: 100vh;
          width: 100vw;
          box-sizing: border-box;
        }

        /* ---- Sidebar ---- */
        .app-sidebar {
          width: 13.5rem;
          flex-shrink: 0;
          background-color: #0f172a;
          border-right: 1px solid #1e293b;
          display: flex;
          flex-direction: column;
          padding: 1rem 0.75rem;
          box-sizing: border-box;
        }
        .app-brand {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.25rem 0.5rem 1rem;
          border-bottom: 1px solid #1e293b;
          margin-bottom: 0.9rem;
        }
        .app-brand-name {
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          line-height: 1.2;
        }
        .app-brand-sub {
          font-size: 0.62rem;
          color: #64748b;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          width: 100%;
          padding: 0.6rem 0.65rem;
          margin-bottom: 0.2rem;
          border: none;
          border-radius: 0.5rem;
          background: none;
          color: #94a3b8;
          font-size: 0.8rem;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s;
        }
        .nav-item:hover:not(.active) { background: rgba(255, 255, 255, 0.05); color: #e2e8f0; }
        .nav-item.active {
          background: rgba(14, 165, 233, 0.12);
          color: #38bdf8;
        }
        .sidebar-footer {
          margin-top: auto;
          padding: 0.75rem 0.5rem 0.25rem;
          border-top: 1px solid #1e293b;
          font-size: 0.65rem;
          color: #64748b;
          line-height: 1.5;
          word-break: break-all;
        }

        /* ---- Main column ---- */
        .app-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.7rem 1.25rem;
          background-color: #0f172a;
          border-bottom: 1px solid #1e293b;
          flex-shrink: 0;
        }
        .app-header-titles { min-width: 0; }
        .app-header-title { font-size: 0.95rem; font-weight: 800; margin: 0; }
        .app-header-desc {
          font-size: 0.72rem;
          color: #64748b;
          margin: 0.1rem 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .app-header-status { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

        .global-progress { padding: 0.4rem 1.25rem 0; background-color: #0f172a; }

        .tab-content {
          flex-grow: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* Generic card kept for components that rely on it */
        .uniform-panel {
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 0.75rem;
          padding: 1.5rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
        }

        .modal {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex; justify-content: center; align-items: center; z-index: 1000;
        }
        .modal-content {
          background: white; padding: 24px; border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); text-align: center; width: 400px;
        }
        .modal-buttons { margin-top: 16px; display: flex; justify-content: center; gap: 16px; }
        .confirm-delete, .cancel-delete { padding: 8px 16px; font-size: 16px; border-radius: 6px; cursor: pointer; }
        .confirm-delete { background-color: #ef4444; color: white; }
        .cancel-delete { background-color: #e5e7eb; color: #4b5563; }

        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

        @media (max-width: 800px) {
          .main-wrapper { flex-direction: column; }
          .app-sidebar {
            width: 100%;
            flex-direction: row;
            align-items: center;
            padding: 0.4rem 0.5rem;
            overflow-x: auto;
            border-right: none;
            border-bottom: 1px solid #1e293b;
          }
          .app-brand { display: none; }
          .nav-item { flex-shrink: 0; width: auto; margin-bottom: 0; }
          .nav-label { display: none; }
          .sidebar-footer { display: none; }
          .app-header-desc { display: none; }
          .connection-badge-url, .connection-badge-checked { display: none; }
        }
      `}</style>

      <aside className="app-sidebar">
        <div className="app-brand">
          <Microscope size={22} color="#38bdf8" />
          <div>
            <div className="app-brand-name">Microscope Control</div>
            <div className="app-brand-sub">Stage automation</div>
          </div>
        </div>
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              className={`nav-item ${activeTab === section.id ? 'active' : ''}`}
              onClick={() => setActiveTab(section.id)}
              title={section.description}
            >
              <Icon size={17} />
              <span className="nav-label">{section.label}</span>
            </button>
          );
        })}
        <div className="sidebar-footer">
          Backend: {PI_BACKEND_URL}
          {lastCheckedAt ? <><br />Checked {lastCheckedAt.toLocaleTimeString()}</> : null}
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="app-header-titles">
            <h1 className="app-header-title">
              {activeTab === 'routine' && useLegacyRoutineBuilder ? 'Routine Builder (legacy)' : activeSection.label}
            </h1>
            <p className="app-header-desc">{activeSection.description}</p>
          </div>
          <div className="app-header-status">
            <ConnectionBadge
              status={connectionStatus}
              url={PI_BACKEND_URL}
              routineRunning={routineRunning}
              baud={backendStatus?.baud}
              checkedAt={lastCheckedAt ? `Checked ${lastCheckedAt.toLocaleTimeString()}` : null}
            />
            {routineRunning && (
              <Button variant="danger" size="sm" onClick={handleAbortRoutine} title="Stop the running routine immediately">
                Stop
              </Button>
            )}
          </div>
        </header>

        {routineRunning && (
          <div className="global-progress">
            <ProgressBar value={routineProgress.value} label={routineProgress.label} tone="info" size="sm" />
          </div>
        )}

        <div className="tab-content">
          {activeTab === 'routine' && (
            useLegacyRoutineBuilder
              ? <RoutineBuilder PI_BACKEND_URL={PI_BACKEND_URL} />
              : <RoutineDesignerV2 PI_BACKEND_URL={PI_BACKEND_URL} editRequest={editRequest} />
          )}
          {activeTab === 'manual' && <StepperMotorControl PI_BACKEND_URL={PI_BACKEND_URL} />}
          {activeTab === 'pi' && (
            <PiRoutineManager
              connectionStatus={connectionStatus}
              PI_BACKEND_URL={PI_BACKEND_URL}
              onEditRoutine={handleEditRoutine}
            />
          )}
          {activeTab === 'pictures' && (
            <PictureBrowser PI_BACKEND_URL={PI_BACKEND_URL} />
          )}
          {activeTab === 'camera' && (
            <CameraStream PI_BACKEND_URL={PI_BACKEND_URL} />
          )}
        </div>
      </div>
    </div>
  );
}
