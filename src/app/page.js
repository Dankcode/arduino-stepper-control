// pages/index.js
'use client';
import { useState } from 'react';
import ManualControl from '../components/ManualControl'; // Assuming these components exist
import RoutineBuilder from '../components/RoutineBuilder'; // Assuming these components exist
import PiRoutineManager from '../components/PiRoutineManager'; // Import the new component

export default function Home() {
  const [activeTab, setActiveTab] = useState('routine');

  return (
    <div className="main-wrapper">
      {/* Google Fonts - Inter */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <style jsx global>{`
        body {
          margin: 0;
          font-family: 'Inter', sans-serif;
          background: linear-gradient(to bottom right, #e0e0e0, #c0c0c0);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 1rem;
          box-sizing: border-box;
        }

        .main-wrapper {
          width: 100%;
          max-width: 64rem; /* max-w-4xl (1024px) */
          margin-left: auto;
          margin-right: auto;
          padding: 2rem; /* p-8 */
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center; /* Center content horizontally */
        }

        .main-title {
          font-size: 2.25rem; /* text-3xl */
          font-weight: 700; /* font-bold */
          margin-bottom: 1.5rem; /* mb-6 */
          color: #1a202c; /* gray-800 */
          text-align: center;
        }

        .tab-section {
          margin-bottom: 1.5rem; /* mb-6 */
          width: 100%; /* Ensure it spans the width for the border */
        }

        .tab-border-container {
          border-bottom: 1px solid #e2e8f0; /* border-b border-gray-200 */
        }

        .tab-nav {
          display: flex;
          margin-bottom: -1px; /* -mb-px to align with border */
        }

        .tab-button {
          padding-top: 0.5rem; /* py-2 */
          padding-bottom: 0.5rem; /* py-2 */
          padding-left: 1rem; /* px-4 */
          padding-right: 1rem; /* px-4 */
          border-bottom-width: 2px;
          font-weight: 500; /* font-medium */
          font-size: 0.875rem; /* text-sm */
          cursor: pointer;
          background: none;
          border-left: none;
          border-right: none;
          border-top: none;
          transition: all 0.2s ease-in-out;
        }

        .tab-button.active {
          border-color: #3b82f6; /* border-blue-500 */
          color: #2563eb; /* text-blue-600 */
        }

        .tab-button.inactive {
          border-color: transparent;
          color: #6b7280; /* text-gray-500 */
        }

        .tab-button.inactive:hover {
          color: #4b5563; /* hover:text-gray-700 */
          border-color: #d1d5db; /* hover:border-gray-300 */
        }

        .tab-button + .tab-button { /* ml-8 for the second button */
          margin-left: 2rem;
        }

        /* Styles from StepperMotorControl.module.css, adapted for global use */
        .card {
          background-color: #ffffff;
          padding: 2rem;
          border-radius: 1.5rem; /* 24px */
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); /* shadow-2xl */
          width: 100%;
          max-width: 28rem; /* max-w-md (448px) */
          border: 1px solid #e2e8f0; /* border-gray-200 */
        }

        .title { /* This will apply to h1 inside ManualControl/RoutineBuilder if they use this class */
          font-size: 2.25rem; /* 3xl */
          font-weight: 800; /* font-extrabold */
          text-align: center;
          color: #1a202c; /* gray-900 */
          margin-bottom: 2rem; /* mb-8 */
        }

        .message-display {
          padding: 0.75rem; /* p-3 */
          border-radius: 0.5rem; /* rounded-lg */
          background-color: #f3f4f6; /* gray-100 */
          border: 1px solid #e5e7eb; /* border */
          margin-top: 1rem; /* mt-4 */
          margin-bottom: 1rem; /* mb-4 */
        }

        .message-text {
          font-size: 0.875rem; /* text-sm */
          color: #4b5563; /* gray-700 */
        }

        .status-block, .input-section {
          margin-bottom: 1.5rem; /* mb-6 */
          padding: 0.75rem; /* p-3 */
          border-radius: 0.5rem; /* rounded-lg */
          background-color: #f9fafb; /* gray-50 */
        }

        .status-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem; /* mb-2 */
        }

        .status-label {
          font-size: 0.875rem; /* text-sm */
          font-weight: 500; /* font-medium */
          color: #4a5568; /* gray-700 */
        }

        .status-indicator {
          padding: 0.25rem 0.5rem; /* px-2 py-1 */
          border-radius: 0.25rem; /* rounded */
          font-size: 0.75rem; /* text-xs */
          font-weight: 500; /* font-medium */
        }

        .status-indicator.connected {
          background-color: #d1fae5; /* green-100 */
          color: #065f46; /* green-800 */
        }

        .status-indicator.disconnected {
          background-color: #fee2e2; /* red-100 */
          color: #b91c1c; /* red-800 */
        }

        .flex-buttons-group {
          display: flex;
          gap: 0.5rem; /* space-x-2 */
        }

        .btn {
          padding: 0.75rem 1rem; /* px-3 py-2 */
          font-weight: 500; /* font-medium */
          border-radius: 0.25rem; /* rounded */
          transition: background-color 0.2s ease-in-out, opacity 0.2s ease-in-out;
          cursor: pointer;
          border: none;
          flex: 1; /* flex-1 */
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-connect {
          background-color: #2563eb; /* blue-600 */
          color: #ffffff;
        }

        .btn-connect:hover:not(:disabled) {
          background-color: #1d4ed8; /* blue-700 */
        }

        .btn-disconnect {
          background-color: #dc2626; /* red-600 */
          color: #ffffff;
        }

        .btn-disconnect:hover:not(:disabled) {
          background-color: #b91c1c; /* red-700 */
        }

        .input-label {
          display: block;
          font-size: 0.875rem; /* text-sm */
          font-weight: 500; /* font-medium */
          color: #4a5568; /* gray-700 */
          margin-bottom: 0.5rem; /* mb-2 */
        }

        .input-field {
          flex: 1; /* flex-1 */
          padding: 0.5rem 0.75rem; /* px-3 py-2 */
          border: 1px solid #cbd5e0; /* border-gray-300 */
          border-radius: 0.25rem; /* rounded */
          font-size: 0.875rem; /* text-sm */
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-field:focus {
          border-color: #3b82f6; /* blue-500 */
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5); /* focus:ring-2 focus:ring-blue-500 */
        }

        .btn-update-steps {
          padding: 0.5rem 1rem; /* px-4 py-2 */
          background-color: #16a34a; /* green-600 */
          color: #ffffff;
        }

        .btn-update-steps:hover {
          background-color: #15803d; /* green-700 */
        }

        .motor-buttons-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem; /* space-y-3 */
          margin-bottom: 1.5rem; /* mb-6 */
        }

        .btn-motor {
          width: 100%; /* w-full */
          padding: 0.75rem 1rem; /* px-4 py-3 */
          font-weight: 500; /* font-medium */
          border-radius: 0.25rem; /* rounded */
          color: #ffffff;
          transition: background-color 0.2s ease-in-out, opacity 0.2s ease-in-out;
          cursor: pointer;
          border: none;
        }

        .btn-motor:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-motor.blue {
          background-color: #2563eb; /* blue-600 */
        }
        .btn-motor.blue:hover:not(:disabled) {
          background-color: #1d4ed8; /* blue-700 */
        }

        .btn-motor.purple {
          background-color: #9333ea; /* purple-600 */
        }
        .btn-motor.purple:hover:not(:disabled) {
          background-color: #7e22ce; /* purple-700 */
        }

        .btn-motor.green {
          background-color: #16a34a; /* green-600 */
        }
        .btn-motor.green:hover:not(:disabled) {
          background-color: #15803d; /* green-700 */
        }

        .btn-motor.red {
          background-color: #dc2626; /* red-600 */
        }
        .btn-motor.red:hover:not(:disabled) {
          background-color: #b91c1c; /* red-700 */
        }

        .btn-motor.yellow {
          background-color: #d97706; /* yellow-600 */
          color: #ffffff; /* text-white */
        }
        .btn-motor.yellow:hover:not(:disabled) {
          background-color: #b45309; /* yellow-700 */
        }

        .loading-spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top-color: #2563eb; /* blue-600 */
          border-radius: 50%;
          height: 1.5rem; /* h-6 */
          width: 1.5rem; /* w-6 */
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Responsive adjustments */
        @media (max-width: 640px) {
          .main-wrapper {
            padding: 1rem;
          }
          .main-title {
            font-size: 1.75rem;
            margin-bottom: 1rem;
          }
          .tab-button {
            padding: 0.4rem 0.8rem;
            font-size: 0.8rem;
          }
          .tab-button + .tab-button {
            margin-left: 1rem;
          }
          .card {
            padding: 1.5rem;
            border-radius: 1rem;
          }
          .title {
            font-size: 1.75rem; /* Smaller title on small screens */
            margin-bottom: 1.5rem;
          }
          .status-block, .input-section, .motor-buttons-group {
            margin-bottom: 1rem;
          }
          .btn, .input-field {
            padding: 0.6rem 0.8rem;
            font-size: 0.8rem;
          }
          .btn-motor {
            padding: 0.6rem 0.8rem;
            font-size: 0.9rem;
          }
          .status-label {
            font-size: 0.8rem;
          }
          .status-indicator {
            font-size: 0.65rem;
            padding: 0.15rem 0.4rem;
          }
        }
      `}</style>

      <h1 className="main-title">Arduino Stepper Motor Control</h1>

      <div className="tab-section">
        <div className="tab-border-container">
          <nav className="tab-nav">
            <button
              onClick={() => setActiveTab('routine')}
              className={`tab-button ${
                activeTab === 'routine' ? 'active' : 'inactive'
              }`}
            >
              Routine Builder
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`tab-button ${
                activeTab === 'manual' ? 'active' : 'inactive'
              }`}
            >
              Manual Control
            </button>
            <button
              onClick={() => setActiveTab('pi')}
              className={`tab-button ${
                activeTab === 'pi' ? 'active' : 'inactive'
              }`}
            >
              Pi Routines
            </button>
          </nav>
        </div>
      </div>

      {activeTab === 'routine' && <RoutineBuilder />}
      {activeTab === 'manual' && <ManualControl />}
      {activeTab === 'pi' && <PiRoutineManager />}
    </div>
  );
}
