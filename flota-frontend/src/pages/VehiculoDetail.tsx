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

    // =========================================
    // FUNCIONES PARA DOCUMENTOS DIGITALES
    // =========================================
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    // 1. Maneja el cambio en el input file
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setArchivoNuevo(e.target.files[0]);
        }
    };

    // 2. Descarga directa (funciona perfecto)
    const handleDownload = (fileId: string) => {
        window.open(`${API_URL}/api/archivos/descargar/${fileId}`, '_blank');
    };

    // 3. Abre el modal con vista previa (PDF directo, imágenes con blob)
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
                // PDF: URL directa → más rápido y sin problemas de blob
                setPreviewUrl(url);
            } else {
                // Imágenes: blob para mejor compatibilidad
                const response = await fetch(url, { cache: "no-store" });
                if (!response.ok) throw new Error("No se pudo cargar");
                const blob = await response.blob();
                setPreviewUrl(URL.createObjectURL(blob));
            }
        } catch (err) {
            console.error("Error cargando vista previa:", err);
            alert("Error al cargar el documento. Reintentá en 10 segundos.");
        } finally {
            setLoadingPreview(false);
        }

        setModalIsOpen(true);
    };

    // 4. Sube o reemplaza el documento
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
            cargarDatos(); // Refresca todo
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
        <div style={{ padding: '30px', maxWidth: '900px', margin: '0 auto', backgroundColor: '#f8fafc', color: '#1e293b' }}>
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
            {/* SECCIÓN: DOCUMENTOS DIGITALES (GridFS) - FIXEADO */}
            {/* ========================================= */}
            <div style={{ backgroundColor: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '32px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '20px' }}>Documentos Digitales</h2>

                {vehiculo?.documentos_digitales == null || vehiculo.documentos_digitales.length === 0 ? (
                    <p style={{ color: '#475569', fontStyle: 'italic' }}>No hay documentos configurados para este vehículo.</p>
                ) : (
                    vehiculo.documentos_digitales.map((doc, index) => {
                        const tieneArchivo = !!doc.file_id;
                        return (
                            <div
                                key={index}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #e2e8f0' }}
                            >
                                <strong style={{ color: '#1e293b' }}>
                                    {doc.tipo.replace(/_/g, " ").toUpperCase()}:
                                </strong>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span
                                        style={{
                                            fontWeight: 'bold',
                                            fontSize: '0.875rem',
                                            padding: '4px 12px',
                                            borderRadius: '9999px',
                                            backgroundColor: tieneArchivo ? '#d1fae5' : '#fee2e2',
                                            color: tieneArchivo ? '#059669' : '#ef4444',
                                        }}
                                    >
                                        {tieneArchivo ? "Subido" : "Falta"}
                                    </span>

                                    {tieneArchivo && (
                                        <button
                                            onClick={() => handleDownload(doc.file_id!)}
                                            style={{
                                                padding: '8px 16px',
                                                backgroundColor: '#2563eb',
                                                color: 'white',
                                                fontSize: '0.875rem',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                transition: 'background-color 0.3s',
                                            }}
                                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
                                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                                        >
                                            Descargar {doc.nombre_archivo ? `(${doc.nombre_archivo})` : ""}
                                        </button>
                                    )}

                                    <button
                                        onClick={() => abrirModalDocumento(doc)}
                                        style={{
                                            padding: '8px 16px',
                                            fontSize: '0.875rem',
                                            fontWeight: 'bold',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.3s',
                                            backgroundColor: tieneArchivo ? '#d97706' : '#dc2626',
                                            color: 'white',
                                        }}
                                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = tieneArchivo ? '#b45309' : '#b91c1c')}
                                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = tieneArchivo ? '#d97706' : '#dc2626')}
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
            {/* MODAL PARA SUBIR / REVISAR DOCUMENTO - FIXEADO */}
            {/* ========================================= */}
            <Modal
                isOpen={modalIsOpen}
                onRequestClose={() => {
                    setModalIsOpen(false);
                    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                }}
                style={{
                    content: {
                        backgroundColor: 'white',
                        color: 'black',
                        maxWidth: '80%',
                        maxHeight: '80%',
                        top: '50%',
                        left: '50%',
                        right: 'auto',
                        bottom: 'auto',
                        marginRight: '-50%',
                        transform: 'translate(-50%, -50%)',
                        padding: '32px',
                        borderRadius: '16px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                        overflowY: 'auto'
                    }
                }}
                ariaHideApp={false}
            >
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '24px', textAlign: 'center' }}>
                    {docSeleccionado?.tipo.replace(/_/g, " ").toUpperCase() || "Documento"}
                </h2>

                {loadingPreview ? (
                    <div style={{ textAlign: 'center', padding: '80px 0' }}>
                        <div className="spinner-documento"></div>
                        <p style={{ color: '#475569', fontSize: '1.125rem', marginTop: '16px' }}>Cargando documento...</p>
                        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Puede tardar unos segundos (Render Free)</p>
                    </div>
                ) : previewUrl ? (
                    docSeleccionado?.nombre_archivo?.toLowerCase().includes(".pdf") ? (
                        <iframe
                            src={previewUrl}
                            style={{ width: '100%', height: '500px', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                            title="Vista previa PDF"
                        />
                    ) : (
                        <img
                            src={previewUrl}
                            alt="Vista previa"
                            style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', margin: '0 auto', display: 'block' }}
                        />
                    )
                ) : (
                    <div style={{ textAlign: 'center', padding: '80px 0' }}>
                        <p style={{ color: '#ef4444', fontSize: '1.125rem', fontWeight: 'medium' }}>No se pudo cargar el documento</p>
                        <p style={{ color: '#475569', marginTop: '12px' }}>Intentá de nuevo en 10 segundos</p>
                    </div>
                )}

                <div style={{ marginTop: '32px' }}>
                    <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileChange}
                        style={{ display: 'block', width: '100%', fontSize: '0.875rem', color: '#475569' }}
                        className="file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '40px' }}>
                    <button
                        onClick={() => {
                            setModalIsOpen(false);
                            if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
                            setPreviewUrl(null);
                        }}
                        style={{ padding: '12px 24px', backgroundColor: '#64748b', color: 'white', borderRadius: '12px', cursor: 'pointer', transition: 'background-color 0.3s', fontWeight: 'bold' }}
                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#475569')}
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#64748b')}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={subirDocumento}
                        disabled={!archivoNuevo}
                        style={{
                            padding: '12px 32px',
                            borderRadius: '12px',
                            fontWeight: 'bold',
                            transition: 'background-color 0.3s',
                            backgroundColor: archivoNuevo ? '#059669' : '#d1d5db',
                            color: archivoNuevo ? 'white' : '#9ca3af',
                            cursor: archivoNuevo ? 'pointer' : 'not-allowed',
                        }}
                        onMouseOver={(e) => archivoNuevo && (e.currentTarget.style.backgroundColor = '#047857')}
                        onMouseOut={(e) => archivoNuevo && (e.currentTarget.style.backgroundColor = '#059669')}
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