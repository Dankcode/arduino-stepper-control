// Design tokens — single source of truth for the dashboard's visual language.
// Replaces ~40 hard-coded hex values scattered across styled-jsx blocks.
// Mirrors tailwind.config.js theme extensions while legacy styled-jsx migrates.

export const colors = {
  // Surfaces (darkest -> lightest)
  bg:        '#020617',   // app background
  surface1:  '#0f172a',   // panels
  surface2:  '#1e293b',   // cards, inputs
  border:    '#334155',

  // Brand / accent
  accent:    '#0ea5e9',
  accentDim: '#0284c7',

  // Semantic
  success:   '#10b981',
  warning:   '#f59e0b',
  danger:    '#ef4444',
  info:      '#38bdf8',

  // Text
  textHi:    '#f8fafc',
  textMid:   '#94a3b8',
  textLo:    '#64748b',
};

export const font = {
  sans: `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`,
  mono: `'JetBrains Mono', ui-monospace, monospace`,
  // Type scale (rem): keep to these five sizes only.
  size: { xs: '0.65rem', sm: '0.75rem', md: '0.85rem', lg: '1rem', xl: '1.25rem' },
};

export const spacing = { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem' };
export const radii   = { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', full: '9999px' };
export const shadows = {
  card:  '0 10px 15px -3px rgba(0,0,0,0.5)',
  glow:  '0 0 10px rgba(14,165,233,0.15)',
};
export const motion = { fast: '120ms ease', base: '200ms ease' };

const flatten = (prefix, value) => Object.entries(value).flatMap(([key, child]) => {
  const name = `${prefix}-${key}`;
  if (child && typeof child === 'object') return flatten(name, child);
  return [[name, child]];
});

export const cssVars = () => Object.fromEntries([
  ...flatten('--color', colors),
  ...flatten('--space', spacing),
  ...flatten('--font-size', font.size),
  ...flatten('--radius', radii),
  ...flatten('--shadow', shadows),
  ...flatten('--motion', motion),
  ['--font-sans', font.sans],
  ['--font-mono-dashboard', font.mono],
]);
