'use client';

import React from 'react';
import { colors, font, radii } from './tokens';

const stateColor = {
  connected: colors.success,
  connecting: colors.warning,
  disconnected: colors.danger,
  running: colors.info,
};

const ConnectionBadge = ({ status, url, routineRunning, checkedAt }) => {
  const normalized = routineRunning
    ? 'running'
    : String(status || 'disconnected').toLowerCase().replace(/\.+$/, '');
  const color = stateColor[normalized] || colors.textLo;
  const label = routineRunning ? 'Routine running' : status;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '0.4rem 0.75rem',
      background: colors.surface2,
      color: colors.textMid,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.sm,
      fontSize: font.size.xs,
      fontWeight: 700,
      fontFamily: font.sans,
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '999px',
        background: color,
        boxShadow: normalized === 'connected' || normalized === 'running' ? `0 0 8px ${color}` : 'none',
      }} />
      <span>{label}</span>
      {url ? <span style={{ color: colors.textLo, fontFamily: font.mono }}>{url}</span> : null}
      {checkedAt ? <span style={{ color: colors.textLo, fontFamily: font.mono }}>{checkedAt}</span> : null}
    </div>
  );
};

export default ConnectionBadge;
