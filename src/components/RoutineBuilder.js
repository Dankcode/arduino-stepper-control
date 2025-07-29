import React, { useState, useEffect } from 'react';

const RoutineBuilder = () => {
  const [activeRoutine, setActiveRoutine] = useState({
    name: 'New Routine',
    inputs: { command: '', steps: 0, timeToWait: 0, notes: '' }
  });
  const [routineSteps, setRoutineSteps] = useState([]);
  const [savedRoutines, setSavedRoutines] = useState([]);

  useEffect(() => {
    const savedData = localStorage.getItem('routines');
    if (savedData) {
      setSavedRoutines(JSON.parse(savedData));
    }
  }, []);

  const handleInputChange = (field, value) => {
    setActiveRoutine(prev => ({
      ...prev,
      inputs: { ...prev.inputs, [field]: value }
    }));
  };

  const handleAddStep = () => {
    setRoutineSteps(prev => [...prev, { ...activeRoutine.inputs }]);
    setActiveRoutine(prev => ({
      ...prev,
      inputs: { command: '', steps: 0, timeToWait: 0, notes: '' }
    }));
  };

  const handleSaveRoutine = () => {
    const newRoutine = {
      name: activeRoutine.name,
      steps: routineSteps
    };
    const updated = [...savedRoutines, newRoutine];
    setSavedRoutines(updated);
    localStorage.setItem('routines', JSON.stringify(updated));
  };

  const handleLoadRoutine = (routine) => {
    setActiveRoutine({ name: routine.name, inputs: { command: '', steps: 0, timeToWait: 0, notes: '' } });
    setRoutineSteps(routine.steps);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-lg p-4">
        <h2 className="text-xl font-bold mb-4">Routines</h2>
        <div className="space-y-2">
          <button
            onClick={() => {
              setActiveRoutine({ name: 'New Routine', inputs: { command: '', steps: 0, timeToWait: 0, notes: '' } });
              setRoutineSteps([]);
            }}
            className="w-full p-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            New Routine
          </button>
          <button
            onClick={handleSaveRoutine}
            className="w-full p-2 bg-green-500 hover:bg-green-600 text-white rounded"
          >
            Save Routine
          </button>
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Saved Routines</h3>
            <select 
              className="w-full p-2 border rounded"
              onChange={(e) => {
                const selected = savedRoutines.find(r => r.name === e.target.value);
                if (selected) handleLoadRoutine(selected);
              }}
            >
              <option value="">Select Routine</option>
              {savedRoutines.map((routine, idx) => (
                <option key={idx} value={routine.name}>{routine.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="bg-white rounded-lg shadow-lg p-4">
          <input
            type="text"
            value={activeRoutine.name}
            onChange={(e) => setActiveRoutine(prev => ({ ...prev, name: e.target.value }))}
            className="text-xl font-bold mb-4 p-2 border-b w-full"
            placeholder="Routine Name"
          />
          
          <div className="flex space-x-4 mb-4">
            <div className="flex-1">
              <h3 className="font-semibold mb-2">Current Steps</h3>
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 border">Step</th>
                    <th className="p-2 border">Command</th>
                    <th className="p-2 border">Steps</th>
                    <th className="p-2 border">Wait (ms)</th>
                    <th className="p-2 border">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {routineSteps.map((step, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border text-center">{idx + 1}</td>
                      <td className="p-2 border">{step.command}</td>
                      <td className="p-2 border">{step.steps}</td>
                      <td className="p-2 border">{step.timeToWait}</td>
                      <td className="p-2 border">{step.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="w-96">
              <h3 className="font-semibold mb-2">Input</h3>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="p-2 border">Command</td>
                    <td className="p-2 border">
                      <select
                        value={activeRoutine.inputs.command}
                        onChange={(e) => handleInputChange('command', e.target.value)}
                        className="w-full p-1 border rounded"
                      >
                        <option value="">Select</option>
                        <option value="X">X Forward</option>
                        <option value="x">X Backward</option>
                        <option value="A">Z+Y Forward</option>
                        <option value="a">Z+Y Backward</option>
                        <option value="E">Enable Motors</option>
                        <option value="D">Disable Motors</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border">Steps</td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={activeRoutine.inputs.steps}
                        onChange={(e) => handleInputChange('steps', parseInt(e.target.value))}
                        className="w-full p-1 border rounded"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border">Wait (ms)</td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={activeRoutine.inputs.timeToWait}
                        onChange={(e) => handleInputChange('timeToWait', parseInt(e.target.value))}
                        className="w-full p-1 border rounded"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border">Notes</td>
                    <td className="p-2 border">
                      <input
                        type="text"
                        value={activeRoutine.inputs.notes}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                        className="w-full p-1 border rounded"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              <button
                onClick={handleAddStep}
                className="w-full mt-4 p-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
              >
                Add Step
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoutineBuilder;