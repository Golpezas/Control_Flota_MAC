// src/pages/PolizasList.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { apiClient, fetchVehiculos } from '../api/vehiculos';
import type { Vehiculo } from '../api/models/vehiculos';
import { Link } from 'react-router-dom';
import axios from 'axios';

// =================================================================
// TIPOS Y UTILIDADES
// =================================================================
type VehiculoLegacy = Partial<{
    MARCA: string;
    MODELO: string;
    DESCRIPCION_MODELO: string;
    NRO_MOVIL: string | number;
}>;

// NUEVA INTERFAZ PARA CORREGIR EL "ANY" DE ESLINT
interface DocumentoSeguro {
    tipo: string;
    suma_asegurada?: number;
    costo_mensual?: number;
    costo_semestral?: number;
    monto_franquicia?: number;
}

const getLegacy = (v: Vehiculo): VehiculoLegacy => v as unknown as VehiculoLegacy;

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
};

interface Poliza {
    id: string;
    empresa: string;
    numero_poliza: string;
    filename: string;
    file_id: string;
    fecha_subida: string;
}

interface CostoPoliza {
    patente: string;
    nro_movil: string | number;
    modelo: string;
    suma_asegurada: number;
    costo_mensual: number;
    costo_semestral: number;
    monto_franquicia: number;
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

// =================================================================
// ICONOS SVG
// =================================================================
const Icons = {
    Shield: () => <svg className="w-8 h-8 text-blue-600 dark:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    Download: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
    Edit: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
    Trash: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    ArrowLeft: () => <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
};

const PolizasList: React.FC = () => {
    // ESTADOS GENERALES
    const [activeTab, setActiveTab] = useState<'archivos' | 'costos'>('archivos');
    const [loading, setLoading] = useState(true);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    // ESTADOS TAB 1: ARCHIVOS
    const [polizas, setPolizas] = useState<Poliza[]>([]);
    const [form, setForm] = useState({ empresa: '', numero_poliza: '', file: null as File | null });
    const [editingId, setEditingId] = useState<string | null>(null);

    // ESTADOS TAB 2: COSTOS DE VEHÍCULOS
    const [vehiculosCostos, setVehiculosCostos] = useState<CostoPoliza[]>([]);
    const [searchCostos, setSearchCostos] = useState('');
    const [modalCostosData, setModalCostosData] = useState<CostoPoliza | null>(null);
    const [isSavingCosto, setIsSavingCosto] = useState(false);

    // CARGA INICIAL
    useEffect(() => {
        const loadAllData = async () => {
            setLoading(true);
            try {
                // 1. Cargar Archivos PDF
                const resPolizas = await apiClient.get<Poliza[]>('/polizas');
                setPolizas(resPolizas.data);

                // 2. Cargar Vehículos y mapear Costos
                const vehiculosData = await fetchVehiculos();
                const mappedCostos: CostoPoliza[] = vehiculosData.filter(v => v.activo).map(v => {
                    const legacy = getLegacy(v);
                    const marca = v.marca || legacy.MARCA || '';
                    const modelo = v.modelo || legacy.MODELO || v.descripcion_modelo || legacy.DESCRIPCION_MODELO || 'Sin Modelo';
                    
                    // CORRECCIÓN DEL ANY USANDO LA NUEVA INTERFAZ
                    const seguroDoc = v.documentos_digitales?.find(
                        d => d.tipo === 'SEGURO' || d.tipo === 'Poliza_Detalle'
                    ) as unknown as DocumentoSeguro | undefined;

                    return {
                        patente: v._id,
                        nro_movil: v.nro_movil ?? legacy.NRO_MOVIL ?? 'N/A',
                        modelo: `${marca} ${modelo}`.trim(),
                        suma_asegurada: Number(seguroDoc?.suma_asegurada || 0),
                        costo_mensual: Number(seguroDoc?.costo_mensual || 0),
                        costo_semestral: Number(seguroDoc?.costo_semestral || 0),
                        monto_franquicia: Number(seguroDoc?.monto_franquicia || 0),
                    };
                });
                setVehiculosCostos(mappedCostos);
            } catch (error) {
                console.error("Error al cargar datos:", error);
            } finally {
                setLoading(false);
            }
        };
        loadAllData();
    }, []);

    // ==========================================
    // LÓGICA TAB 1: ARCHIVOS
    // ==========================================
    const handleSubmitArchivo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.file && !editingId) return alert("Selecciona un archivo para agregar nueva póliza");

        const formData = new FormData();
        formData.append('empresa', form.empresa.trim());
        formData.append('numero_poliza', form.numero_poliza.trim());
        if (form.file) formData.append('file', form.file);

        try {
            if (editingId) {
                await axios.put(`${API_URL}/polizas/${editingId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            } else {
                await axios.post(`${API_URL}/polizas`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            }

            const res = await apiClient.get<Poliza[]>('/polizas');
            setPolizas(res.data);
            setForm({ empresa: '', numero_poliza: '', file: null });
            setEditingId(null);
            alert("Póliza guardada correctamente");
        } catch (error: unknown) {
            let mensaje = "Error al guardar la póliza";
            if (isAxiosError(error) && error.response?.data?.detail) mensaje = error.response.data.detail;
            console.error("Error en submit archivo:", error);
            alert(mensaje);
        }
    };

    const eliminarArchivo = async (id: string) => {
        if (!confirm("¿Seguro que querés eliminar esta póliza?")) return;
        try {
            await apiClient.delete(`/polizas/${id}`);
            setPolizas(polizas.filter(p => p.id !== id));
        } catch (error: unknown) {
            // CORRECCIÓN DEL UNUSED-VAR
            console.error("Error al eliminar el archivo:", error);
            alert("Error al eliminar la póliza");
        }
    };

    // ==========================================
    // LÓGICA TAB 2: COSTOS
    // ==========================================
    const filteredCostos = useMemo(() => {
        const search = searchCostos.toLowerCase();
        return vehiculosCostos.filter(c => 
            c.patente.toLowerCase().includes(search) || 
            String(c.nro_movil).toLowerCase().includes(search) ||
            c.modelo.toLowerCase().includes(search)
        );
    }, [vehiculosCostos, searchCostos]);

    const handleCostoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!modalCostosData) return;
        const { name, value } = e.target;
        const numValue = parseFloat(value) || 0;
        setModalCostosData({ ...modalCostosData, [name]: numValue });
    };

    const saveCostos = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalCostosData) return;
        setIsSavingCosto(true);

        try {
            await apiClient.put(`/polizas/vehiculo/${modalCostosData.patente}/financiero`, {
                suma_asegurada: modalCostosData.suma_asegurada,
                costo_mensual: modalCostosData.costo_mensual,
                costo_semestral: modalCostosData.costo_semestral,
                monto_franquicia: modalCostosData.monto_franquicia,
            });

            setVehiculosCostos(prev => prev.map(c => c.patente === modalCostosData.patente ? modalCostosData : c));
            setModalCostosData(null);
        } catch (error: unknown) {
            // CORRECCIÓN DEL UNUSED-VAR
            console.error("Error al guardar los costos financieros:", error);
            alert("Hubo un error al guardar los costos financieros.");
        } finally {
            setIsSavingCosto(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-10">
            
            {/* ENCABEZADO */}
            <div className="flex items-center gap-3">
                <Icons.Shield />
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Gestión de Seguros</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Archivo de pólizas y costos financieros por unidad</p>
                </div>
            </div>

            {/* PESTAÑAS (TABS) */}
            <div className="flex border-b border-slate-200 dark:border-slate-700">
                <button
                    onClick={() => setActiveTab('archivos')}
                    className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${
                        activeTab === 'archivos' 
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                    }`}
                >
                    📁 Archivos de Pólizas
                </button>
                <button
                    onClick={() => setActiveTab('costos')}
                    className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${
                        activeTab === 'costos' 
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                    }`}
                >
                    💰 Costos por Vehículo
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-40">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <>
                    {/* ======================================================= */}
                    {/* TAB 1: ARCHIVOS */}
                    {/* ======================================================= */}
                    {activeTab === 'archivos' && (
                        <div className="space-y-8 animate-fade-in">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6">
                                    {editingId ? '✏️ Modificar Archivo' : '➕ Subir Nueva Póliza General'}
                                </h2>
                                <form onSubmit={handleSubmitArchivo} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Empresa de Seguros</label>
                                            <input type="text" placeholder="Ej: Federación Patronal" value={form.empresa} onChange={e => setForm({...form, empresa: e.target.value})} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"/>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Número de Póliza</label>
                                            <input type="text" placeholder="Ej: 123456789" value={form.numero_poliza} onChange={e => setForm({...form, numero_poliza: e.target.value})} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"/>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Documento PDF/Imagen</label>
                                            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setForm({...form, file: e.target.files?.[0] || null})} required={!editingId} className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"/>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                                        {editingId && <button type="button" onClick={() => { setEditingId(null); setForm({empresa: '', numero_poliza: '', file: null}); }} className="px-5 py-2.5 rounded-lg font-medium text-slate-700 bg-white border border-slate-300">Cancelar</button>}
                                        <button type="submit" className="px-6 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700">{editingId ? 'Guardar Cambios' : 'Subir Archivo'}</button>
                                    </div>
                                </form>
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Empresa</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Número de Póliza</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {polizas.map(p => (
                                            <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{p.empresa}</td>
                                                <td className="px-6 py-4 text-sm font-bold text-slate-700 dark:text-slate-300">{p.numero_poliza}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button onClick={() => window.open(`${API_URL}/api/archivos/descargar/${p.file_id}`, '_blank')} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Icons.Download /></button>
                                                        <button onClick={() => { setForm({ empresa: p.empresa, numero_poliza: p.numero_poliza, file: null }); setEditingId(p.id); }} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg"><Icons.Edit /></button>
                                                        <button onClick={() => eliminarArchivo(p.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Icons.Trash /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ======================================================= */}
                    {/* TAB 2: COSTOS POR VEHÍCULO */}
                    {/* ======================================================= */}
                    {activeTab === 'costos' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <input
                                    type="text"
                                    placeholder="Buscar por Patente, Móvil o Modelo..."
                                    value={searchCostos}
                                    onChange={(e) => setSearchCostos(e.target.value)}
                                    className="w-full sm:w-1/3 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                            <tr>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Móvil / Patente</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Vehículo</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Suma Asegurada</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Costo Semestral</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Costo Mensual</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Franquicia</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                            {filteredCostos.map((c) => (
                                                <tr key={c.patente} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="font-bold text-slate-900 dark:text-white">{c.nro_movil}</div>
                                                        <div className="text-sm text-slate-500">{c.patente}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 font-medium capitalize">
                                                        {c.modelo.toLowerCase()}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-700 dark:text-slate-300 text-right">
                                                        {c.suma_asegurada ? formatCurrency(c.suma_asegurada) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600 dark:text-blue-400 text-right">
                                                        {c.costo_semestral ? formatCurrency(c.costo_semestral) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-emerald-600 dark:text-emerald-400 text-right">
                                                        {c.costo_mensual ? formatCurrency(c.costo_mensual) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-rose-600 dark:text-rose-400 text-right">
                                                        {c.monto_franquicia ? formatCurrency(c.monto_franquicia) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                        <button onClick={() => setModalCostosData({ ...c })} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Editar Valores Financieros">
                                                            <Icons.Edit />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="pt-4">
                <Link to="/" className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                    <Icons.ArrowLeft /> Volver al Dashboard
                </Link>
            </div>

            {/* ======================================================= */}
            {/* MODAL TAILWIND PARA EDITAR COSTOS                       */}
            {/* ======================================================= */}
            {modalCostosData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-fade-in">
                        <form onSubmit={saveCostos}>
                            <div className="p-6">
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                                    Editar Costos: {modalCostosData.patente}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                                    Móvil {modalCostosData.nro_movil} - {modalCostosData.modelo}
                                </p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Suma Asegurada ($)</label>
                                        <input type="number" step="0.01" name="suma_asegurada" value={modalCostosData.suma_asegurada || ''} onChange={handleCostoChange} className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Costo Semestral ($)</label>
                                            <input type="number" step="0.01" name="costo_semestral" value={modalCostosData.costo_semestral || ''} onChange={handleCostoChange} className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Costo Mensual ($)</label>
                                            <input type="number" step="0.01" name="costo_mensual" value={modalCostosData.costo_mensual || ''} onChange={handleCostoChange} className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Monto Franquicia ($)</label>
                                        <input type="number" step="0.01" name="monto_franquicia" value={modalCostosData.monto_franquicia || ''} onChange={handleCostoChange} className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                                <button type="button" onClick={() => setModalCostosData(null)} className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isSavingCosto} className="px-6 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50">
                                    {isSavingCosto ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PolizasList;