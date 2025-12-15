import { useState, useEffect } from 'react'; 
//import type { FormEvent } from 'react';
import axios, { AxiosError } from 'axios';  // Para tipado de error
import { API_BASE } from '../api/vehiculos';
import type { NewCostoInput } from '../api/models/vehiculos';
//import { createCostoItem } from '../api/vehiculos';  // ← Esta función debe actualizarse para aceptar FormData | NewCostoInput (ver nota al final)
import { normalizePatente } from '../utils/data-utils.ts';
import type { FastAPIErrorResponse, ValidationErrorDetail } from '../api/models/errors';  // Ajusta path

interface CostoFormProps {
    initialPatente?: string; 
    onSuccess: () => void;
}

const defaultFormData: NewCostoInput = {
    patente: '',
    tipo_costo: 'Reparación Menor', 
    fecha: new Date().toISOString().split('T')[0], 
    descripcion: '',
    importe: 0,
    origen: 'Mantenimiento', 
};

/**
 * Formulario para registrar costos manuales, con soporte para comprobante digital opcional.
 * @param {CostoFormProps} props - Propiedades del componente.
 */
const CostoForm = ({ initialPatente, onSuccess }: CostoFormProps) => {
    const [formData, setFormData] = useState<NewCostoInput>(defaultFormData);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);  // Estado para el recibo digital (opcional)

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
        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        if (selectedFile && selectedFile.size > 50 * 1024 * 1024) {
            setStatusMessage('Error: Archivo demasiado grande (máx 50MB).');
            return;
        }
        setFile(selectedFile);
    };

    /**
    ** Maneja el envío del formulario con validación completa y llamada a API.
    **/
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {  // Tipado preciso
        e.preventDefault();
        setIsLoading(true);
        setStatusMessage(null);

        // Construye FormData para multipart (soporta file)
        const submitData = new FormData();
        submitData.append('patente', formData.patente);  // formData es tu state: NewCostoInput
        submitData.append('tipo_costo', formData.tipo_costo);
        submitData.append('fecha', formData.fecha);
        submitData.append('descripcion', formData.descripcion);
        submitData.append('importe', formData.importe.toString());  // Float → string para Form
        submitData.append('origen', formData.origen);
        if (file) {
            submitData.append('comprobante', file);  // File blob
        }

        try {
            // Usa apiClient si existe, o axios directo (mejor práctica: instancia configurada)
            const response = await axios.post(`${API_BASE}/costos/manual`, submitData, {
                headers: { 'Content-Type': 'multipart/form-data' }  // Axios lo setea auto, pero explícito OK
            });

            // Opcional: Usa response.data (e.g., file_id para feedback)
            console.log('Respuesta:', response.data);  // Ej: { message, costo_id, file_id }

            setStatusMessage('✅ Costo registrado correctamente!');
            setFormData(defaultFormData);  // Reset form (buena UX)
            setFile(null);
            onSuccess();  // Refresca lista
        } catch (err) {
            const error = err as AxiosError<FastAPIErrorResponse>;  // Tipado preciso: sin any
            let errorMsg = 'Error desconocido al registrar el costo.';

            if (error.response) {
                const details = error.response.data?.detail;

                if (Array.isArray(details)) {
                    // details: ValidationErrorDetail[]
                    errorMsg = details
                        .map((d: ValidationErrorDetail) => 
                            `${d.loc.join(' → ')}: ${d.msg}`  // Formato legible: "body → importe: Valor debe ser >0"
                        )
                        .join('; ');
                } else if (typeof details === 'string') {
                    errorMsg = details;
                } else if (details === undefined) {
                    errorMsg = `Error del servidor (${error.response.status})`;
                }

                errorMsg = `❌ ${errorMsg}`;
            } else if (error.request) {
                errorMsg = '❌ No se pudo conectar al servidor (verifique su conexión)';
            } else {
                errorMsg = `❌ ${error.message}`;
            }

            console.error('Error detallado:', error);
            setStatusMessage(errorMsg);
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
                    backgroundColor: statusMessage.startsWith('✅') || statusMessage.startsWith('📎') ? '#d4edda' : '#f8d7da',
                    color: statusMessage.startsWith('✅') || statusMessage.startsWith('📎') ? '#155724' : '#721c24',
                    border: `1px solid ${statusMessage.startsWith('✅') || statusMessage.startsWith('📎') ? '#c3e6cb' : '#f5c6cb'}`
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
                
                {/* Campo de Patente: SOLO SE MUESTRA SI NO HAY initialPatente (SE MANTIENE) */}
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

                {/* NUEVO: Campo para recibo digital (opcional, ancho completo) */}
                <label style={{ display: 'block', gridColumn: '1 / -1' }}>
                    Comprobante (opcional - PDF/JPG/PNG, max 50MB):
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                    {file && <small>Archivo: {file.name}</small>}
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