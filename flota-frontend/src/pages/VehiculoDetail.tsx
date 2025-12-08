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

const DocumentoItem: React.FC<{ doc: DocumentoDigital }> = ({ doc }) => {
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
};

// Componente principal
const VehiculoDetail: React.FC = () => {
    const { patente } = useParams<{ patente: string }>();
    const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
    const [reporteCostos, setReporteCostos] = useState<ReporteCostosResponse | null>(null);
    const [gastos, setGastos] = useState<GastoUnificado[]>([]);
    const [alertas, setAlertas] = useState<Alerta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

            {/* SECCIÓN DE DOCUMENTOS DIGITALES */}
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ color: '#457B9D' }}>Documentos Digitales</h2>
                
                {vehiculo.documentos_digitales?.length ? (
                    vehiculo.documentos_digitales.map((doc, index) => (
                        <DocumentoItem key={index} doc={doc} />
                    ))
                ) : (
                    <p>No hay documentos digitales disponibles.</p>
                )}
            </div>

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