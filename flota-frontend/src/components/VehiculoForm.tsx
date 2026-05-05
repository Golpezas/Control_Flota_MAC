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
            const legacyData = initialData as Vehiculo & Record<string, unknown>;
            const legacyDesc = initialData.descripcion_modelo ?? (legacyData.DESCRIPCION_MODELO as string | null) ?? null;
            const hasNewFormat = !!(initialData.marca || (legacyData.MARCA as string));
            
            setIsLegacy(!hasNewFormat);

            setFormData({
                patente: initialData._id,
                activo: initialData.activo,
                anio: initialData.anio ?? (legacyData.ANIO as number | null) ?? null,
                color: initialData.color ?? (legacyData.COLOR as string | null) ?? null,
                
                marca: initialData.marca ?? (legacyData.MARCA as string) ?? '',
                modelo: initialData.modelo ?? (legacyData.MODELO as string) ?? (!hasNewFormat ? legacyDesc : ''),
                tipo: initialData.tipo ?? (legacyData.TIPO as string) ?? '',
                
                descripcion_modelo: legacyDesc,
                nro_movil: initialData.nro_movil ?? (legacyData.NRO_MOVIL as string | null) ?? null,
                tipo_combustible: initialData.tipo_combustible ?? (legacyData.TIPO_COMBUSTIBLE as string) ?? 'Nafta',
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

    // Estilo base para los inputs para no repetir código
    const inputStyle = { 
        padding: '8px', 
        width: '90%', 
        borderRadius: '4px', 
        border: '1px solid #ccc', 
        backgroundColor: 'white',
        color: '#1e293b' // <-- COLOR OSCURO FORZADO PARA EL TEXTO
    };

    return (
        // Se añade color: '#1e293b' al form para que las labels también sean oscuras
        <form onSubmit={handleSubmit} style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '5px', marginBottom: '20px', backgroundColor: '#fff', color: '#1e293b' }}>
            <h3 style={{ color: '#1D3557', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>
                {isEditMode ? `Editando Vehículo (${formData.patente})` : 'Crear Nuevo Vehículo'}
            </h3>
        
            {statusMessage && (
                <p style={{ color: statusMessage.startsWith('❌') ? '#d93025' : '#0f9d58', fontWeight: 'bold', padding: '10px', backgroundColor: statusMessage.startsWith('❌') ? '#fce8e6' : '#e6f4ea', borderRadius: '4px' }}>
                    {statusMessage}
                </p>
            )}

            {isEditMode && isLegacy && (
                <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '12px', borderRadius: '5px', marginBottom: '15px', border: '1px solid #ffeeba' }}>
                    <strong>⚠️ Formato Antiguo Detectado:</strong> Este vehículo usaba el formato unificado para modelo ({formData.descripcion_modelo}). Por favor, asigne la Marca, ajuste el Modelo y seleccione el Tipo de vehículo.
                </div>
            )}
        
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <label style={{ fontWeight: 'bold' }}>
                    Patente*:
                    <br/>
                    <input 
                        type="text" 
                        name="patente" 
                        value={formData.patente} 
                        onChange={handleChange} 
                        required 
                        disabled={isEditMode} 
                        style={{ ...inputStyle, backgroundColor: isEditMode ? '#f1f5f9' : 'white', marginTop: '5px' }}
                    />
                </label>
                <label style={{ fontWeight: 'bold' }}>
                    Número Móvil:
                    <br/>
                    <input type="text" name="nro_movil" value={formData.nro_movil || ''} onChange={handleChange} style={{ ...inputStyle, marginTop: '5px' }} />
                </label>
                
                <label style={{ fontWeight: 'bold' }}>
                    Marca*:
                    <br/>
                    <input type="text" name="marca" placeholder="Ej. Renault" value={formData.marca || ''} onChange={handleChange} required style={{ ...inputStyle, marginTop: '5px' }} />
                </label>
                <label style={{ fontWeight: 'bold' }}>
                    Modelo Específico*:
                    <br/>
                    <input type="text" name="modelo" placeholder="Ej. Clio 2.3" value={formData.modelo || ''} onChange={handleChange} required style={{ ...inputStyle, marginTop: '5px' }} />
                </label>
                <label style={{ fontWeight: 'bold' }}>
                    Tipo*:
                    <br/>
                    <select name="tipo" value={formData.tipo || ''} onChange={handleChange} required style={{ ...inputStyle, marginTop: '5px' }}>
                        <option value="">Seleccionar...</option>
                        <option value="Auto">Auto</option>
                        <option value="Pick-up">Pick-up</option>
                        <option value="Utilitario">Utilitario</option>
                        <option value="Moto">Moto</option>
                        <option value="Camión">Camión</option>
                        <option value="Otro">Otro</option>
                    </select>
                </label>

                <label style={{ fontWeight: 'bold' }}>
                    Año:
                    <br/>
                    <input type="number" name="anio" value={formData.anio || ''} onChange={handleChange} style={{ ...inputStyle, marginTop: '5px' }} />
                </label>
                <label style={{ fontWeight: 'bold' }}>
                    Color:
                    <br/>
                    <input type="text" name="color" value={formData.color || ''} onChange={handleChange} style={{ ...inputStyle, marginTop: '5px' }} />
                </label>
                <label style={{ fontWeight: 'bold' }}>
                    Combustible:
                    <br/>
                    <select name="tipo_combustible" value={formData.tipo_combustible || ''} onChange={handleChange} style={{ ...inputStyle, marginTop: '5px' }}>
                        <option value="Nafta">Nafta</option>
                        <option value="Diesel">Diesel</option>
                        <option value="GNC">GNC</option>
                        <option value="Electrico">Eléctrico</option>
                    </select>
                </label>
                <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', marginTop: '10px', fontWeight: 'bold', color: '#1D3557' }}>
                    Activo en Operación:
                    <input type="checkbox" name="activo" checked={formData.activo} onChange={handleChange} style={{ marginLeft: '10px', transform: 'scale(1.5)' }} />
                </label>
            </div>

            <button type="submit" disabled={isLoading} style={{ padding: '10px 20px', marginTop: '25px', fontWeight: 'bold', backgroundColor: '#457B9D', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '100%' }}>
                {isLoading ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Crear Vehículo')}
            </button>
        </form>
    );
};

export default VehiculoForm;