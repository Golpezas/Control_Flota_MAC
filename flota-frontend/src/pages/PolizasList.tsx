// src/pages/PolizasList.tsx

import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/vehiculos';
import { Link } from 'react-router-dom';
import axios from 'axios';

// =================================================================
// ICONOS SVG CORPORATIVOS
// =================================================================
const Icons = {
    Shield: () => <svg className="w-8 h-8 text-blue-600 dark:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    Download: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
    Edit: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
    Trash: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    ArrowLeft: () => <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
};

interface Poliza {
    id: string;
    empresa: string;
    numero_poliza: string;
    filename: string;
    file_id: string;
    fecha_subida: string;
}

function isAxiosError(error: unknown): error is { response: { data: { detail?: string } } } {
    if (error == null || typeof error !== "object") return false;
    if (!("response" in error)) return false;

    const err = error as { response?: unknown };
    if (typeof err.response !== "object" || err.response == null) return false;
    if (!("data" in err.response)) return false;

    const data = (err.response as { data?: unknown }).data;
    return typeof data === "object";
}

const PolizasList: React.FC = () => {
    const [polizas, setPolizas] = useState<Poliza[]>([]);
    const [loading, setLoading] = useState(true);

    const [form, setForm] = useState({ empresa: '', numero_poliza: '', file: null as File | null });
    const [editingId, setEditingId] = useState<string | null>(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    useEffect(() => {
        cargarPolizas();
    }, []);

    const cargarPolizas = async () => {
        try {
            const res = await apiClient.get<Poliza[]>('/polizas');
            setPolizas(res.data);
        } catch (error: unknown) {
            console.error("Error al cargar pólizas:", error);
            alert("Error al cargar pólizas. Reintentá en unos segundos.");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.file && !editingId) {
            return alert("Selecciona un archivo para agregar nueva póliza");
        }

        const formData = new FormData();
        formData.append('empresa', form.empresa.trim());
        formData.append('numero_poliza', form.numero_poliza.trim());
        if (form.file) {
            formData.append('file', form.file);
        }

        try {
            if (editingId) {
                await axios.put(`${API_URL}/polizas/${editingId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            } else {
                await axios.post(`${API_URL}/polizas`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            }

            cargarPolizas();
            setForm({ empresa: '', numero_poliza: '', file: null });
            setEditingId(null);
            alert("Póliza guardada correctamente");
        } catch (error: unknown) {
            console.error("Error al guardar póliza:", error);
            let mensaje = "Error al guardar la póliza";

            if (isAxiosError(error) && error.response?.data?.detail) {
                mensaje = error.response.data.detail;
            }

            alert(mensaje);
        }
    };

    const eliminar = async (id: string) => {
        if (!confirm("¿Seguro que querés eliminar esta póliza?")) return;
        try {
            await apiClient.delete(`/polizas/${id}`);
            cargarPolizas();
        } catch (error: unknown) {
            console.error("Error al eliminar póliza:", error);
            alert("Error al eliminar la póliza");
        }
    };

    const editar = (p: Poliza) => {
        setForm({ empresa: p.empresa, numero_poliza: p.numero_poliza, file: null });
        setEditingId(p.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
            
            {/* ENCABEZADO */}
            <div className="flex items-center gap-3">
                <Icons.Shield />
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Pólizas de Seguros</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Gestión del archivo central de pólizas de la flota</p>
                </div>
            </div>

            {/* FORMULARIO DE CARGA/EDICIÓN */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8 transition-colors">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6">
                    {editingId ? '✏️ Modificar Póliza Existente' : '➕ Agregar Nueva Póliza'}
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Input Empresa */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Empresa de Seguros</label>
                            <input
                                type="text"
                                placeholder="Ej: Federación Patronal"
                                value={form.empresa}
                                onChange={e => setForm({...form, empresa: e.target.value})}
                                required
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                            />
                        </div>

                        {/* Input Número de Póliza */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Número de Póliza</label>
                            <input
                                type="text"
                                placeholder="Ej: 123456789"
                                value={form.numero_poliza}
                                onChange={e => setForm({...form, numero_poliza: e.target.value})}
                                required
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                            />
                        </div>

                        {/* Input Archivo */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Documento Digital</label>
                            <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={e => setForm({...form, file: e.target.files?.[0] || null})}
                                required={!editingId}
                                className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-700 dark:file:text-slate-200 dark:hover:file:bg-slate-600 cursor-pointer transition-colors"
                            />
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                        {editingId && (
                            <button 
                                type="button" 
                                onClick={() => { setEditingId(null); setForm({empresa: '', numero_poliza: '', file: null}); }} 
                                className="px-5 py-2.5 rounded-lg font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                        )}
                        <button 
                            type="submit" 
                            className="px-6 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm focus:ring-4 focus:ring-blue-500/50 transition-all"
                        >
                            {editingId ? 'Guardar Cambios' : 'Agregar Póliza'}
                        </button>
                    </div>
                </form>
            </div>

            {/* LISTADO DE PÓLIZAS */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                        Directorio de Pólizas <span className="text-sm font-medium text-slate-500 ml-2">({polizas.length} registros)</span>
                    </h2>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center items-center h-32">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : polizas.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                            No hay pólizas registradas en el sistema.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Empresa</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Número de Póliza</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Archivo</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                    {polizas.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-200">
                                                {p.empresa}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-700 dark:text-slate-300">
                                                {p.numero_poliza}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs">
                                                <div className="flex items-center gap-2" title={p.filename}>
                                                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                                    <span className="truncate">{p.filename}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button 
                                                        onClick={() => window.open(`${API_URL}/api/archivos/descargar/${p.file_id}`, '_blank')}
                                                        title="Descargar"
                                                        className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                    >
                                                        <Icons.Download />
                                                    </button>
                                                    <button 
                                                        onClick={() => editar(p)}
                                                        title="Editar"
                                                        className="p-2 text-amber-600 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                                                    >
                                                        <Icons.Edit />
                                                    </button>
                                                    <button 
                                                        onClick={() => eliminar(p.id)}
                                                        title="Eliminar"
                                                        className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                    >
                                                        <Icons.Trash />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* BOTÓN VOLVER */}
            <div className="pt-4">
                <Link to="/" className="inline-flex items-center text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
                    <Icons.ArrowLeft /> Volver al Dashboard
                </Link>
            </div>
        </div>
    );
};

export default PolizasList;