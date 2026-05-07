// src/pages/DashboardPage.tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Vehiculo, Alerta } from '../api/models/vehiculos';
import { fetchVehiculos, apiClient } from '../api/vehiculos';

// =================================================================
// TIPO AUXILIAR PARA EVITAR EL USO DE 'any'
// =================================================================
type VehiculoLegacy = Partial<{
    MARCA: string;
    MODELO: string;
    DESCRIPCION_MODELO: string;
}>;

const getLegacy = (v: Vehiculo): VehiculoLegacy => v as unknown as VehiculoLegacy;

// =================================================================
// ICONOS SVG CORPORATIVOS (Sin Emojis)
// =================================================================
const Icons = {
    Truck: () => <svg className="w-8 h-8 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>,
    Check: () => <svg className="w-8 h-8 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    Stop: () => <svg className="w-8 h-8 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
    Bell: () => <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
};

// =================================================================
// COMPONENTE: TARJETA DE RESUMEN
// =================================================================
const SummaryCard = ({ title, value, gradient, icon, onClick }: { title: string; value: number | string; gradient: string; icon: React.ReactElement; onClick: () => void; }) => (
    <div 
        onClick={onClick}
        className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer bg-gradient-to-br ${gradient}`}
    >
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-medium opacity-90 tracking-wide uppercase">{title}</p>
                <p className="text-4xl font-extrabold mt-1">{value}</p>
            </div>
            <div>{icon}</div>
        </div>
    </div>
);

// =================================================================
// COMPONENTE PRINCIPAL
// =================================================================
const DashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [isLoadingVehiculos, setIsLoadingVehiculos] = useState(true);

    const [alertasCriticas, setAlertasCriticas] = useState<Alerta[]>([]);
    const [alertasTotal, setAlertasTotal] = useState(0);
    const [alertasPage, setAlertasPage] = useState(1);
    const [alertasLoading, setAlertasLoading] = useState(false);
    
    const [patenteFilter, setPatenteFilter] = useState('');
    const [debouncedPatente, setDebouncedPatente] = useState('');
    const ITEMS_PER_PAGE = 8;

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

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedPatente(patenteFilter);
            setAlertasPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [patenteFilter]);

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

    const summary = useMemo(() => {
        const total = vehiculos.length;
        const activos = vehiculos.filter(v => v.activo).length;
        return { total, activos, inactivos: total - activos };
    }, [vehiculos]);

    // MÉTRICAS NUEVAS: Agrupación por Marca y Modelo de forma segura sin "any"
    const composicionFlota = useMemo(() => {
        const conteo: Record<string, number> = {};
        
        vehiculos.forEach(v => {
            const legacy = getLegacy(v);
            
            const marcaRaw = String(v.marca || legacy.MARCA || '').trim();
            const modeloRaw = String(v.modelo || legacy.MODELO || v.descripcion_modelo || legacy.DESCRIPCION_MODELO || 'Desconocido').trim();
            
            // Unimos Marca y Modelo, si marca no existe, solo usamos el modelo
            let nombreCompleto = marcaRaw ? `${marcaRaw} ${modeloRaw}` : modeloRaw;
            
            // Capitalización Inteligente (Title Case) para que se vea estético
            nombreCompleto = nombreCompleto
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
            
            conteo[nombreCompleto] = (conteo[nombreCompleto] || 0) + 1;
        });
        
        return Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    }, [vehiculos]);

    const totalPages = Math.ceil(alertasTotal / ITEMS_PER_PAGE);

    if (isLoadingVehiculos && vehiculos.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* ENCABEZADO */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Información General</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Resumen operativo y alertas del sistema</p>
                </div>
            </div>

            {/* GRÁFICO 1: Tarjetas Principales (Grid Responsivo) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryCard 
                    title="Flota Total" 
                    value={summary.total} 
                    gradient="from-slate-700 to-slate-900" 
                    icon={<Icons.Truck />} 
                    onClick={() => navigate('/vehiculos')}
                />
                <SummaryCard 
                    title="Unidades Activas" 
                    value={summary.activos} 
                    gradient="from-emerald-500 to-emerald-700" 
                    icon={<Icons.Check />} 
                    onClick={() => navigate('/vehiculos')}
                />
                <SummaryCard 
                    title="Unidades Inactivas" 
                    value={summary.inactivos} 
                    gradient="from-rose-500 to-rose-700" 
                    icon={<Icons.Stop />} 
                    onClick={() => navigate('/vehiculos')}
                />
            </div>

            {/* ZONA INFERIOR: Alertas (Izq) + Composición (Der) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* PANEL IZQUIERDO: Alertas Críticas */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-t-2xl border-b border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex items-center gap-3">
                            <Icons.Bell />
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Alertas Críticas</h2>
                            <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-bold py-0.5 px-2.5 rounded-full border border-red-200 dark:border-red-800">
                                {alertasTotal}
                            </span>
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar patente..."
                            value={patenteFilter}
                            onChange={(e) => setPatenteFilter(e.target.value.toUpperCase())}
                            className="w-full sm:w-64 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                        />
                    </div>

                    <div className={`bg-white dark:bg-slate-800 rounded-b-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-opacity duration-300 ${alertasLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        {/* Tabla / Lista de Alertas */}
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                            {alertasCriticas.length === 0 && !alertasLoading ? (
                                <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                                    <p className="text-lg font-medium">No hay alertas críticas</p>
                                    <p className="text-sm mt-1">La documentación está al día.</p>
                                </div>
                            ) : (
                                alertasCriticas.map((alerta) => (
                                    <div 
                                        key={`${alerta.patente}-${alerta.tipo_documento}`} 
                                        onClick={() => navigate(`/vehiculos/${alerta.patente}`)}
                                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={`mt-1 px-2.5 py-1 rounded text-xs font-bold whitespace-nowrap tracking-wide ${alerta.prioridad === 'CRÍTICA' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800/50' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50'}`}>
                                                {alerta.tipo_documento}
                                            </div>
                                            <div>
                                                <p className="text-slate-900 dark:text-white font-bold text-lg">{alerta.patente || 'N/A'}</p>
                                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                                                    Móvil {alerta.movil_nro || 'S/N'} • {alerta.descripcion_modelo || 'Modelo Desconocido'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:text-right flex items-center gap-2 sm:justify-end">
                                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            {alerta.mensaje}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Paginación Inferior */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
                            <button 
                                disabled={alertasPage === 1 || alertasLoading} 
                                onClick={() => setAlertasPage(p => p - 1)}
                                className="px-4 py-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Anterior
                            </button>
                            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                                Página {alertasPage} de {totalPages || 1}
                            </span>
                            <button 
                                disabled={alertasPage >= totalPages || alertasLoading} 
                                onClick={() => setAlertasPage(p => p + 1)}
                                className="px-4 py-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </div>

                {/* PANEL DERECHO: Composición de la Flota */}
                <div className="space-y-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white px-1">Resumen de Modelos</h2>
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-6">
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {composicionFlota.length === 0 ? (
                                <p className="text-sm text-slate-500 dark:text-slate-400 text-center">Sin datos registrados</p>
                            ) : (
                                composicionFlota.map(([modelo, cantidad]) => (
                                    <div key={modelo} className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3 last:border-0 last:pb-0">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{modelo}</span>
                                        </div>
                                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-600">
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