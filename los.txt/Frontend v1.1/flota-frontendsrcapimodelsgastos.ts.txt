// src/api/models/gastos.ts
export interface GastoUnificado {
    id: string;
    patente: string;  // ← Obligatorio (siempre viene)
    tipo: string;
    fecha: string;
    descripcion: string;
    importe: number;
    origen: 'mantenimiento' | 'finanzas';
    comprobante_file_id?: string;
}