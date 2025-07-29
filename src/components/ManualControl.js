'use client';
import { useState } from 'react';
import axios from 'axios';

export default function ManualControl() {
  // Existing state
  const [stepSize, setStepSize] = useState(100);
  const [motorEnabled, setMotorEnabled] = useState(false);
  const [ledOn, setLedOn] = useState(false);
  const [response, setResponse] = useState('');
  
  // New state for position tracking
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isReturning, setIsReturning] = useState(false);

  // Enhanced command sending function that tracks position
  const sendCommand = async (command, stepsOverride = null) => {
    try {
      // Calculate position change based on command
      const steps = stepsOverride !== null ? stepsOverride : stepSize;
      let positionChange = 0;
      
      if (command === 'X') {
        positionChange = steps;
      } else if (command === 'x') {
        positionChange = -steps;
      }
      
      // Send command to backend
      const result = await axios.post('http://localhost:5000/manual-control', {
        command,
        steps: Math.abs(steps), // Always send positive steps to backend
        led: ledOn,
      });

      // Update position tracking
      if (['X', 'x'].includes(command)) {
        setCurrentPosition(prev => prev + positionChange);
      }
      
      setResponse(result.data.message);
    } catch (error) {
      setResponse('Error: ' + error.message);
    }
  };

  // Function to return to starting position
  const returnToStart = async () => {
    if (currentPosition === 0) {
      setResponse('Already at starting position');
      return;
    }

    try {
      setIsReturning(true);
      
      // Determine direction and steps needed to return
      const direction = currentPosition > 0 ? 'x' : 'X';
      const stepsToReturn = Math.abs(currentPosition);
      
      await sendCommand(direction, stepsToReturn);
      
      setResponse('Returned to starting position');
      setCurrentPosition(0);
    } catch (error) {
      setResponse('Error returning to start: ' + error.message);
    } finally {
      setIsReturning(false);
    }
  };

  // Existing toggle functions
  const toggleMotor = async () => {
    const newState = !motorEnabled;
    setMotorEnabled(newState);
    await sendCommand(newState ? 'E' : 'D');
  };

  const toggleLED = async () => {
    const newState = !ledOn;
    setLedOn(newState);
    await sendCommand(newState ? 'L' : 'l');
  };

  return (
    <div className="p-4">
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Motor Settings</h2>
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">Step Size</label>
            <input
              type="number"
              value={stepSize}
              onChange={(e) => setStepSize(parseInt(e.target.value))}
              className="w-full p-2 border rounded"
              min="1"
              max="1000"
            />
          </div>
          <button
            onClick={toggleMotor}
            className={`px-6 py-3 rounded text-white ${
              motorEnabled ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {motorEnabled ? 'Disable Motor' : 'Enable Motor'}
          </button>
          <button
            onClick={toggleLED}
            className={`px-6 py-3 rounded text-white ${
              ledOn ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-gray-500 hover:bg-gray-600'
            }`}
          >
            {ledOn ? 'LED On' : 'LED Off'}
          </button>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Motion Control</h2>
        {/* Position display */}
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-center text-lg">
            Current Position: <span className="font-bold">{currentPosition}</span> steps from start
          </p>
        </div>
        
        <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
          <div className="col-start-2">
            <button
              onClick={() => sendCommand('X')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded"
              disabled={!motorEnabled || isReturning}
            >
              Forward
            </button>
          </div>
          <div className="col-start-1 col-span-3 grid grid-cols-3 gap-4">
            <button
              onClick={() => sendCommand('A')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded"
              disabled={!motorEnabled || isReturning}
            >
              Left
            </button>
            <button
              onClick={() => sendCommand('S')}
              className="w-full bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded"
              disabled={!motorEnabled || isReturning}
            >
              Stop
            </button>
            <button
              onClick={() => sendCommand('D')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded"
              disabled={!motorEnabled || isReturning}
            >
              Right
            </button>
          </div>
          <div className="col-start-2">
            <button
              onClick={() => sendCommand('x')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded"
              disabled={!motorEnabled || isReturning}
            >
              Backward
            </button>
          </div>
        </div>

        {/* Return to Start button */}
        <div className="mt-6 text-center">
          <button
            onClick={returnToStart}
            className={`px-8 py-3 rounded text-white ${
              isReturning || !motorEnabled
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-purple-500 hover:bg-purple-600'
            }`}
            disabled={!motorEnabled || isReturning}
          >
            {isReturning ? 'Returning...' : 'Return to Start'}
          </button>
        </div>
      </div>

      {response && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Response:</h2>
          <pre className="whitespace-pre-wrap">{response}</pre>
        </div>
      )}
    </div>
  );
}