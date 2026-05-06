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
    ANIO: string | number;
}>;

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
    anio: string | number;
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
// ICONOS SVG CORPORATIVOS
// =================================================================
const Icons = {
    Shield: () => <svg className="w-8 h-8 text-blue-600 dark:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    Download: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
    Edit: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
    Trash: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    ArrowLeft: () => <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
    Folder: () => <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
    Currency: () => <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    Printer: () => <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
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
    
    const [filterPatente, setFilterPatente] = useState('');
    const [filterMarcaModelo, setFilterMarcaModelo] = useState('');
    const [filterAnio, setFilterAnio] = useState('');

    const [modalCostosData, setModalCostosData] = useState<CostoPoliza | null>(null);
    const [isSavingCosto, setIsSavingCosto] = useState(false);

    useEffect(() => {
        const loadAllData = async () => {
            setLoading(true);
            try {
                const resPolizas = await apiClient.get<Poliza[]>('/polizas');
                setPolizas(resPolizas.data);

                const vehiculosData = await fetchVehiculos();
                const mappedCostos: CostoPoliza[] = vehiculosData.filter(v => v.activo).map(v => {
                    const legacy = getLegacy(v);
                    const marca = v.marca || legacy.MARCA || '';
                    const modelo = v.modelo || legacy.MODELO || v.descripcion_modelo || legacy.DESCRIPCION_MODELO || 'Sin Modelo';
                    
                    const seguroDoc = v.documentos_digitales?.find(
                        d => d.tipo === 'SEGURO' || d.tipo === 'Poliza_Detalle'
                    ) as unknown as DocumentoSeguro | undefined;

                    return {
                        patente: v._id,
                        nro_movil: v.nro_movil ?? legacy.NRO_MOVIL ?? 'N/A',
                        modelo: `${marca} ${modelo}`.trim(),
                        anio: v.anio ?? legacy.ANIO ?? 'N/A',
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
            console.error("Error al eliminar el archivo:", error);
            alert("Error al eliminar la póliza");
        }
    };

    // ==========================================
    // LÓGICA TAB 2: COSTOS
    // ==========================================

    const uniqueMarcaModelos = useMemo(() => {
        const mm = vehiculosCostos.map(c => c.modelo.toUpperCase().trim()).filter(m => m !== '' && m !== 'SIN MODELO');
        return Array.from(new Set(mm)).sort();
    }, [vehiculosCostos]);

    const uniqueAnios = useMemo(() => {
        const anios = vehiculosCostos.map(c => c.anio).filter(a => a !== 'N/A');
        return Array.from(new Set(anios)).sort((a, b) => Number(b) - Number(a));
    }, [vehiculosCostos]);

    const filteredCostos = useMemo(() => {
        return vehiculosCostos.filter(c => {
            const matchPatente = filterPatente 
                ? c.patente.toLowerCase().includes(filterPatente.toLowerCase()) || String(c.nro_movil).toLowerCase().includes(filterPatente.toLowerCase()) 
                : true;
            
            const filterMarcaUpper = filterMarcaModelo.toUpperCase().trim();
            const matchMarcaModelo = filterMarcaUpper ? c.modelo.toUpperCase().includes(filterMarcaUpper) : true;
            
            const matchAnio = filterAnio ? String(c.anio) === String(filterAnio) : true;

            return matchPatente && matchMarcaModelo && matchAnio;
        });
    }, [vehiculosCostos, filterPatente, filterMarcaModelo, filterAnio]);

    const { totalMensual, totalSemestral } = useMemo(() => {
        return filteredCostos.reduce((acc, curr) => {
            acc.totalMensual += curr.costo_mensual;
            acc.totalSemestral += curr.costo_semestral;
            return acc;
        }, { totalMensual: 0, totalSemestral: 0 });
    }, [filteredCostos]);

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
            console.error("Error al guardar los costos financieros:", error);
            alert("Hubo un error al guardar los costos financieros.");
        } finally {
            setIsSavingCosto(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-10 print:max-w-none print:m-0 print:p-0 print:block">
            
            {/* ======================================================= */}
            {/* ESTILOS DE IMPRESIÓN MEJORADOS Y MATA-MODO-OSCURO       */}
            {/* ======================================================= */}
            <style type="text/css" media="print">
                {`
                /* 1. Forzar formato HORIZONTAL (Landscape) y ajustar márgenes */
                @page { size: landscape; margin: 10mm; }
                
                /* 2. Ocultar menús globales (nav, header) */
                header, nav, [role="navigation"] { display: none !important; }
                
                /* 3. LIMPIEZA ABSOLUTA DE MODO OSCURO */
                body, html, #root, main, div, table, thead, tbody, tr, th, td {
                    background: white !important;
                    background-color: white !important;
                    color: black !important;
                }
                
                /* 4. Evitar recortes horizontales forzando el ancho y colapso de bordes */
                .overflow-x-auto { overflow: visible !important; }
                table { width: 100% !important; font-size: 11px !important; border-collapse: collapse !important; }
                
                /* Dibujar líneas grises finas para separar las filas */
                th, td { 
                    padding: 8px 4px !important; 
                    border-bottom: 1px solid #e2e8f0 !important; 
                }
                
                /* 5. Evitar recortes verticales en las filas y tablas divididas */
                tr { page-break-inside: avoid !important; }
                tfoot { display: table-row-group !important; }
                
                /* 6. Formatear la fila de TOTALES para que destaque sobre el blanco */
                tfoot tr, tfoot td {
                    border-top: 2px solid #000 !important;
                    font-weight: 900 !important;
                    background-color: #f1f5f9 !important; /* Gris súper claro que sí se imprime */
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                `}
            </style>
            
            {/* ENCABEZADO (Oculto al imprimir) */}
            <div className="flex items-center gap-3 print:hidden">
                <Icons.Shield />
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Gestión de Seguros</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Archivo de pólizas y costos financieros por unidad</p>
                </div>
            </div>

            {/* PESTAÑAS (Oculto al imprimir) */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 print:hidden">
                <button
                    onClick={() => setActiveTab('archivos')}
                    className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors flex items-center ${
                        activeTab === 'archivos' 
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                    }`}
                >
                    <Icons.Folder /> Archivos de Pólizas
                </button>
                <button
                    onClick={() => setActiveTab('costos')}
                    className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors flex items-center ${
                        activeTab === 'costos' 
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                    }`}
                >
                    <Icons.Currency /> Costos por Vehículo
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-40 print:hidden">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <>
                    {/* ======================================================= */}
                    {/* TAB 1: ARCHIVOS (Oculto al imprimir) */}
                    {/* ======================================================= */}
                    {activeTab === 'archivos' && (
                        <div className="space-y-8 animate-fade-in print:hidden">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6">
                                    {editingId ? 'Modificar Archivo' : 'Subir Nueva Póliza General'}
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
                                        {editingId && <button type="button" onClick={() => { setEditingId(null); setForm({empresa: '', numero_poliza: '', file: null}); }} className="px-5 py-2.5 rounded-lg font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50">Cancelar</button>}
                                        <button type="submit" className="px-6 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700">{editingId ? 'Guardar Cambios' : 'Subir Archivo'}</button>
                                    </div>
                                </form>
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Empresa</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Número de Póliza</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {polizas.map(p => (
                                            <tr key={p.id} className="hover:bg-slate-50 dark:bg-slate-800 transition-colors">
                                                <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{p.empresa}</td>
                                                <td className="px-6 py-4 text-sm font-bold text-slate-700 dark:text-slate-300">{p.numero_poliza}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button onClick={() => window.open(`${API_URL}/api/archivos/descargar/${p.file_id}`, '_blank')} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Descargar PDF"><Icons.Download /></button>
                                                        <button onClick={() => { setForm({ empresa: p.empresa, numero_poliza: p.numero_poliza, file: null }); setEditingId(p.id); }} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Editar"><Icons.Edit /></button>
                                                        <button onClick={() => eliminarArchivo(p.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar"><Icons.Trash /></button>
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
                        <div className="space-y-6 animate-fade-in print:space-y-0">
                            
                            {/* MEMBRETE SOLO VISIBLE AL IMPRIMIR */}
                            <div className="hidden print:block print:mb-6">
                                <h1 className="text-2xl font-extrabold text-black uppercase tracking-wide border-b-2 border-slate-900 pb-2 mb-4">
                                    MAC Servicios Empresarios - Reporte de Seguros
                                </h1>
                                <div className="flex justify-between text-sm font-semibold text-slate-800 mb-2">
                                    <p>Generado el: {new Date().toLocaleDateString('es-AR')}</p>
                                    <p>Unidades Reportadas: {filteredCostos.length}</p>
                                </div>
                                {(filterPatente || filterMarcaModelo || filterAnio) && (
                                    <p className="text-sm text-slate-600 mb-4 italic border-l-4 border-slate-300 pl-2">
                                        Filtros aplicados: {[filterPatente, filterMarcaModelo, filterAnio].filter(Boolean).join(' | ')}
                                    </p>
                                )}
                            </div>

                            {/* PANEL DE FILTROS (Oculto al imprimir) */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 print:hidden">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buscar por Patente / Móvil</label>
                                        <input
                                            type="text"
                                            placeholder="Ej. AB123CD o 55"
                                            value={filterPatente}
                                            onChange={(e) => setFilterPatente(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Marca y Modelo</label>
                                        <input 
                                            type="text"
                                            list="marcas-modelos-list"
                                            placeholder="Ej. Renault Alaskan"
                                            value={filterMarcaModelo} 
                                            onChange={(e) => setFilterMarcaModelo(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                        <datalist id="marcas-modelos-list">
                                            {uniqueMarcaModelos.map((m) => <option key={m} value={m} />)}
                                        </datalist>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Año</label>
                                        <select 
                                            value={filterAnio} 
                                            onChange={(e) => setFilterAnio(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        >
                                            <option value="">Todos los Años</option>
                                            {uniqueAnios.map((a) => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="mt-5 flex justify-between items-center">
                                    <button 
                                        onClick={handlePrint}
                                        className="flex items-center px-5 py-2.5 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors shadow-sm"
                                    >
                                        <Icons.Printer /> Imprimir / PDF
                                    </button>

                                    {(filterPatente || filterMarcaModelo || filterAnio) && (
                                        <button 
                                            onClick={() => { setFilterPatente(''); setFilterMarcaModelo(''); setFilterAnio(''); }}
                                            className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                        >
                                            Limpiar Filtros
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden print:border-none print:shadow-none">
                                <div className="overflow-x-auto print:overflow-visible">
                                    <table className="w-full text-left border-collapse print:text-black">
                                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 print:bg-transparent print:border-black print:border-b-2">
                                            <tr>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Móvil / Patente</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vehículo</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Año</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Suma Asegurada</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Costo Semestral</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Costo Mensual</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Franquicia</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center print:hidden">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 print:divide-slate-300">
                                            {filteredCostos.map((c) => (
                                                <tr key={c.patente} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 print:break-inside-avoid">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="font-bold text-slate-900 dark:text-white print:text-black">{c.nro_movil}</div>
                                                        <div className="text-sm text-slate-500 print:text-slate-700">{c.patente}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 font-medium capitalize print:text-black">
                                                        {c.modelo.toLowerCase()}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 text-center font-semibold print:text-black">
                                                        {c.anio}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-700 dark:text-slate-300 text-right print:text-black">
                                                        {c.suma_asegurada ? formatCurrency(c.suma_asegurada) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600 dark:text-blue-400 text-right print:text-black">
                                                        {c.costo_semestral ? formatCurrency(c.costo_semestral) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-emerald-600 dark:text-emerald-400 text-right print:text-black">
                                                        {c.costo_mensual ? formatCurrency(c.costo_mensual) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-rose-600 dark:text-rose-400 text-right print:text-black">
                                                        {c.monto_franquicia ? formatCurrency(c.monto_franquicia) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center print:hidden">
                                                        <button onClick={() => setModalCostosData({ ...c })} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Editar Valores Financieros">
                                                            <Icons.Edit />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {/* FILA DE TOTALES DINÁMICOS */}
                                        <tfoot className="bg-slate-100 dark:bg-slate-900/80 print:bg-transparent">
                                            <tr>
                                                <td colSpan={4} className="px-6 py-4 text-right text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider print:text-black">
                                                    Totales (Filtrados)
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-blue-600 dark:text-blue-400 text-right bg-blue-50 dark:bg-blue-900/20 border-l border-r border-slate-200 dark:border-slate-700 print:text-black">
                                                    {formatCurrency(totalSemestral)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-emerald-600 dark:text-emerald-400 text-right bg-emerald-50 dark:bg-emerald-900/20 border-r border-slate-200 dark:border-slate-700 print:text-black">
                                                    {formatCurrency(totalMensual)}
                                                </td>
                                                <td colSpan={2} className="print:hidden"></td>
                                                <td className="hidden print:table-cell"></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="pt-4 print:hidden">
                <Link to="/" className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                    <Icons.ArrowLeft /> Volver al Dashboard
                </Link>
            </div>

            {/* ======================================================= */}
            {/* MODAL TAILWIND PARA EDITAR COSTOS (Oculto al imprimir)  */}
            {/* ======================================================= */}
            {modalCostosData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:hidden">
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