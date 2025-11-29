// src/pages/DashboardPage.tsx (CÓDIGO CONFIRMADO)

import React, { useEffect, useState, useMemo } from 'react';
import type { Vehiculo, Alerta } from '../api/models/vehiculos';
import { fetchVehiculos, fetchGlobalAlertas } from '../api/vehiculos';
//import { Link } from 'react-router-dom';

// =================================================================
// COMPONENTE: TARJETA DE RESUMEN
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
// COMPONENTE: ITEM DE ALERTA
// =================================================================
interface AlertaItemProps {
    alerta: Alerta;
}

const AlertaItem: React.FC<AlertaItemProps> = ({ alerta }) => (
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
            Móvil: **{alerta.patente || 'N/A'}** ({alerta.descripcion_modelo || 'Vehículo'}) - Vence en **{alerta.dias_restantes}** días.
        </div>
    </div>
);

// =================================================================
// COMPONENTE PRINCIPAL: DashboardPage
// =================================================================

const DashboardPage: React.FC = () => {
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Estados para alertas
    const [alertasCriticas, setAlertasCriticas] = useState<Alerta[]>([]);
    const [isAlertsLoading, setIsAlertsLoading] = useState(true);
    const [alertsError, setAlertsError] = useState<string | null>(null);


    // 1. Fetch de datos principales de vehículos
    const fetchVehiculosData = async () => {
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
    };

    // 2. Fetch de Alertas Críticas
    const fetchAlertas = async () => {
        setIsAlertsLoading(true);
        setAlertsError(null);
        try {
            const data = await fetchGlobalAlertas();

            //console.log("DEBUG FRONTEND COMPONENT: Alertas procesadas para el componente:", data);

            setAlertasCriticas(data);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Error desconocido al obtener alertas.';
            setAlertsError(message);
            setAlertasCriticas([]);
        } finally {
            setIsAlertsLoading(false);
        }
    };


    useEffect(() => {
        fetchVehiculosData();
        fetchAlertas();
    }, []);

    // 3. Cálculo de resumen usando useMemo
    const summary = useMemo(() => {
        const total = vehiculos.length;
        const activos = vehiculos.filter(v => v.activo).length;
        const inactivos = total - activos;
        
        return { total, activos, inactivos };
    }, [vehiculos]);


    // Mantenemos el estado de carga y error principal
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
                <SummaryCard 
                    title="Vehículos Totales" 
                    value={summary.total} 
                    color="#1D3557" 
                    icon="🚚" 
                />
                <SummaryCard 
                    title="Vehículos Activos" 
                    value={summary.activos} 
                    color="#457B9D" 
                    icon="✅" 
                />
                <SummaryCard 
                    title="Vehículos Inactivos" 
                    value={summary.inactivos} 
                    color="#E63946" 
                    icon="🛑" 
                />
            </div>

            {/* Panel de Alertas */}
            <h2 style={{ marginBottom: '20px', color: alertasCriticas.length > 0 ? '#E63946' : '#457B9D' }}>
                🚨 Alertas de Vencimiento Críticas ({isAlertsLoading ? '...' : alertasCriticas.length})
            </h2>
            <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '8px', 
                overflow: 'hidden', 
                backgroundColor: 'white' 
            }}>
                {isAlertsLoading ? ( 
                    <div style={{ padding: '20px', textAlign: 'center', color: '#457B9D' }}>
                        Cargando alertas de vencimiento... ⏳
                    </div>
                ) : alertsError ? ( 
                    <div style={{ padding: '20px', textAlign: 'center', color: '#E63946', fontWeight: 'bold' }}>
                        ❌ Error al cargar las alertas: {alertsError}. Verifique la conexión con el backend.
                    </div>
                ) : alertasCriticas.length > 0 ? ( 
                    alertasCriticas.map((alerta, index) => (
                        <AlertaItem key={index} alerta={alerta} />
                    ))
                ) : ( 
                    <div style={{ padding: '20px', textAlign: 'center', color: '#457B9D' }}>
                        🎉 ¡No hay alertas de vencimiento críticas!
                    </div>
                )}
            </div>
            
            <p style={{ marginTop: '30px', fontSize: '0.9em', color: '#666' }}>
                *Las alertas se basan en la documentación con vencimiento cercano o expirado.
            </p>
        </div>
    );
};

export default DashboardPage;