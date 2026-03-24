# Project Rules

- **Language**: Use Python for backend logic and Next.js Javascript for the Frontend
- **Styling**: 
Follow the following is an example of the frontend template for the dashboard

      {/* --- SIDE NAVIGATION --- */}
      <aside className="w-64 bg-[#11141b] border-r border-slate-800 flex flex-col">
        <div className="p-6 flex items-center space-x-3 border-b border-slate-800/50">
          <div className="bg-emerald-500 p-1.5 rounded-md">
            <FlaskConical className="text-black w-5 h-5" />
          </div>
          <span className="text-white font-bold tracking-tight text-lg">BioMatrix <span className="text-emerald-500 text-xs">OS</span></span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavItem icon={<Cpu size={18}/>} label="Routine Builder" active />
          <NavItem icon={<Settings size={18}/>} label="Manual Control" />
          <NavItem icon={<Database size={18}/>} label="Library" />
          <NavItem icon={<Camera size={18}/>} label="Imaging" />
        </nav>

        <div className="p-4 mt-auto border-t border-slate-800">
          <div className="bg-[#1a1f29] p-4 rounded-xl border border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase text-slate-500">Status: Ready</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
            <div className="text-xs font-mono text-emerald-400 truncate mb-4">ID: 2026-03-02-12-58</div>
            <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20">
              <Save size={14} /> SAVE ROUTINE
            </button>
          </div>
        </div>
      </aside>

      {/* --- MAIN INTERFACE --- */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* TOP STATUS BAR */}
        <header className="h-14 bg-[#11141b]/50 backdrop-blur-md border-b border-slate-800 flex items-center px-8 justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-medium uppercase tracking-wider">Runtime: <span className="text-white font-mono">06:24</span></span>
            </div>
            <div className="h-4 w-[1px] bg-slate-800"></div>
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-medium uppercase tracking-wider">Temp: <span className="text-white font-mono">37.0°C</span></span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] font-bold uppercase transition-colors">Abort Mission</button>
          </div>
        </header>

        {/* PLATE WORKSPACE */}
        <div className="p-8 flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">96-Well Plate Configurator</h2>
                <p className="text-sm text-slate-500">Select wells to batch edit parameters</p>
              </div>
              <div className="flex gap-2 text-[10px] font-bold text-slate-500 uppercase italic">
                <span>View: Heatmap (SA)</span>
              </div>
            </div>

            {/* THE PLATE MAP */}
            <div className="bg-[#11141b] p-10 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
              {/* Subtle background glow */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
              
              <div className="grid grid-cols-[40px_repeat(12,1fr)] gap-3 items-center">
                <div className="h-6"></div>
                {cols.map(c => (
                  <div key={c} className="text-center text-[10px] font-bold text-slate-600 font-mono italic">{c}</div>
                ))}

                {rows.map(row => (
                  <React.Fragment key={row}>
                    <div className="text-center text-[10px] font-bold text-slate-600 font-mono italic">{row}</div>
                    {cols.map(col => {
                      const wellId = `${row}${col}`;
                      const isActive = selectedWell === wellId;
                      return (
                        <button 
                          key={wellId}
                          onClick={() => setSelectedWell(wellId)}
                          className={`
                            aspect-square rounded-full border-2 flex items-center justify-center transition-all duration-200 group relative
                            ${isActive ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'border-slate-800 bg-[#0b0e14] hover:border-slate-600'}
                          `}
                        >
                          {/* Inner Core */}
                          <div className={`w-3/5 h-3/5 rounded-full border ${isActive ? 'bg-emerald-400 border-emerald-300' : 'bg-slate-900 border-slate-700'}`}></div>
                          
                          {/* Data Tooltip (Professional Density) */}
                          <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-3 z-50 pointer-events-none transition-opacity">
                            <div className="bg-[#1a1f29] border border-slate-700 p-2 rounded shadow-2xl min-w-[80px]">
                              <div className="text-[10px] font-bold text-emerald-400 border-b border-slate-700 pb-1 mb-1">WELL {wellId}</div>
                              <div className="grid grid-cols-2 gap-x-2 text-[9px] font-mono leading-tight">
                                <span className="text-slate-500">SA:</span> <span className="text-white">1.0</span>
                                <span className="text-slate-500">DL:</span> <span className="text-white">1.0</span>
                                <span className="text-slate-500">LT:</span> <span className="text-white">1.0</span>
                                <span className="text-slate-500">EXP:</span> <span className="text-white">1.0</span>
                              </div>
                            </div>
                            <div className="w-2 h-2 bg-[#1a1f29] border-r border-b border-slate-700 rotate-45 mx-auto -mt-1"></div>
                          </div>
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* LEGEND / FOOTER */}
            <div className="mt-8 flex justify-between items-center px-4">
              <div className="flex space-x-6">
                <LegendItem color="bg-emerald-500" label="Saturated" />
                <LegendItem color="bg-slate-800" label="Empty" />
                <LegendItem color="bg-amber-500" label="In Progress" />
              </div>
              <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                System: Pi-Interface v2.4.0
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

- **Patterns**: Prefer functional components over classes.
- **Error Handling**: Always wrap API calls in try-catch blocks with user-friendly logs.
- **Naming**: Use camelCase for variables and PascalCase for components.
- **Prohibitions**: Do not use 'any' types. Do not delete comments without asking. Do not remove any function or file without asking. 