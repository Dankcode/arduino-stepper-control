'use client';
// pages/index.js
import { useState } from 'react';

export default function Home() {
  const [steps, setSteps] = useState(400); // Default step amount
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const backendUrl = 'http://localhost:5000'; // IMPORTANT: Match this to your Python backend's address

  const sendMessage = (msg, isErr = false) => {
    setMessage(msg);
    setIsError(isErr);
    setTimeout(() => setMessage(''), 3000); // Clear message after 3 seconds
  };

  const sendCommand = async (command) => {
    try {
      const response = await fetch(`${backendUrl}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command, steps }), // Send current steps with each command
      });
      const data = await response.json();
      if (response.ok) {
        sendMessage(data.message);
      } else {
        sendMessage(`Error: ${data.message}`, true);
      }
    } catch (error) {
      sendMessage(`Network error: ${error.message}`, true);
    }
  };

  const handleUpdateSteps = async () => {
    try {
      const response = await fetch(`${backendUrl}/update_steps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ steps: parseInt(steps) }),
      });
      const data = await response.json();
      if (response.ok) {
        sendMessage(data.message);
      } else {
        sendMessage(`Error: ${data.message}`, true);
      }
    } catch (error) {
      sendMessage(`Network error: ${error.message}`, true);
    }
  };

  return (
    <div className="container">
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

        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh; /* Ensure it takes full viewport height for centering */
          padding: 1rem;
          box-sizing: border-box;
        }

        .card {
          background-color: #ffffff;
          padding: 2rem;
          border-radius: 1.5rem; /* 24px */
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); /* shadow-2xl */
          width: 100%;
          max-width: 28rem; /* max-w-md (448px) */
          border: 1px solid #e2e8f0; /* border-gray-200 */
        }

        .title {
          font-size: 2.25rem; /* 3xl */
          font-weight: 800; /* font-extrabold */
          text-align: center;
          color: #1a202c; /* gray-900 */
          margin-bottom: 2rem; /* mb-8 */
        }

        .message {
          padding: 1rem;
          margin-bottom: 1.5rem; /* mb-6 */
          border-radius: 0.5rem; /* rounded-lg */
          text-align: center;
          font-weight: 500; /* font-medium */
          border: 1px solid;
        }

        .message.error {
          background-color: #fee2e2; /* red-100 */
          color: #b91c1c; /* red-700 */
          border-color: #fca5a5; /* red-300 */
        }

        .message.success {
          background-color: #d1fae5; /* green-100 */
          color: #065f46; /* green-700 */
          border-color: #a7f3d0; /* green-300 */
        }

        .input-group {
          margin-bottom: 2rem; /* mb-8 */
        }

        .input-label {
          display: block;
          color: #4a5568; /* gray-700 */
          font-size: 1.125rem; /* lg */
          font-weight: 600; /* semibold */
          margin-bottom: 0.75rem; /* mb-3 */
        }

        .input-flex {
          display: flex;
          align-items: center;
          gap: 1rem; /* space-x-4 */
        }

        .input-field {
          flex-grow: 1;
          padding: 1rem;
          border: 1px solid #cbd5e0; /* border-gray-300 */
          border-radius: 0.5rem; /* rounded-lg */
          outline: none;
          font-size: 1.125rem; /* text-lg */
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); /* shadow-sm */
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-field:focus {
          border-color: #60a5fa; /* blue-400 */
          box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.5); /* focus:ring-3 focus:ring-blue-400 */
        }

        .btn {
          padding: 1.25rem; /* p-5 */
          font-weight: 600; /* font-semibold */
          border-radius: 0.5rem; /* rounded-lg */
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); /* shadow-lg */
          transition: all 0.2s ease-in-out;
          cursor: pointer;
          border: none;
          transform: translateY(0); /* For active state */
        }

        .btn:active {
          transform: translateY(2px);
          box-shadow: none;
        }

        .btn-update {
          padding: 1rem 2rem; /* px-8 py-4 */
          font-weight: 700; /* font-bold */
          background-color: #3b82f6; /* blue-600 */
          color: #ffffff;
        }

        .btn-update:hover {
          background-color: #2563eb; /* blue-700 */
        }

        .btn-update:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5), 0 0 0 5px rgba(255, 255, 255, 0.5); /* focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 */
        }

        .grid-container {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.25rem; /* gap-5 */
        }

        .grid-container.mb-8 {
          margin-bottom: 2rem; /* mb-8 */
        }

        .btn-purple {
          background-color: #9333ea; /* purple-600 */
          color: #ffffff;
        }

        .btn-purple:hover {
          background-color: #7e22ce; /* purple-700 */
        }

        .btn-purple:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.5), 0 0 0 5px rgba(255, 255, 255, 0.5); /* focus:ring-3 focus:ring-purple-500 focus:ring-offset-2 */
        }

        .btn-green {
          background-color: #16a34a; /* green-600 */
          color: #ffffff;
        }

        .btn-green:hover {
          background-color: #15803d; /* green-700 */
        }

        .btn-green:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.5), 0 0 0 5px rgba(255, 255, 255, 0.5); /* focus:ring-3 focus:ring-green-500 focus:ring-offset-2 */
        }

        .btn-yellow {
          background-color: #f59e0b; /* yellow-500 */
          color: #1a202c; /* gray-900 */
        }

        .btn-yellow:hover {
          background-color: #d97706; /* yellow-600 */
        }

        .btn-yellow:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.5), 0 0 0 5px rgba(255, 255, 255, 0.5); /* focus:ring-3 focus:ring-yellow-500 focus:ring-offset-2 */
        }

        .btn-red {
          background-color: #ef4444; /* red-500 */
          color: #ffffff;
        }

        .btn-red:hover {
          background-color: #dc2626; /* red-600 */
        }

        .btn-red:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.5), 0 0 0 5px rgba(255, 255, 255, 0.5); /* focus:ring-3 focus:ring-red-500 focus:ring-offset-2 */
        }

        .btn-indigo {
          background-color: #6366f1; /* indigo-600 */
          color: #ffffff;
          grid-column: span 2; /* col-span-2 */
        }

        .btn-indigo:hover {
          background-color: #4f46e5; /* indigo-700 */
        }

        .btn-indigo:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.5), 0 0 0 5px rgba(255, 255, 255, 0.5); /* focus:ring-3 focus:ring-indigo-500 focus:ring-offset-2 */
        }

        /* Responsive adjustments */
        @media (max-width: 640px) {
          .card {
            padding: 1.5rem;
            border-radius: 1rem;
          }
          .title {
            font-size: 2rem;
            margin-bottom: 1.5rem;
          }
          .input-label {
            font-size: 1rem;
          }
          .input-field {
            padding: 0.75rem;
            font-size: 1rem;
          }
          .btn {
            padding: 1rem;
            font-size: 0.9rem;
          }
          .btn-update {
            padding: 0.75rem 1.5rem;
          }
          .grid-container {
            gap: 1rem;
          }
        }
      `}</style>

      <div className="card">
        <h1 className="title">
          CNC Motor Control
        </h1>

        {message && (
          <div className={`message ${isError ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        <div className="input-group">
          <label htmlFor="steps" className="input-label">
            Step Amount:
          </label>
          <div className="input-flex">
            <input
              type="number"
              id="steps"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              className="input-field"
              min="1"
            />
            <button
              onClick={handleUpdateSteps}
              className="btn btn-update"
            >
              Update
            </button>
          </div>
        </div>

        <div className="grid-container mb-8">
          <button
            onClick={() => sendCommand('X')}
            className="btn btn-purple"
          >
            X Forward
          </button>
          <button
            onClick={() => sendCommand('x')}
            className="btn btn-purple"
          >
            X Backward
          </button>
          <button
            onClick={() => sendCommand('A')}
            className="btn btn-green"
          >
            Z+Y Forward
          </button>
          <button
            onClick={() => sendCommand('a')}
            className="btn btn-green"
          >
            Z+Y Backward
          </button>
        </div>

        <div className="grid-container">
          <button
            onClick={() => sendCommand('E')}
            className="btn btn-yellow"
          >
            Enable Motors
          </button>
          <button
            onClick={() => sendCommand('D')}
            className="btn btn-red"
          >
            Disable Motors
          </button>
          <button
            onClick={() => sendCommand('T')}
            className="btn btn-indigo"
          >
            Test Motors
          </button>
        </div>
      </div>
    </div>
  );
}
