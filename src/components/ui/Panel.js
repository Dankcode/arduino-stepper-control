'use client';

import React from 'react';
import { colors, radii, shadows } from './tokens';

const Panel = ({ children, style, ...props }) => (
  <section
    style={{
      background: colors.surface2,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.md,
      boxShadow: shadows.card,
      padding: '1rem',
      ...style,
    }}
    {...props}
  >
    {children}
  </section>
);

export default Panel;
