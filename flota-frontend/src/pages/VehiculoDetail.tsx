// src/pages/VehiculoDetail.tsx

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Modal from 'react-modal';
import type { 
    Vehiculo, 
    Alerta, 
    DocumentoDigital, 
} from '../api/models/vehiculos'; 
import { 
    fetchVehiculoByPatente,
    borrarGastoUniversal,
    apiClient 
} from '../api/vehiculos';
import CostoForm from '../components/CostoForm';
import axios from 'axios';
import { normalizePatente } from '../utils/data-utils';

// Interface unificada para gastos (compatible con backend actualizado)
interface GastoUnificado {
    id: string;
    fecha: string;
    tipo: string;
    descripcion: string;
    importe: number;
    origen: 'mantenimiento' | 'finanzas';
    comprobante_file_id?: string;
}

// Componente auxiliar
const DetailItem: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
    <div style={{ borderBottom: '1px dotted #ccc', padding: '5px 0' }}>
        <span style={{ fontWeight: 'bold', color: '#457B9D' }}>{label}:</span> {value ?? 'N/A'}
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

    // Estados para modal de documentos
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [docSeleccionado, setDocSeleccionado] = useState<DocumentoDigital | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null);

    const [modalComprobanteOpen, setModalComprobanteOpen] = useState(false);
    const [comprobantePreviewUrl, setComprobantePreviewUrl] = useState<string | null>(null);
    const [comprobanteLoading, setComprobanteLoading] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    // =========================================
    // FUNCIONES PARA DOCUMENTOS DIGITALES (tu código original, perfecto)
    // =========================================

    const abrirComprobante = async (fileId: string) => {
        setComprobantePreviewUrl(null);
        setComprobanteLoading(true);
        setModalComprobanteOpen(true);

        try {
            const timestamp = Date.now();
            const url = `${API_URL}/api/archivos/descargar/${fileId}?preview=true&t=${timestamp}`;

            // Siempre usamos blob (como en imágenes de documentos digitales)
            // Esto funciona perfecto para PNG, JPG y PDF
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Error al cargar (HTTP ${response.status})`);
            }
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            setComprobantePreviewUrl(blobUrl);

        } catch (err) {
            console.error("Error cargando comprobante:", err);
            alert("Error al cargar el comprobante. Intentá refrescar la página.");
        } finally {
            setComprobanteLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setArchivoNuevo(e.target.files[0]);
        }
    };

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

    const subirDocumento = async () => {
        if (!docSeleccionado || !archivoNuevo || !vehiculo) {
            alert("Faltan datos: selecciona documento y archivo.");
            return;
        }

        const formData = new FormData();
        formData.append("patente", normalizePatente(vehiculo._id));
        formData.append("tipo", docSeleccionado.tipo);
        formData.append("file", archivoNuevo);

        try {
            // FORZAMOS EL HEADER CORRECTO (esto es clave)
            const response = await apiClient.post("/api/archivos/subir-documento", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",  // ← FORZAMOS (Axios a veces lo pierde)
                },
                timeout: 60000,
            });

            console.log("Subida exitosa:", response.data);
            alert(`✅ Documento "${docSeleccionado.tipo.replace(/_/g, " ")}" subido correctamente`);

            setModalIsOpen(false);
            setArchivoNuevo(null);
            await cargarDatos();  // Refresca la lista de documentos

        } catch (error: unknown) {
            console.error("Error subiendo documento:", error);

            let msg = "Error al subir el documento.";
            if (axios.isAxiosError(error) && error.response) {
                msg += ` (Status: ${error.response.status})`;
                if (error.response.data?.detail) {
                    msg += ` - ${JSON.stringify(error.response.data.detail)}`;
                }
            }
            alert(`❌ ${msg} Reintentá o verifica el archivo.`);
        }
    };

    // =========================================
    // CARGA DE DATOS
    // =========================================
    const cargarDatos = useCallback(async () => {
        if (!patente) return;

        setLoading(true);
        setError(null);

        try {
            // 1. Vehículo
            const vehData = await fetchVehiculoByPatente(patente);
            setVehiculo(vehData);

            // 2. Alertas (del reporte general)
            const report = await apiClient.get(`/vehiculos/${patente}/reporte?start_date=2023-01-01&end_date=${new Date().toISOString().split('T')[0]}`);
            setAlertas(report.data.alertas || []);

            // 3. GASTOS UNIFICADOS (única fuente de verdad)
            const response = await apiClient.get(`/costos/unificado/${patente}`);
            console.log('DEBUG GASTOS UNIFICADOS:', response.data);

            const data = response.data;
            setGastosUnificados(data.gastos || []);
            setTotalGeneral(data.total_general || 0);
            setTotalMantenimiento(data.total_mantenimiento || 0);
            setTotalMultas(data.total_multas || 0);

        } catch (err: unknown) {
            setError('Error al cargar los datos del vehículo.');
            console.error('Error en cargarDatos:', err);
        } finally {
            setLoading(false);
        }
    }, [patente]);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    // Corrección del error de tipos: origen debe coincidir con la función
    const handleBorrarGasto = async (id: string, origen: 'mantenimiento' | 'finanzas') => {
        try {
            // La función espera "costos" para mantenimiento y "finanzas" para multas
            const coleccion = origen === 'mantenimiento' ? 'costos' : 'finanzas';
            await borrarGastoUniversal(id, coleccion);
            await cargarDatos();
        } catch (err: unknown) {
            console.error('Error borrando gasto:', err);
            alert("Error al borrar el gasto");
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

            {/* INFORMACIÓN BÁSICA */}
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

            {/* DOCUMENTOS DIGITALES (tu código original completo) */}
            <div style={{ backgroundColor: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '32px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '20px' }}>Documentos Digitales</h2>
                {vehiculo?.documentos_digitales == null || vehiculo.documentos_digitales.length === 0 ? (
                    <p style={{ color: '#475569', fontStyle: 'italic' }}>No hay documentos configurados para este vehículo.</p>
                ) : (
                    vehiculo.documentos_digitales.map((doc, index) => {
                        const tieneArchivo = !!doc.file_id;
                        return (
                            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #e2e8f0' }}>
                                <strong style={{ color: '#1e293b' }}>
                                    {doc.tipo.replace(/_/g, " ").toUpperCase()}:
                                </strong>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{
                                        fontWeight: 'bold',
                                        fontSize: '0.875rem',
                                        padding: '4px 12px',
                                        borderRadius: '9999px',
                                        backgroundColor: tieneArchivo ? '#d1fae5' : '#fee2e2',
                                        color: tieneArchivo ? '#059669' : '#ef4444',
                                    }}>
                                        {tieneArchivo ? "Subido" : "Falta"}
                                    </span>
                                    {tieneArchivo && (
                                        <button onClick={() => handleDownload(doc.file_id!)} style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px' }}>
                                            Descargar {doc.nombre_archivo ? `(${doc.nombre_archivo})` : ""}
                                        </button>
                                    )}
                                    <button onClick={() => abrirModalDocumento(doc)} style={{
                                        padding: '8px 16px',
                                        backgroundColor: tieneArchivo ? '#d97706' : '#dc2626',
                                        color: 'white',
                                        borderRadius: '8px'
                                    }}>
                                        {tieneArchivo ? "Revisar / Reemplazar" : "Subir"}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* MODAL PARA SUBIR / REVISAR DOCUMENTO */}
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

            {/* ALERTAS */}
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ color: alertas.length > 0 ? '#E63946' : '#457B9D' }}>
                    Alertas ({alertas.length})
                </h2>
                {alertas.length > 0 ? alertas.map((alerta, index) => (
                    <div key={index} style={{ padding: '10px', background: '#fee', border: '1px solid #E63946', marginBottom: '10px' }}>
                        {alerta.mensaje}
                    </div>
                )) : <p>No hay alertas críticas.</p>}
            </div>

            {/* TOTALES DE COSTOS */}
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ color: '#457B9D', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    Reporte de Costos (Todos los registros)
                </h2>
                <p><strong>Total General:</strong> ${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                <p><strong>Mantenimiento:</strong> ${totalMantenimiento.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                <p><strong>Infracciones:</strong> ${totalMultas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            </div>

            {/* HISTORIAL DE COSTOS */}
            <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
                <h2 style={{ padding: '15px', backgroundColor: '#1D3557', color: 'white' }}>
                    Historial de Costos ({gastosUnificados.length})
                </h2>
                {gastosUnificados.length > 0 ? (
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
                            {gastosUnificados.map((gasto) => (
                                <tr key={gasto.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px' }}>{gasto.fecha.split('T')[0]}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ 
                                            padding: '4px 8px', 
                                            borderRadius: '12px', 
                                            backgroundColor: gasto.tipo.toLowerCase().includes('multa') ? '#fee' : '#e6f4ea',
                                            color: gasto.tipo.toLowerCase().includes('multa') ? '#c1121f' : '#2d6a4f',
                                            fontWeight: 'bold'
                                        }}>
                                            {gasto.tipo}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {gasto.descripcion}
                                        {gasto.comprobante_file_id && (
                                            <button 
                                                onClick={() => abrirComprobante(gasto.comprobante_file_id!)}
                                                style={{ marginLeft: '10px', fontSize: '0.8em', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                            >
                                                👁️ Ver comprobante
                                            </button>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                                        ${gasto.importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                        <button onClick={() => handleBorrarGasto(gasto.id, gasto.origen)}
                                            style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}>
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

            {/* AGREGAR COSTO */}
            <div style={{ marginTop: '30px' }}>
                <h2 style={{ color: '#457B9D' }}>Agregar Nuevo Costo</h2>
                <CostoForm initialPatente={patente} onSuccess={cargarDatos} />
            </div>

            <Link to="/vehiculos" style={{ display: 'block', marginTop: '30px', color: '#457B9D', textDecoration: 'none', fontWeight: 'bold' }}>
                ← Volver al Listado de Vehículos
            </Link>

            {/* MODAL PARA VER COMPROBANTE DE COSTO */}
            <Modal
                isOpen={modalComprobanteOpen}
                onRequestClose={() => {
                    setModalComprobanteOpen(false);
                    if (comprobantePreviewUrl && comprobantePreviewUrl.startsWith("blob:")) {
                        URL.revokeObjectURL(comprobantePreviewUrl);
                    }
                    setComprobantePreviewUrl(null);
                }}
                style={{
                    content: {
                        top: '50%',
                        left: '50%',
                        right: 'auto',
                        bottom: 'auto',
                        marginRight: '-50%',
                        transform: 'translate(-50%, -50%)',
                        width: '90%',
                        maxWidth: '900px',
                        height: '80%',
                        padding: '20px',
                        borderRadius: '16px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                    }
                }}
                ariaHideApp={false}
            >
                <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#1D3557' }}>
                    Comprobante del Costo
                </h2>

                {comprobanteLoading ? (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <p>Cargando comprobante...</p>
                    </div>
                ) : comprobantePreviewUrl ? (
                    <iframe
                        src={comprobantePreviewUrl || ''}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        title="Comprobante del Costo"
                        allowFullScreen
                    />
                ) : (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <p style={{ color: 'red' }}>No se pudo cargar el comprobante</p>
                    </div>
                )}

                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button
                        onClick={() => {
                            setModalComprobanteOpen(false);
                            if (comprobantePreviewUrl && comprobantePreviewUrl.startsWith("blob:")) {
                                URL.revokeObjectURL(comprobantePreviewUrl);
                            }
                        }}
                        style={{ padding: '10px 20px', background: '#64748b', color: 'white', borderRadius: '8px' }}
                    >
                        Cerrar
                    </button>
                </div>
            </Modal>    

        </div>
    );
};

export default VehiculoDetail;