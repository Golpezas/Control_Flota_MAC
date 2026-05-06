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
import axios from 'axios';
import { normalizePatente } from '../utils/data-utils';
import type { GastoUnificado } from '../api/models/gastos';

// TIPO ACTUALIZADO CON MARCA Y TIPO
type VehiculoConLegacy = Vehiculo & {
    ANIO?: number;
    COLOR?: string;
    NRO_MOVIL?: string;
    MARCA?: string; 
    MODELO?: string;
    TIPO?: string;  
    DESCRIPCION_MODELO?: string;
    TIPO_COMBUSTIBLE?: string;
    _id?: string;
};

// Configuración de documentos estándar
const DOCUMENTOS_ESTANDAR = [
  { tipo: 'TITULO_AUTOMOTOR',     label: 'TÍTULO AUTOMOTOR' },
  { tipo: 'CEDULA_VERDE',         label: 'CÉDULA VERDE DIGITAL' },
  { tipo: 'SEGURO',               label: 'PÓLIZA SEGURO DIGITAL' },
  { tipo: 'FACTURA_VEHICULO',     label: 'FACTURA VEHÍCULO' } 
];

const DetailItem: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
    <div className="border-b border-dotted border-slate-300 dark:border-slate-600 py-2">
        <span className="font-bold text-blue-600 dark:text-blue-400">{label}:</span> 
        <span className="text-slate-700 dark:text-slate-300 ml-2">{value ?? 'N/A'}</span>
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
            const datosBD = Array.isArray(res.data) ? res.data : [];
            setVencimientosBD(datosBD);
        } catch (err) {
            console.error("Error cargando vencimientos desde documentacion:", err);
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
        } catch (err) {
            console.error("Error preview:", err);
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
            console.error("Error al subir:", error);
            let msg = "Error al subir.";
            if (axios.isAxiosError(error) && error.response?.data?.detail) {
                msg += ` ${JSON.stringify(error.response.data.detail)}`;
            }
            alert(`❌ ${msg}`);
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
        } catch (err) {
            console.error("Error abriendo comprobante", err);
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
        } catch (err) {
            console.error(err);
            alert("Error al borrar el gasto");
        }
    };

    // 💡 FIX CLAVE: Llamado Correcto a Backend
    const guardarVencimiento = async (tipoFrontend: string) => {
        const fecha = fechasVencimiento[tipoFrontend];
        if (!fecha || !patente) return;

        const docExistente = vencimientosBD.find(d => 
            d.tipo_documento === tipoFrontend || 
            (tipoFrontend === 'SEGURO' && d.tipo_documento === 'Poliza_Detalle')
        );

        const tipoBackend = docExistente ? docExistente.tipo_documento : tipoFrontend;

        try {
            // Se fuerza UTC
            const fechaUTC = new Date(`${fecha}T12:00:00Z`).toISOString();

            await apiClient.put(`/vencimientos/${patente}/${tipoBackend}`, {
                fecha_vencimiento: fechaUTC
            });
            
            alert(`Fecha actualizada correctamente`);
            setEditingVencimientos(prev => ({ ...prev, [tipoFrontend]: false }));
            
            await cargarVencimientosBD();
            await cargarDatos(); 
        } catch (err) {
            console.error("Error al guardar vencimiento:", err);
            alert("Error al actualizar la fecha.");
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Cargando... ⏳</div>;
    if (error) return <div className="p-8 text-center text-red-500 font-bold">❌ {error}</div>;
    if (!vehiculo) return <div className="p-8 text-center">No encontrado.</div>;

    const v = vehiculo as VehiculoConLegacy;

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto animate-fade-in text-slate-900 dark:text-slate-100">
            <h1 className="text-3xl font-extrabold border-b-2 border-slate-200 dark:border-slate-700 pb-3 mb-6 flex items-center gap-3">
                <Link to="/vehiculos" className="text-slate-400 hover:text-blue-500 transition-colors">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </Link>
                Detalle de Unidad: <span className="text-blue-600 dark:text-blue-400">{vehiculo._id}</span>
            </h1>

            {/* 1. INFORMACIÓN BÁSICA */}
            <div className="mb-8 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-100 dark:border-slate-700 pb-2">Información Básica</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    <DetailItem label="Nº Móvil" value={v.nro_movil || v.NRO_MOVIL} />
                    
                    {v.marca || v.MARCA ? (
                        <>
                            <DetailItem label="Marca" value={v.marca || v.MARCA} />
                            <DetailItem label="Modelo" value={v.modelo || v.MODELO} />
                            <DetailItem label="Tipo" value={v.tipo || v.TIPO} />
                        </>
                    ) : (
                        <DetailItem label="Modelo/Descripción" value={v.descripcion_modelo || v.DESCRIPCION_MODELO || v.modelo || v.MODELO} />
                    )}

                    <DetailItem label="Año" value={v.anio || v.ANIO} />
                    <DetailItem label="Color" value={v.color || v.COLOR} />
                    <DetailItem label="Combustible" value={v.tipo_combustible || v.TIPO_COMBUSTIBLE} />
                    <DetailItem label="Activo" value={v.activo ? 'Sí' : 'No'} />
                </div>
            </div>

            {/* 2. DOCUMENTOS DIGITALES (CHECKLIST) */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 mt-8 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-5">
                    Documentos Digitales
                </h2>
                
                <div className="grid grid-cols-1 gap-4">
                    {DOCUMENTOS_ESTANDAR.map((itemEstandar) => {
                        const docExistente = (v.documentos_digitales || []).find(
                            d => d.tipo.toUpperCase() === itemEstandar.tipo || 
                                 d.tipo.toUpperCase().replace(/_/g, ' ') === itemEstandar.label
                        );
                        const tieneArchivo = !!docExistente?.file_id;

                        return (
                            <div key={itemEstandar.tipo} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${tieneArchivo ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
                                <div className="mb-3 sm:mb-0">
                                    <strong className="text-slate-800 dark:text-slate-200 block text-lg">
                                        {itemEstandar.label}
                                    </strong>
                                    <span className={`text-sm font-medium ${tieneArchivo ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {tieneArchivo ? '✅ Documento cargado' : '❌ Pendiente de carga'}
                                    </span>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    {tieneArchivo && (
                                        <button onClick={() => handleDownload(docExistente!.file_id!)} className="flex-1 sm:flex-none px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-lg transition-colors font-bold">
                                            📥
                                        </button>
                                    )}
                                    <button onClick={() => abrirModalDocumento(docExistente || { tipo: itemEstandar.tipo })} className={`flex-1 sm:flex-none px-6 py-2 text-white font-bold rounded-lg transition-colors ${tieneArchivo ? 'bg-amber-500 hover:bg-amber-600' : 'bg-rose-500 hover:bg-rose-600'}`}>
                                        {tieneArchivo ? "Reemplazar" : "SUBIR ARCHIVO"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3. VENCIMIENTOS CRÍTICOS */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border-2 border-blue-400 dark:border-blue-600 mt-8 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                📅 Vencimientos Críticos
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                { key: 'SEGURO', label: 'Póliza de Seguro' },
                { key: 'VTV', label: 'VTV' }
                ].map(({ key, label }) => {
                
                const docsAsociados = vencimientosBD.filter(d => 
                    d.tipo_documento === key || 
                    (key === 'SEGURO' && d.tipo_documento === 'Poliza_Detalle')
                ); 

                const doc = docsAsociados.sort((a, b) => {
                    if (!a.fecha_vencimiento) return 1;
                    if (!b.fecha_vencimiento) return -1;
                    return new Date(b.fecha_vencimiento).getTime() - new Date(a.fecha_vencimiento).getTime();
                })[0];

                const fechaRaw = doc?.fecha_vencimiento;
                
                const fechaStr = fechaRaw
                    ? new Date(fechaRaw).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
                    : 'Sin fecha asignada';

                const isEditing = editingVencimientos[key];

                return (
                    <div key={key} className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                        <div className="mb-4">
                            <strong className="text-slate-700 dark:text-slate-300 text-lg block">{label}</strong>
                            <div className={`mt-1 text-xl font-extrabold ${fechaStr.includes('Sin') ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {fechaStr}
                            </div>
                        </div>

                        {isEditing ? (
                        <div className="flex flex-col gap-2">
                            <input
                                type="date"
                                value={fechasVencimiento[key] || ''}
                                onChange={(e) => setFechasVencimiento(prev => ({ ...prev, [key]: e.target.value }))}
                                className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => guardarVencimiento(key)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-lg font-bold transition-colors">
                                    Guardar
                                </button>
                                <button onClick={() => setEditingVencimientos(prev => ({ ...prev, [key]: false }))} className="flex-1 bg-slate-400 hover:bg-slate-500 text-white p-2.5 rounded-lg font-bold transition-colors">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                        ) : (
                        <button onClick={() => { setEditingVencimientos(prev => ({ ...prev, [key]: true })); setFechasVencimiento(prev => ({ ...prev, [key]: doc?.fecha_vencimiento ? new Date(doc.fecha_vencimiento).toISOString().split('T')[0] : '' })); }} className="w-full bg-amber-500 hover:bg-amber-600 text-white p-2.5 rounded-lg font-bold transition-colors">
                            ✏️ Modificar Fecha
                        </button>
                        )}
                    </div>
                );
                })}
            </div>
            </div>

            {/* 4. ALERTAS */}
            {alertas.length > 0 && (
                <div className="mt-8">
                    <h2 className="text-xl font-bold text-rose-600 dark:text-rose-500 mb-4">
                        ⚠️ Alertas Activas de esta Unidad
                    </h2>
                    {alertas.map((alerta, index) => (
                        <div key={index} className="p-4 bg-rose-50 dark:bg-rose-900/20 border-l-4 border-rose-500 rounded-r-lg mb-3">
                            <strong className="text-rose-800 dark:text-rose-300">{alerta.mensaje}</strong>
                        </div>
                    ))}
                </div>
            )}

            {/* 5. HISTORIAL DE COSTOS Y FORMULARIO */}
            <div className="mt-10 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-3 mb-6">Historial de Costos</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Total General</div>
                        <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
                            ${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Mantenimiento</div>
                        <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                            ${totalMantenimiento.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Infracciones</div>
                        <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                            ${totalMultas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-8">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Fecha</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Tipo</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Descripción</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-right">Importe</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {gastosUnificados.map((gasto) => (
                                    <tr key={gasto.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                        <td className="p-4 text-sm text-slate-700 dark:text-slate-300 font-medium">{gasto.fecha.split('T')[0]}</td>
                                        <td className="p-4 text-sm">
                                            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-xs font-bold">
                                                {gasto.tipo}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 dark:text-slate-400">
                                            {gasto.descripcion}
                                            {gasto.comprobante_file_id && (
                                                <button onClick={() => abrirComprobante(gasto.comprobante_file_id!)} className="ml-2 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400" title="Ver Comprobante">👁️</button>
                                            )}
                                        </td>
                                        <td className="p-4 text-sm font-bold text-slate-700 dark:text-slate-200 text-right">${gasto.importe.toLocaleString('es-AR')}</td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => editarGasto(gasto)} className="p-2 text-amber-500 hover:bg-amber-50 dark:hover:bg-slate-700 rounded-lg">✏️</button>
                                            <button onClick={() => handleBorrarGasto(gasto.id, gasto.origen)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-700 rounded-lg">🗑️</button>
                                        </td>
                                    </tr>
                                ))}
                                {gastosUnificados.length === 0 && <div className="p-8 text-center text-slate-500 dark:text-slate-400">No hay costos registrados.</div>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">{editingGasto ? 'Editar Costo' : 'Agregar Nuevo Costo'}</h2>
                    <CostoForm 
                        initialPatente={patente || ''}
                        initialGasto={editingGasto}
                        onSuccess={() => { cargarDatos(); setEditingGasto(null); }}
                    />
                </div>
            </div>

            <Link to="/vehiculos" className="block mt-8 text-blue-600 dark:text-blue-400 font-bold transition-colors hover:text-blue-800 dark:hover:text-blue-300">← Volver al Listado</Link>

            {/* MODALES */}
            <Modal isOpen={modalIsOpen} onRequestClose={() => setModalIsOpen(false)} ariaHideApp={false} style={{ content: { maxWidth: '600px', margin: 'auto', borderRadius: '16px', padding: '24px', backgroundColor: '#fff', color: '#1e293b' }, overlay: { backgroundColor: 'rgba(0,0,0,0.6)' } }}>
                <h2 className="text-xl font-bold mb-4 text-center">{docSeleccionado?.tipo}</h2>
                {loadingPreview ? <p className="text-center py-10">Cargando...</p> : previewUrl ? <iframe src={previewUrl} className="w-full h-96 rounded-lg border" /> : <p className="text-center py-10 text-slate-500">Sube un archivo para previsualizarlo</p>}
                <input type="file" onChange={handleFileChange} className="mt-6 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={() => setModalIsOpen(false)} className="px-5 py-2.5 rounded-lg font-medium bg-slate-200 text-slate-800 hover:bg-slate-300 transition-colors">Cancelar</button>
                    <button onClick={subirDocumento} disabled={!archivoNuevo} className="px-6 py-2.5 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">Subir Archivo</button>
                </div>
            </Modal>

            <Modal isOpen={modalComprobanteOpen} onRequestClose={() => setModalComprobanteOpen(false)} ariaHideApp={false} style={{ content: { maxWidth: '800px', margin: 'auto', borderRadius: '16px', padding: '24px', backgroundColor: '#fff' }, overlay: { backgroundColor: 'rgba(0,0,0,0.6)' } }}>
                {comprobanteLoading ? <p className="text-center py-20">Cargando comprobante...</p> : comprobantePreviewUrl && <img src={comprobantePreviewUrl} className="w-full rounded-lg" alt="Comprobante"/>}
                <button onClick={() => setModalComprobanteOpen(false)} className="mt-6 w-full px-5 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-900 transition-colors">Cerrar Visor</button>
            </Modal>
        </div>
    );
};

export default VehiculoDetail;