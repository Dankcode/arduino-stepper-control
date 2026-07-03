'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ProgressBar from './ProgressBar';
import { colors, font, radii, shadows, motion } from './tokens';

const ToastContext = createContext(null);

const variantColors = {
  success: colors.success,
  error: colors.danger,
  info: colors.info,
  progress: colors.accent,
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => {
      timersRef.current.forEach(timer => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const push = useCallback((variant, message, options = {}) => {
    const id = options.id || `${variant}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sticky = options.sticky ?? variant === 'error';
    const toast = { id, variant, message, sticky, progress: options.progress };

    setToasts(prev => [toast, ...prev.filter(item => item.id !== id)].slice(0, 3));

    const existing = timersRef.current.get(id);
    if (existing) window.clearTimeout(existing);
    if (!sticky && variant !== 'progress') {
      timersRef.current.set(id, window.setTimeout(() => dismiss(id), options.duration || 4000));
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    success: (message, options) => push('success', message, options),
    error: (message, options) => push('error', message, { sticky: true, ...options }),
    info: (message, options) => push('info', message, options),
    progress: (message, options) => push('progress', message, { sticky: true, ...options }),
    dismiss,
  }), [dismiss, push]);

  const stack = (
    <div style={{
      position: 'fixed',
      right: 16,
      bottom: 16,
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      width: 'min(360px, calc(100vw - 32px))',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          role={toast.variant === 'error' ? 'alert' : 'status'}
          style={{
            pointerEvents: 'auto',
            background: colors.surface1,
            color: colors.textHi,
            border: `1px solid ${colors.border}`,
            borderLeft: `4px solid ${variantColors[toast.variant] || colors.accent}`,
            borderRadius: radii.md,
            boxShadow: shadows.card,
            padding: '0.75rem',
            fontFamily: font.sans,
            transition: motion.base,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, fontSize: font.size.sm, lineHeight: 1.35 }}>
              {toast.message}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{
                border: 'none',
                background: 'transparent',
                color: colors.textMid,
                cursor: 'pointer',
                fontSize: font.size.lg,
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
          {toast.variant === 'progress' ? (
            <div style={{ marginTop: 8 }}>
              <ProgressBar value={toast.progress} size="sm" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted ? createPortal(stack, document.body) : null}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return context;
};
