// src/pages/VehiculoDetail.tsx (Código final y corregido)
//import type { CostoItemExtended } from '../types/costos';  // ← agregá "type"
import React, { useEffect, useState, useMemo, useCallback } from 'react'; 
import { useParams, Link } from 'react-router-dom';
import Modal from 'react-modal';  // Nueva import para modal
import type { 
    Vehiculo, 
    ReporteCostosResponse, 
    Alerta, 
    DocumentoDigital, 
} from '../api/models/vehiculos'; 
import { 
    fetchVehiculoByPatente, 
    fetchReporteVehiculo, 
} from '../api/vehiculos';
import CostoForm from '../components/CostoForm';
import CostosTable from '../components/CostosTable'; 

// =================================================================
// Definimos el tipo de origen usado en el mapeo
type CostoOrigen = 'Finanzas' | 'Mantenimiento';

// Definición local de CostoItemExtended para incluir 'tipo_costo'
// (Esta definición se alinea con lo que CostosTable requiere y lo que el backend envía)
export interface CostoItemExtended {
    _id: string; 
    id: string;
    tipo: string; 
    tipo_costo: string; 
    fecha: string;
    descripcion: string;
    importe: number;
    origen: CostoOrigen;
    // 🎯 FIX CRÍTICO: Se cambia '| null' a '| undefined' para alinearse con CostosTable
    metadata_adicional: Record<string, unknown> | undefined; 
}

// Definimos la URL de la API (asumimos que está en localhost:8000)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// =================================================================
// UTILITY FUNCTION
// =================================================================
// Función de formato de moneda (Definida afuera para ser compartida)
const formatCurrency = (amount: number | null): string => {
    if (amount == null || isNaN(amount)) {
        return '$ 0.00';
    }
    return `$ ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

// =================================================================
// COMPONENTES AUXILIARES
// =================================================================

// 1. Componente DetailItem 
interface DetailItemProps {
    label: string;
    value: string | number | null | undefined;
}
const DetailItem: React.FC<DetailItemProps> = ({ label, value }) => (
    <div style={{ borderBottom: '1px dotted #ccc', padding: '5px 0' }}>
        <span style={{ fontWeight: 'bold', color: '#457B9D', marginRight: '10px' }}>{label}:</span>
        <span style={{ color: '#1D3557' }}>{value === null || value === undefined || value === '' ? 'N/A' : value}</span>
    </div>
);

/*
// 2. Componente DocumentItem 
interface DocumentItemProps {
    documento: DocumentoDigital;
    onRefresh: () => void;
}
const DocumentItem: React.FC<DocumentItemProps> = ({ documento, onRefresh }) => {
    const hasFile = !!documento.nombre_archivo && !!documento.path_esperado;
    const downloadUrl = hasFile ? `${API_URL}/api/archivos/descargar?path_relativo=${encodeURIComponent(documento.path_esperado!)}` : '';
    
    return (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '8px 0', 
            borderBottom: '1px dotted #eee', 
            alignItems: 'center'
        }}>
            <span style={{ fontWeight: 'bold' }}>{documento.tipo.replace('_', ' ')}:</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '10px', color: hasFile ? '#2A9D8F' : '#E63946', fontWeight: 'bold' }}>
                    {hasFile ? `✅ Subido` : '❌ Falta/Revisar'}
                </span>
                {hasFile && (
                    <a 
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ padding: '5px 10px', marginLeft: '10px', cursor: 'pointer', background: '#457B9D', color: 'white', textDecoration: 'none', border: 'none', borderRadius: '4px', fontSize: '0.8em' }}
                    >
                        Descargar ({documento.nombre_archivo})
                    </a>
                )}
                <button 
                    onClick={() => onRefresh()} 
                    style={{ padding: '5px 10px', marginLeft: '10px', cursor: 'pointer', background: '#A8DADC', color: '#1D3557', border: 'none', borderRadius: '4px', fontSize: '0.8em' }}
                >
                    Subir/Revisar
                </button>
            </div>
        </div>
    );
};

*/

// 3. Componente CostosSummary
interface CostosSummaryProps {
    total_general: number | null;
    total_mantenimiento: number | null;
    total_infracciones: number | null;
}
const SummaryBox: React.FC<{ label: string; value: number | null; color: string }> = ({ label, value, color }) => (
    <div style={{ padding: '15px', background: color, color: 'white', borderRadius: '4px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.9em' }}>{label}</div>
        <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>{formatCurrency(value)}</div>
    </div>
);
const CostosSummary: React.FC<CostosSummaryProps> = ({ total_general, total_mantenimiento, total_infracciones }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '30px' }}>
        <SummaryBox label="Total General" value={total_general} color="#E63946" />
        <SummaryBox label="Mantenimiento" value={total_mantenimiento} color="#457B9D" />
        <SummaryBox label="Infracciones" value={total_infracciones} color="#F4A261" />
    </div>
);

// 4. Componente AlertaItem
interface AlertaItemProps {
    alerta: Alerta;
}
const AlertaItem: React.FC<AlertaItemProps> = ({ alerta }) => {
    // Definimos los colores oscuros para las críticas y no críticas
    const CRITICA_COLOR = '#E63946'; // Rojo oscuro
    const NORMAL_COLOR = '#1D3557'; // Azul oscuro
    
    // Usamos el color estándar
    const finalColor = alerta.prioridad === 'CRÍTICA' 
        ? CRITICA_COLOR 
        : NORMAL_COLOR;

    return (
        <div style={{ 
            padding: '10px 15px', 
            borderBottom: '1px solid #eee', 
            backgroundColor: alerta.prioridad === 'CRÍTICA' ? '#fdebeb' : '#fff3cd', 
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
            
            {/* 🎯 FIX 1: Aplicamos el color oscuro estándar */}
            <span style={{ fontWeight: 'bold', color: finalColor }}>
                {alerta.tipo_documento}
            </span>
            
            {/* 🎯 FIX 1: Aplicamos el color oscuro estándar */}
            <span style={{ color: finalColor }}>
                {alerta.mensaje} (Vence: {alerta.fecha_vencimiento})
            </span>
            
            {/* 🎯 FIX 1: Aplicamos el color oscuro estándar */}
            <span style={{ fontWeight: 'bold', color: finalColor }}>
                {alerta.dias_restantes} días
            </span>
        </div>
    );
};

// =================================================================
// COMPONENTE PRINCIPAL: VehiculoDetail
// =================================================================

const VehiculoDetail: React.FC = () => {
    const { patente } = useParams<{ patente: string }>();
    const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
    const [reporte, setReporte] = useState<Omit<ReporteCostosResponse, 'detalles'> & { detalles: CostoItemExtended[] } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Nuevos estados para gestión de documentos digitales (modal y preview)
    // JSDoc: Estados normalizados para modal condicional, con validación nullish
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [docSeleccionado, setDocSeleccionado] = useState<DocumentoDigital | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null);

    // Obtener la fecha de inicio del período de 12 meses
    const twelveMonthsAgo = useMemo(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0];
    }, []);

    const handleRefreshData = useCallback(async () => {
        if (!patente) return;
        
        setError(null);
        const endDate = new Date().toISOString().split('T')[0];

        try {
            console.log("⚙️ FETCHING: Solicitando datos de Vehículo y Reporte para:", patente);
            
            const [vehiculoData, reporteData] = await Promise.all([
                fetchVehiculoByPatente(patente),
                fetchReporteVehiculo(patente, twelveMonthsAgo, endDate)
            ]);
            
            // Mapeamos los costos del backend al formato que espera CostosTable
            const detallesExtendido: CostoItemExtended[] = reporteData.detalles.map(d => ({
                id: d._id,
                _id: d._id,
                tipo: d.tipo_costo || "Mantenimiento General",
                tipo_costo: d.tipo_costo || "Mantenimiento General", 
                fecha: d.fecha.split('T')[0] || d.fecha,
                descripcion: d.descripcion || "Sin descripción",
                importe: d.importe,
                origen: d.origen as CostoOrigen,
                // 🎯 FIX CRÍTICO: Se usa '?? undefined' para cumplir con el tipo de la interfaz
                metadata_adicional: d.metadata_adicional ?? undefined, 
            }));

            setVehiculo(vehiculoData);
            setReporte({
                ...reporteData,
                detalles: detallesExtendido // Asignamos la lista con el tipado corregido
            });
            
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Error desconocido al cargar el detalle.';
            console.error("❌ ERROR DETALLE:", message);
            setError(message);
        } finally {
            setIsLoading(false);
        }
        
    }, [patente, twelveMonthsAgo]); 

    // Función para abrir modal y cargar preview (condicional basado en file_id)
    // JSDoc: Handler async con validación de existencia y error handling
    const abrirModalDocumento = async (doc: DocumentoDigital) => {
        setDocSeleccionado(doc);
        setArchivoNuevo(null);
        setPreviewUrl(null);  // Limpia preview anterior para evitar leaks

        if (doc.file_id) {
            try {
                const res = await fetch(`${API_URL}/api/archivos/descargar/${doc.file_id}`);
                if (!res.ok) {
                    throw new Error(`Error HTTP: ${res.status}`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                setPreviewUrl(url);
            } catch (err) {
                console.error("Error cargando vista previa:", err);
                alert("No se pudo cargar la vista previa del documento.");
            }
        }

        setModalIsOpen(true);
    };

    // Handler para cambio de archivo nuevo
    // JSDoc: Validación client-side para tipos/tamaños (mejora UX)
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 50 * 1024 * 1024) {  // 50MB max (normativa: evita overload)
                alert("Archivo demasiado grande (máx. 50MB).");
                return;
            }
            setArchivoNuevo(file);
        }
    };

    // Función para subir/reemplazar documento
    // JSDoc: Async POST con FormData, actualización local y refetch
    const subirDocumento = async () => {
        if (!archivoNuevo || !docSeleccionado || !vehiculo?._id) {
            alert("Selecciona un archivo y asegúrate de que el vehículo esté cargado.");
            return;
        }

        const formData = new FormData();
        formData.append("patente", vehiculo._id);
        formData.append("file", archivoNuevo);

        try {
            const res = await fetch(`${API_URL}/api/archivos/subir-documento`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                throw new Error(`Error HTTP: ${res.status}`);
            }

            const data = await res.json();
            const { file_id } = data;  // Usa file_id del response (normalizado)

            // Actualiza array documentos_digitales localmente (optimismo UI)
            const nuevosDocs = (vehiculo.documentos_digitales || []).map(d =>
                d.tipo === docSeleccionado.tipo 
                    ? { ...d, file_id, nombre_archivo: archivoNuevo.name, existe_fisicamente: true } 
                    : d
            );

            // Actualiza estado del vehículo
            setVehiculo(prev => prev ? { ...prev, documentos_digitales: nuevosDocs } : null);

            setModalIsOpen(false);
            handleRefreshData();  // Refetch para sincronizar con DB (asumiendo existe)
        } catch (err) {
            console.error("Error en subida:", err);
            alert("Error al subir el documento. Intenta nuevamente.");
        } finally {
            // Limpieza: Revoca URL para evitar memory leaks (mejor práctica)
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        }
    };

    // Handler para descarga (actualizado para file_id)
    const handleDownload = async (fileId: string) => {
        if (!fileId) {
            alert("No hay documento para descargar.");
            return;
        }
        try {
            const res = await fetch(`${API_URL}/api/archivos/descargar/${fileId}`);
            if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = docSeleccionado?.nombre_archivo || 'documento';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Error en descarga:", err);
            alert("No se pudo descargar el documento.");
        }
    };

    // useEffect de Carga Inicial
    useEffect(() => {
        if (patente) {
            setIsLoading(true); 
            handleRefreshData();
        } else {
            setError('Patente no especificada.');
            setIsLoading(false);
        }
    }, [patente, handleRefreshData]);


    if (isLoading) {
        return <div style={{ padding: '30px' }}>Cargando detalles del vehículo... 🚗💨</div>;
    }

    if (error) {
        return <div style={{ padding: '30px', color: 'red' }}>❌ Error al cargar los datos: {error}</div>;
    }

    if (!vehiculo) {
        return <div style={{ padding: '30px' }}>Vehículo no encontrado.</div>;
    }
    
    const alertasCriticasVehiculo = (reporte?.alertas || []).filter(a => a.prioridad === 'CRÍTICA' || a.prioridad === 'ALTA');


    return (
        <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                Detalle del Vehículo: {vehiculo.patente_original || vehiculo._id} ({vehiculo.nro_movil || 'N/A'})
            </h1>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                
                {/* ------------------------------------- */}
                {/* COLUMNA 1: INFORMACIÓN Y DOCUMENTACIÓN */}
                {/* ------------------------------------- */}
                <div>
                    <h2 style={{ borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                        📝 Información General
                    </h2>
                    <div style={{ background: '#F8F9FA', padding: '15px', borderRadius: '4px' }}>
                        <DetailItem label="Patente Original" value={vehiculo.patente_original} />
                        <DetailItem label="Patente (ID)" value={vehiculo._id} />
                        <DetailItem label="Modelo" value={vehiculo.descripcion_modelo} />
                        <DetailItem label="Año" value={vehiculo.anio} />
                        <DetailItem label="Color" value={vehiculo.color} />
                        <DetailItem label="Combustible" value={vehiculo.tipo_combustible} />
                        <DetailItem label="Estado" value={vehiculo.activo ? 'Activo ✅' : 'Inactivo 🛑'} />
                    </div>
                        
                    {/* ========================================= */}
                    {/* SECCIÓN: DOCUMENTOS DIGITALES (GridFS)    */}
                    {/* ========================================= */}
                    <div style={{ marginTop: '30px', border: '1px solid #ccc', padding: '20px', borderRadius: '8px', backgroundColor: '#f8fffe' }}>
                        <h2 style={{ color: '#1D3557', marginBottom: '15px' }}>Documentos Digitales</h2>

                        {/* Protección total contra null/undefined */}
                        {vehiculo?.documentos_digitales == null || vehiculo.documentos_digitales.length === 0 ? (
                            <p style={{ color: '#666', fontStyle: 'italic' }}>No hay documentos configurados para este vehículo.</p>
                        ) : (
                            // Aquí le decimos a TypeScript que estamos 100% seguros de que existe
                            (vehiculo.documentos_digitales as DocumentoDigital[]).map((doc, index) => {
                                const tieneArchivo = !!doc.file_id;

                                return (
                                    <div 
                                        key={index} 
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '12px 0',
                                            borderBottom: index < vehiculo.documentos_digitales!.length - 1 ? '1px dotted #ccc' : 'none'
                                        }}
                                    >
                                        <strong>{doc.tipo.replace(/_/g, ' ')}:</strong>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{
                                                color: tieneArchivo ? '#2A9D8F' : '#E63946',
                                                fontWeight: 'bold',
                                                fontSize: '1.1em'
                                            }}>
                                                {tieneArchivo ? 'Subido' : 'Falta'}
                                            </span>

                                            {tieneArchivo && (
                                                <button
                                                    onClick={() => handleDownload(doc.file_id!)}
                                                    style={{
                                                        padding: '7px 14px',
                                                        backgroundColor: '#457B9D',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.9em'
                                                    }}
                                                >
                                                    Descargar {doc.nombre_archivo ? `(${doc.nombre_archivo})` : ''}
                                                </button>
                                            )}

                                            <button
                                                onClick={() => abrirModalDocumento(doc)}
                                                style={{
                                                    padding: '7px 14px',
                                                    backgroundColor: tieneArchivo ? '#E9C46A' : '#E63946',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.9em'
                                                }}
                                            >
                                                {tieneArchivo ? 'Revisar / Reemplazar' : 'Subir'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* ========================================= */}
                    {/* MODAL PARA SUBIR / REVISAR DOCUMENTO      */}
                    {/* ========================================= */}
                    <Modal
                        isOpen={modalIsOpen}
                        onRequestClose={() => {
                            setModalIsOpen(false);
                            if (previewUrl) URL.revokeObjectURL(previewUrl);
                        }}
                        style={{
                            content: {
                                top: '50%',
                                left: '50%',
                                right: 'auto',
                                bottom: 'auto',
                                marginRight: '-50%',
                                transform: 'translate(-50%, -50%)',
                                padding: '30px',
                                borderRadius: '12px',
                                maxWidth: '700px',
                                width: '90%',
                                maxHeight: '90vh',
                                overflow: 'auto'
                            },
                            overlay: { backgroundColor: 'rgba(0,0,0,0.7)' }
                        }}
                        ariaHideApp={false}
                    >
                        <h2 style={{ margin: '0 0 20px 0', color: '#1D3557' }}>
                            {docSeleccionado?.tipo.replace(/_/g, ' ') || 'Documento'}
                        </h2>

                        {previewUrl ? (
                            docSeleccionado?.nombre_archivo?.toLowerCase().endsWith('.pdf') ? (
                                <iframe 
                                    src={previewUrl} 
                                    width="100%" 
                                    height="500px" 
                                    title="Vista previa PDF"
                                    style={{ border: '1px solid #ccc', borderRadius: '8px' }}
                                />
                            ) : (
                                <img 
                                    src={previewUrl} 
                                    alt="Vista previa" 
                                    style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid #ccc' }}
                                />
                            )
                        ) : (
                            <p style={{ color: '#E63946', fontStyle: 'italic' }}>
                                No hay documento actual. Sube uno nuevo.
                            </p>
                        )}

                        <div style={{ marginTop: '20px' }}>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleFileChange}
                                style={{
                                    padding: '10px',
                                    border: '2px dashed #ccc',
                                    borderRadius: '8px',
                                    width: '100%'
                                }}
                            />
                        </div>

                        <div style={{ marginTop: '25px', textAlign: 'right' }}>
                            <button
                                onClick={() => {
                                    setModalIsOpen(false);
                                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                                }}
                                style={{
                                    padding: '10px 20px',
                                    marginRight: '10px',
                                    background: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={subirDocumento}
                                disabled={!archivoNuevo}
                                style={{
                                    padding: '10px 25px',
                                    background: archivoNuevo ? '#2A9D8F' : '#ccc',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: archivoNuevo ? 'pointer' : 'not-allowed'
                                }}
                            >
                                {docSeleccionado?.file_id ? 'Reemplazar Documento' : 'Subir Documento'}
                            </button>
                        </div>
                    </Modal>
                    
                    {/* Alertas */}
                    <h2 style={{ borderBottom: '1px solid #ccc', paddingBottom: '10px', margin: '30px 0 20px 0', color: alertasCriticasVehiculo.length > 0 ? '#E63946' : '#1D3557' }}>
                        🚨 Alertas Específicas ({alertasCriticasVehiculo.length})
                    </h2>
                    <div style={{ background: '#F8F9FA', padding: '15px', borderRadius: '4px', color: '#1D3557'}}>
                        {alertasCriticasVehiculo.length > 0 ? (
                            alertasCriticasVehiculo.map((alerta) => (
                                <AlertaItem key={alerta.patente + alerta.tipo_documento} alerta={alerta} />
                            ))
                        ) : (
                            <div style={{ padding: '10px 0', color: '#457B9D' }}>
                                Este vehículo no tiene alertas de documentación críticas.
                            </div>
                        )}
                    </div>

                </div>

                {/* ------------------------------------- */}
                {/* COLUMNA 2: COSTOS Y REPORTE */}
                {/* ------------------------------------- */}
                <div>
                    <h2 style={{ borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                        📊 Reporte de Costos (Últimos 12 meses)
                    </h2>

                    {/* Resumen de Costos */}
                    {reporte ? (
                        <CostosSummary 
                            total_general={reporte.total_general} 
                            total_mantenimiento={reporte.total_mantenimiento} 
                            total_infracciones={reporte.total_infracciones} 
                        />
                    ) : (
                        <div style={{ color: '#457B9D', textAlign: 'center' }}>Cargando reporte de costos... ⏳</div>
                    )}
                    
                    {/* INTEGRACIÓN DEL FORMULARIO DE COSTOS MANUALES */}
                    <div style={{ marginTop: '30px', border: '1px solid #ccc', padding: '20px', borderRadius: '8px', background: '#F1FAEE' }}>
                        <h2 style={{ borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                            ➕ Registrar Nuevo Gasto
                        </h2>
                        <CostoForm 
                            initialPatente={vehiculo._id}
                            onSuccess={handleRefreshData} 
                        />
                    </div>

                    {/* Tabla de Costos */}
                    {reporte && reporte.detalles && reporte.detalles.length > 0 ? (
                        <CostosTable 
                            costos={reporte.detalles} 
                            onRefresh={handleRefreshData} 
                        />
                    ) : (
                        <div style={{ 
                            marginTop: '30px', 
                            padding: '20px', 
                            textAlign: 'center', 
                            color: '#457B9D', 
                            background: '#f8f9fa', 
                            borderRadius: '8px', 
                            fontSize: '1.1em'
                        }}>
                            No se encontraron costos para este vehículo en el período seleccionado.
                        </div>
                    )}
                    {/* FIN DE LA SECCIÓN DE COSTOS TABLE */}
                    
                </div>
            </div>

            <Link to="/vehiculos" style={{ display: 'block', marginTop: '30px', color: '#457B9D', textDecoration: 'none', fontWeight: 'bold' }}>
                ← Volver al Listado de Vehículos
            </Link>
        </div>
    );
};

export default VehiculoDetail;