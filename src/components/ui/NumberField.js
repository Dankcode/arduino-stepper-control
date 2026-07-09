'use client';

import React from 'react';
import { colors, font, radii } from './tokens';

const NumberField = ({ value, onChange, unit, min = 0, step = 1, style, ...props }) => (
  <label style={{ display: 'grid', gridTemplateColumns: unit ? 'minmax(0, 1fr) 48px' : '1fr', ...style }}>
    <input
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={(event) => onChange?.(Number(event.target.value))}
      style={{
        minWidth: 0,
        height: 34,
        background: colors.surface2,
        color: colors.textHi,
        border: `1px solid ${colors.border}`,
        borderRight: unit ? 'none' : `1px solid ${colors.border}`,
        borderRadius: unit ? `${radii.sm} 0 0 ${radii.sm}` : radii.sm,
        padding: '0 0.6rem',
        fontFamily: font.mono,
      }}
      {...props}
    />
    {unit ? (
      <span style={{
        display: 'grid',
        placeItems: 'center',
        height: 34,
        background: colors.bg,
        color: colors.textLo,
        border: `1px solid ${colors.border}`,
        borderRadius: `0 ${radii.sm} ${radii.sm} 0`,
        fontFamily: font.mono,
        fontSize: font.size.xs,
      }}>
        {unit}
      </span>
    ) : null}
  </label>
);

export default NumberField;
