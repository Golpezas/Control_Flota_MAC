// src/pages/DashboardPage.tsx

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type { Vehiculo, Alerta } from '../api/models/vehiculos';
import { fetchVehiculos } from '../api/vehiculos';
import { apiClient } from '../api/vehiculos';

// =================================================================
// COMPONENTE: TARJETA DE RESUMEN (sin cambios)
// =================================================================
interface SummaryCardProps {
    title: string;
    value: number;
    color: string;
    icon: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, color, icon }) => (
    <div style={{ 
        padding: '20px', 
        borderRadius: '8px', 
        backgroundColor: color, 
        color: 'white', 
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
    }}>
        <div style={{ fontSize: '2.5em' }}>{icon}</div>
        <h3 style={{ margin: '5px 0' }}>{title}</h3>
        <p style={{ fontSize: '2.2em', fontWeight: 'bold', margin: 0 }}>{value}</p>
    </div>
);

// =================================================================
// COMPONENTE: ITEM DE ALERTA (sin cambios)
// =================================================================
interface AlertaItemProps {
    alerta: Alerta;
}

const AlertaItem: React.FC<AlertaItemProps> = ({ alerta }) => {
    console.log(`DEBUG ALERTA ITEM - Patente: ${alerta.patente}, Movil: ${alerta.movil_nro}, Modelo: ${alerta.descripcion_modelo}`);

    return (
        <div style={{ 
            padding: '15px', 
            borderBottom: '1px solid #eee', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            background: 'white' 
        }}>
            <div style={{ fontWeight: 'bold', color: alerta.prioridad === 'CRÍTICA' ? '#E63946' : '#F4A261' }}>
                🚨 {alerta.tipo_documento}
            </div>
            <div>
                Patente: **{alerta.patente || 'N/A'}** 
                (Movil: {alerta.movil_nro || 'Sin móvil'}, {alerta.descripcion_modelo || 'Sin modelo'})
            </div>
        </div>
    );
};

// =================================================================
// COMPONENTE PRINCIPAL: DashboardPage
// =================================================================

const DashboardPage: React.FC = () => {
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [debouncedPatente, setDebouncedPatente] = useState(''); // ← Nuevo estado para el valor debounced

    // Estados para alertas
    const [alertasCriticas, setAlertasCriticas] = useState<Alerta[]>([]);
    const [alertasTotal, setAlertasTotal] = useState(0);
    const [alertasPage, setAlertasPage] = useState(1);
    const [alertasLoading, setAlertasLoading] = useState(true);
    const [alertasError, setAlertasError] = useState<string | null>(null);
    const [patenteFilter, setPatenteFilter] = useState('');
    const ITEMS_PER_PAGE = 10;

    // Debounce (evita refresco y múltiples peticiones)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedPatente(patenteFilter.trim().toUpperCase());
            setAlertasPage(1); // Reset página al filtrar
        }, 500);

        return () => clearTimeout(timer);
    }, [patenteFilter]);

    // 1. Fetch vehículos
    const fetchVehiculosData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await fetchVehiculos();
            setVehiculos(data);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Error desconocido al obtener vehículos.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch alertas (usa debouncedPatente)
    const fetchAlertas = useCallback(async () => {
        setAlertasLoading(true);
        setAlertasError(null);
        try {
            const params: Record<string, string | number> = {
                limit: ITEMS_PER_PAGE,
                skip: (alertasPage - 1) * ITEMS_PER_PAGE,
            };

            if (debouncedPatente) {
                params.patente = debouncedPatente;
            }

            const res = await apiClient.get('/alertas/criticas', { params });
            setAlertasCriticas(res.data.alertas || []);
            setAlertasTotal(res.data.total || 0);

            console.log("[DEBUG DASHBOARD] Página:", alertasPage, "Mostrando:", res.data.alertas?.length || 0, "Total:", res.data.total);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Error al obtener alertas.';
            setAlertasError(message);
            setAlertasCriticas([]);
            setAlertasTotal(0);
        } finally {
            setAlertasLoading(false);
        }
    }, [alertasPage, debouncedPatente]); // Dependencia correcta

    useEffect(() => {
        fetchVehiculosData();
        fetchAlertas();
    }, [fetchVehiculosData, fetchAlertas]);

    // Resumen vehículos
    const summary = useMemo(() => {
        const total = vehiculos.length;
        const activos = vehiculos.filter(v => v.activo).length;
        const inactivos = total - activos;
        return { total, activos, inactivos };
    }, [vehiculos]);

    const totalPages = Math.ceil(alertasTotal / ITEMS_PER_PAGE);

    if (isLoading) {
        return <div style={{ padding: '30px', fontSize: '1.2em', color: '#457B9D' }}>Cargando resumen de flota... ⏳</div>;
    }

    if (error) {
        return <div style={{ padding: '30px', color: '#E63946', fontWeight: 'bold' }}>❌ Error al cargar los vehículos: {error}</div>;
    }
    
    return (
        <div style={{ padding: '30px' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '30px', color: '#1D3557' }}>
                Inicio (Dashboard)
            </h1>

            {/* Tarjetas de Resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
                <SummaryCard title="Vehículos Totales" value={summary.total} color="#1D3557" icon="🚚" />
                <SummaryCard title="Vehículos Activos" value={summary.activos} color="#457B9D" icon="✅" />
                <SummaryCard title="Vehículos Inactivos" value={summary.inactivos} color="#E63946" icon="🛑" />
            </div>

            {/* Panel de Alertas */}
            <h2 style={{ marginBottom: '20px', color: alertasCriticas.length > 0 ? '#E63946' : '#457B9D' }}>
                🚨 Alertas de Vencimiento Críticas ({alertasLoading ? '...' : alertasTotal})
            </h2>

            {/* En el return → Buscador con prevención de submit */}
            <div style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="Buscar por patente (ej: MVE291, AG705QN)..."
                    value={patenteFilter}
                    onChange={(e) => setPatenteFilter(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault(); // ← Evita submit/refresco
                        }
                    }}
                    style={{ 
                        padding: '10px 15px', 
                        width: '350px', 
                        borderRadius: '6px', 
                        border: '1px solid #ccc',
                        fontSize: '1em'
                    }}
                />
            </div>

            <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '8px', 
                overflow: 'hidden', 
                backgroundColor: 'white',
                minHeight: '200px'
            }}>
                {alertasLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#457B9D' }}>
                        Cargando alertas... ⏳
                    </div>
                ) : alertasError ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#E63946' }}>
                        ❌ {alertasError}
                    </div>
                ) : alertasCriticas.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#457B9D' }}>
                        🎉 ¡No hay alertas de vencimiento críticas!
                    </div>
                ) : (
                    <>
                        {alertasCriticas.length > 0 && (
                        <div style={{ 
                            padding: '15px', 
                            display: 'flex', 
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            gap: '25px',
                            borderTop: '1px solid #eee',
                            backgroundColor: '#f8fafc'
                        }}>
                            <button
                                disabled={alertasPage === 1}
                                onClick={() => setAlertasPage(p => Math.max(1, p - 1))}
                                style={{ 
                                    padding: '10px 20px', 
                                    background: alertasPage === 1 ? '#ccc' : '#457B9D', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '6px',
                                    cursor: alertasPage === 1 ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                ← Anterior
                            </button>

                            <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
                                Página {alertasPage} de {Math.max(1, totalPages)}
                            </span>

                            <button
                                disabled={alertasPage >= totalPages}
                                onClick={() => setAlertasPage(p => p + 1)}
                                style={{ 
                                    padding: '10px 20px', 
                                    background: alertasPage >= totalPages ? '#ccc' : '#457B9D', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '6px',
                                    cursor: alertasPage >= totalPages ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                Siguiente →
                            </button>
                        </div>
                    )}
                        {alertasCriticas.map((alerta) => (
                            <AlertaItem key={`${alerta.patente}-${alerta.tipo_documento}`} alerta={alerta} />
                        ))}
                    </>
                )}
            </div>

            <p style={{ marginTop: '30px', fontSize: '0.9em', color: '#666' }}>
                *Las alertas se basan en la documentación con vencimiento cercano o expirado.
            </p>
        </div>
    );
};

export default DashboardPage;