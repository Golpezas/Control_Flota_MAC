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
    apiClient  // ← Ahora sí está exportado
} from '../api/vehiculos';
import CostoForm from '../components/CostoForm';

// Interface para gastos que vienen del endpoint /costos/unificado
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

    const fileId = doc.file_id;
    const nombreArchivo = doc.nombre_archivo || 'Archivo sin nombre';

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
                    <button onClick={() => setModalIsOpen(true)} style={{ marginRight: '10px', color: '#457B9D' }}>
                        Vista Previa
                    </button>
                    <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/archivos/descargar/${fileId}`} download style={{ color: '#E63946' }}>
                        Descargar
                    </a>
                </div>
            ) : (
                <span style={{ color: '#E63946' }}>Archivo no disponible</span>
            )}

            <Modal isOpen={modalIsOpen} onRequestClose={() => setModalIsOpen(false)}
                style={{ content: { top: '50%', left: '50%', right: 'auto', bottom: 'auto', marginRight: '-50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%' }}}>
                <iframe src={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/archivos/descargar/${fileId}?preview=true`} 
                        style={{ width: '100%', height: '80vh', border: 'none' }} />
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
            const [vehData, reportData, gastosData] = await Promise.all([
                fetchVehiculoByPatente(patente),
                fetchReporteVehiculo(patente, '2024-01-01', new Date().toISOString().split('T')[0]),
                apiClient.get(`/costos/unificado/${patente}`)
            ]);

            setVehiculo(vehData);
            setReporteCostos(reportData);
            setAlertas(reportData.alertas || []);
            setGastos(gastosData.data.gastos || []);
        } catch {
            setError('Error al cargar los datos del vehículo.');
        } finally {
            setLoading(false);
        }
    }, [patente]);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    const handleBorrarGasto = async (id: string, origenRaw: string) => {
        const origen: "costos" | "finanzas" = origenRaw === "mantenimiento" ? "costos" : "finanzas";
        try {
            await borrarGastoUniversal(id, origen);
            cargarDatos(); // Refresca todo
        } catch {
            // borrarGastoUniversal ya muestra el alert
        }
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>;
    if (error) return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>;
    if (!vehiculo) return <div>Vehículo no encontrado</div>;

    return (
        <div style={{ padding: '30px', maxWidth: '1000px', margin: '0 auto' }}>
            <h1 style={{ color: '#1D3557', borderBottom: '3px solid #457B9D', paddingBottom: '10px' }}>
                Detalle del Vehículo: {vehiculo._id}
            </h1>

            {/* Información básica */}
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <h2 style={{ color: '#457B9D' }}>Información Básica</h2>
                <DetailItem label="Patente Original" value={vehiculo.patente_original} />
                <DetailItem label="Móvil" value={vehiculo.nro_movil} />
                <DetailItem label="Modelo" value={vehiculo.descripcion_modelo} />
                <DetailItem label="Año" value={vehiculo.anio} />
                <DetailItem label="Color" value={vehiculo.color} />
                <DetailItem label="Combustible" value={vehiculo.tipo_combustible} />
                <DetailItem label="Estado" value={vehiculo.activo ? 'Activo' : 'Inactivo'} />
            </div>

            {/* Documentos */}
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <h2 style={{ color: '#457B9D' }}>Documentos Digitales</h2>
                {vehiculo.documentos_digitales && vehiculo.documentos_digitales.length > 0 ? (
                    vehiculo.documentos_digitales.map((doc, i) => <DocumentoItem key={i} doc={doc} />)
                ) : (
                    <p>No hay documentos cargados.</p>
                )}
            </div>

            {/* Alertas */}
            {alertas.length > 0 && (
                <div style={{ background: '#fff3cd', padding: '15px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #ffeaa7' }}>
                    <h2 style={{ color: '#E63946' }}>Alertas Críticas ({alertas.length})</h2>
                    {alertas.map((a, i) => (
                        <div key={i} style={{ padding: '8px 0', color: '#721c24' }}>• {a.mensaje}</div>
                    ))}
                </div>
            )}

            {/* Reporte de costos */}
            {reporteCostos && (
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <h2 style={{ color: '#457B9D' }}>Reporte de Costos (Últimos 12 meses)</h2>
                    <p><strong>Total General:</strong> ${reporteCostos.total_general.toLocaleString('es-AR')}</p>
                    <p><strong>Mantenimiento:</strong> ${reporteCostos.total_mantenimiento.toLocaleString('es-AR')}</p>
                    <p><strong>Infracciones:</strong> ${reporteCostos.total_infracciones.toLocaleString('es-AR')}</p>
                </div>
            )}

            {/* Historial de costos */}
            <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <h2 style={{ background: '#1D3557', color: 'white', padding: '15px', margin: 0 }}>
                    Historial de Costos ({gastos.length})
                </h2>
                {gastos.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f1f3f5' }}>
                            <tr>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Fecha</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Tipo</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Descripción</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>Importe</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gastos.map(g => (
                                <tr key={g.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px' }}>{g.fecha}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{
                                            padding: '4px 10px',
                                            borderRadius: '20px',
                                            backgroundColor: g.tipo === 'Multa' ? '#ffebee' : '#e8f5e8',
                                            color: g.tipo === 'Multa' ? '#c62828' : '#2e7d32',
                                            fontWeight: 'bold',
                                            fontSize: '0.85em'
                                        }}>
                                            {g.tipo}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px' }}>{g.descripcion}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                                        ${g.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => handleBorrarGasto(g.id, g.origen)}
                                            style={{
                                                background: '#dc3545',
                                                color: 'white',
                                                border: 'none',
                                                padding: '8px 16px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontWeight: 'bold'
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#c82333'}
                                            onMouseOut={e => e.currentTarget.style.background = '#dc3545'}
                                        >
                                            Borrar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                        No hay costos registrados para este vehículo.
                    </div>
                )}
            </div>

            {/* Formulario para nuevo costo */}
            <div style={{ marginTop: '40px' }}>
                <h2 style={{ color: '#457B9D' }}>Agregar Nuevo Costo</h2>
                <CostoForm initialPatente={patente} onSuccess={cargarDatos} />
            </div>

            <Link to="/vehiculos" style={{ display: 'block', marginTop: '40px', color: '#457B9D', fontWeight: 'bold', textDecoration: 'none' }}>
                ← Volver al Listado de Vehículos
            </Link>
        </div>
    );
};

export default VehiculoDetail;