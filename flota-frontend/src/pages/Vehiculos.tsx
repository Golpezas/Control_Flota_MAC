// src/pages/Vehiculos.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchVehiculos, deleteVehiculo } from '../api/vehiculos';
import type { Vehiculo } from '../api/models/vehiculos';

// --- Componente de Fila de Tabla ---
const VehiculoTableRow: React.FC<{
  v: Vehiculo;
  index: number;
  handleDelete: (patente: string | undefined, nro_movil: string | null) => void;
}> = ({ v, index, handleDelete }) => {
  const canPerformAction = !!v._id;
  
  const modelo = v.descripcion_modelo || v.modelo || v.DESCRIPCION_MODELO || v.MODELO || 'Sin Modelo';
  const anio = v.anio || v.ANIO || 'N/A';
  const color = v.color || v.COLOR || 'N/A';
  const nro_movil = v.nro_movil || v.NRO_MOVIL || 'N/A';

  return (
    <tr
      style={{
        borderBottom: '1px solid #F1FAEE',
        backgroundColor: index % 2 === 0 ? '#F9FAFB' : 'white',
        color: '#1D3557',
      }}
    >
      <td style={{ padding: '15px', fontWeight: 'bold', color: canPerformAction ? '#1D3557' : 'gray' }}>
        <Link to={`/vehiculos/${v._id}`} style={{ textDecoration: 'none', color: canPerformAction ? '#1D3557' : 'gray' }}>
            {v._id || 'ID Desconocido'} ↗️
        </Link>
      </td>
      <td style={{ padding: '15px' }}>{nro_movil}</td>
      <td style={{ padding: '15px', textTransform: 'capitalize' }}>{modelo.toLowerCase()}</td>
      <td style={{ padding: '15px', textAlign: 'center' }}>
          <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.9em' }}>
            {anio}
          </span>
      </td>
      <td style={{ padding: '15px' }}>{color}</td>
      <td style={{ padding: '15px', textAlign: 'center' }}>
        {v.activo ? (
            <span style={{color: '#166534', backgroundColor: '#dcfce7', padding: '4px 8px', borderRadius: '6px', fontSize: '0.85em', fontWeight: 'bold'}}>Sí</span> 
        ) : (
            <span style={{color: '#dc2626', backgroundColor: '#fee2e2', padding: '4px 8px', borderRadius: '6px', fontSize: '0.85em', fontWeight: 'bold'}}>No</span>
        )}
      </td>

      <td style={{ padding: '15px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <Link to={`/vehiculos/${v._id}`} title="Ver Detalle" style={{ textDecoration: 'none' }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', transition: 'transform 0.2s' }} disabled={!canPerformAction}>
                    👁️
                </button>
            </Link>
            <Link to={`/vehiculos/editar/${v._id}`} title="Editar" style={{ textDecoration: 'none' }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', transition: 'transform 0.2s' }} disabled={!canPerformAction}>
                    ✏️
                </button>
            </Link>
            <button
                onClick={() => handleDelete(v._id, String(nro_movil))}
                title="Eliminar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', transition: 'transform 0.2s' }}
                disabled={!canPerformAction}
            >
                🗑️
            </button>
        </div>
      </td>
    </tr>
  );
};

// --- Componente de Tarjeta Simple (Modo Lista) ---
const SimpleCard: React.FC<{ v: Vehiculo; handleDelete: (patente: string | undefined, nro_movil: string | null) => void }> = ({ v, handleDelete }) => {
    const canPerformAction = !!v._id;
    const modelo = v.descripcion_modelo || v.modelo || v.DESCRIPCION_MODELO || v.MODELO || 'Sin Modelo';
    const anio = v.anio || v.ANIO || 'N/A';
    const nro_movil = v.nro_movil || v.NRO_MOVIL || 'N/A';

    return (
        <div
            style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '15px',
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
        >
            <div style={{ flexGrow: 1 }}>
                <Link to={`/vehiculos/${v._id}`} style={{ textDecoration: 'none', color: '#1D3557', fontWeight: 'bold' }}>
                    Patente: <span style={{ color: canPerformAction ? '#E63946' : 'gray' }}>{v._id || '⚠️ ID Desconocido'}</span>
                </Link>
                <p style={{ margin: '5px 0 0 0', fontSize: '0.9em', color: '#457B9D', textTransform: 'capitalize' }}>
                    Móvil: {nro_movil} | Modelo: {modelo.toLowerCase()} ({anio})
                </p>
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
                <Link to={`/vehiculos/editar/${v._id}`} style={{ textDecoration: 'none' }}>
                    <button title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em' }} disabled={!canPerformAction}>
                        ✏️
                    </button>
                </Link>
                <button title="Eliminar" onClick={() => handleDelete(v._id, String(nro_movil))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em' }} disabled={!canPerformAction}>
                    🗑️
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
    const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isListMode, setIsListMode] = useState(false);

    // NUEVOS ESTADOS PARA FILTROS
    const [filterModelo, setFilterModelo] = useState<string>('');
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
            setDeleteStatus(`❌ Fallo al eliminar: El vehículo no tiene una Patente (_id) válida.`);
            return;
        }
        if (window.confirm(`¿Estás seguro de que quieres eliminar el vehículo con Patente: ${idToDelete} (Movil: ${nro_movil || 'N/A'})?\n¡Esta acción es irreversible!`)) {
            setDeleteStatus(`Eliminando vehículo ${idToDelete}...`);
            try {
                await deleteVehiculo(idToDelete);
                setDeleteStatus(`✅ Vehículo ${idToDelete} eliminado con éxito.`);
                await loadVehiculos();
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Error desconocido al eliminar.';
                setDeleteStatus(`❌ Fallo al eliminar vehículo ${idToDelete}: ${message}`);
            }
        }
    };

    // --- LÓGICA DE EXTRACCIÓN DE DATOS PARA FILTROS (CORREGIDA) ---
    const uniqueModelos = useMemo(() => {
        const modelos = vehiculos.map(v => {
            const m = v.descripcion_modelo || v.modelo || v.DESCRIPCION_MODELO || v.MODELO || '';
            // Forzamos a Mayúsculas y quitamos espacios extra para evitar duplicados
            return m.toUpperCase().trim();
        }).filter(m => m !== ''); // Filtramos los que estén vacíos
        
        return Array.from(new Set(modelos)).sort();
    }, [vehiculos]);

    const uniqueAnios = useMemo(() => {
        const anios = vehiculos.map(v => 
            v.anio || v.ANIO
        ).filter(Boolean);
        return Array.from(new Set(anios as number[])).sort((a, b) => b - a);
    }, [vehiculos]);

    // --- LÓGICA DE FILTRADO UNIFICADA (CORREGIDA) ---
    const filteredVehiculos = useMemo(() => {
        return vehiculos.filter(v => {
            const lowerCaseSearch = searchTerm.toLowerCase();
            const id = (v._id || '').toLowerCase();
            const movil = String(v.nro_movil || v.NRO_MOVIL || '').toLowerCase();
            const modeloText = String(v.descripcion_modelo || v.DESCRIPCION_MODELO || '').toLowerCase();
            const matchesSearch = !searchTerm || id.includes(lowerCaseSearch) || movil.includes(lowerCaseSearch) || modeloText.includes(lowerCaseSearch);

            // Normalizamos el modelo del vehículo iterado a mayúsculas para compararlo con el filtro
            const m = String(v.descripcion_modelo || v.modelo || v.DESCRIPCION_MODELO || v.MODELO || '').toUpperCase().trim();
            const matchesModelo = filterModelo ? m === filterModelo : true;

            const a = v.anio || v.ANIO;
            const matchesAnio = filterAnio ? String(a) === String(filterAnio) : true;

            return matchesSearch && matchesModelo && matchesAnio;
        });
    }, [vehiculos, searchTerm, filterModelo, filterAnio]);

    if (isLoading) return <div style={{ padding: '30px', textAlign: 'center' }}>Cargando vehículos...</div>;
    if (errorMessage) return <div style={{ padding: '30px', color: '#E63946', textAlign: 'center' }}>{errorMessage}</div>;

    return (
        <div style={{ padding: '30px', color: '#1D3557', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #ccc', paddingBottom: '10px' }}>
                <h1 style={{ margin: 0, color: '#1D3557' }}>Gestión de Flota</h1>
            </div>

            {deleteStatus && (
                <div style={{
                    padding: '10px', marginBottom: '20px', borderRadius: '4px',
                    backgroundColor: deleteStatus.startsWith('❌') ? '#FBEBEA' : '#D4EDDA',
                    color: deleteStatus.startsWith('❌') ? '#721C24' : '#155724'
                }}>
                    {deleteStatus}
                </div>
            )}

            {/* --- BARRA DE FILTROS (DISEÑO ARREGLADO) --- */}
            <div style={{ 
                backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0',
                marginBottom: '25px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end', boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
            }}>
                {/* Contador */}
                <div style={{ flex: '1 1 100%', marginBottom: '5px', fontSize: '1.1em', color: '#457B9D' }}>
                    📊 Mostrando <strong>{filteredVehiculos.length}</strong> vehículos 
                    {(filterModelo || filterAnio || searchTerm) ? ' (filtrados)' : ' (total)'}
                </div>

                {/* Filtro Modelo */}
                <div style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9em', marginBottom: '5px' }}>Modelo:</label>
                    <select 
                        value={filterModelo} 
                        onChange={(e) => setFilterModelo(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    >
                        <option value="">Todos los Modelos</option>
                        {uniqueModelos.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>

                {/* Filtro Año */}
                <div style={{ flex: '1 1 120px', minWidth: '100px' }}>
                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9em', marginBottom: '5px' }}>Año:</label>
                    <select 
                        value={filterAnio} 
                        onChange={(e) => setFilterAnio(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    >
                        <option value="">Todos</option>
                        {uniqueAnios.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>

                {/* Buscador Texto */}
                <div style={{ flex: '2 1 250px', minWidth: '200px' }}>
                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9em', marginBottom: '5px' }}>Buscar:</label>
                    <input
                        type="text"
                        placeholder="Patente, Móvil..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                </div>

                {/* Botones de Acción (Corregidos para no chocar) */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
                    {(filterModelo || filterAnio || searchTerm) && (
                        <button 
                            onClick={() => { setFilterModelo(''); setFilterAnio(''); setSearchTerm(''); }}
                            style={{ padding: '10px 15px', backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', height: '40px' }}
                        >
                            Limpiar
                        </button>
                    )}
                    
                    <button onClick={() => setIsListMode(!isListMode)}
                        style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#A8DADC', border: 'none', borderRadius: '6px', fontWeight: 'bold', color: '#1D3557', height: '40px' }}
                        title={isListMode ? 'Cambiar a modo Tabla' : 'Cambiar a modo Lista Simple'}>
                        {isListMode ? '📋 Tabla' : '📄 Lista'}
                    </button>

                    <Link to="/vehiculos/crear">
                        <button style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#457B9D', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', height: '40px' }}>
                            ➕ Nuevo
                        </button>
                    </Link>
                </div>
            </div>

            {/* --- LISTA DE RESULTADOS --- */}
            {filteredVehiculos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #ccc' }}>
                    <p style={{ color: '#64748b', fontSize: '1.2em' }}>
                        No se encontraron vehículos con estos criterios.
                    </p>
                    <button 
                        onClick={() => { setFilterModelo(''); setFilterAnio(''); setSearchTerm(''); }}
                        style={{ marginTop: '10px', background: 'none', border: 'none', color: '#457B9D', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                        Ver todos los vehículos
                    </button>
                </div>
            ) : (
                <>
                    {isListMode ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                            {filteredVehiculos.map((v, index) => (
                                <SimpleCard
                                    key={v._id || `card-${index}`} 
                                    v={v}
                                    handleDelete={handleDelete}
                                />
                            ))}
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
                                <thead style={{ backgroundColor: '#1D3557', color: 'white' }}>
                                    <tr>
                                        <th style={{ padding: '15px', textAlign: 'left' }}>Patente</th>
                                        <th style={{ padding: '15px', textAlign: 'left' }}>Móvil</th>
                                        <th style={{ padding: '15px', textAlign: 'left' }}>Modelo</th>
                                        <th style={{ padding: '15px', textAlign: 'center' }}>Año</th>
                                        <th style={{ padding: '15px', textAlign: 'left' }}>Color</th>
                                        <th style={{ padding: '15px', textAlign: 'center' }}>Activo</th>
                                        <th style={{ padding: '15px', textAlign: 'center' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredVehiculos.map((v, index) => (
                                        <VehiculoTableRow
                                            key={v._id || `row-${index}`} 
                                            v={v}
                                            index={index}
                                            handleDelete={handleDelete}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Vehiculos;