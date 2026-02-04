/// src/pages/VehiculoCreatePage.tsx

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import VehiculoForm from '../components/VehiculoForm.tsx'; 

const VehiculoCreatePage: React.FC = () => {
    const navigate = useNavigate();
    
    // 3. Recibimos la patente y redirigimos al detalle
    const handleSuccess = (patente?: string) => {
        if (patente) {
            // ✅ Redirige al detalle para poder subir documentos inmediatamente
            navigate(`/vehiculos/${patente}`);
        } else {
            // Fallback: si por alguna razón no hay patente, vuelve al listado
            navigate('/vehiculos');
        }
    };

    return (
        <div style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
                ➕ Crear Nuevo Vehículo
            </h1>
            
            <VehiculoForm 
                onSuccess={handleSuccess}
            />
            
            <Link to="/vehiculos" style={{ display: 'block', marginTop: '30px' }}>
                 ← Volver al Listado
            </Link>
        </div>
    );
};

export default VehiculoCreatePage;