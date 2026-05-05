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
    const [isLoadingVehiculos, setIsLoadingVehiculos] = useState(true); // Loader específico

    const [alertasCriticas, setAlertasCriticas] = useState<Alerta[]>([]);
    const [alertasTotal, setAlertasTotal] = useState(0);
    const [alertasPage, setAlertasPage] = useState(1);
    const [alertasLoading, setAlertasLoading] = useState(false); // Cambiado a false inicial
    
    const [patenteFilter, setPatenteFilter] = useState('');
    const [debouncedPatente, setDebouncedPatente] = useState('');
    const ITEMS_PER_PAGE = 10;

    // 1. Efecto solo para cargar Vehículos (Una sola vez al montar)
    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoadingVehiculos(true);
            try {
                const data = await fetchVehiculos();
                setVehiculos(data);
            } catch (e) {
                console.error('Error al obtener vehículos:', e);
            } finally {
                setIsLoadingVehiculos(false);
            }
        };
        loadInitialData();
    }, []);

    // 2. Debounce para la búsqueda
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedPatente(patenteFilter);
            setAlertasPage(1); // Reset de página solo cuando cambia el texto de búsqueda
        }, 500);
        return () => clearTimeout(timer);
    }, [patenteFilter]);

    // 3. Fetch Alertas (Se dispara por página o por patente debounced)
    const fetchAlertas = useCallback(async () => {
        setAlertasLoading(true);
        try {
            const params: Record<string, string | number> = {
                limit: ITEMS_PER_PAGE,
                skip: (alertasPage - 1) * ITEMS_PER_PAGE,
            };
            if (debouncedPatente) params.patente = debouncedPatente;

            const res = await apiClient.get('/alertas/criticas', { params });
            setAlertasCriticas(res.data.alertas || []);
            setAlertasTotal(res.data.total || 0);
        } catch (e) {
            console.error('Error al obtener alertas:', e);
        } finally {
            setAlertasLoading(false);
        }
    }, [alertasPage, debouncedPatente]);

    useEffect(() => {
        fetchAlertas();
    }, [fetchAlertas]);

    // Lógica de resumen
    const summary = useMemo(() => {
        const total = vehiculos.length;
        const activos = vehiculos.filter(v => v.activo).length;
        return { total, activos, inactivos: total - activos };
    }, [vehiculos]);

    const totalPages = Math.ceil(alertasTotal / ITEMS_PER_PAGE);

    // Renderizado condicional solo para la carga inicial de la página
    if (isLoadingVehiculos && vehiculos.length === 0) {
        return <div style={{ padding: '30px' }}>Cargando dashboard... ⏳</div>;
    }

    return (
        <div style={{ padding: '30px' }}>
            <h1 style={{ color: '#1D3557' }}>Inicio (Dashboard)</h1>

            {/* Resumen siempre visible */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
                <SummaryCard title="Vehículos Totales" value={summary.total} color="#1D3557" icon="🚚" />
                <SummaryCard title="Vehículos Activos" value={summary.activos} color="#457B9D" icon="✅" />
                <SummaryCard title="Vehículos Inactivos" value={summary.inactivos} color="#E63946" icon="🛑" />
            </div>

            <h2 style={{ color: '#457B9D' }}>
                🚨 Alertas Críticas ({alertasTotal})
                {alertasLoading && <span style={{ fontSize: '0.5em', marginLeft: '10px' }}>Actualizando...</span>}
            </h2>

            <div style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="Buscar por patente..."
                    value={patenteFilter}
                    onChange={(e) => setPatenteFilter(e.target.value.toUpperCase())}
                    style={{ padding: '10px', width: '350px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
            </div>

            <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '8px', 
                opacity: alertasLoading ? 0.6 : 1, // Feedback visual sin quitar el contenido
                transition: 'opacity 0.2s' 
            }}>
                {/* Controles de paginación arriba para mejor acceso */}
                <div style={{ padding: '10px', display: 'flex', justifyContent: 'center', gap: '10px', background: '#f8fafc' }}>
                    <button disabled={alertasPage === 1 || alertasLoading} onClick={() => setAlertasPage(p => p - 1)}>←</button>
                    <span>Página {alertasPage} de {totalPages || 1}</span>
                    <button disabled={alertasPage >= totalPages || alertasLoading} onClick={() => setAlertasPage(p => p + 1)}>→</button>
                </div>

                {alertasCriticas.length === 0 && !alertasLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>No se encontraron alertas.</div>
                ) : (
                    alertasCriticas.map((alerta) => (
                        <AlertaItem key={`${alerta.patente}-${alerta.tipo_documento}`} alerta={alerta} />
                    ))
                )}
            </div>
        </div>
    );
};

export default DashboardPage;