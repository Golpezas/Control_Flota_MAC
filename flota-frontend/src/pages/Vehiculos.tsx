// src/pages/Vehiculos.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchVehiculos, deleteVehiculo } from '../api/vehiculos';
import type { Vehiculo } from '../api/models/vehiculos';

type VehiculoLegacy = Partial<{
    MARCA: string;
    MODELO: string;
    DESCRIPCION_MODELO: string;
    TIPO: string;
    ANIO: number | string;
    COLOR: string;
    NRO_MOVIL: string | number;
}>;

const getLegacyVehiculo = (v: Vehiculo): VehiculoLegacy => v as VehiculoLegacy;

// =================================================================
// ICONOS SVG CORPORATIVOS
// =================================================================
const Icons = {
    Truck: () => <svg className="w-8 h-8 text-blue-600 dark:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 21h8m-4-11v11m-6-4h12a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3H6a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
    View: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
    Edit: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
    Trash: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    Plus: () => <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
    List: () => <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>,
    Grid: () => <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
    ExternalLink: () => <svg className="w-4 h-4 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
};

// --- Lógica Auxiliar de Presentación ---
const getDisplayMarca = (v: Vehiculo) => v.marca || getLegacyVehiculo(v).MARCA || '-';

const getDisplayModelo = (v: Vehiculo) => {
    const legacy = getLegacyVehiculo(v);
    return v.modelo || legacy.MODELO || v.descripcion_modelo || legacy.DESCRIPCION_MODELO || 'Sin Modelo';
};

const getDisplayTipo = (v: Vehiculo) => v.tipo || getLegacyVehiculo(v).TIPO || '-';

// --- Componente de Fila de Tabla ---
const VehiculoTableRow: React.FC<{
  v: Vehiculo;
  handleDelete: (patente: string | undefined, nro_movil: string | null) => void;
}> = ({ v, handleDelete }) => {
  const canPerformAction = !!v._id;
  const legacy = getLegacyVehiculo(v);
  
  const marca = getDisplayMarca(v);
  const modelo = getDisplayModelo(v);
  const tipo = getDisplayTipo(v);
  const anio = v.anio ?? legacy.ANIO ?? 'N/A';
  const color = v.color || legacy.COLOR || 'N/A';
  const nro_movil = v.nro_movil ?? legacy.NRO_MOVIL ?? 'N/A';

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 dark:text-white">
        <Link to={`/vehiculos/${v._id}`} className={`flex items-center hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${!canPerformAction ? 'pointer-events-none opacity-50' : ''}`}>
            {v._id || 'ID Desconocido'} <Icons.ExternalLink />
        </Link>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700 dark:text-slate-300">
        {nro_movil}
      </td>
      {/* NUEVA COLUMNA MARCA */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 capitalize">
        {marca.toLowerCase()}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 capitalize">
        {modelo.toLowerCase()}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-slate-600 dark:text-slate-400 capitalize">
        {tipo.toLowerCase()}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2.5 py-1 rounded-md text-xs font-bold border border-blue-200 dark:border-blue-800/50">
            {anio}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
        {color}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        {v.activo ? (
            <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-2.5 py-1 rounded-md text-xs font-bold border border-emerald-200 dark:border-emerald-800/50">Sí</span> 
        ) : (
            <span className="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 px-2.5 py-1 rounded-md text-xs font-bold border border-rose-200 dark:border-rose-800/50">No</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <div className="flex items-center justify-center gap-2">
            <Link to={`/vehiculos/${v._id}`} className={`${!canPerformAction ? 'pointer-events-none opacity-50' : ''}`}>
                <button title="Ver Detalle" className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
                    <Icons.View />
                </button>
            </Link>
            <Link to={`/vehiculos/editar/${v._id}`} className={`${!canPerformAction ? 'pointer-events-none opacity-50' : ''}`}>
                <button title="Editar" className="p-2 text-amber-600 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-900/30 rounded-lg transition-colors">
                    <Icons.Edit />
                </button>
            </Link>
            <button
                onClick={() => handleDelete(v._id, String(nro_movil))}
                title="Eliminar"
                disabled={!canPerformAction}
                className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Icons.Trash />
            </button>
        </div>
      </td>
    </tr>
  );
};

// --- Componente de Tarjeta Simple (Modo Lista) ---
const SimpleCard: React.FC<{ v: Vehiculo; handleDelete: (patente: string | undefined, nro_movil: string | null) => void }> = ({ v, handleDelete }) => {
    const canPerformAction = !!v._id;
    const legacy = getLegacyVehiculo(v);
    const marca = getDisplayMarca(v);
    const modelo = getDisplayModelo(v);
    const tipo = getDisplayTipo(v);
    const anio = v.anio ?? legacy.ANIO ?? 'N/A';
    const nro_movil = v.nro_movil ?? legacy.NRO_MOVIL ?? 'N/A';

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex justify-between items-center hover:shadow-md transition-shadow">
            <div className="flex-grow">
                <Link to={`/vehiculos/${v._id}`} className={`text-lg font-bold hover:underline ${canPerformAction ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 pointer-events-none'}`}>
                    Patente: {v._id || '⚠️ ID Desconocido'}
                </Link>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 capitalize font-medium">
                    Móvil: <span className="font-bold text-slate-800 dark:text-slate-200">{nro_movil}</span> | {marca === '-' ? '' : `${marca} `}{modelo.toLowerCase()} ({anio})
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 capitalize">
                    Tipo: {tipo.toLowerCase()}
                </p>
            </div>
            <div className="flex gap-2">
                <Link to={`/vehiculos/editar/${v._id}`} className={`${!canPerformAction ? 'pointer-events-none opacity-50' : ''}`}>
                    <button title="Editar" className="p-2 text-amber-600 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-900/30 rounded-lg transition-colors">
                        <Icons.Edit />
                    </button>
                </Link>
                <button 
                    title="Eliminar" 
                    onClick={() => handleDelete(v._id, String(nro_movil))} 
                    disabled={!canPerformAction}
                    className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icons.Trash />
                </button>
            </div>
        </div>
    );
};

// --- Componente Principal Vehiculos ---
const Vehiculos: React.FC = () => {
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [deleteStatus, setDeleteStatus] = useState<{msg: string, type: 'success' | 'error' | 'info'} | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isListMode, setIsListMode] = useState(false);

    // Nuevo estado para el filtro general (Marca, Modelo o Tipo)
    const [filterVehiculoData, setFilterVehiculoData] = useState<string>('');
    const [filterAnio, setFilterAnio] = useState<string>('');

    const loadVehiculos = useCallback(async () => {
        setIsLoading(true);
        setErrorMessage(null);
        try {
            const data = await fetchVehiculos();
            setVehiculos(data);
        } catch (error) {
            setErrorMessage(`Fallo al cargar la lista de vehículos: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadVehiculos();
    }, [loadVehiculos]);

    const handleDelete = async (patente: string | undefined, nro_movil: string | null) => {
        const idToDelete = patente;
        if (!idToDelete) {
            setDeleteStatus({msg: `Fallo al eliminar: El vehículo no tiene una Patente válida.`, type: 'error'});
            return;
        }
        if (window.confirm(`¿Estás seguro de que quieres eliminar el vehículo con Patente: ${idToDelete} (Movil: ${nro_movil || 'N/A'})?\n¡Esta acción es irreversible!`)) {
            setDeleteStatus({msg: `Eliminando vehículo ${idToDelete}...`, type: 'info'});
            try {
                await deleteVehiculo(idToDelete);
                setDeleteStatus({msg: `Vehículo ${idToDelete} eliminado con éxito.`, type: 'success'});
                await loadVehiculos();
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Error desconocido al eliminar.';
                setDeleteStatus({msg: `Fallo al eliminar vehículo ${idToDelete}: ${message}`, type: 'error'});
            }
        }
    };

    // --- EXTRACCIÓN DE DATOS PARA FILTROS AVANZADOS ---
    // Recopila todas las marcas, modelos y tipos para sugerir en el Datalist
    const uniqueVehiculoData = useMemo(() => {
        const dataSet = new Set<string>();
        vehiculos.forEach(v => {
            const marca = getDisplayMarca(v).toUpperCase().trim();
            const modelo = getDisplayModelo(v).toUpperCase().trim();
            const tipo = getDisplayTipo(v).toUpperCase().trim();

            if (marca && marca !== '-') dataSet.add(marca);
            if (modelo && modelo !== 'SIN MODELO') dataSet.add(modelo);
            if (tipo && tipo !== '-') dataSet.add(tipo);
        });
        return Array.from(dataSet).sort();
    }, [vehiculos]);

    const uniqueAnios = useMemo(() => {
        const anios = vehiculos.map(v => v.anio ?? getLegacyVehiculo(v).ANIO).filter(Boolean);
        return Array.from(new Set(anios as number[])).sort((a, b) => b - a);
    }, [vehiculos]);

    // --- FILTRADO (BÚSQUEDA PARCIAL Y MÚLTIPLE) ---
    const filteredVehiculos = useMemo(() => {
        return vehiculos.filter(v => {
            // 1. Filtro General (SearchTerm - Patente o Móvil)
            const lowerCaseSearch = searchTerm.toLowerCase();
            const id = (v._id || '').toLowerCase();
            const movil = String(v.nro_movil ?? getLegacyVehiculo(v).NRO_MOVIL ?? '').toLowerCase();
            
            const matchesSearch = !searchTerm || id.includes(lowerCaseSearch) || movil.includes(lowerCaseSearch);

            // 2. Filtro de Categoría (Marca, Modelo o Tipo)
            const marcaUpper = getDisplayMarca(v).toUpperCase();
            const modeloUpper = getDisplayModelo(v).toUpperCase();
            const tipoUpper = getDisplayTipo(v).toUpperCase();
            const filterUpper = filterVehiculoData.toUpperCase().trim();

            const matchesCategoria = filterUpper ? (
                marcaUpper.includes(filterUpper) || 
                modeloUpper.includes(filterUpper) || 
                tipoUpper.includes(filterUpper)
            ) : true;

            // 3. Filtro de Año
            const a = v.anio ?? getLegacyVehiculo(v).ANIO;
            const matchesAnio = filterAnio ? String(a) === String(filterAnio) : true;

            return matchesSearch && matchesCategoria && matchesAnio;
        });
    }, [vehiculos, searchTerm, filterVehiculoData, filterAnio]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (errorMessage) {
        return (
            <div className="p-6 max-w-2xl mx-auto bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800 text-center font-medium mt-10">
                {errorMessage}
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
            
            {/* ENCABEZADO */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Icons.Truck />
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Gestión de Flota</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Directorio y control de todos los vehículos activos</p>
                    </div>
                </div>
            </div>

            {/* MENSAJES DE ESTADO */}
            {deleteStatus && (
                <div className={`p-4 rounded-xl border font-medium ${
                    deleteStatus.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' : 
                    deleteStatus.type === 'error' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50' : 
                    'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50'
                }`}>
                    {deleteStatus.msg}
                </div>
            )}

            {/* PANEL DE FILTROS Y ACCIONES */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex flex-col lg:flex-row gap-6 justify-between items-end">
                    
                    {/* Filtros */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full lg:w-auto flex-grow">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Marca / Modelo / Tipo</label>
                            <input 
                                type="text"
                                list="datos-vehiculo-list"
                                placeholder="Escribir o seleccionar..."
                                value={filterVehiculoData} 
                                onChange={(e) => setFilterVehiculoData(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <datalist id="datos-vehiculo-list">
                                {uniqueVehiculoData.map((dato) => <option key={dato} value={dato} />)}
                            </datalist>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Año</label>
                            <select 
                                value={filterAnio} 
                                onChange={(e) => setFilterAnio(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value="">Todos los Años</option>
                                {uniqueAnios.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buscar</label>
                            <input
                                type="text"
                                placeholder="Patente, Móvil..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <div className="hidden sm:block text-sm font-medium text-slate-500 dark:text-slate-400 mr-2">
                            Mostrando <span className="font-bold text-slate-900 dark:text-white">{filteredVehiculos.length}</span>
                        </div>
                        
                        {(filterVehiculoData || filterAnio || searchTerm) && (
                            <button 
                                onClick={() => { setFilterVehiculoData(''); setFilterAnio(''); setSearchTerm(''); }}
                                className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                            >
                                Limpiar
                            </button>
                        )}
                        
                        <button 
                            onClick={() => setIsListMode(!isListMode)}
                            title={isListMode ? 'Cambiar a modo Tabla' : 'Cambiar a modo Tarjetas'}
                            className="flex items-center px-4 py-2.5 bg-slate-100 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                        >
                            {isListMode ? <><Icons.List /> Tabla</> : <><Icons.Grid /> Tarjetas</>}
                        </button>

                        <Link to="/vehiculos/crear" className="flex-grow sm:flex-grow-0">
                            <button className="w-full flex items-center justify-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors focus:ring-4 focus:ring-blue-500/50">
                                <Icons.Plus /> Nuevo
                            </button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* --- LISTA DE RESULTADOS --- */}
            {filteredVehiculos.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                    <p className="text-lg font-medium text-slate-500 dark:text-slate-400">
                        No se encontraron vehículos con estos criterios.
                    </p>
                    <button 
                        onClick={() => { setFilterVehiculoData(''); setFilterAnio(''); setSearchTerm(''); }}
                        className="mt-3 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                        Ver todos los vehículos
                    </button>
                </div>
            ) : (
                <>
                    {isListMode ? (
                        /* MODO TARJETAS */
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredVehiculos.map((v, index) => (
                                <SimpleCard key={v._id || `card-${index}`} v={v} handleDelete={handleDelete} />
                            ))}
                        </div>
                    ) : (
                        /* MODO TABLA */
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Patente</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Móvil</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Marca</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Modelo</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Tipo</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Año</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Color</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Activo</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {filteredVehiculos.map((v, index) => (
                                            <VehiculoTableRow key={v._id || `row-${index}`} v={v} handleDelete={handleDelete} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Vehiculos;