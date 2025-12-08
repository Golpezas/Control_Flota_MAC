// src/pages/VehiculoDetail.tsx

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Modal from 'react-modal';
import type { 
    Vehiculo, 
    ReporteCostosResponse, 
    Alerta, 
    DocumentoDigital, 
} from '../api/models/vehiculos'; 
import { 
    fetchVehiculoByPatente, 
    fetchReporteVehiculo,
    borrarGastoUniversal,
    apiClient 
} from '../api/vehiculos';
import CostoForm from '../components/CostoForm';

// Interface para gastos
interface GastoUnificado {
    id: string;
    fecha: string;
    tipo: string;
    monto: number;
    descripcion: string;
    comprobante_file_id?: string;
    origen: string;
}

// Componentes auxiliares
const DetailItem: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
    <div style={{ borderBottom: '1px dotted #ccc', padding: '5px 0' }}>
        <span style={{ fontWeight: 'bold', color: '#457B9D' }}>{label}:</span> {value ?? 'N/A'}
    </div>
);

/*const DocumentoItem: React.FC<{ doc: DocumentoDigital }> = ({ doc }) => {
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fileId = doc.file_id;
    const nombreArchivo = doc.nombre_archivo || 'Archivo sin nombre';

    const handlePreview = async () => {
        if (!fileId) return;
        setError(null);
        try {
            const response = await apiClient.get(`/archivos/descargar/${fileId}?preview=true`, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            setPreviewUrl(url);
            setModalIsOpen(true);
        } catch {
            setError('Archivo no encontrado o error al cargar.');
        }
    };

    const handleDownload = async () => {
        if (!fileId) return;
        try {
            const response = await apiClient.get(`/archivos/descargar/${fileId}`, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert('Error al descargar el archivo.');
        }
    };

    return (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '10px 0', 
            borderBottom: '1px solid #eee' 
        }}>
            <span>{doc.tipo}: {nombreArchivo}</span>
            {fileId ? (
                <div>
                    <button onClick={handlePreview} style={{ marginRight: '10px', color: '#457B9D' }}>
                        Vista Previa
                    </button>
                    <button onClick={handleDownload} style={{ color: '#E63946' }}>
                        Descargar
                    </button>
                </div>
            ) : (
                <span style={{ color: '#E63946' }}>Archivo no disponible</span>
            )}
            {error && <p style={{ color: 'red' }}>{error}</p>}

            <Modal isOpen={modalIsOpen} onRequestClose={() => setModalIsOpen(false)}
                style={{ content: { top: '50%', left: '50%', right: 'auto', bottom: 'auto', marginRight: '-50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%' }}}>
                {previewUrl ? (
                    <iframe src={previewUrl} style={{ width: '100%', height: '80vh', border: 'none' }} />
                ) : (
                    <p>Cargando preview...</p>
                )}
            </Modal>
        </div>
    );
};*/

// Componente principal
const VehiculoDetail: React.FC = () => {
    const { patente } = useParams<{ patente: string }>();
    const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
    const [reporteCostos, setReporteCostos] = useState<ReporteCostosResponse | null>(null);
    const [gastos, setGastos] = useState<GastoUnificado[]>([]);
    const [alertas, setAlertas] = useState<Alerta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [docSeleccionado, setDocSeleccionado] = useState<DocumentoDigital | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    const handleDownload = (fileId: string) => {
        window.open(`${API_URL}/api/archivos/descargar/${fileId}`, '_blank');
    };

    const abrirModalDocumento = async (doc: DocumentoDigital) => {
        setDocSeleccionado(doc);
        setPreviewUrl(null);
        setLoadingPreview(true);
        setArchivoNuevo(null);

        if (!doc.file_id) {
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
                if (!response.ok) throw new Error("Error al cargar");
                const blob = await response.blob();
                setPreviewUrl(URL.createObjectURL(blob));
            }
        } catch (err) {
            console.error("Error cargando preview:", err);
            alert("Error al cargar vista previa. Intentá de nuevo.");
        } finally {
            setLoadingPreview(false);
        }
        setModalIsOpen(true);
    };

    const subirDocumento = async () => {
        if (!docSeleccionado || !archivoNuevo || !vehiculo) return;

        const formData = new FormData();
        formData.append("patente", vehiculo._id);
        formData.append("file", archivoNuevo);

        try {
            await apiClient.post("/api/archivos/subir-documento", formData, {
                params: { tipo: docSeleccionado.tipo },
            });

            alert("Documento subido correctamente");
            setModalIsOpen(false);
            setArchivoNuevo(null);
            cargarDatos(); // Refresca el vehículo
        } catch (error) {
            console.error("Error subiendo documento:", error);
            alert("Error al subir el documento. Reintentá.");
        }
    };

    const cargarDatos = useCallback(async () => {
        if (!patente) return;

        setLoading(true);
        setError(null);

        try {
            const vehData = await fetchVehiculoByPatente(patente);
            setVehiculo(vehData);

            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 12);
            const report = await fetchReporteVehiculo(
                patente,
                startDate.toISOString().split('T')[0],
                new Date().toISOString().split('T')[0]
            );
            setReporteCostos(report);
            setAlertas(report.alertas || []);

            const response = await apiClient.get(`/costos/unificado/${patente}`);
            console.log('DEBUG GASTOS:', response.data);  // Para depurar inconsistencias
            setGastos(response.data.gastos || []);
        } catch (err: unknown) {
            setError('Error al cargar los datos del vehículo.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [patente]);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    const handleBorrarGasto = async (id: string, origen: "costos" | "finanzas") => {
        try {
            await borrarGastoUniversal(id, origen);
            cargarDatos();
        } catch (err: unknown) {
            console.error('Error en handleBorrarGasto:', err);
        }
    };

    if (loading) return <div>Cargando datos del vehículo... ⏳</div>;
    if (error) return <div style={{ color: 'red' }}>❌ {error}</div>;
    if (!vehiculo) return <div>No se encontró el vehículo.</div>;

    return (
        <div style={{ padding: '30px', maxWidth: '900px', margin: '0 auto' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                Detalle del Vehículo: {vehiculo._id}
            </h1>

            {/* SECCIÓN DE INFORMACIÓN BÁSICA */}
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ color: '#457B9D' }}>Información Básica</h2>
                <DetailItem label="Patente Original" value={vehiculo.patente_original} />
                <DetailItem label="Nº Móvil" value={vehiculo.nro_movil} />
                <DetailItem label="Modelo" value={vehiculo.descripcion_modelo} />
                <DetailItem label="Año" value={vehiculo.anio} />
                <DetailItem label="Color" value={vehiculo.color} />
                <DetailItem label="Combustible" value={vehiculo.tipo_combustible} />
                <DetailItem label="Activo" value={vehiculo.activo ? 'Sí' : 'No'} />
            </div>

            {/* ========================================= */}
            {/* SECCIÓN: DOCUMENTOS DIGITALES (GridFS) - 100% FUNCIONAL */}
            {/* ========================================= */}
            <div className="mt-8 border border-slate-300 rounded-xl bg-emerald-50/30 p-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-5">Documentos Digitales</h2>

                {vehiculo?.documentos_digitales == null || vehiculo.documentos_digitales.length === 0 ? (
                    <p className="text-slate-600 italic">No hay documentos configurados para este vehículo.</p>
                ) : (
                    vehiculo.documentos_digitales.map((doc, index) => {
                        const tieneArchivo = !!doc.file_id;
                        return (
                            <div
                                key={index}
                                className="flex justify-between items-center py-4 border-b border-slate-200 last:border-0"
                            >
                                <strong className="text-slate-700">
                                    {doc.tipo.replace(/_/g, " ").toUpperCase()}:
                                </strong>

                                <div className="flex items-center gap-3">
                                    <span
                                        className={`font-bold text-sm px-3 py-1 rounded-full ${
                                            tieneArchivo
                                                ? "bg-emerald-100 text-emerald-800"
                                                : "bg-red-100 text-red-800"
                                        }`}
                                    >
                                        {tieneArchivo ? "Subido" : "Falta"}
                                    </span>

                                    {tieneArchivo && (
                                        <button
                                            onClick={() => handleDownload(doc.file_id!)}
                                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition shadow-md"
                                        >
                                            Descargar {doc.nombre_archivo ? `(${doc.nombre_archivo})` : ""}
                                        </button>
                                    )}

                                    <button
                                        onClick={() => abrirModalDocumento(doc)}
                                        className={`px-5 py-2 text-sm font-bold rounded-lg transition shadow-md ${
                                            tieneArchivo
                                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                                : "bg-red-600 hover:bg-red-700 text-white"
                                        }`}
                                    >
                                        {tieneArchivo ? "Revisar / Reemplazar" : "Subir"}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ========================================= */}
            {/* MODAL PARA REVISAR Y SUBIR DOCUMENTOS */}
            {/* ========================================= */}
            <Modal
                isOpen={modalIsOpen}
                onRequestClose={() => {
                    setModalIsOpen(false);
                    if (previewUrl && previewUrl.startsWith("blob:")) {
                        URL.revokeObjectURL(previewUrl);
                    }
                    setPreviewUrl(null);
                    setArchivoNuevo(null);
                }}
                className="max-w-4xl w-[95%] bg-white rounded-2xl shadow-2xl p-8 outline-none overflow-y-auto max-h-[95vh]"
                overlayClassName="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
                ariaHideApp={false}
            >
                <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">
                    {docSeleccionado?.tipo.replace(/_/g, " ").toUpperCase() || "Documento"}
                </h2>

                {/* SPINNER MIENTRAS CARGA */}
                {loadingPreview ? (
                    <div className="text-center py-20">
                        <div className="spinner-documento"></div>
                        <p className="text-slate-600 text-lg mt-4">Cargando documento...</p>
                        <p className="text-slate-500 text-sm">Puede tardar unos segundos (Render Free)</p>
                    </div>
                ) : previewUrl ? (
                    // VISTA PREVIA
                    docSeleccionado?.nombre_archivo?.toLowerCase().includes(".pdf") ? (
                        <iframe
                            src={previewUrl}
                            className="w-full h-96 md:h-[650px] border border-slate-300 rounded-xl shadow-inner"
                            title="Vista previa PDF"
                            sandbox="allow-same-origin allow-scripts allow-popups"
                        />
                    ) : (
                        <img
                            src={previewUrl}
                            alt="Vista previa"
                            className="max-w-full h-auto rounded-xl border border-slate-300 shadow-lg mx-auto block"
                        />
                    )
                ) : (
                    <div className="text-center py-20">
                        <p className="text-red-600 text-lg font-medium">No se pudo cargar el documento</p>
                        <p className="text-slate-600 mt-3">Intentá de nuevo en 10 segundos</p>
                    </div>
                )}

                {/* INPUT PARA SUBIR ARCHIVO NUEVO */}
                <div className="mt-8">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        {docSeleccionado?.file_id ? "Reemplazar con un nuevo archivo:" : "Subir documento:"}
                    </label>
                    <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => e.target.files?.[0] && setArchivoNuevo(e.target.files[0])}
                        className="block w-full text-sm text-slate-600
                                file:mr-4 file:py-3 file:px-6
                                file:rounded-xl file:border-0
                                file:text-sm file:font-bold
                                file:bg-emerald-600 file:text-white
                                hover:file:bg-emerald-700
                                cursor-pointer"
                    />
                </div>

                {/* BOTONES */}
                <div className="flex justify-end gap-4 mt-10">
                    <button
                        onClick={() => {
                            setModalIsOpen(false);
                            if (previewUrl && previewUrl.startsWith("blob:")) {
                                URL.revokeObjectURL(previewUrl);
                            }
                            setPreviewUrl(null);
                            setArchivoNuevo(null);
                        }}
                        className="px-6 py-3 bg-slate-500 text-white rounded-xl hover:bg-slate-600 transition font-medium"
                    >
                        Cancelar
                    </button>

                    <button
                        onClick={subirDocumento}
                        disabled={!archivoNuevo}
                        className={`px-8 py-3 rounded-xl font-bold transition shadow-lg ${
                            archivoNuevo
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                        }`}
                    >
                        {docSeleccionado?.file_id ? "Reemplazar Documento" : "Subir Documento"}
                    </button>
                </div>
            </Modal>

            {/* SECCIÓN DE ALERTAS */}
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ color: alertas.length > 0 ? '#E63946' : '#457B9D' }}>
                    Alertas ({alertas.length})
                </h2>
                {alertas.length > 0 ? (
                    alertas.map((alerta, index) => (
                        <div key={index} style={{ padding: '10px', background: '#fee', border: '1px solid #E63946', marginBottom: '10px' }}>
                            {alerta.mensaje}
                        </div>
                    ))
                ) : (
                    <p>No hay alertas críticas.</p>
                )}
            </div>

            {/* SECCIÓN DE COSTOS */}
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ color: '#457B9D' }}>Reporte de Costos</h2>
                {reporteCostos ? (
                    <>
                        <p><strong>Total General:</strong> ${reporteCostos.total_general.toLocaleString('es-AR')}</p>
                        <p><strong>Mantenimiento:</strong> ${reporteCostos.total_mantenimiento.toLocaleString('es-AR')}</p>
                        <p><strong>Infracciones:</strong> ${reporteCostos.total_infracciones.toLocaleString('es-AR')}</p>
                    </>
                ) : (
                    <p>No hay datos de costos.</p>
                )}
            </div>

            {/* SECCIÓN DE HISTORIAL DE COSTOS */}
            <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '8px', 
                overflow: 'hidden', 
                backgroundColor: 'white' 
            }}>
                <h2 style={{ padding: '15px', backgroundColor: '#1D3557', color: 'white' }}>
                    Historial de Costos ({gastos.length})
                </h2>
                {gastos.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#f8f9fa' }}>
                            <tr>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Fecha</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Tipo</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Descripción</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>Importe</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gastos.map((gasto, index) => (
                                <tr key={gasto.id || index} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px' }}>{gasto.fecha}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ 
                                            padding: '4px 8px', 
                                            borderRadius: '12px', 
                                            backgroundColor: gasto.tipo === 'Multa' ? '#fee' : '#e6f4ea',
                                            color: gasto.tipo === 'Multa' ? '#c1121f' : '#2d6a4f',
                                            fontWeight: 'bold'
                                        }}>
                                            {gasto.tipo}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px' }}>{gasto.descripcion}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                                        ${gasto.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                        <button 
                                            onClick={() => handleBorrarGasto(gasto.id, gasto.origen === "mantenimiento" ? "costos" : "finanzas")}
                                            style={{ 
                                                background: '#dc3545', 
                                                color: 'white', 
                                                border: 'none', 
                                                padding: '10px 20px', 
                                                borderRadius: '8px', 
                                                cursor: 'pointer', 
                                                fontWeight: 'bold',
                                                fontSize: '0.95em',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                transition: 'background 0.3s'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = '#c82333'}
                                            onMouseOut={(e) => e.currentTarget.style.background = '#dc3545'}
                                            disabled={loading}
                                        >
                                            Borrar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ padding: '20px', textAlign: 'center' }}>No hay costos registrados.</div>
                )}
            </div>

            {/* SECCIÓN PARA AGREGAR NUEVO COSTO */}
            <div style={{ marginTop: '30px' }}>
                <h2 style={{ color: '#457B9D' }}>Agregar Nuevo Costo</h2>
                <CostoForm 
                    initialPatente={patente}
                    onSuccess={cargarDatos}  // Refrescar después de agregar
                />
            </div>

            <Link to="/vehiculos" style={{ display: 'block', marginTop: '30px', color: '#457B9D', textDecoration: 'none', fontWeight: 'bold' }}>
                ← Volver al Listado de Vehículos
            </Link>
        </div>
    );
};

export default VehiculoDetail;