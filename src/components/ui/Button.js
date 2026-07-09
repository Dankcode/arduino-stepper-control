'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { colors, font, radii, motion } from './tokens';

const variants = {
  primary: { background: colors.accent, color: colors.textHi, border: colors.accent },
  ghost: { background: colors.surface2, color: colors.textMid, border: colors.border },
  danger: { background: colors.danger, color: colors.textHi, border: colors.danger },
};

const sizes = {
  sm: { height: 30, padding: '0 0.65rem', fontSize: font.size.xs },
  md: { height: 36, padding: '0 0.85rem', fontSize: font.size.sm },
};

const Button = React.forwardRef(function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  ...props
}, ref) {
  const palette = variants[variant] || variants.primary;
  const scale = sizes[size] || sizes.md;

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      style={{
        ...scale,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        border: `1px solid ${palette.border}`,
        borderRadius: radii.sm,
        background: palette.background,
        color: palette.color,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.65 : 1,
        fontWeight: 700,
        fontFamily: font.sans,
        transition: motion.base,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...props}
    >
      {loading ? <Loader2 size={15} style={{ animation: 'ui-spin 1s linear infinite' }} /> : null}
      {children}
      <style jsx>{`
        @keyframes ui-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
});

export default Button;
