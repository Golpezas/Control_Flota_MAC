// src/pages/VehiculoDetail.tsx (Código final y corregido)
import type { CostoItemExtended } from '../types/costos';  // ← agregá "type"
import React, { useEffect, useState, useMemo, useCallback } from 'react'; 
import { useParams, Link } from 'react-router-dom';
import type { 
    Vehiculo, 
    ReporteCostosResponse, 
    Alerta, 
    DocumentoDigital, 
    //CostoItem // Se sigue importando, pero se usará una versión extendida localmente
} from '../api/models/vehiculos'; 
import { 
    fetchVehiculoByPatente, 
    fetchReporteVehiculo, 
} from '../api/vehiculos';
import CostoForm from '../components/CostoForm';
import CostosTable from '../components/CostosTable'; 

// Definimos la URL de la API (asumimos que está en localhost:8000)
const API_URL = 'http://localhost:8000'; 

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
                tipo: d.tipo_costo || "Mantenimiento General", // ← renombramos aquí
                fecha: d.fecha.split('T')[0] || d.fecha,
                descripcion: d.descripcion || "Sin descripción",
                importe: d.importe,
                origen: d.origen as 'Finanzas' | 'Mantenimiento',
                metadata_adicional: d.metadata_adicional ?? null,
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
                        
                    <h2 style={{ borderBottom: '1px solid #ccc', paddingBottom: '10px', margin: '30px 0 20px 0', color: '#1D3557' }}>
                        📂 Documentación Digital
                    </h2>
                    {/* CORRECCIÓN: Agregar comprobación de length y cambiar la clave en el map */}
                    {vehiculo.documentos_digitales && vehiculo.documentos_digitales.length > 0 ? (
                        <div style={{ background: '#F8F9FA', padding: '15px', borderRadius: '4px' }}>
                            {vehiculo.documentos_digitales.map((doc, index) => (
                                <DocumentItem 
                                    key={`${doc.tipo}-${index}`} // FIX: Clave única combinando tipo e índice
                                    documento={doc} 
                                    onRefresh={handleRefreshData} 
                                />
                            ))}
                        </div>
                    ) : (
                        <div style={{ background: '#F8F9FA', padding: '15px', borderRadius: '4px', color: '#457B9D', textAlign: 'center' }}>
                            No hay documentos digitales registrados para este vehículo.
                        </div>
                    )}
                    {/* FIN DE LA SECCIÓN DE DOCUMENTACIÓN DIGITAL MODIFICADA */}
                    
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