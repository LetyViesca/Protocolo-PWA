import React, { useState } from 'react';

export function RegistroDirector() {
  const [institucion, setInstitucion] = useState('');
  const [director, setDirector] = useState('');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <h2 className="text-base font-bold text-white">Registro de la Asociación</h2>
      <p className="text-xs text-slate-400">Configuración inicial del sistema y perfil operativo.</p>
      
      <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-300 mb-1">Nombre de la Institución / Base</label>
          <input 
            type="text" 
            value={institucion}
            onChange={(e) => setInstitucion(e.target.value)}
            placeholder="Ej. Cruz Roja / Base Norte" 
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-300 mb-1">Director / Comandante</label>
          <input 
            type="text" 
            value={director}
            onChange={(e) => setDirector(e.target.value)}
            placeholder="Nombre completo" 
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
          />
        </div>

        <button 
          type="submit" 
          className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all"
        >
          Guardar Configuración
        </button>
      </form>
    </div>
  );
}