// src/pages/VehiculoDetail.tsx

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Modal from 'react-modal';
import type { 
    Vehiculo, 
    Alerta, 
    DocumentoDigital, 
    DocumentoResponse
} from '../api/models/vehiculos'; 
import { 
    fetchVehiculoByPatente,
    borrarGastoUniversal,
    apiClient 
} from '../api/vehiculos';
import CostoForm from '../components/CostoForm';
// Eliminamos la importación de axios que no se usaba
import { normalizePatente } from '../utils/data-utils';
import type { GastoUnificado } from '../api/models/gastos';

// =================================================================
// ICONOS SVG CORPORATIVOS
// =================================================================
const Icons = {
    ArrowLeft: () => <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
    Download: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
    Upload: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
    Edit: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
    Trash: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    Eye: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
    Document: () => <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    Calendar: () => <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    Alert: () => <svg className="w-6 h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
};

type VehiculoConLegacy = Vehiculo & {
    ANIO?: number; COLOR?: string; NRO_MOVIL?: string;
    DESCRIPCION_MODELO?: string; MODELO?: string; TIPO_COMBUSTIBLE?: string; _id?: string;
};

const DOCUMENTOS_ESTANDAR = [
  { tipo: 'TITULO_AUTOMOTOR', label: 'TÍTULO AUTOMOTOR' },
  { tipo: 'CEDULA_VERDE', label: 'CÉDULA VERDE DIGITAL' },
  { tipo: 'SEGURO', label: 'PÓLIZA SEGURO DIGITAL' },
  { tipo: 'FACTURA_VEHICULO', label: 'FACTURA VEHÍCULO' } 
];

const DetailItem: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
    <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{value ?? 'N/A'}</span>
    </div>
);

const VehiculoDetail: React.FC = () => {
    const { patente } = useParams<{ patente: string }>();
    const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
    const [gastosUnificados, setGastosUnificados] = useState<GastoUnificado[]>([]);
    
    const [totalGeneral, setTotalGeneral] = useState(0);
    const [totalMantenimiento, setTotalMantenimiento] = useState(0);
    const [totalMultas, setTotalMultas] = useState(0);
    
    const [alertas, setAlertas] = useState<Alerta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [docSeleccionado, setDocSeleccionado] = useState<DocumentoDigital | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null);

    const [modalComprobanteOpen, setModalComprobanteOpen] = useState(false);
    const [comprobantePreviewUrl, setComprobantePreviewUrl] = useState<string | null>(null);
    const [comprobanteLoading, setComprobanteLoading] = useState(false);

    const [editingGasto, setEditingGasto] = useState<GastoUnificado | null>(null);
    const [editingVencimientos, setEditingVencimientos] = useState<Record<string, boolean>>({});
    const [fechasVencimiento, setFechasVencimiento] = useState<Record<string, string>>({});
    
    const [vencimientosBD, setVencimientosBD] = useState<DocumentoResponse[]>([]);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    const cargarDatos = useCallback(async () => {
        if (!patente) return;
        setLoading(true);
        setError(null);
        try {
            const vehData = await fetchVehiculoByPatente(patente);
            setVehiculo(vehData);

            const report = await apiClient.get(
                `/vehiculos/${patente}/reporte?start_date=2023-01-01&end_date=${new Date().toISOString().split('T')[0]}`
            );
            setAlertas(report.data.alertas || []);

            const response = await apiClient.get(`/costos/unificado/${patente}`);
            const data = response.data;
            setGastosUnificados(data.gastos || []);
            setTotalGeneral(data.total_general || 0);
            setTotalMantenimiento(data.total_mantenimiento || 0);
            setTotalMultas(data.total_multas || 0);
        } catch (error: unknown) {
            console.error("Error en cargarDatos:", error);
            let mensaje = 'Error al cargar los datos.';
            if (error instanceof Error) mensaje += ` ${error.message}`;
            setError(mensaje);
        } finally {
            setLoading(false);
        }
    }, [patente]);

    const cargarVencimientosBD = useCallback(async () => {
        if (!patente) return;
        try {
            const res = await apiClient.get(`/documentacion/${patente}`);
            setVencimientosBD(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error("Error cargando vencimientos:", error);
        }
    }, [patente]);

    useEffect(() => {
        cargarDatos();
        cargarVencimientosBD();
    }, [cargarDatos, cargarVencimientosBD]);

    const handleDownload = (fileId: string) => {
        window.open(`${API_URL}/api/archivos/descargar/${fileId}`, '_blank');
    };

    const abrirModalDocumento = async (doc: DocumentoDigital | { tipo: string }) => {
        setDocSeleccionado(doc as DocumentoDigital);
        setPreviewUrl(null);
        setLoadingPreview(true);
        setArchivoNuevo(null);

        if (!('file_id' in doc) || !doc.file_id) {
            setLoadingPreview(false);
            setModalIsOpen(true);
            return;
        }

        try {
            const timestamp = Date.now();
            const url = `${API_URL}/api/archivos/descargar/${doc.file_id}?preview=true&t=${timestamp}`;
            
            if (doc.nombre_archivo?.toLowerCase().includes(".pdf")) {
                setPreviewUrl(url);
            } else {
                const response = await fetch(url, { cache: "no-store" });
                if (!response.ok) throw new Error("No se pudo cargar");
                const blob = await response.blob();
                setPreviewUrl(URL.createObjectURL(blob));
            }
        } catch (error) {
            console.error("Error preview:", error);
        } finally {
            setLoadingPreview(false);
        }
        setModalIsOpen(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) setArchivoNuevo(e.target.files[0]);
    };

    const subirDocumento = async () => {
        if (!docSeleccionado || !archivoNuevo || !vehiculo) return;
        const formData = new FormData();
        formData.append("patente", normalizePatente(vehiculo._id));
        formData.append("tipo", docSeleccionado.tipo);
        formData.append("file", archivoNuevo);

        try {
            await apiClient.post("/api/archivos/subir-documento", formData, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 60000,
            });
            alert(`✅ Documento subido correctamente`);
            setModalIsOpen(false);
            setArchivoNuevo(null);
            await cargarDatos(); 
        } catch (error) {
            console.error("Error al subir el documento:", error);
            alert("❌ Error al subir el documento.");
        }
    };

    const abrirComprobante = async (fileId: string) => {
        setComprobantePreviewUrl(null);
        setComprobanteLoading(true);
        setModalComprobanteOpen(true);
        try {
            const url = `${API_URL}/api/archivos/descargar/${fileId}?preview=true`;
            const response = await fetch(url);
            const blob = await response.blob();
            setComprobantePreviewUrl(URL.createObjectURL(blob));
        } catch (error) {
            console.error("Error abriendo comprobante", error);
        } finally {
            setComprobanteLoading(false);
        }
    };

    const editarGasto = (gasto: GastoUnificado) => {
        setEditingGasto(gasto);
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    const handleBorrarGasto = async (id: string, origen: 'mantenimiento' | 'finanzas') => {
        if(!confirm("¿Estás seguro de eliminar este gasto?")) return;
        try {
            const coleccion = origen === 'mantenimiento' ? 'costos' : 'finanzas';
            await borrarGastoUniversal(id, coleccion);
            await cargarDatos();
        } catch (error) {
            console.error("Error al borrar el gasto:", error);
            alert("Error al borrar el gasto");
        }
    };

    const guardarVencimiento = async (tipoFrontend: string) => {
        const fecha = fechasVencimiento[tipoFrontend];
        if (!fecha || !patente) return;
        try {
            await apiClient.put(`/documentacion/${patente}/${tipoFrontend}`, {
                fecha_vencimiento: new Date(fecha).toISOString()
            });
            setEditingVencimientos(prev => ({ ...prev, [tipoFrontend]: false }));
            await cargarVencimientosBD();
        } catch (error) {
            console.error("Error al guardar vencimiento:", error);
            alert("Error al actualizar la fecha.");
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }
    if (error) return <div className="p-6 bg-red-50 text-red-700 rounded-xl max-w-2xl mx-auto mt-8">Error: {error}</div>;
    if (!vehiculo) return <div className="p-6 text-center text-slate-500">Vehículo no encontrado.</div>;

    const v = vehiculo as VehiculoConLegacy;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
            
            {/* ENCABEZADO Y BOTÓN VOLVER */}
            <div className="flex flex-col gap-4">
                <Link to="/vehiculos" className="inline-flex items-center text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors w-fit">
                    <Icons.ArrowLeft /> Volver al Directorio
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                            Detalle de Unidad: <span className="text-blue-600 dark:text-blue-400">{vehiculo._id}</span>
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Ficha técnica, documentación y costos asociados</p>
                    </div>
                </div>
            </div>

            {/* 1. INFORMACIÓN BÁSICA */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Información Técnica</h2>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                    <DetailItem label="Nº Móvil" value={v.nro_movil || v.NRO_MOVIL} />
                    <DetailItem label="Modelo" value={v.descripcion_modelo || v.DESCRIPCION_MODELO || v.MODELO } />
                    <DetailItem label="Año" value={v.anio || v.ANIO} />
                    <DetailItem label="Color" value={v.color || v.COLOR} />
                    <DetailItem label="Combustible" value={v.tipo_combustible || v.TIPO_COMBUSTIBLE} />
                    <DetailItem label="Estado Activo" value={v.activo ? 'Sí, en operación' : 'No, inactivo'} />
                </div>
            </div>

            {/* 2. DOCUMENTOS DIGITALES */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                    <Icons.Document />
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Documentos Digitales</h2>
                </div>
                <div className="p-6 space-y-4">
                    {DOCUMENTOS_ESTANDAR.map((itemEstandar) => {
                        const docExistente = (v.documentos_digitales || []).find(
                            d => d.tipo.toUpperCase() === itemEstandar.tipo || d.tipo.toUpperCase().replace(/_/g, ' ') === itemEstandar.label
                        );
                        const tieneArchivo = !!docExistente?.file_id;

                        return (
                            <div key={itemEstandar.tipo} className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${tieneArchivo ? 'border-l-4 border-l-emerald-500 bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700' : 'border-l-4 border-l-rose-500 bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'}`}>
                                <div>
                                    <strong className="text-slate-900 dark:text-white block font-bold">{itemEstandar.label}</strong>
                                    <span className={`text-sm font-medium mt-1 inline-block ${tieneArchivo ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {tieneArchivo ? '✅ Archivo disponible en la nube' : '⚠️ Pendiente de carga'}
                                    </span>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    {tieneArchivo && (
                                        <button onClick={() => handleDownload(docExistente!.file_id!)} className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium">
                                            <Icons.Download />
                                        </button>
                                    )}
                                    <button onClick={() => abrirModalDocumento(docExistente || { tipo: itemEstandar.tipo })} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg font-medium text-white transition-colors ${tieneArchivo ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                        <Icons.Upload /> {tieneArchivo ? "Reemplazar" : "Subir Archivo"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3. VENCIMIENTOS CRÍTICOS */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                    <Icons.Calendar />
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">Vencimientos Críticos</h2>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                        { key: 'SEGURO', label: 'Póliza de Seguro' },
                        { key: 'VTV', label: 'VTV Anual' }
                    ].map(({ key, label }) => {
                        const doc = vencimientosBD.find(d => d.tipo_documento === key || (key === 'SEGURO' && d.tipo_documento === 'Poliza_Detalle')); 
                        const fechaRaw = doc?.fecha_vencimiento;
                        const fechaStr = fechaRaw ? new Date(fechaRaw).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Sin fecha asignada';
                        const isEditing = editingVencimientos[key];

                        return (
                            <div key={key} className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <strong className="text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</strong>
                                
                                {isEditing ? (
                                    <div className="mt-3 space-y-3">
                                        <input
                                            type="date"
                                            value={fechasVencimiento[key] || ''}
                                            onChange={(e) => setFechasVencimiento(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => guardarVencimiento(key)} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors">
                                                Guardar
                                            </button>
                                            <button onClick={() => setEditingVencimientos(prev => ({ ...prev, [key]: false }))} className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-1 flex justify-between items-end">
                                        <div className={`text-xl font-bold ${fechaStr.includes('Sin') ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
                                            {fechaStr}
                                        </div>
                                        <button onClick={() => {
                                            setEditingVencimientos(prev => ({ ...prev, [key]: true }));
                                            setFechasVencimiento(prev => ({ ...prev, [key]: doc?.fecha_vencimiento ? new Date(doc.fecha_vencimiento).toISOString().split('T')[0] : '' }));
                                        }} className="p-2 text-amber-600 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title="Modificar Fecha">
                                            <Icons.Edit />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 4. ALERTAS */}
            {alertas.length > 0 && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Icons.Alert />
                        <h2 className="text-lg font-bold text-rose-700 dark:text-rose-400">Atención Requerida</h2>
                    </div>
                    <div className="space-y-2">
                        {alertas.map((alerta, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-rose-100 dark:border-rose-800/30">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                <strong className="text-slate-700 dark:text-slate-200 text-sm">{alerta.mensaje}</strong>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 5. HISTORIAL DE COSTOS Y FORMULARIO */}
            <div className="space-y-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Finanzas y Mantenimiento</h2>
                
                {/* Tarjetas de Totales */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Costo Total General</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm border-b-4 border-b-emerald-500">
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total Mantenimiento</p>
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">${totalMantenimiento.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm border-b-4 border-b-rose-500">
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total Infracciones</p>
                        <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">${totalMultas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                {/* Tabla de Costos */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fecha</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descripción</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Importe</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {gastosUnificados.map((gasto) => (
                                    <tr key={gasto.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-200">{gasto.fecha.split('T')[0]}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-md text-xs font-bold border border-slate-200 dark:border-slate-600">
                                                {gasto.tipo}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">
                                            {gasto.descripcion}
                                            {gasto.comprobante_file_id && (
                                                <button onClick={() => abrirComprobante(gasto.comprobante_file_id!)} className="ml-2 text-blue-500 hover:text-blue-700 inline-flex align-middle" title="Ver comprobante">
                                                    <Icons.Eye />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white text-right">${gasto.importe.toLocaleString('es-AR')}</td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => editarGasto(gasto)} className="p-1.5 text-amber-600 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title="Editar Gasto">
                                                    <Icons.Edit />
                                                </button>
                                                <button onClick={() => handleBorrarGasto(gasto.id, gasto.origen)} className="p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar Gasto">
                                                    <Icons.Trash />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {gastosUnificados.length === 0 && <div className="p-8 text-center text-slate-500 dark:text-slate-400">No hay costos registrados en este período.</div>}
                    </div>
                </div>

                {/* Formulario de Costos Embebido */}
                <div className="pt-8">
                    <CostoForm 
                        initialPatente={patente || ''}
                        initialGasto={editingGasto}
                        onSuccess={() => { cargarDatos(); setEditingGasto(null); }}
                    />
                </div>
            </div>

            {/* MODAL DE SUBIDA DE DOCUMENTOS */}
            <Modal 
                isOpen={modalIsOpen} 
                onRequestClose={() => setModalIsOpen(false)} 
                ariaHideApp={false} 
                className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl max-w-xl w-full mx-auto mt-20 outline-none border border-slate-200 dark:border-slate-700 relative"
                overlayClassName="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-start z-50 overflow-y-auto px-4"
            >
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 pr-8">{docSeleccionado?.tipo}</h2>
                <button onClick={() => setModalIsOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><Icons.Trash /></button> 
                
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 mb-6">
                    {loadingPreview ? <p className="text-center text-slate-500 py-10">Cargando vista previa...</p> : 
                     previewUrl ? <iframe src={previewUrl} className="w-full h-64 rounded-lg bg-white" /> : 
                     <p className="text-center text-slate-500 py-10">Sube un archivo en formato PDF o Imagen.</p>}
                </div>

                <input type="file" onChange={handleFileChange} className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-700 dark:file:text-slate-200 cursor-pointer mb-6" />
                
                <div className="flex justify-end gap-3">
                    <button onClick={() => setModalIsOpen(false)} className="px-5 py-2.5 rounded-lg font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
                    <button onClick={subirDocumento} disabled={!archivoNuevo} className="px-6 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"><Icons.Upload /> Subir</button>
                </div>
            </Modal>

            {/* MODAL DE COMPROBANTE DE GASTO */}
            <Modal 
                isOpen={modalComprobanteOpen} 
                onRequestClose={() => setModalComprobanteOpen(false)} 
                ariaHideApp={false} 
                className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl max-w-3xl w-full mx-auto mt-10 outline-none border border-slate-200 dark:border-slate-700"
                overlayClassName="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-start z-50 overflow-y-auto px-4"
            >
                {comprobanteLoading ? (
                    <p className="text-center py-20 text-slate-500">Cargando comprobante...</p>
                ) : (
                    comprobantePreviewUrl && <img src={comprobantePreviewUrl} className="w-full h-auto rounded-lg" alt="Comprobante" />
                )}
                <div className="mt-6 flex justify-end">
                    <button onClick={() => setModalComprobanteOpen(false)} className="px-6 py-2.5 rounded-lg font-medium text-white bg-slate-800 hover:bg-slate-900 transition-colors">Cerrar Visor</button>
                </div>
            </Modal>
        </div>
    );
};

export default VehiculoDetail;