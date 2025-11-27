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

  return (
    <tr
      style={{
        borderBottom: '1px solid #F1FAEE',
        backgroundColor: index % 2 === 0 ? '#F9FAFB' : 'white',
        color: '#1D3557',
      }}
    >
      <td style={{ padding: '15px', fontWeight: 'bold', color: canPerformAction ? '#E63946' : 'gray' }}>
        {v._id || 'ID Desconocido'}
      </td>
      <td style={{ padding: '15px' }}>{v.nro_movil || 'N/A'}</td>
      <td style={{ padding: '15px' }}>{v.descripcion_modelo || 'Sin Modelo'}</td>
      <td style={{ padding: '15px' }}>{v.anio || 'N/A'}</td>
      <td style={{ padding: '15px', textAlign: 'center' }}>{v.activo ? 'Sí' : 'No'}</td>

      <td style={{ padding: '15px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        {/* Botón Detalle */}
        <Link to={`/vehiculos/${v._id}`} style={{ marginRight: '10px', textDecoration: 'none' }}>
          <button
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              border: '1px solid #A8DADC',
              backgroundColor: '#F1FAEE',
              borderRadius: '4px',
              color: '#1D3557',
            }}
            disabled={!canPerformAction}
            title={!canPerformAction ? 'ID Requerido' : 'Detalle'}
            onClick={() => {
              if (!canPerformAction) {
                console.warn(`[VehiculoTableRow] Intento de navegar a Detalle sin _id → índice ${index}`);
              }
            }}
          >
            Detalle
          </button>
        </Link>

        {/* Botón Editar */}
        <Link to={`/vehiculos/editar/${v._id}`} style={{ marginRight: '10px', textDecoration: 'none' }}>
          <button
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              border: '1px solid #457B9D',
              backgroundColor: '#457B9D',
              color: 'white',
              borderRadius: '4px',
            }}
            disabled={!canPerformAction}
            title={!canPerformAction ? 'ID Requerido' : 'Editar'}
          >
            Editar
          </button>
        </Link>

        {/* Botón Eliminar */}
        <button
          onClick={() => {
            console.log(
              `[VehiculoTableRow] Eliminando → _id: ${v._id || 'null'} | nro_movil: ${v.nro_movil || 'null'}`
            );
            handleDelete(v._id, v.nro_movil);
          }}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            backgroundColor: canPerformAction ? '#E63946' : 'gray',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
          }}
          disabled={!canPerformAction}
          title={!canPerformAction ? 'ID Requerido para Eliminar' : 'Eliminar'}
        >
          Eliminar
        </button>
      </td>
    </tr>
  );
};

// --- Componente de Tarjeta Simple (Modo Lista) ---
const SimpleCard: React.FC<{ v: Vehiculo; handleDelete: (patente: string | undefined, nro_movil: string | null) => void }> = ({ v, handleDelete }) => {
    const canPerformAction = !!v._id; // Solo permite acciones si el ID es válido
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
                <p style={{ margin: '5px 0 0 0', fontSize: '0.9em', color: '#457B9D' }}>
                    Móvil: {v.nro_movil || 'N/A'} | Modelo: {v.descripcion_modelo || 'Sin Modelo'} ({v.anio || 'N/A'})
                </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <Link to={`/vehiculos/editar/${v._id}`} style={{ textDecoration: 'none' }}>
                    <button
                        title="Editar"
                        style={{ padding: '8px 12px', cursor: 'pointer', border: 'none', backgroundColor: canPerformAction ? '#457B9D' : 'gray', color: 'white', borderRadius: '4px' }}
                        disabled={!canPerformAction}
                    >
                        ✏️
                    </button>
                </Link>
                <button
                    title="Eliminar"
                    onClick={() => handleDelete(v._id, v.nro_movil)}
                    style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: canPerformAction ? '#E63946' : 'gray', color: 'white', border: 'none', borderRadius: '4px' }}
                    disabled={!canPerformAction}
                >
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
    }, []); // Dependencia: []

    useEffect(() => {
        loadVehiculos();
    }, [loadVehiculos]); // Dependencia: [loadVehiculos]

    // Permitimos que patente sea string o undefined
    const handleDelete = async (patente: string | undefined, nro_movil: string | null) => {
        const idToDelete = patente;

        if (!idToDelete) {
            setDeleteStatus(`❌ Fallo al eliminar: El vehículo no tiene una Patente (_id) válida para esta operación.`);
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

    const filteredVehiculos = useMemo(() => {
        if (!searchTerm) {
            return vehiculos;
        }
        const lowerCaseSearch = searchTerm.toLowerCase();

        const filtered = vehiculos.filter(v => {
            // CORRECCIÓN ROBUSTA: Usar String() y ?? '' en TODAS las propiedades
            // que podrían ser undefined desde el backend. Esto previene el 'TypeError'

            // 1. Patente (_id)
            const id = String(v._id ?? '').toLowerCase();
            const idMatch = id.includes(lowerCaseSearch);

            // 2. Número de Móvil
            const movil = String(v.nro_movil ?? '').toLowerCase();
            const movilMatch = movil.includes(lowerCaseSearch);

            // 3. Modelo
            const modelo = String(v.descripcion_modelo ?? '').toLowerCase();
            const modeloMatch = modelo.includes(lowerCaseSearch);

            return idMatch || movilMatch || modeloMatch;
        });

        return filtered;
    }, [vehiculos, searchTerm]);

    if (isLoading) {
        return <div style={{ padding: '30px', textAlign: 'center' }}>Cargando vehículos...</div>;
    }

    if (errorMessage) {
        return <div style={{ padding: '30px', color: '#E63946', textAlign: 'center' }}>{errorMessage}</div>;
    }

    return (
        <div style={{ padding: '30px', color: '#1D3557' }}>
            <h1 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', marginBottom: '20px', color: '#1D3557' }}>
                Gestión de Vehículos ({vehiculos.length})
            </h1>

            {deleteStatus && (
                <div style={{
                    padding: '10px',
                    marginBottom: '20px',
                    borderRadius: '4px',
                    backgroundColor: deleteStatus.startsWith('❌') ? '#FBEBEA' : '#D4EDDA',
                    color: deleteStatus.startsWith('❌') ? '#721C24' : '#155724'
                }}>
                    {deleteStatus}
                </div>
            )}

            {/* BARRA DE ACCIONES: BÚSQUEDA Y BOTONES */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="Buscar por Patente, Móvil o Modelo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ flexGrow: 1, minWidth: '200px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', color: '#1D3557' }}
                />

                <button onClick={() => setIsListMode(!isListMode)}
                    style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#A8DADC', border: 'none', borderRadius: '4px', fontWeight: 'bold', color: '#1D3557' }}
                    title={isListMode ? 'Cambiar a modo Tabla' : 'Cambiar a modo Lista Simple'}>
                    {isListMode ? '🗂️ Ver en Tabla' : '📋 Ver en Lista'}
                </button>

                <button onClick={() => loadVehiculos()}
                    style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#A8DADC', border: 'none', borderRadius: '4px', fontWeight: 'bold', color: '#1D3557' }}>
                    🔄 Recargar
                </button>

                <Link to="/vehiculos/crear">
                    <button style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#457B9D', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
                        ➕ Nuevo Vehículo
                    </button>
                </Link>
            </div>

            {filteredVehiculos.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#457B9D' }}>
                    {searchTerm ? `No se encontraron vehículos que coincidan con "${searchTerm}".` : 'No hay vehículos registrados.'}
                </p>
            ) : (
                <>
                    {searchTerm && (
                            <p style={{ color: '#457B9D', fontWeight: 'bold' }}>
                                Mostrando {filteredVehiculos.length} {filteredVehiculos.length === 1 ? 'resultado' : 'resultados'} de {vehiculos.length} vehículos.
                            </p>
                    )}

                    {isListMode ? (
                        // MODO LISTA SIMPLE (TARJETAS)
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                            {/* Clave temporal si _id falla */}
                            {filteredVehiculos.map((v, index) => (
                                <SimpleCard
                                    key={v._id || `card-${v.descripcion_modelo}-${index}`} 
                                    v={v}
                                    handleDelete={handleDelete}
                                />
                            ))}
                        </div>
                    ) : (
                        // MODO TABLA (POR DEFECTO)
                        <div style={{ overflowX: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
                                <thead style={{ backgroundColor: '#1D3557', color: 'white' }}>
                                    <tr>
                                        <th style={{ padding: '15px', textAlign: 'left' }}>Patente</th>
                                        <th style={{ padding: '15px', textAlign: 'left' }}>Móvil</th>
                                        <th style={{ padding: '15px', textAlign: 'left' }}>Modelo</th>
                                        <th style={{ padding: '15px', textAlign: 'left' }}>Año</th>
                                        <th style={{ padding: '15px', textAlign: 'center' }}>Activo</th>
                                        <th style={{ padding: '15px', textAlign: 'center' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Clave temporal si _id falla */}
                                    {filteredVehiculos.map((v, index) => (
                                        <VehiculoTableRow
                                            key={v._id || `row-${v.descripcion_modelo}-${index}`} 
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