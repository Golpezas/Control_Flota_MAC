// src/pages/VehiculoEditPage.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Vehiculo } from '../api/models/vehiculos';
import { fetchVehiculoByPatente } from '../api/vehiculos'; 
// Asumimos que la ruta al componente es correcta (../components/VehiculoForm.tsx)
import VehiculoForm from '../components/VehiculoForm.tsx'; 

const VehiculoEditPage: React.FC = () => {
    // 1. Obtener la patente de la URL
    const { patente } = useParams<{ patente: string }>(); 
    const navigate = useNavigate();
    
    const [initialData, setInitialData] = useState<Vehiculo | null>(null); 
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 2. Cargar datos iniciales
    useEffect(() => {
        if (!patente) {
            setError('Error: Patente no especificada.');
            setIsLoading(false);
            return;
        }

        const loadVehiculo = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Cargar los datos del vehículo a editar
                const data = await fetchVehiculoByPatente(patente);
                setInitialData(data);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : 'Error al cargar datos del vehículo.';
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };
        loadVehiculo();
    }, [patente]);

    // Función a llamar tras una actualización exitosa
    const handleSuccess = () => {
        // Redirigir al detalle del vehículo después de guardar
        navigate(`/vehiculos/${patente}`);
    };

    if (isLoading) {
        return <div style={{ padding: '20px' }}>Cargando datos del vehículo para edición... ⏳</div>;
    }
    if (error) {
        return <div style={{ color: 'red', padding: '20px' }}>❌ Error: {error}</div>;
    }
    if (!initialData) {
        return <div style={{ padding: '20px' }}>No se encontró el vehículo para edición.</div>;
    }

    return (
        <div style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
                ✏️ Editar Vehículo: {initialData.patente_original || initialData._id}
            </h1>
            
            {/* 3. Pasar datos iniciales y activar modo edición */}
            <VehiculoForm 
                onSuccess={handleSuccess}
                initialData={initialData}
                isEditMode={true} 
            />
            
            <Link to={`/vehiculos/${patente}`} style={{ display: 'block', marginTop: '30px' }}>
                 ← Volver al Detalle
            </Link>
        </div>
    );
};

export default VehiculoEditPage;