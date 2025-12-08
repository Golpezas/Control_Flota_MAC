// src/components/CostosTable.tsx

import React, { useState } from 'react';
import type { CostoItem } from '../api/models/vehiculos';
import { borrarGastoUniversal } from '../api/vehiculos'; // ← Corregido: Usar borrarGastoUniversal en vez de deleteCostoItem

// =================================================================
// 1. TIPOS AUXILIARES
// =================================================================

//type CostoOrigen = 'Finanzas' | 'Mantenimiento';

export interface CostoItemExtended extends Omit<CostoItem, 'origen'> {
    _id: string;
    origen: string; // Permite cualquier origen (ETL o manual)
    tipo: string;  // Asegurado explícitamente
}

// =================================================================
// 2. UTILIDADES
// =================================================================

const formatCurrency = (amount: number): string =>
    `$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// =================================================================
// 3. PROPS DEL COMPONENTE
// =================================================================

interface CostosTableProps {
    costos: CostoItemExtended[];
    onRefresh: () => void;
    // Ya no usamos onDelete como prop → lo hacemos directo con borrarGastoUniversal
}

// =================================================================
// 4. COMPONENTE PRINCIPAL
// =================================================================

const CostosTable: React.FC<CostosTableProps> = ({ costos, onRefresh }) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDeleteClick = async (id: string, origen: string) => {
        // VALIDACIÓN CLAVE
        if (!id || id.trim() === '' || id === 'undefined') {
            alert('Error: ID del costo inválido. No se puede eliminar.');
            console.error('ID inválido:', id);
            return;
        }

        if (!['Finanzas', 'Mantenimiento'].includes(origen)) {
            alert('Este costo no se puede eliminar (no es manual).');
            return;
        }

        // Mapear origen a lo que espera borrarGastoUniversal ("costos" o "finanzas")
        const origenMapped: "costos" | "finanzas" = origen === 'Mantenimiento' ? 'costos' : 'finanzas';

        if (!window.confirm(`¿Estás seguro de eliminar este costo?\nID: ${id.slice(-8)}\nOrigen: ${origen}`)) {
            return;
        }

        setIsProcessing(true);
        try {
            await borrarGastoUniversal(id, origenMapped); // Llamada corregida
            alert('Gasto eliminado correctamente');
            onRefresh(); // Refrescar la lista después de eliminar
        } catch (error) {
            let mensaje = 'Error al eliminar el gasto';
            if (error instanceof Error) {
                mensaje = error.message;
            }
            alert(`Error: ${mensaje}`);
            console.error('Error borrando gasto:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#1D3557', color: 'white' }}>
                    <tr>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Fecha</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Descripción</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Importe</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {costos.map((costo, index) => (
                        <tr 
                            key={costo._id || index} 
                            style={{ 
                                backgroundColor: index % 2 === 0 ? '#f8f9fa' : 'white',
                                borderBottom: '1px solid #ddd'
                            }}
                        >
                            <td style={{ padding: '12px' }}>{costo.fecha}</td>
                            <td style={{ padding: '12px' }}>
                                <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: costo.tipo === 'Multa' ? '#fee' : '#e6f4ea',
                                    color: costo.tipo === 'Multa' ? '#c1121f' : '#2d6a4f',
                                    fontWeight: 'bold'
                                }}>
                                    {costo.tipo}
                                </span>
                            </td>
                            <td style={{ padding: '12px' }}>{costo.descripcion}</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                                {formatCurrency(costo.importe)}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button
                                    onClick={() => {
                                        console.log('BORRANDO →', costo._id, costo.origen);
                                        handleDeleteClick(costo._id, costo.origen);
                                    }}
                                    disabled={isProcessing || !costo._id}
                                    style={{
                                        padding: '6px 12px',
                                        cursor: (isProcessing || !costo._id) ? 'not-allowed' : 'pointer',
                                        background: (isProcessing || !costo._id) ? '#999' : '#E63946',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        fontSize: '0.8em',
                                        fontWeight: 'bold',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                        opacity: (isProcessing || !costo._id) ? 0.5 : 1,
                                        transition: 'background 0.3s'
                                    }}
                                    onMouseOver={(e) => {
                                        if (!isProcessing && costo._id) e.currentTarget.style.background = '#c1121f';
                                    }}
                                    onMouseOut={(e) => {
                                        if (!isProcessing && costo._id) e.currentTarget.style.background = '#E63946';
                                    }}
                                >
                                    {isProcessing ? 'Borrando...' : 'Borrar'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {costos.length === 0 && (
                <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#457B9D',
                    background: '#f8f9fa',
                    borderRadius: '8px',
                    marginTop: '10px'
                }}>
                    No se encontraron costos para este vehículo en el período seleccionado.
                </div>
            )}
        </div>
    );
};

export default CostosTable;