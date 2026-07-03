'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { colors, font, radii, motion } from './tokens';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

const ProgressBar = ({ value, label, size = 'md', tone = 'accent' }) => {
  const isDeterminate = typeof value === 'number' && Number.isFinite(value);
  const height = size === 'sm' ? 4 : 8;
  const fillColor = colors[tone] || colors.accent;
  const percent = isDeterminate ? clamp01(value) * 100 : undefined;

  return (
    <div aria-busy={!isDeterminate} style={{ width: '100%' }}>
      {label ? (
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 4,
          color: colors.textMid,
          fontFamily: font.mono,
          fontSize: font.size.xs,
        }}>
          {label}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isDeterminate ? Math.round(percent) : undefined}
        style={{
          height,
          width: '100%',
          overflow: 'hidden',
          background: colors.surface2,
          borderRadius: radii.full,
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: isDeterminate ? `${percent}%` : '30%',
            background: fillColor,
            borderRadius: radii.full,
            transition: `width ${motion.base}`,
            animation: isDeterminate ? 'none' : 'dashboard-progress-sweep 1.2s infinite ease-in-out',
          }}
        />
      </div>
      <style jsx>{`
        @keyframes dashboard-progress-sweep {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
};

export const useRoutineProgress = (PI_BACKEND_URL) => {
  const [progress, setProgress] = useState({
    running: false,
    wells_done: 0,
    wells_total: 0,
    current_well: null,
  });

  useEffect(() => {
    if (!PI_BACKEND_URL) return undefined;
    let canceled = false;
    let timer = null;

    const poll = async () => {
      try {
        const response = await fetch(`${PI_BACKEND_URL.replace(/\/$/, '')}/api/routine/progress`, {
          cache: 'no-store',
        });
        if (response.ok) {
          const data = await response.json();
          if (!canceled) setProgress(data);
        }
      } catch (_error) {
        if (!canceled) setProgress(prev => ({ ...prev, running: false }));
      } finally {
        if (!canceled) timer = window.setTimeout(poll, 1000);
      }
    };

    poll();
    return () => {
      canceled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [PI_BACKEND_URL]);

  return useMemo(() => {
    const total = Number(progress.wells_total) || 0;
    const done = Number(progress.wells_done) || 0;
    const value = total > 0 ? done / total : 0;
    const label = total > 0
      ? `${progress.current_well || 'Ready'} · ${done}/${total}`
      : progress.current_well || 'No routine running';
    return { running: !!progress.running, value, label, raw: progress };
  }, [progress]);
};

export default ProgressBar;
