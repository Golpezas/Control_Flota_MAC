// src/components/CostosTable.tsx

import React, { useState } from 'react';
import type { CostoItem } from '../api/models/vehiculos';
import { deleteCostoItem } from '../api/vehiculos'; // ← IMPORT CLAVE

// =================================================================
// 1. TIPOS AUXILIARES
// =================================================================

type CostoOrigen = 'Finanzas' | 'Mantenimiento';

export interface CostoItemExtended extends Omit<CostoItem, 'origen'> {
    _id: string;
    origen: string; // Permite cualquier origen (ETL o manual)
}

// =================================================================
// 2. UTILIDADES
// =================================================================

const formatCurrency = (amount: number): string =>
    `$ ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

// =================================================================
// 3. PROPS DEL COMPONENTE
// =================================================================

interface CostosTableProps {
    costos: CostoItemExtended[];
    onRefresh: () => void;
    // Ya no usamos onDelete como prop → lo hacemos directo con deleteCostoItem
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

        const origenValido = origen as CostoOrigen;

        if (!window.confirm(`¿Estás seguro de eliminar este costo?\nID: ${id.slice(-8)}\nOrigen: ${origen}`)) {
            return;
        }

        setIsProcessing(true);
        try {
            // Llamada directa al API con orden correcto: ID primero, origen después
            await deleteCostoItem(id, origenValido);

            alert('Costo eliminado correctamente');
            onRefresh(); // Recarga el reporte
        } catch (error) {
            // Manejo limpio sin 'any'
            const mensaje = error instanceof Error 
                ? error.message 
                : 'Error desconocido al eliminar el costo';

            console.error('Error al eliminar:', error);
            alert(mensaje.includes('manual') 
                ? 'Solo se pueden eliminar costos creados manualmente.' 
                : mensaje
            );
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ marginTop: '30px', overflowX: 'auto' }}>
            <h2 style={{ 
                borderBottom: '1px solid #ccc', 
                paddingBottom: '10px', 
                marginBottom: '20px', 
                color: '#1D3557' 
            }}>
                Historial de Costos ({costos.length})
            </h2>

            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
                <thead>
                    <tr style={{ background: '#A8DADC', color: '#1D3557' }}>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Fecha</th>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Importe</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Origen</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {[...costos]
                        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                        .map((costo, index) => {
                            const safeKey = costo._id || `costo-${costo.fecha}-${costo.importe}-${index}`;

                            return (
                                <tr
                                    key={safeKey}
                                    style={{
                                        borderBottom: '1px solid #eee',
                                        backgroundColor: index % 2 === 0 ? '#F8F9FA' : 'white'
                                    }}
                                >
                                    <td style={{ padding: '10px' }}>
                                        {costo.fecha ? costo.fecha.split('T')[0] : 'N/A'}
                                    </td>
                                    <td style={{ padding: '10px' }}>
                                        {costo.descripcion || 'Sin Descripción'}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>
                                        {formatCurrency(costo.importe)}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '0.85em' }}>
                                        {costo.origen}
                                    </td>
                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => {
                                                console.log('BORRANDO →', costo._id, costo.origen);
                                                if (costo._id && window.confirm(`¿Seguro que querés BORRAR este costo?\nFecha: ${costo.fecha}\nOrigen: ${costo.origen}`)) {
                                                    handleDeleteClick(costo._id, costo.origen);
                                                }
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
                                                opacity: (isProcessing || !costo._id) ? 0.5 : 1,
                                            }}
                                        >
                                            {isProcessing ? 'Borrando...' : 'Borrar'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
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