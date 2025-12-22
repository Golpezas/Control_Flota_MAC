// src/App.tsx (Asegúrate de que tus importaciones y la estructura de Routes sean estas)

import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import VehiculosPage from './pages/Vehiculos';
import VehiculoEditPage from './pages/VehiculoEditPage';
import VehiculoDetail from './pages/VehiculoDetail';
import VehiculoCreatePage from './pages/VehiculoCreatePage';
import DashboardPage from './pages/DashboardPage'; 
// 👇 NUEVA IMPORTACIÓN
import CostoCreatePage from './pages/CostoCreatePage'; 
import PolizasList from './pages/PolizasList'; 

// ... (resto de importaciones y definición de DashboardPage)

function App() {
  return (
    <Router>
      <header style={{ 
          background: '#1D3557', 
          padding: '15px 30px', 
          color: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <nav>
          <Link 
              to="/" 
              style={{ color: 'white', marginRight: '30px', textDecoration: 'none', fontWeight: 'bold' }}
          >
              Inicio (Dashboard)
          </Link>
          <Link 
              to="/vehiculos" 
              style={{ color: 'white', marginRight: '30px', textDecoration: 'none', fontWeight: 'bold' }}
          >
              Gestión de Vehículos
          </Link>
          <Link 
              to="/costos/crear" 
              style={{ color: '#FFB703', textDecoration: 'none', fontWeight: 'bold' }}
          >
              💸 Registrar Gasto
          </Link>
          <Link 
              to="/polizas" 
              style={{ color: 'white', marginRight: '30px', textDecoration: 'none', fontWeight: 'bold' }}
          >
              📜 Pólizas de Seguros
          </Link>
        </nav>
      </header>
      
      <main style={{ padding: '30px' }}>
        <Routes>
          <Route path="/" element={<DashboardPage />} /> 
          <Route path="/vehiculos" element={<VehiculosPage />} />
          <Route path="/vehiculos/crear" element={<VehiculoCreatePage />} /> 
          
          <Route path="/costos/crear" element={<CostoCreatePage />} /> 

          {/* Rutas dinámicas (Corregidas y ordenadas por prioridad) */}
          {/* 1. RUTA DE EDICIÓN: Debe ir ANTES que la de Detalle para coincidir correctamente */}
          <Route path="/vehiculos/editar/:patente" element={<VehiculoEditPage />} />
          
          {/* 2. RUTA DE DETALLE: Captura el resto de patrones /vehiculos/ID */}
          <Route path="/vehiculos/:patente" element={<VehiculoDetail />} /> 

          {/* RUTA DE PÓLIZAS DE SEGUROS */}
          <Route path="/polizas" element={<PolizasList />} />

        </Routes>
      </main>
    </Router>
  );
}

export default App;