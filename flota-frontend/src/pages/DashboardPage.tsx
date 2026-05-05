// src/pages/DashboardPage.tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom'; // NUEVO: Para hacer las cards interactivas
import type { Vehiculo, Alerta } from '../api/models/vehiculos';
import { fetchVehiculos } from '../api/vehiculos';
import { apiClient } from '../api/vehiculos';

// =================================================================
// COMPONENTE: TARJETA DE RESUMEN (Refactorizado con Tailwind)
// =================================================================
interface SummaryCardProps {
    title: string;
    value: number;
    colorClass: string;
    icon: string;
    onClick: () => void; // Hacemos las tarjetas interactivas
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, colorClass, icon, onClick }) => (
    <div 
        onClick={onClick}
        className={`p-6 rounded-xl text-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer flex flex-col items-center text-center ${colorClass}`}
    >
        <div className="text-4xl mb-2">{icon}</div>
        <h3 className="text-sm font-medium opacity-90 m-0">{title}</h3>
        <p className="text-4xl font-bold m-0 mt-1">{value}</p>
    </div>
);

// =================================================================
// COMPONENTE PRINCIPAL: DashboardPage
// =================================================================
const DashboardPage: React.FC = () => {
    const navigate = useNavigate(); // Hook de navegación
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [isLoadingVehiculos, setIsLoadingVehiculos] = useState(true);

    const [alertasCriticas, setAlertasCriticas] = useState<Alerta[]>([]);
    const [alertasTotal, setAlertasTotal] = useState(0);
    const [alertasPage, setAlertasPage] = useState(1);
    const [alertasLoading, setAlertasLoading] = useState(false);
    
    const [patenteFilter, setPatenteFilter] = useState('');
    const [debouncedPatente, setDebouncedPatente] = useState('');
    const ITEMS_PER_PAGE = 10;

    // 1. Efecto solo para cargar Vehículos
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
            setAlertasPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [patenteFilter]);

    // 3. Fetch Alertas
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

    // Lógica de resumen general
    const summary = useMemo(() => {
        const total = vehiculos.length;
        const activos = vehiculos.filter(v => v.activo).length;
        return { total, activos, inactivos: total - activos };
    }, [vehiculos]);

    // NUEVA LÓGICA: Procesamiento de unidades por modelo
    const composicionFlota = useMemo(() => {
        const conteo: Record<string, number> = {};
        vehiculos.forEach(v => {
            let modelo = (v.descripcion_modelo || v.modelo || v.DESCRIPCION_MODELO || v.MODELO || 'Desconocido').toUpperCase().trim();
            // Normalización básica para agrupar similares
            if (modelo.includes('CLIO')) modelo = 'RENAULT CLIO';
            if (modelo.includes('KANGOO')) modelo = 'RENAULT KANGOO';
            if (modelo.includes('ALASKAN')) modelo = 'RENAULT ALASKAN';
            if (modelo.includes('SANDERO')) modelo = 'RENAULT SANDERO';
            
            conteo[modelo] = (conteo[modelo] || 0) + 1;
        });
        // Convertimos el objeto en array y ordenamos por cantidad descendente
        return Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    }, [vehiculos]);

    const totalPages = Math.ceil(alertasTotal / ITEMS_PER_PAGE);

    if (isLoadingVehiculos && vehiculos.length === 0) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1D3557]"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-[#1D3557]">Dashboard</h1>

            {/* GRÁFICO 1: Resumen (1 col en móvil, 3 en PC) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryCard 
                    title="Vehículos Totales" 
                    value={summary.total} 
                    colorClass="bg-[#1D3557]" 
                    icon="🚚" 
                    onClick={() => navigate('/vehiculos')}
                />
                <SummaryCard 
                    title="Vehículos Activos" 
                    value={summary.activos} 
                    colorClass="bg-[#2A9D8F]" 
                    icon="✅" 
                    onClick={() => navigate('/vehiculos')}
                />
                <SummaryCard 
                    title="Vehículos Inactivos" 
                    value={summary.inactivos} 
                    colorClass="bg-[#E63946]" 
                    icon="🛑" 
                    onClick={() => navigate('/vehiculos')}
                />
            </div>

            {/* ZONA INFERIOR: Alertas (Izquierda) + Composición (Derecha) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Panel Izquierdo: Alertas (Ocupa 2 de 3 columnas en PC) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h2 className="text-2xl font-bold text-[#457B9D] flex items-center gap-2">
                            🚨 Alertas Críticas 
                            <span className="bg-red-100 text-red-700 text-sm py-1 px-3 rounded-full">{alertasTotal}</span>
                            {alertasLoading && <span className="text-sm font-normal text-slate-400 animate-pulse">Actualizando...</span>}
                        </h2>
                        <input
                            type="text"
                            placeholder="Buscar por patente..."
                            value={patenteFilter}
                            onChange={(e) => setPatenteFilter(e.target.value.toUpperCase())}
                            className="w-full sm:w-64 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#457B9D]"
                        />
                    </div>

                    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm transition-opacity ${alertasLoading ? 'opacity-60' : 'opacity-100'}`}>
                        {/* Paginación Superior */}
                        <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-200 rounded-t-xl">
                            <button 
                                disabled={alertasPage === 1 || alertasLoading} 
                                onClick={() => setAlertasPage(p => p - 1)}
                                className="px-3 py-1 rounded bg-white border border-slate-300 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                            >
                                ← Anterior
                            </button>
                            <span className="text-sm text-slate-600 font-medium">
                                Página {alertasPage} de {totalPages || 1}
                            </span>
                            <button 
                                disabled={alertasPage >= totalPages || alertasLoading} 
                                onClick={() => setAlertasPage(p => p + 1)}
                                className="px-3 py-1 rounded bg-white border border-slate-300 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                            >
                                Siguiente →
                            </button>
                        </div>

                        {/* Lista de Alertas tipo "Cards" internas */}
                        <div className="divide-y divide-slate-100">
                            {alertasCriticas.length === 0 && !alertasLoading ? (
                                <div className="p-10 text-center text-slate-500">No se encontraron alertas.</div>
                            ) : (
                                alertasCriticas.map((alerta) => (
                                    <div 
                                        key={`${alerta.patente}-${alerta.tipo_documento}`} 
                                        onClick={() => navigate(`/vehiculos/${alerta.patente}`)}
                                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 cursor-pointer transition-colors"
                                    >
                                        <div>
                                            <div className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${alerta.prioridad === 'CRÍTICA' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                🚨 {alerta.tipo_documento}
                                            </div>
                                            <p className="text-slate-800">
                                                Patente: <span className="font-bold">{alerta.patente || 'N/A'}</span>
                                            </p>
                                        </div>
                                        <div className="text-sm text-slate-600 sm:text-right">
                                            <p>Móvil: <span className="font-semibold">{alerta.movil_nro || 'Sin móvil'}</span></p>
                                            <p>{alerta.descripcion_modelo || 'Sin modelo'}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Panel Derecho: Composición de la Flota (Ocupa 1 de 3 columnas en PC) */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-[#457B9D]">📊 Composición</h2>
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                        <div className="space-y-3">
                            {composicionFlota.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center">Sin datos</p>
                            ) : (
                                composicionFlota.map(([modelo, cantidad]) => (
                                    <div key={modelo} className="flex justify-between items-center border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                                        <span className="text-sm font-medium text-slate-700">{modelo}</span>
                                        <span className="bg-slate-100 text-slate-800 text-xs font-bold px-2 py-1 rounded-md">
                                            {cantidad} unid.
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default DashboardPage;