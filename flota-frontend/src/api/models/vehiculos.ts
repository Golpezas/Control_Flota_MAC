// Control_Flota\flota-frontend\src\api\models\vehiculos.ts

// =================================================================
// ESTRUCTURAS DE VEHÍCULO
// =================================================================
export interface DocumentoDigital {
    tipo: string; // Ej: 'Cedula', 'Seguro', 'VTV'
    path_esperado?: string | null; // Ruta relativa del archivo si existe (LEGACY)
    nombre_archivo?: string | null; // Nombre real del archivo
    nombre_archivo_patron?: string | null; // Nombre esperado del archivo/tipo de documento
    existe_fisicamente?: boolean; // Indica si el archivo existe en el sistema de archivos (LEGACY)
    file_id?: string | null;      // NUEVO: ID de GridFS (MongoDB)
}

// =================================================================
// RESPUESTA CRUDA QUE LLEGA DEL BACKEND (con campos en MAYÚSCULAS)
// =================================================================
export interface VehiculoBackendResponse {
  _id?: string;
  patente?: string;
  patente_original?: string | null;
  activo?: boolean;

  ANIO?: number | null;
  COLOR?: string | null;
  DESCRIPCION_MODELO?: string | null;
  NRO_MOVIL?: string | number | null;
  TIPO_COMBUSTIBLE?: string | null;

  anio?: number | null;
  color?: string | null;
  descripcion_modelo?: string | null;
  nro_movil?: string | null;
  tipo_combustible?: string | null;

  documentos_digitales?: DocumentoDigital[];   // ← acá lo usamos;
}

export interface Vehiculo {
    _id: string; // Patente normalizada (usada como ID)
    patente_original?: string; 
    activo: boolean;
    anio: number | null;
    color: string | null; 
    descripcion_modelo: string | null; 
    nro_movil: string | null;
    tipo_combustible: string | null;
    documentos_digitales?: DocumentoDigital[];
}

export interface VehiculoInput { 
    patente: string; // Se necesita para el POST
    activo: boolean;
    anio: number | null;
    color: string | null; 
    descripcion_modelo: string | null;
    nro_movil: string | null;
    tipo_combustible: string | null;
}

// Interfaz necesaria para el PUT (Actualización)
export interface VehiculoUpdateInput {
    activo: boolean;
    anio: number | null;
    color: string | null;
    descripcion_modelo: string | null;
    nro_movil: string | null;
    tipo_combustible: string | null;
}

// =================================================================
// ESTRUCTURAS DE REPORTE Y COSTOS
// =================================================================

/**
 * Define la estructura del resumen de costos por categoría (Mantenimiento/Finanzas)
 * NOTA: Esta interfaz no se mapea directamente a una respuesta de API conocida.
 */
export interface CostoSummary {
    Mantenimiento: number;
    Finanzas: number;
}
/**
 * Define la estructura de un ítem de costo/gasto individual (tal como se almacena y lista).
 */
export interface CostoItem {
    _id: string; 
    tipo_costo: string;
    fecha: string;
    descripcion: string;
    importe: number;
    origen: 'Finanzas' | 'Mantenimiento';
    metadata_adicional?: Record<string, unknown>;
    comprobante_file_id?: string | null;  // ← Opcional: ID del archivo en GridFS si existe
}

/**
 * Define la estructura de respuesta específica al crear un costo manual.
 * Refleja exactamente el response_model de FastAPI (CreateCostoResponse).
 * 
 * Mejores prácticas aplicadas:
 * - Separación clara: No reutilizar CostoItem para respuestas de creación.
 * - Tipado opcional para file_id (null si no se subió comprobante).
 * - Documentación inline para mantenibilidad.
 */
export interface CreateCostoResponse {
    message: string;
    costo_id: string;
    file_id?: string | null;  // Presente solo si se subió comprobante
}

/**
 * Input para crear un nuevo costo manual.
 * Validado y normalizado antes de enviar al backend.
 */
export interface NewCostoInput {
    patente: string;
    tipo_costo: string;
    fecha: string;
    descripcion: string;
    importe: number;
    origen: 'Finanzas' | 'Mantenimiento';
}

/**
 * Define la estructura para una alerta de vencimiento.
 */
export interface Alerta {
    patente: string; 
    tipo_documento: string; 
    fecha_vencimiento: string; // Formato YYYY-MM-DD
    dias_restantes: number;
    mensaje: string; 
    prioridad: 'CRÍTICA' | 'ALTA' | 'media' | 'baja'; 
    movil_nro?: string; 
    descripcion_modelo?: string; 
}

/**
 * Define la estructura de la respuesta completa del reporte para un vehículo.
 */
export interface ReporteCostosResponse {
    patente: string;
    total_general: number;
    
    // Propiedades que llegan del backend:
    total_mantenimiento: number; 
    total_infracciones: number;
    
    // La lista de costos se llama 'detalles'
    detalles: CostoItem[]; 
    
    // Lista de todas las alertas activas
    alertas: Alerta[];
}

/**
 * Define el resumen de costos globales por tipo (para el Dashboard).
 */
export interface ResumenCostoGlobal {
    total_mantenimiento: number;
    total_infracciones: number;
    total_general: number;
}

/**
 * Define la respuesta consolidada para el Dashboard.
 */
export interface DashboardResponse {
    alertas_criticas: Alerta[];
    resumen_costos: ResumenCostoGlobal;
    total_vehiculos: number;
}

// 🔑 NUEVA INTERFAZ DE INPUT PARA LA API DE ELIMINACIÓN
export interface CostoManualDeleteInput {
    id: string;
    // Esto fuerza a que 'origen' solo pueda ser estos dos valores.
    origen: 'Finanzas' | 'Mantenimiento'; 
}