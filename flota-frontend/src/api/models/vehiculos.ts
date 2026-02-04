// src/api/models/vehiculos.ts

// =================================================================
// ESTRUCTURAS DE VEHÍCULO
// =================================================================
export interface DocumentoDigital {
    tipo: string;
    path_esperado?: string | null;
    nombre_archivo?: string | null;
    nombre_archivo_patron?: string | null;
    fecha_vencimiento?: string | null;
    existe_fisicamente?: boolean;
    file_id?: string | null;
    fecha_subida?: string;
}

// Interfaz unificada (Backend Response + Frontend Model)
// Incluye tanto campos modernos (minúsculas) como legacy (mayúsculas)
export interface Vehiculo {
    _id: string; 
    patente: string; 
    patente_original?: string | null;
    activo: boolean;

    // Campos Modernos (Minúsculas - Preferidos)
    anio?: number | null;
    color?: string | null;
    descripcion_modelo?: string | null;
    modelo?: string | null; // Alias común
    nro_movil?: string | number | null;
    tipo_combustible?: string | null;

    // Campos Legacy (Mayúsculas - Soporte Retroactivo)
    // Al definirlos aquí, TypeScript permite su uso sin 'as any'
    ANIO?: number | null;
    COLOR?: string | null;
    DESCRIPCION_MODELO?: string | null;
    MODELO?: string | null;
    NRO_MOVIL?: string | number | null;
    TIPO_COMBUSTIBLE?: string | null;

    documentos_digitales?: DocumentoDigital[];
}

// Alias para mantener compatibilidad si algún archivo importa 'VehiculoBackendResponse'
export type VehiculoBackendResponse = Vehiculo;

// Tipos para formularios (Inputs)
export interface VehiculoInput {
    patente: string;
    nro_movil?: string | number | null;
    descripcion_modelo?: string | null;
    anio?: number | null;
    color?: string | null;
    tipo_combustible?: string | null;
    activo?: boolean;
}

export interface VehiculoUpdateInput {
    nro_movil?: string | number | null;
    descripcion_modelo?: string | null;
    anio?: number | null;
    color?: string | null;
    tipo_combustible?: string | null;
    activo?: boolean;
}

// =================================================================
// ESTRUCTURAS DE REPORTE Y COSTOS
// =================================================================

export interface CostoSummary {
    Mantenimiento: number;
    Finanzas: number;
}

export interface CostoItem {
    _id: string; 
    tipo_costo: string;
    fecha: string;
    descripcion: string;
    importe: number;
    origen: 'Finanzas' | 'Mantenimiento';
    metadata_adicional?: Record<string, unknown>;
    comprobante_file_id?: string | null;
}

export interface CreateCostoResponse {
    message: string;
    costo_id: string;
    file_id?: string | null;
}

export interface NewCostoInput {
    patente: string;
    tipo_costo: string;
    fecha: string;
    descripcion: string;
    importe: number;
    origen: 'Finanzas' | 'Mantenimiento';
}

export interface Alerta {
    patente: string; 
    tipo_documento?: string; // Opcional porque a veces es genérica
    fecha_vencimiento: string;
    dias_restantes?: number;
    mensaje: string; 
    prioridad?: 'CRÍTICA' | 'ALTA' | 'media' | 'baja'; 
    movil_nro?: string; 
    descripcion_modelo?: string; 
}

export interface ReporteCostosResponse {
    patente: string;
    total_general: number;
    total_mantenimiento: number; 
    total_infracciones: number;
    detalles: CostoItem[]; 
    alertas: Alerta[];
}

export interface ResumenCostoGlobal {
    total_mantenimiento: number;
    total_infracciones: number;
    total_general: number;
}

export interface DashboardResponse {
    alertas_criticas: Alerta[];
    resumen_costos: ResumenCostoGlobal;
    total_vehiculos: number;
}

export interface CostoManualDeleteInput {
    id: string;
    origen: 'Finanzas' | 'Mantenimiento'; 
}