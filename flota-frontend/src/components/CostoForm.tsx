// src/components/CostoForm.tsx

import { useState, useEffect } from 'react'; 
import { AxiosError } from 'axios'; 
import type { NewCostoInput } from '../api/models/vehiculos';
import { createCostoItem } from '../api/vehiculos'; 
import { normalizePatente } from '../utils/data-utils';
import type { FastAPIErrorResponse, ValidationErrorDetail } from '../api/models/errors'; 
import { apiClient } from '../api/vehiculos'; 
import type { GastoUnificado } from '../api/models/gastos';

interface CostoFormProps {
    initialPatente?: string; 
    initialGasto?: GastoUnificado | null; 
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

const CostoForm = ({ initialPatente, initialGasto, onSuccess }: CostoFormProps) => {
    const [formData, setFormData] = useState<NewCostoInput>(defaultFormData);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);
    const [file, setFile] = useState<File | null>(null); 

    useEffect(() => {
        if (initialPatente) {
            setFormData(prev => ({ ...prev, patente: normalizePatente(initialPatente) }));
        }
    }, [initialPatente]);

    useEffect(() => {
        if (initialGasto) {
            const origenCapitalizado = initialGasto.origen === 'mantenimiento' ? 'Mantenimiento' : initialGasto.origen === 'finanzas' ? 'Finanzas' : 'Mantenimiento'; 
            setFormData({
                patente: initialGasto.patente || normalizePatente(initialPatente || ''),
                tipo_costo: initialGasto.tipo || 'Reparación Menor',
                fecha: initialGasto.fecha.split('T')[0] || '',
                descripcion: initialGasto.descripcion || '',
                importe: initialGasto.importe || 0,
                origen: origenCapitalizado
            });
        } else if (initialPatente) {
            setFormData(prev => ({ ...prev, patente: normalizePatente(initialPatente) }));
        }
    }, [initialGasto, initialPatente]);

    const tipoCostoOptions = [
        'Reparación Menor', 'Reparación Mayor', 'Neumáticos', 'Batería', 'Service General',
        'Multa', 'Gasto Seguro', 'Impuesto/Patente', 'Combustible Extra', 'Otros Gastos'
    ];

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        let finalValue: string | number = value;
        if (type === 'number') finalValue = parseFloat(value) || 0;
        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        if (selectedFile && selectedFile.size > 50 * 1024 * 1024) {
            setStatusMessage({text: 'Archivo demasiado grande (máx 50MB).', type: 'error'});
            return;
        }
        setFile(selectedFile);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setStatusMessage(null);

        if (formData.importe <= 0) {
            setStatusMessage({text: 'El importe debe ser mayor a 0.', type: 'error'});
            setIsLoading(false);
            return;
        }

        try {
            if (initialGasto) {
                const formDataToSend = new FormData();
                formDataToSend.append('patente', formData.patente);
                formDataToSend.append('tipo_costo', formData.tipo_costo);
                formDataToSend.append('fecha', formData.fecha);
                formDataToSend.append('descripcion', formData.descripcion);
                formDataToSend.append('importe', formData.importe.toString());
                formDataToSend.append('origen', formData.origen);
                if (file) formDataToSend.append('comprobante', file);

                await apiClient.put(`/costos/manual/${initialGasto.id}`, formDataToSend, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            } else {
                await createCostoItem(formData, file || null);
            }

            setStatusMessage({
                text: file ? `Costo ${initialGasto ? 'actualizado' : 'registrado'}! Comprobante subido` : `Costo ${initialGasto ? 'actualizado' : 'registrado'} correctamente!`,
                type: 'success'
            });

            setFormData(defaultFormData);
            setFile(null);
            onSuccess();
        } catch (err) {
            const error = err as AxiosError<FastAPIErrorResponse>;
            let errorMsg = 'Error desconocido al registrar el costo.';
            if (error.response) {
                const details = error.response.data?.detail;
                if (Array.isArray(details)) errorMsg = details.map((d: ValidationErrorDetail) => `${d.loc.join(' → ')}: ${d.msg}`).join('; ');
                else if (typeof details === 'string') errorMsg = details;
                else if (details === undefined) errorMsg = `Error del servidor (${error.response.status})`;
            } else if (error.request) {
                errorMsg = 'No se pudo conectar al servidor.';
            } else {
                errorMsg = error.message;
            }
            setStatusMessage({text: errorMsg, type: 'error'});
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {initialGasto ? 'Editar Gasto Registrado' : 'Registrar Nuevo Gasto'}
            </h3>
            
            {statusMessage && (
                <div className={`p-4 rounded-lg font-medium mb-6 ${statusMessage.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50'}`}>
                    {statusMessage.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {!initialPatente && (
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Patente Vehículo</label>
                        <input type="text" name="patente" value={formData.patente} onChange={handleChange} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tipo de Gasto</label>
                    <select name="tipo_costo" value={formData.tipo_costo} onChange={handleChange} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {tipoCostoOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                </div>
                
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Fecha del Gasto</label>
                    <input type="date" name="fecha" value={formData.fecha} onChange={handleChange} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Importe Total ($)</label>
                    <input type="number" name="importe" value={formData.importe || ''} onChange={handleChange} required min="0.01" step="0.01" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                
                <div className="space-y-2 md:col-span-2"> 
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Descripción Detallada</label>
                    <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} required rows={3} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">Comprobante Digital <span className="font-normal text-slate-500">(Opcional, máx 50MB)</span></label>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-700 dark:file:text-slate-200 cursor-pointer" />
                    {file && <p className="text-xs text-slate-500 mt-2">Archivo seleccionado: {file.name}</p>}
                </div>
                
                <div className="md:col-span-2 flex justify-end mt-2">
                    <button type="submit" disabled={isLoading} className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-all focus:ring-4 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLoading ? 'Procesando...' : initialGasto ? 'Guardar Cambios' : 'Registrar Gasto'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CostoForm;