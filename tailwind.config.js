/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        dashboard: {
          bg: '#020617',
          surface1: '#0f172a',
          surface2: '#1e293b',
          border: '#334155',
          accent: '#0ea5e9',
          accentDim: '#0284c7',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#38bdf8',
          textHi: '#f8fafc',
          textMid: '#94a3b8',
          textLo: '#64748b',
        },
      },
      borderRadius: {
        dashboardSm: '0.25rem',
        dashboardMd: '0.5rem',
        dashboardLg: '0.75rem',
      },
      boxShadow: {
        dashboardCard: '0 10px 15px -3px rgba(0,0,0,0.5)',
        dashboardGlow: '0 0 10px rgba(14,165,233,0.15)',
      },
    },
  },
  plugins: [],
}
