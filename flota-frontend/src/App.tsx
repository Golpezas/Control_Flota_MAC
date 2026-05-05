// src/App.tsx
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import VehiculosPage from './pages/Vehiculos';
import VehiculoEditPage from './pages/VehiculoEditPage';
import VehiculoDetail from './pages/VehiculoDetail';
import VehiculoCreatePage from './pages/VehiculoCreatePage';
import DashboardPage from './pages/DashboardPage'; 
import CostoCreatePage from './pages/CostoCreatePage'; 
import PolizasList from './pages/PolizasList'; 

function App() {
  // Clase base para los links del menú, usando NavLink para detectar si está activo
  const linkStyles = ({ isActive }: { isActive: boolean }) => 
    `flex items-center gap-2 px-4 py-2 rounded-md font-bold transition-colors ${
      isActive 
        ? 'bg-slate-800 text-white shadow-inner' 
        : 'text-slate-200 hover:bg-slate-700 hover:text-white'
    }`;

  return (
    <Router>
      <header className="bg-[#1D3557] shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <nav className="flex items-center gap-2 sm:gap-6 overflow-x-auto">
              <NavLink to="/" className={linkStyles}>
                🏠 <span className="hidden sm:inline">Inicio (Dashboard)</span>
              </NavLink>
              <NavLink to="/vehiculos" className={linkStyles}>
                🚛 <span className="hidden sm:inline">Gestión de Vehículos</span>
              </NavLink>
              <NavLink to="/polizas" className={linkStyles}>
                📜 <span className="hidden sm:inline">Pólizas de Seguros</span>
              </NavLink>
            </nav>
          </div>
        </div>
      </header>
      
      {/* Contenedor principal centrado, responsivo y sin fondo negro */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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