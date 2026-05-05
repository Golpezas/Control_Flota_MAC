// src/App.tsx
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import VehiculosPage from './pages/Vehiculos';
import VehiculoEditPage from './pages/VehiculoEditPage';
import VehiculoDetail from './pages/VehiculoDetail';
import VehiculoCreatePage from './pages/VehiculoCreatePage';
import DashboardPage from './pages/DashboardPage'; 
import CostoCreatePage from './pages/CostoCreatePage'; 
import PolizasList from './pages/PolizasList'; 

function App() {
  // --- LÓGICA DE MODO OSCURO ---
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) return savedTheme === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  // -----------------------------

  const linkStyles = ({ isActive }: { isActive: boolean }) => 
    `flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
      isActive 
        ? 'bg-blue-600 text-white shadow-md' 
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  const HomeIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>);
  const TruckIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21h8m-4-11v11m-6-4h12a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3H6a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>);
  const ShieldIcon = () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>);

  return (
    <Router>
      <header className="bg-[#0f172a] border-b border-slate-800 sticky top-0 z-50 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            <div className="flex items-center gap-8 overflow-x-auto no-scrollbar w-full">
              {/* Logo Corporativo */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">M</span>
                </div>
                <span className="text-white font-bold text-xl tracking-tight hidden sm:block">
                  MAC<span className="text-blue-500 font-light">Flota</span>
                </span>
              </div>
              
              {/* Navegación Desktop y Mobile */}
              <nav className="flex space-x-1 sm:space-x-4 flex-nowrap flex-grow">
                <NavLink to="/" className={linkStyles}>
                  <HomeIcon /><span className="hidden sm:inline whitespace-nowrap">Dashboard</span>
                </NavLink>
                <NavLink to="/vehiculos" className={linkStyles}>
                  <TruckIcon /><span className="hidden sm:inline whitespace-nowrap">Vehículos</span>
                </NavLink>
                <NavLink to="/polizas" className={linkStyles}>
                  <ShieldIcon /><span className="hidden sm:inline whitespace-nowrap">Pólizas</span>
                </NavLink>
              </nav>

              {/* Botón Toggle Theme */}
              <button 
                onClick={toggleTheme}
                title={isDarkMode ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
                className="ml-auto p-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-yellow-400 hover:text-yellow-300 transition-all duration-200"
              >
                {isDarkMode ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
            </div>

          </div>
        </div>
      </header>
      
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Routes>
          <Route path="/" element={<DashboardPage />} /> 
          <Route path="/vehiculos" element={<VehiculosPage />} />
          <Route path="/vehiculos/crear" element={<VehiculoCreatePage />} /> 
          <Route path="/costos/crear" element={<CostoCreatePage />} /> 
          <Route path="/vehiculos/editar/:patente" element={<VehiculoEditPage />} />
          <Route path="/vehiculos/:patente" element={<VehiculoDetail />} /> 
          <Route path="/polizas" element={<PolizasList />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;