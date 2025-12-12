// src/components/CostosTable.tsx → VERSIÓN CON VISOR DE COMPROBANTES (2025-12-12)
// Mejoras: Nueva columna "Comprobante", modal de preview integrado, descarga fallback.
// Cumple con accesibilidad, responsive design y mejores prácticas React/TS.

import React, { useState } from 'react';
import type { CostoItem } from '../api/models/vehiculos';
import { borrarGastoUniversal } from '../api/vehiculos';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// =================================================================
// 1. TIPOS AUXILIARES (ACTUALIZADO)
// =================================================================

export interface CostoItemExtended extends Omit<CostoItem, 'origen'> {
    _id: string;
    origen: string;
    tipo: string;
    // NUEVO: Campo para el recibo digital subido vía CostoForm
    comprobante_file_id?: string | null;
}

// =================================================================
// 2. UTILIDADES
// =================================================================

const formatCurrency = (amount: number): string =>
    `$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// =================================================================
// 3. PROPS Y ESTADO DEL MODAL
// =================================================================

interface CostosTableProps {
    costos: CostoItemExtended[];
    onRefresh: () => void;
}

interface ModalState {
    isOpen: boolean;
    fileId: string | null;
    filename: string;
}

// =================================================================
// 4. COMPONENTE PRINCIPAL
// =================================================================

const CostosTable: React.FC<CostosTableProps> = ({ costos, onRefresh }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [modal, setModal] = useState<ModalState>({ isOpen: false, fileId: null, filename: '' });

    const handleDeleteClick = async (id: string, origen: string) => {
        // ... (lógica de borrado SIN CAMBIOS – se mantiene 100% funcional)
        if (!id || id.trim() === '' || id === 'undefined') {
            alert('Error: ID del costo inválido. No se puede eliminar.');
            console.error('ID inválido:', id);
            return;
        }

        if (!['Finanzas', 'Mantenimiento'].includes(origen)) {
            alert('Este costo no se puede eliminar (no es manual).');
            return;
        }

        const origenMapped: "costos" | "finanzas" = origen === 'Mantenimiento' ? 'costos' : 'finanzas';

        if (!window.confirm(`¿Estás seguro de eliminar este costo?\nID: ${id.slice(-8)}\nOrigen: ${origen}`)) {
            return;
        }

        setIsProcessing(true);
        try {
            await borrarGastoUniversal(id, origenMapped);
            alert('Gasto eliminado correctamente');
            onRefresh();
        } catch (error) {
            let mensaje = 'Error al eliminar el gasto';
            if (error instanceof Error) mensaje = error.message;
            alert(`Error: ${mensaje}`);
            console.error('Error borrando gasto:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    // NUEVO: Abrir modal de preview
    const openPreview = (fileId: string, filename: string) => {
        setModal({ isOpen: true, fileId, filename });
    };

    // NUEVO: Cerrar modal
    const closeModal = () => {
        setModal({ isOpen: false, fileId: null, filename: '' });
    };

    // NUEVO: URL base para archivos
    const getFileUrl = (fileId: string, preview: boolean = false) =>
        `${API_URL}/api/archivos/descargar/${fileId}${preview ? '?preview=true' : ''}`;

    return (
        <>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: '#1D3557', color: 'white' }}>
                        <tr>
                            <th style={{ padding: '12px', textAlign: 'left' }}>Fecha</th>
                            <th style={{ padding: '12px', textAlign: 'left' }}>Tipo</th>
                            <th style={{ padding: '12px', textAlign: 'left' }}>Descripción</th>
                            <th style={{ padding: '12px', textAlign: 'right' }}>Importe</th>
                            {/* NUEVA COLUMNA */}
                            <th style={{ padding: '12px', textAlign: 'center' }}>Comprobante</th>
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
                                        backgroundColor: costo.tipo === 'Multa' || costo.tipo === 'INFRACCION' ? '#fee' : '#e6f4ea',
                                        color: costo.tipo === 'Multa' || costo.tipo === 'INFRACCION' ? '#c1121f' : '#2d6a4f',
                                        fontWeight: 'bold'
                                    }}>
                                        {costo.tipo}
                                    </span>
                                </td>
                                <td style={{ padding: '12px' }}>{costo.descripcion}</td>
                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                                    {formatCurrency(costo.importe)}
                                </td>
                                {/* NUEVA CELDA: Comprobante */}
                                <td style={{ padding: '12px', textAlign: 'center' }}>
                                    {costo.comprobante_file_id ? (
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                            <button
                                                onClick={() => openPreview(costo.comprobante_file_id!, 'comprobante.pdf')}
                                                style={{
                                                    padding: '4px 8px',
                                                    fontSize: '0.8em',
                                                    backgroundColor: '#457B9D',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                                title="Ver comprobante en modal"
                                            >
                                                👁️ Ver
                                            </button>
                                            <a
                                                href={getFileUrl(costo.comprobante_file_id, false)}
                                                download
                                                style={{
                                                    padding: '4px 8px',
                                                    fontSize: '0.8em',
                                                    backgroundColor: '#2d6a4f',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    textDecoration: 'none'
                                                }}
                                                title="Descargar comprobante"
                                            >
                                                ⬇️ Descargar
                                            </a>
                                        </div>
                                    ) : (
                                        <span style={{ color: '#999', fontStyle: 'italic' }}>Sin adjunto</span>
                                    )}
                                </td>
                                {/* Celda Acciones (sin cambios) */}
                                <td style={{ padding: '12px', textAlign: 'center' }}>
                                    <button
                                        onClick={() => handleDeleteClick(costo._id, costo.origen)}
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

            {/* NUEVO: Modal de preview */}
            {modal.isOpen && modal.fileId && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '20px'
                    }}
                    onClick={closeModal} // Cierre al clickar fuera
                >
                    <div 
                        style={{
                            background: 'white',
                            borderRadius: '8px',
                            width: '90%',
                            maxWidth: '900px',
                            height: '90%',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                        }}
                        onClick={(e) => e.stopPropagation()} // Evita cierre al clickar dentro
                    >
                        {/* Header del modal */}
                        <div style={{
                            padding: '10px 20px',
                            backgroundColor: '#1D3557',
                            color: 'white',
                            borderRadius: '8px 8px 0 0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{ margin: 0 }}>Comprobante: {modal.filename}</h3>
                            <button 
                                onClick={closeModal}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '1.5em',
                                    cursor: 'pointer'
                                }}
                                aria-label="Cerrar"
                            >
                                ×
                            </button>
                        </div>
                        {/* Contenido: Preview */}
                        <div style={{ flex: 1, padding: '20px', overflow: 'hidden' }}>
                            <iframe
                                src={getFileUrl(modal.fileId, true)}
                                title="Preview del comprobante"
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                sandbox="allow-scripts allow-same-origin"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CostosTable;