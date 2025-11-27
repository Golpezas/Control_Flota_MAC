// src/pages/CostoCreatePage.tsx

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Corregido: Se elimina la extensión .tsx para asegurar la correcta resolución del módulo.
import CostoForm from '../components/CostoForm'; 

const CostoCreatePage: React.FC = () => {
    const navigate = useNavigate();
    
    // Al crearse con éxito, redirigimos al Dashboard para que vea los resultados actualizados.
    const handleSuccess = () => {
        navigate('/');
    };

    return (
        <div style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                💸 Registrar Gasto Manual
            </h1>
            
            <p style={{ marginBottom: '20px', color: '#495057' }}>
                Utiliza este formulario para registrar reparaciones, multas, combustible, o cualquier otro gasto no capturado automáticamente por el ETL.
            </p>

            {/*
                El CostoForm se utiliza en modo autónomo aquí. 
                El usuario deberá ingresar la patente manualmente.
            */}
            <CostoForm 
                onSuccess={handleSuccess}
            />
            
            <Link 
                to="/" 
                style={{ 
                    display: 'inline-block', 
                    marginTop: '30px', 
                    color: '#457B9D', 
                    textDecoration: 'none', 
                    fontWeight: 'bold' 
                }}
            >
                 ← Volver al Dashboard
            </Link>
        </div>
    );
};

export default CostoCreatePage;