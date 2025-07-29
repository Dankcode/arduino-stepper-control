// pages/index.js
'use client';
import { useState } from 'react';
import ManualControl from '../components/ManualControl';
import RoutineBuilder from '../components/RoutineBuilder';

export default function Home() {
  const [activeTab, setActiveTab] = useState('routine');

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Arduino Stepper Motor Control</h1>

      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('routine')}
              className={`py-2 px-4 border-b-2 font-medium text-sm ${
                activeTab === 'routine'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Routine Builder
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`ml-8 py-2 px-4 border-b-2 font-medium text-sm ${
                activeTab === 'manual'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Manual Control
            </button>
          </nav>
        </div>
      </div>

      {activeTab === 'routine' ? <RoutineBuilder /> : <ManualControl />}
    </div>
  );
}