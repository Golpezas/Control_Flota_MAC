// src/components/CostoForm.tsx (VERSIÓN CORREGIDA PARA OCULTAR PATENTE EN MODO DETALLE)

import { useState, useEffect } from 'react'; 
import type { FormEvent } from 'react';
import type { NewCostoInput } from '../api/models/vehiculos';
import { createCostoItem } from '../api/vehiculos';
import { normalizePatente } from '../utils/data-utils.ts';

// Propiedades del formulario de Costos
interface CostoFormProps {
    initialPatente?: string; 
    onSuccess: () => void;
}

// Valores iniciales por defecto para el formulario
const defaultFormData: NewCostoInput = {
    patente: '',
    tipo_costo: 'Reparación Menor', 
    fecha: new Date().toISOString().split('T')[0], 
    descripcion: '',
    importe: 0,
    origen: 'Mantenimiento', 
};

const CostoForm = ({ initialPatente, onSuccess }: CostoFormProps) => {
    const [formData, setFormData] = useState<NewCostoInput>(defaultFormData);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // Prellenar patente si se proporciona (y actualizar origen basado en tipo)
    useEffect(() => {
        if (initialPatente) {
            setFormData(prev => ({
                ...prev,
                patente: normalizePatente(initialPatente),
            }));
        }
    }, [initialPatente]);

    const tipoCostoOptions = [
        'Reparación Menor', 'Reparación Mayor', 'Neumáticos', 'Batería', 'Service General',
        'Multa', 'Gasto Seguro', 'Impuesto/Patente',
        'Combustible Extra', 'Otros Gastos'
    ];

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        let finalValue: string | number = value;
        if (type === 'number') {
            finalValue = parseFloat(value) || 0;
        }

        setFormData(prev => ({
            ...prev,
            [name]: finalValue
        }));
        
        // Lógica de asignación automática de origen
        if (name === 'tipo_costo') {
            const newOrigen = ['Multa', 'Gasto Seguro', 'Impuesto/Patente'].includes(value) ? 'Finanzas' : 'Mantenimiento';
            setFormData(prev => ({ ...prev, origen: newOrigen as 'Finanzas' | 'Mantenimiento' }));
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        
        // Validación ajustada: Si initialPatente existe, ignora la validación de patente (ya está seteada)
        if ((!initialPatente && !formData.patente) || formData.importe <= 0 || !formData.descripcion) {
            setStatusMessage('Error: Asegúrese de ingresar Patente (si aplica), Importe (>0) y Descripción.');
            return;
        }

        setIsLoading(true);
        setStatusMessage(null);

        try {
            const dataToSend: NewCostoInput = {
                ...formData,
                patente: normalizePatente(formData.patente), 
                fecha: new Date(formData.fecha).toISOString(), 
            };
            
            await createCostoItem(dataToSend);
            
            setStatusMessage(`✅ Costo de $${formData.importe.toFixed(2)} registrado con éxito para ${formData.patente}.`);
            setFormData(initialPatente ? { ...defaultFormData, patente: normalizePatente(initialPatente) } : defaultFormData);
            onSuccess();
            
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Error desconocido al registrar el costo.';
            setStatusMessage(`❌ Error: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', background: '#fff' }}>
            <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                💸 Registrar Nuevo Gasto Manual ({formData.origen})
            </h3>
            
            {statusMessage && (
                <p style={{ 
                    padding: '10px', 
                    borderRadius: '5px', 
                    marginBottom: '15px',
                    backgroundColor: statusMessage.startsWith('✅') ? '#d4edda' : '#f8d7da',
                    color: statusMessage.startsWith('✅') ? '#155724' : '#721c24',
                    border: `1px solid ${statusMessage.startsWith('✅') ? '#c3e6cb' : '#f5c6cb'}`
                }}>
                    {statusMessage}
                </p>
            )}

            {/* Formulario responsive: Auto-ajuste a 1 o 2 columnas */}
            <form onSubmit={handleSubmit} style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                gap: '15px' 
            }}>
                
                {/* Campo de Patente: SOLO SE MUESTRA SI NO HAY initialPatente */}
                {!initialPatente && (
                    <label style={{ display: 'block' }}>
                        Patente:
                        <input 
                            type="text" 
                            name="patente" 
                            value={formData.patente} 
                            onChange={handleChange} 
                            required 
                            style={{ padding: '8px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} 
                        />
                    </label>
                )}

                {/* 1. Tipo de Gasto */}
                <label style={{ display: 'block' }}>
                    Tipo de Gasto:
                    <select 
                        name="tipo_costo" 
                        value={formData.tipo_costo} 
                        onChange={handleChange} 
                        required
                        style={{ padding: '8px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                    >
                        {tipoCostoOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </label>
                
                {/* 2. Fecha */}
                <label style={{ display: 'block' }}>
                    Fecha del Gasto:
                    <input 
                        type="date" 
                        name="fecha" 
                        value={formData.fecha} 
                        onChange={handleChange} 
                        required 
                        style={{ padding: '8px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} 
                    />
                </label>

                {/* 3. Importe */}
                <label style={{ display: 'block' }}>
                    Importe ($):
                    <input 
                        type="number" 
                        name="importe" 
                        value={formData.importe || ''} 
                        onChange={handleChange} 
                        required 
                        min="0.01"
                        step="0.01"
                        style={{ padding: '8px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} 
                    />
                </label>
                
                {/* 4. Descripción (Ocupa el ancho completo) */}
                <label style={{ display: 'block', gridColumn: '1 / -1' }}> 
                    Descripción Detallada:
                    <textarea 
                        name="descripcion" 
                        value={formData.descripcion} 
                        onChange={handleChange} 
                        required
                        rows={3}
                        style={{ padding: '8px', width: '99%', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical', boxSizing: 'border-box' }} 
                    />
                </label>
                
                {/* Botón de envío (Ocupa el ancho completo) */}
                <button 
                    type="submit" 
                    disabled={isLoading} 
                    style={{ 
                        gridColumn: '1 / -1', 
                        padding: '10px 15px', 
                        marginTop: '15px', 
                        fontWeight: 'bold',
                        backgroundColor: '#E63946', 
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    {isLoading ? 'Registrando...' : '💾 Guardar Gasto'}
                </button>

            </form>
        </div>
    );
};

export default CostoForm;