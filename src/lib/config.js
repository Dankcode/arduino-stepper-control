export const CONFIG = {
  PI_BACKEND_URL: process.env.NEXT_PUBLIC_PI_BACKEND_URL || 'http://192.168.1.43:5000',
  DASHBOARD_API_URL: '/api',
  SYNC_INTERVAL_MS: 5000, // Poll every 5 seconds for new pictures
  EXECUTION_INTERVAL_MS: 3000, // Poll every 3 seconds for next step execution
};
