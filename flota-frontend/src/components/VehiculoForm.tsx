// Control_Flota\flota-frontend\src\components\VehiculoForm.tsx

import React, { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Vehiculo, VehiculoInput, VehiculoUpdateInput } from '../api/models/vehiculos'; 
import { createVehiculo, updateVehiculo } from '../api/vehiculos';

// Propiedades adaptadas para el modo Edición/Creación
interface VehiculoFormProps {
    onSuccess: (patenteCreada?: string) => void; // Acepta la patente como argumento opcional
    initialData?: Vehiculo; 
    isEditMode?: boolean;   
}

const defaultFormData: VehiculoInput = { 
    patente: '',
    activo: true,
    anio: null,
    color: null,
    descripcion_modelo: null,
    nro_movil: null,
    tipo_combustible: 'Nafta',
};

const VehiculoForm: React.FC<VehiculoFormProps> = ({ onSuccess, initialData, isEditMode = false }) => {
    const [formData, setFormData] = useState<VehiculoInput>(defaultFormData);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null); 

    useEffect(() => {
        if (isEditMode && initialData) {
            setFormData({
                patente: initialData._id, 
                activo: initialData.activo,
                anio: initialData.anio,
                color: initialData.color,
                descripcion_modelo: initialData.descripcion_modelo,
                nro_movil: initialData.nro_movil,
                tipo_combustible: initialData.tipo_combustible,
            });
        } else {
            setFormData(defaultFormData);
        }
    }, [isEditMode, initialData]); 

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
                     type === 'number' ? (value ? parseInt(value) : null) : 
                     (value === '' ? null : value);
    
        setFormData(prev => ({ ...prev, [name]: newValue }));
    };

  
    const handleSubmit = async (_e: FormEvent) => {
        _e.preventDefault(); 

        setIsLoading(true);
        setStatusMessage(null);
        
        if (!formData.patente || formData.patente.trim() === '') {
            setStatusMessage('Error: La patente es obligatoria.');
            setIsLoading(false);
            return;
        }
        
        const patenteId = formData.patente; 

        try {
            if (isEditMode) {
                // Lógica para ACTUALIZAR (PUT)
                const updatePayload: VehiculoUpdateInput = {
                    activo: formData.activo,
                    anio: formData.anio,
                    color: formData.color,
                    descripcion_modelo: formData.descripcion_modelo,
                    nro_movil: formData.nro_movil,
                    tipo_combustible: formData.tipo_combustible,
                };
                
                await updateVehiculo(patenteId, updatePayload); 
                setStatusMessage(`✅ Vehículo ${patenteId} actualizado con éxito.`);
                
            } else {
                // Lógica para CREAR (POST)
                await createVehiculo(formData);
                setStatusMessage(`✅ Vehículo ${patenteId} creado con éxito.`);
                setFormData(defaultFormData); 
            }
            
            // 2. Pasamos la patente a la función onSuccess para saber a dónde redirigir
            onSuccess(patenteId); // 👈 CAMBIO AQUÍ

        } catch (error: unknown) {
            const action = isEditMode ? 'actualizar' : 'crear';
            const message = error instanceof Error ? error.message : 'Error desconocido.';
            setStatusMessage(`❌ Error al ${action}: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '5px', marginBottom: '20px' }}>
            <h3>{isEditMode ? `Editando Vehículo (${formData.patente})` : 'Crear Nuevo Vehículo'}</h3>
        
            {statusMessage && (
                <p style={{ color: statusMessage.startsWith('❌') ? 'red' : 'green', fontWeight: 'bold' }}>{statusMessage}</p>
            )}
        
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                    Patente*:
                    <input 
                        type="text" 
                        name="patente" 
                        value={formData.patente} 
                        onChange={handleChange} 
                        required 
                        disabled={isEditMode} 
                        style={{ padding: '5px', width: '90%', backgroundColor: isEditMode ? '#eee' : 'white' }}
                    />
                </label>
                <label>
                    Número Móvil:
                    <input type="text" name="nro_movil" value={formData.nro_movil || ''} onChange={handleChange} style={{ padding: '5px', width: '90%' }} />
                </label>
                <label>
                    Modelo/Descripción:
                    <input type="text" name="descripcion_modelo" value={formData.descripcion_modelo || ''} onChange={handleChange} style={{ padding: '5px', width: '90%' }} />
                </label>
                <label>
                    Año:
                    <input type="number" name="anio" value={formData.anio || ''} onChange={handleChange} style={{ padding: '5px', width: '90%' }} />
                </label>
                <label>
                    Color:
                    <input type="text" name="color" value={formData.color || ''} onChange={handleChange} style={{ padding: '5px', width: '90%' }} />
                </label>
                <label>
                    Combustible:
                    <select name="tipo_combustible" value={formData.tipo_combustible || ''} onChange={handleChange} style={{ padding: '5px', width: '90%' }}>
                        <option value="Nafta">Nafta</option>
                        <option value="Diesel">Diesel</option>
                        <option value="GNC">GNC</option>
                        <option value="Electrico">Eléctrico</option>
                    </select>
                </label>
                <label style={{ gridColumn: 'span 2' }}>
                    Activo:
                    <input type="checkbox" name="activo" checked={formData.activo} onChange={handleChange} style={{ margin: '0 10px' }} />
                </label>
            </div>

            <button type="submit" disabled={isLoading} style={{ padding: '8px 15px', marginTop: '15px', fontWeight: 'bold' }}>
                {isLoading ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Crear Vehículo')}
            </button>
        </form>
    );
};

export default VehiculoForm;