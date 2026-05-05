// Control_Flota\flota-frontend\src\components\VehiculoForm.tsx

import React, { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Vehiculo, VehiculoInput, VehiculoUpdateInput } from '../api/models/vehiculos'; 
import { createVehiculo, updateVehiculo } from '../api/vehiculos';

interface VehiculoFormProps {
    onSuccess: (patenteCreada?: string) => void;
    initialData?: Vehiculo; 
    isEditMode?: boolean;   
}

const defaultFormData: VehiculoInput = { 
    patente: '',
    activo: true,
    anio: null,
    color: null,
    
    // --- NUEVOS CAMPOS ---
    marca: '',
    modelo: '',
    tipo: '',
    
    descripcion_modelo: null,
    nro_movil: null,
    tipo_combustible: 'Nafta',
};

const VehiculoForm: React.FC<VehiculoFormProps> = ({ onSuccess, initialData, isEditMode = false }) => {
    const [formData, setFormData] = useState<VehiculoInput>(defaultFormData);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null); 
    const [isLegacy, setIsLegacy] = useState(false);

    useEffect(() => {
        if (isEditMode && initialData) {
            const legacyData = initialData as unknown as Record<string, unknown>;
            // Evaluamos si el vehículo viene con el formato viejo (sin marca)
            const legacyDesc = initialData.descripcion_modelo || (legacyData['DESCRIPCION_MODELO'] as string | null);
            const hasNewFormat = !!(initialData.marca || (legacyData['MARCA'] as string | null));
            
            setIsLegacy(!hasNewFormat);

            setFormData({
                patente: initialData._id, 
                activo: initialData.activo,
                anio: initialData.anio || (legacyData['ANIO'] as number | null),
                color: initialData.color || (legacyData['COLOR'] as string | null),
                
                // --- MAPEO DE NUEVOS CAMPOS ---
                marca: initialData.marca || (legacyData['MARCA'] as string | null) || '',
                // Si es legacy, autocompletamos 'modelo' con la descripción vieja para facilitar la edición
                modelo: initialData.modelo || (legacyData['MODELO'] as string | null) || (!hasNewFormat ? legacyDesc : ''),
                tipo: initialData.tipo || (legacyData['TIPO'] as string | null) || '',
                
                descripcion_modelo: legacyDesc,
                nro_movil: initialData.nro_movil || (legacyData['NRO_MOVIL'] as string | null),
                tipo_combustible: initialData.tipo_combustible || (legacyData['TIPO_COMBUSTIBLE'] as string | null),
            });
        } else {
            setFormData(defaultFormData);
            setIsLegacy(false);
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
            setStatusMessage('❌ Error: La patente es obligatoria.');
            setIsLoading(false);
            return;
        }

        // Validación de nuevos campos obligatorios
        if (!formData.marca || !formData.modelo || !formData.tipo) {
            setStatusMessage('❌ Error: La Marca, Modelo y Tipo son obligatorios.');
            setIsLoading(false);
            return;
        }
        
        const patenteId = formData.patente; 

        try {
            if (isEditMode) {
                const updatePayload: VehiculoUpdateInput = {
                    activo: formData.activo,
                    anio: formData.anio,
                    color: formData.color,
                    marca: formData.marca,
                    modelo: formData.modelo,
                    tipo: formData.tipo,
                    // Opcional: Podrías enviar descripcion_modelo como null para limpiar el registro legacy en Mongo
                    descripcion_modelo: formData.descripcion_modelo, 
                    nro_movil: formData.nro_movil,
                    tipo_combustible: formData.tipo_combustible,
                };
                
                await updateVehiculo(patenteId, updatePayload); 
                setStatusMessage(`✅ Vehículo ${patenteId} actualizado con éxito.`);
                
            } else {
                await createVehiculo(formData);
                setStatusMessage(`✅ Vehículo ${patenteId} creado con éxito.`);
                setFormData(defaultFormData); 
            }
            
            onSuccess(patenteId); 

        } catch (error: unknown) {
            const action = isEditMode ? 'actualizar' : 'crear';
            const message = error instanceof Error ? error.message : 'Error desconocido.';
            setStatusMessage(`❌ Error al ${action}: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '5px', marginBottom: '20px', backgroundColor: '#fff' }}>
            <h3 style={{ color: '#1D3557' }}>{isEditMode ? `Editando Vehículo (${formData.patente})` : 'Crear Nuevo Vehículo'}</h3>
        
            {statusMessage && (
                <p style={{ color: statusMessage.startsWith('❌') ? 'red' : 'green', fontWeight: 'bold' }}>{statusMessage}</p>
            )}

            {/* AVISO LEGACY UX */}
            {isEditMode && isLegacy && (
                <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '12px', borderRadius: '5px', marginBottom: '15px', border: '1px solid #ffeeba' }}>
                    <strong>⚠️ Formato Antiguo Detectado:</strong> Este vehículo usaba el formato unificado para modelo ({formData.descripcion_modelo}). Por favor, asigne la Marca, ajuste el Modelo y seleccione el Tipo de vehículo.
                </div>
            )}
        
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <label>
                    Patente*:
                    <input 
                        type="text" 
                        name="patente" 
                        value={formData.patente} 
                        onChange={handleChange} 
                        required 
                        disabled={isEditMode} 
                        style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: isEditMode ? '#eee' : 'white' }}
                    />
                </label>
                <label>
                    Número Móvil:
                    <input type="text" name="nro_movil" value={formData.nro_movil || ''} onChange={handleChange} style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #ccc' }} />
                </label>
                
                {/* --- NUEVOS CAMPOS DESGLOSADOS --- */}
                <label>
                    Marca*:
                    <input type="text" name="marca" placeholder="Ej. Renault" value={formData.marca || ''} onChange={handleChange} required style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #ccc' }} />
                </label>
                <label>
                    Modelo Específico*:
                    <input type="text" name="modelo" placeholder="Ej. Clio 2.3" value={formData.modelo || ''} onChange={handleChange} required style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #ccc' }} />
                </label>
                <label>
                    Tipo*:
                    <select name="tipo" value={formData.tipo || ''} onChange={handleChange} required style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #ccc' }}>
                        <option value="">Seleccionar...</option>
                        <option value="Auto">Auto</option>
                        <option value="Pick-up">Pick-up</option>
                        <option value="Utilitario">Utilitario</option>
                        <option value="Moto">Moto</option>
                        <option value="Camión">Camión</option>
                        <option value="Otro">Otro</option>
                    </select>
                </label>
                {/* --------------------------------- */}

                <label>
                    Año:
                    <input type="number" name="anio" value={formData.anio || ''} onChange={handleChange} style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #ccc' }} />
                </label>
                <label>
                    Color:
                    <input type="text" name="color" value={formData.color || ''} onChange={handleChange} style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #ccc' }} />
                </label>
                <label>
                    Combustible:
                    <select name="tipo_combustible" value={formData.tipo_combustible || ''} onChange={handleChange} style={{ padding: '8px', width: '90%', borderRadius: '4px', border: '1px solid #ccc' }}>
                        <option value="Nafta">Nafta</option>
                        <option value="Diesel">Diesel</option>
                        <option value="GNC">GNC</option>
                        <option value="Electrico">Eléctrico</option>
                    </select>
                </label>
                <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                    <strong>Activo en Operación:</strong>
                    <input type="checkbox" name="activo" checked={formData.activo} onChange={handleChange} style={{ margin: '0 10px', transform: 'scale(1.5)' }} />
                </label>
            </div>

            <button type="submit" disabled={isLoading} style={{ padding: '10px 20px', marginTop: '20px', fontWeight: 'bold', backgroundColor: '#457B9D', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                {isLoading ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Crear Vehículo')}
            </button>
        </form>
    );
};

export default VehiculoForm;