'use client';
import React, { useState, useEffect } from 'react';
import RoutineController from './RoutineController';

const PiRoutineManagerRefactored = () => {
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoutine, setSelectedRoutine] = useState(null);

  const fetchRoutines = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/routine/list');
      const data = await res.json();
      if (data.success) {
        setRoutines(data.all_routines);
      }
    } catch (err) {
      console.error('Failed to fetch routines:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutines();
  }, []);

  const handleDelete = async (name) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await fetch('/api/routine/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name }),
      });
      fetchRoutines();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="manager-container">
      <style jsx>{`
        .manager-container { padding: 1.5rem; color: #f8fafc; }
        .routine-list { list-style: none; padding: 0; margin-top: 1rem; }
        .routine-item { 
          background: #1e293b; 
          border: 1px solid #334155; 
          padding: 1rem; 
          border-radius: 0.5rem; 
          margin-bottom: 0.75rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }
        .routine-item.active { border-color: #0ea5e9; background: rgba(14, 165, 233, 0.05); }
        .btn-delete { color: #ef4444; background: none; border: 1px solid #ef4444; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; }
      `}</style>
      
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, textTransform: 'uppercase' }}>Dashboard Routines</h2>
      
      {selectedRoutine && <RoutineController activeRoutineId={selectedRoutine.id} />}

      <ul className="routine-list">
        {loading ? (
          <p>Loading routines...</p>
        ) : (
          routines.map(r => (
            <li 
              key={r.id} 
              className={`routine-item ${selectedRoutine?.id === r.id ? 'active' : ''}`}
              onClick={() => setSelectedRoutine(r)}
            >
              <div>
                <strong>{r.name}</strong>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {r.repeatInterval} @ {r.startTime} (Repeats: {r.repeatCount})
                </div>
              </div>
              <button 
                className="btn-delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(r.name); }}
              >
                Delete
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
};

export default PiRoutineManagerRefactored;
