// src/pages/VehiculoCreatePage.tsx

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import VehiculoForm from '../components/VehiculoForm.tsx'; 

const VehiculoCreatePage: React.FC = () => {
    const navigate = useNavigate();
    
    // Al crearse con éxito, redirigimos al listado principal.
    const handleSuccess = () => {
        navigate('/vehiculos');
    };

    return (
        <div style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
                ➕ Crear Nuevo Vehículo
            </h1>
            
            {/* El formulario se renderiza sin initialData ni isEditMode, activando el modo CREACIÓN */}
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