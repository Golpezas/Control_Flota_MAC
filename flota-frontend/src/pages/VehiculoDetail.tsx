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

type VehiculoConLegacy = Vehiculo & {
    ANIO?: number;
    COLOR?: string;
    NRO_MOVIL?: string;
    DESCRIPCION_MODELO?: string;
    MODELO?: string;
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
            
            const fechasIniciales: Record<string, string> = {};
            datosBD.forEach((doc: DocumentoResponse) => {
                if (doc.fecha_vencimiento) {
                    const fechaISO = new Date(doc.fecha_vencimiento).toISOString().split('T')[0];
                    // Unificamos lectura a clave 'SEGURO' si viene legacy de BD
                    const key = doc.tipo_documento === 'Poliza_Detalle' ? 'SEGURO' : doc.tipo_documento;
                    fechasIniciales[key] = fechaISO;
                }
            });
            setFechasVencimiento(fechasIniciales);
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

    const guardarVencimiento = async (tipoFrontend: string) => {
        const fecha = fechasVencimiento[tipoFrontend];
        if (!fecha || !patente) return;

        // Ya no forzamos el nombre a Poliza_Detalle, enviamos lo que tenemos
        const tipoBackend = tipoFrontend;

        try {
            await apiClient.put(`/documentacion/${patente}/${tipoBackend}`, {
                fecha_vencimiento: new Date(fecha).toISOString()
            });
            alert(`Fecha de ${tipoFrontend} actualizada correctamente`);
            setEditingVencimientos(prev => ({ ...prev, [tipoFrontend]: false }));
            await cargarVencimientosBD();
        } catch (err) {
            console.error("Error al guardar vencimiento:", err);
            alert("Error al actualizar la fecha.");
        }
    };

    if (loading) return <div>Cargando... ⏳</div>;
    if (error) return <div style={{ color: 'red', padding: '20px' }}>❌ {error}</div>;
    if (!vehiculo) return <div>No encontrado.</div>;

    const v = vehiculo as VehiculoConLegacy;

    return (
        <div style={{ padding: '30px', maxWidth: '900px', margin: '0 auto', backgroundColor: '#f8fafc', color: '#1e293b' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                Detalle del Vehículo: {vehiculo._id}
            </h1>

            {/* 1. INFORMACIÓN BÁSICA */}
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ color: '#457B9D' }}>Información Básica</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <DetailItem label="Nº Móvil" value={v.nro_movil || v.NRO_MOVIL} />
                    <DetailItem label="Modelo" value={v.descripcion_modelo || v.DESCRIPCION_MODELO || v.MODELO } />
                    <DetailItem label="Año" value={v.anio || v.ANIO} />
                    <DetailItem label="Color" value={v.color || v.COLOR} />
                    <DetailItem label="Combustible" value={v.tipo_combustible || v.TIPO_COMBUSTIBLE} />
                    <DetailItem label="Activo" value={v.activo ? 'Sí' : 'No'} />
                </div>
            </div>

            {/* 2. DOCUMENTOS DIGITALES (CHECKLIST) */}
            <div style={{ backgroundColor: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '32px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '20px' }}>
                    Documentos Digitales
                </h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {DOCUMENTOS_ESTANDAR.map((itemEstandar) => {
                        const docExistente = (v.documentos_digitales || []).find(
                            d => d.tipo.toUpperCase() === itemEstandar.tipo || 
                                 d.tipo.toUpperCase().replace(/_/g, ' ') === itemEstandar.label
                        );
                        const tieneArchivo = !!docExistente?.file_id;

                        return (
                            <div key={itemEstandar.tipo} style={{ 
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                                padding: '16px', backgroundColor: 'white', borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                borderLeft: `5px solid ${tieneArchivo ? '#059669' : '#ef4444'}`
                            }}>
                                <div>
                                    <strong style={{ color: '#1e293b', fontSize: '1.1em', display: 'block' }}>
                                        {itemEstandar.label}
                                    </strong>
                                    <span style={{ fontSize: '0.85em', color: tieneArchivo ? '#059669' : '#ef4444' }}>
                                        {tieneArchivo ? '✅ Documento cargado' : '❌ Pendiente de carga'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {tieneArchivo && (
                                        <button onClick={() => handleDownload(docExistente!.file_id!)} style={{ padding: '8px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                            📥
                                        </button>
                                    )}
                                    <button onClick={() => abrirModalDocumento(docExistente || { tipo: itemEstandar.tipo })} style={{ padding: '8px 16px', backgroundColor: tieneArchivo ? '#d97706' : '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                        {tieneArchivo ? "Reemplazar" : "SUBIR"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3. VENCIMIENTOS CRÍTICOS */}
            <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '2px solid #457B9D', marginTop: '32px', boxShadow: '0 4px 10px rgba(69, 123, 157, 0.2)' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1D3557', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                📅 Vencimientos Críticos
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {[
                { key: 'SEGURO', label: 'Póliza de Seguro' },
                { key: 'VTV', label: 'VTV' }
                ].map(({ key, label }) => {
                
                // Búsqueda flexible para soportar nombres nuevos y viejos
                const doc = vencimientosBD.find(d => 
                    d.tipo_documento === key || 
                    (key === 'SEGURO' && d.tipo_documento === 'Poliza_Detalle')
                ); 

                const fechaRaw = fechasVencimiento[key] || doc?.fecha_vencimiento;
                const fechaStr = fechaRaw
                    ? new Date(fechaRaw).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
                    : 'Sin fecha asignada';

                const isEditing = editingVencimientos[key];

                return (
                    <div key={key} style={{ padding: '15px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                        <div>
                        <strong style={{ fontSize: '1.1em', color: '#1D3557' }}>{label}</strong>
                        <div style={{ marginTop: '5px', fontSize: '1.2em', fontWeight: 'bold', color: fechaStr.includes('Sin') ? '#E63946' : '#059669' }}>
                            {fechaStr}
                        </div>
                        </div>

                        {isEditing ? (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                            type="date"
                            value={fechasVencimiento[key] || ''}
                            onChange={(e) => setFechasVencimiento(prev => ({ ...prev, [key]: e.target.value }))}
                            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc', minWidth: '180px' }}
                            />
                            <button
                            onClick={() => guardarVencimiento(key)}
                            style={{ background: '#059669', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                            Guardar
                            </button>
                            <button
                            onClick={() => setEditingVencimientos(prev => ({ ...prev, [key]: false }))}
                            style={{ background: '#64748b', color: 'white', padding: '10px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                            >
                            Cancelar
                            </button>
                        </div>
                        ) : (
                        <button
                            onClick={() => setEditingVencimientos(prev => ({ ...prev, [key]: true }))}
                            style={{ background: '#f59e0b', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            ✏️ Modificar
                        </button>
                        )}
                    </div>
                    </div>
                );
                })}
            </div>
            </div>

            {/* 4. ALERTAS */}
            {alertas.length > 0 && (
                <div style={{ marginTop: '40px' }}>
                    <h2 style={{ color: '#E63946', fontSize: '1.6rem', fontWeight: 'bold', marginBottom: '20px' }}>
                        ⚠️ Alertas Activas
                    </h2>
                    {alertas.map((alerta, index) => (
                        <div key={index} style={{ padding: '15px', backgroundColor: '#fff5f5', borderLeft: '5px solid #E63946', marginBottom: '10px', borderRadius: '4px' }}>
                            <strong>{alerta.mensaje}</strong>
                        </div>
                    ))}
                </div>
            )}

            {/* 5. HISTORIAL DE COSTOS Y FORMULARIO */}
            <div style={{ marginTop: '40px' }}>
                <h2 style={{ color: '#457B9D', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>Historial de Costos</h2>
                
                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', flex: 1 }}>
                        <div style={{ fontSize: '0.9em', color: '#666' }}>Total General</div>
                        <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#1D3557' }}>
                            ${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', flex: 1 }}>
                        <div style={{ fontSize: '0.9em', color: '#666' }}>Mantenimiento</div>
                        <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#2d6a4f' }}>
                            ${totalMantenimiento.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', flex: 1 }}>
                        <div style={{ fontSize: '0.9em', color: '#666' }}>Infracciones</div>
                        <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#E63946' }}>
                            ${totalMultas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>

                <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white', marginBottom: '30px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#f8f9fa' }}>
                            <tr>
                                <th style={{ padding: '12px' }}>Fecha</th>
                                <th style={{ padding: '12px' }}>Tipo</th>
                                <th style={{ padding: '12px' }}>Descripción</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>Importe</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gastosUnificados.map((gasto) => (
                                <tr key={gasto.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px' }}>{gasto.fecha.split('T')[0]}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ padding: '4px 8px', borderRadius: '12px', backgroundColor: '#e6f4ea', color: '#2d6a4f', fontSize: '0.9em', fontWeight: 'bold' }}>
                                            {gasto.tipo}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {gasto.descripcion}
                                        {gasto.comprobante_file_id && (
                                            <button onClick={() => abrirComprobante(gasto.comprobante_file_id!)} style={{ marginLeft: '10px', border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer' }}>👁️</button>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'right' }}>${gasto.importe.toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                        <button onClick={() => editarGasto(gasto)} style={{ marginRight: '5px', border: 'none', background: 'none', cursor: 'pointer' }}>✏️</button>
                                        <button onClick={() => handleBorrarGasto(gasto.id, gasto.origen)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'red' }}>🗑️</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {gastosUnificados.length === 0 && <div style={{ padding: '20px', textAlign: 'center' }}>No hay costos registrados.</div>}
                </div>

                <h2 style={{ color: '#457B9D' }}>{editingGasto ? 'Editar Costo' : 'Agregar Nuevo Costo'}</h2>
                <CostoForm 
                    initialPatente={patente || ''}
                    initialGasto={editingGasto}
                    onSuccess={() => { cargarDatos(); setEditingGasto(null); }}
                />
            </div>

            <Link to="/vehiculos" style={{ display: 'block', marginTop: '30px', color: '#457B9D', fontWeight: 'bold', textDecoration: 'none' }}>← Volver al Listado</Link>

            {/* MODALES */}
            <Modal isOpen={modalIsOpen} onRequestClose={() => setModalIsOpen(false)} ariaHideApp={false} style={{ content: { maxWidth: '600px', margin: 'auto', borderRadius: '12px' } }}>
                <h2 style={{textAlign: 'center'}}>{docSeleccionado?.tipo}</h2>
                {loadingPreview ? <p style={{textAlign: 'center'}}>Cargando...</p> : previewUrl ? <iframe src={previewUrl} style={{width:'100%', height:'400px'}} /> : <p style={{textAlign: 'center'}}>Sube un archivo</p>}
                <input type="file" onChange={handleFileChange} style={{marginTop:'20px', width: '100%'}} />
                <div style={{marginTop:'20px', display:'flex', justifyContent:'flex-end', gap:'10px'}}>
                    <button onClick={() => setModalIsOpen(false)} style={{padding:'10px', background:'#ccc', border:'none', borderRadius:'6px', cursor:'pointer'}}>Cancelar</button>
                    <button onClick={subirDocumento} disabled={!archivoNuevo} style={{padding:'10px 20px', background:'#059669', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>Subir</button>
                </div>
            </Modal>

            <Modal isOpen={modalComprobanteOpen} onRequestClose={() => setModalComprobanteOpen(false)} ariaHideApp={false} style={{ content: { maxWidth: '800px', margin: 'auto' } }}>
                {comprobanteLoading ? (
                    <p style={{textAlign: 'center', padding: '20px'}}>Cargando comprobante...</p>
                ) : (
                    comprobantePreviewUrl && <img src={comprobantePreviewUrl} style={{width: '100%'}} alt="Comprobante"/>
                )}
                <button onClick={() => setModalComprobanteOpen(false)} style={{marginTop:'20px', padding:'10px', width:'100%'}}>Cerrar</button>
            </Modal>
        </div>
    );
};

export default VehiculoDetail;