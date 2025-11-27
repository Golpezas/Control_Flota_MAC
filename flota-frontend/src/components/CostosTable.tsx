// src/components/CostosTable.tsx

import React, { useState } from 'react';
import { deleteCostoItem } from '../api/vehiculos';

const formatCurrency = (amount: number): string =>
    `$ ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

// Tipo completo y limpio (sin any!)
export interface CostoItemExtended {
    id?: string;
    _id?: string;
    tipo: string;
    fecha: string;
    descripcion: string;
    importe: number;
    origen: 'Finanzas' | 'Mantenimiento';
    metadata_adicional?: Record<string, unknown> | null; // Reemplaza "any" por esto
}

interface CostosTableProps {
    costos: CostoItemExtended[];
    onRefresh: () => void;
}

const CostosTable: React.FC<CostosTableProps> = ({ costos, onRefresh }) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDeleteClick = async (id: string, origen: 'Finanzas' | 'Mantenimiento') => {
        if (!id || id.trim() === '' || id === 'undefined') {
            alert('Error: ID del costo inválido.');
            return;
        }

        if (!window.confirm(`¿Eliminar permanentemente este costo?\n"${origen}" del ${id.slice(-8)}`)) {
            return;
        }

        setIsProcessing(true);
        try {
            await deleteCostoItem(id, origen);
            alert('Costo eliminado correctamente');
            onRefresh();
        } catch (error) {
            // Aquí usamos el error (para que no salte el warning)
            console.error('Error al eliminar costo:', error);
            alert('No se pudo eliminar. Puede que no sea un costo manual o ya no exista.');
        } finally {
            setIsProcessing(false);
        }
    };

    if (costos.length === 0) {
        return (
            <div style={{ padding: '30px', textAlign: 'center', color: '#666', fontSize: '1.1em' }}>
                No se encontraron costos en este período.
            </div>
        );
    }

    return (
        <div style={{ marginTop: '30px', overflowX: 'auto' }}>
            <h2 style={{ color: '#1D3557', borderBottom: '2px solid #A8DADC', paddingBottom: '8px', marginBottom: '20px' }}>
                Historial de Costos ({costos.length})
            </h2>

            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <thead>
                    <tr style={{ background: '#A8DADC', color: '#1D3557' }}>
                        <th style={{ padding: '14px', textAlign: 'left' }}>Fecha</th>
                        <th style={{ padding: '14px', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '14px', textAlign: 'right' }}>Importe</th>
                        <th style={{ padding: '14px', textAlign: 'center' }}>Origen</th>
                        <th style={{ padding: '14px', textAlign: 'center' }}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {costos
                        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                        .map((costo, i) => {
                            const costoId = costo.id || costo._id;

                            return (
                                <React.Fragment key={costoId || i}>
                                    <tr style={{ background: i % 2 === 0 ? '#F8F9FA' : 'white', borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '14px' }}>
                                            {costo.fecha.split('T')[0]}
                                        </td>
                                        <td style={{ padding: '14px', fontWeight: 'bold', color: '#1D3557' }}>
                                            {costo.tipo}
                                        </td>
                                        <td style={{ padding: '14px', textAlign: 'right', fontWeight: 'bold', color: '#E63946' }}>
                                            {formatCurrency(costo.importe)}
                                        </td>
                                        <td style={{ padding: '14px', textAlign: 'center', fontSize: '0.9em', color: '#457B9D' }}>
                                            {costo.origen}
                                        </td>
                                        <td style={{ padding: '14px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => {
                                                    if (costoId && window.confirm(
                                                        `¿Eliminar "${costo.tipo}" del ${costo.fecha.split('T')[0]}?\n\nEste cambio es permanente.`
                                                    )) {
                                                        handleDeleteClick(costoId, costo.origen);
                                                    }
                                                }}
                                                disabled={isProcessing || !costoId}
                                                style={{
                                                    padding: '10px 18px',
                                                    background: isProcessing || !costoId ? '#999' : '#E63946',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    cursor: isProcessing || !costoId ? 'not-allowed' : 'pointer',
                                                    fontWeight: 'bold',
                                                    fontSize: '0.9em',
                                                    opacity: isProcessing || !costoId ? 0.6 : 1,
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => {
                                                    if (!isProcessing && costoId) {
                                                        e.currentTarget.style.background = '#d62839';
                                                    }
                                                }}
                                                onMouseOut={(e) => {
                                                    if (!isProcessing && costoId) {
                                                        e.currentTarget.style.background = '#E63946';
                                                    }
                                                }}
                                            >
                                                {isProcessing ? 'Eliminando...' : 'Borrar'}
                                            </button>
                                        </td>
                                    </tr>

                                    {/* Fila de descripción */}
                                    {costo.descripcion && (
                                        <tr style={{ background: i % 2 === 0 ? '#F8F9FA' : 'white' }}>
                                            <td colSpan={5} style={{ padding: '8px 14px 16px 50px', color: '#457B9D', fontStyle: 'italic', fontSize: '0.95em' }}>
                                                {costo.descripcion}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                </tbody>
            </table>
        </div>
    );
};

export default CostosTable;